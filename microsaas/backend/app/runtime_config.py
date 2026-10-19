"""Integraciones configurables desde el panel de superadmin.

Los valores guardados en la tabla `platform_settings` reemplazan a los de `.env`
en cada proceso (API y worker), que los recarga cada 30 segundos.
"""

import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .models import PlatformSetting

log = logging.getLogger("runtime_config")

# clave -> (tipo, es_secreto)
EDITABLE: dict[str, tuple[type, bool]] = {
    "paypal_mode": (str, False),
    "paypal_client_id": (str, False),
    "paypal_client_secret": (str, True),
    "paypal_webhook_id": (str, False),
    "paypal_brand_name": (str, False),
    "smtp_host": (str, False),
    "smtp_port": (int, False),
    "smtp_user": (str, False),
    "smtp_password": (str, True),
    "smtp_from": (str, False),
    "smtp_tls": (bool, False),
    "whatsapp_token": (str, True),
    "whatsapp_phone_id": (str, False),
    "whatsapp_template": (str, False),
    "whatsapp_lang": (str, False),
    "m365_read_client_id": (str, False),
    "m365_read_client_secret": (str, True),
    "m365_admin_client_id": (str, False),
    "m365_admin_client_secret": (str, True),
    "product_domains": (str, False),
    "analytics_ga4_id": (str, False),
    "analytics_plausible_domain": (str, False),
    "analytics_plausible_src": (str, False),
    "ads_meta_pixel_id": (str, False),
    "ads_linkedin_partner_id": (str, False),
}
PAYPAL_MODES = ("sandbox", "live", "mock")

_env_defaults: dict = {}
_applied: set[str] = set()
_last_refresh = {"t": 0.0}


def _coerce(key: str, raw: str):
    t = EDITABLE[key][0]
    if t is bool:
        return str(raw).strip().lower() in ("1", "true", "si", "sí", "yes", "on")
    if t is int:
        return int(raw)
    return raw


def refresh(db: Session) -> None:
    """Aplica los valores de la base de datos sobre la configuración del proceso."""
    s = get_settings()
    if not _env_defaults:
        _env_defaults.update({k: getattr(s, k) for k in EDITABLE})
    stored = {r.key: r.value for r in db.scalars(select(PlatformSetting)) if r.key in EDITABLE}
    changed_paypal = False
    for key in EDITABLE:
        if key in stored:
            value = _coerce(key, stored[key])
            _applied.add(key)
        elif key in _applied:
            value = _env_defaults[key]  # se borró de la base de datos: vuelve al valor de .env
            _applied.discard(key)
        else:
            continue
        if key == "paypal_mode" and value not in PAYPAL_MODES:
            continue
        if getattr(s, key) != value:
            if key.startswith("paypal_"):
                changed_paypal = True
            setattr(s, key, value)
    if changed_paypal:
        from . import paypal

        paypal._token.update(value=None, exp=0.0)
    _last_refresh["t"] = time.time()


def maybe_refresh(every: float = 30.0) -> None:
    if time.time() - _last_refresh["t"] < every:
        return
    from .db import SessionLocal

    db = SessionLocal()
    try:
        refresh(db)
    except Exception as e:  # la app sigue funcionando con la configuración de .env
        log.warning("No se pudo recargar la configuración: %s", e)
        _last_refresh["t"] = time.time()
    finally:
        db.close()


def save(db: Session, values: dict) -> None:
    for key, raw in values.items():
        if key not in EDITABLE or raw is None:
            continue
        raw = str(raw).strip()
        if EDITABLE[key][1] and (raw == "" or raw.startswith("••••")):
            continue  # secreto sin cambios
        if key == "paypal_mode" and raw not in PAYPAL_MODES:
            raise ValueError("Modo de PayPal inválido")
        if EDITABLE[key][0] is int and raw:
            int(raw)
        row = db.get(PlatformSetting, key)
        if row is None:
            db.add(PlatformSetting(key=key, value=raw))
        else:
            row.value = raw
    db.commit()
    refresh(db)


def public_view(s: Settings | None = None) -> dict:
    s = s or get_settings()
    out = {}
    for key, (_, secret) in EDITABLE.items():
        v = getattr(s, key)
        out[key] = ("••••••••" + str(v)[-4:] if v else "") if secret else v
    return out
