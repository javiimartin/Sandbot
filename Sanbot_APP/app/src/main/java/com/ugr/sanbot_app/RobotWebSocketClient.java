package com.ugr.sanbot_app;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;

import java.net.URI;

public class RobotWebSocketClient extends WebSocketClient {

    public interface MessageListener {
        void onMessageReceived(String message);
    }

    private static final String TAG = "WS_CLIENT";

    // Tiempos de backoff exponencial (ms)
    private static final long DELAY_INICIAL_MS = 2000;
    private static final long DELAY_MAXIMO_MS  = 30000;

    private MessageListener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long delayActual = DELAY_INICIAL_MS;
    private boolean cierreIntencional = false;

    public RobotWebSocketClient(URI serverUri, MessageListener listener) {
        super(serverUri);
        this.listener = listener;
    }

    // ------------------------------------------------------------------
    // Llamar a este método para cerrar la conexión de forma intencionada
    // (evita que se dispare la reconexión automática)
    // ------------------------------------------------------------------
    public void cerrarConexion() {
        cierreIntencional = true;
        handler.removeCallbacksAndMessages(null); // cancelar reintentos pendientes
        close();
        Log.d(TAG, "Conexión cerrada intencionalmente.");
    }

    // ------------------------------------------------------------------
    // Callbacks WebSocket
    // ------------------------------------------------------------------

    @Override
    public void onOpen(ServerHandshake handshakedata) {
        delayActual = DELAY_INICIAL_MS; // resetear backoff al conectar con éxito
        Log.d(TAG, "Conectado al backend FastAPI.");
    }

    @Override
    public void onMessage(String message) {
        Log.d(TAG, "Mensaje recibido: " + message);

        try {
            JSONObject json = new JSONObject(message);
            String type = json.getString("type");

            if (type.equals("speak")) {
                String text = json.getString("text");
                if (listener != null) {
                    listener.onMessageReceived(text);
                }
            }

            if (type.equals("status")) {
                Log.d(TAG, "Estado recibido del backend.");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error parseando JSON: " + e.getMessage());
        }
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        if (cierreIntencional) {
            Log.d(TAG, "Conexión cerrada intencionalmente. No se reintentará.");
            return;
        }

        Log.w(TAG, "Conexión perdida (code=" + code + ", reason=" + reason
                + ", remote=" + remote + "). Reintentando en " + delayActual / 1000 + "s...");

        programarReconexion();
    }

    @Override
    public void onError(Exception ex) {
        // onError siempre va seguido de onClose, así que la reconexión
        // se gestiona en onClose para no duplicar reintentos.
        Log.e(TAG, "Error WebSocket: " + ex.getMessage());
    }

    // ------------------------------------------------------------------
    // Lógica de reconexión con backoff exponencial
    // ------------------------------------------------------------------

    private void programarReconexion() {
        handler.postDelayed(() -> {
            Log.d(TAG, "Intentando reconexión... (próximo intento en "
                    + Math.min(delayActual * 2, DELAY_MAXIMO_MS) / 1000 + "s si falla)");

            // Duplicar el delay para el siguiente intento, con techo en DELAY_MAXIMO_MS
            delayActual = Math.min(delayActual * 2, DELAY_MAXIMO_MS);

            try {
                reconnect();
            } catch (Exception e) {
                Log.e(TAG, "Excepción al intentar reconnect(): " + e.getMessage());
                // Si reconnect() falla por algún motivo interno, programar otro reintento
                programarReconexion();
            }

        }, delayActual);
    }
}