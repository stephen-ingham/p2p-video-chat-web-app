$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

# Every folder with its own package.json. Keep in step with nuke.ps1.
foreach ($dir in ".", "web-server/src", "web-server/tests", "web-socket-api/src", "web-socket-api/tests", "infra", "infra/kill-switch", "mobile-app") {
    Write-Host "Installing $dir npm dependencies..."
    Push-Location $dir
    npm install
    Pop-Location
}

Write-Host "Building signalling API dev image..."
docker build -f ./web-socket-api/src/Dockerfile.dev -t signalling-server-dev:1.0.0 ./web-socket-api/src

Write-Host "Building frontend dev image..."
docker build --build-context root=. -f ./web-server/src/Dockerfile.dev -t web-server-dev:1.0.0 ./web-server/src

Write-Host "Ready for dev!"

