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
"""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.connection_manager import manager, ClientRole
from app.models import make_status, make_robot_speech, WsMessageType

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

    # Inform wizard of current robot status
    await manager.send_to_client(
        client,
        make_status(connected=manager.robot_connected),
    )

    try:
        while True:
            # The wizard frontend does not currently send WS messages,
            # but we keep the loop alive and ready for future commands.
            raw = await websocket.receive_text()
            logger.debug("[wizard WS] Mensaje recibido (no procesado): %s", raw)

    except WebSocketDisconnect:
        manager.disconnect(client)


# ── Robot endpoint ───────────────────────────────────────────────

@router.websocket("/ws/robot")
async def robot_ws(websocket: WebSocket):
    """
    Conexión de la app Android del Sanbot Elf.
    Recibe: wizard_message, status.
    Envía:  robot_speech (lo que el robot/participante dice en voz alta).
    """
    client = await manager.connect(websocket, ClientRole.ROBOT)

    # Notify all wizards that a robot has connected
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
                # The robot is reporting what the participant said →
                # forward to all wizard frontends so it appears in the chat
                text = data.get("text", "").strip()
                if text:
                    await manager.send_to_role(
                        ClientRole.WIZARD,
                        make_robot_speech(text),
                    )
            else:
                logger.debug("[robot WS] Tipo de mensaje no gestionado: %s", msg_type)

    except WebSocketDisconnect:
        manager.disconnect(client)
        # Notify wizards the robot has disconnected
        await manager.send_to_role(ClientRole.WIZARD, make_status(connected=False))