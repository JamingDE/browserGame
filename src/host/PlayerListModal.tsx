import { useState } from "react";
import { getSocket } from "../net/socket.js";
import { useHostStore } from "../state/store.js";

interface Props {
  onClose: () => void;
}

export function PlayerListModal({ onClose }: Props) {
  const statePlayers = useHostStore((s) => s.state.players);
  const [copied, setCopied] = useState(false);

  // Live verbundene Spieler holen wir via roster (lobby:roster). Der Server
  // kennt die echten Socket-Verbindungen. host:request-state etc. sorgen für
  // updates. Hier kombinieren wir state.players mit roster für die Anzeige.
  const hostId = getSocket().id;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(hostId ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function kickPlayer(playerId: string) {
    if (playerId === hostId) return;
    if (!confirm("Diesen Spieler rauswerfen? Er kann wieder joinen.")) return;
    getSocket().emit("host:kick", playerId);
  }

  function banPlayer(playerId: string) {
    if (playerId === hostId) return;
    if (
      !confirm(
        "Diesen Spieler BANNEN? Er kann mit seinem Namen nicht mehr joinen."
      )
    )
      return;
    getSocket().emit("host:ban", playerId);
  }

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <div
        className="modal-card playerlist-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>👥 Spielerverwaltung</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="playerlist-body">
          <div className="playerlist-hint muted">
            Spieler erhalten durch Klicken auf „👥 Spieler" in ihrem Header
            dieselbe Übersicht (nur Leseansicht, ohne Kick/Ban).
          </div>

          <div className="playerlist-grid">
            {statePlayers.map((p) => {
              const isHost = p.id === hostId;
              return (
                <div
                  key={p.id}
                  className={`playerlist-chip ${isHost ? "is-host" : ""}`}
                >
                  <div className="playerlist-avatar">
                    {isHost ? "👑" : "🛡️"}
                  </div>
                  <div className="playerlist-info">
                    <div className="playerlist-name">{p.name}</div>
                    <div className="playerlist-hp">
                      {p.hearts}/{p.maxHearts} ❤️
                    </div>
                  </div>
                  {!isHost && (
                    <div className="playerlist-actions">
                      <button
                        className="ghost ab-mini"
                        title="Rauswerfen (kann wieder joinen)"
                        onClick={() => kickPlayer(p.id)}
                      >
                        🚪 Kick
                      </button>
                      <button
                        className="danger ab-mini"
                        title="Bannen (kann nicht mehr joinen)"
                        onClick={() => banPlayer(p.id)}
                      >
                        ⛔ Bann
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="playerlist-debug">
            <button className="ghost" onClick={copyId}>
              {copied ? "✓ Host-ID kopiert" : "Host-ID kopieren (Debug)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
