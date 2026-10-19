"""VenceYa: control de vencimientos de documentos con alertas."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import JSON, Date, ForeignKey, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin
from ..deps import Ctx, require_product
from ..notify import email_layout, notify_once, send_email, send_whatsapp

P = "venceya"
DEFAULT_REMINDERS = [30, 15, 7, 1, 0]


class VyEntity(TenantMixin, Base):
    __tablename__ = "vy_entities"
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30), default="vehiculo")  # vehiculo | persona | empresa | contrato | equipo | otro
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)  # placa, cédula, NIT...
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class VyDocument(TenantMixin, Base):
    __tablename__ = "vy_documents"
    entity_id: Mapped[int] = mapped_column(ForeignKey("vy_entities.id", ondelete="CASCADE"), index=True)
    doc_type: Mapped[str] = mapped_column(String(100))  # SOAT, Técnico-mecánica, Póliza...
    number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    expires_on: Mapped[date] = mapped_column(Date, index=True)
    responsible_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    responsible_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reminder_days: Mapped[list | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


def doc_status(expires_on: date, today: date | None = None) -> tuple[str, int]:
    days = (expires_on - (today or date.today())).days
    if days < 0:
        return "vencido", days
    if days <= 30:
        return "por_vencer", days
    return "al_dia", days


def _ser_doc(ctx: Ctx, d: VyDocument) -> dict:
    st, days = doc_status(d.expires_on)
    ent = ctx.db.get(VyEntity, d.entity_id)
    return to_dict(d, {"status": st, "days_left": days, "entity_name": ent.name if ent else ""})


router = APIRouter(prefix="/api/venceya")
router.include_router(crud_router(VyEntity, P, "/entities", search=("name", "reference"), filters=("kind",), order_by=VyEntity.name, csv_import=True))
router.include_router(
    crud_router(
        VyDocument,
        P,
        "/documents",
        limit_key="documents",
        search=("doc_type", "number"),
        filters=("entity_id",),
        order_by=VyDocument.expires_on,
        serialize=_ser_doc,
        csv_import=True,
    )
)


@router.get("/dashboard")
def dashboard(ctx: Ctx = Depends(require_product(P))):
    docs = ctx.db.scalars(select(VyDocument).where(VyDocument.tenant_id == ctx.tenant_id).order_by(VyDocument.expires_on)).all()
    items = [_ser_doc(ctx, d) for d in docs]
    counts = {"vencido": 0, "por_vencer": 0, "al_dia": 0}
    for i in items:
        counts[i["status"]] += 1
    return {"counts": counts, "upcoming": [i for i in items if i["status"] != "al_dia"][:50]}


def run_alerts(db, tenant, today: date | None = None) -> int:
    """Envía alertas de vencimiento para un tenant. Devuelve cuántas se enviaron."""
    today = today or date.today()
    sent = 0
    owner_emails = [u.email for u in tenant.users if u.role in ("owner", "admin") and u.is_active]
    docs = db.scalars(select(VyDocument).where(VyDocument.tenant_id == tenant.id)).all()
    for d in docs:
        days = (d.expires_on - today).days
        reminders = d.reminder_days or DEFAULT_REMINDERS
        if days not in reminders and not (days < 0 and days % 7 == 0 and days >= -28):
            continue
        ent = db.get(VyEntity, d.entity_id)
        label = f"{d.doc_type} de {ent.name if ent else ''}".strip()
        when = "vence hoy" if days == 0 else (f"vence en {days} días" if days > 0 else f"está vencido hace {-days} días")
        subject = f"⏰ {label} {when}"
        body = email_layout(subject, f"<p><b>{label}</b> {when} (fecha: {d.expires_on.isoformat()}).</p><p>Número: {d.number or '-'}</p>")
        for to in {*(owner_emails), *([d.responsible_email] if d.responsible_email else [])}:
            key = f"vy:{d.id}:{d.expires_on}:{days}:{to}"
            if notify_once(db, key, tenant.id, "email", to, subject, lambda to=to: send_email(to, subject, body)):
                sent += 1
        if d.responsible_phone:
            key = f"vy:{d.id}:{d.expires_on}:{days}:wa"
            text = f"{label} {when} ({d.expires_on.isoformat()})."
            notify_once(db, key, tenant.id, "whatsapp", d.responsible_phone, subject, lambda: send_whatsapp(d.responsible_phone, text))
    return sent

