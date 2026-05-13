/**
 * MovementControl
 *
 * Vista alternativa que permite al mago controlar el movimiento físico del
 * robot: cabeza, ruedas y gestos predefinidos. Se mantiene en pantalla el
 * visor de cámara y la barra inferior de chat para conservar el contexto
 * y poder seguir comunicándose con el participante mientras se mueve.
 *
 * @param {{ sessionId: string, user: object, mode: string }} session
 * @param {Function} onBack    – vuelve a la interfaz principal
 * @param {Function} onEnd     – finaliza la sesión
 */
import { useState, useCallback, useRef } from 'react'

import { useTimer }                     from '../hooks/useTimer'
import { useWebSocket, DeliveryStatus } from '../hooks/useWebSocket'

import TopBar          from './TopBar'
import BottomBar       from './BottomBar'
import RobotCameraView from './RobotCameraView'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL
const WS_URL    = HTTP_BASE.replace('http', 'ws') + '/ws/wizard'

const SPEED_PRESETS = [
  { label: 'Lento',  value: 2 },
  { label: 'Media',  value: 5 },
  { label: 'Rápido', value: 9 },
]

const GESTURES = [
  { label: 'Saludar',              value: 'GREET'           },
  { label: 'Asentir con la cabeza', value: 'NOD'             },
  { label: 'Negar con la cabeza',   value: 'SHAKE_HEAD'      },
  { label: 'Mostrar entusiasmo',   value: 'SHOW_ENTHUSIASM' },
  { label: 'Encogerse de hombros', value: 'SHRUG'           },
  { label: 'Mirar alrededor',      value: 'LOOK_AROUND'     },
]

let _msgCounter = 0
function createMessage(sender, text, extra = {}) {
  return { id: `msg-${++_msgCounter}-${Date.now()}`, sender, text, ts: Date.now(), ...extra }
}

