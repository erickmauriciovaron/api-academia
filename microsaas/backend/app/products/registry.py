"""Registro central de los 10 productos: routers HTTP y tareas programadas."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_product
from ..models import User
from ..security import verify_state
from . import assettrack, cobrabot, datosok, helpdesk, licencialens, lineacontrol, m365, offboardkit, sst0312, tributalerta, venceya

ROUTERS = [
    licencialens.router,
    offboardkit.router,
    assettrack.router,
    assettrack.public,
    venceya.router,
    cobrabot.router,
    tributalerta.router,
    tributalerta.admin,
    lineacontrol.router,
    datosok.router,
    datosok.public,
    sst0312.router,
    helpdesk.router,
    helpdesk.public,
]

# Tareas diarias por producto: fn(db, tenant, limits) -> número de notificaciones enviadas
DAILY_JOBS = {
    "venceya": lambda db, t, limits: venceya.run_alerts(db, t),
    "cobrabot": lambda db, t, limits: cobrabot.run_reminders(db, t),
    "tributalerta": lambda db, t, limits: tributalerta.run_alerts(db, t),
    "assettrack": lambda db, t, limits: assettrack.run_alerts(db, t),
    "lineacontrol": lambda db, t, limits: lineacontrol.run_alerts(db, t),
    "datosok": lambda db, t, limits: datosok.run_alerts(db, t),
    "sst0312": lambda db, t, limits: sst0312.run_alerts(db, t),
    "licencialens": lambda db, t, limits: licencialens.run_monthly(db, t, limits),
}
HOURLY_JOBS = {"helpdesk": lambda db, t, limits: helpdesk.run_sla_alerts(db, t)}


# ---------- Callback del consentimiento de Microsoft 365 ----------
m365_router = APIRouter(prefix="/api/m365", tags=["m365"])


class CallbackIn(BaseModel):
    state: str
    tenant: str | None = None
    admin_consent: str | None = None
    error: str | None = None
    error_description: str | None = None


@m365_router.post("/callback")
def m365_callback(data: CallbackIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    value = verify_state(data.state)
    if not value:
        raise HTTPException(400, "Estado inválido")
    product = value.split(":")[1]
    if product not in ("licencialens", "offboardkit"):
        raise HTTPException(400, "Producto inválido")
    ctx = require_product(product)(user=user, db=db)
    if not data.tenant and not data.error:
        raise HTTPException(400, "Microsoft no devolvió el tenant")
    conn = m365.complete_consent(ctx, data.state, data.tenant or "", data.admin_consent, data.error_description or data.error)
    return {"product": product, "connection": m365.serialize(conn)}


ROUTERS.append(m365_router)
