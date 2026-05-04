/**
 * RobotCameraView
 *
 * Muestra el último fotograma capturado por la cámara del robot (sub-stream 640x480,
 * actualizado cada ~5 segundos). Mientras no hay imagen muestra un placeholder.
 *
 * @param {string|null} imageB64 - Imagen JPEG codificada en base64, o null.
 */
export default function RobotCameraView({ imageB64 }) {
  return (
    <div className="camera-panel">
      <div className="camera-panel__title">Vista del robot</div>
      {imageB64
        ? (
          <img
            className="camera-panel__image"
            src={`data:image/jpeg;base64,${imageB64}`}
            alt="Vista en tiempo real de la cámara del robot"
          />
        )
        : (
          <div className="camera-panel__placeholder">
            Cámara del robot<br />esperando imagen…
          </div>
        )
      }
    </div>
  )
}
