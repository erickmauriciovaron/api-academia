from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TenantMixin:
    """Columnas comunes de toda tabla multi-tenant."""

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


_settings = get_settings()
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Importa todos los modelos para que queden registrados en Base.metadata
    from . import models  # noqa: F401
    from .products import registry  # noqa: F401

    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            # Varios workers arrancan a la vez: serializamos la creación de tablas.
            conn.execute(text("SELECT pg_advisory_xact_lock(724001)"))
        Base.metadata.create_all(conn)
