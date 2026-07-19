import { create } from "zustand";
import { getSocket } from "../net/socket.js";
import {
  createInitialGameState,
  type Asset,
  type GameState,
  type Slide,
  type SlideElement,
} from "../../shared/types.js";

// === IDs ===
let idCounter = 0;
export function uid(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// === Sync-Helper ===
// Stellt sicher, dass nicht bei jeder Mikro-Änderung gesynced wird.
let syncScheduled = false;
function scheduleSync(get: () => HostStore) {
  if (syncScheduled) return;
  syncScheduled = true;
  // ~30ms debounce = flüssig, aber nicht spammy
  setTimeout(() => {
    syncScheduled = false;
    const sock = getSocket();
    sock.emit("host:state-sync", get().state);
  }, 30);
}

interface HostStore {
  state: GameState;
  selectedElementId: string | null;

  // Initialisierung
  init: (params: {
    roomCode: string;
    hostId: string;
    hostName: string;
    roomName: string;
    maxPlayers: number;
    startHearts: number;
  }) => void;

  // Slides
  addSlide: () => void;
  removeSlide: (slideId: string) => void;
  renameSlide: (slideId: string, name: string) => void;
  setBackground: (slideId: string, color: string) => void;
  setActiveSlide: (index: number) => void;
  duplicateSlide: (slideId: string) => void;

  // Elements
  addElement: (slideId: string, el: Partial<SlideElement> & { type: SlideElement["type"] }) => string;
  updateElement: (slideId: string, elementId: string, patch: Partial<SlideElement>) => void;
  removeElement: (slideId: string, elementId: string) => void;
  selectElement: (elementId: string | null) => void;

  // Assets
  addAsset: (asset: Asset) => void;
  saveAssetToRoom: (assetId: string) => void;

  // Sync
  sync: () => void;
}

export const useHostStore = create<HostStore>((set, get) => ({
  state: createInitialGameState("init", "init", "Game Master", "Temporär", 4, 5),
  selectedElementId: null,

  init: (params) =>
    set({
      state: createInitialGameState(
        params.roomCode,
        params.hostId,
        params.hostName,
        params.roomName,
        params.maxPlayers,
        params.startHearts
      ),
      selectedElementId: null,
    }),

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
      const activeSlideIndex = Math.min(s.state.activeSlideIndex, slides.length - 1);
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

  addElement: (slideId, el) => {
    const id = uid("el");
    const full: SlideElement = {
      id,
      type: el.type,
      assetId: el.assetId,
      text: el.text,
      x: el.x ?? 0.4,
      y: el.y ?? 0.4,
      w: el.w ?? 0.2,
      h: el.h ?? 0.2,
      rotation: el.rotation ?? 0,
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
            ? { ...sl, elements: sl.elements.filter((e) => e.id !== elementId) }
            : sl
        ),
      },
      selectedElementId:
        s.selectedElementId === elementId ? null : s.selectedElementId,
    })),
  selectElement: (elementId) => set({ selectedElementId: elementId }),

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

  sync: () => scheduleSync(get),
}));

// === Hilfs-Selektoren ===
export function useActiveSlide(): Slide | null {
  return useHostStore((s) => s.state.slides[s.state.activeSlideIndex] ?? null);
}
