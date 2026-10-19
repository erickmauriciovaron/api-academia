"""AssetTrack: inventario de activos TI con actas de entrega/devolución firmadas."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from ..config import get_settings
from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin, get_db, utcnow
from ..deps import Ctx, require_product
from ..models import Tenant
from ..notify import email_layout, notify_once, send_email
from ..security import new_token

P = "assettrack"


class AtPerson(TenantMixin, Base):
    __tablename__ = "at_people"
    name: Mapped[str] = mapped_column(String(200))
    document_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position: Mapped[str | None] = mapped_column(String(100), nullable=True)


class AtAsset(TenantMixin, Base):
    __tablename__ = "at_assets"
    tag: Mapped[str] = mapped_column(String(60), index=True)
    category: Mapped[str] = mapped_column(String(60), default="Portátil")
    brand: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    serial: Mapped[str | None] = mapped_column(String(120), nullable=True)
    specs: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="disponible")  # disponible | asignado | reparacion | baja
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("at_people.id", ondelete="SET NULL"), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AtEvent(TenantMixin, Base):
    """Hoja de vida: mantenimientos, reparaciones y notas."""

    __tablename__ = "at_events"
    asset_id: Mapped[int] = mapped_column(ForeignKey("at_assets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="mantenimiento")
    event_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)


class AtHandover(TenantMixin, Base):
    """Acta de entrega o devolución."""

    __tablename__ = "at_handovers"
    asset_id: Mapped[int] = mapped_column(ForeignKey("at_assets.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("at_people.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="entrega")  # entrega | devolucion
    condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessories: Mapped[str | None] = mapped_column(Text, nullable=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)  # data URL PNG
    signer_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    delivered_by: Mapped[str | None] = mapped_column(String(200), nullable=True)


def _ser_asset(ctx: Ctx, a: AtAsset) -> dict:
    person = ctx.db.get(AtPerson, a.person_id) if a.person_id else None
    return to_dict(a, {"person_name": person.name if person else None})


def _before_asset(ctx: Ctx, obj, data: dict, creating: bool):
    if "person_id" in data:
        if data["person_id"] and data.get("status", obj.status) in (None, "disponible"):
            data["status"] = "asignado"
        if not data["person_id"] and (data.get("status") or obj.status) == "asignado":
            data["status"] = "disponible"


router = APIRouter(prefix="/api/assettrack")
router.include_router(crud_router(AtPerson, P, "/people", search=("name", "document_id", "email", "area"), order_by=AtPerson.name, csv_import=True))
router.include_router(
    crud_router(
        AtAsset,
        P,
        "/assets",
        limit_key="assets",
        search=("tag", "serial", "brand", "model"),
        filters=("status", "category", "person_id"),
        order_by=AtAsset.tag,
        serialize=_ser_asset,
        before_save=_before_asset,
        csv_import=True,
    )
)
router.include_router(crud_router(AtEvent, P, "/events", filters=("asset_id",), order_by=AtEvent.event_date.desc()))


def _handover_dict(db, h: AtHandover, include_signature: bool = True) -> dict:
    asset = db.get(AtAsset, h.asset_id)
    person = db.get(AtPerson, h.person_id)
    tenant = db.get(Tenant, h.tenant_id)
    d = to_dict(h)
    if not include_signature:
        d.pop("signature", None)
    d["sign_url"] = f"{get_settings().app_url}/firmar/{h.token}"
    d["asset"] = to_dict(asset) if asset else None
    d["person"] = to_dict(person) if person else None
    d["company"] = tenant.name if tenant else ""
    return d


class HandoverIn(BaseModel):
    asset_id: int
    person_id: int
    kind: str = Field(default="entrega", pattern="^(entrega|devolucion)$")
    condition: str | None = None
    accessories: str | None = None
    send_email: bool = True


@router.get("/handovers")
def list_handovers(asset_id: int | None = None, ctx: Ctx = Depends(require_product(P))):
    q = select(AtHandover).where(AtHandover.tenant_id == ctx.tenant_id).order_by(AtHandover.id.desc()).limit(300)
    if asset_id:
        q = q.where(AtHandover.asset_id == asset_id)
    return [_handover_dict(ctx.db, h, include_signature=False) for h in ctx.db.scalars(q)]


@router.get("/handovers/{hid}")
def get_handover(hid: int, ctx: Ctx = Depends(require_product(P))):
    h = ctx.db.scalar(select(AtHandover).where(AtHandover.id == hid, AtHandover.tenant_id == ctx.tenant_id))
    if not h:
        raise HTTPException(404, "No encontrado")
    return _handover_dict(ctx.db, h)


@router.post("/handovers", status_code=201)
def create_handover(data: HandoverIn, ctx: Ctx = Depends(require_product(P))):
    asset = ctx.db.scalar(select(AtAsset).where(AtAsset.id == data.asset_id, AtAsset.tenant_id == ctx.tenant_id))
    person = ctx.db.scalar(select(AtPerson).where(AtPerson.id == data.person_id, AtPerson.tenant_id == ctx.tenant_id))
    if not asset or not person:
        raise HTTPException(400, "Activo o persona inválidos")
    h = AtHandover(
        tenant_id=ctx.tenant_id,
        asset_id=asset.id,
        person_id=person.id,
        kind=data.kind,
        condition=data.condition,
        accessories=data.accessories,
        token=new_token(24),
        delivered_by=ctx.user.name,
    )
    ctx.db.add(h)
    if data.kind == "entrega":
        asset.person_id, asset.status = person.id, "asignado"
    else:
        asset.person_id, asset.status = None, "disponible"
    ctx.db.commit()
    out = _handover_dict(ctx.db, h)
    if data.send_email and person.email:
        title = "Acta de entrega" if data.kind == "entrega" else "Acta de devolución"
        send_email(
            person.email,
            f"{title} - {asset.tag}",
            email_layout(title, f"<p>Hola {person.name}, por favor revisa y firma el acta del equipo {asset.tag}.</p>", out["sign_url"], "Revisar y firmar"),
        )
    return out


# ---------- Firma pública (sin sesión) ----------
public = APIRouter(prefix="/api/public/assettrack", tags=["public"])


class SignIn(BaseModel):
    signer_name: str = Field(min_length=3, max_length=200)
    signature: str = Field(min_length=100, max_length=400_000)


@public.get("/handover/{token}")
def public_handover(token: str, db=Depends(get_db)):
    h = db.scalar(select(AtHandover).where(AtHandover.token == token))
    if not h:
        raise HTTPException(404, "Acta no encontrada")
    return _handover_dict(db, h)


@public.post("/handover/{token}/sign")
def public_sign(token: str, data: SignIn, request: Request, db=Depends(get_db)):
    h = db.scalar(select(AtHandover).where(AtHandover.token == token))
    if not h:
        raise HTTPException(404, "Acta no encontrada")
    if h.signed_at:
        raise HTTPException(409, "El acta ya fue firmada")
    if not data.signature.startswith("data:image/png;base64,"):
        raise HTTPException(400, "Firma inválida")
    h.signer_name = data.signer_name
    h.signature = data.signature
    h.signed_at = utcnow()
    h.signer_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()[:64]
    db.commit()
    return _handover_dict(db, h)


def run_alerts(db, tenant, today: date | None = None) -> int:
    """Alerta semanal (lunes) de garantías que vencen en los próximos 30 días."""
    today = today or date.today()
    if today.weekday() != 0:
        return 0
    assets = db.scalars(
        select(AtAsset).where(
            AtAsset.tenant_id == tenant.id,
            AtAsset.warranty_until.is_not(None),
            AtAsset.warranty_until >= today,
            AtAsset.warranty_until <= today + timedelta(days=30),
            AtAsset.status != "baja",
        )
    ).all()
    if not assets:
        return 0
    rows = "".join(f"<li>{a.tag} – {a.brand or ''} {a.model or ''}: {a.warranty_until.isoformat()}</li>" for a in assets)
    subject = f"💻 {len(assets)} garantías vencen en 30 días"
    body = email_layout(subject, f"<ul>{rows}</ul>")
    sent = 0
    for u in tenant.users:
        if u.role in ("owner", "admin") and u.is_active:
            if notify_once(db, f"at:warranty:{tenant.id}:{today}:{u.email}", tenant.id, "email", u.email, subject, lambda u=u: send_email(u.email, subject, body)):
                sent += 1
    return sent
