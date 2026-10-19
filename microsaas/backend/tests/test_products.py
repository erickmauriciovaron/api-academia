from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import NotificationLog, Tenant
from app.products import cobrabot, datosok, licencialens, sst_data, tributalerta, venceya
from app.products.tributalerta import TaCalendar


def test_venceya_dashboard_and_alerts(client, signup):
    h, data = signup("venceya")
    e = client.post("/api/venceya/entities", json={"name": "Camión XYZ987", "kind": "vehiculo", "reference": "XYZ987"}, headers=h).json()
    today = date.today()
    client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "SOAT", "expires_on": (today + timedelta(days=7)).isoformat(), "responsible_email": "jefe@example.com"}, headers=h)
    client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "RTM", "expires_on": (today - timedelta(days=3)).isoformat()}, headers=h)
    client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "Póliza", "expires_on": (today + timedelta(days=200)).isoformat()}, headers=h)
    d = client.get("/api/venceya/dashboard", headers=h).json()
    assert d["counts"] == {"vencido": 1, "por_vencer": 1, "al_dia": 1}
    db = SessionLocal()
    tenant = db.get(Tenant, data["user"]["tenant"]["id"])
    assert venceya.run_alerts(db, tenant) == 2  # owner + responsable para el SOAT a 7 días
    assert venceya.run_alerts(db, tenant) == 0  # idempotente
    db.close()


def test_cobrabot_flow(client, signup):
    h, data = signup("cobrabot")
    c = client.post("/api/cobrabot/customers", json={"name": "Cliente SAS", "email": "pagos@cliente.com"}, headers=h).json()
    due = (date.today() - timedelta(days=3)).isoformat()
    inv = client.post("/api/cobrabot/invoices", json={"customer_id": c["id"], "number": "FV-001", "amount": "1500.50", "currency": "USD", "due_on": due}, headers=h).json()
    assert inv["days_overdue"] == 3
    s = client.put("/api/cobrabot/settings", json={"payment_url": "https://paypal.me/test", "offsets": [3, 0, 3]}, headers=h).json()
    assert s["offsets"] == [0, 3]
    db = SessionLocal()
    tenant = db.get(Tenant, data["user"]["tenant"]["id"])
    assert cobrabot.run_reminders(db, tenant) == 1
    assert cobrabot.run_reminders(db, tenant) == 0
    log = db.query(NotificationLog).filter(NotificationLog.key.like(f"cb:{inv['id']}:%")).first()
    assert "FV-001" in log.subject
    db.close()
    assert client.post(f"/api/cobrabot/invoices/{inv['id']}/remind", headers=h).status_code == 200
    paid = client.patch(f"/api/cobrabot/invoices/{inv['id']}", json={"status": "paid"}, headers=h).json()
    assert paid["paid_on"] == date.today().isoformat()
    dash = client.get("/api/cobrabot/dashboard", headers=h).json()
    assert dash["by_currency"]["USD"]["recovered_30d"] == 1500.5


def test_tributalerta_deadlines(client, signup):
    h, data = signup("tributalerta")
    db = SessionLocal()
    soon = date.today() + timedelta(days=3)
    db.add_all(
        [
            TaCalendar(year=soon.year, obligation="retefuente", period="Mes 1", digits=1, digit_from=7, digit_to=7, due_date=soon),
            TaCalendar(year=soon.year, obligation="retefuente", period="Mes 1", digits=1, digit_from=8, digit_to=8, due_date=soon + timedelta(days=1)),
            TaCalendar(year=soon.year, obligation="renta_pn", period="Anual", digits=2, digit_from=1, digit_to=10, due_date=soon),
        ]
    )
    db.commit()
    c = client.post("/api/tributalerta/clients", json={"name": "Contribuyente 1", "nit": "900123457", "taxpayer_type": "pj", "obligations": ["retefuente", "iva_bim"]}, headers=h).json()
    client.post("/api/tributalerta/clients", json={"name": "Persona", "nit": "1020304005", "taxpayer_type": "pn", "obligations": ["renta_pn"]}, headers=h)
    items = client.get("/api/tributalerta/deadlines", headers=h).json()
    assert {(i["client_name"], i["obligation"]) for i in items} == {("Contribuyente 1", "retefuente"), ("Persona", "renta_pn")}
    tenant = db.get(Tenant, data["user"]["tenant"]["id"])
    assert tributalerta.run_alerts(db, tenant) == 1
    r = client.post("/api/tributalerta/filings", json={"client_id": c["id"], "obligation": "retefuente", "period": "Mes 1", "due_date": soon.isoformat()}, headers=h)
    assert r.status_code == 201
    items = client.get("/api/tributalerta/deadlines", headers=h).json()
    assert next(i for i in items if i["obligation"] == "retefuente")["filed"] is True
    db.close()
    assert tributalerta.nit_suffix("900.123.457", 2) == 57


