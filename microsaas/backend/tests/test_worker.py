from datetime import date, datetime, timedelta, timezone

from app import worker
from app.db import SessionLocal
from app.models import NotificationLog, Subscription


def test_daily_jobs_and_trial_reminders(client, signup):
    h, data = signup("venceya")
    tid = data["user"]["tenant"]["id"]
    e = client.post("/api/venceya/entities", json={"name": "Moto"}, headers=h).json()
    client.post("/api/venceya/documents", json={"entity_id": e["id"], "doc_type": "SOAT", "expires_on": (date.today() + timedelta(days=1)).isoformat()}, headers=h)
    db = SessionLocal()
    sub = db.query(Subscription).filter_by(tenant_id=tid, product="venceya").one()
    sub.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=3, hours=1)
    db.commit()

    worker.daily()
    worker.hourly()
    keys = {k for (k,) in db.query(NotificationLog.key).filter_by(tenant_id=tid)}
    assert f"trial:{sub.id}:3" in keys
    assert any(k.startswith("vy:") for k in keys)
    # Una segunda ejecución no duplica envíos
    before = db.query(NotificationLog).filter_by(tenant_id=tid).count()
    worker.daily()
    assert db.query(NotificationLog).filter_by(tenant_id=tid).count() == before

    # Sin acceso (prueba vencida) no se ejecutan tareas del producto
    sub.trial_ends_at = datetime.now(timezone.utc) - timedelta(days=10)
    db.commit()
    db.query(NotificationLog).filter(NotificationLog.tenant_id == tid, NotificationLog.key.like("vy:%")).delete(synchronize_session=False)
    db.commit()
    worker.daily()
    assert not db.query(NotificationLog).filter(NotificationLog.tenant_id == tid, NotificationLog.key.like("vy:%")).count()
    db.close()
