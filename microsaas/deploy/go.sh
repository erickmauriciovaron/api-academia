#!/usr/bin/env bash
# Instalación guiada en un Droplet nuevo o reutilizado (pensado para escribirlo desde el celular):
#   bash /opt/a/microsaas/deploy/go.sh
# 1) Detecta la IP pública y usa <ip>.sslip.io como dominio con HTTPS (o pregunta otro).
# 2) Opcional: respalda y BORRA todo lo instalado antes (apps, contenedores, sitios Nginx, bases de datos).
# 3) Ejecuta install.sh. Las credenciales de PayPal, correo y Microsoft 365 se cargan luego desde la web
#    (Superadmin → Integraciones), así no hay que escribirlas en la consola.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Ejecuta como root"; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$DIR/.." && pwd)"

IP="$(curl -fs --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || true)"
[ -n "$IP" ] || IP="$(curl -fs --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
DEFAULT_DOMAIN="$(echo "$IP" | tr . -).sslip.io"

echo
echo "=== MicroSuite: instalación guiada ==="
read -r -p "Dominio [$DEFAULT_DOMAIN]: " DOMAIN
DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
ADMIN_EMAIL=""
while [[ ! "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
  read -r -p "Tu correo (usuario superadmin): " ADMIN_EMAIL
done

echo
read -r -p "¿Borrar TODO lo instalado antes en este servidor? Se guarda un respaldo en /root. Escribe BORRAR para hacerlo, o Enter para omitir: " WIPE

if [ "$WIPE" = "BORRAR" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  BK="/root/respaldo-$TS"
  mkdir -p "$BK"
  echo "==> Respaldando en $BK"
  if command -v mysqldump >/dev/null 2>&1; then mysqldump --all-databases > "$BK/mysql.sql" 2>/dev/null || true; fi
  if command -v pg_dumpall >/dev/null 2>&1; then su postgres -c pg_dumpall > "$BK/postgres.sql" 2>/dev/null || true; fi
  if command -v docker >/dev/null 2>&1; then
    docker ps -a > "$BK/docker-ps.txt" 2>/dev/null || true
    for v in $(docker volume ls -q 2>/dev/null); do
      docker run --rm -v "$v":/v -v "$BK":/b alpine tar czf "/b/volume-$v.tgz" -C /v . 2>/dev/null || true
    done
  fi
  crontab -l > "$BK/crontab.txt" 2>/dev/null || true
  tar czf "$BK/archivos.tgz" --ignore-failed-read --exclude="$REPO" --exclude=/opt/digitalocean \
    /etc/nginx /var/www /srv /opt /home /etc/systemd/system 2>/dev/null || true
  echo "    Respaldo listo: $(du -sh "$BK" | cut -f1)"

  echo "==> Borrando lo instalado"
  command -v pm2 >/dev/null 2>&1 && { pm2 kill >/dev/null 2>&1 || true; }
  if command -v docker >/dev/null 2>&1; then
    docker ps -aq | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker system prune -af --volumes >/dev/null 2>&1 || true
  fi
  # Servicios propios (apps), nunca los del sistema ni el agente de DigitalOcean (consola web)
  for f in /etc/systemd/system/*.service; do
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    name="$(basename "$f")"
    case "$name" in droplet-agent*|do-agent*|*digitalocean*|snap*|cloud*|systemd*|ssh*|getty*|docker*|containerd*) continue ;; esac
    if grep -qE 'ExecStart=.*(/var/www|/opt/|/srv/|/home/|/root/|node|npm|pm2|python|gunicorn|uvicorn|dotnet|java)' "$f"; then
      echo "    servicio: $name"
      systemctl disable --now "$name" >/dev/null 2>&1 || true
      rm -f "$f"
    fi
  done
  systemctl daemon-reload 2>/dev/null || true
  if [ -d /etc/nginx ]; then
    find /etc/nginx/sites-enabled /etc/nginx/sites-available -mindepth 1 ! -name default -delete 2>/dev/null || true
    rm -f /etc/nginx/conf.d/*.conf
  fi
  find /var/www -mindepth 1 -maxdepth 1 ! -name html -exec rm -rf {} + 2>/dev/null || true
  find /srv -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  find /opt -mindepth 1 -maxdepth 1 ! -path "$REPO" ! -name digitalocean -exec rm -rf {} + 2>/dev/null || true
  export DEBIAN_FRONTEND=noninteractive
  for svc in mysql mariadb postgresql; do systemctl disable --now "$svc" >/dev/null 2>&1 || true; done
  apt-get -o DPkg::Lock::Timeout=300 purge -y -qq 'mysql-server*' 'mariadb-server*' 'postgresql*' >/dev/null 2>&1 || true
  rm -rf /var/lib/mysql /var/lib/postgresql
  apt-get -o DPkg::Lock::Timeout=300 autoremove -y -qq >/dev/null 2>&1 || true
  crontab -r 2>/dev/null || true
  echo "    Servidor limpio."
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

[ -n "${GO_SKIP_INSTALL:-}" ] && exit 0  # solo para pruebas
DOMAIN="$DOMAIN" ADMIN_EMAIL="$ADMIN_EMAIL" bash "$DIR/deploy/install.sh"

echo
echo "  Siguiente paso: entra a https://$DOMAIN/login con $ADMIN_EMAIL y la clave de arriba,"
echo "  luego Superadmin → Integraciones para cargar PayPal, correo y Microsoft 365."
CRED="$DIR/.superadmin"
[ -f "$CRED" ] && { echo; echo "  Credenciales del superadmin:"; sed 's/^/    /' "$CRED"; }
