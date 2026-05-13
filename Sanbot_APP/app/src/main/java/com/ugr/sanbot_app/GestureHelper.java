package com.ugr.sanbot_app;

import android.util.Log;

/**
 * Coordina gestos predefinidos combinando movimientos de brazos y cabeza.
 *
 * Los gestos disponibles corresponden a la enum GestureType del backend:
 *   - GREET            → saludar levantando la mano derecha
 *   - NOD              → asentir con la cabeza
 *   - SHAKE_HEAD       → negar con la cabeza
 *   - SHOW_ENTHUSIASM  → levantar ambos brazos con energía
 *   - SHRUG            → encogerse de hombros
 *   - LOOK_AROUND      → mirar a los lados (curiosidad)
 */
public class GestureHelper {

    private static final String TAG = "GestureHelper";

    private final HandHelper handHelper;
    private final HeadHelper headHelper;

    public GestureHelper(HandHelper handHelper, HeadHelper headHelper) {
        this.handHelper = handHelper;
        this.headHelper = headHelper;
    }

    public void performGesture(String gesture) {
        Log.d(TAG, "Ejecutando gesto: " + gesture);
        switch (gesture) {
            case "GREET":
                handHelper.saludarNatural();
                break;
            case "NOD":
                headHelper.asentir();
                break;
            case "SHAKE_HEAD":
                headHelper.negar();
                break;
            case "SHOW_ENTHUSIASM":
                handHelper.mostrarEntusiasmo();
                break;
            case "SHRUG":
                handHelper.encogerseHombros();
                break;
            case "LOOK_AROUND":
                headHelper.mirarAlrededor();
                break;
            default:
                Log.w(TAG, "Gesto desconocido: " + gesture);
        }
    }
}
