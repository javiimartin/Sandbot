package com.ugr.sanbot_app;

/**
 * Modos de operación de la aplicación.
 *
 * NORMAL  — El robot escucha activamente el micrófono y envía al backend
 *            lo que reconoce. No aparece ningún campo de texto en pantalla.
 *
 * DEV     — El micrófono está desactivado. Aparece un campo de texto en
 *            pantalla para introducir mensajes manualmente y simular la
 *            escucha. Útil durante el desarrollo sin robot físico.
 */
public enum AppMode {
    NORMAL,
    DEV
}