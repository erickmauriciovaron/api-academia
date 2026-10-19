"""LicenciaLens: detecta licencias de Microsoft 365 desperdiciadas y calcula el ahorro."""

import csv
import io
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import flag_modified

from ..crud import to_dict
from ..db import Base, TenantMixin, utcnow
from ..deps import Ctx, require_product
from ..notify import email_layout, notify_once, send_email
from . import m365

P = "licencialens"

# Precios de lista aproximados en USD por usuario/mes (ESTIMACIÓN: editables por cada cliente).
DEFAULT_PRICES = {
    "O365_BUSINESS_ESSENTIALS": 6.00,
    "O365_BUSINESS_PREMIUM": 12.50,
    "SPB": 22.00,
    "O365_BUSINESS": 8.25,
    "STANDARDPACK": 10.00,
    "ENTERPRISEPACK": 23.00,
    "ENTERPRISEPREMIUM": 38.00,
    "SPE_E3": 36.00,
    "SPE_E5": 57.00,
    "SPE_F1": 8.00,
    "DESKLESSPACK": 2.25,
    "EXCHANGESTANDARD": 4.00,
    "EXCHANGEENTERPRISE": 8.00,
    "POWER_BI_PRO": 14.00,
    "PROJECTPROFESSIONAL": 30.00,
    "VISIOCLIENT": 15.00,
    "Microsoft_Teams_Premium": 10.00,
    "Microsoft_365_Copilot": 30.00,
}
FREE_SKUS = {"FLOW_FREE", "POWER_BI_STANDARD", "TEAMS_EXPLORATORY", "WINDOWS_STORE", "STREAM", "CCIBOTS_PRIVPREV_VIRAL", "POWERAPPS_VIRAL", "RIGHTSMANAGEMENT_ADHOC", "MCOPSTNC"}

# Si el usuario tiene la llave, las licencias de la lista son redundantes.
REDUNDANT = {
    "SPE_E5": ["SPE_E3", "ENTERPRISEPREMIUM", "ENTERPRISEPACK", "STANDARDPACK", "EXCHANGESTANDARD", "EXCHANGEENTERPRISE", "POWER_BI_PRO"],
    "SPE_E3": ["ENTERPRISEPACK", "STANDARDPACK", "EXCHANGESTANDARD", "EXCHANGEENTERPRISE", "O365_BUSINESS"],
    "ENTERPRISEPREMIUM": ["ENTERPRISEPACK", "STANDARDPACK", "EXCHANGESTANDARD", "EXCHANGEENTERPRISE", "POWER_BI_PRO"],
    "ENTERPRISEPACK": ["STANDARDPACK", "EXCHANGESTANDARD", "EXCHANGEENTERPRISE"],
    "SPB": ["O365_BUSINESS_PREMIUM", "O365_BUSINESS_ESSENTIALS", "O365_BUSINESS", "EXCHANGESTANDARD"],
    "O365_BUSINESS_PREMIUM": ["O365_BUSINESS_ESSENTIALS", "O365_BUSINESS", "EXCHANGESTANDARD"],
}
DEFAULT_SETTINGS = {"inactive_days": 60, "report_emails": []}


class LlPrice(TenantMixin, Base):
    __tablename__ = "ll_prices"
    __table_args__ = (UniqueConstraint("tenant_id", "sku"),)
    sku: Mapped[str] = mapped_column(String(100))
    price: Mapped[float] = mapped_column(Float)


class LlScan(TenantMixin, Base):
    __tablename__ = "ll_scans"
    connection_id: Mapped[int] = mapped_column(ForeignKey("m365_connections.id", ondelete="CASCADE"), index=True)
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    users_scanned: Mapped[int] = mapped_column(Integer, default=0)
    licensed_users: Mapped[int] = mapped_column(Integer, default=0)
    waste_month: Mapped[float] = mapped_column(Float, default=0)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    skus: Mapped[list] = mapped_column(JSON, default=list)
    findings: Mapped[list] = mapped_column(JSON, default=list)
    signin_available: Mapped[bool] = mapped_column(Boolean, default=True)


