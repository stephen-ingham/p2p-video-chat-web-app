$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

# Remote browser containers must run the exact Playwright version the host
# test runner uses (see e2e/compose.nat.yaml).
$env:PLAYWRIGHT_VERSION = node -p "require('@playwright/test/package.json').version"

# Pulled up front: letting `compose up` pull an image shared by several
# services at once can crash Compose ("concurrent map writes").
docker pull "mcr.microsoft.com/playwright:v$($env:PLAYWRIGHT_VERSION)-noble"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$composeArgs = @(
	"-p", "voneo-e2e-nat",
	"--project-directory", ".",
	"-f", "web-socket-api/src/compose.yaml",
	"-f", "web-server/src/compose.yaml",
	"-f", "e2e/compose.e2e.yaml",
	"-f", "e2e/compose.nat.yaml"
)

$ErrorActionPreference = "Continue"
docker compose @composeArgs up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy coturn browser-lan-a-1 browser-lan-a-2 browser-lan-b firewall-lan-a-1 firewall-lan-a-2 firewall-lan-b
$upExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($upExitCode -ne 0) {
	Write-Output "--- e2e NAT stack failed to become healthy, dumping logs ---"
	docker compose @composeArgs logs
	docker compose @composeArgs down -v
	exit $upExitCode
}

$ErrorActionPreference = "Continue"
$env:E2E_NAT = "1"
npx playwright test @args
$exitCode = $LASTEXITCODE
Remove-Item Env:E2E_NAT
$ErrorActionPreference = "Stop"

if ($exitCode -ne 0) {
	Write-Output "--- e2e NAT tests failed, dumping stack logs ---"
	docker compose @composeArgs logs
}

docker compose @composeArgs down -v

exit $exitCode
