import { useEffect, useState } from "react";
import { getSocket } from "../net/socket.js";

export interface ToastItem {
  id: number;
  kind: "dice" | "wheel";
  label: string;
  value: string;
}

let counter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const sock = getSocket();
    const handler = (t: Omit<ToastItem, "id">) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 4500);
    };
    sock.on("player:toast", handler);
    return () => {
      sock.off("player:toast", handler);
    };
  }, []);

  return toasts;
}

export function ToastStack() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="icon">
            {t.kind === "dice" ? "🎲" : "🎡"}
          </span>
          <div>
            <div className="label">{t.label}</div>
            <div className="value">{t.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
