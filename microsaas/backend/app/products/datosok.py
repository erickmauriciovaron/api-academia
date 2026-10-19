"""DatosOK: autorizaciones de tratamiento de datos y solicitudes de titulares (Ley 1581 de 2012, Colombia)."""

import html
from datetime import date, datetime, timedelta, timezone

import holidays
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, String, Text, func, select, update
from sqlalchemy.orm import Mapped, mapped_column

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin, get_db, utcnow
from ..deps import Ctx, require_product
from ..models import Tenant
from ..notify import email_layout, notify_once, send_email
from ..security import new_token, sha256
from ..subscriptions import get_subscription, has_access, limits_for

P = "datosok"
TERMS = {"consulta": 10, "reclamo": 15, "actualizacion": 15, "rectificacion": 15, "supresion": 15, "revocatoria": 15}


def add_business_days(start: date, n: int) -> date:
    co = holidays.Colombia(years=range(start.year, start.year + 2))
    d, added = start, 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in co:
            added += 1
    return d


def business_days_between(start: date, end: date) -> int:
    if end <= start:
        return -business_days_between(end, start) if end < start else 0
    co = holidays.Colombia(years=range(start.year, end.year + 1))
    d, n = start, 0
    while d < end:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in co:
            n += 1
    return n


class DoPolicy(TenantMixin, Base):
    __tablename__ = "do_policies"
    version: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200), default="Autorización de tratamiento de datos personales")
    text: Mapped[str] = mapped_column(Text)  # texto de la autorización o resumen
    policy_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    purposes: Mapped[list] = mapped_column(JSON, default=list)  # [{"key","label","required"}]
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class DoConsent(TenantMixin, Base):
    __tablename__ = "do_consents"
    policy_id: Mapped[int] = mapped_column(ForeignKey("do_policies.id", ondelete="RESTRICT"), index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(10), default="CC")
    doc_number: Mapped[str] = mapped_column(String(40), index=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    purposes_accepted: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(20), default="formulario")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    evidence_hash: Mapped[str] = mapped_column(String(64))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DoRequest(TenantMixin, Base):
    __tablename__ = "do_requests"
    radicado: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(200))
    doc_number: Mapped[str] = mapped_column(String(40))
    email: Mapped[str] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="recibida")  # recibida | en_tramite | respondida
    received_on: Mapped[date] = mapped_column(Date)
    due_on: Mapped[date] = mapped_column(Date, index=True)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def _ser_req(ctx: Ctx, r: DoRequest) -> dict:
    left = business_days_between(date.today(), r.due_on) if r.status != "respondida" else None
    return to_dict(r, {"business_days_left": left})


def _before_policy(ctx: Ctx, obj, data: dict, creating: bool):
    if data.get("is_current"):
        ctx.db.execute(update(DoPolicy).where(DoPolicy.tenant_id == ctx.tenant_id).values(is_current=False))


def _consents_this_month(ctx_or_db, tenant_id: int) -> int:
    db = ctx_or_db.db if isinstance(ctx_or_db, Ctx) else ctx_or_db
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(select(func.count(DoConsent.id)).where(DoConsent.tenant_id == tenant_id, DoConsent.created_at >= start)) or 0


def _before_consent(ctx: Ctx, obj, data: dict, creating: bool):
    if creating:
        data.setdefault("source", "manual")
        data["evidence_hash"] = sha256(f"{ctx.tenant_id}|{data.get('doc_number')}|{data.get('policy_id')}|{utcnow().isoformat()}|manual")


router = APIRouter(prefix="/api/datosok")
router.include_router(crud_router(DoPolicy, P, "/policies", order_by=DoPolicy.id.desc(), before_save=_before_policy, admin_only_write=True))
router.include_router(
    crud_router(
        DoConsent,
        P,
        "/consents",
        limit_key="consents_month",
        limit_count=lambda ctx: _consents_this_month(ctx, ctx.tenant_id),
        search=("full_name", "doc_number", "email"),
        readonly={"evidence_hash", "ip", "user_agent"},
        before_save=_before_consent,
    )
)
router.include_router(
    crud_router(
        DoRequest,
        P,
        "/requests",
        search=("radicado", "full_name", "doc_number"),
        filters=("status", "kind"),
        order_by=DoRequest.due_on,
        readonly={"radicado", "received_on", "due_on", "responded_at"},
        serialize=_ser_req,
    )
)