def test_assettrack_handover_signature(client, signup):
    h, _ = signup("assettrack")
    p = client.post("/api/assettrack/people", json={"name": "Carlos Ruiz", "email": "carlos@example.com"}, headers=h).json()
    a = client.post("/api/assettrack/assets", json={"tag": "PC-001", "category": "Portátil", "serial": "SN123"}, headers=h).json()
    ho = client.post("/api/assettrack/handovers", json={"asset_id": a["id"], "person_id": p["id"], "accessories": "Cargador"}, headers=h).json()
    asset = client.get(f"/api/assettrack/assets/{a['id']}", headers=h).json()
    assert asset["status"] == "asignado" and asset["person_name"] == "Carlos Ruiz"
    token = ho["sign_url"].rsplit("/", 1)[1]
    pub = client.get(f"/api/public/assettrack/handover/{token}").json()
    assert pub["asset"]["tag"] == "PC-001"
    sig = "data:image/png;base64," + "A" * 200
    r = client.post(f"/api/public/assettrack/handover/{token}/sign", json={"signer_name": "Carlos Ruiz", "signature": sig})
    assert r.status_code == 200 and r.json()["signed_at"]
    assert client.post(f"/api/public/assettrack/handover/{token}/sign", json={"signer_name": "Carlos Ruiz", "signature": sig}).status_code == 409


def test_lineacontrol_analysis(client, signup):
    h, _ = signup("lineacontrol")
    l1 = client.post("/api/lineacontrol/lines", json={"number": "3001", "operator": "Claro", "plan_cost": "20", "person_name": "Ana", "cost_center": "Ventas"}, headers=h).json()
    l2 = client.post("/api/lineacontrol/lines", json={"number": "3002", "operator": "Claro", "plan_cost": "15"}, headers=h).json()
    client.post("/api/lineacontrol/bills", json={"line_id": l1["id"], "period": "2026-09", "amount": "35", "data_gb": "5", "minutes": 100}, headers=h)
    client.post("/api/lineacontrol/bills", json={"line_id": l2["id"], "period": "2026-09", "amount": "15", "data_gb": "0", "minutes": 0}, headers=h)
    d = client.get("/api/lineacontrol/dashboard", headers=h).json()
    assert len(d["unassigned"]) == 1 and len(d["overcharged"]) == 1 and len(d["unused"]) == 1
    assert d["potential_savings"] == 30.0


def test_datosok_public_flow(client, signup):
    h, data = signup("datosok")
    key = data["user"]["tenant"]["public_key"]
    assert client.get(f"/api/public/datosok/{key}").json()["policy"] is None
    client.post(
        "/api/datosok/policies",
        json={"version": "1.0", "text": "Autorizo el tratamiento...", "purposes": [{"key": "servicio", "label": "Prestación del servicio", "required": True}, {"key": "mkt", "label": "Marketing", "required": False}], "is_current": True},
        headers=h,
    )
    base = {"full_name": "Laura Gómez", "doc_number": "1010101010", "email": "laura@example.com", "accept": True}
    assert client.post(f"/api/public/datosok/{key}/consent", json={**base, "purposes_accepted": ["mkt"]}).status_code == 400
    r = client.post(f"/api/public/datosok/{key}/consent", json={**base, "purposes_accepted": ["servicio"]}, headers={"user-agent": "pytest"})
    assert r.status_code == 201
    req = client.post(f"/api/public/datosok/{key}/request", json={"kind": "consulta", "full_name": "Laura Gómez", "doc_number": "1010101010", "email": "laura@example.com", "description": "Quiero saber qué datos tienen"}).json()
    st = client.get(f"/api/public/datosok/{key}/request/{req['radicado']}", params={"doc": "1010101010"}).json()
    assert st["status"] == "recibida"
    stats = client.get("/api/datosok/stats", headers=h).json()
    assert stats["consents_month"] == 1 and stats["requests_open"] == 1
    rid = client.get("/api/datosok/requests", headers=h).json()["items"][0]["id"]
    assert client.post(f"/api/datosok/requests/{rid}/respond", json={"response": "Adjuntamos la información solicitada."}, headers=h).json()["status"] == "respondida"


def test_business_days_colombia():
    # 2026-12-24 (jueves) + 1 día hábil = 2026-12-28 (25 dic festivo, 26-27 fin de semana)
    assert datosok.add_business_days(date(2026, 12, 24), 1) == date(2026, 12, 28)
    assert datosok.business_days_between(date(2026, 12, 24), date(2026, 12, 28)) == 1


