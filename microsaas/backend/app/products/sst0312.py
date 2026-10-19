"""SST-0312: autoevaluación de estándares mínimos SG-SST y plan de mejoramiento."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import JSON, Date, Float, ForeignKey, Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin
from ..deps import Ctx, require_product
from ..notify import email_layout, notify_once, send_email
from . import sst_data

P = "sst0312"
VALID_ANSWERS = {"cumple", "no_cumple", "no_aplica"}


class SstCompany(TenantMixin, Base):
    __tablename__ = "sst_companies"
    name: Mapped[str] = mapped_column(String(200))
    nit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    workers: Mapped[int] = mapped_column(Integer, default=1)
    risk_level: Mapped[int] = mapped_column(Integer, default=1)  # I a V
    economic_activity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)


class SstAssessment(TenantMixin, Base):
    __tablename__ = "sst_assessments"
    company_id: Mapped[int] = mapped_column(ForeignKey("sst_companies.id", ondelete="CASCADE"), index=True)
    standard: Mapped[int] = mapped_column(Integer)  # 7 | 21 | 60
    assessed_on: Mapped[date] = mapped_column(Date, default=date.today)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)  # {code: cumple|no_cumple|no_aplica}
    observations: Mapped[dict] = mapped_column(JSON, default=dict)  # {code: texto}
    score: Mapped[float] = mapped_column(Float, default=0)
    rating: Mapped[str] = mapped_column(String(30), default="critico")
    evaluator: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class SstAction(TenantMixin, Base):
    __tablename__ = "sst_actions"
    company_id: Mapped[int] = mapped_column(ForeignKey("sst_companies.id", ondelete="CASCADE"), index=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("sst_assessments.id", ondelete="SET NULL"), nullable=True, index=True)
    item_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    description: Mapped[str] = mapped_column(Text)
    responsible: Mapped[str | None] = mapped_column(String(200), nullable=True)
    responsible_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente | en_curso | cerrada


def _ser_company(ctx: Ctx, c: SstCompany) -> dict:
    last = ctx.db.scalar(select(SstAssessment).where(SstAssessment.company_id == c.id).order_by(SstAssessment.assessed_on.desc(), SstAssessment.id.desc()))
    return to_dict(c, {"standard": sst_data.standard_for(c.workers, c.risk_level), "last_score": last.score if last else None, "last_rating": last.rating if last else None})


def _before_assessment(ctx: Ctx, obj, data: dict, creating: bool):
    std = data.get("standard", obj.standard)
    if std not in (7, 21, 60):
        raise HTTPException(400, "Estándar inválido (7, 21 o 60)")
    answers = data.get("answers", obj.answers) or {}
    valid_codes = {i["code"] for i in sst_data.items_for(std)}
    answers = {k: v for k, v in answers.items() if k in valid_codes and v in VALID_ANSWERS}
    data["answers"] = answers
    data["score"], data["rating"] = sst_data.score(std, answers)
    if creating:
        data.setdefault("assessed_on", date.today())
        data.setdefault("evaluator", ctx.user.name)


router = APIRouter(prefix="/api/sst0312")
router.include_router(crud_router(SstCompany, P, "/companies", limit_key="companies", search=("name", "nit"), order_by=SstCompany.name, serialize=_ser_company))
router.include_router(
    crud_router(SstAssessment, P, "/assessments", filters=("company_id",), order_by=SstAssessment.assessed_on.desc(), readonly={"score", "rating"}, before_save=_before_assessment)
)
router.include_router(crud_router(SstAction, P, "/actions", filters=("company_id", "assessment_id", "status"), order_by=SstAction.due_date))


@router.get("/standards/{standard}")
def standard_items(standard: int, ctx: Ctx = Depends(require_product(P))):
    if standard not in (7, 21, 60):
        raise HTTPException(404, "Estándar inválido")
    return sst_data.items_for(standard)


class PlanIn(BaseModel):
    responsible: str | None = None
    responsible_email: str | None = None
    days: int = 90


@router.post("/assessments/{aid}/plan")
def generate_plan(aid: int, data: PlanIn, ctx: Ctx = Depends(require_product(P))):
    a = ctx.db.scalar(select(SstAssessment).where(SstAssessment.id == aid, SstAssessment.tenant_id == ctx.tenant_id))
    if not a:
        raise HTTPException(404, "No encontrada")
    existing = {x.item_code for x in ctx.db.scalars(select(SstAction).where(SstAction.assessment_id == a.id))}
    created = 0
    for item in sst_data.items_for(a.standard):
        if a.answers.get(item["code"]) == "no_cumple" and item["code"] not in existing:
            obs = (a.observations or {}).get(item["code"])
            ctx.db.add(
                SstAction(
                    tenant_id=ctx.tenant_id,
                    company_id=a.company_id,
                    assessment_id=a.id,
                    item_code=item["code"],
                    description=f"Implementar: {item['text']}" + (f". Observación: {obs}" if obs else ""),
                    responsible=data.responsible,
                    responsible_email=data.responsible_email,
                    due_date=date.today() + timedelta(days=max(1, min(data.days, 365))),
                )
            )
            created += 1
    ctx.db.commit()
    return {"created": created}


@router.get("/assessments/{aid}/report")
def report(aid: int, ctx: Ctx = Depends(require_product(P))):
    a = ctx.db.scalar(select(SstAssessment).where(SstAssessment.id == aid, SstAssessment.tenant_id == ctx.tenant_id))
    if not a:
        raise HTTPException(404, "No encontrada")
    company = ctx.db.get(SstCompany, a.company_id)
    items = sst_data.items_for(a.standard)
    groups: dict[str, dict] = {}
    for i in items:
        g = groups.setdefault(i["group"], {"cycle": i["cycle"], "max": 0.0, "obtained": 0.0})
        g["max"] += i["weight"]
        if a.answers.get(i["code"]) in ("cumple", "no_aplica"):
            g["obtained"] += i["weight"]
    actions = ctx.db.scalars(select(SstAction).where(SstAction.assessment_id == a.id).order_by(SstAction.due_date)).all()
    return {
        "company": to_dict(company),
        "assessment": to_dict(a),
        "items": [{**i, "answer": a.answers.get(i["code"]), "observation": (a.observations or {}).get(i["code"])} for i in items],
        "groups": {k: {**v, "max": round(v["max"], 2), "obtained": round(v["obtained"], 2)} for k, v in groups.items()},
        "actions": [to_dict(x) for x in actions],
        "tenant": ctx.tenant.name,
    }


def run_alerts(db, tenant, today: date | None = None) -> int:
    today = today or date.today()
    actions = db.scalars(
        select(SstAction).where(SstAction.tenant_id == tenant.id, SstAction.status != "cerrada", SstAction.due_date.is_not(None), SstAction.due_date <= today + timedelta(days=7))
    ).all()
    sent = 0
    for x in actions:
        days = (x.due_date - today).days
        if days not in (7, 1, 0, -7):
            continue
        company = db.get(SstCompany, x.company_id)
        subject = f"🦺 Acción SG-SST {'vence' if days >= 0 else 'vencida'}: {company.name if company else ''} – {x.item_code or ''}"
        body = email_layout(subject, f"<p>{x.description}</p><p>Fecha límite: {x.due_date.isoformat()}</p>")
        recipients = {u.email for u in tenant.users if u.role in ("owner", "admin") and u.is_active}
        if x.responsible_email:
            recipients.add(x.responsible_email)
        for to in recipients:
            if notify_once(db, f"sst:{x.id}:{x.due_date}:{days}:{to}", tenant.id, "email", to, subject, lambda to=to: send_email(to, subject, body)):
                sent += 1
    return sent
