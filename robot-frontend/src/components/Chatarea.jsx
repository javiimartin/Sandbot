import { useRef, useEffect } from "react";
import ChatBubble from "./ChatBubble";

/**
 * ChatArea
 *
 * Scrollable message list. Auto-scrolls to the latest message.
 * Renders an empty-state prompt when there are no messages yet.
 *
 * @param {object}   props
 * @param {Array}    props.messages - Array of message objects:
 *   { id, sender, text, deliveryStatus }
 */
export default function ChatArea({ messages }) {
  const bottomRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="chat-area">
      <div className="chat-log" role="log" aria-live="polite">

        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-empty__icon">⬡</span>
            <p>Esperando interacción…</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              sender={msg.sender}
              text={msg.text}
              deliveryStatus={msg.deliveryStatus}
            />
          ))
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </main>
  );
}