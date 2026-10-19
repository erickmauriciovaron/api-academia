"""CobraBot: recordatorios automáticos de cobro de facturas."""

import html
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import flag_modified

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin, utcnow
from ..deps import Ctx, require_product
from ..notify import email_layout, notify_once, send_email, send_whatsapp

P = "cobrabot"

DEFAULT_SETTINGS = {
    "offsets": [-3, 0, 3, 7, 15, 30],
    "payment_url": "",
    "sender_name": "",
    "reply_to": "",
    "whatsapp": True,
    "subject": "Recordatorio de pago - Factura {numero}",
    "body": (
        "Hola {cliente},\n\nTe recordamos que la factura {numero} por {monto} {moneda} {estado}.\n\n"
        "Puedes pagar aquí: {enlace}\n\nSi ya realizaste el pago, ignora este mensaje.\n\nGracias,\n{empresa}"
    ),
}


class CbCustomer(TenantMixin, Base):
    __tablename__ = "cb_customers"
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CbInvoice(TenantMixin, Base):
    __tablename__ = "cb_invoices"
    customer_id: Mapped[int] = mapped_column(ForeignKey("cb_customers.id", ondelete="CASCADE"), index=True)
    number: Mapped[str] = mapped_column(String(60))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    issued_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | paid | void
    payment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paid_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminders_sent: Mapped[int] = mapped_column(default=0)
    last_reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


def get_settings_for(tenant) -> dict:
    return {**DEFAULT_SETTINGS, **(tenant.settings or {}).get(P, {})}


def _ser_inv(ctx: Ctx, inv: CbInvoice) -> dict:
    c = ctx.db.get(CbCustomer, inv.customer_id)
    days = (date.today() - inv.due_on).days
    return to_dict(inv, {"customer_name": c.name if c else "", "days_overdue": days if inv.status == "open" else 0})


def _before_inv(ctx: Ctx, obj, data: dict, creating: bool):
    if data.get("status") == "paid" and not data.get("paid_on") and not obj.paid_on:
        data["paid_on"] = date.today()


router = APIRouter(prefix="/api/cobrabot")
router.include_router(crud_router(CbCustomer, P, "/customers", limit_key="customers", search=("name", "email", "tax_id"), order_by=CbCustomer.name, csv_import=True))
router.include_router(
    crud_router(
        CbInvoice,
        P,
        "/invoices",
        search=("number",),
        filters=("status", "customer_id"),
        order_by=CbInvoice.due_on,
        readonly={"reminders_sent", "last_reminder_at"},
        serialize=_ser_inv,
        before_save=_before_inv,
        csv_import=True,
    )
)


class SettingsIn(BaseModel):
    offsets: list[int] | None = None
    payment_url: str | None = None
    sender_name: str | None = None
    reply_to: str | None = None
    whatsapp: bool | None = None
    subject: str | None = None
    body: str | None = None


@router.get("/settings")
def read_settings(ctx: Ctx = Depends(require_product(P))):
    return get_settings_for(ctx.tenant)


@router.put("/settings")
def save_settings(data: SettingsIn, ctx: Ctx = Depends(require_product(P))):
    cur = get_settings_for(ctx.tenant)
    cur.update({k: v for k, v in data.model_dump().items() if v is not None})
    cur["offsets"] = sorted({int(x) for x in cur["offsets"] if -60 <= int(x) <= 365})
    settings = dict(ctx.tenant.settings or {})
    settings[P] = cur
    ctx.tenant.settings = settings
    flag_modified(ctx.tenant, "settings")
    ctx.db.commit()
    return cur


@router.get("/dashboard")
def dashboard(ctx: Ctx = Depends(require_product(P))):
    invs = ctx.db.scalars(select(CbInvoice).where(CbInvoice.tenant_id == ctx.tenant_id)).all()
    today = date.today()
    since = today - timedelta(days=30)
    by_cur: dict[str, dict] = {}
    for i in invs:
        b = by_cur.setdefault(i.currency, {"open": 0.0, "overdue": 0.0, "recovered_30d": 0.0})
        if i.status == "open":
            b["open"] += float(i.amount)
            if i.due_on < today:
                b["overdue"] += float(i.amount)
        elif i.status == "paid" and i.paid_on and i.paid_on >= since:
            b["recovered_30d"] += float(i.amount)
    overdue = sorted([i for i in invs if i.status == "open" and i.due_on < today], key=lambda x: x.due_on)[:20]
    return {"by_currency": by_cur, "open_count": sum(1 for i in invs if i.status == "open"), "overdue": [_ser_inv(ctx, i) for i in overdue]}


def render(template: str, inv: CbInvoice, customer: CbCustomer, tenant, cfg: dict, today: date) -> str:
    days = (today - inv.due_on).days
    estado = "vence hoy" if days == 0 else (f"vence el {inv.due_on.isoformat()}" if days < 0 else f"venció hace {days} días ({inv.due_on.isoformat()})")
    values = {
        "cliente": customer.name,
        "numero": inv.number,
        "monto": f"{inv.amount:,.2f}",
        "moneda": inv.currency,
        "vence": inv.due_on.isoformat(),
        "dias": str(days),
        "estado": estado,
        "enlace": inv.payment_url or cfg.get("payment_url") or "",
        "empresa": cfg.get("sender_name") or tenant.name,
    }
    out = template
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    return out


def send_reminder(db, tenant, inv: CbInvoice, today: date, key_suffix: str) -> bool:
    cfg = get_settings_for(tenant)
    customer = db.get(CbCustomer, inv.customer_id)
    if not customer:
        return False
    subject = render(cfg["subject"], inv, customer, tenant, cfg, today)
    text = render(cfg["body"], inv, customer, tenant, cfg, today)
    body = email_layout(subject, "".join(f"<p>{html.escape(line) or '&nbsp;'}</p>" for line in text.split("\n")))
    sent = False
    if customer.email:
        sent = notify_once(db, f"cb:{inv.id}:{key_suffix}:email", tenant.id, "email", customer.email, subject, lambda: send_email(customer.email, subject, body)) or sent
    if cfg.get("whatsapp") and customer.phone:
        sent = notify_once(db, f"cb:{inv.id}:{key_suffix}:wa", tenant.id, "whatsapp", customer.phone, subject, lambda: send_whatsapp(customer.phone, text)) or sent
    if sent:
        inv.reminders_sent = (inv.reminders_sent or 0) + 1
        inv.last_reminder_at = utcnow()
        db.commit()
    return sent


@router.post("/invoices/{inv_id}/remind")
def remind_now(inv_id: int, ctx: Ctx = Depends(require_product(P))):
    inv = ctx.db.scalar(select(CbInvoice).where(CbInvoice.id == inv_id, CbInvoice.tenant_id == ctx.tenant_id))
    if not inv or inv.status != "open":
        raise HTTPException(404, "Factura abierta no encontrada")
    ok = send_reminder(ctx.db, ctx.tenant, inv, date.today(), f"manual:{utcnow().isoformat()}")
    if not ok:
        raise HTTPException(400, "El cliente no tiene correo ni WhatsApp, o el envío falló")
    return {"ok": True}


def run_reminders(db, tenant, today: date | None = None) -> int:
    today = today or date.today()
    offsets = set(get_settings_for(tenant)["offsets"])
    sent = 0
    invs = db.scalars(select(CbInvoice).where(CbInvoice.tenant_id == tenant.id, CbInvoice.status == "open")).all()
    for inv in invs:
        days = (today - inv.due_on).days
        if days in offsets and send_reminder(db, tenant, inv, today, f"{inv.due_on}:{days}"):
            sent += 1
    return sent
