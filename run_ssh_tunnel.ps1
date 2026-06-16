$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logsDir = Join-Path $root "logs"
$envFile = Join-Path $root ".env"
$appOut = Join-Path $logsDir "ssh-app.out.log"
$appErr = Join-Path $logsDir "ssh-app.err.log"
$tunnelOut = Join-Path $logsDir "ssh-tunnel.out.log"
$tunnelErr = Join-Path $logsDir "ssh-tunnel.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Read-DotEnvValue {
  param(
    [string]$Path,
    [string]$Key
  )
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
  param(
    [string]$Path,
    [string]$Password
  )
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

$password = Read-DotEnvValue -Path $envFile -Key "CHRONICLE_PASSWORD"
if (-not $password -or $password -eq "change-this-password" -or $password -eq "veerhau") {
  $password = "vc-" + ([Guid]::NewGuid().ToString("N").Substring(0, 16))
  Write-DotEnvPassword -Path $envFile -Password $password
  Write-Host "Generated CHRONICLE_PASSWORD in .env"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found in PATH."
}

$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if (-not $ssh) {
  throw "OpenSSH client was not found."
}

$env:CHRONICLE_PASSWORD = $password
$env:CHRONICLE_HOST = "127.0.0.1"
$env:CHRONICLE_PORT = "8787"
$env:CHRONICLE_DATA_DIR = Join-Path $root "data"

Remove-Item -Force -ErrorAction SilentlyContinue $appOut, $appErr, $tunnelOut, $tunnelErr

Write-Host "Starting Veerhau's Companion on http://127.0.0.1:8787 ..."
$appProcess = Start-Process -FilePath $python.Source -ArgumentList @("app.py") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $appOut -RedirectStandardError $appErr -PassThru

try {
  $ready = $false
  for ($i = 0; $i -lt 30; $i += 1) {
    Start-Sleep -Seconds 1
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/api/session" -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      if ($appProcess.HasExited) {
        throw "App exited early. See $appErr"
      }
    }
  }
  if (-not $ready) {
    throw "App did not become ready. See $appErr"
  }

  Write-Host "Starting SSH reverse tunnel via localhost.run..."
  $args = @(
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-o", "ExitOnForwardFailure=yes",
    "-R", "80:127.0.0.1:8787",
    "nokey@localhost.run"
  )
  $tunnelProcess = Start-Process -FilePath $ssh.Source -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

  $publicUrl = ""
  for ($i = 0; $i -lt 45; $i += 1) {
    Start-Sleep -Seconds 1
    $combined = ""
    if (Test-Path $tunnelOut) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelOut) }
    if (Test-Path $tunnelErr) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelErr) }
    $match = [regex]::Match($combined, "https?://[^\s]+")
    if ($match.Success) {
      $publicUrl = $match.Value.Trim()
      break
    }
    if ($tunnelProcess.HasExited) {
      throw "SSH tunnel exited early. See $tunnelErr"
    }
  }

  if (-not $publicUrl) {
    Write-Host "Could not detect URL automatically. Check $tunnelOut and $tunnelErr"
  } else {
    Write-Host ""
    Write-Host "Public URL: $publicUrl"
  }
  Write-Host "Password: $password"
  Write-Host ""
  Write-Host "Keep this PowerShell window open while players use the site."
  Read-Host "Press Enter to stop the public tunnel and local app"
} finally {
  if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
    Stop-Process -Id $tunnelProcess.Id -Force
  }
  if ($appProcess -and -not $appProcess.HasExited) {
    Stop-Process -Id $appProcess.Id -Force
  }
}
