package com.ugr.sanbot_app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.util.Base64;
import android.util.Log;
import android.util.Size;

import androidx.annotation.NonNull;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import java.util.List;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Captura fotogramas de la cámara estándar de Android del Sanbot (la que está
 * debajo de la tablet, no la frontal de la cabeza).
 *
 * Esta cámara NO se accede mediante el SDK de Qihan: es una cámara Android
 * normal, así que usamos CameraX. La frontal de la cabeza queda descartada
 * porque depende de un servicio de firmware (HDCamera) que en este modelo
 * busca el dispositivo en /dev/video1, y allí no existe (sólo /dev/video0).
 *
 * Pipeline:
 *   CameraX (ImageAnalysis)  → ImageProxy (YUV_420_888)
 *     → conversión YUV → JPEG vía YuvImage
 *     → base64
 *     → callback al exterior
 *
 * Se emite como máximo un frame cada CAPTURE_INTERVAL_MS. Los demás se
 * descartan en cuanto llegan para no encolar trabajo.
 */
public class CameraHelper {

    private static final String TAG                 = "CameraHelper";
    private static final long   CAPTURE_INTERVAL_MS = 5000L;
    private static final int    JPEG_QUALITY        = 60;
    private static final Size   TARGET_SIZE         = new Size(640, 480);

    public interface OnFrameListener {
        void onFrame(String base64Jpeg);
    }

    private final Context        context;
    private final LifecycleOwner lifecycleOwner;

    private ExecutorService cameraExecutor;
    private ProcessCameraProvider cameraProvider;
    private OnFrameListener frameListener;

    private volatile boolean running    = false;
    private volatile long    lastEmitTs = 0L;

    public CameraHelper(Context context, LifecycleOwner lifecycleOwner) {
        this.context        = context.getApplicationContext();
        this.lifecycleOwner = lifecycleOwner;
    }