def settings_for(tenant) -> dict:
    return {**DEFAULT_SETTINGS, **(tenant.settings or {}).get(P, {})}


def prices_for(db, tenant_id: int) -> dict[str, float]:
    prices = dict(DEFAULT_PRICES)
    for row in db.scalars(select(LlPrice).where(LlPrice.tenant_id == tenant_id)):
        prices[row.sku] = float(row.price)
    return prices


def _parse(dt: str | None) -> datetime | None:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except ValueError:
        return None


def analyze(skus: list[dict], users: list[dict], prices: dict[str, float], inactive_days: int, now: datetime | None = None) -> dict:
    """Lógica pura de detección (testeable sin Graph)."""
    now = now or datetime.now(timezone.utc)
    sku_names = {s["skuId"]: s["skuPartNumber"] for s in skus}

    def price(part: str) -> float:
        return 0.0 if part in FREE_SKUS else float(prices.get(part, 0.0))

    findings: list[dict] = []
    totals = {"disabled": 0.0, "inactive": 0.0, "unassigned": 0.0, "redundant": 0.0}
    licensed = 0
    cutoff = now - timedelta(days=inactive_days)
    for u in users:
        parts = [sku_names.get(lic.get("skuId"), lic.get("skuId")) for lic in u.get("assignedLicenses") or []]
        paid = [p for p in parts if price(p) > 0]
        if not parts:
            continue
        licensed += 1
        base = {"user": u.get("displayName"), "upn": u.get("userPrincipalName"), "licenses": parts}
        cost = round(sum(price(p) for p in paid), 2)
        if u.get("accountEnabled") is False:
            if cost:
                findings.append({**base, "type": "disabled", "detail": "Cuenta deshabilitada con licencias asignadas", "monthly": cost})
                totals["disabled"] += cost
            continue
        sia = u.get("signInActivity")
        if sia is not None or "signInActivity" in u:
            dates = [d for d in (_parse((sia or {}).get("lastSignInDateTime")), _parse((sia or {}).get("lastNonInteractiveSignInDateTime"))) if d]
            last = max(dates) if dates else None
            created = _parse(u.get("createdDateTime"))
            if (last and last < cutoff) or (not last and created and created < cutoff):
                if cost:
                    detail = f"Último inicio de sesión: {last.date().isoformat()}" if last else "Nunca ha iniciado sesión"
                    findings.append({**base, "type": "inactive", "detail": detail, "last_sign_in": last.isoformat() if last else None, "monthly": cost})
                    totals["inactive"] += cost
                continue
        pset = set(parts)
        for key, covered in REDUNDANT.items():
            if key in pset:
                dup = [c for c in covered if c in pset and price(c) > 0]
                if dup:
                    amount = round(sum(price(c) for c in dup), 2)
                    findings.append({**base, "type": "redundant", "detail": f"{', '.join(dup)} ya incluido(s) en {key}", "monthly": amount})
                    totals["redundant"] += amount
                    break
    sku_rows = []
    for s in skus:
        part = s["skuPartNumber"]
        enabled = int((s.get("prepaidUnits") or {}).get("enabled", 0))
        consumed = int(s.get("consumedUnits", 0))
        free_units = max(enabled - consumed, 0)
        unit = price(part)
        sku_rows.append({"sku": part, "enabled": enabled, "consumed": consumed, "unassigned": free_units, "price": unit})
        if free_units and unit and s.get("capabilityStatus", "Enabled") == "Enabled":
            amount = round(free_units * unit, 2)
            findings.append({"type": "unassigned", "user": None, "upn": None, "licenses": [part], "detail": f"{free_units} licencias compradas sin asignar", "monthly": amount})
            totals["unassigned"] += amount
    totals = {k: round(v, 2) for k, v in totals.items()}
    return {
        "findings": sorted(findings, key=lambda f: -f["monthly"]),
        "totals": totals,
        "waste_month": round(sum(totals.values()), 2),
        "licensed_users": licensed,
        "skus": sorted(sku_rows, key=lambda r: r["sku"]),
        "unknown_price_skus": sorted({r["sku"] for r in sku_rows if r["price"] == 0 and r["sku"] not in FREE_SKUS and r["consumed"]}),
    }


