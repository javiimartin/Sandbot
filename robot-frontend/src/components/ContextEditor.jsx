/**
 * ContextEditor — Editor de un contexto conversacional.
 *
 * Funciona tanto para contextos existentes (cargados desde BD) como
 * para drafts recién generados por IA o creados desde cero. La distinción
 * se hace por la presencia de `context.id`:
 *   - con id  → PUT /contexts/{id}
 *   - sin id  → POST /contexts
 *
 * Las frases del contexto son intervenciones completas del robot que el
 * mago podrá disparar durante una sesión. Cada frase lleva su emoción.
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
  const [phrases, setPhrases]         = useState(
    (context.phrases || []).map(p => ({
      text:    p.text,
      emotion: p.emotion || 'NORMAL',
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

  /* ── Frases ── */
  const addPhrase = () => {
    setPhrases(prev => [...prev, {
      text:    '',
      emotion: 'NORMAL',
    }])
  }

  const updatePhrase = (idx, patch) => {
    setPhrases(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  const removePhrase = (idx) => {
    setPhrases(prev => prev.filter((_, i) => i !== idx))
  }

  /* ── Guardar ── */
  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      setError('El título y la descripción son obligatorios.')
      return
    }
    setSaving(true)
    setError('')

    // Limpiar frases vacías antes de enviar
    const cleanPhrases = phrases
      .filter(p => p.text && p.text.trim())
      .map(p => ({
        text:    p.text.trim(),
        emotion: p.emotion || 'NORMAL',
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
            phrases:      cleanPhrases,
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
            phrases:      cleanPhrases,
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
          <label>Frases del robot ({phrases.length})</label>
          <p className="ctx-hint">
            Cada frase es una intervención completa que el robot dirá durante la
            sesión. Deben invitar a la conversación: preguntas abiertas,
            recuerdos, comentarios que pidan opinión. Evita respuestas cortas
            tipo "sí, me gusta".
          </p>

          {phrases.length === 0 && (
            <div className="ctx-empty ctx-empty--small">
              Aún no hay frases. Añade la primera con el botón de abajo.
            </div>
          )}

          <div className="ctx-phrase-list">
            {phrases.map((p, idx) => (
              <div key={idx} className="ctx-phrase">
                <div className="ctx-phrase__head">
                  <select
                    className="ctx-phrase__emotion"
                    value={p.emotion}
                    onChange={e => updatePhrase(idx, { emotion: e.target.value })}
                  >
                    {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button
                    className="ctx-phrase__delete"
                    onClick={() => removePhrase(idx)}
                    aria-label="Eliminar frase"
                  >×</button>
                </div>
                <textarea
                  className="ctx-phrase__text"
                  rows={2}
                  value={p.text}
                  onChange={e => updatePhrase(idx, { text: e.target.value })}
                  placeholder="Frase completa que dirá el robot…"
                />
              </div>
            ))}
          </div>

          <div className="ctx-phrase-add">
            <button className="ctx-btn-secondary" onClick={addPhrase}>
              + Añadir frase
            </button>
          </div>
        </div>

        {error && <p className="ctx-error">{error}</p>}

      </div>
    </div>
  )
}
