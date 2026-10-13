#!/usr/bin/env bash
# Deploys the latest code: backs up the database, pulls from GitHub, rebuilds and restarts.
# Run from the project folder on the server:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

bash deploy/backup.sh
git pull --ff-only
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
docker image prune -f >/dev/null
docker compose -f compose.prod.yaml --env-file .env.prod ps