def fetch(conn: m365.M365Connection) -> tuple[list, list, bool]:
    g = m365.GraphClient(conn)
    skus = g.get_all("/subscribedSkus")
    sel = "id,displayName,userPrincipalName,accountEnabled,assignedLicenses,createdDateTime,userType"
    try:
        users = g.get_all(f"/users?$select={sel},signInActivity&$top=999")
        return skus, users, True
    except m365.GraphError as e:
        # Sin Entra ID P1 (o sin AuditLog.Read.All) no hay signInActivity.
        if "403" not in str(e) and "Premium" not in str(e) and "400" not in str(e):
            raise
        users = g.get_all(f"/users?$select={sel}&$top=999")
        return skus, users, False


def run_scan(db, tenant, conn: m365.M365Connection, limits: dict) -> LlScan:
    try:
        skus, users, signin = fetch(conn)
    except m365.GraphError as e:
        m365.mark_sync(db, conn, str(e))
        db.commit()
        raise HTTPException(502, f"Error consultando Microsoft 365: {str(e)[:200]}")
    cfg = settings_for(tenant)
    result = analyze(skus, users, prices_for(db, tenant.id), int(cfg["inactive_days"]))
    max_users = limits.get("users")
    if max_users is not None and result["licensed_users"] > max_users:
        m365.mark_sync(db, conn, f"El tenant tiene {result['licensed_users']} usuarios licenciados; tu plan permite {max_users}.")
        db.commit()
        raise HTTPException(402, f"El tenant tiene {result['licensed_users']} usuarios con licencia y tu plan permite {max_users}. Mejora tu plan.")
    scan = LlScan(
        tenant_id=tenant.id,
        connection_id=conn.id,
        users_scanned=len(users),
        licensed_users=result["licensed_users"],
        waste_month=result["waste_month"],
        summary={"totals": result["totals"], "unknown_price_skus": result["unknown_price_skus"], "inactive_days": cfg["inactive_days"]},
        skus=result["skus"],
        findings=result["findings"],
        signin_available=signin,
    )
    db.add(scan)
    m365.mark_sync(db, conn)
    db.commit()
    return scan


router = APIRouter(prefix="/api/licencialens")
dep = require_product(P)


def _conn(ctx: Ctx, cid: int) -> m365.M365Connection:
    c = ctx.db.scalar(select(m365.M365Connection).where(m365.M365Connection.id == cid, m365.M365Connection.tenant_id == ctx.tenant_id, m365.M365Connection.product == P))
    if not c:
        raise HTTPException(404, "Conexión no encontrada")
    return c


@router.get("/connections")
def connections(ctx: Ctx = Depends(dep)):
    rows = ctx.db.scalars(select(m365.M365Connection).where(m365.M365Connection.tenant_id == ctx.tenant_id, m365.M365Connection.product == P)).all()
    out = []
    for c in rows:
        last = ctx.db.scalar(select(LlScan).where(LlScan.connection_id == c.id).order_by(LlScan.id.desc()))
        out.append({**m365.serialize(c), "last_scan": {"id": last.id, "waste_month": last.waste_month, "ran_at": last.ran_at} if last else None})
    return out


@router.get("/connect-url")
def connect_url(ctx: Ctx = Depends(dep)):
    return {"url": m365.consent_url(ctx, P, "read")}


@router.delete("/connections/{cid}", status_code=204)
def delete_connection(cid: int, ctx: Ctx = Depends(dep)):
    ctx.db.delete(_conn(ctx, cid))
    ctx.db.commit()


@router.post("/connections/{cid}/scan")
def scan_now(cid: int, ctx: Ctx = Depends(dep)):
    scan = run_scan(ctx.db, ctx.tenant, _conn(ctx, cid), ctx.limits)
    return to_dict(scan)


@router.get("/scans")
def scans(connection_id: int | None = None, ctx: Ctx = Depends(dep)):
    q = select(LlScan).where(LlScan.tenant_id == ctx.tenant_id).order_by(LlScan.id.desc()).limit(50)
    if connection_id:
        q = q.where(LlScan.connection_id == connection_id)
    return [{k: v for k, v in to_dict(s).items() if k not in ("findings", "skus")} for s in ctx.db.scalars(q)]


