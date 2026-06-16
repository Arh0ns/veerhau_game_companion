$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root "logs\public-site-state.json"

if (Test-Path $statePath) {
  $state = Get-Content -Raw -Path $statePath | ConvertFrom-Json
  foreach ($pidValue in @($state.tunnelPid, $state.appPid)) {
    if ($pidValue) {
      $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Stopped PID $($process.Id) $($process.ProcessName)"
      }
    }
  }
  Remove-Item -Force -ErrorAction SilentlyContinue $statePath
} else {
  Write-Host "No public-site state file found."
}

Write-Host "Done."
