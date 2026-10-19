import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

ALGO = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, s.secret_key, algorithm=ALGO)


def decode_access_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=[ALGO])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def new_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def sign_state(value: str) -> str:
    """Firma corta para parámetros `state` de OAuth."""
    mac = hashlib.sha256((get_settings().secret_key + value).encode()).hexdigest()[:24]
    return f"{value}.{mac}"


def verify_state(state: str) -> str | None:
    value, _, mac = state.rpartition(".")
    return value if value and sign_state(value) == state else None
