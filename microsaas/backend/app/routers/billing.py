import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import catalog, paypal
from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user, require_admin
from ..models import Payment, PayPalPlan, Subscription, User
from ..subscriptions import get_subscription, serialize

log = logging.getLogger("billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])

STATUS_MAP = {"ACTIVE": "active", "SUSPENDED": "past_due", "CANCELLED": "cancelled", "EXPIRED": "expired"}


class CheckoutIn(BaseModel):
    product: str
    plan: str
    interval: str = "month"


class ConfirmIn(BaseModel):
    product: str
    subscription_id: str | None = None


class CancelIn(BaseModel):
    product: str


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def find_paypal_plan(db: Session, product: str, plan: str, interval: str) -> PayPalPlan | None:
    price = catalog.plan_price(product, plan, interval)
    return db.scalar(
        select(PayPalPlan).where(
            PayPalPlan.mode == get_settings().paypal_mode,
            PayPalPlan.product == product,
            PayPalPlan.plan == plan,
            PayPalPlan.interval == interval,
            PayPalPlan.price == price,
        )
    )


def apply_paypal_state(db: Session, sub: Subscription, data: dict) -> None:
    """Sincroniza la suscripción local con el objeto de suscripción de PayPal."""
    pp_id = data.get("id")
    status = STATUS_MAP.get(data.get("status", ""))
    mapped = db.scalar(select(PayPalPlan).where(PayPalPlan.paypal_plan_id == data.get("plan_id")))
    if mapped and mapped.product == sub.product:
        sub.plan, sub.interval = mapped.plan, mapped.interval
    nbt = _parse_dt((data.get("billing_info") or {}).get("next_billing_time"))
    if nbt:
        sub.current_period_end = nbt
    if status == "active":
        old = sub.paypal_subscription_id
        if old and old != pp_id:
            # El cliente pasó a una suscripción nueva: cancelamos la anterior para no cobrar doble.
            try:
                paypal.cancel_subscription(old, "Reemplazada por un nuevo plan")
            except paypal.PayPalError as e:
                log.warning("No se pudo cancelar la suscripción anterior %s: %s", old, e)
        sub.paypal_subscription_id = pp_id
        if sub.pending_paypal_id == pp_id:
            sub.pending_paypal_id = None
        sub.status = "active"
        if not sub.current_period_end:
            sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=366 if sub.interval == "year" else 31)
    elif status and pp_id == sub.paypal_subscription_id:
        sub.status = status


def _find_sub_by_paypal(db: Session, pp_id: str | None, custom_id: str | None) -> Subscription | None:
    if pp_id:
        sub = db.scalar(select(Subscription).where(or_(Subscription.paypal_subscription_id == pp_id, Subscription.pending_paypal_id == pp_id)))
        if sub:
            return sub
    if custom_id and custom_id.isdigit():
        return db.get(Subscription, int(custom_id))
    return None


@router.get("/subscriptions")
def my_subscriptions(user: User = Depends(get_current_user)):
    return [serialize(s) for s in user.tenant.subscriptions]


@router.get("/payments")
def my_payments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).where(Payment.tenant_id == user.tenant_id).order_by(Payment.id.desc()).limit(100))
    return [{"id": p.id, "product": p.product, "amount": float(p.amount), "currency": p.currency, "status": p.status, "created_at": p.created_at} for p in rows]


@router.post("/checkout")
def checkout(data: CheckoutIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if data.interval not in ("month", "year") or not catalog.get_plan(data.product, data.plan):
        raise HTTPException(400, "Plan inválido")
    sub = get_subscription(db, user.tenant_id, data.product)
    if not sub:
        raise HTTPException(400, "Activa primero el producto")
    s = get_settings()

    if s.paypal_mode == "mock":
        # Modo desarrollo: activa sin cobrar. Nunca en un sitio público con HTTPS.
        if s.app_url.startswith("https://"):
            raise HTTPException(503, "Pagos no configurados")
        sub.plan, sub.interval, sub.status = data.plan, data.interval, "active"
        sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=366 if data.interval == "year" else 31)
        db.commit()
        return {"approve_url": f"{s.app_url}/app/billing?mock=ok", "mock": True}

    if not paypal.enabled():
        raise HTTPException(503, "Pagos no configurados")
    pp_plan = find_paypal_plan(db, data.product, data.plan, data.interval)
    if not pp_plan:
        raise HTTPException(503, "Plan no sincronizado con PayPal. Ejecuta `python -m app.cli paypal-sync`.")
    return_url = f"{s.app_url}/app/billing/return?product={data.product}"
    cancel_url = f"{s.app_url}/app/billing?cancelled=1"
    try:
        if sub.paypal_subscription_id and sub.status in ("active", "past_due"):
            res = paypal.revise_subscription(sub.paypal_subscription_id, pp_plan.paypal_plan_id, return_url, cancel_url)
            pending = sub.paypal_subscription_id
        else:
            res = paypal.create_subscription(pp_plan.paypal_plan_id, str(sub.id), return_url, cancel_url, user.email)
            pending = res["id"]
    except paypal.PayPalError as e:
        log.error("checkout error: %s", e)
        raise HTTPException(502, "No se pudo iniciar el pago con PayPal. Intenta de nuevo.")
    sub.pending_paypal_id = pending
    db.commit()
    url = paypal.approve_link(res)
    if not url:
        raise HTTPException(502, "PayPal no devolvió enlace de aprobación")
    return {"approve_url": url}


