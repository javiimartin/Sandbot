"""
Router HTTP para el envío de mensajes del mago al robot.

POST /messages/send
───────────────────
  1. Reenvía el texto al robot via WebSocket (wizard_message).
  2. Confirma la entrega al wizard frontend (delivered).
  3. Si se incluye session_id en el body, persiste el mensaje en la BD.
     Si no, el relé funciona igualmente (compatibilidad hacia atrás).

POST /messages/emotion
──────────────────────
  Reenvía la emoción al robot. No requiere sesión activa.
"""

import logging
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.connection_manager import ClientRole, manager
from app.database import get_db
from app.db_models import Message
from app.models import (
    EmotionMessageRequest,
    WizardMessageRequest,
    make_delivered,
    make_emotion,
    make_wizard_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post(
    "/send",
    status_code=status.HTTP_200_OK,
    summary="Envía un mensaje del mago al robot",
)
async def send_wizard_message(
    body: WizardMessageRequest,
    db:   AsyncSession = Depends(get_db),
):
    if not body.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El texto del mensaje no puede estar vacío.",
        )

    logger.info(
        "[send] Mago → Robot | id=%s | origin=%s | emotion=%s | text=%r",
        body.message_id, body.origin, body.emotion, body.text,
    )

    # 1. Relay al robot
    await manager.send_to_role(
        ClientRole.ROBOT,
        make_wizard_message(body.text, body.message_id),
    )

    # 2. Confirmación al wizard frontend
    await manager.send_to_role(
        ClientRole.WIZARD,
        make_delivered(body.message_id),
    )

    # 3. Persistencia en BD (solo si hay sesión activa)
    if body.session_id is not None:
        try:
            msg_uuid = _uuid.UUID(body.message_id)
        except ValueError:
            msg_uuid = _uuid.uuid4()

        record = Message(
            id=msg_uuid,
            session_id=body.session_id,
            text=body.text,
            origin=body.origin.value,
            emotion=body.emotion,
        )
        db.add(record)
        await db.commit()
        logger.debug("[send] Mensaje persistido | id=%s | session=%s", msg_uuid, body.session_id)

    return {"status": "ok", "message_id": body.message_id}


@router.post(
    "/emotion",
    status_code=status.HTTP_200_OK,
    summary="Envía una emoción para que el robot la muestre",
)
async def send_robot_emotion(body: EmotionMessageRequest):
    logger.info("[send] Mago → Robot emotion | emotion=%s", body.emotion)

    await manager.send_to_role(
        ClientRole.ROBOT,
        make_emotion(body.emotion),
    )

    return {"status": "ok", "emotion": body.emotion}
