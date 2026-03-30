"""
Modelos de datos compartidos por toda la aplicación.

Nomenclatura de mensajes WebSocket
───────────────────────────────────
Todos los mensajes WS siguen la forma  { "type": "<WsMessageType>", ...campos }

  wizard_message  → El mago envió un texto al robot.
                    Solo se entrega al cliente Android (robot).
                    El frontend ya lo tiene pintado (envío optimista).

  robot_speech    → El robot (o el participante) ha dicho algo.
                    Se entrega a TODOS los clientes (mago + robot).
                    El frontend lo pinta como burbuja izquierda.

  delivered       → El backend confirma que un mensaje del mago
                    llegó correctamente al robot.
                    Solo se envía al wizard frontend.

  status          → Informa del estado de conexión del robot.
"""

from enum import StrEnum
from typing import Any
from pydantic import BaseModel


# ── WebSocket message types ──────────────────────────────────────

class WsMessageType(StrEnum):
    WIZARD_MESSAGE = "wizard_message"   # mago → robot (no se refleja al mago)
    ROBOT_SPEECH   = "robot_speech"     # robot/participante → todos
    DELIVERED      = "delivered"        # confirmación de entrega al mago
    STATUS         = "status"           # estado de conexión


# ── HTTP request bodies ──────────────────────────────────────────

class WizardMessageRequest(BaseModel):
    """Cuerpo del POST /messages/send — mensaje del mago al robot."""
    text:       str
    message_id: str  # ID generado en el frontend para correlacionar la confirmación


# ── WebSocket payload helpers ────────────────────────────────────

def make_wizard_message(text: str, message_id: str) -> dict[str, Any]:
    """Payload que recibe el robot cuando el mago habla."""
    return {
        "type":       WsMessageType.WIZARD_MESSAGE,
        "text":       text,
        "message_id": message_id,
    }


def make_robot_speech(text: str) -> dict[str, Any]:
    """Payload que recibe el frontend cuando el robot/participante habla."""
    return {
        "type": WsMessageType.ROBOT_SPEECH,
        "text": text,
    }


def make_delivered(message_id: str) -> dict[str, Any]:
    """Confirmación de entrega enviada al wizard frontend."""
    return {
        "type":       WsMessageType.DELIVERED,
        "message_id": message_id,
    }


def make_status(connected: bool) -> dict[str, Any]:
    """Payload de estado de conexión."""
    return {
        "type":      WsMessageType.STATUS,
        "connected": connected,
    }