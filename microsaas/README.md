# MicroSuite: 10 micro SaaS por suscripción en un solo despliegue

Una sola plataforma (FastAPI + React/TypeScript + PostgreSQL) que vende **10 apps independientes**, cada una con su landing, su prueba gratis de 14 días, sus planes y su cobro recurrente con **PayPal**. El dinero llega a tu cuenta **PayPal Business** y de ahí lo retiras a tu cuenta bancaria colombiana.

| App | Para quién | Starter | Pro (prueba) | Tope | Mercado |
|---|---|---|---|---|---|
| 🔍 **LicenciaLens**: licencias Microsoft 365 desperdiciadas | Empresas 30–500 usuarios, MSP | $29 (150 usuarios) | $59 (1.000 usuarios) | $149 MSP (10 tenants) | Global |
| 🚪 **OffboardKit**: retiro de empleados M365 en un clic | TI, MSP | $19 (20 retiros/mes) | $39 (ilimitado) | $99 MSP (10 tenants) | Global |
| 💻 **AssetTrack**: inventario TI + actas firmadas | Jefes de TI, MSP | $12 (150 activos) | $29 (1.000) | $59 (10.000) | Global |
| ⏰ **VenceYa**: vencimientos SOAT, pólizas, certificados | Flotas, contratistas | $9 (50 docs) | $19 (300) | $39 (2.000) | Global |
| 💸 **CobraBot**: recordatorios de cobro | Pymes de servicios | $15 (100 clientes) | $35 (1.000) | $69 (10.000) | Global |
| 📅 **TributAlerta**: calendario DIAN multi-cliente | Contadores | $9 (25 clientes) | $19 (100) | $39 (500) | 🇨🇴 |
| 📱 **LineaControl**: líneas móviles corporativas | Administración / TI | $12 (50 líneas) | $29 (300) | $59 (2.000) | Global |
| 🛡️ **DatosOK**: Habeas Data (Ley 1581) | Clínicas, colegios, comercio | $9 (200 aut./mes) | $19 (2.000) | $39 (20.000) | 🇨🇴 |
| 🦺 **SST-0312**: estándares mínimos SG-SST | Consultores SST | $15 (3 empresas) | $35 (15) | $69 (60) | 🇨🇴 |
| 🎧 **HelpDesk Lite**: mesa de ayuda + reporte SLA | TI, MSP | $9 (2 agentes) | $25 (6) | $49 (20) | Global |

Precios en USD/mes. El plan anual cuesta 10 meses (2 gratis). Son una **estimación inicial**, pensada para ser accesible en Colombia y competitiva fuera. Se cambian en `backend/app/catalog.py` y luego se ejecuta `paypal-sync`.

---

## Cómo está construido

```
microsaas/
├── backend/            FastAPI + SQLAlchemy 2 + PostgreSQL
│   ├── app/
│   │   ├── catalog.py        Productos, planes, precios, límites, textos de landing (ES/EN)
│   │   ├── routers/          auth, equipo, billing (PayPal), público, superadmin
│   │   ├── products/         Un módulo por app (+ m365.py compartido)
│   │   ├── crud.py           CRUD multi-tenant genérico (aislamiento, límites, CSV)
│   │   ├── paypal.py         API de suscripciones de PayPal
│   │   ├── worker.py         Alertas y recordatorios programados (7:00 a. m. Bogotá)
│   │   └── cli.py            Superadmin, sincronizar PayPal, webhook, calendario DIAN
│   └── tests/                22 pruebas (pytest), pasan en SQLite y PostgreSQL
├── frontend/           React 18 + TypeScript + Vite (SPA bilingüe ES/EN)
├── deploy/             Nginx del Droplet, backup diario, formato CSV del calendario
├── e2e/                Prueba de humo con Playwright (navegador real)
└── docker-compose.yml  db + api + worker + web (~1,1 GB de RAM como máximo)
```

