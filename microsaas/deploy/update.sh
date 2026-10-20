#!/usr/bin/env bash
# Actualiza MicroSuite a la última versión de la rama y reinicia con cero pérdida de datos.
#   sudo bash deploy/update.sh
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")" && pwd)"
cd "$DEPLOY/.."
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$REPO_ROOT" ]; then
  git -C "$REPO_ROOT" pull --ff-only
fi
"$DEPLOY/backup.sh"
docker compose up -d --build   # las migraciones de base de datos se aplican solas al arrancar la API
docker image prune -f >/dev/null
docker compose ps --format '{{.Service}}: {{.Status}}'
