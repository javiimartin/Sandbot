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
from uuid import UUID
from pydantic import BaseModel


# ── WebSocket message types ──────────────────────────────────────

class WsMessageType(StrEnum):
    WIZARD_MESSAGE = "wizard_message"   # mago → robot (no se refleja al mago)
    ROBOT_SPEECH   = "robot_speech"     # robot/participante → todos
    EMOTION        = "emotion"          # backend → robot para mostrar emoción
    DELIVERED      = "delivered"        # confirmación de entrega al mago
    STATUS         = "status"           # estado de conexión
    ROBOT_EVENT    = "robot_event"      # robot → backend (marca temporal ASR/TTS)
    ROBOT_IMAGE    = "robot_image"      # robot → wizard (fotograma cámara, solo retransmisión)
    HEAD_MOTION    = "head_motion"      # backend → robot: mover la cabeza
    WHEEL_MOTION   = "wheel_motion"     # backend → robot: mover las ruedas
    GESTURE        = "gesture"          # backend → robot: ejecutar gesto predefinido


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


# ── Message origin labels ─────────────────────────────────────────

class MessageOrigin(str, Enum):
    WIZARD      = "wizard"       # el mago escribió o seleccionó la respuesta
    AI          = "ai"           # generado por IA (uso futuro)
    CONTEXT     = "context"      # respuesta contextual / predefinida
    PARTICIPANT = "participant"   # mensaje del participante capturado por el robot


# ── HTTP request bodies ──────────────────────────────────────────

class WizardMessageRequest(BaseModel):
    """Cuerpo del POST /messages/send — mensaje del mago al robot."""
    text:       str
    message_id: str   # UUID generado en el frontend para correlacionar la confirmación

    # Campos para registro en BD (opcionales para mantener compatibilidad)
    session_id: UUID | None = None
    origin:     MessageOrigin = MessageOrigin.WIZARD
    emotion:    str | None = None  # valor de RobotEmotion activo al enviar


class EmotionMessageRequest(BaseModel):
    """Cuerpo del POST /messages/emotion — emoción que el mago quiere mostrar en el robot."""
    emotion:    RobotEmotion
    session_id: UUID | None = None  # para persistir el cambio en robot_events


# ── Robot motion actions ─────────────────────────────────────────


class HeadAction(str, Enum):
    """Direcciones de movimiento de la cabeza (mapean a RelativeAngleHeadMotion)."""
    UP             = "UP"
    DOWN           = "DOWN"
    LEFT           = "LEFT"
    RIGHT          = "RIGHT"
    HORIZONTAL_RESET = "HORIZONTAL_RESET"   # vuelve al centro horizontal
    VERTICAL_RESET   = "VERTICAL_RESET"     # vuelve al centro vertical
    CENTER_RESET     = "CENTER_RESET"       # vuelve al centro absoluto


class WheelAction(str, Enum):
    """Acciones para las ruedas (mapean a NoAngleWheelMotion)."""
    FORWARD  = "FORWARD"
    BACK     = "BACK"
    TURN_LEFT  = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    STOP     = "STOP"


class GestureType(str, Enum):
    """Gestos predefinidos compuestos por movimientos coordinados."""
    GREET            = "GREET"            # saludar levantando la mano
    NOD              = "NOD"              # asentir con la cabeza
    SHAKE_HEAD       = "SHAKE_HEAD"       # negar con la cabeza
    SHOW_ENTHUSIASM  = "SHOW_ENTHUSIASM"  # levantar ambos brazos
    SHRUG            = "SHRUG"            # encogerse de hombros (subir brazos cortos)
    LOOK_AROUND      = "LOOK_AROUND"      # mirar a los lados


class HeadMotionRequest(BaseModel):
    """Cuerpo del POST /messages/head — mover la cabeza del robot."""
    action:     HeadAction
    speed:      int = 5        # 1-10
    angle:      int = 15       # ángulo relativo en grados
    session_id: UUID | None = None


class WheelMotionRequest(BaseModel):
    """Cuerpo del POST /messages/wheel — mover las ruedas del robot."""
    action:     WheelAction
    speed:      int = 5        # 1-10 (1 lento, 5 medio, 9 rápido)
    session_id: UUID | None = None


class GestureRequest(BaseModel):
    """Cuerpo del POST /messages/gesture — ejecutar gesto predefinido."""
    gesture:    GestureType
    session_id: UUID | None = None

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


def make_robot_image(image_b64: str, timestamp: str) -> dict[str, Any]:
    """Fotograma JPEG codificado en base64 para el wizard frontend."""
    return {
        "type":      WsMessageType.ROBOT_IMAGE,
        "image":     image_b64,
        "timestamp": timestamp,
    }


def make_head_motion(action: HeadAction, speed: int, angle: int) -> dict[str, Any]:
    """Payload que recibe el robot para mover la cabeza."""
    return {
        "type":   WsMessageType.HEAD_MOTION,
        "action": action.value,
        "speed":  speed,
        "angle":  angle,
    }


def make_wheel_motion(action: WheelAction, speed: int) -> dict[str, Any]:
    """Payload que recibe el robot para mover las ruedas."""
    return {
        "type":   WsMessageType.WHEEL_MOTION,
        "action": action.value,
        "speed":  speed,
    }


def make_gesture(gesture: GestureType) -> dict[str, Any]:
    """Payload que recibe el robot para ejecutar un gesto predefinido."""
    return {
        "type":    WsMessageType.GESTURE,
        "gesture": gesture.value,
    }