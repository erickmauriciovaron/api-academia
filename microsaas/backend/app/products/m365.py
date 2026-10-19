"""Conexiones a tenants de Microsoft 365 vía consentimiento de administrador (app multi-tenant de Entra ID).

Perfil `read`  -> LicenciaLens (User.Read.All, Organization.Read.All, AuditLog.Read.All)
Perfil `admin` -> OffboardKit (User.ReadWrite.All, User-PasswordProfile.ReadWrite.All, User.RevokeSessions.All,
                                GroupMember.ReadWrite.All, LicenseAssignment.ReadWrite.All, MailboxSettings.ReadWrite,
                                Organization.Read.All)
"""

import time
from datetime import datetime
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy import DateTime, String, select
from sqlalchemy.orm import Mapped, mapped_column

from ..config import get_settings
from ..crud import to_dict
from ..db import Base, TenantMixin, utcnow
from ..deps import Ctx
from ..security import sign_state, verify_state

GRAPH = "https://graph.microsoft.com/v1.0"
_tokens: dict[tuple, tuple[str, float]] = {}


class M365Connection(TenantMixin, Base):
    __tablename__ = "m365_connections"
    product: Mapped[str] = mapped_column(String(40), index=True)
    profile: Mapped[str] = mapped_column(String(10))  # read | admin
    ms_tenant_id: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    default_domain: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="connected")  # connected | error
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def credentials(profile: str) -> tuple[str, str]:
    s = get_settings()
    if profile == "admin":
        return s.m365_admin_client_id, s.m365_admin_client_secret
    return s.m365_read_client_id, s.m365_read_client_secret


def consent_url(ctx: Ctx, product: str, profile: str) -> str:
    client_id, _ = credentials(profile)
    if not client_id:
        raise HTTPException(503, "Integración con Microsoft 365 no configurada en el servidor")
    state = sign_state(f"{ctx.tenant_id}:{product}:{profile}:{int(time.time())}")
    redirect = f"{get_settings().app_url}/app/m365/callback"
    return "https://login.microsoftonline.com/organizations/v2.0/adminconsent?" + urlencode(
        {"client_id": client_id, "scope": "https://graph.microsoft.com/.default", "redirect_uri": redirect, "state": state}
    )


def complete_consent(ctx: Ctx, state: str, ms_tenant: str, admin_consent: str | None, error: str | None) -> M365Connection:
    if error:
        raise HTTPException(400, f"Consentimiento rechazado: {error}")
    value = verify_state(state)
    if not value:
        raise HTTPException(400, "Estado inválido")
    tid, product, profile, ts = value.split(":")
    if int(tid) != ctx.tenant_id or time.time() - int(ts) > 3600:
        raise HTTPException(400, "Solicitud de conexión vencida o de otra cuenta")
    existing = ctx.db.scalar(
        select(M365Connection).where(M365Connection.tenant_id == ctx.tenant_id, M365Connection.product == product, M365Connection.ms_tenant_id == ms_tenant)
    )
    if not existing:
        count = len(ctx.db.scalars(select(M365Connection).where(M365Connection.tenant_id == ctx.tenant_id, M365Connection.product == product)).all())
        ctx.check_limit("connections", count)
        existing = M365Connection(tenant_id=ctx.tenant_id, product=product, profile=profile, ms_tenant_id=ms_tenant)
        ctx.db.add(existing)
    existing.status, existing.last_error = "connected", None
    try:
        org = GraphClient(existing).get("/organization?$select=displayName,verifiedDomains").get("value", [{}])[0]
        existing.display_name = org.get("displayName")
        existing.default_domain = next((d["name"] for d in org.get("verifiedDomains", []) if d.get("isDefault")), None)
    except GraphError as e:
        # El consentimiento puede tardar unos segundos en propagarse.
        existing.last_error = str(e)[:500]
    ctx.db.commit()
    return existing


class GraphError(Exception):
    pass


class GraphClient:
    def __init__(self, conn: M365Connection):
        self.conn = conn
        self.client_id, self.secret = credentials(conn.profile)

    def _token(self) -> str:
        key = (self.conn.ms_tenant_id, self.client_id)
        cached = _tokens.get(key)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
        r = httpx.post(
            f"https://login.microsoftonline.com/{self.conn.ms_tenant_id}/oauth2/v2.0/token",
            data={"client_id": self.client_id, "client_secret": self.secret, "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"},
            timeout=30,
        )
        if r.status_code != 200:
            raise GraphError(f"Token: {r.status_code} {r.text[:300]}")
        data = r.json()
        _tokens[key] = (data["access_token"], time.time() + int(data.get("expires_in", 3600)))
        return data["access_token"]

    def request(self, method: str, path: str, json: dict | None = None, headers: dict | None = None) -> dict:
        url = path if path.startswith("http") else f"{GRAPH}{path}"
        h = {"Authorization": f"Bearer {self._token()}", **(headers or {})}
        for attempt in range(4):
            r = httpx.request(method, url, json=json, headers=h, timeout=60)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(int(r.headers.get("Retry-After", 2 ** attempt)), 30))
                continue
            break
        if r.status_code >= 300:
            raise GraphError(f"{method} {path}: {r.status_code} {r.text[:300]}")
        return r.json() if r.content else {}

    def get(self, path: str, headers: dict | None = None) -> dict:
        return self.request("GET", path, headers=headers)

    def get_all(self, path: str, headers: dict | None = None, max_items: int = 50_000) -> list[dict]:
        items, url = [], path
        while url and len(items) < max_items:
            data = self.get(url, headers=headers)
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
        return items


def mark_sync(db, conn: M365Connection, error: str | None = None) -> None:
    conn.last_sync_at = utcnow()
    conn.status = "error" if error else "connected"
    conn.last_error = error[:500] if error else None


def serialize(conn: M365Connection) -> dict:
    return to_dict(conn)
