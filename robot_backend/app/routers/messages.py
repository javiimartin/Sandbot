"""
Router HTTP para el envío de mensajes del mago al robot.

POST /messages/send
───────────────────
  1. Reenvía el texto al robot via WebSocket (wizard_message).
  2. Confirma la entrega al wizard frontend (delivered).
  3. Si se incluye session_id, persiste el mensaje en BD.

POST /messages/emotion
──────────────────────
  1. Reenvía la emoción al robot vía WebSocket.
  2. Si se incluye session_id, persiste un robot_event
     con event_type='emotion_displayed' y value=<emoción>.
"""

import logging
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.connection_manager import ClientRole, manager
from app.database import get_db
from app.db_models import Message, RobotEvent
from app.models import (
    EmotionMessageRequest,
    GestureRequest,
    HeadMotionRequest,
    WheelMotionRequest,
    WizardMessageRequest,
    make_delivered,
    make_emotion,
    make_gesture,
    make_head_motion,
    make_wheel_motion,
    make_wizard_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("/send", status_code=status.HTTP_200_OK,
             summary="Envía un mensaje del mago al robot")
async def send_wizard_message(
    body: WizardMessageRequest,
    db:   AsyncSession = Depends(get_db),
):
    if not body.text.strip():
        from fastapi import HTTPException
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "El texto del mensaje no puede estar vacío.")

    logger.info("[send] Mago → Robot | id=%s | origin=%s | emotion=%s | text=%r",
                body.message_id, body.origin, body.emotion, body.text)

    await manager.send_to_role(ClientRole.ROBOT,
                               make_wizard_message(body.text, body.message_id))
    await manager.send_to_role(ClientRole.WIZARD, make_delivered(body.message_id))

    if body.session_id is not None:
        try:
            msg_uuid = _uuid.UUID(body.message_id)
        except ValueError:
            msg_uuid = _uuid.uuid4()

        db.add(Message(
            id=msg_uuid,
            session_id=body.session_id,
            text=body.text,
            origin=body.origin.value,
            emotion=body.emotion,
        ))
        await db.commit()
        logger.debug("[send] Mensaje persistido | id=%s | session=%s", msg_uuid, body.session_id)

    return {"status": "ok", "message_id": body.message_id}


@router.post("/emotion", status_code=status.HTTP_200_OK,
             summary="Envía una emoción para que el robot la muestre")
async def send_robot_emotion(
    body: EmotionMessageRequest,
    db:   AsyncSession = Depends(get_db),
):
    logger.info("[send] Emoción → Robot | emotion=%s | session=%s",
                body.emotion, body.session_id)

    await manager.send_to_role(ClientRole.ROBOT, make_emotion(body.emotion))

    if body.session_id is not None:
        db.add(RobotEvent(
            session_id=body.session_id,
            event_type="emotion_displayed",
            value=body.emotion.value,
            occurred_at=datetime.now(timezone.utc),
        ))
        await db.commit()
        logger.debug("[send] Emoción persistida | session=%s | value=%s",
                     body.session_id, body.emotion.value)

    return {"status": "ok", "emotion": body.emotion}


# ── Control de movimiento ────────────────────────────────────────


@router.post("/head", status_code=status.HTTP_200_OK,
             summary="Mueve la cabeza del robot")
async def send_head_motion(
    body: HeadMotionRequest,
    db:   AsyncSession = Depends(get_db),
):
    logger.info("[send] Cabeza → Robot | action=%s | speed=%d | angle=%d",
                body.action, body.speed, body.angle)

    await manager.send_to_role(
        ClientRole.ROBOT,
        make_head_motion(body.action, body.speed, body.angle),
    )

    if body.session_id is not None:
        db.add(RobotEvent(
            session_id=body.session_id,
            event_type="head_motion",
            value=body.action.value,
            occurred_at=datetime.now(timezone.utc),
        ))
        await db.commit()

    return {"status": "ok", "action": body.action}


@router.post("/wheel", status_code=status.HTTP_200_OK,
             summary="Mueve las ruedas del robot")
async def send_wheel_motion(
    body: WheelMotionRequest,
    db:   AsyncSession = Depends(get_db),
):
    logger.info("[send] Ruedas → Robot | action=%s | speed=%d",
                body.action, body.speed)

    await manager.send_to_role(
        ClientRole.ROBOT,
        make_wheel_motion(body.action, body.speed),
    )

    if body.session_id is not None:
        db.add(RobotEvent(
            session_id=body.session_id,
            event_type="wheel_motion",
            value=f"{body.action.value}@{body.speed}",
            occurred_at=datetime.now(timezone.utc),
        ))
        await db.commit()

    return {"status": "ok", "action": body.action}


@router.post("/gesture", status_code=status.HTTP_200_OK,
             summary="Ejecuta un gesto predefinido del robot")
async def send_gesture(
    body: GestureRequest,
    db:   AsyncSession = Depends(get_db),
):
    logger.info("[send] Gesto → Robot | gesture=%s | session=%s",
                body.gesture, body.session_id)

    await manager.send_to_role(ClientRole.ROBOT, make_gesture(body.gesture))

    if body.session_id is not None:
        db.add(RobotEvent(
            session_id=body.session_id,
            event_type="gesture",
            value=body.gesture.value,
            occurred_at=datetime.now(timezone.utc),
        ))
        await db.commit()

    return {"status": "ok", "gesture": body.gesture}
