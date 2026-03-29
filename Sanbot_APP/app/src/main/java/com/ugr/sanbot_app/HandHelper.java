package com.ugr.sanbot_app;

import android.os.Handler;
import android.util.Log;

import com.qihancloud.opensdk.function.beans.handmotion.*;
import com.qihancloud.opensdk.function.unit.HandMotionManager;

public class HandHelper {

    private HandMotionManager handMotionManager;
    private SpeechHelper speechHelper;
    private Handler handler = new Handler();
    private String TAG = "HandHelper";

    public HandHelper(HandMotionManager handMotionManager, SpeechHelper speechHelper) {
        this.handMotionManager = handMotionManager;
        this.speechHelper = speechHelper;
    }

    // -----------------------------------------
    //   LEVANTAR BRAZO DERECHO + DECIR HOLA
    // -----------------------------------------
    public void saludarNatural() {

        if (handMotionManager == null) {
            Log.e(TAG, "HandMotionManager == null");
            return;
        }

        // --- 1) Levantar brazo derecho (saludo natural ≈ 90°)
        AbsoluteAngleHandMotion levantarBrazo =
                new AbsoluteAngleHandMotion(
                        AbsoluteAngleHandMotion.PART_RIGHT,
                        5,       // velocidad suave
                        60       // ángulo de saludo
                );

        handMotionManager.doAbsoluteAngleMotion(levantarBrazo);

        // Decir "Hola"
        speechHelper.decir("¡Hola!, me alegro de verte");

        // --- 2) Mantener brazo arriba durante 5 segundos
        handler.postDelayed(() -> {

            // --- 3) Bajar brazo de vuelta a 0°
            AbsoluteAngleHandMotion bajarBrazo =
                    new AbsoluteAngleHandMotion(
                            AbsoluteAngleHandMotion.PART_RIGHT,
                            5,
                            180       // posición inicial
                    );

            handMotionManager.doAbsoluteAngleMotion(bajarBrazo);

        }, 5000); // espera 5 segundos
    }

}
