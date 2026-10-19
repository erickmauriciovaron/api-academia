"""Proceso de tareas programadas (contenedor `worker`).

Ejecutar: python -m app.worker            (planificador continuo)
          python -m app.worker --once     (ejecuta las tareas diarias una vez y termina)
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal, init_db
from .models import Subscription, Tenant
from .notify import email_layout, notify_once, send_email
from .products.registry import DAILY_JOBS, HOURLY_JOBS
from .subscriptions import has_access, limits_for

log = logging.getLogger("worker")


def _run_jobs(jobs: dict) -> None:
    db = SessionLocal()
    try:
        subs = db.scalars(select(Subscription).where(Subscription.product.in_(list(jobs.keys())))).all()
        for sub in subs:
            if not has_access(sub):
                continue
            tenant = db.get(Tenant, sub.tenant_id)
            if not tenant or not tenant.is_active:
                continue
            try:
                n = jobs[sub.product](db, tenant, limits_for(sub))
                if n:
                    log.info("%s tenant=%s notificaciones=%s", sub.product, tenant.id, n)
            except Exception:  # una falla de un tenant no detiene a los demás
                db.rollback()
                log.exception("Error en tarea %s tenant=%s", sub.product, sub.tenant_id)
    finally:
        db.close()


def trial_reminders() -> None:
    """Avisa 3 días y 0 días antes de que termine la prueba gratis."""
    s = get_settings()
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        subs = db.scalars(select(Subscription).where(Subscription.status == "trialing", Subscription.comp.is_(False))).all()
        for sub in subs:
            end = sub.trial_ends_at if sub.trial_ends_at.tzinfo else sub.trial_ends_at.replace(tzinfo=timezone.utc)
            days = (end.date() - now.date()).days
            if days not in (3, 0, -1):
                continue
            tenant = db.get(Tenant, sub.tenant_id)
            owner = next((u for u in tenant.users if u.role == "owner"), None)
            if not owner:
                continue
            from .catalog import get_product

            name = get_product(sub.product)["name"]
            if days > 0:
                subject = f"Tu prueba de {name} termina en {days} días"
            elif days == 0:
                subject = f"Tu prueba de {name} termina hoy"
            else:
                subject = f"Tu prueba de {name} terminó: activa tu plan para no perder el acceso"
            body = email_layout(subject, "<p>Tus datos se conservan. Activa un plan en un minuto con PayPal o tarjeta.</p>", f"{s.app_url}/app/billing", "Elegir plan")
            notify_once(db, f"trial:{sub.id}:{days}", tenant.id, "email", owner.email, subject, lambda: send_email(owner.email, subject, body))
    finally:
        db.close()


def daily() -> None:
    log.info("Tareas diarias")
    _run_jobs(DAILY_JOBS)
    trial_reminders()


def hourly() -> None:
    _run_jobs(HOURLY_JOBS)


def main() -> None:
    init_db()
    if "--once" in sys.argv:
        daily()
        hourly()
        return
    tz = get_settings().timezone
    sched = BlockingScheduler(timezone=tz)
    sched.add_job(daily, "cron", hour=7, minute=0, id="daily", misfire_grace_time=3600, coalesce=True)
    sched.add_job(hourly, "interval", minutes=30, id="hourly", next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30))
    log.info("Worker iniciado (zona horaria %s)", tz)
    sched.start()


if __name__ == "__main__":
    main()
