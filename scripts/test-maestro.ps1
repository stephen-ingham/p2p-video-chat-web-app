$ErrorActionPreference = "Stop"

# Runs the mobile app's Maestro flows (mobile-app/.maestro/) against the
# dev-client build on a running Android emulator/device, starting what they
# need first and cleaning up afterwards:
#   - the signalling API + MySQL containers, with LOCAL=true and NODE_ENV=dev
#     (the flows log in as the seeded users, at 10.0.2.2:3000)
#   - Metro, serving the app's JS to the dev client
# Anything already running (e.g. from `npm run dev`) is reused and left
# running. Extra args are passed to `maestro test` in place of the default
# `.maestro/`, e.g. `npm run test:maestro -- .maestro/create-call.yaml`.

Set-Location (Join-Path $PSScriptRoot "..")
$startedAt = Get-Date
# Passed to maestro as $flows, not @flows: a single path comes back from
# this `if` as a plain string, and splatting a string passes its characters.
$flows = if ($args.Count -gt 0) { @($args) } else { @(".maestro/") }

function Fail($message) {
	Write-Output "test:maestro: $message"
	exit 1
}

# --- Preconditions --------------------------------------------------------

$maestro = (Get-Command maestro -ErrorAction SilentlyContinue).Source
if (-not $maestro) {
	$maestro = Join-Path $env:USERPROFILE ".maestro-cli\maestro\bin\maestro.bat"
}
if (-not (Test-Path $maestro)) {
	Fail "Maestro not found on PATH or in %USERPROFILE%\.maestro-cli. Install it: https://docs.maestro.dev/getting-started/installing-maestro"
}

$devices = adb devices | Select-String "\tdevice$"
if (-not $devices) {
	Fail "no Android emulator/device connected (adb devices). Start one first."
}
if (-not (adb shell pm list packages com.voneo.app | Select-String "com.voneo.app")) {
	Fail "the Voneo dev client isn't installed on the device. Build it with 'eas build --profile development --platform android' and install the APK."
}

$compose = @("--env-file", ".env", "-f", "web-socket-api/src/compose.yaml")
$startedApi = $false
$metro = $null

try {
	# --- API + MySQL ------------------------------------------------------

	if (-not (docker compose @compose ps --status running -q signalling-server-dev)) {
		Write-Output "Starting the signalling API + MySQL (LOCAL=true, NODE_ENV=dev)..."
		# Shell env overrides .env for compose interpolation. Only for this
		# command: Metro (started below) mustn't inherit NODE_ENV=dev.
		$env:LOCAL = "true"
		$env:NGROK_HOST = ""
		$env:NODE_ENV = "dev"
		docker compose @compose up -d --build signalling-server-dev
		$upExitCode = $LASTEXITCODE
		Remove-Item Env:LOCAL, Env:NGROK_HOST, Env:NODE_ENV -ErrorAction SilentlyContinue
		if ($upExitCode -ne 0) { Fail "failed to start the API containers." }
		$startedApi = $true
	} else {
		Write-Output "Reusing the running signalling API."
	}

	Write-Output "Waiting for the API on :3000..."
	$deadline = (Get-Date).AddMinutes(4)
	do {
		try {
			Invoke-WebRequest -UseBasicParsing http://localhost:3000/call/ice-servers -TimeoutSec 5 | Out-Null
		} catch {
			# 401 (no token) means it's up.
			if ($_.Exception.Response.StatusCode.value__ -eq 401) { break }
		}
		if ((Get-Date) -gt $deadline) { Fail "the API didn't come up within 4 minutes." }
		Start-Sleep -Seconds 3
	} while ($true)

	# --- Metro ------------------------------------------------------------

	# RawContent, not Content: /status has no text content type, so Content
	# comes back as bytes.
	$metroUp = $false
	try {
		$metroUp = (Invoke-WebRequest -UseBasicParsing http://localhost:8081/status -TimeoutSec 3).RawContent -match "packager-status:running"
	} catch {}

	if ($metroUp) {
		Write-Output "Reusing the Metro server on :8081."
	} else {
		Write-Output "Starting Metro (logs: mobile-app/.expo/maestro-metro.log)..."
		New-Item -ItemType Directory -Force mobile-app/.expo | Out-Null
		$env:CI = "1" # non-interactive
		$metro = Start-Process -FilePath "cmd.exe" -WorkingDirectory "mobile-app" -WindowStyle Hidden -PassThru `
			-ArgumentList "/c", "npx expo start --dev-client --port 8081 > .expo\maestro-metro.log 2>&1"
		$deadline = (Get-Date).AddMinutes(2)
		do {
			Start-Sleep -Seconds 2
			try {
				$metroUp = (Invoke-WebRequest -UseBasicParsing http://localhost:8081/status -TimeoutSec 3).RawContent -match "packager-status:running"
			} catch {}
			if ((Get-Date) -gt $deadline) { Fail "Metro didn't start within 2 minutes (see mobile-app/.expo/maestro-metro.log)." }
		} until ($metroUp)
	}

	# --- Maestro ----------------------------------------------------------

	# Maestro's on-device driver can be slow to start on a busy emulator.
	if (-not $env:MAESTRO_DRIVER_STARTUP_TIMEOUT) { $env:MAESTRO_DRIVER_STARTUP_TIMEOUT = "180000" }

	Push-Location mobile-app
	$ErrorActionPreference = "Continue"
	& $maestro test -e DEV_CLIENT=true $flows
	$exitCode = $LASTEXITCODE
	$ErrorActionPreference = "Stop"
	Pop-Location
} finally {
	# --- Clean up (only what this script started) -------------------------

	if ($metro) {
		Write-Output "Stopping Metro..."
		taskkill /PID $metro.Id /T /F | Out-Null
	}
	if ($startedApi) {
		Write-Output "Stopping the API + MySQL containers..."
		docker compose @compose down
	}
	# Each Maestro run leaves a ~220 MB copy of the app's APK in %TEMP%.
	Get-ChildItem $env:TEMP -Filter "tmp*.apk" -File -ErrorAction SilentlyContinue |
		Where-Object { $_.LastWriteTime -ge $startedAt } |
		Remove-Item -Force -ErrorAction SilentlyContinue
}

exit $exitCode
