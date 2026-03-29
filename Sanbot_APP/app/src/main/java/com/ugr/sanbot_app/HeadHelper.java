package com.ugr.sanbot_app;

import android.os.Handler;
import android.util.Log;


import com.qihancloud.opensdk.function.unit.HeadMotionManager;
import com.qihancloud.opensdk.function.beans.headmotion.AbsoluteAngleHeadMotion;
import com.qihancloud.opensdk.function.beans.headmotion.RelativeAngleHeadMotion;

public class HeadHelper {

    private HeadMotionManager headMotionManager;
    private SpeechHelper speechHelper;
    private Handler handler = new Handler();
    private String TAG = "HeadHelper";

    public HeadHelper(HeadMotionManager headMotionManager, SpeechHelper speechHelper) {
        this.headMotionManager = headMotionManager;
        this.speechHelper = speechHelper;
    }


    public void mirarZapatos() {

        if (headMotionManager == null) {
            Log.e(TAG, "HeadMotionManager == null");
            return;
        }

        // 1) Mirar al frente (horizontal centro = 90°, vertical = 20°)
        AbsoluteAngleHeadMotion miradaFrente =
                new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_HORIZONTAL, 90);
        headMotionManager.doAbsoluteAngleMotion(miradaFrente);

        AbsoluteAngleHeadMotion miradaCentroVertical =
                new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_VERTICAL, 20);
        headMotionManager.doAbsoluteAngleMotion(miradaCentroVertical);

        // 2) Bajar cabeza para mirar zapatos (vertical = 7°)
        handler.postDelayed(() -> {
            AbsoluteAngleHeadMotion mirarAbajo =
                    new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_VERTICAL, 7);
            headMotionManager.doAbsoluteAngleMotion(mirarAbajo);
        }, 400);

        // 3) Hablar después de 2 segundos
        handler.postDelayed(() -> {
            speechHelper.decir("¡Qué zapatos más bonitos!");
        }, 2400);

        // 4) Volver a la posición normal (centro)
        handler.postDelayed(() -> {
            AbsoluteAngleHeadMotion horizontalCentro =
                    new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_HORIZONTAL, 90);
            headMotionManager.doAbsoluteAngleMotion(horizontalCentro);

            AbsoluteAngleHeadMotion verticalCentro =
                    new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_VERTICAL, 20);
            headMotionManager.doAbsoluteAngleMotion(verticalCentro);
        }, 3200);
    }

}
