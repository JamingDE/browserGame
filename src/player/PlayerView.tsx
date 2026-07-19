import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import type { GameState, Player } from "../../shared/types.js";

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

  useEffect(() => {
    const sock = getSocket();
    const onState = (s: GameState) => setState(s);
    sock.on("room:state", onState);
    // Nach Reconnect kann der State fehlen → Host darum bitten.
    // Wir bleiben im gleichen Socket-Provider-Raum; das Join-Event mit Ack
    // triggert den Server, den Host um State zu bitten.
    const onConnect = () => {
      sock.emit(
        "player:join",
        {
          roomCode,
          playerName: "Reconnect",
        },
        () => {
          /* Ack ignorieren — wir sind bereits im Raum */
        }
      );
    };
    sock.on("connect", onConnect);
    return () => {
      sock.off("room:state", onState);
      sock.off("connect", onConnect);
    };
  }, [roomCode]);

  // Eigenen Spieler finden (via Socket-ID)
  const myId = getSocket().id;
  const me: Player | undefined = state?.players.find((p) => p.id === myId);

  const activeSlide = state?.slides[state?.activeSlideIndex ?? 0];

  return (
    <div className="player-layout">
      <header className="host-top">
        <div className="host-top-left">
          <button className="ghost" onClick={onExit} title="Zur Lobby">
            ←
          </button>
          <span className="brand">🛡️ {roomCode}</span>
          {state && (
            <span className="muted host-room">{state.roomName}</span>
          )}
        </div>
        <div className="host-top-right">
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
              {activeSlide?.elements.map((el) => {
                const asset = el.assetId
                  ? state.assets.library[el.assetId]
                  : undefined;
                if (el.type === "image" && asset) {
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
                          objectFit: "contain",
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
                        color: "var(--text)",
                        textAlign: "center",
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

      {sheetOpen && me && (
        <div
          className="modal-overlay"
          onPointerDown={() => setSheetOpen(false)}
        >
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
                <div className="char-list-items">
                  {me.inventory.length === 0 ? (
                    <div className="char-list-empty muted">
                      Dein Beutel ist leer.
                    </div>
                  ) : (
                    me.inventory.map((item, i) => (
                      <div key={i} className="char-list-item read-only">
                        <span>{item}</span>
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
    </div>
  );
}
