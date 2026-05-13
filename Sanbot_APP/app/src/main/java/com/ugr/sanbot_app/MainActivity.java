package com.ugr.sanbot_app;

import android.content.Context;
import android.media.AudioManager;
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
    private static final AppMode MODE = AppMode.NORMAL;

    // ── UI ───────────────────────────────────────────────────────────
    private TextView tvStatus;      // estado de conexión / último texto reconocido
    private TextView tvLastSpeech;  // último texto enviado al backend
    private TextView tvListening;   // indicador visual "ESCUCHANDO" (solo modo NORMAL)
    private EditText etDevInput;    // campo de texto (solo modo DEV)
    private Button   btnDevSend;    // botón enviar (solo modo DEV)
    private Button   btnSaludo;     // botón de saludo manual

    // ── Helpers ──────────────────────────────────────────────────────
    private SpeechHelper  speechHelper;
    private HeadHelper    headHelper;
    private HandHelper    handHelper;
    private WheelHelper   wheelHelper;
    private EmotionHelper emotionHelper;
    private GestureHelper gestureHelper;
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
            muteWakeUpSound();
            initSpeechRecognition();
        } else {
            initDevMode();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        silenceHandler.removeCallbacks(flushSpeech);
        if (cameraHelper != null) cameraHelper.stop();
        if (webSocketClient != null && webSocketClient.isOpen()) webSocketClient.close();
        restoreVolumes();
    }

    // ════════════════════════════════════════════════════════════════
    // Inicialización
    // ════════════════════════════════════════════════════════════════

    private void bindViews() {
        tvStatus     = findViewById(R.id.tv_status);
        tvLastSpeech = findViewById(R.id.tv_last_speech);
        tvListening  = findViewById(R.id.tv_listening);
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
        wheelHelper   = new WheelHelper(wheelMotionManager);
        emotionHelper = new EmotionHelper(systemManager);
        gestureHelper = new GestureHelper(handHelper, headHelper);

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

            webSocketClient = new RobotWebSocketClient(uri,
                // wizard_message → TTS
                text -> runOnUiThread(() -> {
                    speechHelper.speak(text);
                    tvLastSpeech.setText("Robot dice: " + text);
                    Log.d(TAG, "[Main] wizard_message recibido → TTS: " + text);
                }),
                // emotion → cara
                emotion -> runOnUiThread(() -> emotionHelper.showEmotion(emotion)),
                // head_motion
                (action, speed, angle) -> runOnUiThread(
                        () -> headHelper.doAction(action, speed, angle)),
                // wheel_motion
                (action, speed) -> runOnUiThread(
                        () -> wheelHelper.doAction(action, speed)),
                // gesture
                gesture -> runOnUiThread(
                        () -> gestureHelper.performGesture(gesture))
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
     * Silencia todos los streams de audio excepto el TTS para eliminar
     * el pitido/sonido de wake-up que el robot emite con cada doWakeUp().
     * El volumen se restaura en onDestroy() para no dejarlo permanentemente a 0.
     */
    private AudioManager audioManager;
    private int savedSystemVol, savedNotifVol, savedRingVol;

    private void muteWakeUpSound() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;

        // Guardar volúmenes originales para restaurar en onDestroy
        savedSystemVol = audioManager.getStreamVolume(AudioManager.STREAM_SYSTEM);
        savedNotifVol  = audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
        savedRingVol   = audioManager.getStreamVolume(AudioManager.STREAM_RING);

        audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM,       0, 0);
        audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, 0, 0);
        audioManager.setStreamVolume(AudioManager.STREAM_RING,         0, 0);

        Log.i(TAG, "[Main] Streams SYSTEM/NOTIFICATION/RING silenciados");
    }

    private void restoreVolumes() {
        if (audioManager == null) return;
        audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM,       savedSystemVol, 0);
        audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, savedNotifVol,  0);
        audioManager.setStreamVolume(AudioManager.STREAM_RING,         savedRingVol,   0);
        Log.i(TAG, "[Main] Volúmenes restaurados");
    }

    /**
     * Escucha continua sin pitidos repetitivos.
     *
     * Estrategia:
     *   - doWakeUp() se llama UNA SOLA VEZ al inicio para activar el micrófono.
     *   - onRecognizeVolume() monitoriza el nivel de voz en tiempo real.
     *     Cuando supera el umbral, mostramos el indicador visual.
     *   - onRecognizeResult() recibe el texto reconocido y lo envía al backend.
     *     NO llamamos doWakeUp() aquí → sin pitido.
     *   - onSleep() solo ocurre si el firmware duerme al robot por timeout
     *     del sistema (no por nuestro código). En ese caso SÍ relanzamos
     *     doWakeUp() porque es inevitable — pero ocurre raramente.
     */
    private static final int  VOLUME_THRESHOLD  = 5;    // 0-30
    private static final long SILENCE_DELAY_MS  = 2000; // ms de silencio antes de enviar

    // Acumulador de fragmentos y timer de silencio
    private final StringBuilder speechBuffer = new StringBuilder();
    private final android.os.Handler silenceHandler = new android.os.Handler();
    private final Runnable flushSpeech = () -> {
        String full = speechBuffer.toString().trim();
        if (!full.isEmpty()) {
            Log.d(TAG, "[STT] Enviando acumulado: " + full);
            runOnUiThread(() -> tvLastSpeech.setText("Escuchado: " + full));
            sendSpeechToBackend(full);
            speechBuffer.setLength(0);
        }
    };

    private void initSpeechRecognition() {
        SpeechManager sm = speechHelper.getSpeechManager();

        sm.setOnSpeechListener(new RecognizeListener() {
            @Override
            public boolean onRecognizeResult(Grammar grammar) {
                String recognized = grammar.getText().trim();
                if (recognized.isEmpty()) return true;

                Log.d(TAG, "[STT] Fragmento: " + recognized);

                // Acumular fragmento
                if (speechBuffer.length() > 0) speechBuffer.append(" ");
                speechBuffer.append(recognized);

                // Mostrar en pantalla lo acumulado hasta ahora
                runOnUiThread(() -> tvLastSpeech.setText("Escuchando: " + speechBuffer));

                // Reiniciar el timer: si en 2s no llega más texto, enviamos
                silenceHandler.removeCallbacks(flushSpeech);
                silenceHandler.postDelayed(flushSpeech, SILENCE_DELAY_MS);

                return true;
            }

            @Override
            public void onRecognizeVolume(int volume) {
                runOnUiThread(() -> {
                    tvListening.setVisibility(View.VISIBLE);
                    if (volume > VOLUME_THRESHOLD) {
                        tvListening.setText("● ESCUCHANDO");
                        tvListening.setTextColor(0xFF22c55e); // verde
                    } else {
                        tvListening.setText("○ En espera");
                        tvListening.setTextColor(0xFF64748b); // gris
                    }
                });
            }
        });

        sm.setOnSpeechListener(new WakenListener() {
            @Override
            public void onWakeUp() {
                Log.d(TAG, "[STT] Micrófono activo");
                runOnUiThread(() -> {
                    tvStatus.setText("Modo NORMAL — activo");
                    tvListening.setVisibility(View.VISIBLE);
                });
            }

            @Override
            public void onSleep() {
                // El firmware durmió al robot (timeout del sistema).
                // Hay que reactivarlo — este doWakeUp() emitirá un pitido
                // pero ocurre raramente, no cada pocos segundos.
                Log.d(TAG, "[STT] Timeout del sistema — relanzando escucha");
                runOnUiThread(() -> tvListening.setVisibility(View.GONE));
                speechHelper.startListening();
            }
        });

        // Un único doWakeUp() al inicio
        speechHelper.startListening();
        Log.i(TAG, "[Main] Modo NORMAL: escucha STT iniciada (sin pitidos continuos)");
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