"""Catálogo de productos, planes, precios (USD) y límites.

Precio anual = 10 x mensual (2 meses gratis). Los precios son una propuesta inicial
(estimación) pensada para ser accesible en Colombia y competitiva a nivel global.
"""

from decimal import Decimal

ANNUAL_MULTIPLIER = 10
UNLIMITED = 1_000_000


def _p(code, name, price, limits, features, trial=False):
    return {"code": code, "name": name, "price": Decimal(str(price)), "limits": limits, "features": features, "trial": trial}


PRODUCTS: dict[str, dict] = {
    "licencialens": {
        "name": "LicenciaLens",
        "color": "#2563eb",
        "icon": "🔍",
        "market": "global",
        "tagline": {"es": "Deja de pagar licencias de Microsoft 365 que nadie usa", "en": "Stop paying for Microsoft 365 licenses nobody uses"},
        "description": {
            "es": "Conecta tu tenant en 2 minutos (solo lectura) y recibe cada mes cuánto dinero estás perdiendo en licencias inactivas, cuentas deshabilitadas y licencias sin asignar.",
            "en": "Connect your tenant in 2 minutes (read-only) and get a monthly report of how much money you lose on inactive users, disabled accounts and unassigned licenses.",
        },
        "features": {
            "es": ["Conexión de solo lectura con consentimiento de administrador", "Detecta usuarios sin inicio de sesión en N días", "Cuentas deshabilitadas que aún consumen licencia", "Licencias compradas sin asignar", "Ahorro mensual estimado en USD con precios editables", "Reporte mensual automático por correo y CSV"],
            "en": ["Read-only connection with admin consent", "Finds users with no sign-in for N days", "Disabled accounts still holding licenses", "Purchased but unassigned licenses", "Estimated monthly savings in USD with editable prices", "Automatic monthly email report and CSV"],
        },
        "faq": {
            "es": [["¿Pueden modificar mi tenant?", "No. La app solo pide permisos de lectura (usuarios, licencias e inicios de sesión)."], ["¿Necesito Entra ID P1?", "Para la fecha de último inicio de sesión sí se requiere P1 o superior en el tenant; sin ella igual detectamos cuentas deshabilitadas y licencias sin asignar."], ["¿Sirve para MSP?", "Sí, el plan MSP permite varios tenants de clientes."]],
            "en": [["Can you change my tenant?", "No. The app only requests read permissions (users, licenses and sign-ins)."], ["Do I need Entra ID P1?", "Last sign-in date requires P1 or higher; without it we still find disabled accounts and unassigned licenses."], ["Does it work for MSPs?", "Yes, the MSP plan supports multiple customer tenants."]],
        },
        "plans": [
            _p("starter", "Starter", 29, {"connections": 1, "users": 150}, {"es": ["1 tenant", "Hasta 150 usuarios"], "en": ["1 tenant", "Up to 150 users"]}),
            _p("pro", "Pro", 59, {"connections": 1, "users": 1000}, {"es": ["1 tenant", "Hasta 1.000 usuarios", "Reporte mensual"], "en": ["1 tenant", "Up to 1,000 users", "Monthly report"]}, trial=True),
            _p("msp", "MSP", 149, {"connections": 10, "users": 5000}, {"es": ["Hasta 10 tenants", "5.000 usuarios en total"], "en": ["Up to 10 tenants", "5,000 users total"]}),
        ],
    },
    "offboardkit": {
        "name": "OffboardKit",
        "color": "#7c3aed",
        "icon": "🚪",
        "market": "global",
        "tagline": {"es": "Retiro de empleados en Microsoft 365 en un clic, con acta", "en": "One-click Microsoft 365 employee offboarding, with audit report"},
        "description": {
            "es": "Bloquea la cuenta, cierra sesiones, cambia la contraseña, quita licencias y grupos y configura respuesta automática. Todo queda registrado en un acta descargable.",
            "en": "Block the account, revoke sessions, reset password, remove licenses and groups and set an auto-reply. Everything is logged in a downloadable report.",
        },
        "features": {
            "es": ["Checklist de retiro configurable", "Bloqueo de inicio de sesión y revocación de sesiones", "Quita licencias (ahorro inmediato) y grupos", "Respuesta automática de correo", "Acta de retiro imprimible con cada paso y hora", "Multi-tenant para MSP"],
            "en": ["Configurable offboarding checklist", "Block sign-in and revoke sessions", "Remove licenses (instant savings) and groups", "Mailbox auto-reply", "Printable report with every step and timestamp", "Multi-tenant for MSPs"],
        },
        "faq": {
            "es": [["¿Qué permisos necesita?", "Permisos de aplicación para administrar usuarios, grupos y configuración de buzón, otorgados por un administrador global."], ["¿Se puede deshacer?", "Sí: la cuenta solo se bloquea, no se elimina."]],
            "en": [["What permissions are needed?", "Application permissions to manage users, groups and mailbox settings, granted by a global admin."], ["Can it be undone?", "Yes: the account is only blocked, not deleted."]],
        },
        "plans": [
            _p("starter", "Starter", 19, {"connections": 1, "runs_month": 20}, {"es": ["1 tenant", "20 retiros/mes"], "en": ["1 tenant", "20 offboardings/month"]}),
            _p("pro", "Pro", 39, {"connections": 1, "runs_month": UNLIMITED}, {"es": ["1 tenant", "Retiros ilimitados"], "en": ["1 tenant", "Unlimited offboardings"]}, trial=True),
            _p("msp", "MSP", 99, {"connections": 10, "runs_month": UNLIMITED}, {"es": ["Hasta 10 tenants", "Retiros ilimitados"], "en": ["Up to 10 tenants", "Unlimited offboardings"]}),
        ],
    },
    "assettrack": {
        "name": "AssetTrack",
        "color": "#0891b2",
        "icon": "💻",
        "market": "global",
        "tagline": {"es": "Inventario TI con actas de entrega firmadas desde el celular", "en": "IT asset inventory with handover forms signed from a phone"},
        "description": {
            "es": "Sabe qué equipo tiene cada persona, su historial de mantenimiento y garantía. Genera actas de entrega y devolución que el empleado firma desde un enlace.",
            "en": "Know which device each person has, its maintenance and warranty history. Generate handover and return forms employees sign from a link.",
        },
        "features": {
            "es": ["Hoja de vida de cada activo", "Asignación a empleados con historial", "Acta de entrega/devolución con firma digital", "Alertas de garantía por vencer", "Importación desde CSV", "Exportación para auditoría"],
            "en": ["Full history per asset", "Assignments to employees with history", "Handover/return form with e-signature", "Warranty expiry alerts", "CSV import", "Audit export"],
        },
        "faq": {
            "es": [["¿El empleado necesita cuenta?", "No, firma desde un enlace único en su celular."], ["¿Puedo importar mi Excel?", "Sí, desde CSV."]],
            "en": [["Does the employee need an account?", "No, they sign from a unique link on their phone."], ["Can I import my spreadsheet?", "Yes, via CSV."]],
        },
        "plans": [
            _p("starter", "Starter", 12, {"assets": 150}, {"es": ["150 activos"], "en": ["150 assets"]}),
            _p("pro", "Pro", 29, {"assets": 1000}, {"es": ["1.000 activos", "Actas con firma"], "en": ["1,000 assets", "Signed forms"]}, trial=True),
            _p("business", "Business", 59, {"assets": 10000}, {"es": ["10.000 activos"], "en": ["10,000 assets"]}),
        ],
    },
    "venceya": {
        "name": "VenceYa",
        "color": "#ea580c",
        "icon": "⏰",
        "market": "global",
        "tagline": {"es": "Que no se te vuelva a vencer un SOAT, póliza o certificado", "en": "Never miss a document, permit or certificate expiry again"},
        "description": {
            "es": "Registra vehículos, personas y contratos con sus documentos. Te avisamos por correo y WhatsApp antes de cada vencimiento.",
            "en": "Track vehicles, people and contracts with their documents. We alert you by email and WhatsApp before each expiry.",
        },
        "features": {
            "es": ["Vehículos, personas, empresas y contratos", "Alertas a 30, 15, 7 y 1 día (configurables)", "Responsable por documento", "Semáforo vencido / por vencer / al día", "Importación desde CSV"],
            "en": ["Vehicles, people, companies and contracts", "Alerts 30, 15, 7 and 1 day before (configurable)", "Owner per document", "Expired / due soon / OK status board", "CSV import"],
        },
        "faq": {
            "es": [["¿Qué puedo controlar?", "Cualquier documento con fecha: SOAT, revisión técnico-mecánica, pólizas, licencias, certificados de alturas, exámenes médicos, contratos."]],
            "en": [["What can I track?", "Any dated document: insurance, inspections, licenses, certifications, medical exams, contracts."]],
        },
        "plans": [
            _p("starter", "Starter", 9, {"documents": 50}, {"es": ["50 documentos"], "en": ["50 documents"]}),
            _p("pro", "Pro", 19, {"documents": 300}, {"es": ["300 documentos", "WhatsApp"], "en": ["300 documents", "WhatsApp"]}, trial=True),
            _p("business", "Business", 39, {"documents": 2000}, {"es": ["2.000 documentos"], "en": ["2,000 documents"]}),
        ],
    },
    "cobrabot": {
        "name": "CobraBot",
        "color": "#16a34a",
        "icon": "💸",
        "market": "global",
        "tagline": {"es": "Cobra tus facturas sin perseguir a nadie", "en": "Get invoices paid without chasing anyone"},
        "description": {
            "es": "Carga tus facturas pendientes y CobraBot envía recordatorios amables y automáticos por correo y WhatsApp con tu enlace de pago.",
            "en": "Load your open invoices and CobraBot sends friendly automatic reminders by email and WhatsApp with your payment link.",
        },
        "features": {
            "es": ["Secuencia de recordatorios antes y después del vencimiento", "Plantillas editables con variables", "Enlace de pago propio (PayPal, Wompi, transferencia)", "Importación de facturas desde CSV", "Tablero de cartera vencida y recuperada"],
            "en": ["Reminder sequence before and after due date", "Editable templates with variables", "Your own payment link", "CSV invoice import", "Overdue and recovered dashboard"],
        },
        "faq": {
            "es": [["¿El dinero pasa por ustedes?", "No. Tus clientes pagan directamente a tu enlace de pago."]],
            "en": [["Does the money go through you?", "No. Your customers pay directly to your payment link."]],
        },
        "plans": [
            _p("starter", "Starter", 15, {"customers": 100}, {"es": ["100 clientes"], "en": ["100 customers"]}),
            _p("pro", "Pro", 35, {"customers": 1000}, {"es": ["1.000 clientes", "WhatsApp"], "en": ["1,000 customers", "WhatsApp"]}, trial=True),
            _p("business", "Business", 69, {"customers": 10000}, {"es": ["10.000 clientes"], "en": ["10,000 customers"]}),
        ],
    },
    "tributalerta": {
        "name": "TributAlerta",
        "color": "#dc2626",
        "icon": "📅",
        "market": "co",
        "tagline": {"es": "El calendario tributario DIAN de todos tus clientes, con alertas", "en": "DIAN tax calendar for all your clients, with alerts"},
        "description": {
            "es": "Para contadores: registra el NIT y las obligaciones de cada cliente y obtén sus vencimientos DIAN automáticamente, con alertas y control de presentado.",
            "en": "For accountants in Colombia: register each client's NIT and obligations and get DIAN deadlines automatically, with alerts and filing tracking.",
        },
        "features": {
            "es": ["Vencimientos por último dígito del NIT", "Renta, IVA, retención en la fuente, exógena y más", "Alertas al contador y al cliente", "Marcar como presentado con nota", "Vencimientos propios adicionales"],
            "en": ["Deadlines by NIT last digit", "Income tax, VAT, withholding and more", "Alerts to accountant and client", "Mark as filed with note", "Custom deadlines"],
        },
        "faq": {
            "es": [["¿De dónde salen las fechas?", "Del decreto del calendario tributario del año, cargado por nosotros. Siempre puedes agregar fechas propias."]],
            "en": [["Where do dates come from?", "From the official yearly tax calendar decree, loaded by us. You can always add your own dates."]],
        },
        "plans": [
            _p("starter", "Starter", 9, {"clients": 25}, {"es": ["25 clientes"], "en": ["25 clients"]}),
            _p("pro", "Pro", 19, {"clients": 100}, {"es": ["100 clientes"], "en": ["100 clients"]}, trial=True),
            _p("firma", "Firma", 39, {"clients": 500}, {"es": ["500 clientes"], "en": ["500 clients"]}),
        ],
    },
    "lineacontrol": {
        "name": "LineaControl",
        "color": "#0d9488",
        "icon": "📱",
        "market": "global",
        "tagline": {"es": "Controla las líneas móviles de tu empresa y deja de pagar las que sobran", "en": "Control your company's mobile lines and stop paying for unused ones"},
        "description": {
            "es": "Inventario de líneas, plan, costo, responsable y centro de costo. Detecta líneas sin asignar, sobrecostos y contratos por vencer.",
            "en": "Inventory of lines, plan, cost, owner and cost center. Detects unassigned lines, overcharges and contracts ending soon.",
        },
        "features": {
            "es": ["Inventario de líneas y SIM", "Registro de facturación mensual", "Alertas de sobrecosto vs. plan", "Líneas sin asignar o sin uso", "Costo por centro de costo"],
            "en": ["Lines and SIM inventory", "Monthly billing log", "Overcharge vs. plan alerts", "Unassigned or unused lines", "Cost per cost center"],
        },
        "faq": {"es": [["¿Funciona con cualquier operador?", "Sí, el registro es independiente del operador."]], "en": [["Does it work with any carrier?", "Yes, it is carrier-independent."]]},
        "plans": [
            _p("starter", "Starter", 12, {"lines": 50}, {"es": ["50 líneas"], "en": ["50 lines"]}),
            _p("pro", "Pro", 29, {"lines": 300}, {"es": ["300 líneas"], "en": ["300 lines"]}, trial=True),
            _p("business", "Business", 59, {"lines": 2000}, {"es": ["2.000 líneas"], "en": ["2,000 lines"]}),
        ],
    },
    "datosok": {
        "name": "DatosOK",
        "color": "#4f46e5",
        "icon": "🛡️",
        "market": "co",
        "tagline": {"es": "Cumple la Ley 1581 de Habeas Data sin papeles", "en": "Comply with Colombia's data protection law (Ley 1581) paperless"},
        "description": {
            "es": "Formulario de autorización de tratamiento de datos con evidencia (fecha, IP, versión de política) y portal de consultas y reclamos de titulares con plazos legales en días hábiles.",
            "en": "Data processing consent form with evidence (date, IP, policy version) and a data subject request portal with legal business-day deadlines.",
        },
        "features": {
            "es": ["Formulario público de autorización con evidencia", "Versionado de la política de tratamiento", "Portal de consultas (10 días hábiles) y reclamos (15 días hábiles)", "Alertas antes del vencimiento legal", "Exportación de evidencias"],
            "en": ["Public consent form with evidence", "Policy versioning", "Request portal (10 / 15 business days)", "Alerts before legal deadline", "Evidence export"],
        },
        "faq": {"es": [["¿Reemplaza a un abogado?", "No. Es la herramienta para operar y evidenciar el cumplimiento; la política la define tu asesor."]], "en": [["Does it replace a lawyer?", "No. It is the tool to operate and evidence compliance; your advisor defines the policy."]]},
        "plans": [
            _p("starter", "Starter", 9, {"consents_month": 200}, {"es": ["200 autorizaciones/mes"], "en": ["200 consents/month"]}),
            _p("pro", "Pro", 19, {"consents_month": 2000}, {"es": ["2.000 autorizaciones/mes"], "en": ["2,000 consents/month"]}, trial=True),
            _p("business", "Business", 39, {"consents_month": 20000}, {"es": ["20.000 autorizaciones/mes"], "en": ["20,000 consents/month"]}),
        ],
    },
    "sst0312": {
        "name": "SST-0312",
        "color": "#ca8a04",
        "icon": "🦺",
        "market": "co",
        "tagline": {"es": "Autoevaluación de estándares mínimos SG-SST y plan de trabajo en minutos", "en": "Colombian OHS minimum standards self-assessment in minutes"},
        "description": {
            "es": "Para consultores y empresas: evalúa los estándares mínimos de la Resolución 0312 de 2019 (7, 21 o 60 ítems), obtén el puntaje y genera el plan de mejoramiento.",
            "en": "For consultants and companies in Colombia: assess Resolution 0312/2019 minimum standards, get the score and build the improvement plan.",
        },
        "features": {
            "es": ["Tablas de 7, 21 y 60 estándares", "Puntaje y valoración automática (crítico / moderado / aceptable)", "Plan de mejoramiento con responsables y fechas", "Multi-empresa para consultores", "Informe imprimible"],
            "en": ["7, 21 and 60-item tables", "Automatic score and rating", "Improvement plan with owners and dates", "Multi-company for consultants", "Printable report"],
        },
        "faq": {"es": [["¿Qué tabla aplica a mi empresa?", "Según número de trabajadores y nivel de riesgo: hasta 10 (7 ítems), 11 a 50 (21 ítems) y más de 50 o riesgo IV-V (60 ítems)."]], "en": [["Which table applies?", "Depends on headcount and risk level: up to 10 (7 items), 11-50 (21 items), over 50 or risk IV-V (60 items)."]]},
        "plans": [
            _p("starter", "Starter", 15, {"companies": 3}, {"es": ["3 empresas"], "en": ["3 companies"]}),
            _p("pro", "Pro", 35, {"companies": 15}, {"es": ["15 empresas"], "en": ["15 companies"]}, trial=True),
            _p("firma", "Firma", 69, {"companies": 60}, {"es": ["60 empresas"], "en": ["60 companies"]}),
        ],
    },
    "helpdesk": {
        "name": "HelpDesk Lite",
        "color": "#475569",
        "icon": "🎧",
        "market": "global",
        "tagline": {"es": "Mesa de ayuda simple para equipos TI y MSP, con reporte SLA mensual", "en": "Simple help desk for IT teams and MSPs, with monthly SLA report"},
        "description": {
            "es": "Portal para que tus usuarios o clientes abran tickets, SLA por prioridad y un reporte mensual por cliente listo para enviar.",
            "en": "Portal for users or customers to open tickets, SLA by priority and a monthly per-client report ready to send.",
        },
        "features": {
            "es": ["Portal público de tickets", "SLA por prioridad con alertas de incumplimiento", "Multi-cliente (MSP)", "Comentarios y notificación por correo", "Reporte SLA mensual por cliente"],
            "en": ["Public ticket portal", "SLA per priority with breach alerts", "Multi-client (MSP)", "Comments and email notifications", "Monthly SLA report per client"],
        },
        "faq": {"es": [["¿Cuántos usuarios pueden abrir tickets?", "Ilimitados. Solo cuentan los agentes."]], "en": [["How many people can open tickets?", "Unlimited. Only agents count."]]},
        "plans": [
            _p("starter", "Starter", 9, {"agents": 2}, {"es": ["2 agentes"], "en": ["2 agents"]}),
            _p("pro", "Pro", 25, {"agents": 6}, {"es": ["6 agentes"], "en": ["6 agents"]}, trial=True),
            _p("business", "Business", 49, {"agents": 20}, {"es": ["20 agentes"], "en": ["20 agents"]}),
        ],
    },
}


def get_product(slug: str) -> dict | None:
    return PRODUCTS.get(slug)


def get_plan(product: str, plan: str) -> dict | None:
    p = PRODUCTS.get(product)
    if not p:
        return None
    return next((x for x in p["plans"] if x["code"] == plan), None)


def trial_plan(product: str) -> dict:
    p = PRODUCTS[product]
    return next((x for x in p["plans"] if x["trial"]), p["plans"][0])


def plan_price(product: str, plan: str, interval: str) -> Decimal:
    pl = get_plan(product, plan)
    if not pl:
        raise KeyError(plan)
    return pl["price"] * ANNUAL_MULTIPLIER if interval == "year" else pl["price"]


def public_catalog() -> list[dict]:
    out = []
    for slug, p in PRODUCTS.items():
        out.append(
            {
                "slug": slug,
                **{k: v for k, v in p.items() if k != "plans"},
                "plans": [
                    {**pl, "price": float(pl["price"]), "price_year": float(pl["price"] * ANNUAL_MULTIPLIER)} for pl in p["plans"]
                ],
            }
        )
    return out
