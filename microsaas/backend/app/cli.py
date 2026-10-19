"""Comandos de administración.

  python -m app.cli create-superadmin correo@dominio.com "Nombre" contraseña
  python -m app.cli paypal-sync                  # crea productos y planes en PayPal
  python -m app.cli paypal-webhook https://tu-dominio.com/api/billing/paypal/webhook
  python -m app.cli import-calendar archivo.csv  # calendario DIAN (TributAlerta)
"""

import sys

from sqlalchemy import func, select

from . import catalog, paypal
from .config import get_settings
from .db import SessionLocal, init_db
from .models import PayPalPlan, Tenant, User
from .security import hash_password, new_token


def create_superadmin(email: str, name: str, password: str) -> None:
    db = SessionLocal()
    user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
    if user:
        user.is_superadmin = True
        user.password_hash = hash_password(password)
    else:
        t = Tenant(name=f"{get_settings().app_name} (admin)", public_key=new_token(18), settings={})
        db.add(t)
        db.flush()
        db.add(User(tenant_id=t.id, email=email.lower(), name=name, password_hash=hash_password(password), role="owner", is_superadmin=True))
    db.commit()
    print(f"Superadmin listo: {email}")


def paypal_sync() -> None:
    if not paypal.enabled():
        sys.exit("Configura PAYPAL_MODE=sandbox|live, PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET")
    mode = get_settings().paypal_mode
    db = SessionLocal()
    for slug, p in catalog.PRODUCTS.items():
        existing = db.scalars(select(PayPalPlan).where(PayPalPlan.mode == mode, PayPalPlan.product == slug)).all()
        product_id = existing[0].paypal_product_id if existing else paypal.create_product(p["name"], p["tagline"]["en"])
        for plan in p["plans"]:
            for interval in ("month", "year"):
                price = catalog.plan_price(slug, plan["code"], interval)
                if any(e.plan == plan["code"] and e.interval == interval and e.price == price for e in existing):
                    continue
                label = "Monthly" if interval == "month" else "Yearly"
                plan_id = paypal.create_plan(product_id, f"{p['name']} {plan['name']} ({label})", f"{price:.2f}", interval)
                db.add(PayPalPlan(mode=mode, product=slug, plan=plan["code"], interval=interval, price=price, paypal_product_id=product_id, paypal_plan_id=plan_id))
                db.commit()
                print(f"  {slug}/{plan['code']}/{interval} USD {price} -> {plan_id}")
    print("Planes de PayPal sincronizados.")


def paypal_webhook(url: str) -> None:
    if not paypal.enabled():
        sys.exit("PayPal no configurado")
    wid = paypal.create_webhook(url)
    print(f"Webhook creado. Agrega a .env:  PAYPAL_WEBHOOK_ID={wid}")


def import_calendar(path: str) -> None:
    import asyncio

    from fastapi import UploadFile

    from .products.tributalerta import admin_import

    db = SessionLocal()
    with open(path, "rb") as fh:
        res = asyncio.run(admin_import(UploadFile(fh, filename=path), True, db))
    print(res)


def main() -> None:
    init_db()
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]
    if cmd == "create-superadmin" and len(rest) == 3:
        create_superadmin(*rest)
    elif cmd == "paypal-sync":
        paypal_sync()
    elif cmd == "paypal-webhook" and len(rest) == 1:
        paypal_webhook(rest[0])
    elif cmd == "import-calendar" and len(rest) == 1:
        import_calendar(rest[0])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
