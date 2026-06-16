$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root "logs\public-site-state.json"

function Process-Alive {
  param([object]$ProcessIdValue)
  if (-not $ProcessIdValue) {
    return $false
  }
  return [bool](Get-Process -Id ([int]$ProcessIdValue) -ErrorAction SilentlyContinue)
}

function Test-AppReady {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/api/session" -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Path $statePath)) {
  Write-Host "No public-site state file found."
  Write-Host "Local app ready: $(Test-AppReady)"
  exit 0
}

$state = Get-Content -Raw -Path $statePath | ConvertFrom-Json
$appAlive = Process-Alive $state.appPid
$tunnelAlive = Process-Alive $state.tunnelPid

Write-Host "Public URL: $($state.url)"
Write-Host "Local URL: $($state.localUrl)"
Write-Host "Password: $($state.password)"
Write-Host "App PID: $($state.appPid) alive=$appAlive"
Write-Host "Tunnel PID: $($state.tunnelPid) alive=$tunnelAlive"
Write-Host "Local app ready: $(Test-AppReady)"
