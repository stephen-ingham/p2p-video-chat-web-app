#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Every folder with its own package.json. Keep in step with setup.sh.
dirs=". web-server/src web-server/tests web-socket-api/src web-socket-api/tests infra infra/kill-switch mobile-app"

echo ">>> Removing node_modules..."
for dir in $dirs; do
  rm -rf "$dir/node_modules"
done

echo ">>> Clearing npm cache..."
npm cache clean --force

echo ">>> Reinstalling dependencies..."
for dir in $dirs; do
  (cd "$dir" && npm install)
done

echo ">>> Tearing down Docker containers and images..."
docker compose --env-file .env -f web-socket-api/src/compose.yaml down --rmi all
docker compose --env-file .env -f web-server/src/compose.yaml down web-server-dev --rmi all

echo ">>> Pruning Docker system..."
docker system prune -f

echo ">>> Rebuilding Docker images..."
docker compose --env-file .env -f web-socket-api/src/compose.yaml build signalling-server-dev mysql-db
docker compose --env-file .env -f web-server/src/compose.yaml build web-server-dev

echo ">>> Done."