- **Multi-tenant:** cada empresa (tenant) tiene sus usuarios, y todas las tablas llevan `tenant_id`. Las llaves foráneas se validan para que nadie referencie datos de otra empresa.
- **Una cuenta, varias apps:** el cliente se registra desde la landing de una app y puede activar la prueba de otra con la misma cuenta (venta cruzada).
- **Acceso:** `trialing` (14 días), `active`, `past_due` (5 días de gracia), `cancelled` (acceso hasta el fin del periodo pagado) y `expired`. Sin acceso, los datos se conservan y se muestra la pantalla de pago.
- **Límites por plan:** se validan al crear registros (HTTP 402 con mensaje para mejorar el plan).
- **Páginas públicas:** firma de actas (`/firmar/:token`), formulario Habeas Data (`/datos/:key`) y portal de soporte (`/soporte/:key`).
- **Dominios propios (opcional):** por ejemplo `licencialens.com` muestra directamente la landing de LicenciaLens (variable `PRODUCT_DOMAINS`).

---

## 1. Requisitos previos (una sola vez)

### 1.1 PayPal Business (aquí llega el dinero)
1. Crea o convierte tu cuenta en **PayPal Business** a nombre de la persona natural y verifícala.
2. Vincula tu cuenta bancaria colombiana para retirar. PayPal cobra comisión por transacción internacional y por conversión; revisa las tarifas vigentes en paypal.com/co.
3. Entra a <https://developer.paypal.com> → *Apps & Credentials* → crea una app REST en **Sandbox** y otra en **Live**. Copia el `Client ID` y el `Secret`.
4. Tus clientes pagan con su cuenta PayPal **o con tarjeta débito/crédito** (PayPal ofrece la opción de tarjeta en la página de aprobación, según el país).

### 1.2 Correo (obligatorio para alertas e invitaciones)
Usa cualquier SMTP: Brevo (plan gratis de ~300 correos/día), Amazon SES, Zoho o tu Microsoft 365. Configura SPF y DKIM del dominio remitente para no caer en spam.

### 1.3 Microsoft 365 (LicenciaLens y OffboardKit)
En <https://entra.microsoft.com> de **tu** tenant → *App registrations* → *New registration*. Crea dos apps:

| | LicenciaLens (solo lectura) | OffboardKit (administración) |
|---|---|---|
| Supported account types | **Accounts in any organizational directory (Multitenant)** | igual |
| Redirect URI (Web) | `https://suite.tudominio.com/app/m365/callback` | igual |
| API permissions → Microsoft Graph → **Application** | `User.Read.All`, `Organization.Read.All`, `AuditLog.Read.All` | `User.ReadWrite.All`, `Group.ReadWrite.All`, `Directory.ReadWrite.All`, `MailboxSettings.ReadWrite`, `User.RevokeSessions.All` |
| Certificates & secrets | Crea un *client secret* (anótalo y su vencimiento) | igual |

Cuando tu cliente pulsa “Conectar tenant”, su administrador global aprueba los permisos en su propio tenant. Para cambiar contraseñas con OffboardKit, el cliente debe asignar además el rol **User Administrator** a la app en su tenant (Entra → Roles). Si no lo hace, ese paso queda en error en el acta y los demás sí se ejecutan.

### 1.4 WhatsApp (opcional)
Con la WhatsApp Cloud API (Meta Business), crea una plantilla de tipo *utility* llamada `alerta_generica`, con un solo parámetro de cuerpo (`{{1}}`). Copia el token permanente y el *Phone number ID*. Sin esta configuración, las alertas salen solo por correo.

---

## 2. Despliegue en tu Droplet (Docker + Nginx + HTTPS)

```bash
# DNS: crea un registro A  suite.tudominio.com -> IP del Droplet
ssh root@TU_IP
apt-get update && apt-get install -y docker.io docker-compose-v2 git certbot python3-certbot-nginx
git clone -b claude/micro-saas-ideas-colombia-9ggtp4 https://github.com/erickmauriciovaron/api-academia.git /opt/src && cp -r /opt/src/microsaas /opt/microsuite
cd /opt/microsuite
cp .env.example .env && nano .env        # completa APP_URL, SECRET_KEY, POSTGRES_PASSWORD, SMTP, PayPal...
docker compose up -d --build
docker compose ps                        # db, api, worker, web en "Up (healthy)"

# Nginx del host (convive con HelpDesk TI, GestorLineas y AssetTrack)
cp deploy/nginx-host.conf /etc/nginx/sites-available/microsuite
sed -i 's/suite.tudominio.com/TU-DOMINIO/g' /etc/nginx/sites-available/microsuite
ln -s /etc/nginx/sites-available/microsuite /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d TU-DOMINIO            # HTTPS gratis y con renovación automática

# Tu usuario superadmin (panel /app/admin)
docker compose exec api python -m app.cli create-superadmin tu@correo.com "Tu Nombre" "UnaClaveSegura"

# Backup diario de la base de datos (3:15 a. m.)
(crontab -l; echo "15 3 * * * /opt/microsuite/deploy/backup.sh >> /var/log/microsuite-backup.log 2>&1") | crontab -
```

