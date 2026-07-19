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
  // Puffert das start-Payload, falls es vor dem View-Wechsel in "waiting"
  // ankommt (Race-Condition-Schutz).
  const [pendingStart, setPendingStart] = useState<StartPayload | null>(null);

  // game:started: Global registriert, damit kein Event verpasst wird.
  useEffect(() => {
    const sock = getSocket();
    const onStarted = (payload: StartPayload) => {
      console.log("[app] game:started received", payload);
      setPendingStart(payload);
      setView((v) => {
        if (v.kind !== "waiting") {
          console.log("[app] not in waiting view, ignoring", v.kind);
          return v;
        }
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
  }, []);

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
          key={view.roomCode + "-wait"}
          roomCode={view.roomCode}
          isHost={view.isHost}
          yourId={view.yourId}
          pendingStart={pendingStart}
          onGameStart={() => {
            // Host hat den Button geklickt; server broadcastet game:started.
            // Der View-Wechsel passiert über den Listener oben.
          }}
          onExit={() => {
            setPendingStart(null);
            setView({ kind: "lobby" });
          }}
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
