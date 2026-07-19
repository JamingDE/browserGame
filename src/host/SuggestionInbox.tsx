import { useEffect } from "react";
import { getSocket } from "../net/socket.js";
import { useHostStore } from "../state/store.js";
import { uid } from "../state/store.js";
import type { GmSuggestionPayload, InventoryItem } from "../../shared/types.js";

interface Props {
  onClose: () => void;
}

export function SuggestionInbox({ onClose }: Props) {
  const suggestions = useHostStore((s) => s.state.suggestions);
  const players = useHostStore((s) => s.state.players);
  const addSuggestion = useHostStore((s) => s.addSuggestion);
  const decideSuggestion = useHostStore((s) => s.decideSuggestion);
  const addInventoryItem = useHostStore((s) => s.addInventoryItem);

  // Vorschläge vom Server empfangen
  useEffect(() => {
    const sock = getSocket();
    const onSuggestion = (payload: GmSuggestionPayload) => {
      addSuggestion(payload);
    };
    sock.on("gm:suggestion", onSuggestion);
    return () => {
      sock.off("gm:suggestion", onSuggestion);
    };
  }, [addSuggestion]);

  function accept(sug: GmSuggestionPayload) {
    decideSuggestion(sug.id, "accepted");
  }

  function acceptToInventory(sug: GmSuggestionPayload) {
    decideSuggestion(sug.id, "accepted");
    if (players.length === 0) return;
    const targetName = prompt("An welchen Spieler?", players[0]?.name ?? "");
    const target = players.find(
      (p) => p.name.toLowerCase() === (targetName ?? "").toLowerCase()
    );
    if (!target) {
      alert("Spieler nicht gefunden.");
      return;
    }
    const item: Omit<InventoryItem, "id"> = {
      kind: "image",
      label: sug.label,
      assetId: sug.asset.id,
    };
    addInventoryItem(target.id, item);
  }

  function reject(sug: GmSuggestionPayload) {
    decideSuggestion(sug.id, "rejected");
  }

  // Nach Status sortieren: unentschieden oben
  const sorted = [...suggestions].sort((a, b) => {
    if (!!a.decided === !!b.decided) return b.createdAt - a.createdAt;
    return a.decided ? 1 : -1;
  });

  return (
    <div className="modal-overlay" onPointerDown={onClose}>
      <div
        className="modal-card inbox-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>📥 Spieler-Vorschläge</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="inbox-body">
          {sorted.length === 0 && (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>
              Noch keine Vorschläge. Spieler können Items malen und dir
              vorschlagen.
            </div>
          )}

          {sorted.map((sug) => {
            const decided = sug.decided;
            return (
              <div
                key={sug.id + uid("x")}
                className={`inbox-item ${decided ?? ""}`}
              >
                <img
                  src={sug.asset.src}
                  alt={sug.label}
                  className="inbox-thumb"
                />
                <div className="inbox-info">
                  <div className="inbox-label">{sug.label}</div>
                  <div className="muted">
                    von <strong>{sug.fromPlayerName}</strong> ·{" "}
                    {new Date(sug.createdAt).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {!decided && (
                  <div className="inbox-actions">
                    <button
                      className="primary"
                      onClick={() => accept(sug)}
                      title="Asset übernehmen"
                    >
                      ✓ Übernehmen
                    </button>
                    <button
                      onClick={() => acceptToInventory(sug)}
                      title="In Inventar eines Spielers legen"
                    >
                      🎒 Ins Inventar
                    </button>
                    <button
                      className="danger"
                      onClick={() => reject(sug)}
                    >
                      ✕ Ablehnen
                    </button>
                  </div>
                )}
                {decided === "accepted" && (
                  <div className="inbox-decided accept">✓ Angenommen</div>
                )}
                {decided === "rejected" && (
                  <div className="inbox-decided reject">✕ Abgelehnt</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
