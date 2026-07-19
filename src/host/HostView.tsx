import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import { useHostStore } from "../state/store.js";
import { SlideCanvas } from "./SlideCanvas.js";
import { SlideList } from "./SlideList.js";
import { AssetBrowser } from "./AssetBrowser.js";
import { ImageEditor } from "./ImageEditor.js";
import { WheelModal } from "./WheelModal.js";
import { DiceModal } from "./DiceModal.js";
import { CharacterPanel } from "./CharacterPanel.js";
import type { Asset, LobbyMember } from "../../shared/types.js";

interface Props {
  roomCode: string;
  roomName: string;
  maxPlayers: number;
  startHearts: number;
  roster: LobbyMember[];
  onExit: () => void;
}

export function HostView({
  roomCode,
  roomName,
  maxPlayers,
  startHearts,
  roster,
  onExit,
}: Props) {
  const init = useHostStore((s) => s.init);
  const state = useHostStore((s) => s.state);
  const sync = useHostStore((s) => s.sync);
  const addSlide = useHostStore((s) => s.addSlide);
  const slidesCount = state.slides.length;

  const [slidesCollapsed, setSlidesCollapsed] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [charsOpen, setCharsOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<Asset[]>([]);

  // Initial-State aus übergebener Roster aufbauen (alle Spieler + Host).
  useEffect(() => {
    const myId = getSocket().id ?? "host";
    init({
      roomCode,
      hostId: myId,
      hostName: roster.find((m) => m.isHost)?.name ?? "Game Master",
      roomName,
      maxPlayers,
      startHearts,
      roster: roster.map((m) => ({ id: m.id, name: m.name, isHost: m.isHost })),
    });
  }, [init, roomCode, roomName, maxPlayers, startHearts, roster]);

  // Erste Slide automatisch anlegen
  useEffect(() => {
    if (slidesCount === 0) addSlide();
  }, [slidesCount, addSlide]);

  // Server fragt nach State → raus damit
  useEffect(() => {
    const sock = getSocket();
    const onReq = () => sync();
    sock.on("host:request-state", onReq);
    return () => {
      sock.off("host:request-state", onReq);
    };
  }, [sync]);

  // Initialer Push nach Mount (statt Timer besser direkt, aber Sync
  // braucht eine init-Flanke; 50ms Buffer reicht locker)
  useEffect(() => {
    const t = setTimeout(() => sync(), 50);
    return () => clearTimeout(t);
  }, [sync]);

  function openEditor(seed?: Asset[]) {
    setEditorSeed(seed ?? []);
    setEditorOpen(true);
  }

  return (
    <div className="host-layout">
      <header className="host-top">
        <div className="host-top-left">
          <button className="ghost" onClick={onExit} title="Zur Lobby">
            ←
          </button>
          <span className="brand">👑 {roomCode}</span>
          <span className="muted host-room">{state.roomName}</span>
        </div>
        <div className="host-top-right">
          <button
            className="ghost tool-btn"
            onClick={() => setCharsOpen(true)}
            title="Charakterbögen"
          >
            📜 <span className="tool-label">Helden</span>
          </button>
          <button
            className="ghost tool-btn"
            onClick={() => setDiceOpen(true)}
            title="Würfel"
          >
            🎲 <span className="tool-label">Würfel</span>
          </button>
          <button
            className="ghost tool-btn"
            onClick={() => setWheelOpen(true)}
            title="Glücksrad"
          >
            🎡 <span className="tool-label">Rad</span>
          </button>
          <span className="tool-sep" />
          <button
            className="ghost"
            onClick={() => setSlidesCollapsed((v) => !v)}
            title="Slides ein-/aus"
          >
            🎬
          </button>
          <button
            className="ghost"
            onClick={() => setBrowserCollapsed((v) => !v)}
            title="Browser ein-/aus"
          >
            🖼️
          </button>
        </div>
      </header>

      <div className="host-main">
        <SlideList
          collapsed={slidesCollapsed}
          onToggle={() => setSlidesCollapsed((v) => !v)}
        />
        <SlideCanvas />
        <AssetBrowser
          collapsed={browserCollapsed}
          onToggle={() => setBrowserCollapsed((v) => !v)}
          onOpenEditor={openEditor}
        />
      </div>

      {charsOpen && <CharacterPanel onClose={() => setCharsOpen(false)} />}
      {wheelOpen && <WheelModal onClose={() => setWheelOpen(false)} />}
      {diceOpen && <DiceModal onClose={() => setDiceOpen(false)} />}
      {editorOpen && (
        <ImageEditor
          initialAssets={editorSeed}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
