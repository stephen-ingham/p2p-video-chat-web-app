#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "Installing root npm dependencies..."
npm install

echo "Installing web-server dependencies..."
(cd web-server/src && npm install)

echo "Installing signalling API dependencies..."
(cd web-socket-api/src && npm install)

echo "Installing infra dependencies..."
(cd infra && npm install)

echo "Building signalling API dev image..."
docker build -f ./web-socket-api/src/Dockerfile.dev -t signalling-server-dev:1.0.0 ./web-socket-api/src

echo "Building frontend dev image..."
docker build --build-context root=. -f ./web-server/src/Dockerfile.dev -t web-server-dev:1.0.0 ./web-server/src

echo "Ready for dev!"
