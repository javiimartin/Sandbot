import { DeliveryStatus } from "../hooks/useWebSocket";

/* ── SVG tick icons ─────────────────────────────────────────────── */

/** Single grey tick — message sent to backend */
function TickSent() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Enviado">
      <path
        d="M3 8.5L6.5 12L13 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Double blue tick — backend confirmed delivery */
function TickDelivered() {
  return (
    <svg viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Entregado">
      {/* First tick */}
      <path
        d="M1 8.5L4.5 12L11 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Second tick (offset right) */}
      <path
        d="M6 8.5L9.5 12L16 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────────────── */

/**
 * ChatBubble
 *
 * Renders a single chat message.
 * - "mago"  → right-aligned, blue bubble, delivery tick
 * - "robot" → left-aligned, dark bubble, no tick
 *
 * @param {object} props
 * @param {"mago"|"robot"} props.sender         - Who sent the message
 * @param {string}         props.text           - Message content
 * @param {string}         [props.deliveryStatus] - DeliveryStatus value (mago only)
 */
export default function ChatBubble({ sender, text, deliveryStatus }) {
  const isMago = sender === "mago";

  return (
    <div className={`bubble bubble--${sender}`}>
      {/* Sender label */}
      <span className="bubble__sender">
        {isMago ? "🧙 Mago" : "🤖 Robot"}
      </span>

      {/* Text + optional tick */}
      <div className="bubble__body">
        <p className="bubble__text">{text}</p>

        {isMago && (
          <span
            className={`bubble__tick bubble__tick--${deliveryStatus}`}
            title={
              deliveryStatus === DeliveryStatus.DELIVERED
                ? "Entregado al robot"
                : "Enviado al servidor"
            }
          >
            {deliveryStatus === DeliveryStatus.DELIVERED
              ? <TickDelivered />
              : <TickSent />}
          </span>
        )}
      </div>
    </div>
  );
}