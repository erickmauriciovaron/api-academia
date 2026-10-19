#!/usr/bin/env bash
# Restaura un backup creado por backup.sh (REEMPLAZA los datos actuales).
#   sudo bash deploy/restore.sh /var/backups/microsuite/suite-2026-10-19.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Indica el archivo .sql.gz a restaurar}"
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
U="$(envval POSTGRES_USER)"; U="${U:-suite}"
D="$(envval POSTGRES_DB)"; D="${D:-suite}"
read -r -p "Esto reemplaza TODOS los datos de '$D'. Escribe RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado"; exit 1; }
docker compose stop api worker
docker compose exec -T db psql -q -U "$U" -d postgres -c "DROP DATABASE IF EXISTS \"$D\" WITH (FORCE);" -c "CREATE DATABASE \"$D\" OWNER \"$U\";"
gunzip -c "$FILE" | docker compose exec -T db psql -q -U "$U" -d "$D"
docker compose start api worker
echo "Restaurado desde $FILE"
