package com.ugr.sanbot_app;

import android.util.Log;

import com.qihancloud.opensdk.function.beans.SpeakOption;
import com.qihancloud.opensdk.function.unit.SpeechManager;

public class SpeechHelper {

    private SpeechManager speechManager;
    private SpeakOption speakOption;
    private String TAG = "SpeechHelper";

    public SpeechHelper(SpeechManager speechManager) {
        this.speechManager = speechManager;

        speakOption = new SpeakOption();
        speakOption.setSpeed(50);  // velocidad de habla (0–100)
        //speakOption.setIntonation(100); // volumen

    }

    public void decir(String texto) {
        if (speechManager == null) {
            Log.e(TAG, "SpeechManager es null. ¿Servicio no conectado aún?");
            return;
        }

        speechManager.startSpeak(texto, speakOption);
    }
}
