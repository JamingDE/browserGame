import { useEffect, useRef, useState } from "react";
import { useHostStore } from "../state/store.js";
import type { Asset } from "../../shared/types.js";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onOpenEditor: (initialAssets?: Asset[]) => void;
}

type Tab = "search" | "upload" | "history" | "saved";

interface PixabayResult {
  id: string;
  thumb: string;
  full: string;
  width?: number;
  height?: number;
  source: "pixabay";
  name: string;
}

export function AssetBrowser({ collapsed, onToggle, onOpenEditor }: Props) {
  const state = useHostStore((s) => s.state);
  const addAsset = useHostStore((s) => s.addAsset);
  const saveAssetToRoom = useHostStore((s) => s.saveAssetToRoom);
  const addElement = useHostStore((s) => s.addElement);
  const activeSlide = state.slides[state.activeSlideIndex];

  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PixabayResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [page, setPage] = useState(1);
  const [uploadBusy, setUploadBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verlauf = alle Assets in library, die NICHT im saved-Set sind
  const savedIds = new Set(state.assets.saved[state.roomName] ?? []);
  const history = Object.values(state.assets.library).filter(
    (a) => !savedIds.has(a.id)
  );
  const saved = (state.assets.saved[state.roomName] ?? [])
    .map((id) => state.assets.library[id])
    .filter(Boolean);

  // Debounced search
  useEffect(() => {
    if (tab !== "search") return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      setPage(1);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&page=1`
        );
        const data = (await res.json()) as {
          results: PixabayResult[];
          hasKey?: boolean;
        };
        setResults(data.results ?? []);
        setHasKey(data.hasKey ?? true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, tab]);

  async function loadMore() {
    const next = page + 1;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&page=${next}`
      );
      const data = (await res.json()) as { results: PixabayResult[] };
      setResults((prev) => [...prev, ...data.results]);
      setPage(next);
    } finally {
      setSearching(false);
    }
  }

  // Pixabay-Bild als Asset hinzufügen (Proxy holt data-URL wegen CORS)
  async function addPixabay(result: PixabayResult) {
    let src: string;
    try {
      const r = await fetch(
        `/api/fetch?url=${encodeURIComponent(result.full)}`
      );
      const data = (await r.json()) as { dataUrl?: string };
      src = data.dataUrl ?? result.full; // fallback: direkte URL
    } catch {
      src = result.full;
    }
    const asset: Asset = {
      id: result.id,
      name: result.name,
      src,
      tags: [result.source],
      width: result.width,
      height: result.height,
    };
    addAsset(asset);
    dropOnCanvas(asset);
  }

  // Upload mehrerer Dateien
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    try {
      const assets: Asset[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const src = await fileToDataUrl(file);
        const img = await loadImage(src);
        const asset: Asset = {
          id: `up-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          src,
          tags: ["upload"],
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        addAsset(asset);
        assets.push(asset);
      }
      // Bei mehreren Files: statt auf Canvas zu dropen, zeige nur Erfolg
      if (assets.length === 1) dropOnCanvas(assets[0]);
    } finally {
      setUploadBusy(false);
    }
  }

  function dropOnCanvas(asset: Asset) {
    if (!activeSlide) return;
    // Seitenverhältnis erhalten → Höhe passend zu default-Breite
    const ratio =
      asset.width && asset.height ? asset.height / asset.width : 1;
    addElement(activeSlide.id, {
      type: "image",
      assetId: asset.id,
      w: 0.25,
      h: 0.25 * ratio,
      x: 0.4,
      y: 0.4,
    });
  }

  function startEditorWithSelection(asset?: Asset) {
    onOpenEditor(asset ? [asset] : []);
  }

  return (
    <aside className={`asset-browser ${collapsed ? "collapsed" : ""}`}>
      <div className="ab-header">
        <h3>🖼️ Assets</h3>
        <div className="ab-actions">
          <button
            className="ghost ab-btn"
            title="Bild-Editor öffnen"
            onClick={() => startEditorWithSelection()}
          >
            ✂️ Editor
          </button>
          <button className="ghost ab-btn" onClick={onToggle} title="Ein-/Ausklappen">
            {collapsed ? "»" : "«"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="ab-tabs">
            <button
              className={tab === "search" ? "active" : ""}
              onClick={() => setTab("search")}
            >
              🔍 Suche
            </button>
            <button
              className={tab === "upload" ? "active" : ""}
              onClick={() => setTab("upload")}
            >
              ⬆️ Upload
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              🕒 Verlauf
              {history.length > 0 && (
                <span className="ab-count">{history.length}</span>
              )}
            </button>
            <button
              className={tab === "saved" ? "active" : ""}
              onClick={() => setTab("saved")}
            >
              ⭐ Saved
              {saved.length > 0 && (
                <span className="ab-count">{saved.length}</span>
              )}
            </button>
          </div>

          <div className="ab-body">
            {tab === "search" && (
              <>
                {!hasKey && (
                  <div className="ab-notice">
                    ⚠️ Kein Pixabay-Key auf dem Server gesetzt. Upload
                    funktioniert trotzdem.
                  </div>
                )}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="z.B. dragon, sword, forest…"
                  autoFocus
                />
                {searching && <div className="ab-loading">Suche…</div>}
                <div className="ab-grid">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      className="ab-tile"
                      title={`${r.name} — Klick: auf Canvas, Rechtsklick: nur in Verlauf`}
                      onClick={() => addPixabay(r)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // Nur in Verlauf, nicht auf Canvas
                        addAsset({
                          id: r.id,
                          name: r.name,
                          src: r.full,
                          tags: ["pixabay"],
                        });
                      }}
                    >
                      <img src={r.thumb} alt={r.name} loading="lazy" />
                    </button>
                  ))}
                </div>
                {results.length > 0 && !searching && (
                  <button className="ghost ab-more" onClick={loadMore}>
                    Mehr laden
                  </button>
                )}
              </>
            )}

            {tab === "upload" && (
              <div className="ab-upload">
                <label className="ab-dropzone">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleUpload(e.target.files)}
                    hidden
                  />
                  <div>
                    {uploadBusy ? "Lade hoch…" : "📁 Bilder auswählen"}
                    <div className="hint">
                      Mehrere gleichzeitig möglich. PNG mit Transparenz
                      empfohlen.
                    </div>
                  </div>
                </label>
              </div>
            )}

            {tab === "history" && (
              <AssetGrid
                assets={history}
                emptyHint="Noch keine Assets im Verlauf."
                onDropOnCanvas={dropOnCanvas}
                onSave={(a) => saveAssetToRoom(a.id)}
                onEdit={startEditorWithSelection}
              />
            )}

            {tab === "saved" && (
              <AssetGrid
                assets={saved}
                emptyHint={`Noch keine gespeicherten Assets für „${state.roomName}".`}
                onDropOnCanvas={dropOnCanvas}
                onSave={undefined}
                onEdit={startEditorWithSelection}
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}

interface GridProps {
  assets: Asset[];
  emptyHint: string;
  onDropOnCanvas: (a: Asset) => void;
  onSave?: (a: Asset) => void;
  onEdit: (a: Asset) => void;
}
function AssetGrid({
  assets,
  emptyHint,
  onDropOnCanvas,
  onSave,
  onEdit,
}: GridProps) {
  if (assets.length === 0) {
    return <div className="ab-empty">{emptyHint}</div>;
  }
  return (
    <div className="ab-grid">
      {assets.map((a) => (
        <div key={a.id} className="ab-asset">
          <button
            className="ab-tile"
            title={`${a.name} — Klick: auf Canvas`}
            onClick={() => onDropOnCanvas(a)}
          >
            <img src={a.src} alt={a.name} loading="lazy" />
          </button>
          <div className="ab-asset-tools">
            {onSave && (
              <button
                className="ab-mini"
                title="Für diesen Raum speichern"
                onClick={() => onSave(a)}
              >
                ⭐
              </button>
            )}
            <button
              className="ab-mini"
              title="Im Editor bearbeiten"
              onClick={() => onEdit(a)}
            >
              ✂️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// === Hilfsfunktionen ===
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
