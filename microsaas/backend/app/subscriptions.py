from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import catalog
from .config import get_settings
from .models import Subscription

PAST_DUE_GRACE_DAYS = 5


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def has_access(sub: Subscription | None, now: datetime | None = None) -> bool:
    if sub is None:
        return False
    now = now or datetime.now(timezone.utc)
    if sub.comp:
        return True
    if sub.status == "active":
        return True
    if sub.status == "trialing":
        return bool(sub.trial_ends_at and _aware(sub.trial_ends_at) > now)
    if sub.status in ("cancelled", "past_due"):
        end = _aware(sub.current_period_end)
        if end is None:
            return False
        grace = timedelta(days=PAST_DUE_GRACE_DAYS if sub.status == "past_due" else 0)
        return end + grace > now
    return False


def get_subscription(db: Session, tenant_id: int, product: str) -> Subscription | None:
    return db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id, Subscription.product == product))


def start_trial(db: Session, tenant_id: int, product: str) -> Subscription:
    sub = get_subscription(db, tenant_id, product)
    if sub:
        return sub
    plan = catalog.trial_plan(product)
    sub = Subscription(
        tenant_id=tenant_id,
        product=product,
        plan=plan["code"],
        status="trialing",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=get_settings().trial_days),
    )
    db.add(sub)
    db.flush()
    return sub


def limits_for(sub: Subscription) -> dict:
    plan = catalog.get_plan(sub.product, sub.plan) or catalog.trial_plan(sub.product)
    return plan["limits"]


def serialize(sub: Subscription) -> dict:
    p = catalog.get_product(sub.product) or {}
    return {
        "id": sub.id,
        "product": sub.product,
        "product_name": p.get("name", sub.product),
        "plan": sub.plan,
        "interval": sub.interval,
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at,
        "current_period_end": sub.current_period_end,
        "has_access": has_access(sub),
        "limits": limits_for(sub),
        "paypal_linked": bool(sub.paypal_subscription_id),
        "comp": sub.comp,
    }
