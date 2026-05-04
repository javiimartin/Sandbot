package com.ugr.sanbot_app;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.qihancloud.opensdk.function.beans.StreamOption;
import com.qihancloud.opensdk.function.unit.MediaManager;

import java.io.ByteArrayOutputStream;

/**
 * Captura periódicamente fotogramas del stream de vídeo de la cámara del Sanbot
 * y los entrega como JPEG codificado en base64.
 *
 * - Usa sub-stream (640x480) para minimizar ancho de banda.
 * - Captura cada CAPTURE_INTERVAL_MS milisegundos.
 * - getVideoImage() puede devolver null los primeros segundos: se ignora.
 * - closeStream() DEBE llamarse en onDestroy() (sección 3.8.3 del SDK).
 */
public class CameraHelper {

    private static final String TAG                 = "CameraHelper";
    private static final long   CAPTURE_INTERVAL_MS = 5000L;
    private static final int    JPEG_QUALITY        = 60;

    public interface OnFrameListener {
        void onFrame(String base64Jpeg);
    }

    private final MediaManager mediaManager;
    private final Handler      handler = new Handler(Looper.getMainLooper());

    private OnFrameListener frameListener;
    private boolean         streamOpen = false;
    private boolean         running    = false;

    public CameraHelper(MediaManager mediaManager) {
        this.mediaManager = mediaManager;
    }

    /** Abre el stream de vídeo y arranca la captura periódica. Idempotente. */
    public void start(OnFrameListener listener) {
        if (mediaManager == null) {
            Log.e(TAG, "MediaManager es null, no se puede iniciar la captura");
            return;
        }
        if (running) return;

        this.frameListener = listener;

        StreamOption opt = new StreamOption();
        opt.setDecodType(StreamOption.HARDWARE_DECODE);
        opt.setChannel(StreamOption.SUB_STREAM);
        opt.setJustIframe(false);

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
        Log.i(TAG, "Captura periódica iniciada (cada " + CAPTURE_INTERVAL_MS + " ms)");
    }

    /** Detiene la captura y cierra el stream. Llamar siempre en onDestroy(). */
    public void stop() {
        running = false;
        handler.removeCallbacks(captureTick);

        if (streamOpen && mediaManager != null) {
            try {
                mediaManager.closeStream();
                Log.i(TAG, "closeStream() completado");
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
                if (running) handler.postDelayed(this, CAPTURE_INTERVAL_MS);
            }
        }
    };

    private void captureAndDispatch() {
        Bitmap bitmap = mediaManager.getVideoImage();
        if (bitmap == null) {
            // Normal durante los primeros segundos: el stream aún no tiene frames.
            Log.d(TAG, "getVideoImage() devolvió null, esperando al próximo tick");
            return;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            if (frameListener != null) frameListener.onFrame(base64);
            Log.d(TAG, "Frame capturado y codificado (" + baos.size() + " bytes JPEG)");
        } finally {
            try { baos.close(); } catch (Exception ignored) {}
        }
    }
}
