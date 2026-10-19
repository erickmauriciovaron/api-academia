"""HelpDesk Lite: mesa de ayuda multi-cliente con SLA y reporte mensual."""

import html
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import flag_modified

from ..config import get_settings
from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin, get_db, utcnow
from ..deps import Ctx, require_product
from ..models import Tenant, User
from ..notify import email_layout, notify_once, send_email
from ..security import new_token
from ..subscriptions import get_subscription, has_access

P = "helpdesk"
DEFAULT_SLA = {"critica": 4, "alta": 8, "media": 24, "baja": 72}
OPEN_STATUSES = ("abierto", "en_progreso", "en_espera")


class HdClient(TenantMixin, Base):
    __tablename__ = "hd_clients"
    name: Mapped[str] = mapped_column(String(200))
    email_domain: Mapped[str | None] = mapped_column(String(120), nullable=True)  # asigna tickets por dominio del correo
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)


class HdAgent(TenantMixin, Base):
    __tablename__ = "hd_agents"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class HdTicket(TenantMixin, Base):
    __tablename__ = "hd_tickets"
    number: Mapped[int] = mapped_column(Integer, index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("hd_clients.id", ondelete="SET NULL"), nullable=True, index=True)
    subject: Mapped[str] = mapped_column(String(250))
    description: Mapped[str] = mapped_column(Text)
    requester_name: Mapped[str] = mapped_column(String(200))
    requester_email: Mapped[str] = mapped_column(String(254))
    priority: Mapped[str] = mapped_column(String(10), default="media")
    status: Mapped[str] = mapped_column(String(15), default="abierto", index=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    agent_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)


class HdComment(TenantMixin, Base):
    __tablename__ = "hd_comments"
    ticket_id: Mapped[int] = mapped_column(ForeignKey("hd_tickets.id", ondelete="CASCADE"), index=True)
    author_name: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    internal: Mapped[bool] = mapped_column(Boolean, default=False)
    from_requester: Mapped[bool] = mapped_column(Boolean, default=False)


def sla_hours(tenant) -> dict:
    return {**DEFAULT_SLA, **(tenant.settings or {}).get(P, {}).get("sla", {})}


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def ticket_url(t: HdTicket, tenant: Tenant) -> str:
    return f"{get_settings().app_url}/soporte/{tenant.public_key}/t/{t.public_token}"


def _next_number(db, tenant_id: int) -> int:
    return (db.scalar(select(func.max(HdTicket.number)).where(HdTicket.tenant_id == tenant_id)) or 0) + 1


def _match_client(db, tenant_id: int, email: str) -> int | None:
    domain = email.split("@")[-1].lower()
    c = db.scalar(select(HdClient).where(HdClient.tenant_id == tenant_id, func.lower(HdClient.email_domain) == domain))
    return c.id if c else None


def new_ticket(db, tenant: Tenant, data: dict) -> HdTicket:
    now = utcnow()
    prio = data.get("priority") if data.get("priority") in DEFAULT_SLA else "media"
    t = HdTicket(tenant_id=tenant.id, number=_next_number(db, tenant.id), public_token=new_token(20), created_at=now)
    for k, v in data.items():
        setattr(t, k, v)
    t.priority = prio
    t.sla_due_at = now + timedelta(hours=sla_hours(tenant)[prio])
    if not t.client_id:
        t.client_id = _match_client(db, tenant.id, t.requester_email)
    db.add(t)
    db.flush()
    return t


def _ser_ticket(ctx: Ctx, t: HdTicket) -> dict:
    agent = ctx.db.get(User, t.agent_user_id) if t.agent_user_id else None
    client = ctx.db.get(HdClient, t.client_id) if t.client_id else None
    now = utcnow()
    breached = bool(t.sla_due_at and ((_aware(t.resolved_at) or now) > _aware(t.sla_due_at)))
    return to_dict(t, {"agent_name": agent.name if agent else None, "client_name": client.name if client else None, "sla_breached": breached})


