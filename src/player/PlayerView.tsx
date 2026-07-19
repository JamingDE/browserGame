import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import type { GameState } from "../../shared/types.js";

interface Props {
  roomCode: string;
  onExit: () => void;
}

// M1 Platzhalter — in M2/M8 ausgebaut zur echten Player-View.
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
    <div style={{ padding: 24 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Spieler · Raum {roomCode}</h2>
        <p className="muted">
          {state
            ? `Verbunden mit „${state.roomName}".`
            : "Warte auf Host-State…"}
        </p>
        <button onClick={onExit}>← Zur Lobby</button>
      </div>
    </div>
  );
}
