$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\vadim\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not $env:CHRONICLE_PASSWORD) {
    $env:CHRONICLE_PASSWORD = "veerhau"
}
& $python (Join-Path $root "app.py")