def _before_ticket(ctx: Ctx, obj: HdTicket, data: dict, creating: bool):
    if creating:
        raise HTTPException(400, "Usa POST /api/helpdesk/tickets/new")
    if "priority" in data and data["priority"] in DEFAULT_SLA and data["priority"] != obj.priority:
        data["sla_due_at"] = _aware(obj.created_at) + timedelta(hours=sla_hours(ctx.tenant)[data["priority"]])
    if data.get("status") in ("resuelto", "cerrado") and not obj.resolved_at:
        data["resolved_at"] = utcnow()
    if data.get("status") in OPEN_STATUSES:
        data["resolved_at"] = None


def _after_ticket(ctx: Ctx, obj: HdTicket, creating: bool):
    if obj.status == "resuelto":
        notify_once(
            ctx.db,
            f"hd:resolved:{obj.id}:{obj.resolved_at}",
            ctx.tenant_id,
            "email",
            obj.requester_email,
            "resuelto",
            lambda: send_email(
                obj.requester_email,
                f"[#{obj.number}] Ticket resuelto: {obj.subject}",
                email_layout(f"Ticket #{obj.number} resuelto", "<p>Si el problema persiste, responde desde el enlace.</p>", ticket_url(obj, ctx.tenant), "Ver ticket"),
            ),
        )


def _ser_agent(ctx: Ctx, a: HdAgent) -> dict:
    u = ctx.db.get(User, a.user_id)
    return to_dict(a, {"name": u.name if u else "", "email": u.email if u else ""})


router = APIRouter(prefix="/api/helpdesk")
router.include_router(crud_router(HdClient, P, "/clients", search=("name", "email_domain"), order_by=HdClient.name))
router.include_router(crud_router(HdAgent, P, "/agents", limit_key="agents", serialize=_ser_agent, admin_only_write=True))
router.include_router(
    crud_router(
        HdTicket,
        P,
        "/tickets",
        search=("subject", "requester_email", "requester_name"),
        filters=("status", "priority", "client_id", "agent_user_id"),
        readonly={"number", "public_token", "sla_due_at", "first_response_at", "resolved_at"},
        serialize=_ser_ticket,
        before_save=_before_ticket,
        after_save=_after_ticket,
    )
)


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=250)
    description: str = Field(min_length=3)
    requester_name: str = Field(min_length=2, max_length=200)
    requester_email: EmailStr
    priority: str = "media"
    category: str | None = None
    client_id: int | None = None
    agent_user_id: int | None = None


@router.post("/tickets/new", status_code=201)
def create_ticket(data: TicketIn, ctx: Ctx = Depends(require_product(P))):
    from ..crud import tenant_fk_check

    payload = data.model_dump()
    tenant_fk_check(ctx, HdTicket, payload)
    t = new_ticket(ctx.db, ctx.tenant, payload)
    ctx.db.commit()
    return _ser_ticket(ctx, t)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=20000)
    internal: bool = False


def _ticket(ctx: Ctx, tid: int) -> HdTicket:
    t = ctx.db.scalar(select(HdTicket).where(HdTicket.id == tid, HdTicket.tenant_id == ctx.tenant_id))
    if not t:
        raise HTTPException(404, "Ticket no encontrado")
    return t


@router.get("/tickets/{tid}/comments")
def list_comments(tid: int, ctx: Ctx = Depends(require_product(P))):
    t = _ticket(ctx, tid)
    return [to_dict(c) for c in ctx.db.scalars(select(HdComment).where(HdComment.ticket_id == t.id).order_by(HdComment.id))]


