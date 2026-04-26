"""
Modelos ORM (SQLAlchemy 2.0) para el registro de sesiones WoZ.

Tablas
──────
  sessions     – Agrupa todos los eventos de una interacción.
  messages     – Mensajes emitidos, con emoción activa y origen etiquetado.
  robot_events – Marcas temporales de eventos del robot (escucha / habla).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Usuario / Participante ────────────────────────────────────────────────────

class User(Base):
    """
    Información demográfica del participante (persona mayor).

    Cada usuario puede tener múltiples sesiones de interacción.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    age: Mapped[int | None] = mapped_column(nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)  # M/F/Other
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    # Campos adicionales: patologías, medicación, nivel educativo, etc.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ── Sesión ───────────────────────────────────────────────────────────────────

class Session(Base):
    """Una sesión de interacción completa entre el mago, el robot y el usuario."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Información libre del investigador (condición experimental, notas…)
    info: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    user: Mapped["User | None"] = relationship(back_populates="sessions")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    events: Mapped[list["RobotEvent"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


# ── Mensaje ──────────────────────────────────────────────────────────────────

class Message(Base):
    """
    Mensaje emitido por el robot durante una sesión.

    origin  → etiqueta de procedencia del contenido:
                'wizard'  – el mago lo escribió o seleccionó manualmente
                'ai'      – generado por IA (uso futuro)
                'context' – respuesta contextual / predefinida
    emotion → valor de RobotEmotion activo en el momento del envío (opcional)
    extra   → JSONB para campos adicionales semiestructurados
    """

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    origin: Mapped[str] = mapped_column(String(20), nullable=False)  # wizard|ai|context
    emotion: Mapped[str | None] = mapped_column(String(30), nullable=True)
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)

    session: Mapped["Session | None"] = relationship(back_populates="messages")
    events: Mapped[list["RobotEvent"]] = relationship(back_populates="message")


# ── Evento del robot ─────────────────────────────────────────────────────────

class RobotEvent(Base):
    """
    Marca temporal asociada a un evento básico del robot.

    event_type →  'started_listening'  – el robot activa su ASR
                  'started_speaking'   – el robot inicia TTS

    Permiten derivar métricas de tiempo de respuesta sin instrumentación extra.
    """

    __tablename__ = "robot_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # started_listening | started_speaking
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    session: Mapped["Session | None"] = relationship(back_populates="events")
    message: Mapped["Message | None"] = relationship(back_populates="events")