export default function MovementControl({ session, onBack, onEnd }) {
  const [inputText, setInputText]           = useState('')
  const [robotConnected, setRobotConnected] = useState(false)
  const [cameraImage, setCameraImage]       = useState(null)
  const [wheelSpeed, setWheelSpeed]         = useState(5)
  const [ending, setEnding]                 = useState(false)
  const messagesRef = useRef([])

  const elapsed = useTimer()

  /* ── Handlers WS (sin estado de chat persistente: solo necesitamos
        cámara y estado de conexión en esta vista) ── */
  const handleIncoming        = useCallback(() => {}, [])
  const handleDeliveryConfirm = useCallback(() => {}, [])
  const handleCameraFrame     = useCallback((imageB64) => setCameraImage(imageB64), [])

  useWebSocket(WS_URL, setRobotConnected, handleIncoming, handleDeliveryConfirm, handleCameraFrame)

  /* ── Helpers HTTP ── */
  const postJson = useCallback(async (path, body) => {
    try {
      await fetch(`${HTTP_BASE}${path}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...body, session_id: session.sessionId }),
      })
    } catch (err) {
      console.error(`[${path}] HTTP request failed:`, err)
    }
  }, [session.sessionId])

  /* ── Acciones de cabeza ── */
  const moveHead = useCallback((action) => {
    postJson('/messages/head', { action, speed: 5, angle: 30 })
  }, [postJson])

  /* ── Acciones de ruedas ── */
  const moveWheels = useCallback((action) => {
    postJson('/messages/wheel', { action, speed: wheelSpeed })
  }, [postJson, wheelSpeed])

  /* ── Botón de ruedas con "pulsar para mover, soltar para parar" ── */
  const handleWheelDown = (action) => moveWheels(action)
  const handleWheelUp   = ()       => moveWheels('STOP')

  /* ── Gestos ── */
  const doGesture = useCallback((gesture) => {
    postJson('/messages/gesture', { gesture })
  }, [postJson])

  /* ── Enviar mensaje (igual que MainInterface) ── */
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return
    const msg = createMessage('mago', trimmed, { deliveryStatus: DeliveryStatus.SENT })
    messagesRef.current.push(msg)
    setInputText('')
    try {
      await fetch(`${HTTP_BASE}/messages/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text:       trimmed,
          message_id: msg.id,
          session_id: session.sessionId,
          origin:     'wizard',
        }),
      })
    } catch (err) {
      console.error('[send] HTTP request failed:', err)
    }
  }, [inputText, session.sessionId])

  /* ── Finalizar sesión ── */
  const handleEndSession = useCallback(async () => {
    if (ending) return
    setEnding(true)
    try {
      await fetch(`${HTTP_BASE}/sessions/${session.sessionId}/end`, { method: 'POST' })
    } catch (err) {
      console.error('[end session] HTTP request failed:', err)
    }
    onEnd()
  }, [ending, session.sessionId, onEnd])

  /* ── Render ── */
  return (
    <div className="shell">

      <TopBar
        usuario={session.user.name}
        sesion={session.sessionId.slice(0, 8)}
        mode={session.mode}
        elapsed={elapsed}
        robotConnected={robotConnected}
        onEndSession={handleEndSession}
      />

      <div className="movement-workspace">

        {/* ── Fila superior: cámara | cabeza | ruedas ── */}
        <div className="movement-top">

          {/* Cámara */}
          <div className="movement-top__cell">
            <RobotCameraView imageB64={cameraImage} />
            <button className="movement-back-btn" onClick={onBack}>
              ← Volver al panel principal
            </button>
          </div>

          {/* Control de cabeza */}
          <div className="movement-top__cell">
            <div className="control-panel control-panel--head">
              <div className="control-panel__title">Cabeza</div>
              <div className="dpad">
                <div />
                <button className="dpad-btn" onClick={() => moveHead('UP')}>↑</button>
                <div />

                <button className="dpad-btn" onClick={() => moveHead('LEFT')}>←</button>
                <button className="dpad-btn dpad-btn--center"
                        onClick={() => moveHead('CENTER_RESET')}>
                  Centro
                </button>
                <button className="dpad-btn" onClick={() => moveHead('RIGHT')}>→</button>

                <div />
                <button className="dpad-btn" onClick={() => moveHead('DOWN')}>↓</button>
                <div />
              </div>
            </div>
          </div>

          {/* Control de ruedas */}
          <div className="movement-top__cell">
            <div className="control-panel control-panel--wheels">
              <div className="control-panel__title">Movimiento</div>
              <div className="dpad">
                <div />
                <button className="dpad-btn"
                  onMouseDown={() => handleWheelDown('FORWARD')} onMouseUp={handleWheelUp}
                  onMouseLeave={handleWheelUp} onTouchStart={() => handleWheelDown('FORWARD')}
                  onTouchEnd={handleWheelUp}>↑</button>
                <div />

                <button className="dpad-btn"
                  onMouseDown={() => handleWheelDown('TURN_LEFT')} onMouseUp={handleWheelUp}
                  onMouseLeave={handleWheelUp} onTouchStart={() => handleWheelDown('TURN_LEFT')}
                  onTouchEnd={handleWheelUp}>←</button>
                <div />
                <button className="dpad-btn"
                  onMouseDown={() => handleWheelDown('TURN_RIGHT')} onMouseUp={handleWheelUp}
                  onMouseLeave={handleWheelUp} onTouchStart={() => handleWheelDown('TURN_RIGHT')}
                  onTouchEnd={handleWheelUp}>→</button>

                <div />
                <button className="dpad-btn"
                  onMouseDown={() => handleWheelDown('BACK')} onMouseUp={handleWheelUp}
                  onMouseLeave={handleWheelUp} onTouchStart={() => handleWheelDown('BACK')}
                  onTouchEnd={handleWheelUp}>↓</button>
                <div />
              </div>

              <div className="speed-selector">
                <span className="speed-selector__label">Velocidad</span>
                <div className="speed-selector__buttons">
                  {SPEED_PRESETS.map(({ label, value }) => (
                    <button key={value} type="button"
                      className={`speed-btn${wheelSpeed === value ? ' speed-btn--active' : ''}`}
                      onClick={() => setWheelSpeed(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Fila inferior: gestos en horizontal ── */}
        <div className="movement-bottom">
          <div className="control-panel__title" style={{ marginBottom: '8px' }}>Gestos predefinidos</div>
          <div className="gesture-row">
            {GESTURES.map(({ label, value }) => (
              <button key={value} type="button" className="gesture-btn"
                onClick={() => doGesture(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

      </div>

      <BottomBar
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
      />

    </div>
  )
}
