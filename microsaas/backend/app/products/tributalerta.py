"""TributAlerta: calendario tributario DIAN por NIT para contadores (Colombia)."""

import csv
import html
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint, delete, select
from sqlalchemy.orm import Mapped, mapped_column

from ..crud import crud_router, to_dict
from ..db import Base, TenantMixin, get_db
from ..deps import Ctx, require_product, require_superadmin
from ..notify import email_layout, notify_once, send_email

P = "tributalerta"
ALERT_DAYS = (7, 3, 1, 0)

OBLIGATIONS = {
    "renta_gc": "Renta grandes contribuyentes",
    "renta_pj": "Renta personas jurídicas",
    "renta_pn": "Renta personas naturales",
    "iva_bim": "IVA bimestral",
    "iva_cuat": "IVA cuatrimestral",
    "retefuente": "Retención en la fuente",
    "exogena": "Información exógena",
    "simple_anticipo": "Régimen SIMPLE - anticipo bimestral",
    "simple_anual": "Régimen SIMPLE - declaración anual",
    "patrimonio": "Impuesto al patrimonio",
    "activos_exterior": "Activos en el exterior",
}


class TaCalendar(Base):
    """Calendario oficial (global, lo carga el superadmin desde el decreto del año)."""

    __tablename__ = "ta_calendar"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    obligation: Mapped[str] = mapped_column(String(40), index=True)
    period: Mapped[str] = mapped_column(String(60))  # "Enero", "Bimestre 1", "Cuota 1", "Anual"...
    digits: Mapped[int] = mapped_column(Integer, default=1)  # cantidad de últimos dígitos del NIT que aplican (1 o 2)
    digit_from: Mapped[int] = mapped_column(Integer)
    digit_to: Mapped[int] = mapped_column(Integer)
    due_date: Mapped[date] = mapped_column(Date, index=True)


