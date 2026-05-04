import { useState, useEffect } from 'react'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL

const ORIGIN_LABEL = {
  wizard:      'Mago',
  ai:          'IA',
  context:     'Contexto',
  participant: 'Participante',
}

const ORIGIN_CLASS = {
  wizard:      'origin--wizard',
  ai:          'origin--ai',
  context:     'origin--context',
  participant: 'origin--participant',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(seconds) {
  if (seconds == null) return 'En curso'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/* ── Sección: lista de participantes ── */
function ParticipantList({ onSelect, selectedId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${HTTP_BASE}/users`)
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="records-empty">Cargando…</div>
  if (users.length === 0) return <div className="records-empty">No hay participantes registrados.</div>

  return (
    <ul className="records-list">
      {users.map(u => (
        <li
          key={u.user_id}
          className={`records-item${selectedId === u.user_id ? ' records-item--active' : ''}`}
          onClick={() => onSelect(u)}
        >
          <span className="records-item__name">{u.name}</span>
          <span className="records-item__meta">
            {[u.age ? `${u.age} años` : null, u.gender].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ── Sección: sesiones de un participante ── */
function SessionList({ user, onSelect, selectedId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setSessions([])
    setLoading(true)
    fetch(`${HTTP_BASE}/sessions`)
      .then(r => r.json())
      .then(data => {
        const filtered = Array.isArray(data)
          ? data.filter(s => s.user_name === user.name)
          : []
        setSessions(filtered)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user.user_id])

  if (loading) return <div className="records-empty">Cargando…</div>
  if (sessions.length === 0) return (
    <div className="records-empty">Este participante no tiene sesiones registradas.</div>
  )

  return (
    <ul className="records-list">
      {sessions.map(s => (
        <li
          key={s.session_id}
          className={`records-item${selectedId === s.session_id ? ' records-item--active' : ''}`}
          onClick={() => onSelect(s)}
        >
          <span className="records-item__name">{s.name}</span>
          <span className="records-item__meta">
            {formatDate(s.started_at)} · {formatDuration(s.duration_s)}
          </span>
          {!s.ended_at && <span className="records-item__badge">En curso</span>}
        </li>
      ))}
    </ul>
  )
}

/* ── Sección: log completo de una sesión ── */
function SessionLog({ session }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    setData(null)
    setLoading(true)
    setError('')
    fetch(`${HTTP_BASE}/sessions/${session.session_id}/log`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError('No se pudo cargar el registro de la sesión.'))
      .finally(() => setLoading(false))
  }, [session.session_id])

  if (loading) return <div className="records-empty">Cargando registro…</div>
  if (error)   return <div className="records-empty records-empty--error">{error}</div>
  if (!data)   return null

  const { log } = data
  const msgs   = log.filter(e => e.kind === 'message')
  const events = log.filter(e => e.kind === 'robot_event')

  return (
    <div className="session-log">
      {/* ── Cabecera de la sesión ── */}
      <div className="session-log__header">
        <div className="session-log__title">{data.session.name}</div>
        <div className="session-log__meta">
          <span>{data.session.user_name ?? 'Sin participante'}</span>
          <span className="session-log__dot">·</span>
          <span>{formatDate(data.session.started_at)}</span>
          <span className="session-log__dot">·</span>
          <span>{data.session.ended_at ? formatDuration(
            Math.round((new Date(data.session.ended_at) - new Date(data.session.started_at)) / 1000)
          ) : 'En curso'}</span>
        </div>
        <div className="session-log__stats">
          <span className="session-log__stat">{msgs.length} mensajes</span>
          <span className="session-log__stat">{events.length} eventos</span>
        </div>
      </div>

      {/* ── Registro cronológico ── */}
      {log.length === 0
        ? <div className="records-empty">La sesión no tiene entradas registradas.</div>
        : (
          <ol className="log-entries">
            {log.map((entry, i) => (
              entry.kind === 'message'
                ? (
                  <li key={entry.id ?? i} className="log-entry log-entry--message">
                    <span className="log-entry__time">{formatTime(entry.timestamp)}</span>
                    <span className={`log-entry__origin ${ORIGIN_CLASS[entry.origin] ?? ''}`}>
                      {ORIGIN_LABEL[entry.origin] ?? entry.origin}
                    </span>
                    {entry.emotion && entry.emotion !== 'NORMAL' && (
                      <span className="log-entry__emotion">{entry.emotion}</span>
                    )}
                    <span className="log-entry__text">{entry.text}</span>
                  </li>
                )
                : (
                  <li key={entry.id ?? i} className="log-entry log-entry--event">
                    <span className="log-entry__time">{formatTime(entry.timestamp)}</span>
                    <span className="log-entry__event-type">{entry.event_type}</span>
                  </li>
                )
            ))}
          </ol>
        )
      }
    </div>
  )
}

/* ── Vista principal ── */
export default function SessionsView({ onBack }) {
  const [selectedUser, setSelectedUser]       = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)

  const handleSelectUser = (user) => {
    setSelectedUser(user)
    setSelectedSession(null)
  }

  return (
    <div className="records-overlay">

      <div className="records-topbar">
        <button className="records-back-btn" onClick={onBack}>← Volver</button>
        <h1 className="records-title">Registro de sesiones</h1>
      </div>

      <div className="records-workspace">

        {/* Columna 1: participantes */}
        <div className="records-col">
          <div className="records-col__header">Participantes</div>
          <ParticipantList
            onSelect={handleSelectUser}
            selectedId={selectedUser?.user_id}
          />
        </div>

        {/* Columna 2: sesiones del participante */}
        <div className="records-col">
          <div className="records-col__header">
            {selectedUser ? `Sesiones de ${selectedUser.name}` : 'Sesiones'}
          </div>
          {selectedUser
            ? (
              <SessionList
                user={selectedUser}
                onSelect={setSelectedSession}
                selectedId={selectedSession?.session_id}
              />
            )
            : <div className="records-empty">Selecciona un participante.</div>
          }
        </div>

        {/* Columna 3: log de la sesión */}
        <div className="records-col records-col--log">
          <div className="records-col__header">
            {selectedSession ? `Registro: ${selectedSession.name}` : 'Registro de la sesión'}
          </div>
          {selectedSession
            ? <SessionLog session={selectedSession} />
            : <div className="records-empty">Selecciona una sesión para ver su registro.</div>
          }
        </div>

      </div>
    </div>
  )
}
