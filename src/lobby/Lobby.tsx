import { useState } from "react";
import { getSocket } from "../net/socket.js";

interface Props {
  onHost: (roomCode: string) => void;
  onPlayer: (roomCode: string) => void;
}

type Tab = "host" | "join";

export function Lobby({ onHost, onPlayer }: Props) {
  const [tab, setTab] = useState<Tab>("host");
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [startHearts, setStartHearts] = useState(5);
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function createHost() {
    setError(null);
    if (!roomName.trim()) return setError("Bitte einen Raum-Namen eingeben.");
    if (!hostName.trim()) return setError("Bitte deinen Namen eingeben.");
    setBusy(true);
    const sock = getSocket();
    sock.emit(
      "host:create",
      {
        roomName: roomName.trim(),
        hostName: hostName.trim(),
        maxPlayers,
        startHearts,
      },
      (res) => {
        setBusy(false);
        if (!res.ok) return setError("Raum konnte nicht erstellt werden.");
        onHost(res.roomCode);
      }
    );
  }

  function join() {
    setError(null);
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) return setError("Code muss 4 Zeichen sein.");
    if (!playerName.trim()) return setError("Bitte deinen Namen eingeben.");
    setBusy(true);
    const sock = getSocket();
    sock.emit(
      "player:join",
      { roomCode: code, playerName: playerName.trim() },
      (res) => {
        setBusy(false);
        if (!res.ok) return setError(res.error);
        onPlayer(code);
      }
    );
  }

  return (
    <div className="lobby-wrap">
      <div className="card lobby-card">
        <div className="lobby-header">
          <div className="crest">⚔️</div>
          <h1>VTT</h1>
          <p className="subtitle">Virtual Tabletop</p>
        </div>

        <div className="lobby-tabs">
          <button
            className={tab === "host" ? "active" : ""}
            onClick={() => {
              setTab("host");
              setError(null);
            }}
          >
            👑 Raum erstellen
          </button>
          <button
            className={tab === "join" ? "active" : ""}
            onClick={() => {
              setTab("join");
              setError(null);
            }}
          >
            🚪 Beitreten
          </button>
        </div>

        {tab === "host" ? (
          <>
            <div className="field">
              <label>Raum-Name</label>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Taverne zum Drachen"
                onKeyDown={(e) => e.key === "Enter" && createHost()}
              />
              <div className="hint">
                Gespeicherte Assets erscheinen nur in Räumen gleichen Namens.
              </div>
            </div>
            <div className="field">
              <label>Dein Name (Game Master)</label>
              <input
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="z.B. Aragorn"
                onKeyDown={(e) => e.key === "Enter" && createHost()}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Max. Spieler</label>
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={maxPlayers}
                  onChange={(e) =>
                    setMaxPlayers(clamp(Number(e.target.value), 2, 8))
                  }
                />
              </div>
              <div className="field">
                <label>Start-HP (Herzen)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={startHearts}
                  onChange={(e) =>
                    setStartHearts(clamp(Number(e.target.value), 1, 20))
                  }
                />
              </div>
            </div>
            <button
              className="primary"
              style={{ width: "100%" }}
              onClick={createHost}
              disabled={busy}
            >
              {busy ? "Beschwöre Raum…" : "✨ Raum erschaffen"}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Raum-Code</label>
              <input
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 4))
                }
                placeholder="ABCD"
                style={{
                  fontFamily: "Cinzel, serif",
                  letterSpacing: 8,
                  fontSize: 26,
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
            </div>
            <div className="field">
              <label>Dein Name</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Held:in"
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
            </div>
            <button
              className="primary"
              style={{ width: "100%" }}
              onClick={join}
              disabled={busy}
            >
              {busy ? "Trete ein…" : "🚪 Beitreten"}
            </button>
          </>
        )}

        {error && <div className="error">⚠️ {error}</div>}
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
