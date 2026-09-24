#!/usr/bin/env bash
set -e

# Runs the mobile app's Maestro flows (mobile-app/.maestro/) against the
# dev-client build on a running Android emulator/device, starting what they
# need first and cleaning up afterwards:
#   - the signalling API + MySQL containers, with LOCAL=true and NODE_ENV=dev
#     (the flows log in as the seeded users, at 10.0.2.2:3000)
#   - Metro, serving the app's JS to the dev client
# Anything already running (e.g. from `npm run dev`) is reused and left
# running. Extra args are passed to `maestro test` in place of the default
# `.maestro/`, e.g. `npm run test:maestro -- .maestro/create-call.yaml`.

cd "$(dirname "$0")/.."

fail() {
	echo "test:maestro: $1"
	exit 1
}

# --- Preconditions ----------------------------------------------------------

MAESTRO=$(command -v maestro || echo "$HOME/.maestro/bin/maestro")
[ -x "$MAESTRO" ] || fail "Maestro not found on PATH or in ~/.maestro/bin. Install it: https://docs.maestro.dev/getting-started/installing-maestro"

adb devices | grep -q $'\tdevice$' || fail "no Android emulator/device connected (adb devices). Start one first."
adb shell pm list packages com.voneo.app | grep -q com.voneo.app ||
	fail "the Voneo dev client isn't installed on the device. Build it with 'eas build --profile development --platform android' and install the APK."

COMPOSE=(--env-file .env -f web-socket-api/src/compose.yaml)
STARTED_API=false
METRO_PID=""
# Each Maestro run leaves a ~220 MB copy of the app's APK in the temp dir.
TEMP_DIR=${TMPDIR:-/tmp}
STARTED_MARKER=$(mktemp)

cleanup() {
	if [ -n "$METRO_PID" ]; then
		echo "Stopping Metro..."
		kill -- "-$METRO_PID" 2>/dev/null || kill "$METRO_PID" 2>/dev/null || true
	fi
	if [ "$STARTED_API" = true ]; then
		echo "Stopping the API + MySQL containers..."
		docker compose "${COMPOSE[@]}" down || true
	fi
	find "$TEMP_DIR" -maxdepth 1 -name 'tmp*.apk' -newer "$STARTED_MARKER" -delete 2>/dev/null || true
	rm -f "$STARTED_MARKER"
}
trap cleanup EXIT

# --- API + MySQL ------------------------------------------------------------

if [ -z "$(docker compose "${COMPOSE[@]}" ps --status running -q signalling-server-dev)" ]; then
	echo "Starting the signalling API + MySQL (LOCAL=true, NODE_ENV=dev)..."
	# Shell env overrides .env for compose interpolation.
	LOCAL=true NGROK_HOST= NODE_ENV=dev docker compose "${COMPOSE[@]}" up -d --build signalling-server-dev ||
		fail "failed to start the API containers."
	STARTED_API=true
else
	echo "Reusing the running signalling API."
fi

echo "Waiting for the API on :3000..."
# 401 (no token) means it's up.
timeout 240 bash -c 'until [ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/call/ice-servers)" = "401" ]; do sleep 3; done' ||
	fail "the API didn't come up within 4 minutes."

# --- Metro --------------------------------------------------------------------

if curl -s -m 3 http://localhost:8081/status | grep -q running; then
	echo "Reusing the Metro server on :8081."
else
	echo "Starting Metro (logs: mobile-app/.expo/maestro-metro.log)..."
	mkdir -p mobile-app/.expo
	# Own process group (set -m), so cleanup can stop npx and its children.
	set -m
	(cd mobile-app && CI=1 exec npx expo start --dev-client --port 8081 >.expo/maestro-metro.log 2>&1) &
	METRO_PID=$!
	set +m
	timeout 120 bash -c 'until curl -s -m 3 http://localhost:8081/status | grep -q running; do sleep 2; done' ||
		fail "Metro didn't start within 2 minutes (see mobile-app/.expo/maestro-metro.log)."
fi

# --- Maestro ------------------------------------------------------------------

# Maestro's on-device driver can be slow to start on a busy emulator.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}
if [ $# -eq 0 ]; then set -- .maestro/; fi

set +e
(cd mobile-app && "$MAESTRO" test -e DEV_CLIENT=true "$@")
EXIT_CODE=$?
set -e

exit $EXIT_CODE