def _scan(ctx: Ctx, sid: int) -> LlScan:
    s = ctx.db.scalar(select(LlScan).where(LlScan.id == sid, LlScan.tenant_id == ctx.tenant_id))
    if not s:
        raise HTTPException(404, "Escaneo no encontrado")
    return s


@router.get("/scans/{sid}")
def scan_detail(sid: int, ctx: Ctx = Depends(dep)):
    s = _scan(ctx, sid)
    conn = ctx.db.get(m365.M365Connection, s.connection_id)
    return to_dict(s, {"connection": m365.serialize(conn) if conn else None})


@router.get("/scans/{sid}/csv")
def scan_csv(sid: int, ctx: Ctx = Depends(dep)):
    s = _scan(ctx, sid)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["tipo", "usuario", "upn", "licencias", "detalle", "usd_mes"])
    for f in s.findings:
        w.writerow([f["type"], f.get("user") or "", f.get("upn") or "", " | ".join(f.get("licenses") or []), f["detail"], f["monthly"]])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="licencialens-{sid}.csv"'})


@router.get("/prices")
def get_prices(ctx: Ctx = Depends(dep)):
    return prices_for(ctx.db, ctx.tenant_id)


class PricesIn(BaseModel):
    prices: dict[str, float]


@router.put("/prices")
def put_prices(data: PricesIn, ctx: Ctx = Depends(dep)):
    existing = {p.sku: p for p in ctx.db.scalars(select(LlPrice).where(LlPrice.tenant_id == ctx.tenant_id))}
    for sku, price in data.prices.items():
        sku = sku.strip()[:100]
        if not sku or price < 0:
            continue
        if sku in existing:
            existing[sku].price = price
        else:
            ctx.db.add(LlPrice(tenant_id=ctx.tenant_id, sku=sku, price=price))
    ctx.db.commit()
    return prices_for(ctx.db, ctx.tenant_id)


class SettingsIn(BaseModel):
    inactive_days: int = Field(ge=7, le=365)
    report_emails: list[str] = []


@router.get("/settings")
def get_settings_ep(ctx: Ctx = Depends(dep)):
    return settings_for(ctx.tenant)


@router.put("/settings")
def put_settings(data: SettingsIn, ctx: Ctx = Depends(dep)):
    s = dict(ctx.tenant.settings or {})
    s[P] = data.model_dump()
    ctx.tenant.settings = s
    flag_modified(ctx.tenant, "settings")
    ctx.db.commit()
    return settings_for(ctx.tenant)


def run_monthly(db, tenant, limits: dict, today: date | None = None) -> int:
    today = today or date.today()
    if today.day != 1:
        return 0
    sent = 0
    conns = db.scalars(select(m365.M365Connection).where(m365.M365Connection.tenant_id == tenant.id, m365.M365Connection.product == P)).all()
    recipients = set(settings_for(tenant)["report_emails"]) | {u.email for u in tenant.users if u.role in ("owner", "admin") and u.is_active}
    for c in conns:
        try:
            scan = run_scan(db, tenant, c, limits)
        except HTTPException:
            continue
        t = scan.summary["totals"]
        subject = f"🔍 {c.display_name or c.default_domain}: USD {scan.waste_month:,.2f}/mes en licencias desperdiciadas"
        body = email_layout(
            subject,
            f"<ul><li>Cuentas deshabilitadas: USD {t['disabled']:,.2f}</li><li>Usuarios inactivos: USD {t['inactive']:,.2f}</li>"
            f"<li>Licencias sin asignar: USD {t['unassigned']:,.2f}</li><li>Licencias redundantes: USD {t['redundant']:,.2f}</li></ul>"
            f"<p>Ahorro anual potencial: <b>USD {scan.waste_month * 12:,.2f}</b></p>",
        )
        for to in recipients:
            if notify_once(db, f"ll:monthly:{c.id}:{today}:{to}", tenant.id, "email", to, subject, lambda to=to: send_email(to, subject, body)):
                sent += 1
    return sent

