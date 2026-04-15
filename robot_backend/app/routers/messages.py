"""
Router HTTP para el envío de mensajes del mago al robot.

POST /messages/send
───────────────────
  1. Reenvía el texto al robot via WebSocket (wizard_message).
  2. Confirma la entrega al wizard frontend (delivered).
     Si no hay robot conectado, se confirma igualmente para no
     bloquear la UI — el frontend puede añadir lógica de "sin robot"
     en el futuro.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.connection_manager import manager, ClientRole
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
async def send_wizard_message(body: WizardMessageRequest):
    """
    Recibe el texto que el mago quiere que diga el robot y:
      - Lo reenvía a todos los clientes con rol ROBOT via WS.
      - Confirma la entrega al wizard frontend via WS (delivered).
    """
    if not body.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El texto del mensaje no puede estar vacío.",
        )

    logger.info("[send] Mago → Robot | id=%s | text=%r", body.message_id, body.text)

    # 1. Send to robot(s)
    await manager.send_to_role(
        ClientRole.ROBOT,
        make_wizard_message(body.text, body.message_id),
    )

    # 2. Confirm delivery to wizard frontend
    await manager.send_to_role(
        ClientRole.WIZARD,
        make_delivered(body.message_id),
    )

    return {"status": "ok", "message_id": body.message_id}


@router.post(
    "/emotion",
    status_code=status.HTTP_200_OK,
    summary="Envía una emoción para que el robot la muestre",
)
async def send_robot_emotion(body: EmotionMessageRequest):
    """
    Recibe una emoción y la reenvía a todos los robots conectados via WebSocket.
    """
    logger.info("[send] Mago → Robot emotion | emotion=%s", body.emotion)

    await manager.send_to_role(
        ClientRole.ROBOT,
        make_emotion(body.emotion),
    )

    return {"status": "ok", "emotion": body.emotion}