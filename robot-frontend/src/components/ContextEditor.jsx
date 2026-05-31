/**
 * ContextEditor — Editor de un contexto conversacional.
 *
 * Funciona tanto para contextos existentes (cargados desde BD) como
 * para drafts recién generados por IA o creados desde cero. La distinción
 * se hace por la presencia de `context.id`:
 *   - con id  → PUT /contexts/{id}
 *   - sin id  → POST /contexts
 */
import { useState } from 'react'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL

const EMOTIONS = [
  'NORMAL', 'SMILE', 'LAUGHTER', 'SURPRISE',
  'QUESTION', 'SHY', 'ANGRY', 'CRY',
]

export default function ContextEditor({ context, onSaved, onCancel }) {
  const isNew = !context.id

  const [title, setTitle]             = useState(context.title || '')
  const [description, setDescription] = useState(context.description || '')
  const [userProfile, setUserProfile] = useState(context.user_profile || '')
  const [tags, setTags]               = useState(context.tags || [])
  const [tagInput, setTagInput]       = useState('')
  const [messages, setMessages]       = useState(
    (context.messages || []).map((m, i) => ({
      role:        m.role,
      text:        m.text,
      emotion:     m.emotion,
      order_index: m.order_index ?? i,
    }))
  )

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  /* ── Tags ── */
  const addTag = () => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagInput('')
  }
  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t))

  /* ── Mensajes ── */
  const addMessage = (role) => {
    setMessages(prev => [...prev, {
      role,
      text:        '',
      emotion:     role === 'robot' ? 'NORMAL' : null,
      order_index: prev.length,
    }])
  }

  const updateMessage = (idx, patch) => {
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  const removeMessage = (idx) => {
    setMessages(prev => prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, order_index: i })))
  }

  const moveMessage = (idx, delta) => {
    const newIdx = idx + delta
    if (newIdx < 0 || newIdx >= messages.length) return
    setMessages(prev => {
      const arr = [...prev]
      const tmp = arr[idx]
      arr[idx] = arr[newIdx]
      arr[newIdx] = tmp
      return arr.map((m, i) => ({ ...m, order_index: i }))
    })
  }

  /* ── Guardar ── */
  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      setError('El título y la descripción son obligatorios.')
      return
    }
    setSaving(true)
    setError('')

    // Limpiar mensajes vacíos antes de enviar
    const cleanMessages = messages
      .filter(m => m.text && m.text.trim())
      .map((m, i) => ({
        role:        m.role,
        text:        m.text.trim(),
        emotion:     m.role === 'robot' ? (m.emotion || 'NORMAL') : null,
        order_index: i,
      }))

    try {
      let res
      if (isNew) {
        res = await fetch(`${HTTP_BASE}/contexts`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:        title.trim(),
            description:  description.trim(),
            user_profile: userProfile.trim() || null,
            tags,
            prompt:       context.prompt || null,
            source:       context.source || 'manual',
            model:        context.model  || null,
            messages:     cleanMessages,
          }),
        })
      } else {
        res = await fetch(`${HTTP_BASE}/contexts/${context.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:        title.trim(),
            description:  description.trim(),
            user_profile: userProfile.trim() || null,
            tags,
            messages:     cleanMessages,
          }),
        })
      }
      if (!res.ok) throw new Error()
      const saved = await res.json()
      onSaved(saved)
    } catch {
      setError('Error al guardar el contexto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ctx-overlay">

      <div className="ctx-topbar">
        <button className="ctx-back-btn" onClick={onCancel}>← Cancelar</button>
        <h1 className="ctx-title">
          {isNew ? 'Nuevo contexto' : 'Editar contexto'}
        </h1>
        <div className="ctx-topbar__actions">
          <button
            className="ctx-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="ctx-editor">

        <div className="ctx-editor__field">
          <label>Título</label>
          <input
            className="ctx-input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej: Conversación viendo la tele"
          />
        </div>

        <div className="ctx-editor__field">
          <label>Descripción de la situación</label>
          <textarea
            className="ctx-textarea"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe la escena inicial en la que ocurre la interacción…"
          />
        </div>

        <div className="ctx-editor__field">
          <label>Perfil del usuario</label>
          <textarea
            className="ctx-textarea"
            rows={2}
            value={userProfile}
            onChange={e => setUserProfile(e.target.value)}
            placeholder="Tipo de persona mayor al que aplica este contexto…"
          />
        </div>

        <div className="ctx-editor__field">
          <label>Tags</label>
          <div className="ctx-tags-input">
            {tags.map(t => (
              <span key={t} className="ctx-tag">
                {t}
                <button
                  type="button"
                  className="ctx-tag__remove"
                  onClick={() => removeTag(t)}
                  aria-label={`Eliminar tag ${t}`}
                >×</button>
              </span>
            ))}
            <input
              className="ctx-tags-input__field"
              type="text"
              placeholder="Añadir tag y pulsar Enter…"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag() }
              }}
            />
          </div>
        </div>

        <div className="ctx-editor__field">
          <label>Diálogo ejemplo</label>
          {messages.length === 0 && (
            <div className="ctx-empty ctx-empty--small">
              Aún no hay turnos. Añade el primero con los botones de abajo.
            </div>
          )}
          <div className="ctx-msg-list">
            {messages.map((m, idx) => (
              <div key={idx} className={`ctx-msg ctx-msg--${m.role}`}>
                <div className="ctx-msg__head">
                  <span className="ctx-msg__role">
                    {m.role === 'participant' ? 'Participante' : 'Robot'}
                  </span>
                  {m.role === 'robot' && (
                    <select
                      className="ctx-msg__emotion"
                      value={m.emotion || 'NORMAL'}
                      onChange={e => updateMessage(idx, { emotion: e.target.value })}
                    >
                      {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  )}
                  <div className="ctx-msg__actions">
                    <button onClick={() => moveMessage(idx, -1)} disabled={idx === 0} aria-label="Subir">↑</button>
                    <button onClick={() => moveMessage(idx,  1)} disabled={idx === messages.length - 1} aria-label="Bajar">↓</button>
                    <button onClick={() => removeMessage(idx)} aria-label="Eliminar turno">×</button>
                  </div>
                </div>
                <textarea
                  className="ctx-msg__text"
                  rows={2}
                  value={m.text}
                  onChange={e => updateMessage(idx, { text: e.target.value })}
                  placeholder={m.role === 'participant'
                    ? 'Lo que diría la persona…'
                    : 'Lo que respondería el robot…'}
                />
              </div>
            ))}
          </div>

          <div className="ctx-msg-add">
            <button className="ctx-btn-secondary" onClick={() => addMessage('participant')}>
              + Turno de participante
            </button>
            <button className="ctx-btn-secondary" onClick={() => addMessage('robot')}>
              + Turno de robot
            </button>
          </div>
        </div>

        {error && <p className="ctx-error">{error}</p>}

      </div>
    </div>
  )
}
