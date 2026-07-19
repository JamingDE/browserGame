import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import type { LobbyMember } from "../../shared/types.js";

interface Props {
  roomCode: string;
  isHost: boolean;
  yourId: string;
  onGameStart: () => void;
  onExit: () => void;
}

interface Roster {
  roomCode: string;
  roomName: string;
  hostName: string;
  maxPlayers: number;
  startHearts: number;
  members: LobbyMember[];
  gameStarted: boolean;
}

const AVATARS = ["🧙", "🧝", "🧛", "🧚", "🗡️", "🛡️", "🏹", "🐉"];
const HOST_AVATARS = ["👑", "📜", "⚗️", "🔮"];

function pickAvatar(name: string, isHost: boolean) {
  const pool = isHost ? HOST_AVATARS : AVATARS;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return pool[Math.abs(h) % pool.length];
}

export function WaitingRoom({
  roomCode,
  isHost,
  yourId,
  onGameStart,
  onExit,
}: Props) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sock = getSocket();
    const onRoster = (r: Roster) => setRoster(r);
    const onKick = (reason: string) => {
      setKicked(reason);
      setTimeout(onExit, 1800);
    };
    sock.on("lobby:roster", onRoster);
    sock.on("lobby:kick", onKick);
    return () => {
      sock.off("lobby:roster", onRoster);
      sock.off("lobby:kick", onKick);
    };
  }, [onExit]);

  if (kicked) {
    return (
      <div className="waiting-wrap">
        <div className="card waiting-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🚪</div>
          <h2 style={{ color: "var(--crimson)", marginTop: 12 }}>Hinausgeworfen</h2>
          <p className="muted">{kicked}</p>
        </div>
      </div>
    );
  }

  const members = roster?.members ?? [];
  const slots = roster?.maxPlayers ?? 4;
  const players = members.filter((m) => !m.isHost);
  const playerCount = members.length;
  const host = members.find((m) => m.isHost);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function startGame() {
    getSocket().emit("host:start-game");
    onGameStart();
  }

  function kick(memberId: string) {
    getSocket().emit("host:kick", memberId);
  }

  return (
    <div className="waiting-wrap">
      <div className="card waiting-card">
        <div className="waiting-head">
          <div>
            <h2>📜 {roster?.roomName ?? "Lade…"}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {isHost
                ? "Teile den Code mit deinen Abenteurern."
                : `Game Master: ${roster?.hostName ?? "—"}. Warte auf Spielstart.`}
            </p>
          </div>
          <button className="ghost" onClick={onExit} title="Lobby verlassen">
            ← Verlassen
          </button>
        </div>

        <div className="code-row">
          <span className="code-pill">{roomCode}</span>
          <button className="copy-btn ghost" onClick={copyCode}>
            {copied ? "✓ Kopiert" : "📋 Code kopieren"}
          </button>
        </div>

        <div className="lobby-meta">
          <div className="meta-item">
            <span className="label">Spieler</span>
            <span className="value">
              {playerCount} / {slots}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Start-HP</span>
            <span className="value">{roster?.startHearts ?? "—"} ❤️</span>
          </div>
          <div className="meta-item">
            <span className="label">Game Master</span>
            <span className="value">{host?.name ?? "—"}</span>
          </div>
        </div>

        <div className="player-grid">
          {members.map((m) => (
            <div
              key={m.id}
              className={`player-chip ${m.isHost ? "is-host" : ""} ${
                m.id === yourId ? "is-you" : ""
              }`}
            >
              {isHost && !m.isHost && (
                <button
                  className="kick"
                  title="Spieler rauswerfen"
                  onClick={() => kick(m.id)}
                >
                  ✕
                </button>
              )}
              <div className="avatar">{pickAvatar(m.name, m.isHost)}</div>
              <div className="name">{m.name}</div>
              <div className="role">
                {m.isHost ? "👑 Game Master" : m.id === yourId ? "Du" : "Abenteurer"}
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, slots - members.length) }).map(
            (_, i) => (
              <div key={`empty-${i}`} className="player-chip empty-slot">
                <span className="faint">Freier Platz</span>
              </div>
            )
          )}
        </div>

        <div className="waiting-foot">
          <div className="status">
            <span className="dot" />
            {isHost
              ? players.length === 0
                ? "Warte auf Spieler…"
                : `${players.length} Spieler${
                    players.length === 1 ? "" : ""
                  } dabei`
              : "Warte auf Spielstart…"}
          </div>
          {isHost && (
            <button
              className="primary"
              onClick={startGame}
              disabled={members.length < 2}
              title={
                members.length < 2 ? "Mindestens 2 Spieler nötig" : undefined
              }
            >
              ⚔️ Spiel starten
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
