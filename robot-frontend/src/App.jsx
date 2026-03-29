import { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const HTTP_BASE = API_BASE;
const WS_BASE   = API_BASE.replace("http", "ws");

// ── Experiment metadata ────────────────────────────────────────────
const USUARIO = "Participante_01";
const SESION  = "Sesión_03";

// ── Helpers ────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function App() {
  const [text, setText]                     = useState("");
  const [messages, setMessages]             = useState([]);
  const [robotConnected, setRobotConnected] = useState(false);
  const [elapsed, setElapsed]               = useState(0);
  const messagesEndRef = useRef(null);

  // Session timer
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket
  useEffect(() => {
    const socket = new WebSocket(`${WS_BASE}/ws/robot`);
    socket.onopen    = () => console.log("Conectado al backend");
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "status") setRobotConnected(data.connected);
      if (data.type === "speak")  addMessage("robot", data.text);
    };
    socket.onerror = () => setRobotConnected(false);
    socket.onclose = () => setRobotConnected(false);
    return () => socket.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (sender, text) => {
    setMessages((prev) => [...prev, { sender, text, ts: Date.now() }]);
  };

  const enviarMensaje = async () => {
    if (!text.trim()) return;
    addMessage("mago", text.trim());
    await fetch(`${HTTP_BASE}/send`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text: text.trim() }),
    });
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  return (
    <>
      <style>{globalStyles}</style>

      <div className="shell">

        {/* ── TOP BAR ──────────────────────────────────────────── */}
        <header className="top-bar">

          {/* Left: robot status */}
          <div className="top-bar__side top-bar__left">
            <div className="status-pill" data-connected={robotConnected}>
              <span className="status-dot" />
              {robotConnected ? "Robot online" : "Robot offline"}
            </div>
          </div>

          {/* Center: user + session info */}
          <div className="top-bar__center">
            <div className="session-card">
              <div className="session-row">
                <span className="session-label">USUARIO</span>
                <span className="session-value">{USUARIO}</span>
              </div>
              <div className="session-divider" />
              <div className="session-row">
                <span className="session-label">TIEMPO DE SESIÓN</span>
                <span className="session-value session-value--timer">
                  {formatTime(elapsed)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: session id */}
          <div className="top-bar__side top-bar__right">
            <span className="meta-label">SESIÓN</span>
            <span className="meta-value">{SESION}</span>
          </div>

        </header>

        {/* ── WORKSPACE (3 columns, sides empty for now) ───────── */}
        <div className="workspace">

          {/* LEFT PANEL — placeholder (futuras secciones) */}
          <aside className="panel panel--left panel--empty">
            <span className="panel__placeholder">Panel izquierdo</span>
          </aside>

          {/* CENTER — chat */}
          <main className="chat-area">
            <div className="chat-log" role="log" aria-live="polite">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <span className="chat-empty__icon">⬡</span>
                  <p>Esperando interacción…</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`bubble bubble--${msg.sender}`}>
                    <span className="bubble__sender">
                      {msg.sender === "mago" ? "🧙 Mago" : "🤖 Robot"}
                    </span>
                    <p className="bubble__text">{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </main>

          {/* RIGHT PANEL — placeholder (futuras secciones) */}
          <aside className="panel panel--right panel--empty">
            <span className="panel__placeholder">Panel derecho</span>
          </aside>

        </div>

        {/* ── BOTTOM INPUT BAR ─────────────────────────────────── */}
        <footer className="bottom-bar">
          <div className="input-row">
            {/* Spacer to align with center chat column */}
            <div className="input-spacer" />

            <div className="input-inner">
              <input
                className="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Campo de texto donde el mago puede escribir…"
                autoComplete="off"
              />
              <button
                className="send-btn"
                onClick={enviarMensaje}
                disabled={!text.trim()}
              >
                Enviar
              </button>
            </div>

            <div className="input-spacer" />
          </div>
        </footer>

      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Syne:wght@700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #0b0f18;
    --surface:      #111827;
    --surface-2:    #1a2235;
    --border:       #1e2d45;
    --accent:       #38bdf8;
    --accent-dim:   #0369a1;
    --green:        #22c55e;
    --red:          #ef4444;
    --text:         #e2e8f0;
    --text-muted:   #64748b;
    --font-display: 'Syne', sans-serif;
    --font-mono:    'IBM Plex Mono', monospace;

    /* Column widths — easy to tune */
    --side-width:   260px;
  }

  html, body, #root {
    width: 100%; height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
  }

  /* ── Shell ──────────────────────────────────────────────────── */
  .shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  /* ── Top bar ────────────────────────────────────────────────── */
  .top-bar {
    display: grid;
    grid-template-columns: var(--side-width) 1fr var(--side-width);
    align-items: center;
    padding: 14px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }

  .top-bar__side {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .top-bar__left  { align-items: flex-start; }
  .top-bar__right { align-items: flex-end; }

  .meta-label {
    font-size: 10px;
    letter-spacing: 0.15em;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .meta-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }

  /* Session card (center) */
  .top-bar__center { display: flex; justify-content: center; }

  .session-card {
    display: flex;
    align-items: center;
    gap: 20px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 28px;
  }

  .session-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .session-label {
    font-size: 9px;
    letter-spacing: 0.18em;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .session-value {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .session-value--timer {
    color: var(--accent);
    font-size: 17px;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  .session-divider {
    width: 1px;
    height: 32px;
    background: var(--border);
  }

  /* Status pill */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 13px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-muted);
    transition: all 0.3s;
    width: fit-content;
  }
  .status-pill[data-connected="true"]  { border-color: var(--green); color: var(--green); }
  .status-pill[data-connected="false"] { border-color: var(--red);   color: var(--red); }

  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }
  .status-pill[data-connected="true"] .status-dot { animation: pulse 2s infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  /* ── Workspace (3 columns) ──────────────────────────────────── */
  .workspace {
    display: grid;
    grid-template-columns: var(--side-width) 1fr var(--side-width);
    overflow: hidden;
    gap: 0;
  }

  /* Side panels (empty placeholders) */
  .panel {
    border-right: 1px solid var(--border);
    overflow: hidden;
  }
  .panel--right {
    border-right: none;
    border-left: 1px solid var(--border);
  }
  .panel--empty {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panel__placeholder {
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.3;
    letter-spacing: 0.06em;
    writing-mode: vertical-rl;
    user-select: none;
  }

  /* ── Chat area ──────────────────────────────────────────────── */
  .chat-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    /* Custom scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .chat-log::-webkit-scrollbar { width: 5px; }
  .chat-log::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  /* Empty state */
  .chat-empty {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: var(--text-muted);
    font-size: 13px;
    opacity: 0.45;
    user-select: none;
  }
  .chat-empty__icon { font-size: 40px; opacity: 0.4; }

  /* Bubbles */
  .bubble {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 72%;
    animation: slideIn 0.18s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .bubble--mago  { align-self: flex-end;  align-items: flex-end; }
  .bubble--robot { align-self: flex-start; align-items: flex-start; }

  .bubble__sender {
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    padding: 0 4px;
  }

  .bubble__text {
    padding: 11px 17px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.55;
    font-family: inherit;
  }
  .bubble--mago  .bubble__text {
    background: var(--accent-dim);
    color: #e0f2fe;
    border-bottom-right-radius: 4px;
  }
  .bubble--robot .bubble__text {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-bottom-left-radius: 4px;
  }

  /* ── Bottom bar ─────────────────────────────────────────────── */
  .bottom-bar {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 14px 0 18px;
  }

  .input-row {
    display: grid;
    grid-template-columns: var(--side-width) 1fr var(--side-width);
    gap: 0;
  }

  .input-spacer { /* fills the side columns */ }

  .input-inner {
    display: flex;
    gap: 10px;
    padding: 0 24px;
  }

  .text-input {
    flex: 1;
    padding: 12px 18px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    font-size: 14px;
    font-family: var(--font-mono);
    outline: none;
    transition: border-color 0.2s;
  }
  .text-input::placeholder { color: var(--text-muted); }
  .text-input:focus { border-color: var(--accent); }

  .send-btn {
    padding: 12px 26px;
    background: var(--accent);
    color: #0b0f18;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--font-mono);
    white-space: nowrap;
    transition: opacity 0.2s, transform 0.1s;
  }
  .send-btn:hover:not(:disabled)  { opacity: 0.85; }
  .send-btn:active:not(:disabled) { transform: scale(0.97); }
  .send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
`;