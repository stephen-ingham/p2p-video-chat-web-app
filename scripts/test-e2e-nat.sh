#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# Remote browser containers must run the exact Playwright version the host
# test runner uses (see e2e/compose.nat.yaml).
PLAYWRIGHT_VERSION=$(node -p "require('@playwright/test/package.json').version")
export PLAYWRIGHT_VERSION

# Pulled up front: letting `compose up` pull an image shared by several
# services at once can crash Compose ("concurrent map writes").
docker pull "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

COMPOSE_ARGS=(-p voneo-e2e-nat --project-directory . -f web-socket-api/src/compose.yaml -f web-server/src/compose.yaml -f e2e/compose.e2e.yaml -f e2e/compose.nat.yaml)

set +e
docker compose "${COMPOSE_ARGS[@]}" up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy coturn browser-lan-a-1 browser-lan-a-2 browser-lan-b firewall-lan-a-1 firewall-lan-a-2 firewall-lan-b
UP_EXIT_CODE=$?
set -e

if [ $UP_EXIT_CODE -ne 0 ]; then
	echo "--- e2e NAT stack failed to become healthy, dumping logs ---"
	docker compose "${COMPOSE_ARGS[@]}" logs
	docker compose "${COMPOSE_ARGS[@]}" down -v
	exit $UP_EXIT_CODE
fi

set +e
E2E_NAT=1 npx playwright test "$@"
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
	echo "--- e2e NAT tests failed, dumping stack logs ---"
	docker compose "${COMPOSE_ARGS[@]}" logs
fi

docker compose "${COMPOSE_ARGS[@]}" down -v

exit $EXIT_CODE
