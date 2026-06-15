"""
Router HTTP para la gestión de contextos conversacionales.

Un contexto agrupa: situación, perfil de usuario, tags y un banco de frases
predefinidas del robot. Se genera con LLM o se crea manualmente. La entrega 5
usará estas frases para que el mago las dispare durante la sesión.

Endpoints
─────────
  POST   /contexts/generate     – Genera con LLM (no persiste todavía).
  POST   /contexts              – Crea un contexto (manual o tras generar).
  GET    /contexts              – Lista (filtros: q, tag, source).
  GET    /contexts/{id}         – Detalle con sus frases.
  PUT    /contexts/{id}         – Edita campos / reemplaza frases.
  DELETE /contexts/{id}         – Elimina (cascade borra las frases).
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.db_models import Context, ContextPhrase
from app.models import (
    ContextCreateRequest,
    ContextGenerateRequest,
    ContextUpdateRequest,
)
from app.routers import ai as ai_module

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contexts", tags=["contexts"])


# ── Helpers de serialización ─────────────────────────────────────────────────

def _serialize_phrase(p: ContextPhrase) -> dict:
    return {
        "id":      str(p.id),
        "text":    p.text,
        "emotion": p.emotion,
    }


def _serialize_context(c: Context, include_phrases: bool = True) -> dict:
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
    if include_phrases:
        data["phrases"] = [_serialize_phrase(p) for p in c.phrases]
    else:
        # En el listado, informar al menos del número de frases
        data["phrase_count"] = len(c.phrases) if c.phrases is not None else 0
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
        "phrases":      result["phrases"],
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
    await db.flush()  # obtiene ctx.id antes de añadir las frases

    for p in body.phrases:
        db.add(ContextPhrase(
            context_id = ctx.id,
            text       = p.text,
            emotion    = p.emotion,
        ))

    await db.commit()
    await db.refresh(ctx, attribute_names=["phrases"])

    logger.info("[context] Creado | id=%s | title=%r | source=%s | frases=%d",
                ctx.id, ctx.title, ctx.source, len(body.phrases))
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

    # Cargar las frases para poder contarlas en cada card
    for c in contexts:
        await db.refresh(c, attribute_names=["phrases"])

    return [_serialize_context(c, include_phrases=False) for c in contexts]


@router.get("/{context_id}", status_code=status.HTTP_200_OK,
            summary="Detalle de un contexto con sus frases")
async def get_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Context).where(Context.id == context_id))
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contexto no encontrado.")

    await db.refresh(ctx, attribute_names=["phrases"])
    return _serialize_context(ctx)


@router.put("/{context_id}", status_code=status.HTTP_200_OK,
            summary="Edita un contexto y reemplaza sus frases si se indican")
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

    # Si se pasa una lista nueva de frases, reemplaza la existente entera
    if body.phrases is not None:
        await db.refresh(ctx, attribute_names=["phrases"])
        ctx.phrases.clear()
        await db.flush()
        for p in body.phrases:
            db.add(ContextPhrase(
                context_id = ctx.id,
                text       = p.text,
                emotion    = p.emotion,
            ))

    await db.commit()
    await db.refresh(ctx, attribute_names=["phrases"])

    logger.info("[context] Actualizado | id=%s", ctx.id)
    return _serialize_context(ctx)


@router.delete("/{context_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Elimina un contexto y sus frases")
async def delete_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Context).where(Context.id == context_id))
    ctx = result.scalar_one_or_none()
    if ctx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contexto no encontrado.")

    await db.delete(ctx)
    await db.commit()

    logger.info("[context] Eliminado | id=%s", context_id)
    return None
