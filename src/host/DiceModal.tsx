import { useState } from "react";
import { useHostStore } from "../state/store.js";

interface Props {
  onClose: () => void;
}

const DICE_PRESETS = [4, 6, 8, 10, 12, 20, 100];

export function DiceModal({ onClose }: Props) {
  const sides = useHostStore((s) => s.state.die.sides);
  const history = useHostStore((s) => s.state.die.history);
  const lastResult = useHostStore((s) => s.state.die.lastResult);
  const setDiceSides = useHostStore((s) => s.setDiceSides);
  const rollDice = useHostStore((s) => s.rollDice);
  const clearDiceHistory = useHostStore((s) => s.clearDiceHistory);

  const [rolling, setRolling] = useState(false);
  const [rollFor, setRollFor] = useState("");

  function doRoll() {
    if (rolling) return;
    setRolling(true);
    // Schnelle Animation: Würfel-Zahl flackert
    const start = performance.now();
    const duration = 600;
    const flicker = (now: number) => {
      if (now - start < duration) {
        // Visuell faken: store nicht antasten, nur lokales flackern über
        // rollDice würde sofort das Endergebnis setzen — wir nutzen CSS.
        requestAnimationFrame(flicker);
      } else {
        rollDice(rollFor.trim() || undefined);
        setRolling(false);
      }
    };
    requestAnimationFrame(flicker);
  }

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <div
        className="modal-card dice-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>🎲 Würfel</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dice-body">
          <div className="dice-stage">
            <div className={`dice-display ${rolling ? "rolling" : ""}`}>
              {rolling ? "?" : lastResult ?? "—"}
            </div>
            <div className="dice-sides-label">W{rolling ? sides : sides}</div>
            <button
              className="primary dice-roll"
              onClick={doRoll}
              disabled={rolling}
            >
              {rolling ? "Würfelt…" : `🎲 W${sides} würfeln`}
            </button>
            <input
              value={rollFor}
              onChange={(e) => setRollFor(e.target.value)}
              placeholder="Würfeln für… (optional)"
              className="dice-for"
            />
          </div>

          <div className="dice-controls">
            <div className="dice-section">
              <h4>Würfel-Typ</h4>
              <div className="dice-presets">
                {DICE_PRESETS.map((n) => (
                  <button
                    key={n}
                    className={sides === n ? "active" : ""}
                    onClick={() => setDiceSides(n)}
                  >
                    W{n}
                  </button>
                ))}
              </div>
              <div className="dice-custom">
                <label>Benutzerdefiniert:</label>
                <input
                  type="number"
                  min={2}
                  value={sides}
                  onChange={(e) =>
                    setDiceSides(Math.max(2, Number(e.target.value) || 2))
                  }
                />
              </div>
            </div>

            <div className="dice-section">
              <div className="dice-history-head">
                <h4>Verlauf ({history.length})</h4>
                {history.length > 0 && (
                  <button className="ghost" onClick={clearDiceHistory}>
                    Leeren
                  </button>
                )}
              </div>
              <div className="dice-history">
                {history.length === 0 && (
                  <div className="muted">Noch keine Würfe.</div>
                )}
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`dice-history-item ${
                      h.value === sides ? "crit" : ""
                    }`}
                  >
                    {h.player && <span className="dh-player">{h.player}:</span>}
                    <span className="dh-value">W{sides} → {h.value}</span>
                    <span className="dh-time">
                      {new Date(h.at).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
