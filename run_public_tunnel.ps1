$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$toolsDir = Join-Path $root "tools\bin"
$logsDir = Join-Path $root "logs"
$cloudflared = Join-Path $toolsDir "cloudflared.exe"
$envFile = Join-Path $root ".env"
$appOut = Join-Path $logsDir "public-app.out.log"
$appErr = Join-Path $logsDir "public-app.err.log"
$tunnelOut = Join-Path $logsDir "public-tunnel.out.log"
$tunnelErr = Join-Path $logsDir "public-tunnel.err.log"

New-Item -ItemType Directory -Force -Path $toolsDir, $logsDir | Out-Null

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

if (-not (Test-Path $cloudflared)) {
  Write-Host "Downloading cloudflared..."
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $cloudflared
  } catch {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
      throw
    }
    & $curl.Source -L $url -o $cloudflared
    if ($LASTEXITCODE -ne 0) {
      throw "curl.exe failed to download cloudflared."
    }
  }
  if ((Get-Item $cloudflared).Length -lt 1000000) {
    Remove-Item -Force -ErrorAction SilentlyContinue $cloudflared
    throw "Downloaded cloudflared file is unexpectedly small."
  }
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found in PATH."
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

  Write-Host "Starting Cloudflare Quick Tunnel..."
  $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8787") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

  $publicUrl = ""
  for ($i = 0; $i -lt 45; $i += 1) {
    Start-Sleep -Seconds 1
    $combined = ""
    if (Test-Path $tunnelOut) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelOut) }
    if (Test-Path $tunnelErr) { $combined += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $tunnelErr) }
    $match = [regex]::Match($combined, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      $publicUrl = $match.Value
      break
    }
    if ($tunnelProcess.HasExited) {
      throw "Tunnel exited early. See $tunnelErr"
    }
  }

  if (-not $publicUrl) {
    throw "Tunnel URL was not found. See $tunnelErr"
  }

  Write-Host ""
  Write-Host "Public URL: $publicUrl"
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
