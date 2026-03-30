/**
 * BottomBar
 *
 * Input area where the wizard types messages to send to the robot.
 * Submits on Enter (without Shift) or on button click.
 *
 * @param {object}   props
 * @param {string}   props.value       - Current input value (controlled)
 * @param {Function} props.onChange    - (newValue: string) => void
 * @param {Function} props.onSend      - () => void  — called when sending
 */
export default function BottomBar({ value, onChange, onSend }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <footer className="bottom-bar">
      <div className="input-row">
        {/* Spacers keep the input aligned with the center chat column */}
        <div className="input-spacer" />

        <div className="input-inner">
          <input
            className="text-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Campo de texto donde el mago puede escribir…"
            autoComplete="off"
            aria-label="Mensaje para el robot"
          />
          <button
            className="send-btn"
            onClick={onSend}
            disabled={!value.trim()}
            aria-label="Enviar mensaje"
          >
            Enviar
          </button>
        </div>

        <div className="input-spacer" />
      </div>
    </footer>
  );
}