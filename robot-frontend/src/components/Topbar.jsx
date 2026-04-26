import { formatTime } from '../hooks/useTimer'

/**
 * TopBar
 *
 * @param {string}  props.usuario        - Nombre del participante
 * @param {string}  props.sesion         - ID de sesión (primeros 8 chars)
 * @param {string}  props.mode           - 'REAL' | 'TEST'
 * @param {number}  props.elapsed        - Segundos transcurridos
 * @param {boolean} props.robotConnected - Estado de conexión del robot
 */
export default function TopBar({ usuario, sesion, mode, elapsed, robotConnected }) {
  return (
    <header className="top-bar">

      {/* Left: robot connection status */}
      <div className="top-bar__side top-bar__left">
        <div className="status-pill" data-connected={robotConnected}>
          <span className="status-dot" />
          {robotConnected ? 'Robot online' : 'Robot offline'}
        </div>
        <span className={`mode-badge mode-badge--${mode?.toLowerCase()}`}>
          {mode}
        </span>
      </div>

      {/* Center: user + session timer */}
      <div className="top-bar__center">
        <div className="session-card">
          <div className="session-row">
            <span className="session-label">Usuario</span>
            <span className="session-value">{usuario}</span>
          </div>

          <div className="session-divider" />

          <div className="session-row">
            <span className="session-label">Tiempo de sesión</span>
            <span className="session-value session-value--timer">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>
      </div>

      {/* Right: session ID */}
      <div className="top-bar__side top-bar__right">
        <span className="meta-label">Sesión</span>
        <span className="meta-value">{sesion}</span>
      </div>

    </header>
  )
}
