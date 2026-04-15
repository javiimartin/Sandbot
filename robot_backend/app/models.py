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

  emotion         → El backend le dice al robot qué emoción mostrar.
                    Solo se entrega al cliente Android (robot).

  delivered       → El backend confirma que un mensaje del mago
                    llegó correctamente al robot.
                    Solo se envía al wizard frontend.

  status          → Informa del estado de conexión del robot.
"""

from enum import Enum, StrEnum
from typing import Any
from pydantic import BaseModel


# ── WebSocket message types ──────────────────────────────────────

class WsMessageType(StrEnum):
    WIZARD_MESSAGE = "wizard_message"   # mago → robot (no se refleja al mago)
    ROBOT_SPEECH   = "robot_speech"     # robot/participante → todos
    EMOTION        = "emotion"         # backend → robot para mostrar emoción
    DELIVERED      = "delivered"        # confirmación de entrega al mago
    STATUS         = "status"           # estado de conexión


# ── Robot emotion values ──────────────────────────────────────────

class RobotEmotion(str, Enum):
    NORMAL   = "NORMAL"
    SMILE    = "SMILE"
    LAUGHTER = "LAUGHTER"
    SURPRISE = "SURPRISE"
    QUESTION = "QUESTION"
    SHY      = "SHY"
    ANGRY    = "ANGRY"
    CRY      = "CRY"


# ── HTTP request bodies ──────────────────────────────────────────

class WizardMessageRequest(BaseModel):
    """Cuerpo del POST /messages/send — mensaje del mago al robot."""
    text:       str
    message_id: str  # ID generado en el frontend para correlacionar la confirmación

class EmotionMessageRequest(BaseModel):
    """Cuerpo del POST /messages/emotion — emoción que el mago quiere mostrar en el robot."""
    emotion: RobotEmotion

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


def make_emotion(emotion: RobotEmotion) -> dict[str, Any]:
    """Payload que recibe el robot cuando el backend le ordena mostrar una emoción."""
    return {
        "type":    WsMessageType.EMOTION,
        "emotion": emotion.value,
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