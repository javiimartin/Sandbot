package com.ugr.sanbot_app;

import android.util.Log;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;

/**
 * Cliente WebSocket que conecta el robot con el backend FastAPI.
 *
 * Mensajes recibidos (backend → robot):
 *   { "type": "wizard_message", ... }   → texto que el robot debe verbalizar
 *   { "type": "emotion",        ... }   → expresión facial a mostrar
 *   { "type": "head_motion",    ... }   → mover la cabeza
 *   { "type": "wheel_motion",   ... }   → mover las ruedas
 *   { "type": "gesture",        ... }   → ejecutar gesto compuesto
 *
 * Mensajes enviados (robot → backend):
 *   { "type": "robot_speech", ... }  → lo que dice el participante (ASR)
 *   { "type": "robot_image",  ... }  → fotograma de la cámara
 */
public class RobotWebSocketClient extends WebSocketClient {

    private static final String TAG = "Mi_APP";

    public interface OnWizardMessageListener { void onWizardMessage(String text); }
    public interface OnEmotionListener       { void onEmotion(String emotion); }
    public interface OnHeadMotionListener    { void onHeadMotion(String action, int speed, int angle); }
    public interface OnWheelMotionListener   { void onWheelMotion(String action, int speed); }
    public interface OnGestureListener       { void onGesture(String gesture); }

    private final OnWizardMessageListener wizardListener;
    private final OnEmotionListener       emotionListener;
    private final OnHeadMotionListener    headListener;
    private final OnWheelMotionListener   wheelListener;
    private final OnGestureListener       gestureListener;

    public RobotWebSocketClient(
            URI serverUri,
            OnWizardMessageListener wizardListener,
            OnEmotionListener       emotionListener,
            OnHeadMotionListener    headListener,
            OnWheelMotionListener   wheelListener,
            OnGestureListener       gestureListener
    ) {
        super(serverUri);
        this.wizardListener  = wizardListener;
        this.emotionListener = emotionListener;
        this.headListener    = headListener;
        this.wheelListener   = wheelListener;
        this.gestureListener = gestureListener;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    @Override public void onOpen(ServerHandshake handshake) {
        Log.i(TAG, "[WS] Conectado al backend: " + getURI());
    }

    @Override public void onClose(int code, String reason, boolean remote) {
        Log.w(TAG, "[WS] Desconectado — código: " + code + " | razón: " + reason);
    }

    @Override public void onError(Exception e) {
        Log.e(TAG, "[WS] Error de conexión: " + e.getMessage());
    }

    // ── Incoming messages ────────────────────────────────────────────

    @Override
    public void onMessage(String raw) {
        Log.d(TAG, "[WS] Mensaje recibido: " + raw);

        try {
            JSONObject json = new JSONObject(raw);
            String     type = json.optString("type", "");

            switch (type) {
                case "wizard_message": {
                    String text = json.optString("text", "").trim();
                    if (!text.isEmpty() && wizardListener != null) {
                        wizardListener.onWizardMessage(text);
                    }
                    break;
                }
                case "emotion": {
                    String emotion = json.optString("emotion", "NORMAL").trim();
                    if (!emotion.isEmpty() && emotionListener != null) {
                        emotionListener.onEmotion(emotion);
                    }
                    break;
                }
                case "head_motion": {
                    String action = json.optString("action", "");
                    int    speed  = json.optInt("speed", 5);
                    int    angle  = json.optInt("angle", 15);
                    if (!action.isEmpty() && headListener != null) {
                        headListener.onHeadMotion(action, speed, angle);
                    }
                    break;
                }
                case "wheel_motion": {
                    String action = json.optString("action", "");
                    int    speed  = json.optInt("speed", 5);
                    if (!action.isEmpty() && wheelListener != null) {
                        wheelListener.onWheelMotion(action, speed);
                    }
                    break;
                }
                case "gesture": {
                    String gesture = json.optString("gesture", "");
                    if (!gesture.isEmpty() && gestureListener != null) {
                        gestureListener.onGesture(gesture);
                    }
                    break;
                }
                case "status":
                    break;
                default:
                    Log.d(TAG, "[WS] Tipo de mensaje no gestionado: " + type);
            }

        } catch (JSONException e) {
            Log.e(TAG, "[WS] Error al parsear JSON: " + e.getMessage());
        }
    }

    // ── Outgoing messages ────────────────────────────────────────────

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
