"""
Módulo de asistencia mediante LLM (LM Studio).

generate_suggestion() se llama de forma asíncrona desde websocket.py
cada vez que llega un robot_speech. Consulta el historial reciente de
la sesión y pide al LLM una frase sugerida + emoción coherente.

El módulo falla silenciosamente: cualquier error (LM Studio apagado,
respuesta mal formada, timeout) devuelve None sin interrumpir el flujo.
"""

import json
import logging
import uuid

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.db_models import Message

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
Eres el robot Sanbot hablando con una persona mayor. Sugiere una respuesta breve y natural en español.
Responde SOLO con JSON, sin texto extra:
{"text": "<1 frase corta>", "emotion": "<NORMAL|SMILE|LAUGHTER|SURPRISE|QUESTION|SHY|ANGRY|CRY>"}\
"""

VALID_EMOTIONS = {"NORMAL", "SMILE", "LAUGHTER", "SURPRISE", "QUESTION", "SHY", "ANGRY", "CRY"}


async def generate_suggestion(session_id: uuid.UUID, last_text: str) -> dict | None:
    """
    Genera una sugerencia de respuesta para el mago usando el LLM local.

    Recupera los últimos N mensajes de la sesión (configurado en settings),
    los convierte en historial de chat y llama a la API de LM Studio.

    Returns:
        {"text": str, "emotion": str} o None si falla.
    """
    messages = await _build_chat_messages(session_id)
    if not messages:
        # Sin contexto todavía, al menos incluimos el último mensaje
        messages = [{"role": "user", "content": last_text}]

    payload = {
        "model":       settings.lm_studio_model,
        "messages":    [{"role": "system", "content": SYSTEM_PROMPT}] + messages,
        "temperature": 0.7,
        "max_tokens":  80,
    }

    url = f"{settings.lm_studio_url.rstrip('/')}/v1/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception as exc:
        logger.warning("[AI] LM Studio no disponible: %s", exc)
        return None

    return _parse_response(resp.json())


async def _build_chat_messages(session_id: uuid.UUID) -> list[dict]:
    """
    Devuelve los últimos N mensajes de la sesión como historial de chat.
    Los mensajes del participante → role 'user'.
    Los mensajes del mago/IA    → role 'assistant'.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.sent_at.desc())
            .limit(settings.ai_context_messages)
        )
        rows = result.scalars().all()

    # Invertir para orden cronológico
    rows = list(reversed(rows))

    chat = []
    for msg in rows:
        if msg.origin == "participant":
            chat.append({"role": "user", "content": msg.text})
        else:
            chat.append({"role": "assistant", "content": msg.text})

    return chat


def _parse_response(data: dict) -> dict | None:
    """
    Extrae y valida el JSON de la respuesta del LLM.
    Devuelve None si el formato no es el esperado.
    """
    try:
        content = data["choices"][0]["message"]["content"].strip()
        # El modelo puede rodear el JSON con markdown ```json ... ```
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        parsed = json.loads(content)
        text    = str(parsed.get("text", "")).strip()
        emotion = str(parsed.get("emotion", "NORMAL")).strip().upper()

        if not text:
            logger.warning("[AI] Respuesta sin campo 'text': %s", content)
            return None

        if emotion not in VALID_EMOTIONS:
            logger.warning("[AI] Emoción desconocida '%s', usando NORMAL", emotion)
            emotion = "NORMAL"

        logger.info("[AI] Sugerencia generada: emotion=%s text=%r", emotion, text[:60])
        return {"text": text, "emotion": emotion}

    except Exception as exc:
        logger.warning("[AI] No se pudo parsear respuesta del LLM: %s", exc)
        return None
