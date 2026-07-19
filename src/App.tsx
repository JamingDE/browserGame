import { useEffect, useState } from "react";
import { Lobby } from "./lobby/Lobby.js";
import { WaitingRoom } from "./lobby/WaitingRoom.js";
import { HostView } from "./host/HostView.js";
import { PlayerView } from "./player/PlayerView.js";
import { ToastStack } from "./components/Toasts.js";
import { getSocket } from "./net/socket.js";

type View =
  | { kind: "lobby" }
  | {
      kind: "waiting";
      roomCode: string;
      isHost: boolean;
      yourId: string;
    }
  | { kind: "host"; roomCode: string }
  | { kind: "player"; roomCode: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "lobby" });

  // "game:started" kommt vom Server, sobald der Host das Spiel startet.
  // Wechselt Wartezimmer → Host/Player View.
  useEffect(() => {
    if (view.kind !== "waiting") return;
    const sock = getSocket();
    const onStarted = () => {
      setView((v) =>
        v.kind === "waiting"
          ? { kind: v.isHost ? "host" : "player", roomCode: v.roomCode }
          : v
      );
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
          onGameStart={() =>
            setView({ kind: "host", roomCode: view.roomCode })
          }
          onExit={() => setView({ kind: "lobby" })}
        />
      )}

      {view.kind === "host" && (
        <HostView
          roomCode={view.roomCode}
          onExit={() => setView({ kind: "lobby" })}
        />
      )}

      {view.kind === "player" && (
        <PlayerView
          roomCode={view.roomCode}
          onExit={() => setView({ kind: "lobby" })}
        />
      )}
    </>
  );
}
