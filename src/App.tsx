import { useState } from "react";
import { Lobby } from "./lobby/Lobby.js";
import { HostView } from "./host/HostView.js";
import { PlayerView } from "./player/PlayerView.js";

type View =
  | { kind: "lobby" }
  | { kind: "host"; roomCode: string }
  | { kind: "player"; roomCode: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "lobby" });

  if (view.kind === "lobby") {
    return (
      <Lobby
        onHost={(roomCode) => setView({ kind: "host", roomCode })}
        onPlayer={(roomCode) => setView({ kind: "player", roomCode })}
      />
    );
  }
  if (view.kind === "host") {
    return <HostView roomCode={view.roomCode} onExit={() => setView({ kind: "lobby" })} />;
  }
  return <PlayerView roomCode={view.roomCode} onExit={() => setView({ kind: "lobby" })} />;
}
