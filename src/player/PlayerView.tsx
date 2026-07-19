import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import type { Asset, GameState, InventoryItem, Player } from "../../shared/types.js";
import { SketchPad } from "../components/SketchPad.js";

interface Props {
  roomCode: string;
  onExit: () => void;
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

export function PlayerView({ roomCode, onExit }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sentInfo, setSentInfo] = useState<string | null>(null);

  useEffect(() => {
    const sock = getSocket();
    const onState = (s: GameState) => setState(s);
    sock.on("room:state", onState);
    const onConnect = () => {
      sock.emit(
        "player:join",
        { roomCode, playerName: "Reconnect" },
        () => {}
      );
    };
    sock.on("connect", onConnect);
    return () => {
      sock.off("room:state", onState);
      sock.off("connect", onConnect);
    };
  }, [roomCode]);

  const myId = getSocket().id;
  const me: Player | undefined = state?.players.find((p) => p.id === myId);
  const activeSlide = state?.slides[state?.activeSlideIndex ?? 0];

  function sendSketchToGm(dataUrl: string) {
    const sock = getSocket();
    const name = prompt(
      "Wie heißt das Item?",
      `Malerei von ${me?.name ?? "Spieler"}`
    );
    if (name === null) {
      setSketchOpen(false);
      return;
    }
    const asset: Asset = {
      id: `psk-${Date.now().toString(36)}`,
      name: name.trim() || "Spieler-Item",
      src: dataUrl,
      tags: ["player-suggest"],
      transparent: true,
    };
    sock.emit("player:suggest", { asset, label: asset.name });
    setSentInfo(`„${asset.name}" an den GM gesendet ✨`);
    setTimeout(() => setSentInfo(null), 4000);
    setSketchOpen(false);
  }

  // Elemente nach Layer sortieren
  const sortedElements = activeSlide
    ? [...activeSlide.elements].sort((a, b) => {
        const order = (l?: string) =>
          l === "back" ? 0 : l === "front" ? 2 : 1;
        return order(a.layer) - order(b.layer);
      })
    : [];

  return (
    <div className="player-layout">
      <header className="host-top">
        <div className="host-top-left">
          <button className="ghost" onClick={onExit} title="Zur Lobby">
            ←
          </button>
          <span className="brand">🛡️ {roomCode}</span>
          {state && <span className="muted host-room">{state.roomName}</span>}
        </div>
        <div className="host-top-right">
          <button
            className="ghost tool-btn"
            onClick={() => setSketchOpen(true)}
            title="Item malen und dem GM vorschlagen"
          >
            🖌️ <span className="tool-label">Item malen</span>
          </button>
          {me && (
            <button
              className="ghost tool-btn"
              onClick={() => setSheetOpen((v) => !v)}
            >
              📜 <span className="tool-label">Mein Bogen</span>
            </button>
          )}
        </div>
      </header>

      <div className="player-main">
        {state ? (
          <div className="stage-wrap">
            <div
              className="stage"
              style={{ background: activeSlide?.background ?? "#0d0817" }}
            >
              {sortedElements.map((el) => {
                const asset = el.assetId
                  ? state.assets.library[el.assetId]
                  : undefined;
                if ((el.type === "image" || el.type === "paint") && asset) {
                  return (
                    <div
                      key={el.id}
                      style={{
                        position: "absolute",
                        left: `${el.x * 100}%`,
                        top: `${el.y * 100}%`,
                        width: `${el.w * 100}%`,
                        height: `${el.h * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                      }}
                    >
                      <img
                        src={asset.src}
                        alt={asset.name}
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit:
                            el.type === "paint" ? "fill" : "contain",
                        }}
                      />
                    </div>
                  );
                }
                if (el.type === "text") {
                  return (
                    <div
                      key={el.id}
                      style={{
                        position: "absolute",
                        left: `${el.x * 100}%`,
                        top: `${el.y * 100}%`,
                        width: `${el.w * 100}%`,
                        height: `${el.h * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                        display: "grid",
                        placeItems: "center",
                        fontFamily: "Cinzel, serif",
                        fontWeight: 700,
                        color: el.color ?? "var(--text)",
                        textAlign: "center",
                        fontSize: `${(el.fontSize ?? 0.06) * 100}cqh`,
                        lineHeight: 1.1,
                      }}
                    >
                      {el.text}
                    </div>
                  );
                }
                return null;
              })}
              {!activeSlide?.elements.length && (
                <div className="stage-empty-content">
                  <div className="stage-empty-icon">🌙</div>
                  <div>Der Game Master bereitet etwas vor…</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="stage-wrap">
            <div className="stage stage-loading">
              <div className="stage-empty-content">
                <div className="stage-empty-icon">🔮</div>
                <div>Verbinde mit dem Game Master…</div>
                <div className="hint">
                  Falls nichts passiert, ist der Host evtl. offline.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {sentInfo && (
        <div className="toast info" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)" }}>
          <span className="icon">✨</span>
          <div>
            <div className="label">Vorschlag gesendet</div>
            <div>{sentInfo}</div>
          </div>
        </div>
      )}

      {/* Charakterbogen */}
      {sheetOpen && me && (
        <div className="modal-overlay" onPointerDown={() => setSheetOpen(false)}>
          <div
            className="modal-card char-panel"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>📜 {me.name}</h2>
              <button className="ghost" onClick={() => setSheetOpen(false)}>
                ✕
              </button>
            </div>
            <div className="char-detail" style={{ display: "block" }}>
              <div className="char-detail-head">
                <Hearts value={me.hearts} max={me.maxHearts} />
              </div>
              <div className="char-section">
                <label className="char-label">🎒 Inventar</label>
                <div className="inv-grid">
                  {me.inventory.length === 0 ? (
                    <div className="char-list-empty muted">
                      Dein Beutel ist leer.
                    </div>
                  ) : (
                    me.inventory.map((item: InventoryItem) => (
                      <div key={item.id} className="inv-slot read-only">
                        {item.kind === "image" && item.assetId ? (
                          <img
                            src={state?.assets.library[item.assetId]?.src}
                            alt={item.label}
                            title={item.label}
                          />
                        ) : (
                          <span className="inv-text">{item.label}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="char-section">
                <label className="char-label">✨ Fähigkeiten</label>
                <div className="char-list-items">
                  {me.abilities.length === 0 ? (
                    <div className="char-list-empty muted">
                      Noch keine Fähigkeiten erlernt.
                    </div>
                  ) : (
                    me.abilities.map((ab, i) => (
                      <div key={i} className="char-list-item read-only">
                        <span>{ab}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sketch-Pad */}
      {sketchOpen && (
        <div className="modal-overlay" onPointerDown={() => setSketchOpen(false)}>
          <div
            className="modal-card sketchpad-modal"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>🖌️ Item malen &amp; vorschlagen</h2>
              <button className="ghost" onClick={() => setSketchOpen(false)}>
                ✕
              </button>
            </div>
            <SketchPad
              onDone={sendSketchToGm}
              onCancel={() => setSketchOpen(false)}
              doneLabel="✨ An GM senden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