class RespondIn(BaseModel):
    response: str = Field(min_length=10)


@router.post("/requests/{rid}/respond")
def respond(rid: int, data: RespondIn, ctx: Ctx = Depends(require_product(P))):
    r = ctx.db.scalar(select(DoRequest).where(DoRequest.id == rid, DoRequest.tenant_id == ctx.tenant_id))
    if not r:
        raise HTTPException(404, "No encontrada")
    r.response, r.status, r.responded_at = data.response, "respondida", utcnow()
    ctx.db.commit()
    body = "".join(f"<p>{html.escape(x)}</p>" for x in data.response.split("\n"))
    send_email(r.email, f"Respuesta a su solicitud {r.radicado}", email_layout(f"Respuesta a su solicitud {r.radicado}", body))
    return _ser_req(ctx, r)


@router.get("/stats")
def stats(ctx: Ctx = Depends(require_product(P))):
    open_reqs = ctx.db.scalars(select(DoRequest).where(DoRequest.tenant_id == ctx.tenant_id, DoRequest.status != "respondida")).all()
    today = date.today()
    return {
        "consents_total": ctx.db.scalar(select(func.count(DoConsent.id)).where(DoConsent.tenant_id == ctx.tenant_id)),
        "consents_month": _consents_this_month(ctx, ctx.tenant_id),
        "requests_open": len(open_reqs),
        "requests_overdue": sum(1 for r in open_reqs if r.due_on < today),
        "public_key": ctx.tenant.public_key,
    }


# ---------- Endpoints públicos ----------
public = APIRouter(prefix="/api/public/datosok", tags=["public"])


def _public_tenant(db, key: str) -> Tenant:
    t = db.scalar(select(Tenant).where(Tenant.public_key == key, Tenant.is_active.is_(True)))
    sub = get_subscription(db, t.id, P) if t else None
    if not t or not has_access(sub):
        raise HTTPException(404, "Formulario no disponible")
    return t


def _current_policy(db, tenant_id: int) -> DoPolicy:
    pol = db.scalar(select(DoPolicy).where(DoPolicy.tenant_id == tenant_id, DoPolicy.is_current.is_(True)))
    if not pol:
        raise HTTPException(404, "La empresa aún no publica su autorización")
    return pol


@public.get("/{key}")
def public_form(key: str, db=Depends(get_db)):
    t = _public_tenant(db, key)
    try:
        pol = to_dict(_current_policy(db, t.id))
    except HTTPException:
        pol = None
    return {"company": t.name, "policy": pol, "terms": TERMS}


class ConsentIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=200)
    doc_type: str = Field(default="CC", max_length=10)
    doc_number: str = Field(min_length=3, max_length=40)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    purposes_accepted: list[str] = []
    accept: bool


@public.post("/{key}/consent", status_code=201)
def public_consent(key: str, data: ConsentIn, request: Request, db=Depends(get_db)):
    t = _public_tenant(db, key)
    pol = _current_policy(db, t.id)
    if not data.accept:
        raise HTTPException(400, "Debe aceptar la autorización")
    valid = {p["key"] for p in pol.purposes or []}
    required = {p["key"] for p in pol.purposes or [] if p.get("required")}
    accepted = [p for p in data.purposes_accepted if p in valid]
    if not required.issubset(accepted):
        raise HTTPException(400, "Faltan finalidades obligatorias")
    limit = limits_for(get_subscription(db, t.id, P)).get("consents_month")
    if limit is not None and _consents_this_month(db, t.id) >= limit:
        raise HTTPException(429, "El formulario alcanzó su límite mensual. Intente más tarde.")
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()[:64]
    ua = (request.headers.get("user-agent") or "")[:400]
    now = utcnow()
    c = DoConsent(
        tenant_id=t.id,
        policy_id=pol.id,
        full_name=data.full_name,
        doc_type=data.doc_type,
        doc_number=data.doc_number,
        email=data.email,
        phone=data.phone,
        purposes_accepted=accepted,
        source="formulario",
        ip=ip,
        user_agent=ua,
        evidence_hash=sha256(f"{t.id}|{data.doc_number}|{pol.id}|{pol.version}|{sorted(accepted)}|{ip}|{ua}|{now.isoformat()}"),
        created_at=now,
    )
    db.add(c)
    db.commit()
    if data.email:
        send_email(
            data.email,
            f"Constancia de autorización - {t.name}",
            email_layout(
                "Constancia de autorización",
                f"<p>{html.escape(data.full_name)}, registramos su autorización de tratamiento de datos para {html.escape(t.name)} "
                f"(versión {html.escape(pol.version)}) el {now.strftime('%Y-%m-%d %H:%M UTC')}.</p><p>Código de evidencia: {c.evidence_hash[:16]}</p>",
            ),
        )
    return {"ok": True, "evidence": c.evidence_hash[:16], "created_at": now}


