"""Panel del superadministrador (dueño de la plataforma)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import catalog
from ..db import get_db
from ..deps import require_superadmin
from ..models import Payment, Subscription, Tenant, User
from ..subscriptions import has_access, serialize

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_superadmin)])


class SubPatch(BaseModel):
    plan: str | None = None
    status: str | None = None
    extend_trial_days: int | None = None
    comp: bool | None = None


class TenantPatch(BaseModel):
    is_active: bool


def _monthly_value(sub: Subscription) -> float:
    if sub.status != "active" or sub.comp:
        return 0.0
    try:
        price = float(catalog.plan_price(sub.product, sub.plan, sub.interval))
    except KeyError:
        return 0.0
    return price / 12 if sub.interval == "year" else price


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    subs = db.scalars(select(Subscription)).all()
    now = datetime.now(timezone.utc)
    by_product = {}
    for slug, p in catalog.PRODUCTS.items():
        rows = [s for s in subs if s.product == slug]
        by_product[slug] = {
            "name": p["name"],
            "trialing": sum(1 for s in rows if s.status == "trialing" and has_access(s, now)),
            "active": sum(1 for s in rows if s.status == "active"),
            "churned": sum(1 for s in rows if s.status in ("cancelled", "expired")),
            "mrr": round(sum(_monthly_value(s) for s in rows), 2),
        }
    since = now - timedelta(days=30)
    revenue_30d = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == "completed", Payment.created_at >= since))
    return {
        "tenants": db.scalar(select(func.count(Tenant.id))),
        "users": db.scalar(select(func.count(User.id))),
        "mrr": round(sum(v["mrr"] for v in by_product.values()), 2),
        "revenue_30d": float(revenue_30d or 0),
        "by_product": by_product,
    }


@router.get("/tenants")
def tenants(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Tenant).order_by(Tenant.id.desc()).limit(500)
    if q:
        stmt = stmt.where(func.lower(Tenant.name).like(f"%{q.lower()}%"))
    out = []
    for t in db.scalars(stmt):
        owner = next((u for u in t.users if u.role == "owner"), None)
        out.append(
            {
                "id": t.id,
                "name": t.name,
                "country": t.country,
                "is_active": t.is_active,
                "created_at": t.created_at,
                "owner": {"name": owner.name, "email": owner.email} if owner else None,
                "users": len(t.users),
                "subscriptions": [serialize(s) for s in t.subscriptions],
            }
        )
    return out


@router.patch("/tenants/{tenant_id}")
def patch_tenant(tenant_id: int, data: TenantPatch, db: Session = Depends(get_db)):
    t = db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "No encontrado")
    t.is_active = data.is_active
    db.commit()
    return {"ok": True}


@router.patch("/subscriptions/{sub_id}")
def patch_subscription(sub_id: int, data: SubPatch, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if not sub:
        raise HTTPException(404, "No encontrado")
    if data.plan:
        if not catalog.get_plan(sub.product, data.plan):
            raise HTTPException(400, "Plan inválido")
        sub.plan = data.plan
    if data.status:
        if data.status not in ("trialing", "active", "past_due", "cancelled", "expired"):
            raise HTTPException(400, "Estado inválido")
        sub.status = data.status
    if data.extend_trial_days:
        base = sub.trial_ends_at if sub.trial_ends_at else datetime.now(timezone.utc)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        sub.trial_ends_at = max(base, datetime.now(timezone.utc)) + timedelta(days=data.extend_trial_days)
        sub.status = "trialing" if sub.status != "active" else sub.status
    if data.comp is not None:
        sub.comp = data.comp
    db.commit()
    return serialize(sub)


@router.get("/payments")
def payments(db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).order_by(Payment.id.desc()).limit(300))
    tenants = {t.id: t.name for t in db.scalars(select(Tenant))}
    return [
        {
            "id": p.id,
            "tenant": tenants.get(p.tenant_id),
            "product": p.product,
            "amount": float(p.amount),
            "currency": p.currency,
            "status": p.status,
            "ref": p.provider_ref,
            "created_at": p.created_at,
        }
        for p in rows
    ]
