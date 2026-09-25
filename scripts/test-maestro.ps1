$ErrorActionPreference = "Stop"

# Runs the mobile app's Maestro flows (mobile-app/.maestro/) against the
# dev-client build on an Android emulator/device, starting what they need
# first and cleaning up afterwards:
#   - an Android emulator, if no device is connected (the first AVD, or
#     $env:VONEO_AVD). The emulator the flows ran on is closed at the end,
#     whoever started it; a physical device is left alone.
#   - the signalling API + MySQL containers, with LOCAL=true and NODE_ENV=dev
#     (the flows log in as the seeded users, at 10.0.2.2:3000)
#   - Metro, serving the app's JS to the dev client
# An API or Metro that's already running (e.g. from `npm run dev`) is reused
# and left running. Extra args are passed to `maestro test` in place of the
# default `.maestro/`, e.g. `npm run test:maestro -- .maestro/create-call.yaml`.

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

$compose = @("--env-file", ".env", "-f", "web-socket-api/src/compose.yaml")
$startedApi = $false
$metro = $null
$device = $null

function Get-Device {
	$line = adb devices | Select-String "^(\S+)\tdevice$" | Select-Object -First 1
	if ($line) { $line.Matches[0].Groups[1].Value }
}

try {
	# --- Emulator / device ------------------------------------------------

	$device = Get-Device
	if ($device) {
		Write-Output "Using connected device $device."
	} else {
		$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
		$emulator = Join-Path $sdk "emulator\emulator.exe"
		if (-not (Test-Path $emulator)) { Fail "no device connected, and no emulator found at $emulator." }
		$avd = if ($env:VONEO_AVD) { $env:VONEO_AVD } else { & $emulator -list-avds | Select-Object -First 1 }
		if (-not $avd) { Fail "no device connected, and no emulator (AVD) exists. Create one in Android Studio's Device Manager." }
		Write-Output "Booting emulator $avd..."
		# Cold boot without snapshots (loading the old quick-boot snapshot can
		# fail and hang the boot), and guest RAM not backed by a file on disk
		# (otherwise it writes a RAM-sized ram.img).
		Start-Process -FilePath $emulator -WindowStyle Minimized -ArgumentList `
			"-avd", $avd, "-no-snapshot-load", "-no-snapshot-save", "-feature", "-QuickbootFileBacked", "-no-audio", "-no-boot-anim"
		# adb complains on stderr ("device offline") while it boots, which
		# "Stop" would turn into a terminating error.
		$ErrorActionPreference = "Continue"
		$deadline = (Get-Date).AddMinutes(5)
		do {
			Start-Sleep -Seconds 5
			$device = Get-Device
			$booted = $device -and ((adb -s $device shell getprop sys.boot_completed 2>$null) -match "1")
			if ((Get-Date) -gt $deadline) { Fail "the emulator didn't finish booting within 5 minutes." }
		} until ($booted)
		$ErrorActionPreference = "Stop"
	}

	if (-not (adb -s $device shell pm list packages com.voneo.app | Select-String "com.voneo.app")) {
		Fail "the Voneo dev client isn't installed on $device. Build it with 'eas build --profile development --platform android' and install the APK."
	}

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
	& $maestro --device $device test -e DEV_CLIENT=true $flows
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
	if ($device -like "emulator-*") {
		Write-Output "Closing emulator $device..."
		adb -s $device emu kill | Out-Null
	}
	# Each Maestro run leaves a ~220 MB copy of the app's APK in %TEMP%.
	Get-ChildItem $env:TEMP -Filter "tmp*.apk" -File -ErrorAction SilentlyContinue |
		Where-Object { $_.LastWriteTime -ge $startedAt } |
		Remove-Item -Force -ErrorAction SilentlyContinue
}

exit $exitCode
