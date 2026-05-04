import { useEffect, useRef } from "react";

export const DeliveryStatus = {
  SENT: "sent",
  DELIVERED: "delivered",
};

export function useWebSocket(
  wsUrl,
  onStatusChange,
  onIncomingMessage,
  onDeliveryConfirm,
  onCameraFrame        // (imageB64: string, timestamp: string) => void
) {
  const socketRef = useRef(null);

  const onStatusRef   = useRef(onStatusChange);
  const onMessageRef  = useRef(onIncomingMessage);
  const onDeliveryRef = useRef(onDeliveryConfirm);
  const onCameraRef   = useRef(onCameraFrame);

  useEffect(() => { onStatusRef.current   = onStatusChange;    }, [onStatusChange]);
  useEffect(() => { onMessageRef.current  = onIncomingMessage; }, [onIncomingMessage]);
  useEffect(() => { onDeliveryRef.current = onDeliveryConfirm; }, [onDeliveryConfirm]);
  useEffect(() => { onCameraRef.current   = onCameraFrame;     }, [onCameraFrame]);

  useEffect(() => {
    // Evita que React StrictMode abra dos sockets
    if (socketRef.current) return;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

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
          onMessageRef.current(data.text);
          break;

        case "delivered":
          if (data.message_id) onDeliveryRef.current(data.message_id);
          break;

        case "robot_image":
          if (data.image && onCameraRef.current) {
            onCameraRef.current(data.image, data.timestamp ?? "");
          }
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
      socketRef.current = null;
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [wsUrl]);
}
