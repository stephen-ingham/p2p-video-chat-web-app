Set-Location (Join-Path $PSScriptRoot "..")

# Every folder with its own package.json. Keep in step with setup.ps1.
$dirs = ".", "web-server/src", "web-server/tests", "web-socket-api/src", "web-socket-api/tests", "infra", "infra/kill-switch", "mobile-app"

Write-Host ">>> Removing node_modules..."
foreach ($dir in $dirs) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $dir "node_modules")
}

Write-Host ">>> Clearing npm cache..."
npm cache clean --force

Write-Host ">>> Reinstalling dependencies..."
foreach ($dir in $dirs) {
    Push-Location $dir; npm install; Pop-Location
}

Write-Host ">>> Tearing down Docker containers and images..."
docker compose --env-file .env -f web-socket-api/src/compose.yaml down --rmi all
docker compose --env-file .env -f web-server/src/compose.yaml down web-server-dev --rmi all

Write-Host ">>> Pruning Docker system..."
docker system prune -f

Write-Host ">>> Rebuilding Docker images..."
docker compose --env-file .env -f web-socket-api/src/compose.yaml build signalling-server-dev mysql-db
docker compose --env-file .env -f web-server/src/compose.yaml build web-server-dev

Write-Host ">>> Done."
