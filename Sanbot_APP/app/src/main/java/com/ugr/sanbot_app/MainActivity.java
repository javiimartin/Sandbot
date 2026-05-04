package com.ugr.sanbot_app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import com.qihancloud.opensdk.base.BindBaseActivity;
import com.qihancloud.opensdk.beans.FuncConstant;
import com.qihancloud.opensdk.function.beans.speech.Grammar;
import com.qihancloud.opensdk.function.unit.HardWareManager;
import com.qihancloud.opensdk.function.unit.HandMotionManager;
import com.qihancloud.opensdk.function.unit.HeadMotionManager;
import com.qihancloud.opensdk.function.unit.MediaManager;
import com.qihancloud.opensdk.function.unit.SpeechManager;
import com.qihancloud.opensdk.function.unit.WheelMotionManager;
import com.qihancloud.opensdk.function.unit.interfaces.speech.RecognizeListener;
import com.qihancloud.opensdk.function.unit.interfaces.speech.WakenListener;
import com.qihancloud.opensdk.function.unit.SystemManager;

import java.net.URI;

/**
 * Actividad principal de la app del Sanbot Elf.
 *
 * Modos de operación (configurar en AppConfig.java):
 *
 *   NORMAL — El robot escucha activamente. Cuando reconoce texto, lo envía al
 *            backend via WebSocket como robot_speech para que aparezca en el
 *            chat del mago. El campo de texto manual permanece oculto.
 *
 *   DEV    — El micrófono está desactivado. Aparece un campo de texto en
 *            pantalla para introducir mensajes manualmente y simular la
 *            escucha. Útil durante el desarrollo sin robot físico presente.
 */
public class MainActivity extends BindBaseActivity {

    private static final String TAG = "Mi_APP";

    // ── Modo de operación ────────────────────────────────────────────
    // Cambiar aquí para alternar entre modos sin tocar más código.
    private static final AppMode MODE = AppMode.DEV;

    // ── UI ───────────────────────────────────────────────────────────
    private TextView tvStatus;      // estado de conexión / último texto reconocido
    private TextView tvLastSpeech;  // último texto enviado al backend
    private EditText etDevInput;    // campo de texto (solo modo DEV)
    private Button   btnDevSend;    // botón enviar (solo modo DEV)
    private Button   btnSaludo;     // botón de saludo manual

    // ── Helpers ──────────────────────────────────────────────────────
    private SpeechHelper  speechHelper;
    private HeadHelper    headHelper;
    private HandHelper    handHelper;
    private EmotionHelper emotionHelper;
    private CameraHelper  cameraHelper;

    // ── WebSocket ────────────────────────────────────────────────────
    private RobotWebSocketClient webSocketClient;

