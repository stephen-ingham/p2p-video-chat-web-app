$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$composeArgs = @(
	"-p", "voneo-e2e",
	"-f", "web-socket-api/src/compose.yaml",
	"-f", "web-server/src/compose.yaml",
	"-f", "e2e/compose.e2e.yaml"
)

docker compose @composeArgs up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy

npx playwright test
$exitCode = $LASTEXITCODE

docker compose @composeArgs down -v

exit $exitCode
