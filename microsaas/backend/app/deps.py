from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .db import get_db
from .models import Subscription, Tenant, User
from .security import decode_access_token
from .subscriptions import get_subscription, has_access, limits_for


def get_current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    user_id = decode_access_token(authorization.split(" ", 1)[1])
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active or not user.tenant.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requiere rol administrador")
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if not user.is_superadmin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo superadministrador")
    return user


@dataclass
class Ctx:
    db: Session
    user: User
    tenant: Tenant
    sub: Subscription
    limits: dict

    @property
    def tenant_id(self) -> int:
        return self.tenant.id

    def check_limit(self, key: str, current: int, adding: int = 1) -> None:
        limit = self.limits.get(key)
        if limit is not None and current + adding > limit:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"Límite del plan alcanzado ({key}: {limit}). Mejora tu plan para continuar.",
            )


def require_product(product: str):
    def dep(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Ctx:
        sub = get_subscription(db, user.tenant_id, product)
        if not sub:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Producto no activado para tu cuenta")
        if not has_access(sub):
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Tu prueba o suscripción terminó. Activa un plan para continuar.")
        return Ctx(db=db, user=user, tenant=user.tenant, sub=sub, limits=limits_for(sub))

    return dep
