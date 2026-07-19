import { useEffect, useRef, useState } from "react";
import { useActiveSlide, useHostStore } from "../state/store.js";
import type { SlideElement } from "../../shared/types.js";

interface DragState {
  mode: "move" | "resize" | "rotate";
  elementId: string;
  // Pointer-Start
  startX: number;
  startY: number;
  // Element-Werte bei Start (relativ 0..1)
  startElX: number;
  startElY: number;
  startElW: number;
  startElH: number;
  startRot: number;
  // Slide-Rect für Umrechnung
  rect: DOMRect;
  // Rotation: Winkel vom Element-Zentrum zum Pointer bei Start
  startAngle: number;
}

export function SlideCanvas() {
  const slide = useActiveSlide();
  const state = useHostStore((s) => s.state);
  const updateElement = useHostStore((s) => s.updateElement);
  const removeElement = useHostStore((s) => s.removeElement);
  const selectElement = useHostStore((s) => s.selectElement);
  const selectedId = useHostStore((s) => s.selectedElementId);
  const setBackground = useHostStore((s) => s.setBackground);

  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Drag-Loop via window-listener (damit Maus außerhalb nicht abbricht)
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
        // Skalierung proportional (Eck-Resize)
        const factor = Math.max(
          0.05,
          Math.max(Math.abs(dx), Math.abs(dy)) * 2 + 1
        );
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
        // +90 weil 0° unseres Rotation-Punkts oben ist
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

  // Delete-Taste löscht ausgewähltes Element
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        slide
      ) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        removeElement(slide.id, selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, slide, removeElement]);

  if (!slide) {
    return (
      <div className="stage-empty">
        <div>📜 Keine Slide aktiv</div>
        <div className="hint">Erstelle oben rechts eine neue Slide.</div>
      </div>
    );
  }

  function startDrag(
    e: React.PointerEvent,
    el: SlideElement,
    mode: DragState["mode"]
  ) {
    e.stopPropagation();
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

  return (
    <div className="canvas-area">
      <div className="canvas-toolbar">
        <span className="muted">{slide.name}</span>
        <label className="bg-picker">
          Hintergrund
          <input
            type="color"
            value={slide.background.startsWith("#") ? slide.background : "#0d0817"}
            onChange={(e) => setBackground(slide.id, e.target.value)}
          />
        </label>
      </div>

      <div className="stage-wrap">
        {/* 16:9 Stage */}
        <div
          ref={stageRef}
          className="stage"
          style={{ background: slide.background }}
          onPointerDown={() => selectElement(null)}
        >
          {slide.elements.map((el) => {
            const asset = el.assetId
              ? state.assets.library[el.assetId]
              : undefined;
            const selected = el.id === selectedId;
            return (
              <div
                key={el.id}
                className={`el ${selected ? "selected" : ""}`}
                style={{
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.w * 100}%`,
                  height: `${el.h * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                }}
                onPointerDown={(e) => startDrag(e, el, "move")}
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
                ) : el.type === "text" ? (
                  <div className="el-text">{el.text ?? "Text"}</div>
                ) : (
                  <div className="el-broken">?</div>
                )}

                {selected && (
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

          {slide.elements.length === 0 && (
            <div className="stage-empty-content">
              <div className="stage-empty-icon">🖼️</div>
              <div>Ziehe Assets aus dem Browser hierher</div>
              <div className="hint">
                Oder klicke ein Suchergebnis an, um es zu platzieren.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
