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


# ── Generación de contextos conversacionales ─────────────────────────────────

CONTEXT_SYSTEM_PROMPT = """\
Generas BANCOS DE FRASES para un robot que conversa con personas mayores.
El mago elegirá una frase de las que tú generes y el robot la dirá.

Cada frase debe:
  - Ser completa y autocontenida, decible sin haber oído nada antes.
  - INVITAR a que la persona desarrolle, recuerde o opine sobre el tema.
  - Estar en español de España, trato de usted, tono cercano y respetuoso.
  - Ocupar entre 1 y 3 oraciones.

Ejemplos BUENOS para un contexto de fútbol:
  - "Cuénteme cómo recuerda usted la final del Mundial del 82."
  - "Hay quien dice que el fútbol de antes era más bonito, ¿usted qué opina?"
  - "¿Quién fue el jugador que más le hizo disfrutar viéndolo?"

Ejemplos MALOS (no generar):
  - "Sí, claro."     (cierra)
  - "Qué bien."      (no abre nada)
  - "Me alegro."     (demasiado seco)
  - "Vale, gracias." (corta)

Responde ÚNICAMENTE con JSON válido, sin texto extra:
{
  "title": "<3-6 palabras>",
  "description": "<2-3 frases sobre el tema y la situación>",
  "user_profile": "<2-3 frases sobre el tipo de persona mayor a quien aplica>",
  "tags": ["<5-8 tags en minúscula>"],
  "phrases": [
    {"text": "<frase>", "emotion": "QUESTION"},
    {"text": "<frase>", "emotion": "SMILE"},
    ...
  ]
}

Requisitos:
  - 10 FRASES.
  - Todas las frases son del mismo registro: cualquiera puede decirse en
    una conversación sobre el tema del contexto. No las agrupes ni las
    ordenes; el mago elegirá la que necesite en cada momento.
  - Variedad emocional. Emociones válidas: NORMAL, SMILE, LAUGHTER,
    SURPRISE, QUESTION, SHY, ANGRY, CRY.
  - No encadenes frases ni hagas referencias del tipo "como le decía antes".\
"""


async def generate_context(prompt: str, user_profile_hint: str | None = None) -> dict | None:
    """
    Genera un contexto conversacional usando el LLM local.

    Devuelve un dict con las claves: title, description, user_profile,
    tags, example_dialogue. None si falla.
    """
    user_msg = prompt
    if user_profile_hint:
        user_msg += f"\n\nPerfil de usuario sugerido: {user_profile_hint}"

    payload = {
        "model":       settings.lm_studio_model,
        "messages":    [
            {"role": "system", "content": CONTEXT_SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        "temperature": 0.85,
        # Suficiente para 10-15 frases cortas + cabecera del JSON.
        # Subir esto multiplica el tiempo de generación en modelos pequeños.
        "max_tokens":  800,
    }

    url = f"{settings.lm_studio_url.rstrip('/')}/v1/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except Exception as exc:
        logger.warning(
            "[AI] Fallo al llamar a LM Studio para generar contexto: %s: %r",
            type(exc).__name__, exc,
        )
        return None

    return _parse_context_response(resp.json())


def _loads_lenient(content: str) -> dict:
    """
    Intenta parsear JSON tolerando errores comunes en respuestas de LLM:
      - Comas finales sobrantes antes de } o ].
      - Textos truncados por max_tokens (cierra estructuras abiertas).
    Si tras los arreglos sigue fallando, deja que json.JSONDecodeError suba.
    """
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # 1) Quitar comas finales antes de } o ]
    import re
    fixed = re.sub(r",\s*([}\]])", r"\1", content)

    # 2) Si la respuesta se cortó a mitad, cerrar estructuras abiertas
    #    (cuenta brackets ignorando los que estén dentro de strings)
    in_string = False
    escape = False
    stack = []
    for ch in fixed:
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()

    # Si terminó dentro de un string, cerrarlo
    if in_string:
        fixed += '"'
    # Cerrar estructuras pendientes en orden inverso
    while stack:
        opener = stack.pop()
        fixed += "}" if opener == "{" else "]"

    return json.loads(fixed)


def _parse_context_response(data: dict) -> dict | None:
    """Extrae y valida el JSON del contexto generado por el LLM."""
    try:
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        parsed = _loads_lenient(content)

        title       = str(parsed.get("title", "")).strip()
        description = str(parsed.get("description", "")).strip()
        if not title or not description:
            logger.warning("[AI] Contexto sin title/description: %s", content[:200])
            return None

        user_profile = parsed.get("user_profile")
        if user_profile is not None:
            user_profile = str(user_profile).strip() or None

        raw_tags = parsed.get("tags") or []
        tags = [str(t).strip() for t in raw_tags if str(t).strip()]

        raw_phrases = parsed.get("phrases") or []
        phrases = []
        for item in raw_phrases:
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            e = str(item.get("emotion", "NORMAL")).strip().upper()
            emotion = e if e in VALID_EMOTIONS else "NORMAL"
            phrases.append({
                "text":    text,
                "emotion": emotion,
            })

        logger.info("[AI] Contexto generado: title=%r frases=%d", title, len(phrases))
        return {
            "title":        title,
            "description":  description,
            "user_profile": user_profile,
            "tags":         tags,
            "phrases":      phrases,
        }

    except Exception as exc:
        # Log generoso del contenido para poder diagnosticar errores de parseo
        raw = ""
        try:
            raw = data["choices"][0]["message"]["content"]
        except Exception:
            pass
        logger.warning("[AI] No se pudo parsear contexto del LLM: %s", exc)
        logger.warning("[AI] Contenido recibido (primeros 2000 chars):\n%s", raw[:2000])
        return None
