#!/usr/bin/env bash
set -e

# Opens the mobile app's dev-client build on an Android emulator/device for
# manual use, with no tests run:
#   - boots an emulator if no device is connected (the first AVD, or
#     $VONEO_AVD), and leaves it running afterwards
#   - runs Metro in the foreground (its keys work: r reloads, m opens the dev
#     menu; Ctrl+C stops it) and opens the app on the device. A Metro that's
#     already running on :8081 is reused instead.
# The dev client loads the current JS from Metro, so only native changes need
# a new dev-client build. The signalling API isn't started: run it yourself
# (LOCAL=true, e.g. `npm run dev`); this only warns if :3000 isn't answering.

cd "$(dirname "$0")/.."

fail() {
	echo "open: $1"
	exit 1
}

first_device() {
	adb devices | awk -F'\t' '$2 == "device" { print $1; exit }'
}

# --- Emulator / device --------------------------------------------------------

DEVICE=$(first_device)
if [ -n "$DEVICE" ]; then
	echo "Using connected device $DEVICE."
else
	SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
	[ -d "$SDK" ] || SDK=$HOME/Android/Sdk
	EMULATOR=$SDK/emulator/emulator
	[ -x "$EMULATOR" ] || fail "no device connected, and no emulator found at $EMULATOR."
	AVD=${VONEO_AVD:-$("$EMULATOR" -list-avds | head -n 1)}
	[ -n "$AVD" ] || fail "no device connected, and no emulator (AVD) exists. Create one in Android Studio's Device Manager."
	echo "Booting emulator $AVD..."
	# Same boot flags as test-maestro.sh: cold boot without snapshots, and
	# guest RAM not backed by a file on disk. nohup keeps it running after
	# this script (and Metro) exit.
	nohup "$EMULATOR" -avd "$AVD" -no-snapshot-load -no-snapshot-save -feature -QuickbootFileBacked -no-boot-anim >/dev/null 2>&1 &
	for _ in $(seq 1 60); do
		sleep 5
		DEVICE=$(first_device)
		[ -n "$DEVICE" ] && [ "$(adb -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
	done
	[ "$(adb -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] ||
		fail "the emulator didn't finish booting within 5 minutes."
fi

adb -s "$DEVICE" shell pm list packages com.voneo.app | grep -q com.voneo.app ||
	fail "the Voneo dev client isn't installed on $DEVICE. Build it with 'eas build --profile development --platform android' and install the APK."

# --- API check (not started here) -----------------------------------------------

# 401 (no token) means it's up.
[ "$(curl -s -m 3 -o /dev/null -w "%{http_code}" http://localhost:3000/call/ice-servers)" = "401" ] ||
	echo "Warning: the signalling API isn't answering on :3000. Start it (LOCAL=true) before logging in."

# --- Metro --------------------------------------------------------------------

if curl -s -m 3 http://localhost:8081/status | grep -q running; then
	echo "Reusing the Metro server on :8081; opening the app on $DEVICE."
	adb -s "$DEVICE" shell am start -a android.intent.action.VIEW \
		-d "exp+voneo://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081" >/dev/null
	exit 0
fi

# ANDROID_SERIAL picks which device `--android` opens the app on.
cd mobile-app
ANDROID_SERIAL=$DEVICE exec npx expo start --dev-client --port 8081 --android
