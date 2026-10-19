"""Pruebas de LicenciaLens y OffboardKit con Microsoft Graph simulado a nivel HTTP."""

import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.config import get_settings
from app.products import m365

MS_TENANT = "11111111-2222-3333-4444-555555555555"


class FakeGraph:
    """Simula login.microsoftonline.com y graph.microsoft.com."""

    def __init__(self, signin_forbidden=False, group_licensed=False):
        self.calls: list[tuple[str, str, dict | None]] = []
        self.signin_forbidden = signin_forbidden
        self.group_licensed = group_licensed
        self.throttled_once = False

    def _resp(self, status, data=None, headers=None):
        return httpx.Response(status, json=data if data is not None else None, headers=headers, request=httpx.Request("GET", "http://x"))

    def post(self, url, data=None, timeout=None, **kw):
        assert "/oauth2/v2.0/token" in url and data["grant_type"] == "client_credentials"
        return self._resp(200, {"access_token": "tok", "expires_in": 3600})

    def request(self, method, url, json=None, headers=None, timeout=None):
        u = urlparse(url)
        path = u.path.replace("/v1.0", "")
        q = parse_qs(u.query)
        self.calls.append((method, path + ("?" + u.query if u.query else ""), json))
        assert headers["Authorization"] == "Bearer tok"
        if method == "GET" and path == "/organization":
            return self._resp(200, {"value": [{"displayName": "Contoso SAS", "verifiedDomains": [{"name": "contoso.co", "isDefault": True}]}]})
        if method == "GET" and path == "/subscribedSkus":
            if not self.throttled_once:
                self.throttled_once = True
                return self._resp(429, {}, {"Retry-After": "0"})
            return self._resp(
                200,
                {
                    "value": [
                        {"skuId": "e3", "skuPartNumber": "SPE_E3", "prepaidUnits": {"enabled": 5}, "consumedUnits": 3, "capabilityStatus": "Enabled"},
                        {"skuId": "bb", "skuPartNumber": "O365_BUSINESS_ESSENTIALS", "prepaidUnits": {"enabled": 2}, "consumedUnits": 2, "capabilityStatus": "Enabled"},
                    ]
                },
            )
        if method == "GET" and path == "/users" and "$search" not in q:
            sel = q.get("$select", [""])[0]
            if "signInActivity" in sel and self.signin_forbidden:
                return self._resp(403, {"error": {"code": "Authentication_RequestFromNonPremiumTenantOrB2CTenant"}})
            strip = (lambda d: {**d, "value": [{k: v for k, v in x.items() if k != "signInActivity"} for x in d["value"]]}) if "signInActivity" not in sel else (lambda d: d)
            if "page" in q:
                return self._resp(200, {"value": [{"id": "u3", "displayName": "Deshabilitado", "userPrincipalName": "d@contoso.co", "accountEnabled": False, "assignedLicenses": [{"skuId": "e3"}]}]})
            return self._resp(
                200,
                strip({
                    "value": [
                        {"id": "u1", "displayName": "Ana", "userPrincipalName": "ana@contoso.co", "accountEnabled": True, "assignedLicenses": [{"skuId": "e3"}], "signInActivity": {"lastSignInDateTime": "2020-01-01T00:00:00Z"}},
                        {"id": "u2", "displayName": "Luis", "userPrincipalName": "luis@contoso.co", "accountEnabled": True, "assignedLicenses": [{"skuId": "bb"}], "signInActivity": {"lastSignInDateTime": "2099-01-01T00:00:00Z"}},
                    ],
                    "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?page=2",
                }),
            )
        if method == "GET" and path == "/users" and "$search" in q:
            assert headers.get("ConsistencyLevel") == "eventual"
            return self._resp(200, {"value": [{"id": "u1", "displayName": "Ana", "userPrincipalName": "ana@contoso.co", "accountEnabled": True}]})
        if method == "GET" and path == "/users/u1":
            if "licenseAssignmentStates" in u.query:
                states = [{"skuId": "e3", "assignedByGroup": "g9" if self.group_licensed else None}]
                return self._resp(200, {"assignedLicenses": [{"skuId": "e3"}], "licenseAssignmentStates": states})
            return self._resp(200, {"id": "u1", "displayName": "Ana", "userPrincipalName": "ana@contoso.co", "accountEnabled": True, "assignedLicenses": [{"skuId": "e3"}]})
        if method == "GET" and path == "/users/u1/memberOf/microsoft.graph.group":
            return self._resp(
                200,
                {
                    "value": [
                        {"id": "g1", "displayName": "Ventas", "groupTypes": ["Unified"], "mailEnabled": True},
                        {"id": "g2", "displayName": "Dinámico", "groupTypes": ["DynamicMembership"]},
                        {"id": "g3", "displayName": "Lista DL", "groupTypes": [], "mailEnabled": True},
                    ]
                },
            )
        if method in ("PATCH", "POST", "DELETE") and path.startswith(("/users/u1", "/groups/g1")):
            return httpx.Response(204, request=httpx.Request(method, url))
        return self._resp(404, {"error": {"message": f"no simulado: {method} {path}"}})