@router.post("/tickets/{tid}/comments", status_code=201)
def add_comment(tid: int, data: CommentIn, ctx: Ctx = Depends(require_product(P))):
    t = _ticket(ctx, tid)
    c = HdComment(tenant_id=ctx.tenant_id, ticket_id=t.id, author_name=ctx.user.name, body=data.body, internal=data.internal)
    ctx.db.add(c)
    if not data.internal:
        if not t.first_response_at:
            t.first_response_at = utcnow()
        if t.status == "abierto":
            t.status = "en_progreso"
    ctx.db.commit()
    if not data.internal:
        send_email(
            t.requester_email,
            f"[#{t.number}] {t.subject}",
            email_layout(f"Respuesta a tu ticket #{t.number}", f"<p>{html.escape(data.body).replace(chr(10), '<br>')}</p>", ticket_url(t, ctx.tenant), "Ver o responder"),
        )
    return to_dict(c)


class SlaIn(BaseModel):
    critica: int = Field(ge=1, le=720)
    alta: int = Field(ge=1, le=720)
    media: int = Field(ge=1, le=720)
    baja: int = Field(ge=1, le=720)


@router.get("/settings")
def read_settings(ctx: Ctx = Depends(require_product(P))):
    return {"sla": sla_hours(ctx.tenant), "portal_url": f"{get_settings().app_url}/soporte/{ctx.tenant.public_key}"}


@router.put("/settings")
def save_settings(data: SlaIn, ctx: Ctx = Depends(require_product(P))):
    settings = dict(ctx.tenant.settings or {})
    settings[P] = {**settings.get(P, {}), "sla": data.model_dump()}
    ctx.tenant.settings = settings
    flag_modified(ctx.tenant, "settings")
    ctx.db.commit()
    return read_settings(ctx)


@router.get("/report")
def monthly_report(month: str | None = None, ctx: Ctx = Depends(require_product(P))):
    """Reporte SLA por cliente para un mes (AAAA-MM)."""
    today = date.today()
    month = month or today.strftime("%Y-%m")
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Mes inválido, use AAAA-MM")
    end = (start + timedelta(days=32)).replace(day=1)
    tickets = ctx.db.scalars(select(HdTicket).where(HdTicket.tenant_id == ctx.tenant_id, HdTicket.created_at >= start, HdTicket.created_at < end)).all()
    clients = {c.id: c.name for c in ctx.db.scalars(select(HdClient).where(HdClient.tenant_id == ctx.tenant_id))}
    agg: dict = defaultdict(lambda: {"total": 0, "resolved": 0, "within_sla": 0, "res_hours": [], "by_priority": defaultdict(int)})
    for t in tickets:
        a = agg[clients.get(t.client_id, "Sin cliente")]
        a["total"] += 1
        a["by_priority"][t.priority] += 1
        if t.resolved_at:
            a["resolved"] += 1
            hours = (_aware(t.resolved_at) - _aware(t.created_at)).total_seconds() / 3600
            a["res_hours"].append(hours)
            if t.sla_due_at and _aware(t.resolved_at) <= _aware(t.sla_due_at):
                a["within_sla"] += 1
    rows = []
    for name, a in sorted(agg.items()):
        rows.append(
            {
                "client": name,
                "total": a["total"],
                "resolved": a["resolved"],
                "sla_pct": round(100 * a["within_sla"] / a["resolved"], 1) if a["resolved"] else None,
                "avg_resolution_hours": round(sum(a["res_hours"]) / len(a["res_hours"]), 1) if a["res_hours"] else None,
                "by_priority": dict(a["by_priority"]),
            }
        )
    return {"month": month, "rows": rows, "tenant": ctx.tenant.name}


# ---------- Portal público ----------
public = APIRouter(prefix="/api/public/helpdesk", tags=["public"])


def _portal_tenant(db, key: str) -> Tenant:
    t = db.scalar(select(Tenant).where(Tenant.public_key == key, Tenant.is_active.is_(True)))
    if not t or not has_access(get_subscription(db, t.id, P)):
        raise HTTPException(404, "Portal no disponible")
    return t


class PublicTicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=250)
    description: str = Field(min_length=3, max_length=20000)
    requester_name: str = Field(min_length=2, max_length=200)
    requester_email: EmailStr
    priority: str = "media"


@public.get("/{key}")
def portal_info(key: str, db=Depends(get_db)):
    return {"company": _portal_tenant(db, key).name}


