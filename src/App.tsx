import { useEffect, useState } from "react";
import { Lobby } from "./lobby/Lobby.js";
import { WaitingRoom } from "./lobby/WaitingRoom.js";
import { HostView } from "./host/HostView.js";
import { PlayerView } from "./player/PlayerView.js";
import { ToastStack } from "./components/Toasts.js";
import { getSocket } from "./net/socket.js";
import type { LobbyMember } from "../shared/types.js";

type View =
  | { kind: "lobby" }
  | {
      kind: "waiting";
      roomCode: string;
      isHost: boolean;
      yourId: string;
    }
  | {
      kind: "host";
      roomCode: string;
      roomName: string;
      maxPlayers: number;
      startHearts: number;
      roster: LobbyMember[];
    }
  | { kind: "player"; roomCode: string };

interface StartPayload {
  members: LobbyMember[];
  roomName: string;
  maxPlayers: number;
  startHearts: number;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: "lobby" });

  // game:started: kommt vom Server, sobald der Host das Spiel startet.
  // Host bekommt die finale Roster mit, Spieler nur den Wechsel-Signal.
  useEffect(() => {
    if (view.kind !== "waiting") return;
    const sock = getSocket();
    const onStarted = (payload: StartPayload) => {
      setView((v) => {
        if (v.kind !== "waiting") return v;
        if (v.isHost) {
          return {
            kind: "host",
            roomCode: v.roomCode,
            roomName: payload.roomName,
            maxPlayers: payload.maxPlayers,
            startHearts: payload.startHearts,
            roster: payload.members,
          };
        }
        return { kind: "player", roomCode: v.roomCode };
      });
    };
    sock.on("game:started", onStarted);
    return () => {
      sock.off("game:started", onStarted);
    };
  }, [view.kind]);

  return (
    <>
      <ToastStack />

      {view.kind === "lobby" && (
        <Lobby
          onHost={(roomCode) =>
            setView({
              kind: "waiting",
              roomCode,
              isHost: true,
              yourId: getSocket().id ?? "",
            })
          }
          onPlayer={(roomCode) =>
            setView({
              kind: "waiting",
              roomCode,
              isHost: false,
              yourId: getSocket().id ?? "",
            })
          }
        />
      )}

      {view.kind === "waiting" && (
        <WaitingRoom
          roomCode={view.roomCode}
          isHost={view.isHost}
          yourId={view.yourId}
          onGameStart={() => {
            // Host hat selbst gestartet: View-Wechsel passiert via
            // game:started-Event vom Server. Fallback, falls der
            // Server nicht antwortet: nichts tun, warte auf Event.
          }}
          onExit={() => setView({ kind: "lobby" })}
        />
      )}

      {view.kind === "host" && (
        <HostView
          key={view.roomCode + "-host"}
          roomCode={view.roomCode}
          roomName={view.roomName}
          maxPlayers={view.maxPlayers}
          startHearts={view.startHearts}
          roster={view.roster}
          onExit={() => setView({ kind: "lobby" })}
        />
      )}

      {view.kind === "player" && (
        <PlayerView
          key={view.roomCode + "-player"}
          roomCode={view.roomCode}
          onExit={() => setView({ kind: "lobby" })}
        />
      )}
    </>
  );
}
