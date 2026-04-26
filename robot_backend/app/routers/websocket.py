"""
Endpoints WebSocket.

  /ws/wizard  → Se conecta el frontend del mago (React).
  /ws/robot   → Se conecta la app Android del Sanbot Elf.

Flujo de mensajes
─────────────────
  1. El mago escribe → POST /messages/send → backend reenvía al robot
     via wizard_message. El frontend ya pintó la burbuja (envío optimista).
     El backend confirma con delivered solo al wizard.

  2. El robot (o el participante) dice algo → el cliente Android envía
     un WS message con type=robot_speech → backend lo reenvía
     a los wizards como robot_speech para pintarlo en el chat.

  3. El robot registra un evento temporal (ASR activado / TTS iniciado)
     → cliente Android envía type=robot_event → backend lo persiste en BD.

     Formato del mensaje robot_event:
       {
         "type":        "robot_event",
         "event_type":  "started_listening" | "started_speaking",
         "session_id":  "<UUID>",          // opcional
         "message_id":  "<UUID>",          // opcional — mensaje que lo desencadenó
         "occurred_at": "<ISO8601>"         // opcional — si no, usa hora del servidor
       }
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.connection_manager import ClientRole, manager
from app.database import AsyncSessionLocal
from app.db_models import RobotEvent
from app.models import WsMessageType, make_robot_speech, make_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


# ── Wizard endpoint ──────────────────────────────────────────────

@router.websocket("/ws/wizard")
async def wizard_ws(websocket: WebSocket):
    """
    Conexión del operador (mago).
    Recibe: robot_speech, delivered, status.
    """
    client = await manager.connect(websocket, ClientRole.WIZARD)

    await manager.send_to_client(
        client,
        make_status(connected=manager.robot_connected),
    )

    try:
        while True:
            raw = await websocket.receive_text()
            logger.debug("[wizard WS] Mensaje recibido (no procesado): %s", raw)

    except WebSocketDisconnect:
        manager.disconnect(client)


# ── Robot endpoint ───────────────────────────────────────────────

@router.websocket("/ws/robot")
async def robot_ws(websocket: WebSocket):
    """
    Conexión de la app Android del Sanbot Elf.
    Recibe: wizard_message, emotion, status.
    Envía:  robot_speech, robot_event.
    """
    client = await manager.connect(websocket, ClientRole.ROBOT)
    await manager.send_to_role(ClientRole.WIZARD, make_status(connected=True))

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("[robot WS] Mensaje no-JSON ignorado: %s", raw)
                continue

            msg_type = data.get("type")

            if msg_type == WsMessageType.ROBOT_SPEECH:
                text = data.get("text", "").strip()
                if text:
                    await manager.send_to_role(
                        ClientRole.WIZARD,
                        make_robot_speech(text),
                    )

            elif msg_type == WsMessageType.ROBOT_EVENT:
                await _persist_robot_event(data)

            else:
                logger.debug("[robot WS] Tipo de mensaje no gestionado: %s", msg_type)

    except WebSocketDisconnect:
        manager.disconnect(client)
        await manager.send_to_role(ClientRole.WIZARD, make_status(connected=False))


# ── Helper de persistencia ───────────────────────────────────────

async def _persist_robot_event(data: dict) -> None:
    """Persiste un robot_event recibido por WebSocket en la tabla robot_events."""
    event_type = data.get("event_type", "")
    if event_type not in ("started_listening", "started_speaking"):
        logger.warning("[robot WS] robot_event con event_type desconocido: %s", event_type)
        return

    session_id  = _parse_uuid(data.get("session_id"))
    message_id  = _parse_uuid(data.get("message_id"))
    occurred_at = _parse_datetime(data.get("occurred_at"))

    async with AsyncSessionLocal() as db:
        event = RobotEvent(
            session_id=session_id,
            message_id=message_id,
            event_type=event_type,
            occurred_at=occurred_at,
        )
        db.add(event)
        await db.commit()

    logger.info(
        "[event/WS] %s | session=%s | message=%s | at=%s",
        event_type, session_id, message_id, occurred_at,
    )


def _parse_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(timezone.utc)
