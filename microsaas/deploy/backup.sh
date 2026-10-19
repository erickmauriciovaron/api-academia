#!/usr/bin/env bash
# Copia de seguridad diaria de PostgreSQL. Cron sugerido (root):
#   15 3 * * * /opt/api-academia/microsaas/deploy/backup.sh >> /var/log/microsuite-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
POSTGRES_USER="$(envval POSTGRES_USER)"
POSTGRES_DB="$(envval POSTGRES_DB)"
DEST=${BACKUP_DIR:-/var/backups/microsuite}
mkdir -p "$DEST"
FILE="$DEST/suite-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-suite}" "${POSTGRES_DB:-suite}" | gzip > "$FILE"
find "$DEST" -name 'suite-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup OK -> $FILE"
