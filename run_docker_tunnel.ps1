$ErrorActionPreference = "Stop"

$docker = Get-Command docker -ErrorAction SilentlyContinue
$dockerPath = if ($docker) {
  $docker.Source
} elseif (Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe") {
  "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
} else {
  throw "Docker CLI was not found. Install/start Docker Desktop first."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Edit CHRONICLE_PASSWORD there if needed."
}

& $dockerPath compose --profile tunnel up --build
