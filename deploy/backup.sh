#!/usr/bin/env bash
# Saves a compressed copy of the database to backups/ and keeps the newest 14.
# Run from the project folder on the server:  bash deploy/backup.sh
# Restore one with:
#   gunzip -c backups/doable-2026-10-13.sql.gz | docker compose -p "${COMPOSE_PROJECT:-doable}" -f compose.prod.yaml --env-file .env.prod exec -T db psql -U doable doable
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
file="backups/doable-$(date +%F-%H%M).sql.gz"
docker compose -p "${COMPOSE_PROJECT:-doable}" -f compose.prod.yaml --env-file .env.prod exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$file"
echo "Saved $file ($(du -h "$file" | cut -f1))"

ls -1t backups/doable-*.sql.gz | tail -n +15 | xargs -r rm --
