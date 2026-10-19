from fastapi import APIRouter, Request

from .. import catalog, paypal
from ..config import get_settings

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/catalog")
def get_catalog():
    s = get_settings()
    return {
        "products": catalog.public_catalog(),
        "trial_days": s.trial_days,
        "annual_multiplier": catalog.ANNUAL_MULTIPLIER,
        "payments": "paypal" if paypal.enabled() else s.paypal_mode,
    }


@router.get("/context")
def context(request: Request):
    """Devuelve el producto asociado al dominio (si hay dominios propios configurados)."""
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0].lower()
    host = host.removeprefix("www.")
    return {"host": host, "product": get_settings().domain_map.get(host)}
