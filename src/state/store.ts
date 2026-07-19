import { create } from "zustand";
import { getSocket } from "../net/socket.js";
import {
  createGameStateFromRoster,
  type Asset,
  type GameState,
  type GmSuggestionPayload,
  type InventoryItem,
  type Player,
  type Slide,
  type SlideElement,
  type SlideElementType,
  type ElementLayer,
  type WheelSegment,
} from "../../shared/types.js";

// === IDs ===
let idCounter = 0;
export function uid(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// === Sync-Helper ===
let syncScheduled = false;
function scheduleSync(get: () => HostStore) {
  if (syncScheduled) return;
  syncScheduled = true;
  setTimeout(() => {
    syncScheduled = false;
    const sock = getSocket();
    sock.emit("host:state-sync", get().state);
  }, 30);
}

interface InitParams {
  roomCode: string;
  hostId: string;
  hostName: string;
  roomName: string;
  maxPlayers: number;
  startHearts: number;
  roster: { id: string; name: string; isHost: boolean }[];
}

interface HostStore {
  state: GameState;
  selectedElementId: string | null;

  init: (params: InitParams) => void;

  // Slides
  addSlide: () => void;
  removeSlide: (slideId: string) => void;
  renameSlide: (slideId: string, name: string) => void;
  setBackground: (slideId: string, color: string) => void;
  setActiveSlide: (index: number) => void;
  duplicateSlide: (slideId: string) => void;

  // Elements (allgemein)
  addElement: (
    slideId: string,
    el: Partial<SlideElement> & { type: SlideElementType }
  ) => string;
  updateElement: (
    slideId: string,
    elementId: string,
    patch: Partial<SlideElement>
  ) => void;
  removeElement: (slideId: string, elementId: string) => void;
  selectElement: (elementId: string | null) => void;

  // Element-Layer
  setElementLayer: (
    slideId: string,
    elementId: string,
    layer: ElementLayer
  ) => void;

  // Assets
  addAsset: (asset: Asset) => void;
  saveAssetToRoom: (assetId: string) => void;
  updateAsset: (assetId: string, patch: Partial<Asset>) => void;

  // Players
  updatePlayer: (playerId: string, patch: Partial<Player>) => void;
  addInventoryItem: (
    playerId: string,
    item: Omit<InventoryItem, "id">
  ) => void;
  removeInventoryItem: (playerId: string, itemId: string) => void;
  addAbility: (playerId: string, ability: string) => void;
  removeAbility: (playerId: string, index: number) => void;

  // Wheel
  setWheelSegments: (segments: WheelSegment[]) => void;
  setWheelSpinning: (spinning: boolean) => void;
  setWheelResult: (label: string | undefined) => void;

  // Dice
  setDiceSides: (sides: number) => void;
  rollDice: (playerName?: string) => number;
  clearDiceHistory: () => void;

  // Suggestions
  addSuggestion: (suggestion: GmSuggestionPayload) => void;
  decideSuggestion: (suggestionId: string, decision: "accepted" | "rejected") => void;

  // Sync
  sync: () => void;
}

// Layer-Sortierung: back < normal < front
function layerOrder(l?: ElementLayer): number {
  if (l === "back") return 0;
  if (l === "front") return 2;
  return 1;
}

export const useHostStore = create<HostStore>((set, get) => ({
  state: createGameStateFromRoster(
    "init",
    "init",
    "Game Master",
    "Temporär",
    4,
    5,
    [{ id: "init", name: "Game Master", isHost: true }]
  ),
  selectedElementId: null,

  init: (params) =>
    set({
      state: createGameStateFromRoster(
        params.roomCode,
        params.hostId,
        params.hostName,
        params.roomName,
        params.maxPlayers,
        params.startHearts,
        params.roster
      ),
      selectedElementId: null,
    }),

  // === Slides ===
  addSlide: () => {
    const id = uid("slide");
    const slide: Slide = {
      id,
      name: `Slide ${get().state.slides.length + 1}`,
      background: "#0d0817",
      elements: [],
    };
    set((s) => ({
      state: {
        ...s.state,
        slides: [...s.state.slides, slide],
        activeSlideIndex: s.state.slides.length,
      },
    }));
    scheduleSync(get);
  },

  removeSlide: (slideId) =>
    set((s) => {
      if (s.state.slides.length <= 1) return s;
      const slides = s.state.slides.filter((sl) => sl.id !== slideId);
      const activeSlideIndex = Math.min(
        s.state.activeSlideIndex,
        slides.length - 1
      );
      return { state: { ...s.state, slides, activeSlideIndex } };
    }),

  renameSlide: (slideId, name) =>
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId ? { ...sl, name } : sl
        ),
      },
    })),

  setBackground: (slideId, color) => {
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId ? { ...sl, background: color } : sl
        ),
      },
    }));
    scheduleSync(get);
  },

  setActiveSlide: (index) => {
    set((s) => ({ state: { ...s.state, activeSlideIndex: index } }));
    scheduleSync(get);
  },

  duplicateSlide: (slideId) =>
    set((s) => {
      const src = s.state.slides.find((sl) => sl.id === slideId);
      if (!src) return s;
      const copy: Slide = {
        ...src,
        id: uid("slide"),
        name: `${src.name} (Kopie)`,
        elements: src.elements.map((el) => ({ ...el, id: uid("el") })),
      };
      const idx = s.state.slides.findIndex((sl) => sl.id === slideId);
      const slides = [...s.state.slides];
      slides.splice(idx + 1, 0, copy);
      return { state: { ...s.state, slides, activeSlideIndex: idx + 1 } };
    }),

  // === Elements ===
  addElement: (slideId, el) => {
    const id = uid("el");
    const full: SlideElement = {
      id,
      type: el.type,
      assetId: el.assetId,
      text: el.text,
      fontSize: el.fontSize,
      color: el.color,
      x: el.x ?? 0.5,
      y: el.y ?? 0.5,
      w: el.w ?? (el.type === "text" ? 0.5 : 0.2),
      h: el.h ?? (el.type === "text" ? 0.1 : 0.2),
      rotation: el.rotation ?? 0,
      highlighted: false,
      layer: "normal",
    };
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId ? { ...sl, elements: [...sl.elements, full] } : sl
        ),
      },
      selectedElementId: id,
    }));
    scheduleSync(get);
    return id;
  },

  updateElement: (slideId, elementId, patch) => {
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                elements: sl.elements.map((el) =>
                  el.id === elementId ? { ...el, ...patch } : el
                ),
              }
            : sl
        ),
      },
    }));
    scheduleSync(get);
  },

  removeElement: (slideId, elementId) =>
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                elements: sl.elements.filter((e) => e.id !== elementId),
              }
            : sl
        ),
      },
      selectedElementId:
        s.selectedElementId === elementId ? null : s.selectedElementId,
    })),
  selectElement: (elementId) => set({ selectedElementId: elementId }),

  setElementLayer: (slideId, elementId, layer) => {
    set((s) => ({
      state: {
        ...s.state,
        slides: s.state.slides.map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                elements: sl.elements.map((el) =>
                  el.id === elementId ? { ...el, layer } : el
                ),
              }
            : sl
        ),
      },
    }));
    scheduleSync(get);
  },

  // === Assets ===
  addAsset: (asset) => {
    set((s) => ({
      state: {
        ...s.state,
        assets: {
          ...s.state.assets,
          library: { ...s.state.assets.library, [asset.id]: asset },
        },
      },
    }));
    scheduleSync(get);
  },

  saveAssetToRoom: (assetId) => {
    set((s) => {
      const roomName = s.state.roomName;
      const current = s.state.assets.saved[roomName] ?? [];
      if (current.includes(assetId)) return s;
      return {
        state: {
          ...s.state,
          assets: {
            ...s.state.assets,
            saved: {
              ...s.state.assets.saved,
              [roomName]: [...current, assetId],
            },
          },
        },
      };
    });
    scheduleSync(get);
  },

  updateAsset: (assetId, patch) => {
    set((s) => {
      const existing = s.state.assets.library[assetId];
      if (!existing) return s;
      return {
        state: {
          ...s.state,
          assets: {
            ...s.state.assets,
            library: {
              ...s.state.assets.library,
              [assetId]: { ...existing, ...patch },
            },
          },
        },
      };
    });
    scheduleSync(get);
  },

  // === Players ===
  updatePlayer: (playerId, patch) => {
    set((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          p.id === playerId ? { ...p, ...patch } : p
        ),
      },
    }));
    scheduleSync(get);
  },

  addInventoryItem: (playerId, item) => {
    set((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                inventory: [...p.inventory, { ...item, id: uid("inv") }],
              }
            : p
        ),
      },
    }));
    scheduleSync(get);
  },

  removeInventoryItem: (playerId, itemId) => {
    set((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                inventory: p.inventory.filter((it) => it.id !== itemId),
              }
            : p
        ),
      },
    }));
    scheduleSync(get);
  },

  addAbility: (playerId, ability) => {
    if (!ability.trim()) return;
    set((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          p.id === playerId
            ? { ...p, abilities: [...p.abilities, ability.trim()] }
            : p
        ),
      },
    }));
    scheduleSync(get);
  },

  removeAbility: (playerId, index) => {
    set((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          p.id === playerId
            ? { ...p, abilities: p.abilities.filter((_, i) => i !== index) }
            : p
        ),
      },
    }));
    scheduleSync(get);
  },

  // === Wheel ===
  setWheelSegments: (segments) => {
    set((s) => ({
      state: { ...s.state, wheel: { ...s.state.wheel, segments } },
    }));
    scheduleSync(get);
  },
  setWheelSpinning: (spinning) => {
    set((s) => ({
      state: { ...s.state, wheel: { ...s.state.wheel, spinning } },
    }));
    scheduleSync(get);
  },
  setWheelResult: (label) => {
    set((s) => ({
      state: { ...s.state, wheel: { ...s.state.wheel, lastResult: label } },
    }));
    scheduleSync(get);
  },

  // === Dice ===
  setDiceSides: (sides) => {
    set((s) => ({ state: { ...s.state, die: { ...s.state.die, sides } } }));
    scheduleSync(get);
  },
  rollDice: (playerName) => {
    const sides = get().state.die.sides;
    const value = Math.floor(Math.random() * sides) + 1;
    set((s) => ({
      state: {
        ...s.state,
        die: {
          ...s.state.die,
          lastResult: value,
          history: [
            { player: playerName, value, at: Date.now() },
            ...s.state.die.history,
          ].slice(0, 50),
        },
      },
    }));
    scheduleSync(get);
    getSocket().emit("host:dice-result", value, sides);
    return value;
  },
  clearDiceHistory: () => {
    set((s) => ({
      state: { ...s.state, die: { ...s.state.die, history: [] } },
    }));
    scheduleSync(get);
  },

  // === Suggestions ===
  addSuggestion: (suggestion) => {
    set((s) => ({
      state: {
        ...s.state,
        // Asset in library aufnehmen, damit der Host es benutzen kann
        assets: {
          ...s.state.assets,
          library: {
            ...s.state.assets.library,
            [suggestion.asset.id]: suggestion.asset,
          },
        },
        suggestions: [suggestion, ...s.state.suggestions].slice(0, 50),
      },
    }));
    // Kein sync nötig — Suggestion ist Host-Only, Spieler sehen ihren
    // eigenen Bogen. Entschieden wird via updatePlayer etc.
  },

  decideSuggestion: (suggestionId, decision) => {
    set((s) => ({
      state: {
        ...s.state,
        suggestions: s.state.suggestions.map((sg) =>
          sg.id === suggestionId ? { ...sg, decided: decision } : sg
        ),
      },
    }));
    scheduleSync(get);
  },

  sync: () => scheduleSync(get),
}));

// === Hilfs-Selektoren ===
// Gibt Elemente sortiert nach Layer (back zuerst) zurück.
export function elementsSorted(slide: Slide): SlideElement[] {
  return [...slide.elements].sort(
    (a, b) => layerOrder(a.layer) - layerOrder(b.layer)
  );
}

export function useActiveSlide(): Slide | null {
  return useHostStore((s) => s.state.slides[s.state.activeSlideIndex] ?? null);
}
