#!/usr/bin/env bash
# Copia de seguridad diaria de PostgreSQL. Cron sugerido (root):
#   15 3 * * * /opt/microsuite/deploy/backup.sh >> /var/log/microsuite-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DEST=${BACKUP_DIR:-/var/backups/microsuite}
mkdir -p "$DEST"
FILE="$DEST/suite-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-suite}" "${POSTGRES_DB:-suite}" | gzip > "$FILE"
find "$DEST" -name 'suite-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup OK -> $FILE"