@public.post("/{key}/tickets", status_code=201)
def portal_create(key: str, data: PublicTicketIn, db=Depends(get_db)):
    tenant = _portal_tenant(db, key)
    t = new_ticket(db, tenant, data.model_dump())
    db.commit()
    url = ticket_url(t, tenant)
    send_email(t.requester_email, f"[#{t.number}] Recibimos tu solicitud", email_layout(f"Ticket #{t.number} creado", f"<p>{html.escape(t.subject)}</p>", url, "Ver ticket"))
    for u in tenant.users:
        if u.role in ("owner", "admin") and u.is_active:
            send_email(u.email, f"Nuevo ticket #{t.number}: {t.subject}", email_layout(f"Nuevo ticket #{t.number}", f"<p>{html.escape(t.requester_name)}: {html.escape(t.subject)}</p>", f"{get_settings().app_url}/app/helpdesk", "Abrir"))
    return {"number": t.number, "token": t.public_token, "url": url}


def _public_ticket(db, key: str, token: str) -> tuple[Tenant, HdTicket]:
    tenant = _portal_tenant(db, key)
    t = db.scalar(select(HdTicket).where(HdTicket.tenant_id == tenant.id, HdTicket.public_token == token))
    if not t:
        raise HTTPException(404, "Ticket no encontrado")
    return tenant, t


@public.get("/{key}/t/{token}")
def portal_ticket(key: str, token: str, db=Depends(get_db)):
    tenant, t = _public_ticket(db, key, token)
    comments = db.scalars(select(HdComment).where(HdComment.ticket_id == t.id, HdComment.internal.is_(False)).order_by(HdComment.id))
    return {
        "company": tenant.name,
        "ticket": {k: v for k, v in to_dict(t).items() if k not in ("tenant_id", "agent_user_id", "public_token")},
        "comments": [{"author_name": c.author_name, "body": c.body, "from_requester": c.from_requester, "created_at": c.created_at} for c in comments],
    }


class PublicCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=20000)


@public.post("/{key}/t/{token}/comments", status_code=201)
def portal_comment(key: str, token: str, data: PublicCommentIn, db=Depends(get_db)):
    tenant, t = _public_ticket(db, key, token)
    db.add(HdComment(tenant_id=tenant.id, ticket_id=t.id, author_name=t.requester_name, body=data.body, from_requester=True))
    if t.status in ("resuelto", "cerrado", "en_espera"):
        t.status, t.resolved_at = "abierto", None
    db.commit()
    agent = db.get(User, t.agent_user_id) if t.agent_user_id else None
    if agent:
        send_email(agent.email, f"[#{t.number}] Nueva respuesta del solicitante", email_layout(f"Ticket #{t.number}", f"<p>{html.escape(data.body)}</p>", f"{get_settings().app_url}/app/helpdesk", "Abrir"))
    return {"ok": True}


def run_sla_alerts(db, tenant) -> int:
    now = utcnow()
    tickets = db.scalars(select(HdTicket).where(HdTicket.tenant_id == tenant.id, HdTicket.status.in_(OPEN_STATUSES), HdTicket.sla_due_at < now)).all()
    sent = 0
    for t in tickets:
        agent = db.get(User, t.agent_user_id) if t.agent_user_id else None
        recipients = {agent.email} if agent else {u.email for u in tenant.users if u.role in ("owner", "admin") and u.is_active}
        subject = f"⚠️ SLA incumplido: ticket #{t.number} ({t.priority})"
        body = email_layout(subject, f"<p>{html.escape(t.subject)} – vencía {_aware(t.sla_due_at).strftime('%Y-%m-%d %H:%M UTC')}</p>", f"{get_settings().app_url}/app/helpdesk", "Abrir")
        for to in recipients:
            if notify_once(db, f"hd:sla:{t.id}:{t.sla_due_at}:{to}", tenant.id, "email", to, subject, lambda to=to: send_email(to, subject, body)):
                sent += 1
    return sent
