#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

COMPOSE_ARGS=(-p voneo-e2e --project-directory . -f web-socket-api/src/compose.yaml -f web-server/src/compose.yaml -f e2e/compose.e2e.yaml)

docker compose "${COMPOSE_ARGS[@]}" up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy

set +e
npx playwright test
EXIT_CODE=$?
set -e

docker compose "${COMPOSE_ARGS[@]}" down -v

exit $EXIT_CODE
