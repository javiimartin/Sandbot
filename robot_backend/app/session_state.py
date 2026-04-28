"""
Estado global de la sesión activa.

Este sistema WoZ opera con un único mago y un único robot simultáneos,
por lo que un estado simple a nivel de módulo es suficiente.

Se usa para asociar mensajes entrantes del robot (robot_speech)
a la sesión en curso sin requerir cambios en la app Android.
"""

from uuid import UUID

active_session_id: UUID | None = None


def set_active(session_id: UUID | None) -> None:
    global active_session_id
    active_session_id = session_id


def get_active() -> UUID | None:
    return active_session_id
