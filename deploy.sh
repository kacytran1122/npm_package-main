#!/usr/bin/env bash
# Build and start the production stack. Run from the repo root on your server.
set -euo pipefail

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

if [ -z "${JWT_SECRET:-}" ] || [ ${#JWT_SECRET} -lt 32 ]; then
  echo "JWT_SECRET must be set and at least 32 characters." >&2
  echo "Generate one with: openssl rand -hex 32" >&2
  exit 1
fi

if [ "${MONGO_ROOT_PASSWORD:-changeme}" = "changeme" ]; then
  echo "Refusing to deploy with the default MongoDB password." >&2
  echo "Set MONGO_ROOT_PASSWORD in .env." >&2
  exit 1
fi

echo "Building images..."
docker compose -f docker-compose.prod.yml build

echo "Starting stack..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for the API..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost/api/v1/health >/dev/null 2>&1; then
    echo "Up. Dashboard: http://localhost  API: http://localhost/api/v1"
    exit 0
  fi
  sleep 2
done

echo "API did not come up in 60s. Check: docker compose -f docker-compose.prod.yml logs" >&2
exit 1
