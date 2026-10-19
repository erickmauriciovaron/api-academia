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
│   ├── migrations/           Migraciones Alembic (se aplican solas al arrancar)
│   └── tests/                35 pruebas (pytest): SQLite y PostgreSQL, Graph y PayPal simulados por HTTP
├── frontend/           React 18 + TypeScript + Vite (SPA bilingüe ES/EN)
├── deploy/             install.sh (un comando), update.sh, backup.sh, restore.sh, Nginx del host
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
| API permissions → Microsoft Graph → **Application** | `User.Read.All`, `Organization.Read.All`, `AuditLog.Read.All` | `User.ReadWrite.All`, `User-PasswordProfile.ReadWrite.All`, `User.RevokeSessions.All`, `GroupMember.ReadWrite.All`, `LicenseAssignment.ReadWrite.All`, `MailboxSettings.ReadWrite`, `Organization.Read.All` |
| Certificates & secrets | Crea un *client secret* (anótalo y su vencimiento) | igual |

Cuando tu cliente pulsa “Conectar tenant”, su administrador global aprueba los permisos en su propio tenant. No concedas el consentimiento en tu propio tenant: lo da cada cliente al conectar. Si el cliente quiere que OffboardKit también pueda bloquear o cambiar la contraseña de **administradores**, debe asignar a la app el rol **Privileged Authentication Administrator** en su tenant (Entra → Roles); sin él, ese paso queda en error en el acta y los demás sí se ejecutan.

### 1.4 WhatsApp (opcional)
Con la WhatsApp Cloud API (Meta Business), crea una plantilla de tipo *utility* llamada `alerta_generica`, con un solo parámetro de cuerpo (`{{1}}`). Copia el token permanente y el *Phone number ID*. Sin esta configuración, las alertas salen solo por correo.

---

## 2. Despliegue en tu Droplet (un solo comando)

**Desde el celular** (consola web de DigitalOcean), escribe solo esto:
```bash
git clone -b claude/micro-saas-ideas-colombia-9ggtp4 https://github.com/erickmauriciovaron/api-academia /opt/a
bash /opt/a/microsaas/deploy/go.sh
```
`go.sh` detecta la IP y usa `<ip>.sslip.io` como dominio gratuito con HTTPS. Pregunta tu correo y, si escribes `BORRAR`, respalda en `/root/respaldo-*` y elimina lo instalado antes: apps, contenedores, sitios de Nginx, servicios y bases de datos. Respeta el agente de DigitalOcean y SSH. Después las credenciales (PayPal, correo, Microsoft 365) se cargan en la web, en **Superadmin → Integraciones**, donde también hay un botón que crea los planes y el webhook de PayPal.

**Desde un computador** también puedes pasar todo por variables:

```bash
# DNS: crea un registro A  suite.tudominio.com -> IP del Droplet (y espera a que propague)
ssh root@TU_IP
apt-get update && apt-get install -y git
git clone -b claude/micro-saas-ideas-colombia-9ggtp4 https://github.com/erickmauriciovaron/api-academia.git /opt/api-academia
cd /opt/api-academia/microsaas

DOMAIN=suite.tudominio.com ADMIN_EMAIL=tu@correo.com \
PAYPAL_MODE=sandbox PAYPAL_CLIENT_ID=xxx PAYPAL_CLIENT_SECRET=yyy \
SMTP_HOST=smtp-relay.brevo.com SMTP_USER=xxx SMTP_PASSWORD=yyy SMTP_FROM="MicroSuite <no-reply@tudominio.com>" \
bash deploy/install.sh
```

`deploy/install.sh` hace todo esto y se puede volver a ejecutar sin riesgo:
1. Instala Docker, Nginx y Certbot si faltan, y crea 2 GB de swap si el servidor tiene poca RAM.
2. Genera `.env` con claves aleatorias (`SECRET_KEY` y contraseña de PostgreSQL) y guarda las variables que le pases.
3. Busca un puerto local libre si el 8080 ya lo usa otra de tus apps (HelpDesk TI, GestorLineas, AssetTrack).
4. Construye y levanta los 4 contenedores. Las migraciones de base de datos se aplican solas al arrancar.
5. Configura Nginx y el certificado HTTPS de Let's Encrypt, con renovación automática.
6. Crea tu superadmin y guarda la clave en `/opt/api-academia/microsaas/.superadmin`.
7. Si pasaste credenciales de PayPal, crea los 60 planes y el webhook y guarda el `PAYPAL_WEBHOOK_ID`.
8. Programa el backup diario de la base de datos (3:15 a. m., conserva 14 días).

Al terminar muestra lo que falte configurar. Las credenciales de Microsoft 365 también se pasan como variables (`M365_READ_CLIENT_ID`, etc.). Si el DNS aún no apunta al servidor, usa `SKIP_CERTBOT=1` y vuelve a ejecutar el script después.

Mantenimiento:
```bash
sudo bash deploy/update.sh                                          # backup + actualizar a la última versión + migraciones
sudo bash deploy/backup.sh                                          # backup manual
sudo bash deploy/restore.sh /var/backups/microsuite/suite-AAAA-MM-DD.sql.gz   # restaurar (pide confirmación)
docker compose logs -f api worker                                   # ver logs
```

> Seguridad: el modo `PAYPAL_MODE=mock` (planes gratis para pruebas) queda bloqueado cuando `APP_URL` usa HTTPS, y el instalador nunca lo deja activo.

### 2.1 Activar cobros reales con PayPal
```bash
# 1) Pruebas en sandbox: PAYPAL_MODE=sandbox + credenciales sandbox en .env
docker compose up -d
docker compose exec api python -m app.cli paypal-sync        # crea los 60 planes (10 apps x 3 planes x mensual/anual); install.sh ya lo hace
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
pytest -q                                                                          # 35 pruebas

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

6. En cada push, GitHub Actions (`.github/workflows/microsuite.yml`) ejecuta las pruebas en SQLite y PostgreSQL, verifica que las migraciones estén al día, compila el frontend y construye las imágenes Docker.

Para cambiar el esquema de base de datos: modifica los modelos y ejecuta `alembic revision --autogenerate -m "descripcion"` contra una base PostgreSQL de desarrollo. El cambio se aplica solo en el siguiente despliegue.

---

## 5. Fuera de la versión 1 (a propósito)
- Facturación electrónica DIAN de tus propias ventas: PayPal emite el recibo; como persona natural declara los ingresos con tu contador.
- Adjuntar archivos (PDF de pólizas, soportes): se guarda el número y la fecha, no el archivo.
- Onboarding de usuarios en M365, conversión a buzón compartido y reenvío de correo (requieren Exchange PowerShell).
- Precios en COP o pasarelas locales (Wompi, Mercado Pago): PayPal convierte la moneda del comprador.

**Aviso:** los textos legales (Ley 1581, Res. 0312, calendario DIAN) son una base operativa. Valídalos con un abogado, un profesional SST o un contador antes de venderlos como cumplimiento.
