#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# Every folder with its own package.json. Keep in step with nuke.sh.
for dir in . web-server/src web-server/tests web-socket-api/src web-socket-api/tests infra infra/kill-switch mobile-app; do
  echo "Installing $dir npm dependencies..."
  (cd "$dir" && npm install)
done

echo "Building signalling API dev image..."
docker build -f ./web-socket-api/src/Dockerfile.dev -t signalling-server-dev:1.0.0 ./web-socket-api/src

echo "Building frontend dev image..."
docker build --build-context root=. -f ./web-server/src/Dockerfile.dev -t web-server-dev:1.0.0 ./web-server/src

echo "Ready for dev!"