@router.post("/confirm")
def confirm(data: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = get_subscription(db, user.tenant_id, data.product)
    if not sub:
        raise HTTPException(404, "Suscripción no encontrada")
    if get_settings().paypal_mode == "mock":
        return serialize(sub)
    pp_id = data.subscription_id or sub.pending_paypal_id or sub.paypal_subscription_id
    if not pp_id:
        raise HTTPException(400, "Sin suscripción pendiente")
    try:
        info = paypal.get_subscription(pp_id)
    except paypal.PayPalError:
        raise HTTPException(502, "No se pudo verificar el pago")
    if info.get("custom_id") != str(sub.id):
        raise HTTPException(403, "La suscripción de PayPal no corresponde a esta cuenta")
    apply_paypal_state(db, sub, info)
    db.commit()
    return serialize(sub)


@router.post("/cancel")
def cancel(data: CancelIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    sub = get_subscription(db, user.tenant_id, data.product)
    if not sub:
        raise HTTPException(404, "Suscripción no encontrada")
    if sub.paypal_subscription_id and paypal.enabled():
        try:
            paypal.cancel_subscription(sub.paypal_subscription_id)
        except paypal.PayPalError as e:
            log.error("cancel error: %s", e)
            raise HTTPException(502, "No se pudo cancelar en PayPal. Intenta de nuevo.")
    sub.status = "cancelled"
    db.commit()
    return serialize(sub)


@router.post("/paypal/webhook")
async def paypal_webhook(request: Request, db: Session = Depends(get_db)):
    event = await request.json()
    headers = {k.lower(): v for k, v in request.headers.items()}
    if not paypal.verify_webhook(headers, event):
        raise HTTPException(400, "Firma inválida")
    etype = event.get("event_type", "")
    res = event.get("resource") or {}
    log.info("PayPal webhook %s %s", etype, res.get("id"))

    if etype.startswith("BILLING.SUBSCRIPTION."):
        sub = _find_sub_by_paypal(db, res.get("id"), res.get("custom_id"))
        if not sub:
            return {"ignored": True}
        if etype in ("BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.UPDATED"):
            apply_paypal_state(db, sub, res)
        elif res.get("id") == sub.paypal_subscription_id:
            if etype == "BILLING.SUBSCRIPTION.CANCELLED":
                sub.status = "cancelled"
            elif etype in ("BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED"):
                sub.status = "past_due"
            elif etype == "BILLING.SUBSCRIPTION.EXPIRED":
                sub.status = "expired"
        db.commit()

    elif etype == "PAYMENT.SALE.COMPLETED":
        pp_id = res.get("billing_agreement_id")
        sub = _find_sub_by_paypal(db, pp_id, res.get("custom"))
        if not db.scalar(select(Payment).where(Payment.provider_ref == res.get("id"))):
            amount = res.get("amount") or {}
            db.add(
                Payment(
                    tenant_id=sub.tenant_id if sub else None,
                    subscription_id=sub.id if sub else None,
                    product=sub.product if sub else None,
                    provider_ref=res.get("id"),
                    amount=Decimal(str(amount.get("total", "0"))),
                    currency=amount.get("currency", "USD"),
                    status="completed",
                    raw=res,
                )
            )
        if sub and pp_id:
            try:
                apply_paypal_state(db, sub, paypal.get_subscription(pp_id))
            except paypal.PayPalError as e:
                log.warning("No se pudo refrescar la suscripción %s: %s", pp_id, e)
        db.commit()

    elif etype == "PAYMENT.SALE.REFUNDED":
        pay = db.scalar(select(Payment).where(Payment.provider_ref == res.get("sale_id")))
        if pay:
            pay.status = "refunded"
            db.commit()

    return {"ok": True}
