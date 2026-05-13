package com.ugr.sanbot_app;

import android.util.Log;

import com.qihancloud.opensdk.function.beans.wheelmotion.NoAngleWheelMotion;
import com.qihancloud.opensdk.function.unit.WheelMotionManager;

/**
 * Control de las ruedas del robot.
 *
 * Mapea acciones de alto nivel (FORWARD, BACK, TURN_LEFT, TURN_RIGHT, STOP)
 * a las constantes ACTION_* del SDK Sanbot (NoAngleWheelMotion).
 *
 * La velocidad se traduce de la escala 1-10 del backend a la escala 1-10
 * del SDK directamente; los valores típicos son:
 *   - LENTO  → 2
 *   - MEDIO  → 5
 *   - RÁPIDO → 9
 */
public class WheelHelper {

    private static final String TAG = "WheelHelper";

    private final WheelMotionManager wheelMotionManager;

    public WheelHelper(WheelMotionManager wheelMotionManager) {
        this.wheelMotionManager = wheelMotionManager;
    }

    /**
     * Ejecuta una acción de las ruedas.
     *
     * @param action  uno de FORWARD, BACK, TURN_LEFT, TURN_RIGHT, STOP
     * @param speed   1-10 (1 lento, 10 máximo)
     */
    public void doAction(String action, int speed) {
        if (wheelMotionManager == null) {
            Log.e(TAG, "WheelMotionManager == null");
            return;
        }

        byte speedByte = (byte) Math.max(1, Math.min(10, speed));
        int sdkAction = mapAction(action);
        if (sdkAction < 0) {
            Log.w(TAG, "Acción desconocida: " + action);
            return;
        }

        NoAngleWheelMotion motion = new NoAngleWheelMotion((byte) sdkAction, speedByte);
        wheelMotionManager.doNoAngleMotion(motion);
        Log.d(TAG, "Wheel action=" + action + " speed=" + speed);
    }

    private int mapAction(String action) {
        switch (action) {
            case "FORWARD":    return NoAngleWheelMotion.ACTION_FORWARD_RUN;
            case "BACK":       return NoAngleWheelMotion.ACTION_BACK_RUN;
            case "TURN_LEFT":  return NoAngleWheelMotion.ACTION_TURN_LEFT;
            case "TURN_RIGHT": return NoAngleWheelMotion.ACTION_TURN_RIGHT;
            case "STOP":       return NoAngleWheelMotion.ACTION_STOP_RUN;
            default:           return -1;
        }
    }
}
