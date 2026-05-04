package com.ugr.sanbot_app;

import android.util.Log;

import androidx.core.view.OneShotPreDrawListener;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;

/**
 * Cliente WebSocket que conecta el robot con el backend FastAPI.
 *
 * Mensajes recibidos (backend → robot):
 *   { "type": "wizard_message", "text": "...", "message_id": "..." }
 *   El mago ha enviado un texto que el robot debe reproducir en voz alta.
 *
 * Mensajes enviados (robot → backend):
 *   { "type": "robot_speech", "text": "..." }
 *   El robot (o el participante) ha dicho algo; el backend lo reenvía
 *   al frontend del mago para mostrarlo en el chat.
 */
public class RobotWebSocketClient extends WebSocketClient {

    private static final String TAG = "Mi_APP";

    /** Callback invocado en el hilo de UI con el texto que el robot debe decir. */
    public interface OnWizardMessageListener {
        void onWizardMessage(String text);
    }

    public interface OnEmotionListener {
        void onEmotion(String emotion);
    }

    private final OnWizardMessageListener listener;
    private final OnEmotionListener emotionListener;

    public RobotWebSocketClient(URI serverUri, OnWizardMessageListener listener, OnEmotionListener emotionListener) {
        super(serverUri);
        this.listener = listener;
        this.emotionListener = emotionListener;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    @Override
    public void onOpen(ServerHandshake handshake) {
        Log.i(TAG, "[WS] Conectado al backend: " + getURI());
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        Log.w(TAG, "[WS] Desconectado — código: " + code + " | razón: " + reason);
    }

    @Override
    public void onError(Exception e) {
        Log.e(TAG, "[WS] Error de conexión: " + e.getMessage());
    }

    // ── Incoming messages ────────────────────────────────────────────

    @Override
    public void onMessage(String raw) {
        Log.d(TAG, "[WS] Mensaje recibido: " + raw);

        try {
            JSONObject json    = new JSONObject(raw);
            String     type    = json.optString("type", "");

            switch (type) {
                case "wizard_message":
                    String text = json.optString("text", "").trim();
                    if (!text.isEmpty() && listener != null) {
                        listener.onWizardMessage(text);
                    }
                    break;

                case "emotion":
                    String emotion = json.optString("emotion", "NORMAL").trim();

                    if (!emotion.isEmpty() && emotionListener != null) {
                        emotionListener.onEmotion(emotion);
                    }

                    break;

                case "status":
                    // Mensaje de estado de conexión — ignorado en el robot por ahora
                    break;

                default:
                    Log.d(TAG, "[WS] Tipo de mensaje no gestionado: " + type);
            }

        } catch (JSONException e) {
            Log.e(TAG, "[WS] Error al parsear JSON: " + e.getMessage());
        }
    }

    // ── Outgoing messages ────────────────────────────────────────────

    /**
     * Envía al backend lo que el robot (o el participante) ha dicho.
     * El backend lo reenvía al frontend del mago como burbuja de chat.
     */
    public void sendRobotSpeech(String text) {
        if (!isOpen()) {
            Log.w(TAG, "[WS] sendRobotSpeech ignorado: socket no conectado.");
            return;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "robot_speech");
            payload.put("text", text);
            send(payload.toString());
            Log.d(TAG, "[WS] robot_speech enviado: " + text);
        } catch (JSONException e) {
            Log.e(TAG, "[WS] Error al construir robot_speech: " + e.getMessage());
        }
    }

    /**
     * Envía un fotograma de la cámara al backend (JPEG codificado en base64).
     * El backend lo retransmite al wizard frontend para mostrarlo en tiempo real.
     *
     * @param base64Jpeg Imagen JPEG codificada en base64 sin saltos de línea.
     */
    public void sendRobotImage(String base64Jpeg) {
        if (!isOpen()) {
            Log.w(TAG, "[WS] sendRobotImage ignorado: socket no conectado.");
            return;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "robot_image");
            payload.put("image", base64Jpeg);
            payload.put("timestamp", String.valueOf(System.currentTimeMillis()));
            send(payload.toString());
            Log.d(TAG, "[WS] robot_image enviado (" + base64Jpeg.length() + " chars base64)");
        } catch (JSONException e) {
            Log.e(TAG, "[WS] Error al construir robot_image: " + e.getMessage());
        }
    }
}