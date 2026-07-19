import { useEffect, useRef, useState } from "react";
import {
  elementsSorted,
  useActiveSlide,
  useHostStore,
} from "../state/store.js";
import { removeBackground } from "../utils/image.js";
import type { SlideElement, Asset } from "../../shared/types.js";

type Tool = "select" | "paint" | "text";

interface DragState {
  mode: "move" | "resize" | "rotate";
  elementId: string;
  startX: number;
  startY: number;
  startElX: number;
  startElY: number;
  startElW: number;
  startElH: number;
  startRot: number;
  rect: DOMRect;
  startAngle: number;
}

interface ContextMenu {
  x: number;
  y: number;
  elementId: string;
}

export function SlideCanvas() {
  const slide = useActiveSlide();
  const state = useHostStore((s) => s.state);
  const updateElement = useHostStore((s) => s.updateElement);
  const removeElement = useHostStore((s) => s.removeElement);
  const selectElement = useHostStore((s) => s.selectElement);
  const selectedId = useHostStore((s) => s.selectedElementId);
  const setBackground = useHostStore((s) => s.setBackground);
  const setElementLayer = useHostStore((s) => s.setElementLayer);
  const addElement = useHostStore((s) => s.addElement);

  const [tool, setTool] = useState<Tool>("select");
  const [paintColor, setPaintColor] = useState("#e0b15e");
  const [paintSize, setPaintSize] = useState(8);
  const stageRef = useRef<HTMLDivElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPaintPoint = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [bgRemoving, setBgRemoving] = useState<string | null>(null);

  // === Paint-Canvas Setup ===
  useEffect(() => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    // Feste Auflösung fürs Malen (vom DOM unabhängig)
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    const ctx = canvas.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    paintCanvasRef.current = canvas;
    paintCtxRef.current = ctx;
  }, [slide?.id]);

  // Bei Tool-Wechsel das Paint-Overlay anzeigen/verstecken
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Entferne alte Overlays
    stage.querySelectorAll(".paint-overlay").forEach((n) => n.remove());
    if (tool === "paint" && paintCanvasRef.current) {
      const overlay = paintCanvasRef.current;
      overlay.className = "paint-overlay";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "auto";
      overlay.style.cursor = "crosshair";
      overlay.style.zIndex = "50";
      stage.appendChild(overlay);
    }
  }, [tool, slide?.id]);

  // === Drag-Loop ===
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - drag.startX) / drag.rect.width;
      const dy = (e.clientY - drag.startY) / drag.rect.height;
      if (drag.mode === "move") {
        updateElement(slide!.id, drag.elementId, {
          x: clamp01(drag.startElX + dx),
          y: clamp01(drag.startElY + dy),
        });
      } else if (drag.mode === "resize") {
        const factor =
          Math.max(0.05, Math.max(Math.abs(dx), Math.abs(dy)) * 2 + 1);
        const newW = clampRange(drag.startElW * factor, 0.02, 2);
        const ratio = drag.startElH / drag.startElW;
        updateElement(slide!.id, drag.elementId, {
          w: newW,
          h: newW * ratio,
        });
      } else if (drag.mode === "rotate") {
        const cx = drag.rect.left + drag.startElX * drag.rect.width;
        const cy = drag.rect.top + drag.startElY * drag.rect.height;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
        const deg = (angle * 180) / Math.PI;
        updateElement(slide!.id, drag.elementId, {
          rotation: Math.round(deg + 90 + drag.startAngle),
        });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, slide, updateElement]);

  // Delete-Taste
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        slide
      ) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        removeElement(slide.id, selectedId);
        setCtxMenu(null);
      }
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, slide, removeElement]);

  // Click außerhalb schließt Kontextmenü
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  if (!slide) {
    return (
      <div className="canvas-area">
        <div className="stage-empty">
          <div>📜 Keine Slide aktiv</div>
          <div className="hint">Erstelle oben rechts eine neue Slide.</div>
        </div>
      </div>
    );
  }

  function startDrag(
    e: React.PointerEvent,
    el: SlideElement,
    mode: DragState["mode"]
  ) {
    e.stopPropagation();
    if (tool !== "select") return;
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    selectElement(el.id);
    let startAngle = 0;
    if (mode === "rotate") {
      const cx = rect.left + el.x * rect.width;
      const cy = rect.top + el.y * rect.height;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      startAngle = -((ang * 180) / Math.PI + 90) + el.rotation;
    }
    setDrag({
      mode,
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startElX: el.x,
      startElY: el.y,
      startElW: el.w,
      startElH: el.h,
      startRot: el.rotation,
      rect,
      startAngle,
    });
  }

  // === Paint-Logik ===
  function paintPos(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const canvas = paintCanvasRef.current!;
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPaintDown(e: React.PointerEvent) {
    if (tool !== "paint") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = paintCtxRef.current!;
    const p = paintPos(e);
    lastPaintPoint.current = p;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = paintColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, paintSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onPaintMove(e: React.PointerEvent) {
    if (tool !== "paint" || !drawingRef.current) return;
    const ctx = paintCtxRef.current!;
    const cur = paintPos(e);
    const last = lastPaintPoint.current!;
    ctx.strokeStyle = paintColor;
    ctx.lineWidth = paintSize;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastPaintPoint.current = cur;
  }

  function onPaintUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPaintPoint.current = null;
    // Gemaltes als Asset + Element abspeichern
    const canvas = paintCanvasRef.current!;
    const dataUrl = canvas.toDataURL("image/png");
    const assetId = `paint-${Date.now().toString(36)}`;
    const asset: Asset = {
      id: assetId,
      name: `Malerei ${new Date().toLocaleTimeString("de-DE")}`,
      src: dataUrl,
      tags: ["paint"],
      transparent: true,
      width: canvas.width,
      height: canvas.height,
    };
    useHostStore.getState().addAsset(asset);
    // Element über die ganze Slide legen
    addElement(slide!.id, {
      type: "paint",
      assetId,
      x: 0.5,
      y: 0.5,
      w: 1,
      h: 1,
    });
    // Canvas leeren für nächsten Strich
    paintCtxRef.current!.clearRect(0, 0, canvas.width, canvas.height);
  }

  // === Text hinzufügen ===
  function addTextAt(center = true) {
    const el = addElement(slide!.id, {
      type: "text",
      text: "Neuer Text",
      fontSize: 0.06,
      color: "#f3ecdb",
      x: center ? 0.5 : 0.3,
      y: center ? 0.5 : 0.3,
      w: 0.5,
      h: 0.1,
    });
    selectElement(el);
  }

  // === Kontextmenü ===
  function openContextMenu(e: React.MouseEvent, el: SlideElement) {
    e.preventDefault();
    e.stopPropagation();
    selectElement(el.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, elementId: el.id });
  }

  async function doBgRemoval(el: SlideElement) {
    if (!el.assetId) return;
    const asset = state.assets.library[el.assetId];
    if (!asset) return;
    setBgRemoving(el.id);
    try {
      const newSrc = await removeBackground(asset.src);
      // Neues Asset erstellen (Original bleibt erhalten)
      const newAssetId = `bg-${Date.now().toString(36)}`;
      const newAsset: Asset = {
        ...asset,
        id: newAssetId,
        name: `${asset.name} (freigestellt)`,
        src: newSrc,
        transparent: true,
        tags: [...new Set([...(asset.tags ?? []), "bg-removed"])],
      };
      useHostStore.getState().addAsset(newAsset);
      // Element auf neues Asset umstellen
      updateElement(slide!.id, el.id, { assetId: newAssetId });
    } catch (err) {
      console.error("[bg-removal] failed:", err);
      alert(
        "Background Removal fehlgeschlagen. Siehe Console für Details."
      );
    } finally {
      setBgRemoving(null);
      setCtxMenu(null);
    }
  }

  function cycleLayer(el: SlideElement) {
    const next =
      el.layer === "back"
        ? "normal"
        : el.layer === "normal"
        ? "front"
        : "back";
    setElementLayer(slide!.id, el.id, next);
  }

  function toggleHighlight(el: SlideElement) {
    updateElement(slide!.id, el.id, { highlighted: !el.highlighted });
  }

  const ctxEl = ctxMenu
    ? slide.elements.find((e) => e.id === ctxMenu.elementId)
    : null;

  return (
    <div className="canvas-area">
      <div className="canvas-toolbar">
        <div className="canvas-tool-group">
          <button
            className={tool === "select" ? "active" : ""}
            onClick={() => setTool("select")}
            title="Auswählen / Verschieben"
          >
            ✋
          </button>
          <button
            className={tool === "paint" ? "active" : ""}
            onClick={() => setTool("paint")}
            title="Malen"
          >
            🖌️
          </button>
          <button onClick={() => addTextAt()} title="Text hinzufügen">
            📝
          </button>
        </div>
        {tool === "paint" && (
          <div className="canvas-paint-controls">
            <input
              type="color"
              value={paintColor}
              onChange={(e) => setPaintColor(e.target.value)}
              className="paint-color-input"
              title="Mal-Farbe"
            />
            <input
              type="range"
              min={2}
              max={40}
              value={paintSize}
              onChange={(e) => setPaintSize(Number(e.target.value))}
              title={`Pinselgröße ${paintSize}px`}
            />
            <span className="muted">{paintSize}px</span>
          </div>
        )}
        <div className="canvas-bg-picker">
          <label className="bg-picker">
            Hintergrund
            <input
              type="color"
              value={
                slide.background.startsWith("#")
                  ? slide.background
                  : "#0d0817"
              }
              onChange={(e) => setBackground(slide.id, e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="stage-wrap">
        <div
          ref={stageRef}
          className={`stage tool-${tool}`}
          style={{ background: slide.background }}
          onPointerDown={() => tool === "select" && selectElement(null)}
          onContextMenu={(e) => {
            // Stage-Rechtsklick ohne Element: nur Standard verhindern
            if (!(e.target as HTMLElement).closest(".el")) {
              e.preventDefault();
            }
          }}
        >
          {elementsSorted(slide).map((el) => {
            const asset = el.assetId
              ? state.assets.library[el.assetId]
              : undefined;
            const selected = el.id === selectedId;
            return (
              <div
                key={el.id}
                className={`el ${selected ? "selected" : ""} ${
                  el.highlighted ? "highlighted" : ""
                } ${el.type}`}
                style={{
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.w * 100}%`,
                  height: `${el.h * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                }}
                onPointerDown={(e) => startDrag(e, el, "move")}
                onContextMenu={(e) => openContextMenu(e, el)}
              >
                {el.type === "image" && asset ? (
                  <img
                    src={asset.src}
                    alt={asset.name}
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : el.type === "paint" && asset ? (
                  <img
                    src={asset.src}
                    alt="Malerei"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                    }}
                  />
                ) : el.type === "text" ? (
                  <div
                    className="el-text"
                    style={{
                      fontSize: `${(el.fontSize ?? 0.06) * 100}cqh`,
                      color: el.color ?? "#f3ecdb",
                      fontFamily: "Cinzel, serif",
                      fontWeight: 700,
                      textAlign: "center",
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      lineHeight: 1.1,
                    }}
                  >
                    {el.text}
                  </div>
                ) : (
                  <div className="el-broken">?</div>
                )}

                {selected && tool === "select" && (
                  <>
                    <div
                      className="handle handle-resize"
                      onPointerDown={(e) => startDrag(e, el, "resize")}
                    />
                    <div
                      className="handle handle-rotate"
                      onPointerDown={(e) => startDrag(e, el, "rotate")}
                    />
                    <button
                      className="handle handle-delete"
                      title="Löschen"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeElement(slide.id, el.id)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {slide.elements.length === 0 && tool === "select" && (
            <div className="stage-empty-content">
              <div className="stage-empty-icon">🖼️</div>
              <div>Ziehe Assets hierher oder male / füge Text hinzu</div>
              <div className="hint">
                Werkzeugleiste oben: ✋ Auswahl · 🖌️ Malen · 📝 Text
              </div>
            </div>
          )}

          {tool === "paint" && (
            <div
              className="paint-hint"
              onPointerDown={onPaintDown}
              onPointerMove={onPaintMove}
              onPointerUp={onPaintUp}
              onPointerLeave={onPaintUp}
            >
              <div>🖌️ Auf die Slide malen — Strich wird freigestellt gespeichert</div>
            </div>
          )}
        </div>
      </div>

      {/* Kontextmenü */}
      {ctxMenu && ctxEl && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-header">
            {ctxEl.type === "image"
              ? "Bild"
              : ctxEl.type === "text"
              ? "Text"
              : "Malerei"}
          </div>
          <button onClick={() => cycleLayer(ctxEl)}>
            📚 Layer: {ctxEl.layer ?? "normal"}
          </button>
          <button onClick={() => toggleHighlight(ctxEl)}>
            {ctxEl.highlighted ? "👁️‍🗨️ Hervorhebung aus" : "✨ Hervorheben"}
          </button>
          {ctxEl.type === "text" && (
            <button
              onClick={() => {
                const txt = prompt("Text bearbeiten:", ctxEl.text ?? "");
                if (txt !== null)
                  updateElement(slide!.id, ctxEl.id, { text: txt });
                setCtxMenu(null);
              }}
            >
              ✏️ Text bearbeiten
            </button>
          )}
          {ctxEl.type === "image" && ctxEl.assetId && (
            <button
              onClick={() => doBgRemoval(ctxEl)}
              disabled={bgRemoving !== null}
            >
              {bgRemoving === ctxEl.id
                ? "⏳ Entferne Hintergrund…"
                : "🪄 Hintergrund entfernen"}
            </button>
          )}
          <button
            className="danger"
            onClick={() => {
              removeElement(slide!.id, ctxEl.id);
              setCtxMenu(null);
            }}
          >
            🗑️ Löschen
          </button>
        </div>
      )}
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
