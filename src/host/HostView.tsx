import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import { createInitialGameState, type GameState } from "../../shared/types.js";

interface Props {
  roomCode: string;
  onExit: () => void;
}

// M1 Platzhalter. M2 macht die echte Host-UI.
export function HostView({ roomCode, onExit }: Props) {
  const [state] = useState<GameState>(() => {
    // Initial-State vom Lobby-Formular übernehmen.
    // (In M2 holen wir die Lobby-Parameter sauber via Router/Store.)
    return createInitialGameState(roomCode, "host", "Game Master", "Temporär", 4, 5);
  });

  // Auf request-state vom Server antworten (neuer Spieler → State schicken).
  useEffect(() => {
    const sock = getSocket();
    const onReq = () => {
      sock.emit("host:state-sync", state);
    };
    sock.on("host:request-state", onReq);
    return () => {
      sock.off("host:request-state", onReq);
    };
  }, [state]);

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Host · Raum {roomCode}</h2>
        <p className="muted">
          M1 Skeleton — Lobby steht. M2 baut hier die Player-List und das
          Slide-System.
        </p>
        <button onClick={onExit}>← Zur Lobby</button>
      </div>
    </div>
  );
}