@pytest.fixture
def graph(monkeypatch):
    s = get_settings()
    for k in ("m365_read_client_id", "m365_read_client_secret", "m365_admin_client_id", "m365_admin_client_secret"):
        monkeypatch.setattr(s, k, "x-" + k)
    m365._tokens.clear()
    fake = FakeGraph()
    monkeypatch.setattr(m365.httpx, "post", fake.post)
    monkeypatch.setattr(m365.httpx, "request", fake.request)
    monkeypatch.setattr(m365.time, "sleep", lambda s: None)
    return fake


def _connect(client, headers, product):
    url = client.get(f"/api/{product}/connect-url", headers=headers).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["scope"] == ["https://graph.microsoft.com/.default"]
    assert q["redirect_uri"][0].endswith("/app/m365/callback")
    r = client.post("/api/m365/callback", json={"state": q["state"][0], "tenant": MS_TENANT, "admin_consent": "True"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["connection"]


def test_licencialens_connect_and_scan(client, signup, graph):
    h, _ = signup("licencialens")
    conn = _connect(client, h, "licencialens")
    assert conn["display_name"] == "Contoso SAS" and conn["default_domain"] == "contoso.co"
    # Estado manipulado o de otra cuenta
    assert client.post("/api/m365/callback", json={"state": "x.y", "tenant": MS_TENANT}, headers=h).status_code == 400
    h2, _ = signup("licencialens")
    url = client.get("/api/licencialens/connect-url", headers=h).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    assert client.post("/api/m365/callback", json={"state": state, "tenant": MS_TENANT}, headers=h2).status_code == 400

    scan = client.post(f"/api/licencialens/connections/{conn['id']}/scan", headers=h)
    assert scan.status_code == 200, scan.text
    s = scan.json()
    t = s["summary"]["totals"]
    # Ana inactiva (E3 36), deshabilitado (E3 36, página 2), 2 E3 libres (72)
    assert (t["inactive"], t["disabled"], t["unassigned"]) == (36.0, 36.0, 72.0)
    assert s["users_scanned"] == 3 and s["signin_available"] is True
    assert client.get(f"/api/licencialens/scans/{s['id']}/csv", headers=h).text.startswith("tipo,usuario")
    # Otra cuenta no ve el escaneo
    assert client.get(f"/api/licencialens/scans/{s['id']}", headers=h2).status_code == 404


def test_licencialens_without_p1_falls_back(client, signup, graph):
    graph.signin_forbidden = True
    h, _ = signup("licencialens")
    conn = _connect(client, h, "licencialens")
    s = client.post(f"/api/licencialens/connections/{conn['id']}/scan", headers=h).json()
    assert s["signin_available"] is False and s["summary"]["totals"]["inactive"] == 0


def test_licencialens_user_limit(client, signup, graph):
    h, _ = signup("licencialens")
    conn = _connect(client, h, "licencialens")
    client.post("/api/billing/checkout", json={"product": "licencialens", "plan": "starter"}, headers=h)
    from app.catalog import PRODUCTS

    plan = next(p for p in PRODUCTS["licencialens"]["plans"] if p["code"] == "starter")
    old = plan["limits"]["users"]
    plan["limits"]["users"] = 2
    try:
        r = client.post(f"/api/licencialens/connections/{conn['id']}/scan", headers=h)
        assert r.status_code == 402
    finally:
        plan["limits"]["users"] = old


def test_offboardkit_full_run(client, signup, graph):
    h, _ = signup("offboardkit")
    conn = _connect(client, h, "offboardkit")
    found = client.get(f"/api/offboardkit/connections/{conn['id']}/users", params={"q": "ana"}, headers=h).json()
    assert found[0]["id"] == "u1"
    prev = client.get(f"/api/offboardkit/connections/{conn['id']}/users/u1", headers=h).json()
    assert prev["licenses"] == ["SPE_E3"] and prev["estimated_savings"] == 36.0
    bad = client.post(f"/api/offboardkit/connections/{conn['id']}/offboard", json={"user_id": "u1", "confirm_upn": "otro@contoso.co"}, headers=h)
    assert bad.status_code == 400
    graph.calls.clear()
    r = client.post(f"/api/offboardkit/connections/{conn['id']}/offboard", json={"user_id": "u1", "confirm_upn": "ANA@contoso.co", "reason": "Renuncia"}, headers=h)
    assert r.status_code == 201, r.text
    run = r.json()
    assert run["status"] == "completed", run["steps"]
    assert [s["key"] for s in run["steps"]] == ["block_signin", "revoke_sessions", "reset_password", "auto_reply", "remove_groups", "remove_licenses"]
    assert run["licenses_removed"] == ["SPE_E3"] and run["monthly_savings"] == 36.0
    writes = [(m, p) for m, p, _ in graph.calls if m != "GET"]
    assert ("PATCH", "/users/u1") in writes and ("POST", "/users/u1/revokeSignInSessions") in writes
    assert ("DELETE", "/groups/g1/members/u1/$ref") in writes
    assert not any(p.startswith(("/groups/g2", "/groups/g3")) for _, p in writes)
    body = next(b for m, p, b in graph.calls if p == "/users/u1/mailboxSettings")
    assert "Ana" in json.dumps(body["automaticRepliesSetting"])
    lic = next(b for m, p, b in graph.calls if p == "/users/u1/assignLicense")
    assert lic == {"addLicenses": [], "removeLicenses": ["e3"]}
    assert client.get("/api/offboardkit/runs", headers=h).json()["this_month"] == 1


def test_offboardkit_group_licenses_not_removed(client, signup, graph):
    graph.group_licensed = True
    h, _ = signup("offboardkit")
    conn = _connect(client, h, "offboardkit")
    r = client.post(f"/api/offboardkit/connections/{conn['id']}/offboard", json={"user_id": "u1", "confirm_upn": "ana@contoso.co", "steps": ["remove_licenses"]}, headers=h).json()
    assert r["status"] == "completed" and r["licenses_removed"] == []
    assert "heredadas de grupo" in r["steps"][0]["detail"]
    assert not any(p == "/users/u1/assignLicense" for _, p, _ in graph.calls)


def test_offboardkit_monthly_limit(client, signup, graph):
    h, _ = signup("offboardkit")
    conn = _connect(client, h, "offboardkit")
    client.post("/api/billing/checkout", json={"product": "offboardkit", "plan": "starter"}, headers=h)
    from app.catalog import PRODUCTS

    plan = next(p for p in PRODUCTS["offboardkit"]["plans"] if p["code"] == "starter")
    old = plan["limits"]["runs_month"]
    plan["limits"]["runs_month"] = 1
    try:
        body = {"user_id": "u1", "confirm_upn": "ana@contoso.co", "steps": ["block_signin"]}
        assert client.post(f"/api/offboardkit/connections/{conn['id']}/offboard", json=body, headers=h).status_code == 201
        assert client.post(f"/api/offboardkit/connections/{conn['id']}/offboard", json=body, headers=h).status_code == 402
    finally:
        plan["limits"]["runs_month"] = old
