$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Installing root npm dependencies..."
npm install

Write-Host "Installing web-server dependencies..."
Set-Location web-server/src
npm install
Set-Location ../..

Write-Host "Installing signalling API dependencies..."
Set-Location web-socket-api/src
npm install
Set-Location ../..

Write-Host "Installing infra dependencies..."
Set-Location infra
npm install
Set-Location ..

Write-Host "Building signalling API dev image..."
docker build -f ./web-socket-api/src/Dockerfile.dev -t signalling-server-dev:1.0.0 ./web-socket-api/src

Write-Host "Building frontend dev image..."
docker build --build-context root=. -f ./web-server/src/Dockerfile.dev -t web-server-dev:1.0.0 ./web-server/src

Write-Host "Ready for dev!"

