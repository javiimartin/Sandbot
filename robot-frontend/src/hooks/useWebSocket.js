import { useEffect, useRef } from "react";

/**
 * Message delivery statuses for wizard-sent messages.
 * Mirrors the backend WsMessageType enum.
 * @enum {string}
 */
export const DeliveryStatus = {
  SENT:      "sent",       // message optimistically rendered, awaiting backend ack
  DELIVERED: "delivered",  // backend confirmed the robot received it
};

/**
 * useWebSocket
 *
 * Manages the WebSocket connection to the backend /ws/wizard endpoint.
 * Abstracts the WS lifecycle (connect, reconnect on close, cleanup)
 * and dispatches typed incoming messages to the appropriate callbacks.
 *
 * Incoming message types handled:
 *   status        → onStatusChange(connected: boolean)
 *   robot_speech  → onIncomingMessage(text: string)
 *   delivered     → onDeliveryConfirm(messageId: string)
 *
 * @param {string}   wsUrl             - Full WebSocket URL
 * @param {Function} onStatusChange    - (connected: boolean) => void
 * @param {Function} onIncomingMessage - (text: string) => void
 * @param {Function} onDeliveryConfirm - (messageId: string) => void
 */
export function useWebSocket(wsUrl, onStatusChange, onIncomingMessage, onDeliveryConfirm) {
  // Stable refs so the effect never re-runs due to callback identity changes
  const onStatusRef   = useRef(onStatusChange);
  const onMessageRef  = useRef(onIncomingMessage);
  const onDeliveryRef = useRef(onDeliveryConfirm);

  useEffect(() => { onStatusRef.current   = onStatusChange;    }, [onStatusChange]);
  useEffect(() => { onMessageRef.current  = onIncomingMessage; }, [onIncomingMessage]);
  useEffect(() => { onDeliveryRef.current = onDeliveryConfirm; }, [onDeliveryConfirm]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.info("[WS] Connected:", wsUrl);
      onStatusRef.current(true);
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.warn("[WS] Non-JSON message ignored:", event.data);
        return;
      }

      switch (data.type) {
        case "status":
          onStatusRef.current(data.connected);
          break;

        case "robot_speech":
          // A message from the participant / robot side → render left bubble
          onMessageRef.current(data.text);
          break;

        case "delivered":
          // Backend confirms the robot received a wizard message → flip tick
          if (data.message_id) onDeliveryRef.current(data.message_id);
          break;

        default:
          console.debug("[WS] Unhandled message type:", data.type);
      }
    };

    socket.onerror = (err) => {
      console.error("[WS] Error:", err);
      onStatusRef.current(false);
    };

    socket.onclose = () => {
      console.info("[WS] Disconnected");
      onStatusRef.current(false);
    };

    return () => socket.close();
  }, [wsUrl]);
}