/**
 * ContextPhrasesPanel
 *
 * Panel lateral izquierdo que muestra las frases del contexto conversacional
 * seleccionado al iniciar la sesión. Cada frase es clicable: al pulsarla, el
 * robot la dirá automáticamente con la emoción asociada y el mensaje se
 * registra en el chat como mensaje del mago (origen "context").
 *
 * Si la sesión no tiene contexto asociado, muestra un mensaje informativo.
 *
 * @param {{id, title, phrases: [{id,text,emotion}]} | null} context
 * @param {Function} onPhraseClick - (text, emotion) => void
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

export default function ContextPhrasesPanel({ context, onPhraseClick }) {
  if (!context) {
    return (
      <div className="ctx-phrases-panel">
        <div className="ctx-phrases-panel__title">Frases del contexto</div>
        <div className="ctx-phrases-panel__empty">
          No hay contexto seleccionado para esta sesión.
        </div>
      </div>
    )
  }

  const phrases = context.phrases || []

  return (
    <div className="ctx-phrases-panel">
      <div className="ctx-phrases-panel__title">
        Frases — {context.title}
      </div>

      {phrases.length === 0 && (
        <div className="ctx-phrases-panel__empty">
          Este contexto no tiene frases.
        </div>
      )}

      <ul className="ctx-phrases-panel__list">
        {phrases.map(p => (
          <li
            key={p.id}
            className="ctx-phrases-panel__item"
            onClick={() => onPhraseClick(p.text, p.emotion || 'NORMAL')}
            title="Pulsa para que el robot diga esta frase"
          >
            <span className="ctx-phrases-panel__text">{p.text}</span>
            {p.emotion && p.emotion !== 'NORMAL' && (
              <span className="ctx-phrases-panel__emotion">
                {EMOTION_LABEL[p.emotion] ?? p.emotion}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
