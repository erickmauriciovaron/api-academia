from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app import paypal
from app.config import get_settings
from app.db import SessionLocal
from app.models import Payment, PayPalPlan, Subscription


def _setup_plan(db, product="venceya", plan="pro", interval="month", price="19.00", pid="P-TEST-PRO"):
    db.query(PayPalPlan).filter_by(mode="sandbox", product=product, plan=plan, interval=interval).delete()
    db.query(PayPalPlan).filter_by(paypal_plan_id=pid).delete()
    db.add(PayPalPlan(mode="sandbox", product=product, plan=plan, interval=interval, price=Decimal(price), paypal_product_id="PROD-1", paypal_plan_id=pid))
    db.commit()


def test_paypal_checkout_confirm_and_webhooks(client, signup, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "paypal_mode", "sandbox")
    monkeypatch.setattr(s, "paypal_client_id", "id")
    monkeypatch.setattr(s, "paypal_client_secret", "secret")
    h, data = signup("venceya")
    db = SessionLocal()
    _setup_plan(db)
    sub = db.query(Subscription).filter_by(tenant_id=data["user"]["tenant"]["id"], product="venceya").one()

    calls = {}

    def fake_create(plan_id, custom_id, return_url, cancel_url, email=None):
        calls["create"] = (plan_id, custom_id)
        return {"id": "I-SUB1", "links": [{"rel": "approve", "href": "https://paypal.test/approve"}]}

    monkeypatch.setattr(paypal, "create_subscription", fake_create)
    r = client.post("/api/billing/checkout", json={"product": "venceya", "plan": "pro", "interval": "month"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["approve_url"] == "https://paypal.test/approve"
    assert calls["create"] == ("P-TEST-PRO", str(sub.id))

    # Retorno desde PayPal: verificamos con la API
    monkeypatch.setattr(
        paypal,
        "get_subscription",
        lambda sid: {"id": sid, "status": "ACTIVE", "custom_id": str(sub.id), "plan_id": "P-TEST-PRO", "billing_info": {"next_billing_time": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}},
    )
    r = client.post("/api/billing/confirm", json={"product": "venceya", "subscription_id": "I-SUB1"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["paypal_linked"]

    # Otra cuenta no puede reclamar la suscripción ajena
    h2, _ = signup("venceya")
    assert client.post("/api/billing/confirm", json={"product": "venceya", "subscription_id": "I-SUB1"}, headers=h2).status_code == 403

    # Webhooks
    monkeypatch.setattr(paypal, "verify_webhook", lambda headers, event: True)
    sale = {"event_type": "PAYMENT.SALE.COMPLETED", "resource": {"id": "SALE-1", "billing_agreement_id": "I-SUB1", "amount": {"total": "19.00", "currency": "USD"}}}
    assert client.post("/api/billing/paypal/webhook", json=sale).status_code == 200
    assert client.post("/api/billing/paypal/webhook", json=sale).status_code == 200  # duplicado
    db.expire_all()
    pays = db.query(Payment).filter_by(provider_ref="SALE-1").all()
    assert len(pays) == 1 and pays[0].tenant_id == sub.tenant_id

    client.post("/api/billing/paypal/webhook", json={"event_type": "BILLING.SUBSCRIPTION.SUSPENDED", "resource": {"id": "I-SUB1"}})
    db.expire_all()
    assert db.get(Subscription, sub.id).status == "past_due"

    client.post("/api/billing/paypal/webhook", json={"event_type": "BILLING.SUBSCRIPTION.CANCELLED", "resource": {"id": "I-SUB1"}})
    db.expire_all()
    assert db.get(Subscription, sub.id).status == "cancelled"
    # Cancelada pero con periodo pagado vigente -> sigue con acceso
    assert client.get("/api/venceya/entities", headers=h).status_code == 200

    monkeypatch.setattr(paypal, "verify_webhook", lambda headers, event: False)
    assert client.post("/api/billing/paypal/webhook", json=sale).status_code == 400
    db.close()


def test_checkout_without_synced_plan(client, signup, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "paypal_mode", "sandbox")
    monkeypatch.setattr(s, "paypal_client_id", "id")
    monkeypatch.setattr(s, "paypal_client_secret", "secret")
    h, _ = signup("helpdesk")
    db = SessionLocal()
    db.query(PayPalPlan).filter_by(mode="sandbox", product="helpdesk").delete()
    db.commit()
    db.close()
    r = client.post("/api/billing/checkout", json={"product": "helpdesk", "plan": "business", "interval": "year"}, headers=h)
    assert r.status_code == 503