def test_sst_scoring_and_plan(client, signup):
    assert round(sum(i["weight"] for i in sst_data.items_for(60)), 2) == 100.0
    assert len(sst_data.items_for(60)) == 60 and len(sst_data.items_for(21)) == 21 and len(sst_data.items_for(7)) == 7
    assert sst_data.standard_for(8, 2) == 7 and sst_data.standard_for(30, 3) == 21 and sst_data.standard_for(5, 4) == 60
    h, _ = signup("sst0312")
    c = client.post("/api/sst0312/companies", json={"name": "Constructora", "workers": 8, "risk_level": 2}, headers=h).json()
    assert c["standard"] == 7
    answers = {i["code"]: "cumple" for i in sst_data.items_for(7)}
    answers["7.1"] = "no_cumple"
    answers["7.2"] = "no_cumple"
    a = client.post("/api/sst0312/assessments", json={"company_id": c["id"], "standard": 7, "answers": answers}, headers=h).json()
    assert a["rating"] == "moderadamente_aceptable" and 71 < a["score"] < 72
    plan = client.post(f"/api/sst0312/assessments/{a['id']}/plan", json={"responsible": "Ana"}, headers=h).json()
    assert plan["created"] == 2
    assert client.post(f"/api/sst0312/assessments/{a['id']}/plan", json={}, headers=h).json()["created"] == 0
    rep = client.get(f"/api/sst0312/assessments/{a['id']}/report", headers=h).json()
    assert len(rep["items"]) == 7 and len(rep["actions"]) == 2


def test_helpdesk_portal_and_report(client, signup):
    h, data = signup("helpdesk")
    key = data["user"]["tenant"]["public_key"]
    client.post("/api/helpdesk/clients", json={"name": "Cliente ACME", "email_domain": "acme.com"}, headers=h)
    r = client.post(f"/api/public/helpdesk/{key}/tickets", json={"subject": "No imprime", "description": "La impresora no responde", "requester_name": "Pedro", "requester_email": "pedro@acme.com", "priority": "alta"})
    assert r.status_code == 201
    token = r.json()["token"]
    tickets = client.get("/api/helpdesk/tickets", headers=h).json()["items"]
    assert tickets[0]["client_name"] == "Cliente ACME" and tickets[0]["number"] == 1
    tid = tickets[0]["id"]
    client.post(f"/api/helpdesk/tickets/{tid}/comments", json={"body": "Revisando"}, headers=h)
    client.post(f"/api/helpdesk/tickets/{tid}/comments", json={"body": "nota interna", "internal": True}, headers=h)
    pub = client.get(f"/api/public/helpdesk/{key}/t/{token}").json()
    assert len(pub["comments"]) == 1
    t = client.patch(f"/api/helpdesk/tickets/{tid}", json={"status": "resuelto"}, headers=h).json()
    assert t["resolved_at"] and t["sla_breached"] is False
    rep = client.get("/api/helpdesk/report", headers=h).json()
    assert rep["rows"][0]["client"] == "Cliente ACME" and rep["rows"][0]["sla_pct"] == 100.0
    me = client.get("/api/auth/me", headers=h).json()
    assert client.post("/api/helpdesk/agents", json={"user_id": me["id"]}, headers=h).status_code == 201


def test_licencialens_analysis():
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    skus = [
        {"skuId": "e3", "skuPartNumber": "SPE_E3", "prepaidUnits": {"enabled": 10}, "consumedUnits": 7},
        {"skuId": "ex", "skuPartNumber": "EXCHANGESTANDARD", "prepaidUnits": {"enabled": 2}, "consumedUnits": 2},
        {"skuId": "free", "skuPartNumber": "FLOW_FREE", "prepaidUnits": {"enabled": 10000}, "consumedUnits": 3},
    ]
    old = (now - timedelta(days=120)).isoformat()
    recent = (now - timedelta(days=2)).isoformat()
    users = [
        {"displayName": "Activo", "accountEnabled": True, "assignedLicenses": [{"skuId": "e3"}], "signInActivity": {"lastSignInDateTime": recent}},
        {"displayName": "Deshabilitado", "accountEnabled": False, "assignedLicenses": [{"skuId": "e3"}], "signInActivity": None},
        {"displayName": "Inactivo", "accountEnabled": True, "assignedLicenses": [{"skuId": "e3"}, {"skuId": "free"}], "signInActivity": {"lastSignInDateTime": old}},
        {"displayName": "Duplicado", "accountEnabled": True, "assignedLicenses": [{"skuId": "e3"}, {"skuId": "ex"}], "signInActivity": {"lastSignInDateTime": recent}},
        {"displayName": "Sin licencia", "accountEnabled": False, "assignedLicenses": []},
    ]
    res = licencialens.analyze(skus, users, licencialens.DEFAULT_PRICES, 60, now=now)
    t = res["totals"]
    assert t["disabled"] == 36.0 and t["inactive"] == 36.0 and t["redundant"] == 4.0 and t["unassigned"] == 108.0
    assert res["waste_month"] == 184.0 and res["licensed_users"] == 4


def test_m365_endpoints_without_config(client, signup):
    h, _ = signup("licencialens")
    assert client.get("/api/licencialens/connect-url", headers=h).status_code == 503
    assert client.get("/api/licencialens/connections", headers=h).json() == []
    h2, _ = signup("offboardkit")
    assert client.get("/api/offboardkit/settings", headers=h2).json()["steps"]