class TaClient(TenantMixin, Base):
    __tablename__ = "ta_clients"
    name: Mapped[str] = mapped_column(String(200))
    nit: Mapped[str] = mapped_column(String(20))  # sin dígito de verificación
    dv: Mapped[str | None] = mapped_column(String(2), nullable=True)
    taxpayer_type: Mapped[str] = mapped_column(String(4), default="pj")  # pn | pj | gc
    obligations: Mapped[list] = mapped_column(JSON, default=list)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notify_client: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class TaFiling(TenantMixin, Base):
    __tablename__ = "ta_filings"
    __table_args__ = (UniqueConstraint("tenant_id", "client_id", "obligation", "period", "due_date"),)
    client_id: Mapped[int] = mapped_column(ForeignKey("ta_clients.id", ondelete="CASCADE"), index=True)
    obligation: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(60))
    due_date: Mapped[date] = mapped_column(Date)
    filed_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class TaCustom(TenantMixin, Base):
    __tablename__ = "ta_custom"
    client_id: Mapped[int | None] = mapped_column(ForeignKey("ta_clients.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date] = mapped_column(Date, index=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)


def nit_suffix(nit: str, digits: int) -> int | None:
    clean = "".join(ch for ch in (nit or "") if ch.isdigit())
    return int(clean[-digits:]) if clean else None


def deadlines_for(db, tenant_id: int, start: date, end: date, client_id: int | None = None) -> list[dict]:
    q = select(TaClient).where(TaClient.tenant_id == tenant_id)
    if client_id:
        q = q.where(TaClient.id == client_id)
    clients = db.scalars(q).all()
    if not clients:
        return []
    cal = db.scalars(select(TaCalendar).where(TaCalendar.due_date >= start, TaCalendar.due_date <= end)).all()
    filed = {
        (f.client_id, f.obligation, f.period, f.due_date): f
        for f in db.scalars(select(TaFiling).where(TaFiling.tenant_id == tenant_id, TaFiling.due_date >= start, TaFiling.due_date <= end))
    }
    today = date.today()
    out = []
    for c in clients:
        obls = set(c.obligations or [])
        for row in cal:
            if row.obligation not in obls:
                continue
            suf = nit_suffix(c.nit, row.digits)
            if suf is None or not (row.digit_from <= suf <= row.digit_to):
                continue
            f = filed.get((c.id, row.obligation, row.period, row.due_date))
            out.append(
                {
                    "kind": "dian",
                    "client_id": c.id,
                    "client_name": c.name,
                    "nit": c.nit,
                    "obligation": row.obligation,
                    "obligation_label": OBLIGATIONS.get(row.obligation, row.obligation),
                    "period": row.period,
                    "due_date": row.due_date.isoformat(),
                    "days_left": (row.due_date - today).days,
                    "filed": bool(f),
                    "filing_id": f.id if f else None,
                    "filed_on": f.filed_on.isoformat() if f else None,
                }
            )
    cq = select(TaCustom).where(TaCustom.tenant_id == tenant_id, TaCustom.due_date >= start, TaCustom.due_date <= end)
    if client_id:
        cq = cq.where(TaCustom.client_id == client_id)
    names = {c.id: c.name for c in clients}
    for t in db.scalars(cq):
        out.append(
            {
                "kind": "custom",
                "custom_id": t.id,
                "client_id": t.client_id,
                "client_name": names.get(t.client_id, "") if t.client_id else "",
                "obligation": "custom",
                "obligation_label": t.title,
                "period": "",
                "due_date": t.due_date.isoformat(),
                "days_left": (t.due_date - today).days,
                "filed": t.done,
            }
        )
    out.sort(key=lambda x: (x["due_date"], x["client_name"]))
    return out


router = APIRouter(prefix="/api/tributalerta")
router.include_router(crud_router(TaClient, P, "/clients", limit_key="clients", search=("name", "nit"), order_by=TaClient.name))
router.include_router(crud_router(TaCustom, P, "/custom", order_by=TaCustom.due_date))


@router.get("/obligations")
def obligations():
    return OBLIGATIONS


@router.get("/deadlines")
def deadlines(start: date | None = None, end: date | None = None, client_id: int | None = None, ctx: Ctx = Depends(require_product(P))):
    start = start or date.today() - timedelta(days=7)
    end = end or date.today() + timedelta(days=60)
    if (end - start).days > 400:
        raise HTTPException(400, "Rango máximo de 400 días")
    return deadlines_for(ctx.db, ctx.tenant_id, start, end, client_id)


class FilingIn(BaseModel):
    client_id: int
    obligation: str
    period: str
    due_date: date
    note: str | None = None


@router.post("/filings", status_code=201)
def mark_filed(data: FilingIn, ctx: Ctx = Depends(require_product(P))):
    client = ctx.db.scalar(select(TaClient).where(TaClient.id == data.client_id, TaClient.tenant_id == ctx.tenant_id))
    if not client:
        raise HTTPException(404, "Cliente no encontrado")
    existing = ctx.db.scalar(
        select(TaFiling).where(
            TaFiling.tenant_id == ctx.tenant_id,
            TaFiling.client_id == data.client_id,
            TaFiling.obligation == data.obligation,
            TaFiling.period == data.period,
            TaFiling.due_date == data.due_date,
        )
    )
    if existing:
        return to_dict(existing)
    f = TaFiling(tenant_id=ctx.tenant_id, filed_on=date.today(), **data.model_dump())
    ctx.db.add(f)
    ctx.db.commit()
    return to_dict(f)


@router.delete("/filings/{filing_id}", status_code=204)
def unmark_filed(filing_id: int, ctx: Ctx = Depends(require_product(P))):
    f = ctx.db.scalar(select(TaFiling).where(TaFiling.id == filing_id, TaFiling.tenant_id == ctx.tenant_id))
    if not f:
        raise HTTPException(404, "No encontrado")
    ctx.db.delete(f)
    ctx.db.commit()


@router.get("/calendar/years")
def calendar_years(ctx: Ctx = Depends(require_product(P))):
    rows = ctx.db.execute(select(TaCalendar.year).distinct()).scalars().all()
    return sorted(rows)


# ---------- Administración del calendario (superadmin) ----------
admin = APIRouter(prefix="/api/admin/tributalerta", tags=["admin"], dependencies=[Depends(require_superadmin)])


@admin.get("/calendar")
def admin_calendar(year: int, db=Depends(get_db)):
    rows = db.scalars(select(TaCalendar).where(TaCalendar.year == year).order_by(TaCalendar.due_date)).all()
    return [to_dict(r) for r in rows]


@admin.post("/calendar/import")
async def admin_import(file: UploadFile = File(...), replace_year: bool = True, db=Depends(get_db)):
    """CSV con columnas: year,obligation,period,digits,digit_from,digit_to,due_date (AAAA-MM-DD)."""
    raw = (await file.read()).decode("utf-8-sig")
    delim = ";" if raw[:2048].count(";") > raw[:2048].count(",") else ","
    rows, errors = [], []
    for i, r in enumerate(csv.DictReader(io.StringIO(raw), delimiter=delim), start=2):
        try:
            obl = r["obligation"].strip()
            if obl not in OBLIGATIONS:
                raise ValueError(f"obligación desconocida '{obl}'")
            rows.append(
                TaCalendar(
                    year=int(r["year"]),
                    obligation=obl,
                    period=r["period"].strip(),
                    digits=int(r.get("digits") or 1),
                    digit_from=int(r["digit_from"]),
                    digit_to=int(r["digit_to"]),
                    due_date=date.fromisoformat(r["due_date"].strip()),
                )
            )
        except (KeyError, ValueError) as e:
            errors.append({"row": i, "error": str(e)})
    if errors:
        return {"created": 0, "errors": errors[:50]}
    if replace_year:
        for y in {r.year for r in rows}:
            db.execute(delete(TaCalendar).where(TaCalendar.year == y))
    db.add_all(rows)
    db.commit()
    return {"created": len(rows), "errors": []}


def run_alerts(db, tenant, today: date | None = None) -> int:
    today = today or date.today()
    items = [d for d in deadlines_for(db, tenant.id, today, today + timedelta(days=max(ALERT_DAYS))) if not d["filed"] and d["days_left"] in ALERT_DAYS]
    if not items:
        return 0
    sent = 0
    rows = "".join(
        f"<tr><td>{html.escape(d['due_date'])}</td><td>{html.escape(d['client_name'])}</td><td>{html.escape(d['obligation_label'])} {html.escape(d['period'])}</td></tr>"
        for d in items
    )
    subject = f"📅 {len(items)} vencimientos tributarios próximos"
    body = email_layout(subject, f'<table cellpadding="6" border="1" style="border-collapse:collapse">{rows}</table>')
    for u in tenant.users:
        if u.role in ("owner", "admin") and u.is_active:
            if notify_once(db, f"ta:digest:{tenant.id}:{today}:{u.email}", tenant.id, "email", u.email, subject, lambda u=u: send_email(u.email, subject, body)):
                sent += 1
    clients = {c.id: c for c in db.scalars(select(TaClient).where(TaClient.tenant_id == tenant.id, TaClient.notify_client.is_(True)))}
    for d in items:
        c = clients.get(d["client_id"])
        if not c or not c.email or d["days_left"] not in (7, 1):
            continue
        subj = f"Recordatorio: {d['obligation_label']} {d['period']} vence el {d['due_date']}"
        b = email_layout(subj, f"<p>Hola {html.escape(c.name)}, te recordamos enviar la información a tu contador a tiempo.</p>")
        key = f"ta:client:{c.id}:{d['obligation']}:{d['period']}:{d['due_date']}:{d['days_left']}"
        if notify_once(db, key, tenant.id, "email", c.email, subj, lambda: send_email(c.email, subj, b)):
            sent += 1
    return sent

