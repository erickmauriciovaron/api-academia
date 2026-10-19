import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ["PAYPAL_MODE"] = "mock"
os.environ["SECRET_KEY"] = "test-secret-key-with-enough-length-0123456789"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


@pytest.fixture
def signup(client):
    def _signup(product: str, **extra):
        _counter["n"] += 1
        email = f"user{_counter['n']}@example.com"
        r = client.post(
            "/api/auth/signup",
            json={"name": "Test User", "company": f"Empresa {_counter['n']}", "email": email, "password": "Secreta123", "product": product, **extra},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        return {"Authorization": f"Bearer {data['access_token']}"}, data

    return _signup
