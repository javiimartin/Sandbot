package com.ugr.sanbot_app;

import android.util.Log;

import com.qihancloud.opensdk.function.unit.SystemManager;
import com.qihancloud.opensdk.function.beans.EmotionsType;

public class EmotionHelper {

    private static final String TAG = "Mi_APP";
    private final SystemManager systemManager;

    public EmotionHelper(SystemManager systemManager) {
        this.systemManager = systemManager;
    }

    public void showEmotion(String emotionName) {

        try {

            EmotionsType emotion = EmotionsType.valueOf(emotionName);

            systemManager.showEmotion(emotion);

            Log.d(TAG, "[Emotion] Mostrando emoción: " + emotionName);

        } catch (IllegalArgumentException e) {

            Log.e(TAG, "[Emotion] Emoción inválida: " + emotionName);

        }

    }
}