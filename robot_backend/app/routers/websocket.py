"""
Endpoints WebSocket.

  /ws/wizard  → Frontend del mago (React).
  /ws/robot   → App Android del Sanbot Elf.

Mensajes robot → backend
─────────────────────────
  robot_speech  – Lo que dice el participante (ASR del robot).
                  Se reenvía al wizard y se persiste en messages
                  con origin='participant' asociado a la sesión activa.

  robot_event   – Marca temporal (started_listening / started_speaking).
                  Se persiste en robot_events.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.connection_manager import ClientRole, manager
from app import session_state
from app.database import AsyncSessionLocal
from app.db_models import Message, RobotEvent
from app.models import WsMessageType, make_robot_speech, make_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


# ── Wizard endpoint ──────────────────────────────────────────────

@router.websocket("/ws/wizard")
async def wizard_ws(websocket: WebSocket):
    client = await manager.connect(websocket, ClientRole.WIZARD)
    await manager.send_to_client(client, make_status(connected=manager.robot_connected))

    try:
        while True:
            raw = await websocket.receive_text()
            logger.debug("[wizard WS] Mensaje recibido (no procesado): %s", raw)
    except WebSocketDisconnect:
        manager.disconnect(client)


# ── Robot endpoint ───────────────────────────────────────────────

@router.websocket("/ws/robot")
async def robot_ws(websocket: WebSocket):
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
                    # Reenviar al wizard frontend
                    await manager.send_to_role(ClientRole.WIZARD, make_robot_speech(text))
                    # Persistir como mensaje del participante
                    await _persist_participant_message(text)

            elif msg_type == WsMessageType.ROBOT_EVENT:
                await _persist_robot_event(data)

            else:
                logger.debug("[robot WS] Tipo de mensaje no gestionado: %s", msg_type)

    except WebSocketDisconnect:
        manager.disconnect(client)
        await manager.send_to_role(ClientRole.WIZARD, make_status(connected=False))


# ── Persistencia ─────────────────────────────────────────────────

async def _persist_participant_message(text: str) -> None:
    """Persiste en messages lo que dice el participante (capturado por ASR del robot)."""
    sid = session_state.get_active()
    if sid is None:
        logger.debug("[robot_speech] Sin sesión activa, no se persiste.")
        return

    async with AsyncSessionLocal() as db:
        db.add(Message(
            session_id=sid,
            text=text,
            origin="participant",
        ))
        await db.commit()

    logger.info("[robot_speech] Persistido | session=%s | text=%r", sid, text)


async def _persist_robot_event(data: dict) -> None:
    """Persiste un robot_event recibido por WebSocket."""
    event_type = data.get("event_type", "")
    if event_type not in ("started_listening", "started_speaking"):
        logger.warning("[robot WS] robot_event con event_type desconocido: %s", event_type)
        return

    session_id  = _parse_uuid(data.get("session_id")) or session_state.get_active()
    message_id  = _parse_uuid(data.get("message_id"))
    occurred_at = _parse_datetime(data.get("occurred_at"))

    async with AsyncSessionLocal() as db:
        db.add(RobotEvent(
            session_id=session_id,
            message_id=message_id,
            event_type=event_type,
            occurred_at=occurred_at,
        ))
        await db.commit()

    logger.info("[event/WS] %s | session=%s | at=%s", event_type, session_id, occurred_at)


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
