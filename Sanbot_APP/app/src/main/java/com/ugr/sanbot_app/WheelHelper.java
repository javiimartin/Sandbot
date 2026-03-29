package com.ugr.sanbot_app;

import android.util.Log;

import com.qihancloud.opensdk.function.beans.wheelmotion.NoAngleWheelMotion;
import com.qihancloud.opensdk.function.unit.WheelMotionManager;

public class WheelHelper {

    private WheelMotionManager wheelMotionManager;
    private String TAG = "WheelHelper";
    private byte velocidad = 2;

    public WheelHelper(WheelMotionManager wheelMotionManager) {
        this.wheelMotionManager = wheelMotionManager;
    }

    // Mover hacia adelante
    public void moverAdelante() {
        NoAngleWheelMotion motion =
                new NoAngleWheelMotion(NoAngleWheelMotion.ACTION_FORWARD_RUN, velocidad);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "Moviendo hacia adelante");
    }

    // Mover hacia atrás
    public void moverAtras() {
        NoAngleWheelMotion motion =
                new NoAngleWheelMotion(NoAngleWheelMotion.ACTION_BACK_RUN, velocidad);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "Moviendo hacia atrás");
    }

    // Girar izquierda
    public void girarIzquierda() {
        NoAngleWheelMotion motion =
                new NoAngleWheelMotion(NoAngleWheelMotion.ACTION_TURN_LEFT, velocidad);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "Girando a la izquierda");
    }

    // Girar derecha
    public void girarDerecha() {
        NoAngleWheelMotion motion =
                new NoAngleWheelMotion(NoAngleWheelMotion.ACTION_TURN_RIGHT, velocidad);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "Girando a la derecha");
    }

    // STOP
    public void parar() {
        NoAngleWheelMotion motion =
                new NoAngleWheelMotion(NoAngleWheelMotion.ACTION_STOP_RUN, velocidad);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "PARADO");
    }
}
