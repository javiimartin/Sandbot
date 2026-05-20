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

import TopBar             from './TopBar'
import ChatArea           from './ChatArea'
import BottomBar          from './BottomBar'
import RobotCameraView    from './RobotCameraView'
import AiSuggestionPanel  from './AiSuggestionPanel'

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
  const [aiSuggestion, setAiSuggestion]     = useState(null)
  const [aiGenerating, setAiGenerating]     = useState(false)
  const [inputOrigin, setInputOrigin]       = useState('wizard')

  const elapsed = useTimer()

  /* ── Handlers de WebSocket ── */
  const handleIncoming = useCallback((text) => {
    setMessages(prev => [...prev, createMessage('robot', text)])
    // Nuevo mensaje del participante → limpiar sugerencia anterior y marcar "generando"
    setAiSuggestion(null)
    setAiGenerating(true)
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

  const handleAiSuggestion = useCallback((text, emotion) => {
    setAiSuggestion({ text, emotion })
    setAiGenerating(false)
  }, [])

  useWebSocket(WS_URL, setRobotConnected, handleIncoming, handleDeliveryConfirm, handleCameraFrame, handleAiSuggestion)

  /* ── Sugerencia de IA ── */
  const handleAcceptSuggestion = useCallback(async (text, emotion) => {
    setAiSuggestion(null)
    // Aplicar la emoción sugerida en el robot antes de enviar el mensaje
    try {
      await fetch(`${HTTP_BASE}/messages/emotion`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ emotion, session_id: session.sessionId }),
      })
    } catch (err) {
      console.error('[ai accept emotion] HTTP request failed:', err)
    }
    // Enviar el mensaje directamente con origin='ai'
    const msg = createMessage('mago', text, { deliveryStatus: DeliveryStatus.SENT })
    setMessages(prev => [...prev, msg])
    try {
      await fetch(`${HTTP_BASE}/messages/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text,
          message_id: msg.id,
          session_id: session.sessionId,
          origin:     'ai',
          emotion,
        }),
      })
    } catch (err) {
      console.error('[ai accept send] HTTP request failed:', err)
    }
  }, [session.sessionId])

  const handleDiscardSuggestion = useCallback(() => {
    setAiSuggestion(null)
    setAiGenerating(false)
  }, [])

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
          origin:     inputOrigin,
          emotion:    activeEmotion,
        }),
      })
    } catch (err) {
      console.error('[send] HTTP request failed:', err)
    }
    setInputOrigin('wizard')
  }, [inputText, session.sessionId, activeEmotion, inputOrigin])

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

        <aside className="panel panel--right panel--ai">
          <button className="movement-open-btn" onClick={onOpenMovement}>
            Control de movimiento →
          </button>
          <AiSuggestionPanel
            suggestion={aiSuggestion}
            generating={aiGenerating}
            onAccept={handleAcceptSuggestion}
            onDiscard={handleDiscardSuggestion}
          />
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
