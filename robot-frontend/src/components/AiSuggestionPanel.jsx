/**
 * AiSuggestionPanel
 *
 * Panel derecho de MainInterface. Muestra la sugerencia de respuesta
 * generada automáticamente por el LLM cada vez que el participante
 * termina de hablar.
 *
 * @param {{ text: string, emotion: string } | null} suggestion
 * @param {Function} onAccept  - (text, emotion) => void
 * @param {Function} onDiscard - () => void
 * @param {boolean}  generating - true mientras el backend espera al LLM
 */

const EMOTION_LABEL = {
  NORMAL:   'Normal',
  SMILE:    'Sonrisa',
  LAUGHTER: 'Risa',
  SURPRISE: 'Sorpresa',
  QUESTION: 'Pregunta',
  SHY:      'Tímido',
  ANGRY:    'Enfadado',
  CRY:      'Llanto',
}

export default function AiSuggestionPanel({ suggestion, onAccept, onDiscard, generating }) {
  return (
    <div className="ai-panel">
      <div className="ai-panel__header">
        <span className="ai-panel__title">Sugerencia IA</span>
        {generating && <span className="ai-panel__badge ai-panel__badge--thinking">Generando…</span>}
        {!generating && suggestion && <span className="ai-panel__badge ai-panel__badge--ready">Lista</span>}
      </div>

      {!suggestion && !generating && (
        <div className="ai-panel__placeholder">
          La sugerencia aparecerá aquí cuando el participante hable.
        </div>
      )}

      {generating && !suggestion && (
        <div className="ai-panel__placeholder ai-panel__placeholder--thinking">
          El modelo está elaborando una respuesta…
        </div>
      )}

      {suggestion && (
        <>
          <div className="ai-panel__text">{suggestion.text}</div>

          <div className="ai-panel__emotion">
            <span className="ai-emotion-label">Emoción sugerida</span>
            <span className="ai-emotion-value">
              {EMOTION_LABEL[suggestion.emotion] ?? suggestion.emotion}
            </span>
          </div>

          <div className="ai-panel__actions">
            <button
              type="button"
              className="ai-accept-btn"
              onClick={() => onAccept(suggestion.text, suggestion.emotion)}
            >
              Usar sugerencia
            </button>
            <button
              type="button"
              className="ai-discard-btn"
              onClick={onDiscard}
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
