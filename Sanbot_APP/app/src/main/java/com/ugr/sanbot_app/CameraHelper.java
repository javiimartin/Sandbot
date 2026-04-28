package com.ugr.sanbot_app;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.qihancloud.opensdk.function.beans.multimedia.StreamOption;
import com.qihancloud.opensdk.function.unit.MultiMediaManager;

import java.io.ByteArrayOutputStream;

/**
 * Captura periódicamente fotogramas del stream de vídeo de la cámara del Sanbot
 * y los entrega como JPEG codificado en base64.
 *
 * Diseño:
 *   - Abre el stream con sub-resolución (640x480) para minimizar ancho de banda.
 *   - Cada CAPTURE_INTERVAL_MS segundos llama a getVideoImage() y obtiene un Bitmap.
 *   - Comprime a JPEG calidad 60 y codifica en base64 (sin saltos de línea).
 *   - Pasa el resultado al callback proporcionado por el caller.
 *
 * Notas críticas (sección 3.8 del PDF del SDK):
 *   - getVideoImage() puede devolver null durante los primeros segundos tras
 *     openStream() — se ignora silenciosamente y se reintenta en el siguiente tick.
 *   - closeStream() DEBE llamarse antes de destruir la Activity, sino se afecta
 *     la estabilidad del sistema.
 *   - El MultiMediaManager solo funciona en Activity (no en Service).
 */
public class CameraHelper {

    private static final String TAG = "CameraHelper";
    private static final long   CAPTURE_INTERVAL_MS = 5000L;
    private static final int    JPEG_QUALITY        = 60;

    /** Callback con el frame codificado en base64 listo para enviar por WS. */
    public interface OnFrameListener {
        void onFrame(String base64Jpeg);
    }

    private final MultiMediaManager mediaManager;
    private final Handler           handler = new Handler(Looper.getMainLooper());

    private OnFrameListener frameListener;
    private boolean         streamOpen = false;
    private boolean         running    = false;

    public CameraHelper(MultiMediaManager mediaManager) {
        this.mediaManager = mediaManager;
    }

    /**
     * Abre el stream de vídeo y arranca la captura periódica.
     * Idempotente: si ya está corriendo, no hace nada.
     */
    public void start(OnFrameListener listener) {
        if (mediaManager == null) {
            Log.e(TAG, "MultiMediaManager == null, no se puede iniciar la captura");
            return;
        }
        if (running) {
            Log.d(TAG, "start() ignorado: ya está corriendo");
            return;
        }

        this.frameListener = listener;

        // Abrir stream en sub-resolución (640x480) con decoding hardware
        StreamOption opt = new StreamOption();
        opt.setType(StreamOption.TYPE_HARDWARE_DECORD);
        opt.setChannel(StreamOption.SUB_STREAM);
        opt.setIsJustIframe(false);

        try {
            mediaManager.openStream(opt);
            streamOpen = true;
            Log.i(TAG, "Stream de vídeo abierto (sub-stream 640x480)");
        } catch (Exception e) {
            Log.e(TAG, "Error abriendo stream: " + e.getMessage());
            return;
        }

        running = true;
        handler.postDelayed(captureTick, CAPTURE_INTERVAL_MS);
        Log.i(TAG, "Captura periódica iniciada (cada " + CAPTURE_INTERVAL_MS + "ms)");
    }

    /**
     * Detiene la captura y cierra el stream. DEBE llamarse en onDestroy().
     */
    public void stop() {
        running = false;
        handler.removeCallbacks(captureTick);

        if (streamOpen && mediaManager != null) {
            try {
                mediaManager.closeStream();
                Log.i(TAG, "closeStream() invocado correctamente");
            } catch (Exception e) {
                Log.e(TAG, "Error cerrando stream: " + e.getMessage());
            }
            streamOpen = false;
        }
    }

    // ── Tick de captura ──────────────────────────────────────────────

    private final Runnable captureTick = new Runnable() {
        @Override
        public void run() {
            if (!running) return;

            try {
                captureAndDispatch();
            } catch (Throwable t) {
                Log.e(TAG, "Excepción en captureTick: " + t.getMessage());
            } finally {
                if (running) {
                    handler.postDelayed(this, CAPTURE_INTERVAL_MS);
                }
            }
        }
    };

    private void captureAndDispatch() {
        Bitmap bitmap = mediaManager.getVideoImage();
        if (bitmap == null) {
            // Normal durante los primeros segundos tras openStream(): el stream
            // todavía no tiene frames listos. Saltamos esta iteración.
            Log.d(TAG, "getVideoImage() devolvió null, esperando al próximo tick");
            return;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos);
            byte[] jpegBytes = baos.toByteArray();
            String base64    = Base64.encodeToString(jpegBytes, Base64.NO_WRAP);

            if (frameListener != null) {
                frameListener.onFrame(base64);
            }
            Log.d(TAG, "Frame capturado (" + jpegBytes.length + " bytes JPEG)");
        } finally {
            try { baos.close(); } catch (Exception ignored) {}
            // No reciclamos el bitmap: el SDK puede devolver el mismo buffer interno
        }
    }
}
