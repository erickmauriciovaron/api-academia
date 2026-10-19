"""OffboardKit: retiro de empleados en Microsoft 365 en un clic, con acta."""

import secrets
import string
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Float, ForeignKey, String, Text, func, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import flag_modified

from ..crud import to_dict
from ..db import Base, TenantMixin, utcnow
from ..deps import Ctx, require_product
from . import m365
from .licencialens import DEFAULT_PRICES, FREE_SKUS

P = "offboardkit"
STEPS = {
    "block_signin": "Bloquear inicio de sesión",
    "revoke_sessions": "Cerrar todas las sesiones activas",
    "reset_password": "Cambiar contraseña por una aleatoria",
    "auto_reply": "Configurar respuesta automática de correo",
    "remove_groups": "Quitar de grupos",
    "remove_licenses": "Quitar licencias",
}
DEFAULT_SETTINGS = {
    "steps": list(STEPS.keys()),
    "auto_reply": "Gracias por su mensaje. {nombre} ya no hace parte de {empresa}. Para su solicitud escriba a {contacto}.",
    "contact_email": "",
}


class OkRun(TenantMixin, Base):
    __tablename__ = "ok_runs"
    connection_id: Mapped[int] = mapped_column(ForeignKey("m365_connections.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[str] = mapped_column(String(64))
    target_upn: Mapped[str] = mapped_column(String(254))
    target_name: Mapped[str] = mapped_column(String(200))
    requested_by: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | partial | failed
    licenses_removed: Mapped[list] = mapped_column(JSON, default=list)
    monthly_savings: Mapped[float] = mapped_column(Float, default=0)


def settings_for(tenant) -> dict:
    return {**DEFAULT_SETTINGS, **(tenant.settings or {}).get(P, {})}


def _random_password(n: int = 20) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%*?"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(n))
        if any(c.islower() for c in pw) and any(c.isupper() for c in pw) and any(c.isdigit() for c in pw):
            return pw


def runs_this_month(db, tenant_id: int) -> int:
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(select(func.count(OkRun.id)).where(OkRun.tenant_id == tenant_id, OkRun.created_at >= start)) or 0


def execute(g: m365.GraphClient, user: dict, steps: list[str], auto_reply_text: str, sku_names: dict[str, str]) -> tuple[list[dict], list[str]]:
    """Ejecuta los pasos en orden seguro. Devuelve (resultado por paso, licencias quitadas)."""
    uid = user["id"]
    results, removed = [], []

    def record(key: str, fn):
        at = utcnow().isoformat()
        try:
            detail = fn() or "OK"
            results.append({"key": key, "label": STEPS[key], "status": "ok", "detail": detail, "at": at})
        except m365.GraphError as e:
            results.append({"key": key, "label": STEPS[key], "status": "error", "detail": str(e)[:300], "at": at})

    if "block_signin" in steps:
        record("block_signin", lambda: g.request("PATCH", f"/users/{uid}", {"accountEnabled": False}) and None)
    if "revoke_sessions" in steps:
        record("revoke_sessions", lambda: g.request("POST", f"/users/{uid}/revokeSignInSessions") and None)
    if "reset_password" in steps:
        record(
            "reset_password",
            lambda: g.request("PATCH", f"/users/{uid}", {"passwordProfile": {"password": _random_password(), "forceChangePasswordNextSignIn": True}}) and None,
        )
    if "auto_reply" in steps and auto_reply_text:
        record(
            "auto_reply",
            lambda: g.request(
                "PATCH",
                f"/users/{uid}/mailboxSettings",
                {"automaticRepliesSetting": {"status": "alwaysEnabled", "externalAudience": "all", "internalReplyMessage": auto_reply_text, "externalReplyMessage": auto_reply_text}},
            )
            and None,
        )
    if "remove_groups" in steps:

        def remove_groups():
            groups = g.get_all(f"/users/{uid}/memberOf/microsoft.graph.group?$select=id,displayName,groupTypes,mailEnabled,securityEnabled,onPremisesSyncEnabled")
            done, skipped = [], []
            for grp in groups:
                name = grp.get("displayName") or grp["id"]
                if "DynamicMembership" in (grp.get("groupTypes") or []) or grp.get("onPremisesSyncEnabled"):
                    skipped.append(f"{name} (dinámico/sincronizado)")
                    continue
                if grp.get("mailEnabled") and "Unified" not in (grp.get("groupTypes") or []):
                    skipped.append(f"{name} (lista de distribución: quitar en Exchange)")
                    continue
                try:
                    g.request("DELETE", f"/groups/{grp['id']}/members/{uid}/$ref")
                    done.append(name)
                except m365.GraphError:
                    skipped.append(f"{name} (error)")
            return f"Quitado de {len(done)} grupos" + (f"; pendientes: {', '.join(skipped)}" if skipped else "")

        record("remove_groups", remove_groups)
    if "remove_licenses" in steps:

        def remove_licenses():
            lic = g.get(f"/users/{uid}?$select=assignedLicenses,licenseAssignmentStates")
            direct = {s["skuId"] for s in lic.get("licenseAssignmentStates", []) if not s.get("assignedByGroup")}
            ids = [x["skuId"] for x in lic.get("assignedLicenses", []) if not direct or x["skuId"] in direct]
            if not ids:
                return "Sin licencias asignadas directamente"
            g.request("POST", f"/users/{uid}/assignLicense", {"addLicenses": [], "removeLicenses": ids})
            removed.extend(sku_names.get(i, i) for i in ids)
            return f"Quitadas: {', '.join(removed)}"

        record("remove_licenses", remove_licenses)
    return results, removed


router = APIRouter(prefix="/api/offboardkit")
dep = require_product(P)


def _conn(ctx: Ctx, cid: int) -> m365.M365Connection:
    c = ctx.db.scalar(select(m365.M365Connection).where(m365.M365Connection.id == cid, m365.M365Connection.tenant_id == ctx.tenant_id, m365.M365Connection.product == P))
    if not c:
        raise HTTPException(404, "Conexión no encontrada")
    return c


@router.get("/connections")
def connections(ctx: Ctx = Depends(dep)):
    rows = ctx.db.scalars(select(m365.M365Connection).where(m365.M365Connection.tenant_id == ctx.tenant_id, m365.M365Connection.product == P))
    return [m365.serialize(c) for c in rows]


@router.get("/connect-url")
def connect_url(ctx: Ctx = Depends(dep)):
    return {"url": m365.consent_url(ctx, P, "admin")}


@router.delete("/connections/{cid}", status_code=204)
def delete_connection(cid: int, ctx: Ctx = Depends(dep)):
    ctx.db.delete(_conn(ctx, cid))
    ctx.db.commit()


@router.get("/connections/{cid}/users")
def search_users(cid: int, q: str, ctx: Ctx = Depends(dep)):
    if len(q.strip()) < 2:
        return []
    g = m365.GraphClient(_conn(ctx, cid))
    term = q.replace('"', "")
    try:
        data = g.get(
            f'/users?$search="displayName:{quote(term)}" OR "userPrincipalName:{quote(term)}"&$select=id,displayName,userPrincipalName,accountEnabled,jobTitle,department&$top=15',
            headers={"ConsistencyLevel": "eventual"},
        )
    except m365.GraphError as e:
        raise HTTPException(502, f"Error consultando Microsoft 365: {str(e)[:200]}")
    return data.get("value", [])


@router.get("/connections/{cid}/users/{uid}")
def preview_user(cid: int, uid: str, ctx: Ctx = Depends(dep)):
    g = m365.GraphClient(_conn(ctx, cid))
    try:
        user = g.get(f"/users/{uid}?$select=id,displayName,userPrincipalName,accountEnabled,jobTitle,department,assignedLicenses")
        skus = {s["skuId"]: s["skuPartNumber"] for s in g.get_all("/subscribedSkus")}
        groups = g.get_all(f"/users/{uid}/memberOf/microsoft.graph.group?$select=id,displayName")
    except m365.GraphError as e:
        raise HTTPException(502, f"Error consultando Microsoft 365: {str(e)[:200]}")
    lic = [skus.get(x["skuId"], x["skuId"]) for x in user.get("assignedLicenses", [])]
    savings = sum(DEFAULT_PRICES.get(x, 0) for x in lic if x not in FREE_SKUS)
    return {**user, "licenses": lic, "groups": [x.get("displayName") for x in groups], "estimated_savings": round(savings, 2)}


class RunIn(BaseModel):
    user_id: str
    steps: list[str] | None = None
    reason: str | None = Field(default=None, max_length=1000)
    auto_reply: str | None = Field(default=None, max_length=4000)
    confirm_upn: str


@router.post("/connections/{cid}/offboard", status_code=201)
def offboard(cid: int, data: RunIn, ctx: Ctx = Depends(dep)):
    conn = _conn(ctx, cid)
    ctx.check_limit("runs_month", runs_this_month(ctx.db, ctx.tenant_id))
    cfg = settings_for(ctx.tenant)
    steps = [s for s in (data.steps or cfg["steps"]) if s in STEPS]
    g = m365.GraphClient(conn)
    try:
        user = g.get(f"/users/{data.user_id}?$select=id,displayName,userPrincipalName")
        sku_names = {s["skuId"]: s["skuPartNumber"] for s in g.get_all("/subscribedSkus")}
    except m365.GraphError as e:
        raise HTTPException(502, f"Error consultando Microsoft 365: {str(e)[:200]}")
    if user["userPrincipalName"].lower() != data.confirm_upn.strip().lower():
        raise HTTPException(400, "Confirma escribiendo exactamente el correo (UPN) del usuario")
    text = (data.auto_reply or cfg["auto_reply"]).replace("{nombre}", user["displayName"]).replace("{empresa}", ctx.tenant.name).replace("{contacto}", cfg.get("contact_email") or ctx.user.email)
    results, removed = execute(g, user, steps, text, sku_names)
    errors = sum(1 for r in results if r["status"] == "error")
    run = OkRun(
        tenant_id=ctx.tenant_id,
        connection_id=conn.id,
        target_id=user["id"],
        target_upn=user["userPrincipalName"],
        target_name=user["displayName"],
        requested_by=f"{ctx.user.name} <{ctx.user.email}>",
        reason=data.reason,
        steps=results,
        status="completed" if errors == 0 else ("failed" if errors == len(results) else "partial"),
        licenses_removed=removed,
        monthly_savings=round(sum(DEFAULT_PRICES.get(x, 0) for x in removed if x not in FREE_SKUS), 2),
    )
    ctx.db.add(run)
    m365.mark_sync(ctx.db, conn)
    ctx.db.commit()
    return to_dict(run)


@router.get("/runs")
def runs(ctx: Ctx = Depends(dep)):
    rows = ctx.db.scalars(select(OkRun).where(OkRun.tenant_id == ctx.tenant_id).order_by(OkRun.id.desc()).limit(300))
    return {"items": [to_dict(r) for r in rows], "this_month": runs_this_month(ctx.db, ctx.tenant_id)}


@router.get("/runs/{rid}")
def run_detail(rid: int, ctx: Ctx = Depends(dep)):
    r = ctx.db.scalar(select(OkRun).where(OkRun.id == rid, OkRun.tenant_id == ctx.tenant_id))
    if not r:
        raise HTTPException(404, "No encontrado")
    conn = ctx.db.get(m365.M365Connection, r.connection_id)
    return to_dict(r, {"connection": m365.serialize(conn) if conn else None, "company": ctx.tenant.name})


class SettingsIn(BaseModel):
    steps: list[str]
    auto_reply: str = Field(max_length=4000)
    contact_email: str = ""


@router.get("/settings")
def get_settings_ep(ctx: Ctx = Depends(dep)):
    return {**settings_for(ctx.tenant), "available_steps": STEPS}


@router.put("/settings")
def put_settings(data: SettingsIn, ctx: Ctx = Depends(dep)):
    s = dict(ctx.tenant.settings or {})
    s[P] = {"steps": [x for x in data.steps if x in STEPS], "auto_reply": data.auto_reply, "contact_email": data.contact_email}
    ctx.tenant.settings = s
    flag_modified(ctx.tenant, "settings")
    ctx.db.commit()
    return get_settings_ep(ctx)
