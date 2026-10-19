"""LineaControl: control de líneas móviles corporativas."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import Date, ForeignKey, Numeric, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin
from ..deps import Ctx, require_product
from ..notify import email_layout, notify_once, send_email

P = "lineacontrol"
OVERCHARGE_FACTOR = Decimal("1.10")


class LcLine(TenantMixin, Base):
    __tablename__ = "lc_lines"
    number: Mapped[str] = mapped_column(String(30), index=True)
    operator: Mapped[str] = mapped_column(String(60))
    plan_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    plan_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    status: Mapped[str] = mapped_column(String(20), default="activa")  # activa | suspendida | cancelada
    person_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    person_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sim_iccid: Mapped[str | None] = mapped_column(String(40), nullable=True)
    device: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contract_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class LcBill(TenantMixin, Base):
    __tablename__ = "lc_bills"
    line_id: Mapped[int] = mapped_column(ForeignKey("lc_lines.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(7))  # AAAA-MM
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    data_gb: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    minutes: Mapped[int | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


def _ser_bill(ctx: Ctx, b: LcBill) -> dict:
    line = ctx.db.get(LcLine, b.line_id)
    return to_dict(b, {"line_number": line.number if line else ""})


router = APIRouter(prefix="/api/lineacontrol")
router.include_router(
    crud_router(LcLine, P, "/lines", limit_key="lines", search=("number", "person_name", "cost_center", "operator"), filters=("status", "operator", "cost_center"), order_by=LcLine.number, csv_import=True)
)
router.include_router(crud_router(LcBill, P, "/bills", filters=("line_id", "period"), order_by=LcBill.period.desc(), serialize=_ser_bill, csv_import=True))


def analyze(db, tenant_id: int, today: date | None = None) -> dict:
    today = today or date.today()
    lines = db.scalars(select(LcLine).where(LcLine.tenant_id == tenant_id)).all()
    bills = db.scalars(select(LcBill).where(LcBill.tenant_id == tenant_id).order_by(LcBill.period)).all()
    latest: dict[int, LcBill] = {}
    for b in bills:
        latest[b.line_id] = b
    active = [ln for ln in lines if ln.status == "activa"]
    by_cc: dict[str, float] = defaultdict(float)
    monthly: dict[str, float] = defaultdict(float)
    for ln in active:
        by_cc[ln.cost_center or "Sin centro de costo"] += float(ln.plan_cost or 0)
        monthly[ln.currency] += float(ln.plan_cost or 0)
    unassigned = [to_dict(ln) for ln in active if not (ln.person_name or "").strip()]
    overcharged, unused = [], []
    for ln in active:
        b = latest.get(ln.id)
        if not b:
            continue
        if ln.plan_cost and b.amount > ln.plan_cost * OVERCHARGE_FACTOR:
            overcharged.append(to_dict(ln, {"period": b.period, "billed": float(b.amount), "extra": float(b.amount - ln.plan_cost)}))
        if (b.data_gb or 0) == 0 and (b.minutes or 0) == 0:
            unused.append(to_dict(ln, {"period": b.period, "billed": float(b.amount)}))
    ending = [to_dict(ln) for ln in active if ln.contract_end and today <= ln.contract_end <= today + timedelta(days=60)]
    potential = sum(float(ln["plan_cost"] or 0) for ln in unused) + sum(x["extra"] for x in overcharged)
    return {
        "lines_total": len(lines),
        "lines_active": len(active),
        "monthly_cost": dict(monthly),
        "by_cost_center": dict(sorted(by_cc.items(), key=lambda kv: -kv[1])),
        "unassigned": unassigned,
        "overcharged": overcharged,
        "unused": unused,
        "contracts_ending": ending,
        "potential_savings": round(potential, 2),
    }


@router.get("/dashboard")
def dashboard(ctx: Ctx = Depends(require_product(P))):
    return analyze(ctx.db, ctx.tenant_id)


def run_alerts(db, tenant, today: date | None = None) -> int:
    today = today or date.today()
    if today.weekday() != 0:
        return 0
    a = analyze(db, tenant.id, today)
    issues = len(a["unassigned"]) + len(a["overcharged"]) + len(a["unused"]) + len(a["contracts_ending"])
    if not issues:
        return 0
    subject = f"📱 LineaControl: {issues} líneas requieren revisión"
    body = email_layout(
        subject,
        f"<ul><li>Sin asignar: {len(a['unassigned'])}</li><li>Con sobrecosto: {len(a['overcharged'])}</li>"
        f"<li>Sin uso: {len(a['unused'])}</li><li>Contratos por vencer (60 días): {len(a['contracts_ending'])}</li></ul>"
        f"<p>Ahorro potencial estimado: <b>{a['potential_savings']:,.2f}</b> / mes</p>",
    )
    sent = 0
    for u in tenant.users:
        if u.role in ("owner", "admin") and u.is_active:
            if notify_once(db, f"lc:weekly:{tenant.id}:{today}:{u.email}", tenant.id, "email", u.email, subject, lambda u=u: send_email(u.email, subject, body)):
                sent += 1
    return sent
