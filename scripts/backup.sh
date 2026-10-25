#!/usr/bin/env sh
# Consistent backup of the MeritNama stack: database dump + file storage.
# Usage: scripts/backup.sh            (run from the repo directory on the NAS)
# Output: ${MERITNAMA_DATA_DIR}/backups/meritnama-<UTC timestamp>/
set -eu

[ -f .env ] && set -a && . ./.env && set +a
DATA_DIR="${MERITNAMA_DATA_DIR:-./var}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DATA_DIR/backups/meritnama-$STAMP"
mkdir -p "$OUT"
umask 077

echo "Dumping database…"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-meritnama}" -d "${POSTGRES_DB:-meritnama}" --format=custom --no-owner \
  > "$OUT/database.dump"

echo "Archiving file storage…"
tar -C "$DATA_DIR" -czf "$OUT/storage.tar.gz" storage 2>/dev/null || echo "  (no storage directory yet)"

( cd "$OUT" && sha256sum ./* > SHA256SUMS )
echo "Backup written to $OUT"
echo "Copy it OFF this machine (another disk, NAS snapshot target or encrypted cloud storage)."