> Si el puerto 8080 ya está ocupado por otra app, cambia `WEB_PORT` en `.env` y en `deploy/nginx-host.conf`.
> Si tienes poca RAM libre, agrega 2 GB de swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.

### 2.1 Activar cobros reales con PayPal
```bash
# 1) Pruebas en sandbox: PAYPAL_MODE=sandbox + credenciales sandbox en .env
docker compose up -d
docker compose exec api python -m app.cli paypal-sync        # crea los 60 planes (10 apps x 3 planes x mensual/anual)
docker compose exec api python -m app.cli paypal-webhook https://TU-DOMINIO/api/billing/paypal/webhook
#    -> copia el PAYPAL_WEBHOOK_ID que imprime en .env y reinicia: docker compose up -d
# 2) Paga con una cuenta "personal" de sandbox y confirma que el plan queda "Activa" y el pago aparece en /app/admin.
# 3) Producción: cambia a PAYPAL_MODE=live con credenciales live y repite paypal-sync y paypal-webhook.
```
Flujo de cobro: el cliente elige el plan, PayPal aprueba la suscripción, la app la verifica contra la API y la activa. Los webhooks (pago recibido, pago fallido, cancelación, suspensión) mantienen el estado sincronizado. Los cambios de plan usan `revise` de PayPal (no hay doble cobro) y la cancelación se hace desde la app.

### 2.2 Cargar el calendario DIAN (TributAlerta)
Cada diciembre, cuando salga el decreto del calendario tributario del año siguiente, carga las fechas desde **/app/admin → Calendario DIAN** (o con `python -m app.cli import-calendar archivo.csv`). El formato está en `deploy/calendario-dian-FORMATO-EJEMPLO.csv`; **las fechas de ese archivo son solo de ejemplo**. Usa `digits=1` para el último dígito del NIT y `digits=2` para los dos últimos (por ejemplo, renta de personas naturales y grandes contribuyentes).

---

## 3. Desarrollo local

```bash
# Backend
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
DATABASE_URL=sqlite:///./dev.db PAYPAL_MODE=mock uvicorn app.main:app --reload     # http://localhost:8000/api/docs
pytest -q                                                                          # 22 pruebas

# Frontend (proxy /api -> :8000)
cd frontend && npm install && npm run dev                                          # http://localhost:5173
```
Con `PAYPAL_MODE=mock`, “Elegir plan” activa el plan sin cobrar, para probar todo el flujo.

---

## 4. Cómo validar que todo funciona
1. `docker compose ps`: los 4 servicios en `Up`, y `api` en `healthy`.
2. `curl https://TU-DOMINIO/api/health` devuelve `{"ok":true}`.
3. Regístrate desde `https://TU-DOMINIO/p/venceya`, crea un documento que venza en 7 días y ejecuta `docker compose exec worker python -m app.worker --once`: debe llegarte la alerta por correo.
4. Con PayPal en sandbox, compra un plan y verifica en `/app/admin` el MRR y el pago.
5. Opcional: `cd e2e && npm i && npm run smoke` recorre las 10 apps en un navegador real (requiere `PAYPAL_MODE=mock`).

---

## 5. Fuera de la versión 1 (a propósito)
- Facturación electrónica DIAN de tus propias ventas: PayPal emite el recibo; como persona natural declara los ingresos con tu contador.
- Adjuntar archivos (PDF de pólizas, soportes): se guarda el número y la fecha, no el archivo.
- Onboarding de usuarios en M365, conversión a buzón compartido y reenvío de correo (requieren Exchange PowerShell).
- Migraciones con Alembic: v1 crea las tablas al arrancar. Agrega Alembic antes del primer cambio de esquema con datos reales.
- Precios en COP o pasarelas locales (Wompi, Mercado Pago): PayPal convierte la moneda del comprador.

**Aviso:** los textos legales (Ley 1581, Res. 0312, calendario DIAN) son una base operativa. Valídalos con un abogado, un profesional SST o un contador antes de venderlos como cumplimiento.
