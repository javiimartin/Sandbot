import { formatTime } from "../hooks/useTimer";

/**
 * TopBar
 *
 * Displays session metadata (user, session ID, elapsed time)
 * and the robot connection status.
 *
 * @param {object}  props
 * @param {string}  props.usuario        - Participant identifier
 * @param {string}  props.sesion         - Session identifier
 * @param {number}  props.elapsed        - Elapsed seconds (from useTimer)
 * @param {boolean} props.robotConnected - Whether the robot WebSocket is active
 */
export default function TopBar({ usuario, sesion, elapsed, robotConnected }) {
  return (
    <header className="top-bar">

      {/* Left: robot connection status */}
      <div className="top-bar__side top-bar__left">
        <div className="status-pill" data-connected={robotConnected}>
          <span className="status-dot" />
          {robotConnected ? "Robot online" : "Robot offline"}
        </div>
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
  );
}