class RequestIn(BaseModel):
    kind: str
    full_name: str = Field(min_length=3, max_length=200)
    doc_number: str = Field(min_length=3, max_length=40)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    description: str = Field(min_length=10, max_length=5000)


@public.post("/{key}/request", status_code=201)
def public_request(key: str, data: RequestIn, db=Depends(get_db)):
    t = _public_tenant(db, key)
    if data.kind not in TERMS:
        raise HTTPException(400, "Tipo de solicitud inválido")
    today = date.today()
    radicado = f"HD-{today.strftime('%y%m')}-{new_token(4).upper().replace('-', 'X').replace('_', 'Y')[:6]}"
    r = DoRequest(tenant_id=t.id, radicado=radicado, received_on=today, due_on=add_business_days(today, TERMS[data.kind]), **data.model_dump())
    db.add(r)
    db.commit()
    send_email(
        data.email,
        f"Radicado {radicado} - {t.name}",
        email_layout(
            f"Recibimos su solicitud {radicado}",
            f"<p>Su {data.kind} fue recibida por {html.escape(t.name)}. Fecha máxima de respuesta: <b>{r.due_on.isoformat()}</b> ({TERMS[data.kind]} días hábiles).</p>",
        ),
    )
    for u in t.users:
        if u.role in ("owner", "admin") and u.is_active:
            send_email(u.email, f"Nueva solicitud Habeas Data {radicado}", email_layout(f"Nueva {data.kind}: {radicado}", f"<p>{html.escape(data.full_name)} – vence {r.due_on.isoformat()}</p>"))
    return {"radicado": radicado, "due_on": r.due_on}


@public.get("/{key}/request/{radicado}")
def public_request_status(key: str, radicado: str, doc: str, db=Depends(get_db)):
    t = _public_tenant(db, key)
    r = db.scalar(select(DoRequest).where(DoRequest.tenant_id == t.id, DoRequest.radicado == radicado.upper(), DoRequest.doc_number == doc))
    if not r:
        raise HTTPException(404, "No encontrada")
    return {"radicado": r.radicado, "status": r.status, "due_on": r.due_on, "response": r.response if r.status == "respondida" else None}


def run_alerts(db, tenant, today: date | None = None) -> int:
    today = today or date.today()
    reqs = db.scalars(select(DoRequest).where(DoRequest.tenant_id == tenant.id, DoRequest.status != "respondida")).all()
    due = [r for r in reqs if business_days_between(today, r.due_on) <= 3]
    if not due:
        return 0
    rows = "".join(f"<li>{r.radicado} ({r.kind}) – {html.escape(r.full_name)} – vence {r.due_on.isoformat()}</li>" for r in due)
    subject = f"🛡️ {len(due)} solicitudes de titulares por vencer o vencidas"
    body = email_layout(subject, f"<ul>{rows}</ul>")
    sent = 0
    for u in tenant.users:
        if u.role in ("owner", "admin") and u.is_active:
            if notify_once(db, f"do:due:{tenant.id}:{today}:{u.email}", tenant.id, "email", u.email, subject, lambda u=u: send_email(u.email, subject, body)):
                sent += 1
    return sent
