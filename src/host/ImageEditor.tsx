import { useEffect, useRef, useState } from "react";
import { useHostStore } from "../state/store.js";
import type { Asset } from "../../shared/types.js";
import { fileToDataUrl, loadImage } from "../utils/image.js";

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

type Tool = "move" | "crop" | "erase" | "paint";

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
  const [paintColor, setPaintColor] = useState("#e0b15e");
  const [eraserMask, setEraserMask] = useState<boolean[][]>(() =>
    Array.from({ length: canvasH }, () => Array(canvasW).fill(false))
  );
  // Paint-Layer: eigenes Canvas, wird über alles drüber gelegt
  const paintLayerRef = useRef<HTMLCanvasElement | null>(null);
  const paintLayerCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPaintPoint = useRef<{ x: number; y: number } | null>(null);
  // Render-Trigger für Live-Paint (separater Ticker)
  const [paintLayerTick, setPaintLayerTick] = useState(0);

  // Paint-Layer initialisieren
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    paintLayerRef.current = canvas;
    paintLayerCtxRef.current = ctx;
  }, []);
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

    // Paint-Layer drüber zeichnen (live)
    if (paintLayerRef.current) {
      ctx.drawImage(paintLayerRef.current, 0, 0);
    }

    // Radier-Maske: aus gelöschten Pixeln wird transparent
    if (tool === "erase" && active) {
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
    }

    // Crop-Rechteck zeichnen
    if (tool === "crop" && cropRect) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.clearRect(
        cropRect.x * canvasW,
        cropRect.y * canvasH,
        cropRect.w * canvasW,
        cropRect.h * canvasH
      );
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
      if (paintLayerRef.current) ctx.drawImage(paintLayerRef.current, 0, 0);
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
  }, [
    layers,
    activeLayerId,
    tool,
    eraserMask,
    cropRect,
    canvasW,
    canvasH,
    paintLayerTick,
  ]);

  // === Werkzeug-Interaktion ===
  function onCanvasPointerDown(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (tool === "crop") {
      if (!cropRect) {
        setDraggingCrop({
          phase: "anchor",
          startX: x,
          startY: y,
          rect: { x, y, w: 0, h: 0 },
        });
      } else {
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
    } else if (tool === "paint") {
      drawingRef.current = true;
      const ctx = paintLayerCtxRef.current!;
      const px = x * canvasW;
      const py = y * canvasH;
      lastPaintPoint.current = { x: px, y: py };
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = paintColor;
      ctx.beginPath();
      ctx.arc(px, py, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      setPaintLayerTick((t) => t + 1);
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
    } else if (tool === "paint" && drawingRef.current) {
      const ctx = paintLayerCtxRef.current!;
      const px = x * canvasW;
      const py = y * canvasH;
      const last = lastPaintPoint.current!;
      ctx.strokeStyle = paintColor;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(px, py);
      ctx.stroke();
      lastPaintPoint.current = { x: px, y: py };
      setPaintLayerTick((t) => t + 1);
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
    drawingRef.current = false;
    lastPaintPoint.current = null;
  }

  function clearPaintLayer() {
    if (paintLayerCtxRef.current) {
      paintLayerCtxRef.current.clearRect(
        0,
        0,
        paintLayerRef.current!.width,
        paintLayerRef.current!.height
      );
      setPaintLayerTick((t) => t + 1);
    }
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
      // Paint-Layer mit exportieren
      if (paintLayerRef.current) {
        ctx.drawImage(paintLayerRef.current, 0, 0);
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
                <button
                  className={tool === "paint" ? "active" : ""}
                  onClick={() => setTool("paint")}
                >
                  🖌️ Malen
                </button>
              </div>
              {(tool === "erase" || tool === "paint") && (
                <div className="editor-row">
                  <label>Pinselgröße</label>
                  <input
                    type="range"
                    min={2}
                    max={80}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                  <span className="muted">{brushSize}px</span>
                </div>
              )}
              {tool === "paint" && (
                <div className="editor-row">
                  <label>Farbe</label>
                  <input
                    type="color"
                    value={paintColor}
                    onChange={(e) => setPaintColor(e.target.value)}
                    className="paint-color-input"
                  />
                  <button className="ghost" onClick={clearPaintLayer}>
                    Malerei leeren
                  </button>
                </div>
              )}
              {tool === "erase" && (
                <div className="editor-row">
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
