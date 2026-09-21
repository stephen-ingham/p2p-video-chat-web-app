$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$composeArgs = @(
	"-p", "voneo-e2e",
	"--project-directory", ".",
	"-f", "web-socket-api/src/compose.yaml",
	"-f", "web-server/src/compose.yaml",
	"-f", "e2e/compose.e2e.yaml"
)

$ErrorActionPreference = "Continue"
docker compose @composeArgs up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy
$upExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($upExitCode -ne 0) {
	Write-Output "--- e2e stack failed to become healthy, dumping logs ---"
	docker compose @composeArgs logs
	docker compose @composeArgs down -v
	exit $upExitCode
}

npx playwright test
$exitCode = $LASTEXITCODE

docker compose @composeArgs down -v

exit $exitCode
