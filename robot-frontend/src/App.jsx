import { useState, useCallback } from "react";

import { useTimer }                      from "./hooks/useTimer";
import { useWebSocket, DeliveryStatus }  from "./hooks/useWebSocket";

import TopBar    from "./components/TopBar";
import ChatArea  from "./components/ChatArea";
import BottomBar from "./components/BottomBar";

/* ── Environment ────────────────────────────────────────────────── */
const HTTP_BASE = import.meta.env.VITE_API_BASE_URL;
const WS_URL    = HTTP_BASE.replace("http", "ws") + "/ws/wizard";

/* ── Experiment metadata (static — will come from config/backend) ─ */
const USUARIO = "Participante_01";
const SESION  = "Sesión_03";

/* ── Message factory ────────────────────────────────────────────── */
let _msgCounter = 0;
function createMessage(sender, text, extra = {}) {
  return {
    id:     `msg-${++_msgCounter}-${Date.now()}`,
    sender,
    text,
    ts:     Date.now(),
    ...extra,
  };
}

/* ══════════════════════════════════════════════════════════════════
   App
   Root component. Owns all shared state and wires together hooks
   and child components.
══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [inputText, setInputText]           = useState("");
  const [messages, setMessages]             = useState([]);
  const [robotConnected, setRobotConnected] = useState(false);

  const elapsed = useTimer();

  /* ── robot_speech → new left-side bubble ───────────────────── */
  const handleIncoming = useCallback((text) => {
    setMessages((prev) => [...prev, createMessage("robot", text)]);
  }, []);

  /* ── delivered → flip tick to blue on the mago bubble ──────── */
  const handleDeliveryConfirm = useCallback((messageId) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, deliveryStatus: DeliveryStatus.DELIVERED }
          : msg
      )
    );
  }, []);

  useWebSocket(WS_URL, setRobotConnected, handleIncoming, handleDeliveryConfirm);

  /* ── Send message ───────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Optimistically render as SENT — backend will confirm with DELIVERED
    const msg = createMessage("mago", trimmed, {
      deliveryStatus: DeliveryStatus.SENT,
    });
    setMessages((prev) => [...prev, msg]);
    setInputText("");

    try {
      await fetch(`${HTTP_BASE}/messages/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // message_id (snake_case) matches the backend Pydantic model
        body:    JSON.stringify({ text: trimmed, message_id: msg.id }),
      });
    } catch (err) {
      console.error("[send] HTTP request failed:", err);
      // TODO: mark message as DeliveryStatus.FAILED
    }
  }, [inputText]);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="shell">

      <TopBar
        usuario={USUARIO}
        sesion={SESION}
        elapsed={elapsed}
        robotConnected={robotConnected}
      />

      <div className="workspace">
        <aside className="panel panel--left panel--empty">
          <span className="panel__placeholder">Panel izquierdo</span>
        </aside>

        <ChatArea messages={messages} />

        <aside className="panel panel--right panel--empty">
          <span className="panel__placeholder">Panel derecho</span>
        </aside>
      </div>

      <BottomBar
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
      />

    </div>
  );
}