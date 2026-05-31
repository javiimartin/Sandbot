/**
 * ContextsView — Gestión de contextos conversacionales.
 *
 * Listado de contextos con filtros (texto libre, tag, origen). Permite
 * crear uno nuevo de forma manual o generarlo automáticamente con el LLM,
 * y abre el ContextEditor para revisar/editar.
 *
 * Los contextos no se usan todavía durante las sesiones; esta entrega
 * solo construye el repositorio que la entrega 5 consumirá para recomendar.
 */
import { useState, useEffect, useCallback } from 'react'

import ContextEditor from './ContextEditor'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const SOURCE_LABEL = { llm: 'IA', manual: 'Manual' }

/* ── Modal para generar con IA ────────────────────────────────────────── */
function GenerateModal({ onClose, onGenerated }) {
  const [prompt, setPrompt]       = useState('')
  const [profile, setProfile]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${HTTP_BASE}/contexts/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prompt:            prompt.trim(),
          user_profile_hint: profile.trim() || null,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || 'Error al generar el contexto.')
      }
      const data = await res.json()
      onGenerated(data)
    } catch (err) {
      setError(err.message || 'Error desconocido.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ctx-modal-overlay" onClick={onClose}>
      <div className="ctx-modal" onClick={e => e.stopPropagation()}>
        <h2>Generar contexto con IA</h2>
        <p className="ctx-modal__hint">
          Describe la situación inicial. El modelo generará un título,
          descripción, perfil y un diálogo ejemplo que podrás editar antes de guardar.
        </p>

        <label>Situación</label>
        <textarea
          className="ctx-textarea"
          rows={5}
          placeholder="Ej: el usuario está solo en su salón viendo la tele cuando el robot llega y le pregunta cómo está…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />

        <label>Perfil del usuario (opcional)</label>
        <input
          className="ctx-input"
          type="text"
          placeholder="Ej: mujer de 75 años, le gusta la cocina y los nietos"
          value={profile}
          onChange={e => setProfile(e.target.value)}
        />

        {error && <p className="ctx-error">{error}</p>}

        <div className="ctx-modal__actions">
          <button className="ctx-btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="ctx-btn-primary"
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
          >
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Tarjeta de un contexto en el listado ─────────────────────────────── */
function ContextCard({ ctx, onOpen, onDelete }) {
  return (
    <div className="ctx-card" onClick={() => onOpen(ctx)}>
      <div className="ctx-card__header">
        <span className="ctx-card__title">{ctx.title}</span>
        <span className={`ctx-card__badge ctx-card__badge--${ctx.source}`}>
          {SOURCE_LABEL[ctx.source] ?? ctx.source}
        </span>
      </div>
      <p className="ctx-card__desc">{ctx.description}</p>
      {ctx.tags && ctx.tags.length > 0 && (
        <div className="ctx-card__tags">
          {ctx.tags.map(t => <span key={t} className="ctx-tag">{t}</span>)}
        </div>
      )}
      <div className="ctx-card__footer">
        <span className="ctx-card__date">{formatDate(ctx.created_at)}</span>
        <button
          className="ctx-card__delete"
          onClick={e => { e.stopPropagation(); onDelete(ctx) }}
          aria-label="Eliminar contexto"
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

/* ── Vista principal ───────────────────────────────────────────────────── */
export default function ContextsView({ onBack }) {
  const [contexts, setContexts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [query, setQuery]         = useState('')
  const [filterSource, setSource] = useState('all')

  const [showGenerate, setShowGenerate] = useState(false)
  const [editing, setEditing]           = useState(null)  // contexto en edición (con id) o draft (sin id)

  const loadContexts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (filterSource !== 'all') params.set('source', filterSource)
      const url = `${HTTP_BASE}/contexts${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setContexts(Array.isArray(data) ? data : [])
    } catch {
      setError('No se pudo cargar la lista de contextos.')
    } finally {
      setLoading(false)
    }
  }, [query, filterSource])

  useEffect(() => { loadContexts() }, [loadContexts])

  const handleGenerated = (draft) => {
    // El backend devuelve el contexto generado sin persistir.
    // Lo abrimos en el editor como draft (sin id).
    setShowGenerate(false)
    setEditing({ ...draft, _isDraft: true })
  }

  const handleCreateManual = () => {
    setEditing({
      _isDraft:     true,
      title:        '',
      description:  '',
      user_profile: '',
      tags:         [],
      source:       'manual',
      messages:     [],
    })
  }

  const handleDelete = async (ctx) => {
    if (!confirm(`¿Eliminar el contexto "${ctx.title}"?`)) return
    try {
      const res = await fetch(`${HTTP_BASE}/contexts/${ctx.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setContexts(prev => prev.filter(c => c.id !== ctx.id))
    } catch {
      alert('Error al eliminar el contexto.')
    }
  }

  /* ── Render del editor cuando hay uno activo ── */
  if (editing) {
    return (
      <ContextEditor
        context={editing}
        onSaved={() => {
          setEditing(null)
          loadContexts()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  /* ── Render del listado ── */
  return (
    <div className="ctx-overlay">

      <div className="ctx-topbar">
        <button className="ctx-back-btn" onClick={onBack}>← Volver</button>
        <h1 className="ctx-title">Contextos conversacionales</h1>
        <div className="ctx-topbar__actions">
          <button className="ctx-btn-secondary" onClick={handleCreateManual}>
            + Crear manual
          </button>
          <button className="ctx-btn-primary" onClick={() => setShowGenerate(true)}>
            + Generar con IA
          </button>
        </div>
      </div>

      <div className="ctx-filters">
        <input
          className="ctx-input"
          type="text"
          placeholder="Buscar por título o descripción…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select
          className="ctx-input ctx-input--small"
          value={filterSource}
          onChange={e => setSource(e.target.value)}
        >
          <option value="all">Todos los orígenes</option>
          <option value="llm">Solo IA</option>
          <option value="manual">Solo manual</option>
        </select>
      </div>

      {loading && <div className="ctx-empty">Cargando contextos…</div>}
      {error && !loading && <div className="ctx-empty ctx-empty--error">{error}</div>}
      {!loading && !error && contexts.length === 0 && (
        <div className="ctx-empty">
          No hay contextos todavía. Crea uno manualmente o genera el primero con IA.
        </div>
      )}

      {!loading && contexts.length > 0 && (
        <div className="ctx-grid">
          {contexts.map(ctx => (
            <ContextCard
              key={ctx.id}
              ctx={ctx}
              onOpen={async (c) => {
                // Cargar detalle completo (con mensajes) antes de abrir editor
                try {
                  const res = await fetch(`${HTTP_BASE}/contexts/${c.id}`)
                  if (!res.ok) throw new Error()
                  setEditing(await res.json())
                } catch {
                  alert('No se pudo cargar el contexto.')
                }
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  )
}
