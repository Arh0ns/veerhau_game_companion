$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logsDir = Join-Path $root "logs"
$statePath = Join-Path $logsDir "public-site-state.json"
$envFile = Join-Path $root ".env"
$appOut = Join-Path $logsDir "public-site-app.out.log"
$appErr = Join-Path $logsDir "public-site-app.err.log"
$tunnelOut = Join-Path $logsDir "public-site-tunnel.out.log"
$tunnelErr = Join-Path $logsDir "public-site-tunnel.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Repair-ProcessPathEnvironment {
  $envs = [System.Environment]::GetEnvironmentVariables("Process")
  $pathValue = [string]$envs["Path"]
  if (-not $pathValue) {
    $pathValue = [string]$envs["PATH"]
  }
  [System.Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  if ($pathValue) {
    [System.Environment]::SetEnvironmentVariable("Path", $pathValue, "Process")
  }
}

function Read-DotEnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) {
    return ""
  }
  foreach ($line in Get-Content -Path $Path) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Write-DotEnvPassword {
  param([string]$Path, [string]$Password)
  $lines = @()
  $changed = $false
  if (Test-Path $Path) {
    foreach ($line in Get-Content -Path $Path) {
      if ($line -match "^\s*CHRONICLE_PASSWORD\s*=") {
        $lines += "CHRONICLE_PASSWORD=$Password"
        $changed = $true
      } else {
        $lines += $line
      }
    }
  }
  if (-not $changed) {
    $lines += "CHRONICLE_PASSWORD=$Password"
  }
  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function Test-AppReady {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/api/session" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Find-AppPid {
  try {
    $connection = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection -and $connection.OwningProcess) {
      return [int]$connection.OwningProcess
    }
  } catch {
    return 0
  }
  return 0
}

function Read-State {
  if (-not (Test-Path $statePath)) {
    return $null
  }
  try {
    return Get-Content -Raw -Path $statePath | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Process-Alive {
  param([object]$ProcessIdValue)
  if (-not $ProcessIdValue) {
    return $false
  }
  return [bool](Get-Process -Id ([int]$ProcessIdValue) -ErrorAction SilentlyContinue)
}

function Write-State {
  param([int]$AppPid, [int]$TunnelPid, [string]$Url, [string]$Password)
  [pscustomobject]@{
    appPid = $AppPid
    tunnelPid = $TunnelPid
    url = $Url
    password = $Password
    localUrl = "http://127.0.0.1:8787"
    startedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8
}

Repair-ProcessPathEnvironment

$password = Read-DotEnvValue -Path $envFile -Key "CHRONICLE_PASSWORD"
if (-not $password -or $password -eq "change-this-password" -or $password -eq "veerhau") {
  $password = "vc-" + ([Guid]::NewGuid().ToString("N").Substring(0, 16))
  Write-DotEnvPassword -Path $envFile -Password $password
}

$state = Read-State
if ($state -and (Process-Alive $state.appPid) -and (Process-Alive $state.tunnelPid) -and $state.url) {
  Write-Host "Already running."
  Write-Host "Public URL: $($state.url)"
  Write-Host "Password: $password"
  exit 0
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found in PATH."
}
$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if (-not $ssh) {
  $sshPath = "C:\Windows\System32\OpenSSH\ssh.exe"
  if (Test-Path $sshPath) {
    $ssh = [pscustomobject]@{ Source = $sshPath }
  } else {
    throw "OpenSSH client was not found."
  }
}

$env:CHRONICLE_PASSWORD = $password
$env:CHRONICLE_HOST = "127.0.0.1"
$env:CHRONICLE_PORT = "8787"
$env:CHRONICLE_DATA_DIR = Join-Path $root "data"

$appPid = 0
if (Test-AppReady) {
  if ($state -and $state.appPid) {
    $appPid = [int]$state.appPid
  }
  if (-not $appPid) {
    $appPid = Find-AppPid
  }
} else {
  Remove-Item -Force -ErrorAction SilentlyContinue $appOut, $appErr
  $appProcess = Start-Process -FilePath $python.Source -ArgumentList @("app.py") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $appOut -RedirectStandardError $appErr -PassThru
  $appPid = $appProcess.Id
  $ready = $false
  for ($i = 0; $i -lt 30; $i += 1) {
    Start-Sleep -Seconds 1
    if ($appProcess.HasExited) {
      throw "App exited early. See $appErr"
    }
    if (Test-AppReady) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "App did not become ready. See $appErr"
  }
}

Remove-Item -Force -ErrorAction SilentlyContinue $tunnelOut, $tunnelErr
$tunnelArgs = @(
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ServerAliveInterval=30",
  "-o", "ExitOnForwardFailure=yes",
  "-R", "80:127.0.0.1:8787",
  "serveo.net"
)
$tunnelProcess = Start-Process -FilePath $ssh.Source -ArgumentList $tunnelArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

$publicUrl = ""
for ($i = 0; $i -lt 45; $i += 1) {
  Start-Sleep -Seconds 1
  $combined = ""
  if (Test-Path $tunnelOut) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelOut) }
  if (Test-Path $tunnelErr) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelErr) }
  $clean = $combined -replace "`e\[[0-9;]*m", ""
  $match = [regex]::Match($clean, "https://[^\s]+")
  if ($match.Success) {
    $publicUrl = $match.Value.Trim()
    break
  }
  if ($tunnelProcess.HasExited) {
    throw "Tunnel exited early. See $tunnelErr"
  }
}

if (-not $publicUrl) {
  throw "Tunnel URL was not detected. See $tunnelOut and $tunnelErr"
}

Write-State -AppPid $appPid -TunnelPid $tunnelProcess.Id -Url $publicUrl -Password $password

Write-Host "Public URL: $publicUrl"
Write-Host "Local URL: http://127.0.0.1:8787"
Write-Host "Password: $password"
