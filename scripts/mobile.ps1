$ErrorActionPreference = "Stop"

# Opens the mobile app's dev-client build on an Android emulator/device for
# manual use, with no tests run:
#   - boots an emulator if no device is connected (the first AVD, or
#     $env:VONEO_AVD), and leaves it running afterwards
#   - runs Metro in the foreground (its keys work: r reloads, m opens the dev
#     menu; Ctrl+C stops it) and opens the app on the device. A Metro that's
#     already running on :8081 is reused instead.
# The dev client loads the current JS from Metro, so only native changes need
# a new dev-client build. The signalling API isn't started: run it yourself
# (LOCAL=true, e.g. `npm run dev`); this only warns if :3000 isn't answering.

Set-Location (Join-Path $PSScriptRoot "..")

function Fail($message) {
	Write-Output "mobile: $message"
	exit 1
}

function Get-Device {
	$line = adb devices | Select-String "^(\S+)\tdevice$" | Select-Object -First 1
	if ($line) { $line.Matches[0].Groups[1].Value }
}

# --- Emulator / device ------------------------------------------------------

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
	# Same boot flags as test-maestro.ps1: cold boot without snapshots, and
	# guest RAM not backed by a file on disk.
	Start-Process -FilePath $emulator -ArgumentList `
		"-avd", $avd, "-no-snapshot-load", "-no-snapshot-save", "-feature", "-QuickbootFileBacked", "-no-boot-anim"
	# adb complains on stderr ("device offline") while it boots, which "Stop"
	# would turn into a terminating error.
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

# --- API check (not started here) -------------------------------------------

$apiUp = $false
try {
	Invoke-WebRequest -UseBasicParsing http://localhost:3000/call/ice-servers -TimeoutSec 3 | Out-Null
	$apiUp = $true
} catch {
	# 401 (no token) means it's up.
	if ($_.Exception.Response.StatusCode.value__ -eq 401) { $apiUp = $true }
}
if (-not $apiUp) {
	Write-Output "Warning: the signalling API isn't answering on :3000. Start it (LOCAL=true) before logging in."
}

# --- Metro ------------------------------------------------------------------

# RawContent, not Content: /status has no text content type.
$metroUp = $false
try {
	$metroUp = (Invoke-WebRequest -UseBasicParsing http://localhost:8081/status -TimeoutSec 3).RawContent -match "packager-status:running"
} catch {}

if ($metroUp) {
	Write-Output "Reusing the Metro server on :8081; opening the app on $device."
	adb -s $device shell am start -a android.intent.action.VIEW `
		-d "exp+voneo://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081" | Out-Null
	exit 0
}

$env:ANDROID_SERIAL = $device # which device `--android` opens the app on
Set-Location mobile-app
npx expo start --dev-client --port 8081 --android
exit $LASTEXITCODE
