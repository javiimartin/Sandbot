package com.ugr.sanbot_app;

import android.os.Handler;
import android.util.Log;

import com.qihancloud.opensdk.function.beans.headmotion.AbsoluteAngleHeadMotion;
import com.qihancloud.opensdk.function.beans.headmotion.RelativeAngleHeadMotion;
import com.qihancloud.opensdk.function.unit.HeadMotionManager;

/**
 * Control de la cabeza del robot.
 *
 * Movimientos:
 *   - UP, DOWN, LEFT, RIGHT  → mueven la cabeza relativamente (RelativeAngleHeadMotion)
 *   - CENTER_RESET           → vuelve la cabeza al centro absoluto
 *                              (horizontal=90º, vertical=20º) vía AbsoluteAngleHeadMotion
 *
 * Rango del SDK Sanbot:
 *   horizontal: 0-180º (centro = 90)
 *   vertical:   7-30º  (centro ≈ 20)
 *   speed:      1-10
 */
public class HeadHelper {

    private static final String TAG = "HeadHelper";

    private final HeadMotionManager headMotionManager;
    private final SpeechHelper       speechHelper;
    private final Handler            handler = new Handler();

    public HeadHelper(HeadMotionManager headMotionManager, SpeechHelper speechHelper) {
        this.headMotionManager = headMotionManager;
        this.speechHelper      = speechHelper;
    }

    // ── Movimientos direccionales (relativos) ─────────────────────

    /**
     * Ejecuta un movimiento de cabeza.
     *
     * @param action  UP / DOWN / LEFT / RIGHT / CENTER_RESET
     * @param speed   1-10
     * @param angle   ignorado por el SDK (el constructor de RelativeAngleHeadMotion
     *                solo acepta action y speed); se mantiene en la firma para
     *                compatibilidad con el payload del backend.
     */
    public void doAction(String action, int speed, int angle) {
        if (headMotionManager == null) {
            Log.e(TAG, "HeadMotionManager == null");
            return;
        }

        byte speedByte = (byte) Math.max(1, Math.min(10, speed));

        // CENTER_RESET se ejecuta con movimientos absolutos al centro
        if ("CENTER_RESET".equals(action)) {
            headMotionManager.doAbsoluteAngleMotion(
                    new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_HORIZONTAL, 90));
            headMotionManager.doAbsoluteAngleMotion(
                    new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_VERTICAL, 20));
            Log.d(TAG, "Head reset al centro");
            return;
        }

        int sdkAction = mapAction(action);
        if (sdkAction < 0) {
            Log.w(TAG, "Acción desconocida: " + action);
            return;
        }

        RelativeAngleHeadMotion motion =
                new RelativeAngleHeadMotion((byte) sdkAction, speedByte);
        headMotionManager.doRelativeAngleMotion(motion);
        Log.d(TAG, "Head action=" + action + " speed=" + speed);
    }

    private int mapAction(String action) {
        switch (action) {
            case "UP":    return RelativeAngleHeadMotion.ACTION_UP;
            case "DOWN":  return RelativeAngleHeadMotion.ACTION_DOWN;
            case "LEFT":  return RelativeAngleHeadMotion.ACTION_LEFT;
            case "RIGHT": return RelativeAngleHeadMotion.ACTION_RIGHT;
            default:      return -1;
        }
    }

    // ── Gestos compuestos ─────────────────────────────────────────

    /** Asentir: dos cabezadas verticales hacia abajo y arriba. */
    public void asentir() {
        if (headMotionManager == null) return;
        // 1) Vuelve a posición vertical neutra
        headMotionManager.doAbsoluteAngleMotion(
                new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_VERTICAL, 20));

        // 2) Baja
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_DOWN, (byte) 20)), 300);
        // 3) Sube
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_UP, (byte) 20)), 900);
        // 4) Baja
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_DOWN, (byte) 20)), 1500);
        // 5) Sube
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_UP, (byte) 20)), 2100);
    }

    /** Negar: cabeza de izquierda a derecha varias veces. */
    public void negar() {
        if (headMotionManager == null) return;
        headMotionManager.doAbsoluteAngleMotion(
                new AbsoluteAngleHeadMotion(AbsoluteAngleHeadMotion.ACTION_HORIZONTAL, 90));

        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_LEFT, (byte) 20)), 300);
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_RIGHT, (byte) 20)), 900);
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_LEFT, (byte) 20)), 1600);
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_RIGHT, (byte) 20)), 2300);
    }

    /** Mirar a los lados (curiosidad). */
    public void mirarAlrededor() {
        if (headMotionManager == null) return;
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_LEFT, (byte) 10)), 0);
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_RIGHT, (byte) 10)), 1500);
        handler.postDelayed(() -> headMotionManager.doRelativeAngleMotion(
                new RelativeAngleHeadMotion(RelativeAngleHeadMotion.ACTION_LEFT, (byte) 10)), 3000);
    }
}
