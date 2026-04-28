"""
Router HTTP para la gestión de usuarios y sesiones de interacción WoZ.

Endpoints — Usuarios
────────────────────
  POST /users              – Registra un nuevo participante.
  GET  /users              – Lista todos los participantes.
  GET  /users/{id}         – Datos de un participante.

Endpoints — Sesiones
────────────────────
  POST /sessions/start             – Inicia una nueva sesión.
  POST /sessions/{id}/end          – Cierra una sesión activa.
  GET  /sessions                   – Lista todas las sesiones (resumen).
  GET  /sessions/{id}/messages     – Mensajes de la sesión.
  GET  /sessions/{id}/events       – Eventos del robot en la sesión.
  GET  /sessions/{id}/log          – Registro cronológico unificado
                                     (mensajes + eventos del robot).
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
from app import session_state

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users", "sessions"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    name:   str
    age:    int | None = None
    gender: str | None = None  # M / F / Other
    notes:  str | None = None


class SessionStartRequest(BaseModel):
    name:      str                  # nombre identificativo de la sesión
    user_id:   uuid.UUID | None = None
    condition: str | None = None    # e.g. "baseline", "experimental"
    notes:     str | None = None


# ── Usuarios ─────────────────────────────────────────────────────────────────

@router.post("/users", status_code=status.HTTP_201_CREATED, tags=["users"],
             summary="Registra un nuevo participante")
async def create_user(body: UserCreateRequest, db: AsyncSession = Depends(get_db)):
    user = User(name=body.name, age=body.age, gender=body.gender, notes=body.notes)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("[user] Creado | id=%s | name=%r", user.id, user.name)
    return {"user_id": str(user.id), "name": user.name, "age": user.age,
            "gender": user.gender, "created_at": user.created_at}


@router.get("/users", status_code=status.HTTP_200_OK, tags=["users"],
            summary="Lista todos los participantes")
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [{"user_id": str(u.id), "name": u.name, "age": u.age,
             "gender": u.gender, "created_at": u.created_at}
            for u in users]


@router.get("/users/{user_id}", status_code=status.HTTP_200_OK, tags=["users"],
            summary="Datos de un participante")
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participante no encontrado.")
    return {"user_id": str(user.id), "name": user.name, "age": user.age,
            "gender": user.gender, "notes": user.notes, "created_at": user.created_at}


# ── Sesiones ──────────────────────────────────────────────────────────────────

@router.post("/sessions/start", status_code=status.HTTP_201_CREATED, tags=["sessions"],
             summary="Inicia una nueva sesión de interacción")
async def start_session(body: SessionStartRequest, db: AsyncSession = Depends(get_db)):
    if body.user_id is not None:
        result = await db.execute(select(User).where(User.id == body.user_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Participante no encontrado.")

    info = {k: v for k, v in {"condition": body.condition, "notes": body.notes}.items() if v}
    session = Session(user_id=body.user_id, name=body.name, info=info)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    session_state.set_active(session.id)
    logger.info("[session] Iniciada | id=%s | name=%r | user=%s",
                session.id, session.name, body.user_id)
    return {"session_id": str(session.id), "name": session.name,
            "user_id": str(body.user_id) if body.user_id else None,
            "started_at": session.started_at}


@router.post("/sessions/{session_id}/end", status_code=status.HTTP_200_OK, tags=["sessions"],
             summary="Cierra una sesión activa")
async def end_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada.")
    if session.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión ya fue cerrada.")

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    session_state.set_active(None)
    logger.info("[session] Cerrada | id=%s", session_id)
    return {"session_id": str(session_id), "ended_at": session.ended_at}


@router.get("/sessions", status_code=status.HTTP_200_OK, tags=["sessions"],
            summary="Lista todas las sesiones")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Session, User)
        .outerjoin(User, Session.user_id == User.id)
        .order_by(Session.started_at.desc())
    )
    rows = result.all()
    return [
        {
            "session_id":  str(s.id),
            "name":        s.name,
            "user_name":   u.name if u else None,
            "started_at":  s.started_at,
            "ended_at":    s.ended_at,
            "duration_s":  int((s.ended_at - s.started_at).total_seconds())
                           if s.ended_at else None,
        }
        for s, u in rows
    ]


@router.get("/sessions/{session_id}/messages", status_code=status.HTTP_200_OK,
            tags=["sessions"], summary="Mensajes registrados en una sesión")
async def get_session_messages(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.sent_at)
    )
    messages = result.scalars().all()
    return [{"id": str(m.id), "sent_at": m.sent_at, "text": m.text,
             "origin": m.origin, "emotion": m.emotion, "extra": m.extra}
            for m in messages]


@router.get("/sessions/{session_id}/events", status_code=status.HTTP_200_OK,
            tags=["sessions"], summary="Eventos del robot en una sesión")
async def get_session_events(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RobotEvent)
        .where(RobotEvent.session_id == session_id)
        .order_by(RobotEvent.occurred_at)
    )
    events = result.scalars().all()
    return [{"id": str(e.id), "event_type": e.event_type, "occurred_at": e.occurred_at,
             "message_id": str(e.message_id) if e.message_id else None}
            for e in events]


@router.get("/sessions/{session_id}/log", status_code=status.HTTP_200_OK,
            tags=["sessions"], summary="Registro cronológico completo de la sesión")
async def get_session_log(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    Devuelve todos los mensajes y eventos del robot ordenados cronológicamente.
    Útil como registro completo de la sesión para análisis posterior.

    Cada entrada tiene:
      - kind:        'message' | 'robot_event'
      - timestamp:   marca temporal
      - [mensajes]   text, origin, emotion
      - [eventos]    event_type
    """
    # Sesión + usuario
    res = await db.execute(
        select(Session, User)
        .outerjoin(User, Session.user_id == User.id)
        .where(Session.id == session_id)
    )
    row = res.first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada.")
    session, user = row

    # Mensajes
    msg_res = await db.execute(
        select(Message).where(Message.session_id == session_id)
    )
    messages = msg_res.scalars().all()

    # Eventos
    evt_res = await db.execute(
        select(RobotEvent).where(RobotEvent.session_id == session_id)
    )
    events = evt_res.scalars().all()

    # Combinar y ordenar cronológicamente
    entries = []
    for m in messages:
        entries.append({
            "kind":      "message",
            "timestamp": m.sent_at,
            "id":        str(m.id),
            "text":      m.text,
            "origin":    m.origin,
            "emotion":   m.emotion,
        })
    for e in events:
        entries.append({
            "kind":       "robot_event",
            "timestamp":  e.occurred_at,
            "id":         str(e.id),
            "event_type": e.event_type,
            "message_id": str(e.message_id) if e.message_id else None,
        })

    entries.sort(key=lambda x: x["timestamp"])

    return {
        "session": {
            "id":         str(session.id),
            "name":       session.name,
            "user_name":  user.name if user else None,
            "started_at": session.started_at,
            "ended_at":   session.ended_at,
        },
        "log": entries,
    }
