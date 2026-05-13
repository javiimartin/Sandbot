package com.ugr.sanbot_app;

import android.os.Handler;
import android.util.Log;

import com.qihancloud.opensdk.function.beans.handmotion.AbsoluteAngleHandMotion;
import com.qihancloud.opensdk.function.beans.handmotion.NoAngleHandMotion;
import com.qihancloud.opensdk.function.unit.HandMotionManager;

/**
 * Control de los brazos del robot.
 *
 * Rango de ángulos (AbsoluteAngleHandMotion):
 *   - 0º   → brazo levantado (horizontal hacia delante)
 *   - 180º → brazo en reposo (pegado al cuerpo)
 * Velocidad: 1-8.
 *
 * Gestos compuestos coordinan ambos brazos con timers para que
 * los movimientos parezcan naturales.
 */
public class HandHelper {

    private static final String TAG = "HandHelper";

    private final HandMotionManager handMotionManager;
    private final SpeechHelper       speechHelper;
    private final Handler            handler = new Handler();

    public HandHelper(HandMotionManager handMotionManager, SpeechHelper speechHelper) {
        this.handMotionManager = handMotionManager;
        this.speechHelper      = speechHelper;
    }

    // ── Saludar ───────────────────────────────────────────────────

    /** Levanta el brazo derecho a la altura del saludo y lo baja al cabo de 5s. */
    public void saludarNatural() {
        if (handMotionManager == null) {
            Log.e(TAG, "HandMotionManager == null");
            return;
        }

        AbsoluteAngleHandMotion levantar = new AbsoluteAngleHandMotion(
                AbsoluteAngleHandMotion.PART_RIGHT, 5, 60);
        handMotionManager.doAbsoluteAngleMotion(levantar);
        Log.d(TAG, "Saludando…");

        handler.postDelayed(() -> {
            AbsoluteAngleHandMotion bajar = new AbsoluteAngleHandMotion(
                    AbsoluteAngleHandMotion.PART_RIGHT, 5, 180);
            handMotionManager.doAbsoluteAngleMotion(bajar);
        }, 5000);
    }

    // ── Mostrar entusiasmo ────────────────────────────────────────

    /** Levanta ambos brazos en alto rápidamente y los baja. */
    public void mostrarEntusiasmo() {
        if (handMotionManager == null) return;

        AbsoluteAngleHandMotion arriba = new AbsoluteAngleHandMotion(
                AbsoluteAngleHandMotion.PART_BOTH, 7, 10);
        handMotionManager.doAbsoluteAngleMotion(arriba);
        Log.d(TAG, "Entusiasmo: brazos arriba");

        // Pequeño "rebote"
        handler.postDelayed(() -> {
            AbsoluteAngleHandMotion medio = new AbsoluteAngleHandMotion(
                    AbsoluteAngleHandMotion.PART_BOTH, 7, 45);
            handMotionManager.doAbsoluteAngleMotion(medio);
        }, 700);

        handler.postDelayed(() -> {
            AbsoluteAngleHandMotion arriba2 = new AbsoluteAngleHandMotion(
                    AbsoluteAngleHandMotion.PART_BOTH, 7, 10);
            handMotionManager.doAbsoluteAngleMotion(arriba2);
        }, 1300);

        // Bajar
        handler.postDelayed(() -> {
            AbsoluteAngleHandMotion reposo = new AbsoluteAngleHandMotion(
                    AbsoluteAngleHandMotion.PART_BOTH, 5, 180);
            handMotionManager.doAbsoluteAngleMotion(reposo);
        }, 3000);
    }

    // ── Encogerse de hombros ──────────────────────────────────────

    /** Sube ambos brazos a media altura y los baja, simulando un encogerse de hombros. */
    public void encogerseHombros() {
        if (handMotionManager == null) return;

        AbsoluteAngleHandMotion subir = new AbsoluteAngleHandMotion(
                AbsoluteAngleHandMotion.PART_BOTH, 4, 130);
        handMotionManager.doAbsoluteAngleMotion(subir);

        handler.postDelayed(() -> {
            AbsoluteAngleHandMotion bajar = new AbsoluteAngleHandMotion(
                    AbsoluteAngleHandMotion.PART_BOTH, 4, 180);
            handMotionManager.doAbsoluteAngleMotion(bajar);
        }, 1500);
    }

    /** Devuelve ambos brazos a la posición de reposo. */
    public void resetBrazos() {
        if (handMotionManager == null) return;
        NoAngleHandMotion reset = new NoAngleHandMotion(
                NoAngleHandMotion.PART_BOTH, (byte) 5, NoAngleHandMotion.ACTION_RESET);
        handMotionManager.doNoAngleMotion(reset);
    }
}
