import { useState } from "react";
import { useHostStore } from "../state/store.js";
import type { Asset } from "../../shared/types.js";

interface Props {
  onClose: () => void;
}

function Hearts({ value, max }: { value: number; max: number }) {
  if (max > 20) {
    return (
      <div className="hearts-line">
        <span className="hearts-icon">❤️</span>
        <span className="hearts-text">
          {value} / {max}
        </span>
      </div>
    );
  }
  return (
    <div className="hearts-line">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < Math.floor(value);
        const half = !filled && i < value;
        return (
          <span
            key={i}
            className={`hearts-icon ${filled ? "full" : half ? "half" : "empty"}`}
          >
            {filled ? "❤️" : half ? "💔" : "🖤"}
          </span>
        );
      })}
    </div>
  );
}

export function CharacterPanel({ onClose }: Props) {
  const players = useHostStore((s) => s.state.players);
  const library = useHostStore((s) => s.state.assets.library);
  const updatePlayer = useHostStore((s) => s.updatePlayer);
  const addInventoryItem = useHostStore((s) => s.addInventoryItem);
  const removeInventoryItem = useHostStore((s) => s.removeInventoryItem);
  const addAbility = useHostStore((s) => s.addAbility);
  const removeAbility = useHostStore((s) => s.removeAbility);

  const [activeId, setActiveId] = useState<string | null>(players[0]?.id ?? null);
  const [newItemText, setNewItemText] = useState("");
  const [newAbility, setAbility] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const active = players.find((p) => p.id === activeId) ?? players[0];

  if (!active) {
    return (
      <div className="modal-overlay" onPointerDown={onClose}>
        <div
          className="modal-card char-panel"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h2>📜 Helden</h2>
            <button className="ghost" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="char-empty">Keine Helden in dieser Runde.</div>
        </div>
      </div>
    );
  }

  // Asset-Picker: Alle Bild-Assets aus der Library
  const libraryAssets = Object.values(library).filter(
    (a) => !a.tags?.includes("paint") || a.transparent
  );

  function addTextItem() {
    if (!newItemText.trim()) return;
    addInventoryItem(active!.id, { kind: "text", label: newItemText.trim() });
    setNewItemText("");
  }

  function addImageItem(asset: Asset, label: string) {
    addInventoryItem(active!.id, {
      kind: "image",
      label: label || asset.name,
      assetId: asset.id,
    });
    setPickerFor(null);
  }

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <div
        className="modal-card char-panel"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>📜 Helden</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="char-body">
          <div className="char-list">
            {players.map((p) => (
              <button
                key={p.id}
                className={`char-tab ${p.id === active.id ? "active" : ""}`}
                onClick={() => setActiveId(p.id)}
              >
                <span className="char-tab-name">{p.name}</span>
                <span className="char-tab-hp">
                  {p.hearts}/{p.maxHearts} ❤️
                </span>
              </button>
            ))}
          </div>

          <div className="char-detail">
            <div className="char-detail-head">
              <h3>{active.name}</h3>
              <Hearts value={active.hearts} max={active.maxHearts} />
            </div>

            {/* HP-Editor */}
            <div className="char-section">
              <label className="char-label">
                Lebenspunkte
                <span className="muted">
                  {" "}
                  — aktiv {active.hearts} / max {active.maxHearts}
                </span>
              </label>
              <div className="hp-editor">
                <div className="hp-field">
                  <span className="hp-field-label">Aktuelle HP</span>
                  <div className="hp-stepper">
                    <button
                      className="ab-mini"
                      onClick={() =>
                        updatePlayer(active.id, {
                          hearts: Math.max(0, active.hearts - 1),
                        })
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={active.hearts}
                      onChange={(e) =>
                        updatePlayer(active.id, {
                          hearts: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                    <button
                      className="ab-mini"
                      onClick={() =>
                        updatePlayer(active.id, { hearts: active.hearts + 1 })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="hp-field">
                  <span className="hp-field-label">Max. HP</span>
                  <div className="hp-stepper">
                    <button
                      className="ab-mini"
                      onClick={() =>
                        updatePlayer(active.id, {
                          maxHearts: Math.max(1, active.maxHearts - 1),
                        })
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={active.maxHearts}
                      onChange={(e) =>
                        updatePlayer(active.id, {
                          maxHearts: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <button
                      className="ab-mini"
                      onClick={() =>
                        updatePlayer(active.id, { maxHearts: active.maxHearts + 1 })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <button
                className="ghost hp-fullheal"
                onClick={() => updatePlayer(active.id, { hearts: active.maxHearts })}
              >
                ✨ Auf voll heilen
              </button>
            </div>

            {/* Inventar */}
            <div className="char-section">
              <label className="char-label">🎒 Inventar</label>
              <div className="inv-grid">
                {active.inventory.length === 0 && (
                  <div className="char-list-empty muted">
                    Noch keine Gegenstände.
                  </div>
                )}
                {active.inventory.map((item) => (
                  <div key={item.id} className="inv-slot">
                    {item.kind === "image" && item.assetId ? (
                      <img
                        src={library[item.assetId]?.src}
                        alt={item.label}
                        title={item.label}
                      />
                    ) : (
                      <span className="inv-text">{item.label}</span>
                    )}
                    <button
                      className="ab-mini danger inv-remove"
                      onClick={() => removeInventoryItem(active.id, item.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="char-add-row">
                <input
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="Text-Item…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTextItem();
                  }}
                />
                <button
                  className="primary"
                  onClick={addTextItem}
                  disabled={!newItemText.trim()}
                >
                  + Text
                </button>
                <button
                  onClick={() => setPickerFor(active.id)}
                  title="Bild-Item aus Assets hinzufügen"
                >
                  🖼️ Bild
                </button>
              </div>
            </div>

            {/* Fähigkeiten */}
            <div className="char-section">
              <label className="char-label">✨ Fähigkeiten</label>
              <div className="char-list-items">
                {active.abilities.length === 0 && (
                  <div className="char-list-empty muted">
                    Noch keine Fähigkeiten.
                  </div>
                )}
                {active.abilities.map((ab, i) => (
                  <div key={i} className="char-list-item">
                    <span>{ab}</span>
                    <button
                      className="ab-mini danger"
                      onClick={() => removeAbility(active.id, i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="char-add-row">
                <input
                  value={newAbility}
                  onChange={(e) => setAbility(e.target.value)}
                  placeholder="z.B. Feuerball, Heilen…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newAbility.trim()) {
                      addAbility(active.id, newAbility);
                      setAbility("");
                    }
                  }}
                />
                <button
                  className="primary"
                  onClick={() => {
                    if (newAbility.trim()) {
                      addAbility(active.id, newAbility);
                      setAbility("");
                    }
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Asset-Picker für Bild-Items */}
      {pickerFor === active.id && (
        <div
          className="picker-overlay"
          onPointerDown={() => setPickerFor(null)}
        >
          <div
            className="picker-modal"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>🖼️ Item aus Assets wählen</h2>
              <button className="ghost" onClick={() => setPickerFor(null)}>
                ✕
              </button>
            </div>
            <div className="picker-body">
              {libraryAssets.length === 0 && (
                <div className="muted">
                  Noch keine Assets. Lade zuerst welche hoch oder suche.
                </div>
              )}
              <div className="picker-grid">
                {libraryAssets.map((a) => (
                  <button
                    key={a.id}
                    className="picker-tile"
                    onClick={() => {
                      const label = prompt("Item-Name:", a.name);
                      if (label !== null) addImageItem(a, label);
                    }}
                    title={a.name}
                  >
                    <img src={a.src} alt={a.name} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
