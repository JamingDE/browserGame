import { useEffect, useRef, useState } from "react";
import { useHostStore } from "../state/store.js";
import type { Asset } from "../../shared/types.js";

interface Props {
  initialAssets: Asset[];
  onClose: () => void;
}

interface Layer {
  id: string;
  img: HTMLImageElement;
  src: string;
  name: string;
  x: number; // 0..1 relativ zur Leinwand
  y: number;
  w: number;
  h: number;
  rotation: number;
  visible: boolean;
}

type Tool = "move" | "crop" | "erase";

export function ImageEditor({ initialAssets, onClose }: Props) {
  const addAsset = useHostStore((s) => s.addAsset);
  const saveAssetToRoom = useHostStore((s) => s.saveAssetToRoom);

  const canvasW = 800;
  const canvasH = 600;
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [brushSize, setBrushSize] = useState(24);
  const [eraserMask, setEraserMask] = useState<boolean[][]>(() =>
    Array.from({ length: canvasH }, () => Array(canvasW).fill(false))
  );
  const [cropRect, setCropRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [draggingCrop, setDraggingCrop] = useState<{
    phase: "anchor" | "move";
    startX: number;
    startY: number;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const [eraserStroke, setEraserStroke] = useState(false);
  const [name, setName] = useState(
    initialAssets[0]?.name ?? "Bearbeitetes Asset"
  );
  const [busy, setBusy] = useState(false);

  // Initiale Assets als Layer laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ls: Layer[] = [];
      for (const a of initialAssets) {
        const img = await loadImage(a.src);
        if (cancelled) return;
        // Ins Canvas einpassen
        const ratio = img.naturalWidth / img.naturalHeight;
        let w = 0.7;
        let h = w / ratio;
        if (h > 0.9) {
          h = 0.9;
          w = h * ratio;
        }
        ls.push({
          id: a.id + "-layer",
          img,
          src: a.src,
          name: a.name,
          x: 0.5,
          y: 0.5,
          w,
          h,
          rotation: 0,
          visible: true,
        });
      }
      if (!cancelled) {
        setLayers(ls);
        setActiveLayerId(ls[0]?.id ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialAssets]);

  // === Render-Loop:Layers + Werkzeug-Overlays ===
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Hintergrund (Schachbrett für Transparenz)
    drawChecker(ctx, canvasW, canvasH);

    // Layers zeichnen (außerhalb der erase-mask)
    const active = layers.find((l) => l.id === activeLayerId);
    for (const l of layers) {
      if (!l.visible) continue;
      const w = l.w * canvasW;
      const h = l.h * canvasH;
      const x = l.x * canvasW - w / 2;
      const y = l.y * canvasH - h / 2;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.drawImage(l.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Radier-Maske: aus gelöschten Pixeln wird transparent
    if (tool === "erase" && active) {
      const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
      const data = imageData.data;
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          if (eraserMask[y][x]) {
            data[(y * canvasW + x) * 4 + 3] = 0; // alpha = 0
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // Crop-Rechteck zeichnen
    if (tool === "crop" && cropRect) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      // Dunkles Overlay überall außer im Crop
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.clearRect(
        cropRect.x * canvasW,
        cropRect.y * canvasH,
        cropRect.w * canvasW,
        cropRect.h * canvasH
      );
      // Layers im Crop neu zeichnen
      for (const l of layers) {
        if (!l.visible) continue;
        const w = l.w * canvasW;
        const h = l.h * canvasH;
        const x = l.x * canvasW - w / 2;
        const y = l.y * canvasH - h / 2;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((l.rotation * Math.PI) / 180);
        ctx.drawImage(l.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      // Crop-Rahmen
      ctx.strokeStyle = "#f7d77a";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(
        cropRect.x * canvasW,
        cropRect.y * canvasH,
        cropRect.w * canvasW,
        cropRect.h * canvasH
      );
      ctx.restore();
    }
  }, [layers, activeLayerId, tool, eraserMask, cropRect, canvasW, canvasH]);

  // === Werkzeug-Interaktion ===
  function onCanvasPointerDown(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (tool === "crop") {
      if (!cropRect) {
        // Erster Klick = Anker
        setDraggingCrop({
          phase: "anchor",
          startX: x,
          startY: y,
          rect: { x, y, w: 0, h: 0 },
        });
      } else {
        // In bestehendes Crop klicken → verschieben
        setDraggingCrop({
          phase: "move",
          startX: x,
          startY: y,
          rect: cropRect,
        });
      }
    } else if (tool === "erase") {
      setEraserStroke(true);
      eraseAt(x, y);
    }
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    if (draggingCrop?.phase === "anchor") {
      setDraggingCrop((d) =>
        d
          ? {
              ...d,
              rect: {
                x: Math.min(d.startX, x),
                y: Math.min(d.startY, y),
                w: Math.abs(x - d.startX),
                h: Math.abs(y - d.startY),
              },
            }
          : d
      );
    } else if (draggingCrop?.phase === "move" && cropRect) {
      const dx = x - draggingCrop.startX;
      const dy = y - draggingCrop.startY;
      setCropRect({
        ...draggingCrop.rect,
        x: clamp01(draggingCrop.rect.x + dx),
        y: clamp01(draggingCrop.rect.y + dy),
      });
    } else if (eraserStroke) {
      eraseAt(x, y);
    }
  }

  function onCanvasPointerUp() {
    if (draggingCrop?.phase === "anchor") {
      if (draggingCrop.rect.w > 0.02 && draggingCrop.rect.h > 0.02) {
        setCropRect(draggingCrop.rect);
      }
      setDraggingCrop(null);
    } else if (draggingCrop?.phase === "move") {
      setDraggingCrop(null);
    }
    setEraserStroke(false);
  }

  function eraseAt(xRel: number, yRel: number) {
    const cx = Math.round(xRel * canvasW);
    const cy = Math.round(yRel * canvasH);
    const r = brushSize / 2;
    setEraserMask((prev) => {
      const next = prev.map((row) => row.slice());
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(canvasH, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(canvasW, Math.ceil(cx + r)); x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r) {
            next[y][x] = true;
          }
        }
      }
      return next;
    });
  }

  // === Aktionen ===
  async function addUpload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const src = await fileToDataUrl(file);
      const img = await loadImage(src);
      const ratio = img.naturalWidth / img.naturalHeight;
      let w = 0.6;
      let h = w / ratio;
      if (h > 0.9) {
        h = 0.9;
        w = h * ratio;
      }
      const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setLayers((prev) => [
        ...prev,
        {
          id,
          img,
          src,
          name: file.name.replace(/\.[^.]+$/, ""),
          x: 0.5,
          y: 0.5,
          w,
          h,
          rotation: 0,
          visible: true,
        },
      ]);
      setActiveLayerId(id);
    }
  }

  function removeLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  }

  function clearEraser() {
    setEraserMask(Array.from({ length: canvasH }, () => Array(canvasW).fill(false)));
  }

  function clearCrop() {
    setCropRect(null);
  }

  function clearAll() {
    clearEraser();
    clearCrop();
  }

  // Ergebnis rendern & speichern
  async function exportAsset(alsoSave: boolean) {
    setBusy(true);
    try {
      // Output-Canvas ohne Checker-Hintergrund
      const out = document.createElement("canvas");
      out.width = canvasW;
      out.height = canvasH;
      const ctx = out.getContext("2d")!;
      for (const l of layers) {
        if (!l.visible) continue;
        const w = l.w * canvasW;
        const h = l.h * canvasH;
        const x = l.x * canvasW - w / 2;
        const y = l.y * canvasH - h / 2;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((l.rotation * Math.PI) / 180);
        ctx.drawImage(l.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      // Radier-Maske anwenden
      const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
      const data = imageData.data;
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          if (eraserMask[y][x]) {
            data[(y * canvasW + x) * 4 + 3] = 0;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Falls Crop gesetzt: auf Crop-BoundingBox beschneiden
      let finalCanvas = out;
      if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
        const sx = cropRect.x * canvasW;
        const sy = cropRect.y * canvasH;
        const sw = cropRect.w * canvasW;
        const sh = cropRect.h * canvasH;
        const cropped = document.createElement("canvas");
        cropped.width = Math.round(sw);
        cropped.height = Math.round(sh);
        const cctx = cropped.getContext("2d")!;
        cctx.drawImage(out, sx, sy, sw, sh, 0, 0, sw, sh);
        finalCanvas = cropped;
      }

      const dataUrl = finalCanvas.toDataURL("image/png");
      const asset: Asset = {
        id: `ed-${Date.now().toString(36)}`,
        name: name.trim() || "Bearbeitetes Asset",
        src: dataUrl,
        tags: ["edited"],
        width: finalCanvas.width,
        height: finalCanvas.height,
      };
      addAsset(asset);
      if (alsoSave) saveAssetToRoom(asset.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-overlay" onPointerDown={onClose}>
      <div
        className="editor-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="editor-head">
          <h2>✂️ Bild-Editor</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="editor-body">
          <div className="editor-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={previewRef}
              width={canvasW}
              height={canvasH}
              className={`editor-canvas tool-${tool}`}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            />
            {layers.length === 0 && (
              <div className="editor-empty">
                Lade Bilder über „Layer hinzufügen" unten links.
              </div>
            )}
          </div>

          <div className="editor-side">
            <div className="editor-section">
              <h4>Werkzeug</h4>
              <div className="editor-tools">
                <button
                  className={tool === "move" ? "active" : ""}
                  onClick={() => setTool("move")}
                >
                  ✋ Bewegen
                </button>
                <button
                  className={tool === "crop" ? "active" : ""}
                  onClick={() => setTool("crop")}
                >
                  ✂️ Zuschneiden
                </button>
                <button
                  className={tool === "erase" ? "active" : ""}
                  onClick={() => setTool("erase")}
                >
                  🩹 Radieren
                </button>
              </div>
              {tool === "erase" && (
                <div className="editor-row">
                  <label>Pinselgröße</label>
                  <input
                    type="range"
                    min={6}
                    max={80}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                  <span className="muted">{brushSize}px</span>
                  <button className="ghost" onClick={clearEraser}>
                    Mask leeren
                  </button>
                </div>
              )}
              {tool === "crop" && (
                <button className="ghost" onClick={clearCrop} disabled={!cropRect}>
                  Crop aufheben
                </button>
              )}
              {tool !== "move" && (
                <button className="ghost" onClick={clearAll}>
                  Alles zurücksetzen
                </button>
              )}
            </div>

            <div className="editor-section">
              <h4>Layer ({layers.length})</h4>
              <label className="editor-add-layer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => addUpload(e.target.files)}
                  hidden
                />
                + Layer hinzufügen
              </label>
              <div className="editor-layers">
                {layers.map((l) => (
                  <div
                    key={l.id}
                    className={`editor-layer ${
                      l.id === activeLayerId ? "active" : ""
                    }`}
                    onClick={() => setActiveLayerId(l.id)}
                  >
                    <button
                      className="ab-mini"
                      title={l.visible ? "Verbergen" : "Zeigen"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLayers((prev) =>
                          prev.map((x) =>
                            x.id === l.id ? { ...x, visible: !x.visible } : x
                          )
                        );
                      }}
                    >
                      {l.visible ? "👁️" : "🚫"}
                    </button>
                    <img src={l.src} alt={l.name} />
                    <span className="editor-layer-name">{l.name}</span>
                    <button
                      className="ab-mini danger"
                      title="Layer löschen"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(l.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="editor-section">
              <h4>Speichern</h4>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Asset-Name"
              />
              <button
                className="primary"
                style={{ marginTop: 8 }}
                onClick={() => exportAsset(false)}
                disabled={busy || layers.length === 0}
              >
                💾 Als Asset speichern
              </button>
              <button
                style={{ marginTop: 6, width: "100%" }}
                onClick={() => exportAsset(true)}
                disabled={busy || layers.length === 0}
              >
                ⭐ Speichern + für Raum merken
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// === Hilfsfunktionen ===
function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = 16;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle =
        (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0
          ? "#1a1326"
          : "#241a35";
      ctx.fillRect(x, y, size, size);
    }
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
