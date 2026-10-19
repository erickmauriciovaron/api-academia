#!/usr/bin/env bash
# Instalador de MicroSuite en un Droplet Ubuntu 22.04/24.04 (idempotente: se puede volver a ejecutar).
#
#   sudo DOMAIN=suite.tudominio.com ADMIN_EMAIL=tu@correo.com bash deploy/install.sh
#
# Variables opcionales (si se pasan, quedan en .env y se configuran solas):
#   PAYPAL_MODE=sandbox|live  PAYPAL_CLIENT_ID=...  PAYPAL_CLIENT_SECRET=...
#   SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... SMTP_FROM="MicroSuite <no-reply@tudominio.com>"
#   M365_READ_CLIENT_ID=... M365_READ_CLIENT_SECRET=... M365_ADMIN_CLIENT_ID=... M365_ADMIN_CLIENT_SECRET=...
#   EXTRA_DOMAINS="licencialens.com venceya.app"   PRODUCT_DOMAINS="licencialens.com=licencialens,venceya.app=venceya"
#   SKIP_CERTBOT=1   (si el DNS aún no apunta al Droplet)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Ejecuta como root (sudo)."
: "${DOMAIN:?Define DOMAIN, por ejemplo DOMAIN=suite.tudominio.com}"
: "${ADMIN_EMAIL:?Define ADMIN_EMAIL (superadmin y avisos de certificados HTTPS)}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"

# ---------- 1. Paquetes ----------
log "Instalando paquetes (docker, nginx, certbot)"
export DEBIAN_FRONTEND=noninteractive
APT="apt-get -o DPkg::Lock::Timeout=300"
$APT update -qq
if ! command -v docker >/dev/null 2>&1; then
  $APT install -y -qq docker.io >/dev/null || (curl -fsSL https://get.docker.com | sh)
fi
if ! docker compose version >/dev/null 2>&1; then
  $APT install -y -qq docker-compose-v2 >/dev/null 2>&1 || $APT install -y -qq docker-compose-plugin >/dev/null
fi
command -v nginx >/dev/null 2>&1 || $APT install -y -qq nginx >/dev/null
command -v certbot >/dev/null 2>&1 || $APT install -y -qq certbot python3-certbot-nginx >/dev/null
systemctl enable --now docker nginx >/dev/null 2>&1 || true

# ---------- 2. Swap (Droplets de 1-2 GB) ----------
if [ "$(swapon --show --noheadings | wc -l)" = 0 ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 3500000 ]; then
  log "Creando swap de 2 GB"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------- 3. Archivo .env ----------
rand() { python3 -c "import secrets; print(secrets.token_urlsafe($1))"; }
setenv() { # setenv CLAVE valor  -> crea o reemplaza la línea en .env
  local k="$1" v="$2"
  if grep -q "^$k=" .env; then
    python3 - "$k" "$v" <<'PY'
import sys, re
k, v = sys.argv[1], sys.argv[2]
s = open('.env').read()
s = re.sub(rf'^{re.escape(k)}=.*$', lambda m: f'{k}={v}', s, flags=re.M)
open('.env', 'w').write(s)
PY
  else
    echo "$k=$v" >> .env
  fi
}
if [ ! -f .env ]; then
  log "Creando .env con claves aleatorias"
  cp .env.example .env
  setenv SECRET_KEY "$(rand 48)"
  setenv POSTGRES_PASSWORD "$(rand 24)"
  setenv PAYPAL_MODE sandbox
  setenv SMTP_FROM "MicroSuite <no-reply@$DOMAIN>"
  chmod 600 .env
fi
setenv APP_URL "https://$DOMAIN"
CORS="https://$DOMAIN"; for d in $EXTRA_DOMAINS; do CORS="$CORS,https://$d"; done
setenv CORS_ORIGINS "$CORS"
for k in PAYPAL_MODE PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM \
         M365_READ_CLIENT_ID M365_READ_CLIENT_SECRET M365_ADMIN_CLIENT_ID M365_ADMIN_CLIENT_SECRET \
         WHATSAPP_TOKEN WHATSAPP_PHONE_ID PRODUCT_DOMAINS; do
  if [ -n "${!k:-}" ]; then setenv "$k" "${!k}"; fi
done
grep -q '^PAYPAL_MODE=mock' .env && setenv PAYPAL_MODE sandbox   # mock nunca en producción

# Puerto local libre para el contenedor web
PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-8080}"
if ss -ltn "( sport = :$PORT )" | grep -q LISTEN && ! docker compose ps web 2>/dev/null | grep -q "$PORT"; then
  for p in $(seq 8081 8099); do ss -ltn "( sport = :$p )" | grep -q LISTEN || { PORT=$p; break; }; done
  setenv WEB_PORT "$PORT"
  log "Puerto 8080 ocupado: se usará $PORT"
