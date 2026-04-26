"""
Router HTTP para la gestión de usuarios y sesiones de interacción WoZ.

Endpoints
─────────
  Usuarios:
    POST /users                  – Crea un nuevo participante.
    GET  /users                  – Lista todos los participantes.
    GET  /users/{id}             – Obtiene info de un participante.

  Sesiones:
    POST /sessions/start         – Inicia una nueva sesión.
    POST /sessions/{id}/end      – Cierra la sesión.
    GET  /sessions/{id}/messages – Mensajes de la sesión.
    GET  /sessions/{id}/events   – Eventos del robot.

Flujo típico
────────────
  1. POST /users → registra participante → user_id
  2. POST /sessions/start { user_id } → session_id
  3. POST /messages/send { session_id, ... } → mensaje persistido
  4. POST /sessions/{id}/end → sesión cerrada
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.db_models import Message, RobotEvent, Session, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users", "sessions"])


# ── Schemas de entrada ───────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    """Información demográfica del participante."""
    name: str
    age: int | None = None
    gender: str | None = None  # M/F/Other
    notes: str | None = None


class SessionStartRequest(BaseModel):
    """Metadatos opcionales que el investigador puede adjuntar a la sesión."""
    user_id: uuid.UUID | None = None  # participante, si ya está registrado
    condition: str | None = None      # e.g. "baseline", "experimental"
    notes: str | None = None


# ── Endpoints: Usuarios ──────────────────────────────────────────────────────

@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    summary="Registra un nuevo participante",
    tags=["users"],
)
async def create_user(
    body: UserCreateRequest,
    db:   AsyncSession = Depends(get_db),
):
    user = User(
        name=body.name,
        age=body.age,
        gender=body.gender,
        notes=body.notes,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info("[user] Creado | id=%s | name=%r", user.id, user.name)
    return {
        "user_id": str(user.id),
        "name": user.name,
        "age": user.age,
        "gender": user.gender,
        "created_at": user.created_at,
    }


@router.get(
    "/users",
    status_code=status.HTTP_200_OK,
    summary="Lista todos los participantes",
    tags=["users"],
)
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "user_id": str(u.id),
            "name": u.name,
            "age": u.age,
            "gender": u.gender,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.get(
    "/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Obtiene información de un participante",
    tags=["users"],
)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participante no encontrado.")
    return {
        "user_id": str(user.id),
        "name": user.name,
        "age": user.age,
        "gender": user.gender,
        "notes": user.notes,
        "created_at": user.created_at,
    }


# ── Endpoints: Sesiones ───────────────────────────────────────────────────────

@router.post(
    "/sessions/start",
    status_code=status.HTTP_201_CREATED,
    summary="Inicia una nueva sesión de interacción",
    tags=["sessions"],
)
async def start_session(
    body: SessionStartRequest = SessionStartRequest(),
    db:   AsyncSession        = Depends(get_db),
):
    # Verificar que el usuario existe si se proporciona
    if body.user_id is not None:
        result = await db.execute(select(User).where(User.id == body.user_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Participante no encontrado.")

    info = {}
    if body.condition:
        info["condition"] = body.condition
    if body.notes:
        info["notes"] = body.notes

    session = Session(
        user_id=body.user_id,
        info=info,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info("[session] Iniciada | id=%s | user=%s", session.id, body.user_id)
    return {"session_id": str(session.id), "user_id": str(body.user_id) if body.user_id else None, "started_at": session.started_at}


@router.post(
    "/sessions/{session_id}/end",
    status_code=status.HTTP_200_OK,
    summary="Cierra una sesión activa",
    tags=["sessions"],
)
async def end_session(
    session_id: uuid.UUID,
    db:         AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada.")
    if session.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión ya fue cerrada.")

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("[session] Cerrada | id=%s", session_id)
    return {"session_id": str(session_id), "ended_at": session.ended_at}


@router.get(
    "/sessions/{session_id}/messages",
    status_code=status.HTTP_200_OK,
    summary="Mensajes registrados en una sesión",
    tags=["sessions"],
)
async def get_session_messages(
    session_id: uuid.UUID,
    db:         AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.sent_at)
    )
    messages = result.scalars().all()
    return [
        {
            "id":       str(m.id),
            "sent_at":  m.sent_at,
            "text":     m.text,
            "origin":   m.origin,
            "emotion":  m.emotion,
            "extra":    m.extra,
        }
        for m in messages
    ]


@router.get(
    "/sessions/{session_id}/events",
    status_code=status.HTTP_200_OK,
    summary="Eventos del robot registrados en una sesión",
    tags=["sessions"],
)
async def get_session_events(
    session_id: uuid.UUID,
    db:         AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RobotEvent)
        .where(RobotEvent.session_id == session_id)
        .order_by(RobotEvent.occurred_at)
    )
    events = result.scalars().all()
    return [
        {
            "id":          str(e.id),
            "event_type":  e.event_type,
            "occurred_at": e.occurred_at,
            "message_id":  str(e.message_id) if e.message_id else None,
        }
        for e in events
    ]
