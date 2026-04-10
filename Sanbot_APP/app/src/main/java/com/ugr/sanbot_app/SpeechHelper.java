package com.ugr.sanbot_app;

import android.util.Log;

import com.qihancloud.opensdk.function.beans.SpeakOption;
import com.qihancloud.opensdk.function.unit.SpeechManager;

/**
 * Encapsula las llamadas al SDK de voz del Sanbot Elf.
 *
 * Responsabilidades:
 *   - Text-to-Speech (TTS): hacer que el robot hable.
 *   - Activar/desactivar el reconocimiento de voz (STT).
 */
public class SpeechHelper {

    private static final String TAG = "Mi_APP";

    private final SpeechManager speechManager;
    private final SpeakOption   speakOption;

    public SpeechHelper(SpeechManager speechManager) {
        this.speechManager = speechManager;

        speakOption = new SpeakOption();
        speakOption.setSpeed(40); // velocidad de habla (0-100)
    }

    // ── TTS ──────────────────────────────────────────────────────────

    /**
     * Hace que el robot diga el texto dado en voz alta.
     *
     * @param text Texto a sintetizar.
     */
    public void speak(String text) {
        if (text == null || text.trim().isEmpty()) return;
        Log.d(TAG, "[Speech] TTS → " + text);
        speechManager.startSpeak(text, speakOption);
    }

    // ── STT ──────────────────────────────────────────────────────────

    /**
     * Activa el modo de escucha del robot (wake-up).
     * El resultado se recibirá en el RecognizeListener registrado externamente.
     */
    public void startListening() {
        Log.d(TAG, "[Speech] Iniciando escucha (doWakeUp)");
        speechManager.doWakeUp();
    }

    /**
     * Expone el SpeechManager subyacente para registrar listeners
     * (RecognizeListener, WakenListener) desde MainActivity.
     */
    public SpeechManager getSpeechManager() {
        return speechManager;
    }
}