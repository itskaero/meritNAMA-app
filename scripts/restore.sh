#!/usr/bin/env sh
# Restore a backup made by scripts/backup.sh. DESTRUCTIVE: replaces current data.
# Usage: scripts/restore.sh /path/to/meritnama-<timestamp>
set -eu

SRC="${1:?usage: scripts/restore.sh <backup directory>}"
[ -f .env ] && set -a && . ./.env && set +a
DATA_DIR="${MERITNAMA_DATA_DIR:-./var}"

( cd "$SRC" && sha256sum -c SHA256SUMS )
printf "This replaces the current database and storage with %s. Type 'restore' to continue: " "$SRC"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }

docker compose stop app
echo "Restoring database…"
docker compose exec -T db pg_restore -U "${POSTGRES_USER:-meritnama}" -d "${POSTGRES_DB:-meritnama}" \
  --clean --if-exists --no-owner < "$SRC/database.dump"

if [ -f "$SRC/storage.tar.gz" ]; then
  echo "Restoring file storage…"
  rm -rf "$DATA_DIR/storage.restore-old" && [ -d "$DATA_DIR/storage" ] && mv "$DATA_DIR/storage" "$DATA_DIR/storage.restore-old"
  tar -C "$DATA_DIR" -xzf "$SRC/storage.tar.gz"
fi

docker compose up -d app
echo "Restore complete. Check: curl -s http://127.0.0.1:${APP_PORT:-3000}/api/health"
