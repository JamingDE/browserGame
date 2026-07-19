import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import {
  createInitialGameState,
  type GameState,
} from "../../shared/types.js";

interface Props {
  roomCode: string;
  onExit: () => void;
}

// Platzhalter bis M3 das Slide-System bringt.
export function HostView({ roomCode, onExit }: Props) {
  const [state] = useState<GameState>(() =>
    createInitialGameState(
      roomCode,
      "host",
      "Game Master",
      "Temporär",
      4,
      5
    )
  );

  // Auf request-state vom Server antworten (neuer Spieler → State schicken).
  useEffect(() => {
    const sock = getSocket();
    const onReq = () => sock.emit("host:state-sync", state);
    sock.on("host:request-state", onReq);
    return () => {
      sock.off("host:request-state", onReq);
    };
  }, [state]);

  return (
    <div className="waiting-wrap">
      <div className="card placeholder-card" style={{ width: "min(640px, 100%)" }}>
        <h2>👑 Game Master · Raum {roomCode}</h2>
        <p className="muted">
          M2 steht — Lobby &amp; Wartezimmer sind fertig. Hier entsteht in M3
          das Slide-System mit Asset-Browser und Drag&amp;Drop.
        </p>
        <div className="lobby-meta" style={{ marginTop: 18 }}>
          <div className="meta-item">
            <span className="label">Phase</span>
            <span className="value">M2 ✓</span>
          </div>
          <div className="meta-item">
            <span className="label">Nächster Meilenstein</span>
            <span className="value">M3 · Slides</span>
          </div>
        </div>
        <button className="ghost" onClick={onExit} style={{ marginTop: 18 }}>
          ← Zur Lobby
        </button>
      </div>
    </div>
  );
}
