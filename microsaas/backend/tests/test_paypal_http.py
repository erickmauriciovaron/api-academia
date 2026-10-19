"""Cliente PayPal y `paypal-sync` contra una API de PayPal simulada a nivel HTTP."""

import httpx
import pytest

from app import catalog, cli, paypal
from app.config import get_settings
from app.db import SessionLocal
from app.models import PayPalPlan


class FakePayPal:
    def __init__(self):
        self.calls = []
        self.token_calls = 0
        self.n = 0

    def post(self, url, auth=None, data=None, timeout=None):
        assert url.startswith("https://api-m.sandbox.paypal.com/v1/oauth2/token")
        assert auth == ("cid", "csecret") and data == {"grant_type": "client_credentials"}
        self.token_calls += 1
        return httpx.Response(200, json={"access_token": "A21", "expires_in": 32400}, request=httpx.Request("POST", url))

    def request(self, method, url, json=None, headers=None, timeout=None):
        assert headers["Authorization"] == "Bearer A21"
        path = url.replace("https://api-m.sandbox.paypal.com", "")
        self.calls.append((method, path, json))
        self.n += 1
        req = httpx.Request(method, url)
        if path == "/v1/catalogs/products":
            return httpx.Response(201, json={"id": f"PROD-{self.n}"}, request=req)
        if path == "/v1/billing/plans":
            assert headers.get("Prefer") == "return=representation"
            return httpx.Response(201, json={"id": f"P-{self.n}", "status": "ACTIVE"}, request=req)
        if path == "/v1/billing/subscriptions":
            return httpx.Response(201, json={"id": "I-NEW", "links": [{"rel": "approve", "href": "https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-1"}]}, request=req)
        if path.endswith("/cancel"):
            return httpx.Response(204, request=req)
        if path == "/v1/notifications/verify-webhook-signature":
            return httpx.Response(200, json={"verification_status": "SUCCESS" if json["transmission_sig"] == "good" else "FAILURE"}, request=req)
        if path == "/v1/notifications/webhooks":
            return httpx.Response(201, json={"id": "WH-1"}, request=req)
        return httpx.Response(404, json={"name": "RESOURCE_NOT_FOUND"}, request=req)


@pytest.fixture
def pp(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "paypal_mode", "sandbox")
    monkeypatch.setattr(s, "paypal_client_id", "cid")
    monkeypatch.setattr(s, "paypal_client_secret", "csecret")
    monkeypatch.setattr(s, "paypal_webhook_id", "WHID")
    paypal._token.update(value=None, exp=0.0)
    fake = FakePayPal()
    monkeypatch.setattr(paypal.httpx, "post", fake.post)
    monkeypatch.setattr(paypal.httpx, "request", fake.request)
    return fake


def test_plan_payload_and_token_cache(pp):
    pid = paypal.create_product("VenceYa", "desc")
    plan_id = paypal.create_plan(pid, "VenceYa Pro (Yearly)", "190.00", "year")
    assert plan_id.startswith("P-") and pp.token_calls == 1
    body = pp.calls[1][2]
    cycle = body["billing_cycles"][0]
    assert cycle["frequency"] == {"interval_unit": "YEAR", "interval_count": 1}
    assert cycle["pricing_scheme"]["fixed_price"] == {"value": "190.00", "currency_code": "USD"}
    assert cycle["total_cycles"] == 0 and body["payment_preferences"]["payment_failure_threshold"] == 3


def test_subscription_and_errors(pp):
    res = paypal.create_subscription("P-1", "42", "https://x/return", "https://x/cancel", "a@b.co")
    assert paypal.approve_link(res).startswith("https://www.sandbox.paypal.com/")
    body = pp.calls[-1][2]
    assert body["custom_id"] == "42" and body["application_context"]["user_action"] == "SUBSCRIBE_NOW"
    paypal.cancel_subscription("I-NEW")
    with pytest.raises(paypal.PayPalError):
        paypal.get_subscription("I-NOPE")


def test_webhook_verification(pp):
    ev = {"event_type": "PAYMENT.SALE.COMPLETED"}
    h = {"paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "c", "paypal-transmission-id": "t", "paypal-transmission-time": "now"}
    assert paypal.verify_webhook({**h, "paypal-transmission-sig": "good"}, ev) is True
    assert paypal.verify_webhook({**h, "paypal-transmission-sig": "bad"}, ev) is False
    sent = pp.calls[-1][2]
    assert sent["webhook_id"] == "WHID" and sent["webhook_event"] == ev


def test_paypal_sync_creates_all_plans_once(pp, capsys):
    db = SessionLocal()
    db.query(PayPalPlan).filter_by(mode="sandbox").delete()
    db.commit()
    cli.paypal_sync()
    expected = sum(len(p["plans"]) for p in catalog.PRODUCTS.values()) * 2
    rows = db.query(PayPalPlan).filter_by(mode="sandbox").all()
    assert len(rows) == expected == 60
    assert len({r.paypal_product_id for r in rows}) == 10
    n_calls = len(pp.calls)
    cli.paypal_sync()  # idempotente: no crea nada nuevo
    assert len(pp.calls) == n_calls
    r = next(x for x in rows if x.product == "venceya" and x.plan == "pro" and x.interval == "year")
    assert float(r.price) == 190.0
    db.close()


def test_checkout_uses_synced_plan(client, signup, pp):
    h, _ = signup("cobrabot")
    db = SessionLocal()
    if not db.query(PayPalPlan).filter_by(mode="sandbox", product="cobrabot", plan="pro", interval="month").first():
        cli.paypal_sync()
    db.close()
    r = client.post("/api/billing/checkout", json={"product": "cobrabot", "plan": "pro", "interval": "month"}, headers=h)
    assert r.status_code == 200, r.text
    assert "ba_token" in r.json()["approve_url"]
