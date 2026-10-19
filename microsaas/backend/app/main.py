import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .products.registry import ROUTERS
from . import runtime_config
from .routers import admin, auth, billing, public

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("alembic.runtime.plugins").setLevel(logging.WARNING)

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    runtime_config.maybe_refresh(every=0)
    yield


app = FastAPI(title=f"{settings.app_name} API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def reload_integrations(request: Request, call_next):
    runtime_config.maybe_refresh()
    return await call_next(request)


for r in (auth.router, auth.team, billing.router, public.router, admin.router, *ROUTERS):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True}
