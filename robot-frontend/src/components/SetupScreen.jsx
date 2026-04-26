import { useState, useEffect, useRef } from 'react'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL
const WS_URL    = HTTP_BASE.replace('http', 'ws') + '/ws/wizard'

const STATUS_LABEL = {
  unknown:      'Sin verificar',
  checking:     'Verificando…',
  connected:    'Conectado',
  disconnected: 'Sin conexión',
}

export default function SetupScreen({ onStart }) {
  const [users, setUsers]               = useState([])
  const [query, setQuery]               = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser]           = useState({ name: '', age: '', gender: '' })
  const [mode, setMode]                 = useState('REAL')
  const [robotStatus, setRobotStatus]   = useState('unknown')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const wsRef = useRef(null)

  // Cargar usuarios existentes
  useEffect(() => {
    fetch(`${HTTP_BASE}/users`)
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Limpiar WS al desmontar
  useEffect(() => () => wsRef.current?.close(), [])

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(query.toLowerCase())
  )

  /* ── Comprobar conexión del robot ── */
  const handleCheckRobot = () => {
    setRobotStatus('checking')
    wsRef.current?.close()

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    const timeout = setTimeout(() => {
      setRobotStatus('disconnected')
      ws.close()
    }, 6000)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'status') {
          clearTimeout(timeout)
          setRobotStatus(msg.connected ? 'connected' : 'disconnected')
        }
      } catch { /* ignore */ }
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      setRobotStatus('disconnected')
    }
  }

  /* ── Crear nuevo usuario ── */
  const handleCreateUser = async () => {
    if (!newUser.name.trim()) return
    setError('')
    try {
      const res = await fetch(`${HTTP_BASE}/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:   newUser.name.trim(),
          age:    newUser.age ? parseInt(newUser.age, 10) : null,
          gender: newUser.gender || null,
        }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      const user = { user_id: created.user_id, name: created.name, age: created.age }
      setUsers(prev => [user, ...prev])
      setSelectedUser(user)
      setQuery(user.name)
      setShowCreateForm(false)
      setNewUser({ name: '', age: '', gender: '' })
    } catch {
      setError('Error al crear el usuario.')
    }
  }

  /* ── Iniciar sesión ── */
  const canStart = selectedUser !== null && (mode === 'TEST' || robotStatus === 'connected')

  const handleStart = async () => {
    if (!canStart || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${HTTP_BASE}/sessions/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: selectedUser.user_id }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      wsRef.current?.close()
      onStart({ sessionId: data.session_id, user: selectedUser, mode })
    } catch {
      setError('Error al iniciar la sesión. Comprueba la conexión con el backend.')
      setLoading(false)
    }
  }

  /* ── Render ── */
  return (
    <div className="setup-overlay">
      <div className="setup-card">

        <div className="setup-header">
          <h1>Interfaz de control del Mago de Oz</h1>
          <p>Configuración de la sesión de interacción humano-robot</p>
        </div>

        <div className="setup-body">

          {/* ── Datos del usuario ── */}
          <div className="setup-field">
            <label>Datos del usuario</label>
            <div className="setup-user-input-wrap">
              <input
                className="setup-input"
                type="text"
                placeholder="Buscar participante…"
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  setSelectedUser(null)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && query.length > 0 && (
                <ul className="setup-dropdown">
                  {filteredUsers.length > 0
                    ? filteredUsers.map(u => (
                        <li
                          key={u.user_id}
                          className={selectedUser?.user_id === u.user_id ? 'selected' : ''}
                          onMouseDown={() => {
                            setSelectedUser(u)
                            setQuery(u.name)
                            setShowDropdown(false)
                          }}
                        >
                          {u.name}{u.age ? ` — ${u.age} años` : ''}
                        </li>
                      ))
                    : <li className="no-results">Sin resultados</li>
                  }
                </ul>
              )}
            </div>

            <button
              className="setup-link-btn"
              onClick={() => { setShowCreateForm(v => !v); setError('') }}
            >
              {showCreateForm ? '▲ Cancelar' : '+ Crear nuevo usuario'}
            </button>

            {showCreateForm && (
              <div className="setup-create-form">
                <input
                  className="setup-input"
                  placeholder="Nombre *"
                  value={newUser.name}
                  onChange={e => setNewUser(v => ({ ...v, name: e.target.value }))}
                />
                <div className="setup-create-row">
                  <input
                    className="setup-input"
                    type="number"
                    placeholder="Edad"
                    min="0"
                    max="120"
                    value={newUser.age}
                    onChange={e => setNewUser(v => ({ ...v, age: e.target.value }))}
                  />
                  <select
                    className="setup-input"
                    value={newUser.gender}
                    onChange={e => setNewUser(v => ({ ...v, gender: e.target.value }))}
                  >
                    <option value="">Género</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Other">Otro</option>
                  </select>
                </div>
                <button
                  className="setup-btn-secondary"
                  onClick={handleCreateUser}
                  disabled={!newUser.name.trim()}
                >
                  Guardar usuario
                </button>
              </div>
            )}
          </div>

          {/* ── Modo de sesión ── */}
          <div className="setup-field">
            <label>Modo de sesión</label>
            <div className="setup-mode-buttons">
              <button
                className={`setup-mode-btn${mode === 'REAL' ? ' active' : ''}`}
                onClick={() => setMode('REAL')}
              >
                REAL
              </button>
              <button
                className={`setup-mode-btn${mode === 'TEST' ? ' active' : ''}`}
                onClick={() => setMode('TEST')}
              >
                TEST
              </button>
            </div>
            {mode === 'REAL' && (
              <p className="setup-mode-hint">El robot debe estar conectado para iniciar.</p>
            )}
          </div>

          {/* ── Estado del robot ── */}
          <div className="setup-field">
            <label>Estado del robot</label>
            <div className="setup-robot-row">
              <div className="setup-status-pill">
                <span className={`setup-dot ${robotStatus}`} />
                <span>{STATUS_LABEL[robotStatus]}</span>
              </div>
              <button
                className="setup-btn-secondary"
                onClick={handleCheckRobot}
                disabled={robotStatus === 'checking'}
              >
                Comprobar conexión con el robot
              </button>
            </div>
          </div>

          {error && <p className="setup-error">{error}</p>}

          {/* ── Comenzar sesión ── */}
          <button
            className="setup-btn-primary"
            onClick={handleStart}
            disabled={!canStart || loading}
          >
            {loading ? 'Iniciando…' : 'Comenzar sesión'}
          </button>

        </div>
      </div>
    </div>
  )
}
