import { useEffect, useRef, useState } from "react";
import { canvasStrokeToDataUrl } from "../utils/image.js";

interface Props {
  width?: number;
  height?: number;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
  doneLabel?: string;
}

const COLORS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#60a5fa",
  "#a855f7",
  "#ec4899",
  "#92400e",
  "#94a3b8",
];

export function SketchPad({
  width = 640,
  height = 440,
  onDone,
  onCancel,
  doneLabel = "Fertig",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(6);
  const [eraser, setEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  function getCanvasPos(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    return { x, y };
  }

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPoint.current = getCanvasPos(e);
    // Punkt malen (für einzelne Taps)
    const ctx = ctxRef.current!;
    ctx.beginPath();
    ctx.fillStyle = eraser ? "rgba(0,0,0,1)" : color;
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.arc(lastPoint.current.x, lastPoint.current.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current!;
    const cur = getCanvasPos(e);
    const last = lastPoint.current!;
    ctx.beginPath();
    ctx.strokeStyle = eraser ? "rgba(0,0,0,1)" : color;
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastPoint.current = cur;
  }

  function onUp() {
    drawingRef.current = false;
    lastPoint.current = null;
  }

  function clearAll() {
    const ctx = ctxRef.current!;
    ctx.clearRect(0, 0, width, height);
  }

  function done() {
    const canvas = canvasRef.current!;
    onDone(canvasStrokeToDataUrl(canvas));
  }

  return (
    <div className="sketchpad">
      <div className="sketchpad-toolbar">
        <div className="sketch-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`sketch-color ${color === c && !eraser ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setEraser(false);
            }}
            className="sketch-custom-color"
            title="Eigene Farbe"
          />
        </div>
        <div className="sketch-tools">
          <button
            className={eraser ? "active" : ""}
            onClick={() => setEraser(true)}
            title="Radierer"
          >
            🩹
          </button>
          <label className="sketch-size">
            <span className="muted"> Pinsel</span>
            <input
              type="range"
              min={2}
              max={48}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
            <span className="muted">{brushSize}px</span>
          </label>
          <button onClick={clearAll} title="Alles löschen">
            🗑️
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="sketch-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="sketch-actions">
        <button className="ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="primary" onClick={done}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
