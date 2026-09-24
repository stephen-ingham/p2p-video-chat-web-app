#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# `npm run dev` runs `docker compose watch`, which outlives its containers and
# holds a lock on the Compose project, so the next `npm run dev` fails with
# "cannot take exclusive lock". Stop those watchers before taking the
# containers down.
pkill -f 'compose .*-f (web-socket-api|web-server)/src/compose\.yaml watch' || true

npx concurrently \
	"docker compose --env-file .env -f web-socket-api/src/compose.yaml down mysql-db" \
	"docker compose --env-file .env -f web-socket-api/src/compose.yaml down signalling-server-dev" \
	"docker compose --env-file .env -f web-server/src/compose.yaml down web-server-dev"
