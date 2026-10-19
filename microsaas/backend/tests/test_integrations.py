"""Panel de integraciones del superadmin: guardar credenciales y configurar PayPal desde la web."""

import pytest

from app import paypal, runtime_config
from app.cli import create_superadmin
from app.config import get_settings
from app.db import SessionLocal
from app.models import PayPalPlan, PlatformSetting
from tests.test_paypal_http import FakePayPal


@pytest.fixture
def admin_headers(client):
    create_superadmin("root-admin@example.com", "Root", "RootPass123")
    t = client.post("/api/auth/login", json={"email": "root-admin@example.com", "password": "RootPass123"}).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def restore_settings():
    s = get_settings()
    keys = list(runtime_config.EDITABLE)
    saved = {k: getattr(s, k) for k in keys}
    yield
    db = SessionLocal()
    db.query(PlatformSetting).delete()
    db.query(PayPalPlan).filter_by(mode="sandbox").delete()
    db.commit()
    runtime_config.refresh(db)
    db.close()
    for k, v in saved.items():
        setattr(s, k, v)
    paypal._token.update(value=None, exp=0.0)


def test_save_masks_secrets_and_applies(client, admin_headers, signup):
    h, _ = signup("venceya")
    assert client.get("/api/admin/integrations", headers=h).status_code == 403
    r = client.put(
        "/api/admin/integrations",
        json={"values": {"paypal_mode": "sandbox", "paypal_client_id": "cid", "paypal_client_secret": "csecret", "smtp_host": "smtp.x.com", "smtp_port": "2525"}},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    v = r.json()["values"]
    assert v["paypal_client_secret"].startswith("••••") and "csecret" not in v["paypal_client_secret"]
    assert r.json()["paypal_ready"] is True
    s = get_settings()
    assert (s.paypal_mode, s.paypal_client_id, s.paypal_client_secret, s.smtp_port) == ("sandbox", "cid", "csecret", 2525)
    # Reenviar el valor enmascarado no borra el secreto
    client.put("/api/admin/integrations", json={"values": {"paypal_client_secret": v["paypal_client_secret"]}}, headers=admin_headers)
    assert get_settings().paypal_client_secret == "csecret"
    assert client.put("/api/admin/integrations", json={"values": {"paypal_mode": "gratis"}}, headers=admin_headers).status_code == 400


def test_paypal_setup_from_panel(client, admin_headers, monkeypatch):
    fake = FakePayPal()
    monkeypatch.setattr(paypal.httpx, "post", fake.post)
    monkeypatch.setattr(paypal.httpx, "request", fake.request)
    monkeypatch.setattr(get_settings(), "app_url", "https://suite.ejemplo.com")
    client.put("/api/admin/integrations", json={"values": {"paypal_mode": "sandbox", "paypal_client_id": "cid", "paypal_client_secret": "csecret"}}, headers=admin_headers)
    r = client.post("/api/admin/integrations/paypal/setup", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["plans_total"] == 60 and d["webhook_id"] == "WH-1" and d["note"] is None
    assert get_settings().paypal_webhook_id == "WH-1"
    # Credenciales malas -> mensaje claro
    client.put("/api/admin/integrations", json={"values": {"paypal_client_secret": "otra"}}, headers=admin_headers)
    assert client.post("/api/admin/integrations/paypal/setup", headers=admin_headers).status_code == 400


def test_email_test_requires_smtp(client, admin_headers, monkeypatch):
    monkeypatch.setattr(get_settings(), "smtp_host", "")
    assert client.post("/api/admin/integrations/email/test", json={"to": "a@b.co"}, headers=admin_headers).status_code == 400
