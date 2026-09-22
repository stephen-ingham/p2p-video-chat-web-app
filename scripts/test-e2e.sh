#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

COMPOSE_ARGS=(-p voneo-e2e --project-directory . -f web-socket-api/src/compose.yaml -f web-server/src/compose.yaml -f e2e/compose.e2e.yaml)

set +e
docker compose "${COMPOSE_ARGS[@]}" up -d --build --wait signalling-server-prod web-server-prod mysql-db proxy
UP_EXIT_CODE=$?
set -e

if [ $UP_EXIT_CODE -ne 0 ]; then
	echo "--- e2e stack failed to become healthy, dumping logs ---"
	docker compose "${COMPOSE_ARGS[@]}" logs
	docker compose "${COMPOSE_ARGS[@]}" down -v
	exit $UP_EXIT_CODE
fi

set +e
npx playwright test "$@"
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
	echo "--- e2e tests failed, dumping stack logs ---"
	docker compose "${COMPOSE_ARGS[@]}" logs
fi

docker compose "${COMPOSE_ARGS[@]}" down -v

exit $EXIT_CODE
