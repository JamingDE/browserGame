import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import type { GameState } from "../../shared/types.js";

interface Props {
  roomCode: string;
  onExit: () => void;
}

// Platzhalter bis M8 die echte Player-View bringt.
export function PlayerView({ roomCode, onExit }: Props) {
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    const sock = getSocket();
    const onState = (s: GameState) => setState(s);
    sock.on("room:state", onState);
    return () => {
      sock.off("room:state", onState);
    };
  }, []);

  return (
    <div className="waiting-wrap">
      <div className="card placeholder-card" style={{ width: "min(640px, 100%)" }}>
        <h2>🛡️ Spieler · Raum {roomCode}</h2>
        <p className="muted">
          {state
            ? `Verbunden mit „${state.roomName}". Hier entsteht in M8 die
               Slide-Anzeige und dein Charakterbogen.`
            : "Warte auf den ersten State vom Game Master…"}
        </p>
        <button className="ghost" onClick={onExit} style={{ marginTop: 18 }}>
          ← Zur Lobby
        </button>
      </div>
    </div>
  );
}
