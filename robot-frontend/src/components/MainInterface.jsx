/**
 * MainInterface
 *
 * Interfaz principal del mago: chat, emociones y barra de entrada.
 * Se monta solo cuando hay una sesión activa; eso garantiza que el
 * WebSocket de /ws/wizard se crea una única vez tras el setup.
 *
 * @param {{ sessionId: string, user: object, mode: string }} session
 */
import { useState, useCallback } from 'react'

import { useTimer }                     from '../hooks/useTimer'
import { useWebSocket, DeliveryStatus } from '../hooks/useWebSocket'

import TopBar          from './TopBar'
import ChatArea        from './ChatArea'
import BottomBar       from './BottomBar'
import RobotCameraView from './RobotCameraView'

const HTTP_BASE = import.meta.env.VITE_API_BASE_URL
const WS_URL    = HTTP_BASE.replace('http', 'ws') + '/ws/wizard'

const EMOTION_OPTIONS = [
  { label: 'NORMAL',   value: 'NORMAL'   },
  { label: 'SONRISA',  value: 'SMILE'    },
  { label: 'RISA',     value: 'LAUGHTER' },
  { label: 'SORPRESA', value: 'SURPRISE' },
  { label: 'PREGUNTA', value: 'QUESTION' },
  { label: 'TÍMIDO',   value: 'SHY'      },
  { label: 'ENFADADO', value: 'ANGRY'    },
  { label: 'LLANTO',   value: 'CRY'      },
]

let _msgCounter = 0
function createMessage(sender, text, extra = {}) {
  return { id: `msg-${++_msgCounter}-${Date.now()}`, sender, text, ts: Date.now(), ...extra }
}

export default function MainInterface({ session, onEnd, onOpenMovement }) {
  const [inputText, setInputText]           = useState('')
  const [messages, setMessages]             = useState([])
  const [robotConnected, setRobotConnected] = useState(false)
  const [activeEmotion, setActiveEmotion]   = useState('NORMAL')
  const [cameraImage, setCameraImage]       = useState(null)
  const [ending, setEnding]                 = useState(false)

  const elapsed = useTimer()

  /* ── Handlers de WebSocket ── */
  const handleIncoming = useCallback((text) => {
    setMessages(prev => [...prev, createMessage('robot', text)])
  }, [])

  const handleDeliveryConfirm = useCallback((messageId) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, deliveryStatus: DeliveryStatus.DELIVERED } : msg
      )
    )
  }, [])

  const handleCameraFrame = useCallback((imageB64) => {
    setCameraImage(imageB64)
  }, [])

  useWebSocket(WS_URL, setRobotConnected, handleIncoming, handleDeliveryConfirm, handleCameraFrame)

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

  /* ── Enviar emoción ── */
  const handleSendEmotion = useCallback(async (emotion) => {
    setActiveEmotion(emotion)
    try {
      await fetch(`${HTTP_BASE}/messages/emotion`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ emotion, session_id: session.sessionId }),
      })
    } catch (err) {
      console.error('[emotion] HTTP request failed:', err)
    }
  }, [session.sessionId])

  /* ── Enviar mensaje ── */
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return

    const msg = createMessage('mago', trimmed, { deliveryStatus: DeliveryStatus.SENT })
    setMessages(prev => [...prev, msg])
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
          emotion:    activeEmotion,
        }),
      })
    } catch (err) {
      console.error('[send] HTTP request failed:', err)
    }
  }, [inputText, session.sessionId, activeEmotion])

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

      <div className="workspace">

        <aside className="panel panel--left">
          <RobotCameraView imageB64={cameraImage} />

          <div className="emotion-panel">
            <div className="emotion-panel__title">Emociones del robot</div>
            <div className="emotion-grid">
              {EMOTION_OPTIONS.slice().reverse().map(({ label, value }) => (
                <button
                  type="button"
                  key={value}
                  className={`emotion-btn${activeEmotion === value ? ' emotion-btn--active' : ''}`}
                  onClick={() => handleSendEmotion(value)}
                  aria-label={`Enviar emoción ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <ChatArea messages={messages} />

        <aside className="panel panel--right">
          <button className="movement-open-btn" onClick={onOpenMovement}>
            Control de movimiento →
          </button>
        </aside>

      </div>

      <BottomBar
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
      />

    </div>
  )
}
