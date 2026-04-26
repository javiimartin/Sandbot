"""
Router HTTP para el registro de eventos temporales del robot.

POST /events/robot
──────────────────
Recibe marcas temporales de eventos básicos del robot (started_listening,
started_speaking) y las persiste en robot_events.

El robot Android puede llamar a este endpoint directamente vía REST,
o bien enviar los eventos por WebSocket (tipo robot_event) si ya tiene
una conexión abierta con /ws/robot — ambas vías son equivalentes.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.db_models import RobotEvent, Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])

RobotEventType = Literal["started_listening", "started_speaking"]


class RobotEventRequest(BaseModel):
    event_type:  RobotEventType
    session_id:  uuid.UUID | None = None
    message_id:  uuid.UUID | None = None  # mensaje que desencadenó el evento (opcional)
    occurred_at: datetime | None  = None  # si es None, se usa la hora del servidor


@router.post(
    "/robot",
    status_code=status.HTTP_201_CREATED,
    summary="Registra un evento temporal del robot",
)
async def log_robot_event(
    body: RobotEventRequest,
    db:   AsyncSession = Depends(get_db),
):
    # Verificar que la sesión existe si se proporcionó
    if body.session_id is not None:
        result = await db.execute(
            select(Session).where(Session.id == body.session_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión no encontrada.")

    event = RobotEvent(
        session_id=body.session_id,
        message_id=body.message_id,
        event_type=body.event_type,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    logger.info(
        "[event] %s | session=%s | message=%s | at=%s",
        body.event_type,
        body.session_id,
        body.message_id,
        event.occurred_at,
    )
    return {"event_id": str(event.id), "occurred_at": event.occurred_at}