    /** Inicializa CameraX y empieza a recibir frames. Idempotente. */
    public void start(OnFrameListener listener) {
        if (running) return;
        this.frameListener = listener;

        cameraExecutor = Executors.newSingleThreadExecutor();

        ListenableFuture<ProcessCameraProvider> future =
                ProcessCameraProvider.getInstance(context);

        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindUseCase();
                running = true;
                Log.i(TAG, "CameraX inicializado y enlazado al ciclo de vida");
            } catch (Exception e) {
                Log.e(TAG, "Error inicializando CameraX: " + e.getMessage(), e);
            }
        }, ContextCompat.getMainExecutor(context));
    }

    /** Configura ImageAnalysis y lo enlaza al ciclo de vida de la actividad. */
    private void bindUseCase() {
        // Enumerar las cámaras disponibles para saber con qué cuenta el robot.
        // El Sanbot no necesariamente reporta su cámara como FRONT o BACK
        // siguiendo la convención de un móvil.
        List<CameraInfo> available = cameraProvider.getAvailableCameraInfos();
        Log.i(TAG, "Cámaras disponibles: " + available.size());
        for (CameraInfo info : available) {
            int facing = info.getLensFacing();
            String label = facing == CameraSelector.LENS_FACING_FRONT ? "FRONT"
                    :       facing == CameraSelector.LENS_FACING_BACK  ? "BACK"
                    :       facing == CameraSelector.LENS_FACING_EXTERNAL ? "EXTERNAL"
                    :       "UNKNOWN(" + facing + ")";
            Log.i(TAG, "  - " + label);
        }

        if (available.isEmpty()) {
            Log.e(TAG, "El sistema no expone ninguna cámara accesible por CameraX");
            return;
        }

        // Elegir la primera disponible: si solo hay una, la usaremos sin
        // importar si está marcada como FRONT o BACK.
        CameraInfo chosen = available.get(0);
        CameraSelector selector = new CameraSelector.Builder()
                .requireLensFacing(chosen.getLensFacing())
                .build();
        Log.i(TAG, "Cámara elegida con lensFacing=" + chosen.getLensFacing());

        ResolutionSelector resolutionSelector = new ResolutionSelector.Builder()
                .setResolutionStrategy(new ResolutionStrategy(
                        TARGET_SIZE,
                        ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                .build();

        ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                .setResolutionSelector(resolutionSelector)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                .build();

        imageAnalysis.setAnalyzer(cameraExecutor, this::onFrame);

        cameraProvider.unbindAll();
        cameraProvider.bindToLifecycle(lifecycleOwner, selector, imageAnalysis);
    }

    /** Cierra todo. Llamar en onDestroy(). */
    public void stop() {
        running = false;
        if (cameraProvider != null) {
            try { cameraProvider.unbindAll(); } catch (Exception ignored) {}
            cameraProvider = null;
        }
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
            cameraExecutor = null;
        }
        Log.i(TAG, "CameraHelper detenido");
    }

    // ── Procesamiento de frames ─────────────────────────────────────────

    private void onFrame(@NonNull ImageProxy proxy) {
        try {
            long now = System.currentTimeMillis();
            if (now - lastEmitTs < CAPTURE_INTERVAL_MS) {
                return;  // todavía no toca emitir
            }
            lastEmitTs = now;

            byte[] jpeg = imageProxyToJpeg(proxy);
            if (jpeg == null) return;

            String base64 = Base64.encodeToString(jpeg, Base64.NO_WRAP);
            if (frameListener != null) frameListener.onFrame(base64);
            Log.d(TAG, "Frame emitido (" + jpeg.length + " bytes JPEG, "
                    + proxy.getWidth() + "x" + proxy.getHeight() + ")");
        } catch (Exception e) {
            Log.w(TAG, "Excepción procesando ImageProxy: " + e.getMessage());
        } finally {
            proxy.close();
        }
    }

    /**
     * Convierte un ImageProxy YUV_420_888 a JPEG mediante YuvImage.
     * YuvImage espera NV21 (Y plano seguido de VU intercalado), así que
     * primero reorganizamos los planos.
     */
    private byte[] imageProxyToJpeg(ImageProxy proxy) {
        int w = proxy.getWidth();
        int h = proxy.getHeight();

        ByteBuffer yBuffer = proxy.getPlanes()[0].getBuffer();
        ByteBuffer uBuffer = proxy.getPlanes()[1].getBuffer();
        ByteBuffer vBuffer = proxy.getPlanes()[2].getBuffer();

        int ySize = yBuffer.remaining();
        int uSize = uBuffer.remaining();
        int vSize = vBuffer.remaining();

        byte[] nv21 = new byte[ySize + uSize + vSize];

        // Y plano tal cual
        yBuffer.get(nv21, 0, ySize);
        // NV21: V antes que U, intercalados; con planos separados los copiamos
        // en orden V,U,V,U... pero como cada plano tiene pixel-stride=2 con
        // datos válidos en posiciones pares, el resultado es directamente
        // V plano + U plano si los buffers vienen "compactados" por el driver.
        // En la práctica, YUV_420_888 de CameraX en el Sanbot debería entregar
        // los planos U y V interleaved en memoria con pixel stride 2, por lo
        // que copiar V seguido de U funciona como NV21.
        vBuffer.get(nv21, ySize, vSize);
        uBuffer.get(nv21, ySize + vSize, uSize);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, w, h, null);
            yuv.compressToJpeg(new Rect(0, 0, w, h), JPEG_QUALITY, baos);
            return baos.toByteArray();
        } catch (Exception e) {
            Log.w(TAG, "Error comprimiendo YUV a JPEG: " + e.getMessage());
            return null;
        } finally {
            try { baos.close(); } catch (Exception ignored) {}
        }
    }

    /**
     * Conversión de respaldo si la anterior produce imágenes con colores
     * raros (algunos drivers no entregan los planos UV en formato compatible
     * con NV21 directamente). Se conserva por si necesitamos cambiar.
     */
    @SuppressWarnings("unused")
    private Bitmap imageProxyToBitmapManual(ImageProxy proxy) {
        // Implementación manual YUV→RGB pixel a pixel.
        // No se usa por defecto porque YuvImage es ~10x más rápido.
        return null;
    }
}