    // ════════════════════════════════════════════════════════════════
    // Lifecycle
    // ════════════════════════════════════════════════════════════════

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        bindViews();
        applyModeVisibility();
    }

    /**
     * Llamado cuando el SDK del robot está listo.
     * Todas las llamadas al SDK deben ir aquí o en métodos invocados desde aquí.
     */
    @Override
    protected void onMainServiceConnected() {
        // Evita que la pantalla se apague mientras usamos el robot
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        initSdkManagers();
        initWebSocket();
        initButtons();
        initCamera();

        if (MODE == AppMode.NORMAL) {
            initSpeechRecognition();
        } else {
            initDevMode();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Detener la cámara ANTES de cerrar el WS (closeStream es crítico)
        if (cameraHelper != null) cameraHelper.stop();
        if (webSocketClient != null && webSocketClient.isOpen()) webSocketClient.close();
    }

    // ════════════════════════════════════════════════════════════════
    // Inicialización
    // ════════════════════════════════════════════════════════════════

    private void bindViews() {
        tvStatus     = findViewById(R.id.tv_status);
        tvLastSpeech = findViewById(R.id.tv_last_speech);
        etDevInput   = findViewById(R.id.et_dev_input);
        btnDevSend   = findViewById(R.id.btn_dev_send);
        btnSaludo    = findViewById(R.id.btn_saludo);
    }

    private void applyModeVisibility() {
        boolean isDevMode = (MODE == AppMode.DEV);

        // El campo de texto y el botón de enviar solo son visibles en modo DEV
        etDevInput.setVisibility(isDevMode ? View.VISIBLE : View.GONE);
        btnDevSend.setVisibility(isDevMode ? View.VISIBLE : View.GONE);

        // Mostrar el modo activo en la UI
        tvStatus.setText("Modo: " + MODE.name() + " — Conectando…");
    }

    private void initSdkManagers() {
        SpeechManager     speechManager     = (SpeechManager)     getUnitManager(FuncConstant.SPEECH_MANAGER);
        HeadMotionManager headMotionManager = (HeadMotionManager) getUnitManager(FuncConstant.HEADMOTION_MANAGER);
        HandMotionManager handMotionManager = (HandMotionManager) getUnitManager(FuncConstant.HANDMOTION_MANAGER);
        SystemManager     systemManager     = (SystemManager)     getUnitManager(FuncConstant.SYSTEM_MANAGER);

        // HardWareManager y WheelMotionManager disponibles para uso futuro
        HardWareManager    hardWareManager    = (HardWareManager)    getUnitManager(FuncConstant.HARDWARE_MANAGER);
        WheelMotionManager wheelMotionManager = (WheelMotionManager) getUnitManager(FuncConstant.WHEELMOTION_MANAGER);

        speechHelper  = new SpeechHelper(speechManager);
        headHelper    = new HeadHelper(headMotionManager, speechHelper);
        handHelper    = new HandHelper(handMotionManager, speechHelper);
        emotionHelper = new EmotionHelper(systemManager);

        // MediaManager: si el SDK no lo soporta en este dispositivo, la cámara
        // queda desactivada pero el resto de la app sigue funcionando.
        MediaManager mediaManager = null;
        try {
            mediaManager = (MediaManager) getUnitManager(FuncConstant.MEDIA_MANAGER);
            Log.i(TAG, "[Main] MediaManager obtenido correctamente");
        } catch (Throwable t) {
            Log.w(TAG, "[Main] MediaManager no disponible: " + t.getMessage());
        }
        cameraHelper = new CameraHelper(mediaManager);
    }

    private void initWebSocket() {
        try {
            String ip   = getString(R.string.backend_ip);
            String port = getString(R.string.backend_port);
            URI uri     = new URI("ws://" + ip + ":" + port + "/ws/robot");

            webSocketClient = new RobotWebSocketClient(uri, text -> {
                // Mensaje del mago → el robot lo dice en voz alta (hilo UI)
                runOnUiThread(() -> {
                    speechHelper.speak(text);
                    tvLastSpeech.setText("Robot dice: " + text);
                    Log.d(TAG, "[Main] wizard_message recibido → TTS: " + text);
                });
            }, emotion -> {
                runOnUiThread(() -> {
                    emotionHelper.showEmotion(emotion);
                });
            }
            );

            webSocketClient.connect();
            Log.i(TAG, "[Main] WebSocket conectando a " + uri);

        } catch (Exception e) {
            Log.e(TAG, "[Main] Error al inicializar WebSocket: " + e.getMessage());
            tvStatus.setText("Error al conectar WebSocket");
        }
    }

    private void initButtons() {
        btnSaludo.setOnClickListener(v -> handHelper.saludarNatural());
    }

    private void initCamera() {
        if (cameraHelper == null) return;
        try {
            cameraHelper.start(base64Jpeg -> {
                if (webSocketClient != null && webSocketClient.isOpen()) {
                    webSocketClient.sendRobotImage(base64Jpeg);
                }
            });
            Log.i(TAG, "[Main] CameraHelper iniciado");
        } catch (Throwable t) {
            Log.w(TAG, "[Main] No se pudo iniciar la cámara: " + t.getMessage());
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Modo NORMAL — escucha por micrófono
    // ════════════════════════════════════════════════════════════════

    /**
     * Registra los listeners de STT y activa la escucha continua.
     * El robot envía al backend cada texto reconocido como robot_speech.
     */
    private void initSpeechRecognition() {
        SpeechManager sm = speechHelper.getSpeechManager();

        sm.setOnSpeechListener(new RecognizeListener() {
            @Override
            public boolean onRecognizeResult(Grammar grammar) {
                String recognized = grammar.getText().trim();
                if (recognized.isEmpty()) return true;

                Log.d(TAG, "[STT] Reconocido: " + recognized);
                runOnUiThread(() -> tvLastSpeech.setText("Escuchado: " + recognized));

                // Enviar al backend para que aparezca en el chat del mago
                sendSpeechToBackend(recognized);

                // Reactivar la escucha para la siguiente intervención
                speechHelper.startListening();

                return true;
            }

            @Override
            public void onRecognizeVolume(int volume) {
                // Se puede usar para mostrar un indicador de volumen en el futuro
            }
        });

        sm.setOnSpeechListener(new WakenListener() {
            @Override
            public void onWakeUp() {
                Log.d(TAG, "[STT] Escucha activada");
                runOnUiThread(() -> tvStatus.setText("Escuchando…"));
            }

            @Override
            public void onSleep() {
                Log.d(TAG, "[STT] Escucha desactivada");
                runOnUiThread(() -> tvStatus.setText("En espera"));
            }
        });

        // Arrancar la escucha al iniciar
        speechHelper.startListening();
        Log.i(TAG, "[Main] Modo NORMAL: escucha STT iniciada");
    }

    // ════════════════════════════════════════════════════════════════
    // Modo DEV — input manual por teclado
    // ════════════════════════════════════════════════════════════════

    /**
     * Configura el campo de texto y el botón para introducir mensajes
     * manualmente, simulando lo que el STT devolvería en modo NORMAL.
     */
    private void initDevMode() {
        Log.i(TAG, "[Main] Modo DEV: STT desactivado, usando input manual");
        tvStatus.setText("Modo DEV — escribe para simular STT");

        // Botón enviar
        btnDevSend.setOnClickListener(v -> sendDevMessage());

        // También enviar al pulsar "Done" / "Enter" en el teclado
        etDevInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND
                    || actionId == EditorInfo.IME_ACTION_DONE) {
                sendDevMessage();
                return true;
            }
            return false;
        });
    }

    /**
     * Lee el texto del campo de input en modo DEV, lo envía al backend
     * como si fuera el resultado del STT, y limpia el campo.
     */
    private void sendDevMessage() {
        String text = etDevInput.getText().toString().trim();
        if (text.isEmpty()) return;

        Log.d(TAG, "[DEV] Simulando STT con: " + text);
        tvLastSpeech.setText("Simulado: " + text);
        sendSpeechToBackend(text);
        etDevInput.setText("");
    }

    // ════════════════════════════════════════════════════════════════
    // Comunicación con el backend
    // ════════════════════════════════════════════════════════════════

    /**
     * Punto único de envío de texto al backend.
     * Llamado tanto desde el STT (modo NORMAL) como desde el input
     * manual (modo DEV) para garantizar comportamiento idéntico.
     *
     * @param text Texto a enviar como robot_speech.
     */
    private void sendSpeechToBackend(String text) {
        if (webSocketClient == null || !webSocketClient.isOpen()) {
            Log.w(TAG, "[Main] sendSpeechToBackend ignorado: WebSocket no conectado.");
            return;
        }
        webSocketClient.sendRobotSpeech(text);
    }
}