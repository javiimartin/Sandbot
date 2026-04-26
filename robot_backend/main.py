"""
Punto de entrada de la aplicación FastAPI.

Arranque en desarrollo:
  uvicorn main:app --reload

Arranque en producción (Docker):
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import events      as events_router
from app.routers import messages    as msg_router
from app.routers import sessions    as sessions_router
from app.routers import websocket   as ws_router

# ── Logging ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Ciclo de vida ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crea las tablas si no existen (idempotente)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Base de datos lista.")
    yield
    await engine.dispose()


# ── App factory ──────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — en producción restringe allowed_origins en el .env
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────
app.include_router(ws_router.router)
app.include_router(msg_router.router)
app.include_router(sessions_router.router)
app.include_router(events_router.router)


# ── Health check ─────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
async def health():
    """Endpoint de comprobación de estado. Útil para Docker healthcheck."""
    return {"status": "ok", "version": settings.app_version}
