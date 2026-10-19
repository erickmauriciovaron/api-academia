from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import Subscription


def test_catalog_has_ten_products(client):
    r = client.get("/api/public/catalog")
    assert r.status_code == 200
    products = r.json()["products"]
    assert len(products) == 10
    for p in products:
        assert p["plans"] and all(pl["price"] > 0 and pl["price_year"] == pl["price"] * 10 for pl in p["plans"])


def test_signup_login_me(client, signup):
    headers, data = signup("venceya")
    assert data["user"]["subscriptions"][0]["status"] == "trialing"
    assert data["user"]["subscriptions"][0]["has_access"]
    me = client.get("/api/auth/me", headers=headers).json()
    r = client.post("/api/auth/login", json={"email": me["email"], "password": "Secreta123"})
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": me["email"], "password": "mala"}).status_code == 401
    assert client.post("/api/auth/signup", json={"name": "X Y", "company": "Z Z", "email": me["email"], "password": "Secreta123", "product": "venceya"}).status_code == 409


def test_product_gating_and_activation(client, signup):
    headers, _ = signup("venceya")
    assert client.get("/api/cobrabot/customers", headers=headers).status_code == 403
    assert client.post("/api/auth/activate/cobrabot", headers=headers).status_code == 200
    assert client.get("/api/cobrabot/customers", headers=headers).status_code == 200


def test_expired_trial_blocks_and_checkout_reactivates(client, signup):
    headers, data = signup("venceya")
    db = SessionLocal()
    sub = db.query(Subscription).filter_by(tenant_id=data["user"]["tenant"]["id"], product="venceya").one()
    sub.trial_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()
    db.close()
    assert client.get("/api/venceya/entities", headers=headers).status_code == 402
    r = client.post("/api/billing/checkout", json={"product": "venceya", "plan": "starter", "interval": "year"}, headers=headers)
    assert r.status_code == 200 and r.json()["mock"]
    assert client.get("/api/venceya/entities", headers=headers).status_code == 200
    subs = client.get("/api/billing/subscriptions", headers=headers).json()
    assert subs[0]["status"] == "active" and subs[0]["plan"] == "starter" and subs[0]["interval"] == "year"


def test_tenant_isolation(client, signup):
    h1, _ = signup("venceya")
    h2, _ = signup("venceya")
    e = client.post("/api/venceya/entities", json={"name": "Camión ABC123", "kind": "vehiculo"}, headers=h1).json()
    assert client.get(f"/api/venceya/entities/{e['id']}", headers=h2).status_code == 404
    # No se puede crear un documento que apunte a una entidad de otro tenant
    r = client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "SOAT", "expires_on": "2030-01-01"}, headers=h2)
    assert r.status_code == 400
    assert client.get("/api/venceya/entities", headers=h2).json()["total"] == 0


def test_plan_limit_enforced(client, signup):
    headers, _ = signup("venceya")
    client.post("/api/billing/checkout", json={"product": "venceya", "plan": "starter"}, headers=headers)
    e = client.post("/api/venceya/entities", json={"name": "Moto"}, headers=headers).json()
    for i in range(50):
        r = client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": f"Doc {i}", "expires_on": "2030-01-01"}, headers=headers)
        assert r.status_code == 201
    r = client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "Extra", "expires_on": "2030-01-01"}, headers=headers)
    assert r.status_code == 402


def test_team_and_password_reset(client, signup):
    headers, _ = signup("assettrack")
    r = client.post("/api/team", json={"name": "Ana Pérez", "email": "ana.team@example.com", "role": "member"}, headers=headers)
    assert r.status_code == 201
    assert len(client.get("/api/team", headers=headers).json()) == 2
    assert client.post("/api/auth/forgot", json={"email": "ana.team@example.com"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": "invalido", "password": "OtraClave123"}).status_code == 400


def test_admin_requires_superadmin(client, signup):
    headers, _ = signup("helpdesk")
    assert client.get("/api/admin/stats", headers=headers).status_code == 403


def test_csv_import(client, signup):
    headers, _ = signup("lineacontrol")
    csv_data = "number;operator;plan_cost;person_name\n3001234567;Claro;25;Ana\n3007654321;Movistar;30;\n;Tigo;abc;\n"
    r = client.post("/api/lineacontrol/lines/import", files={"file": ("lines.csv", csv_data, "text/csv")}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2
    assert len(r.json()["errors"]) == 1