fi

# ---------- 4. Contenedores ----------
log "Construyendo y levantando contenedores (puede tardar unos minutos)"
docker compose up -d --build
for i in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 3
  [ "$i" = 60 ] && { docker compose logs --tail=50 api; die "La API no respondió"; }
done

# ---------- 5. Nginx + HTTPS ----------
log "Configurando Nginx para $DOMAIN $EXTRA_DOMAINS"
NAMES="$DOMAIN"; for d in $EXTRA_DOMAINS; do NAMES="$NAMES $d"; done
sed -e "s/server_name suite.tudominio.com;/server_name $NAMES;/" -e "s#127.0.0.1:8080#127.0.0.1:$PORT#" deploy/nginx-host.conf > /etc/nginx/sites-available/microsuite
ln -sf /etc/nginx/sites-available/microsuite /etc/nginx/sites-enabled/microsuite
nginx -t && systemctl reload nginx
if [ -z "${SKIP_CERTBOT:-}" ]; then
  CERT_ARGS=(-d "$DOMAIN"); for d in $EXTRA_DOMAINS; do CERT_ARGS+=(-d "$d"); done
  certbot --nginx --non-interactive --agree-tos --redirect --expand -m "$ADMIN_EMAIL" "${CERT_ARGS[@]}" \
    || echo "AVISO: certbot falló. Verifica que el DNS de $DOMAIN apunte a este servidor y ejecuta: certbot --nginx -d $DOMAIN"
fi

# ---------- 6. Superadmin ----------
CRED_FILE="$DIR/.superadmin"
if [ ! -f "$CRED_FILE" ]; then
  log "Creando superadmin $ADMIN_EMAIL"
  PASS="$(rand 12)"
  docker compose exec -T api python -m app.cli create-superadmin "$ADMIN_EMAIL" "Administrador" "$PASS"
  printf 'usuario=%s\nclave=%s\n' "$ADMIN_EMAIL" "$PASS" > "$CRED_FILE" && chmod 600 "$CRED_FILE"
fi

# ---------- 7. PayPal ----------
if grep -qE '^PAYPAL_CLIENT_ID=.+' .env && grep -qE '^PAYPAL_CLIENT_SECRET=.+' .env; then
  log "Sincronizando planes con PayPal"
  docker compose exec -T api python -m app.cli paypal-sync
  if ! grep -qE '^PAYPAL_WEBHOOK_ID=.+' .env; then
    WH="$(docker compose exec -T api python -m app.cli paypal-webhook "https://$DOMAIN/api/billing/paypal/webhook" | sed -n 's/.*PAYPAL_WEBHOOK_ID=\(.*\)$/\1/p' | tr -d '\r')"
    [ -n "$WH" ] && setenv PAYPAL_WEBHOOK_ID "$WH" && docker compose up -d
  fi
fi

# ---------- 8. Backups ----------
CRON="15 3 * * * $DIR/deploy/backup.sh >> /var/log/microsuite-backup.log 2>&1"
{ crontab -l 2>/dev/null | grep -v 'deploy/backup.sh' || true; echo "$CRON"; } | crontab -

# ---------- Resumen ----------
log "Listo"
docker compose ps --format '  {{.Service}}: {{.Status}}'
echo
echo "  Sitio:        https://$DOMAIN"
echo "  Superadmin:   https://$DOMAIN/app/admin   (credenciales en $CRED_FILE)"
echo "  Revisa en https://$DOMAIN/app/admin → Integraciones que PayPal, correo y Microsoft 365 estén configurados."
echo
echo "  Para cambiar algo: edita $DIR/.env y ejecuta de nuevo este script (o: docker compose up -d)."
