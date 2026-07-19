import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";
import { useHostStore } from "../state/store.js";
import { SlideCanvas } from "./SlideCanvas.js";
import { SlideList } from "./SlideList.js";
import { AssetBrowser } from "./AssetBrowser.js";
import { ImageEditor } from "./ImageEditor.js";
import type { Asset } from "../../shared/types.js";

interface Props {
  roomCode: string;
  onExit: () => void;
}

export function HostView({ roomCode, onExit }: Props) {
  const init = useHostStore((s) => s.init);
  const state = useHostStore((s) => s.state);
  const sync = useHostStore((s) => s.sync);
  const addSlide = useHostStore((s) => s.addSlide);
  const slidesCount = state.slides.length;

  const [slidesCollapsed, setSlidesCollapsed] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<Asset[]>([]);

  // Initial-State nur einmal pro Mount setzen.
  // TODO M2-Verbesserung: echte Lobby-Parameter durchreichen.
  useEffect(() => {
    init({
      roomCode,
      hostId: getSocket().id ?? "host",
      hostName: "Game Master",
      roomName: "Temporär",
      maxPlayers: 4,
      startHearts: 5,
    });
  }, [init, roomCode]);

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

  // Initialer Push nach Mount
  useEffect(() => {
    const t = setTimeout(() => sync(), 200);
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

      {editorOpen && (
        <ImageEditor
          initialAssets={editorSeed}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
