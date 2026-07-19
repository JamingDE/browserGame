import { useEffect, useRef, useState } from "react";
import { getSocket } from "../net/socket.js";
import { useHostStore } from "../state/store.js";
import { uid } from "../state/store.js";
import type { WheelSegment } from "../../shared/types.js";

interface Props {
  onClose: () => void;
}

const COLORS = [
  "#a855f7",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#60a5fa",
  "#ef4444",
  "#e0b15e",
  "#14b8a6",
];

export function WheelModal({ onClose }: Props) {
  const segments = useHostStore((s) => s.state.wheel.segments);
  const setSegments = useHostStore((s) => s.setWheelSegments);
  const setWheelSpinning = useHostStore((s) => s.setWheelSpinning);
  const setWheelResult = useHostStore((s) => s.setWheelResult);

  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Segmente editieren
  function addSegment() {
    const color = COLORS[segments.length % COLORS.length];
    setSegments([
      ...segments,
      { id: uid("seg"), label: `Option ${segments.length + 1}`, color, weight: 1 },
    ]);
  }
  function updateSegment(id: string, patch: Partial<WheelSegment>) {
    setSegments(segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSegment(id: string) {
    if (segments.length <= 2) return;
    setSegments(segments.filter((s) => s.id !== id));
  }

  // Gewichtete Zufallsauswahl
  function pickWeighted(): { segment: WheelSegment; index: number } {
    const total = segments.reduce((sum, s) => sum + Math.max(0.01, s.weight), 0);
    let r = Math.random() * total;
    for (let i = 0; i < segments.length; i++) {
      r -= Math.max(0.01, segments[i].weight);
      if (r <= 0) return { segment: segments[i], index: i };
    }
    return { segment: segments[segments.length - 1], index: segments.length - 1 };
  }

  // === Render: Glücksrad auf Canvas ===
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const size = c.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    if (segments.length === 0) {
      ctx.fillStyle = "var(--text-dim)";
      ctx.font = "16px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Keine Segmente", cx, cy);
      return;
    }

    const total = segments.reduce((sum, s) => sum + Math.max(0.01, s.weight), 0);
    let angle = rotation - Math.PI / 2; // Start oben (Zeiger oben)

    for (const seg of segments) {
      const slice = (Math.max(0.01, seg.weight) / total) * Math.PI * 2;
      // Segment füllen
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle + slice / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "white";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      const label =
        seg.label.length > 16 ? seg.label.slice(0, 15) + "…" : seg.label;
      ctx.fillText(label, radius - 14, 5);
      ctx.restore();

      angle += slice;
    }

    // Zeiger oben
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx - 12, -4 + 16);
    ctx.lineTo(cx + 12, -4 + 16);
    ctx.closePath();
    ctx.fillStyle = "#f7d77a";
    ctx.strokeStyle = "#1a0e2e";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [segments, rotation]);

  function spin() {
    if (spinning || segments.length === 0) return;
    setSpinning(true);
    setWheelSpinning(true);
    const { segment, index } = pickWeighted();

    // Winkel vom index berechnen: der Mitte des gewählten Segments
    // muss am Zeiger (oben) landen.
    const total = segments.reduce(
      (sum, s) => sum + Math.max(0.01, s.weight),
      0
    );
    let cumulative = 0;
    for (let i = 0; i < index; i++) {
      cumulative += Math.max(0.01, segments[i].weight);
    }
    const sliceMid = (cumulative + Math.max(0.01, segment.weight) / 2) / total;
    // Zielrotation: Segment-Mitte kommt nach oben (0°)
    const targetAngle = -sliceMid * Math.PI * 2;
    // Aktuelle Rotation (mod 2π) + 6 volle Umdrehungen + Ziel
    const currentMod = rotation % (Math.PI * 2);
    const newRotation =
      rotation - currentMod + Math.PI * 2 * 6 + targetAngle;

    // Animation über setRotation
    const start = performance.now();
    const duration = 4200;
    const startRot = rotation;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setRotation(startRot + (newRotation - startRot) * eased);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setWheelSpinning(false);
        setWheelResult(segment.label);
        setLastResult(segment.label);
        getSocket().emit("host:wheel-result", segment.label);
      }
    };
    requestAnimationFrame(animate);
  }

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <div
        className="modal-card wheel-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>🎡 Glücksrad</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="wheel-body">
          <div className="wheel-stage">
            <canvas ref={canvasRef} width={320} height={320} className="wheel-canvas" />
            {lastResult && (
              <div className="wheel-result">
                <span className="muted">Ergebnis:</span>
                <strong>{lastResult}</strong>
              </div>
            )}
            <button
              className="primary wheel-spin"
              onClick={spin}
              disabled={spinning || segments.length === 0}
            >
              {spinning ? "Dreht…" : "🎯 Drehen!"}
            </button>
          </div>

          <div className="wheel-edit">
            <div className="wheel-edit-head">
              <h4>Segmente bearbeiten</h4>
              <button className="ghost" onClick={addSegment}>
                + Segment
              </button>
            </div>
            <div className="wheel-segs">
              {segments.map((seg, i) => (
                <div key={seg.id} className="wheel-seg">
                  <input
                    type="color"
                    value={seg.color}
                    onChange={(e) =>
                      updateSegment(seg.id, { color: e.target.value })
                    }
                    className="seg-color"
                  />
                  <input
                    value={seg.label}
                    onChange={(e) =>
                      updateSegment(seg.id, { label: e.target.value })
                    }
                    className="seg-label"
                    placeholder={`Option ${i + 1}`}
                  />
                  <div className="seg-weight">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={seg.weight}
                      onChange={(e) =>
                        updateSegment(seg.id, {
                          weight: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      title="Wahrscheinlichkeit (Gewicht)"
                    />
                  </div>
                  <button
                    className="ab-mini danger"
                    onClick={() => removeSegment(seg.id)}
                    disabled={segments.length <= 2}
                    title="Entfernen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="hint">
              Gewicht = relative Wahrscheinlichkeit. Höher = häufiger. Mind. 2
              Segmente.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
