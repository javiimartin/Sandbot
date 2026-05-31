"""
Router HTTP para la gestión de contextos conversacionales.

Un contexto agrupa: situación, perfil de usuario, tags y un diálogo ejemplo.
Se genera con LLM o se crea manualmente. La entrega 5 los usará como base
para recomendar respuestas al mago durante la sesión.

Endpoints
─────────
  POST   /contexts/generate     – Genera con LLM (no persiste todavía).
  POST   /contexts              – Crea un contexto (manual o tras generar).
  GET    /contexts              – Lista (filtros: q, tag, source).
  GET    /contexts/{id}         – Detalle con sus mensajes.
  PUT    /contexts/{id}         – Edita campos / reemplaza mensajes.
  DELETE /contexts/{id}         – Elimina (cascade borra los mensajes).
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.db_models import Context, ContextMessage
from app.models import (
    ContextCreateRequest,
    ContextGenerateRequest,
    ContextUpdateRequest,
)
from app.routers import ai as ai_module

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contexts", tags=["contexts"])


# ── Helpers de serialización ─────────────────────────────────────────────────

def _serialize_message(m: ContextMessage) -> dict:
    return {
        "id":          str(m.id),
        "role":        m.role,
        "text":        m.text,
        "emotion":     m.emotion,
        "order_index": m.order_index,
    }


def _serialize_context(c: Context, include_messages: bool = True) -> dict:
    data = {
        "id":           str(c.id),
        "title":        c.title,
        "description":  c.description,
        "user_profile": c.user_profile,
        "tags":         c.tags or [],
        "prompt":       c.prompt,
        "source":       c.source,
        "model":        c.model,
        "created_at":   c.created_at,
    }
    if include_messages:
        data["messages"] = [_serialize_message(m) for m in c.messages]
    return data


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/generate", status_code=status.HTTP_200_OK,
             summary="Genera un contexto con el LLM (no persiste)")
async def generate_context(body: ContextGenerateRequest):
    """
    Llama al LLM con la descripción libre del operador y devuelve un contexto
    estructurado SIN persistirlo. El frontend puede editar el resultado y
    confirmarlo con POST /contexts indicando source='llm'.
    """
    result = await ai_module.generate_context(body.prompt, body.user_profile_hint)
    if result is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El LLM no está disponible o devolvió una respuesta no válida.",
        )

    return {
        "title":        result["title"],
        "description":  result["description"],
        "user_profile": result["user_profile"],
        "tags":         result["tags"],
        "messages":     result["example_dialogue"],
        "prompt":       body.prompt,
        "source":       "llm",
        "model":        settings.lm_studio_model,
    }


@router.post("", status_code=status.HTTP_201_CREATED,
             summary="Crea un contexto (manual o tras generación)")
async def create_context(body: ContextCreateRequest, db: AsyncSession = Depends(get_db)):
    ctx = Context(
        title        = body.title,
        description  = body.description,
        user_profile = body.user_profile,
        tags         = body.tags,
        prompt       = body.prompt,
        source       = body.source,
        model        = body.model,
    )
    db.add(ctx)
    await db.flush()  # obtiene ctx.id antes de añadir los mensajes

    for i, msg in enumerate(body.messages):
        db.add(ContextMessage(
            context_id  = ctx.id,
            role        = msg.role,
            text        = msg.text,
            emotion     = msg.emotion,
            order_index = msg.order_index if msg.order_index is not None else i,
        ))

    await db.commit()
    await db.refresh(ctx, attribute_names=["messages"])

    logger.info("[context] Creado | id=%s | title=%r | source=%s | turnos=%d",
                ctx.id, ctx.title, ctx.source, len(body.messages))
    return _serialize_context(ctx)


@router.get("", status_code=status.HTTP_200_OK,
            summary="Lista contextos con filtros opcionales")
async def list_contexts(
    q:      str | None = Query(None, description="Búsqueda libre en title/description"),
    tag:    str | None = Query(None, description="Filtrar por tag exacto"),
    source: str | None = Query(None, description="llm | manual"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Context).order_by(Context.created_at.desc())
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Context.title.ilike(like), Context.description.ilike(like)))
    if source:
        stmt = stmt.where(Context.source == source)
    if tag:
        stmt = stmt.where(Context.tags.contains([tag]))

    result = await db.execute(stmt)
    contexts = result.scalars().all()

    return [_serialize_context(c, include_messages=False) for c in contexts]


@router.get("/{context_id}", status_code=status.HTTP_200_OK,
            summary="Detalle de un contexto con sus mensajes")
async def get_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Context).where(Context.id == context_id))
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contexto no encontrado.")

    # Forzar la carga de mensajes (lazy load)
    await db.refresh(ctx, attribute_names=["messages"])
    return _serialize_context(ctx)


@router.put("/{context_id}", status_code=status.HTTP_200_OK,
            summary="Edita un contexto y reemplaza sus mensajes si se indican")
async def update_context(
    context_id: uuid.UUID,
    body: ContextUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Context).where(Context.id == context_id))
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contexto no encontrado.")

    if body.title is not None:
        ctx.title = body.title
    if body.description is not None:
        ctx.description = body.description
    if body.user_profile is not None:
        ctx.user_profile = body.user_profile
    if body.tags is not None:
        ctx.tags = body.tags

    # Si se pasa una lista nueva de mensajes, reemplaza la existente entera
    if body.messages is not None:
        # Cargar relación para que el cascade borre los actuales
        await db.refresh(ctx, attribute_names=["messages"])
        ctx.messages.clear()
        await db.flush()
        for i, msg in enumerate(body.messages):
            db.add(ContextMessage(
                context_id  = ctx.id,
                role        = msg.role,
                text        = msg.text,
                emotion     = msg.emotion,
                order_index = msg.order_index if msg.order_index is not None else i,
            ))

    await db.commit()
    await db.refresh(ctx, attribute_names=["messages"])

    logger.info("[context] Actualizado | id=%s", ctx.id)
    return _serialize_context(ctx)


@router.delete("/{context_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Elimina un contexto y sus mensajes")
async def delete_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Context).where(Context.id == context_id))
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contexto no encontrado.")

    await db.delete(ctx)
    await db.commit()

    logger.info("[context] Eliminado | id=%s", context_id)
    return None
