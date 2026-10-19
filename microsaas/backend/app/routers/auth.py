from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import catalog
from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user, require_admin
from ..models import PasswordReset, Tenant, User
from ..notify import email_layout, send_email
from ..security import create_access_token, hash_password, new_token, sha256, verify_password
from ..subscriptions import get_subscription, serialize, start_trial

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    company: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    product: str
    lang: str = "es"
    country: str = Field(default="CO", min_length=2, max_length=2)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    name: str | None = None
    company: str | None = None
    lang: str | None = None
    country: str | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


def me_payload(db: Session, user: User) -> dict:
    t = user.tenant
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_superadmin": user.is_superadmin,
        "tenant": {"id": t.id, "name": t.name, "lang": t.lang, "country": t.country, "public_key": t.public_key},
        "subscriptions": [serialize(s) for s in t.subscriptions],
    }


def _token_response(db: Session, user: User) -> dict:
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {"access_token": create_access_token(user.id), "user": me_payload(db, user)}


@router.post("/signup")
def signup(data: SignupIn, db: Session = Depends(get_db)):
    if not catalog.get_product(data.product):
        raise HTTPException(400, "Producto inválido")
    email = data.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "Ya existe una cuenta con ese correo. Inicia sesión.")
    tenant = Tenant(name=data.company, lang=data.lang if data.lang in ("es", "en") else "es", country=data.country.upper(), public_key=new_token(18), settings={})
    db.add(tenant)
    db.flush()
    user = User(tenant_id=tenant.id, email=email, name=data.name, password_hash=hash_password(data.password), role="owner")
    db.add(user)
    start_trial(db, tenant.id, data.product)
    db.flush()
    p = catalog.get_product(data.product)
    s = get_settings()
    send_email(
        email,
        f"Bienvenido a {p['name']}",
        email_layout(
            f"¡Hola {data.name}!",
            f"<p>Tu prueba gratis de {p['name']} está activa por {s.trial_days} días. No necesitas tarjeta.</p>",
            f"{s.app_url}/app/{data.product}",
            "Entrar",
        ),
    )
    return _token_response(db, user)


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Correo o contraseña incorrectos")
    if not user.is_active or not user.tenant.is_active:
        raise HTTPException(403, "Cuenta desactivada")
    return _token_response(db, user)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return me_payload(db, user)


@router.patch("/me")
def update_me(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.name:
        user.name = data.name
    if data.new_password:
        if not data.current_password or not verify_password(data.current_password, user.password_hash):
            raise HTTPException(400, "Contraseña actual incorrecta")
        user.password_hash = hash_password(data.new_password)
    if user.role in ("owner", "admin"):
        if data.company:
            user.tenant.name = data.company
        if data.lang in ("es", "en"):
            user.tenant.lang = data.lang
        if data.country:
            user.tenant.country = data.country.upper()[:2]
    db.commit()
    return me_payload(db, user)


@router.post("/activate/{product}")
def activate_product(product: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Activa la prueba gratis de otro producto para la misma cuenta."""
    if not catalog.get_product(product):
        raise HTTPException(404, "Producto inválido")
    sub = get_subscription(db, user.tenant_id, product) or start_trial(db, user.tenant_id, product)
    db.commit()
    return serialize(sub)


@router.post("/forgot")
def forgot(data: ForgotIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if user and user.is_active:
        token = new_token(32)
        db.add(PasswordReset(user_id=user.id, token_hash=sha256(token), expires_at=datetime.now(timezone.utc) + timedelta(hours=2)))
        db.commit()
        s = get_settings()
        send_email(
            user.email,
            "Restablecer contraseña",
            email_layout("Restablecer contraseña", "<p>El enlace vence en 2 horas.</p>", f"{s.app_url}/reset?token={token}", "Crear nueva contraseña"),
        )
    return {"ok": True}


@router.post("/reset")
def reset(data: ResetIn, db: Session = Depends(get_db)):
    pr = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == sha256(data.token)))
    exp = pr.expires_at if pr and pr.expires_at.tzinfo else (pr.expires_at.replace(tzinfo=timezone.utc) if pr else None)
    if not pr or pr.used or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Enlace inválido o vencido")
    user = db.get(User, pr.user_id)
    user.password_hash = hash_password(data.password)
    pr.used = True
    db.commit()
    return _token_response(db, user)


# ---------- Equipo ----------
team = APIRouter(prefix="/api/team", tags=["team"])


class MemberIn(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    role: str = "member"


def _member(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "is_active": u.is_active, "last_login_at": u.last_login_at}


@team.get("")
def list_team(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_member(u) for u in db.scalars(select(User).where(User.tenant_id == user.tenant_id).order_by(User.id))]


@team.post("", status_code=201)
def add_member(data: MemberIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if data.role not in ("admin", "member"):
        raise HTTPException(400, "Rol inválido")
    if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(409, "Ese correo ya tiene cuenta")
    member = User(tenant_id=user.tenant_id, email=data.email.lower(), name=data.name, role=data.role, password_hash=hash_password(new_token(24)))
    db.add(member)
    db.flush()
    token = new_token(32)
    db.add(PasswordReset(user_id=member.id, token_hash=sha256(token), expires_at=datetime.now(timezone.utc) + timedelta(days=7)))
    db.commit()
    s = get_settings()
    send_email(
        member.email,
        f"{user.name} te invitó a {user.tenant.name}",
        email_layout("Te invitaron a un equipo", f"<p>{user.name} te agregó a {user.tenant.name}. Crea tu contraseña para entrar.</p>", f"{s.app_url}/reset?token={token}", "Crear contraseña"),
    )
    return _member(member)


@team.delete("/{member_id}", status_code=204)
def remove_member(member_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    member = db.get(User, member_id)
    if not member or member.tenant_id != user.tenant_id:
        raise HTTPException(404, "No encontrado")
    if member.role == "owner":
        raise HTTPException(400, "No se puede eliminar al propietario")
    db.delete(member)
    db.commit()
