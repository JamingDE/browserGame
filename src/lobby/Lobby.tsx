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
    if (!roomName.trim()) return setError("Bitte Raum-Name eingeben.");
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
        if (!res.ok) {
          setError("Raum konnte nicht erstellt werden.");
          return;
        }
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
        if (!res.ok) {
          setError(res.error ?? "Beitritt fehlgeschlagen.");
          return;
        }
        onPlayer(code);
      }
    );
  }

  return (
    <div className="lobby-wrap">
      <div className="card lobby-card">
        <h1>VTT</h1>
        <p className="muted" style={{ margin: "0 0 4px" }}>
          Virtual Tabletop · Game Master Tool
        </p>

        <div className="lobby-tabs">
          <button
            className={tab === "host" ? "active" : ""}
            onClick={() => setTab("host")}
          >
            Raum erstellen
          </button>
          <button
            className={tab === "join" ? "active" : ""}
            onClick={() => setTab("join")}
          >
            Beitreten
          </button>
        </div>

        {tab === "host" ? (
          <>
            <div className="field">
              <label>Raum-Name</label>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="z.B. Taverne zum Drachen"
              />
              <div className="hint">
                Gespeicherte Assets erscheinen nur in Räumen gleichen Namens.
              </div>
            </div>
            <div className="field">
              <label>Dein Name</label>
              <input
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Game Master"
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Max. Spieler</label>
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(clamp(Number(e.target.value), 2, 8))}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Start-HP (Herzen)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={startHearts}
                  onChange={(e) => setStartHearts(clamp(Number(e.target.value), 1, 20))}
                />
              </div>
            </div>
            <button className="primary" style={{ width: "100%" }} onClick={createHost} disabled={busy}>
              {busy ? "Erstelle…" : "Raum erstellen"}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Raum-Code</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="ABCD"
                style={{ textTransform: "uppercase", letterSpacing: 4, fontSize: 22, textAlign: "center" }}
              />
            </div>
            <div className="field">
              <label>Dein Name</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Held:in"
              />
            </div>
            <button className="primary" style={{ width: "100%" }} onClick={join} disabled={busy}>
              {busy ? "Trete bei…" : "Beitreten"}
            </button>
          </>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
