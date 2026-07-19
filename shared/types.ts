// Geteilte Typen zwischen Server, Host und Clients.

export type PlayerId = string;

// Ein Inventar-Item kann entweder reiner Text oder ein Bild (Asset) sein.
export interface InventoryItem {
  id: string;
  kind: "text" | "image";
  label: string;
  assetId?: string; // bei kind: "image" → Referenz auf assets.library
}

// Spieler-Vorschlag: ein Spieler malt/erstellt etwas und schickt es an den GM.
export interface PlayerSuggestion {
  id: string;
  fromPlayerId: PlayerId;
  fromPlayerName: string;
  assetId: string; // bereits in library
  label: string;
  createdAt: number;
  decided?: "accepted" | "rejected";
}

// Kompletter Suggestion-Payload an den GM (inkl. Asset-Daten).
export interface GmSuggestionPayload extends PlayerSuggestion {
  asset: Asset; // das eigentliche Asset zum Übernehmen
}

export interface Player {
  id: PlayerId;
  name: string;
  hearts: number; // aktuelle HP
  maxHearts: number;
  inventory: InventoryItem[];
  abilities: string[];
}

// Element-Typen auf einer Slide
export type SlideElementType = "image" | "text" | "paint";
export type ElementLayer = "back" | "normal" | "front";

export interface SlideElement {
  id: string;
  type: SlideElementType;
  assetId?: string; // Referenz auf assets.library (image/paint)
  text?: string;
  fontSize?: number; // bei Text (relativ zur Slide-Höhe, 0..1)
  color?: string; // bei Text
  x: number; // Position relativ zur Slide (0..1)
  y: number;
  w: number; // Breite relativ (0..1)
  h: number;
  rotation: number; // Grad
  highlighted?: boolean; // GM-Hervorhebung
  layer?: ElementLayer; // Zeichen-Reihenfolge
}

export interface Slide {
  id: string;
  name: string;
  background: string;
  elements: SlideElement[];
}

export interface Asset {
  id: string;
  name: string;
  src: string; // data-URL oder extern
  tags: string[];
  width?: number;
  height?: number;
  transparent?: boolean; // PNG o.Ä.
}

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
  weight: number;
}

export interface GameState {
  roomCode: string;
  hostId: string;
  hostName: string;
  roomName: string;
  maxPlayers: number;
  startHearts: number;
  players: Player[];
  slides: Slide[];
  activeSlideIndex: number;
  assets: {
    saved: { [roomName: string]: string[] };
    library: { [id: string]: Asset };
  };
  wheel: {
    segments: WheelSegment[];
    lastResult?: string;
    spinning?: boolean;
  };
  die: {
    sides: number;
    history: { player?: string; value: number; at: number }[];
    lastResult?: number;
  };
  // Vorschläge vom Spieler an den GM (inkl. Asset-Daten)
  suggestions: GmSuggestionPayload[];
}

// Leerer State für neue Räume
export function createInitialGameState(
  roomCode: string,
  hostId: string,
  hostName: string,
  roomName: string,
  maxPlayers: number,
  startHearts: number
): GameState {
  return {
    roomCode,
    hostId,
    hostName,
    roomName,
    maxPlayers,
    startHearts,
    players: [
      {
        id: hostId,
        name: hostName,
        hearts: startHearts,
        maxHearts: startHearts,
        inventory: [],
        abilities: [],
      },
    ],
    slides: [],
    activeSlideIndex: 0,
    assets: {
      saved: { [roomName]: [] },
      library: {},
    },
    wheel: {
      segments: [
        { id: "s1", label: "Erfolg", color: "#22c55e", weight: 1 },
        { id: "s2", label: "Fehlschlag", color: "#ef4444", weight: 1 },
      ],
      lastResult: undefined,
      spinning: false,
    },
    die: {
      sides: 20,
      history: [],
      lastResult: undefined,
    },
    suggestions: [],
  };
}

export function createGameStateFromRoster(
  roomCode: string,
  hostId: string,
  hostName: string,
  roomName: string,
  maxPlayers: number,
  startHearts: number,
  roster: { id: string; name: string; isHost: boolean }[]
): GameState {
  const base = createInitialGameState(
    roomCode,
    hostId,
    hostName,
    roomName,
    maxPlayers,
    startHearts
  );
  base.players = roster.map((m) => ({
    id: m.id,
    name: m.name,
    hearts: startHearts,
    maxHearts: startHearts,
    inventory: [],
    abilities: [],
  }));
  return base;
}

// === Socket-Events ===
export interface ServerToClientEvents {
  "room:state": (state: GameState) => void;
  "room:error": (message: string) => void;
  // Lobby-Phase
  "lobby:roster": (payload: {
    roomCode: string;
    roomName: string;
    hostName: string;
    maxPlayers: number;
    startHearts: number;
    members: LobbyMember[];
    gameStarted: boolean;
  }) => void;
  "lobby:kick": (reason: string) => void;
  "game:started": (roster: {
    members: LobbyMember[];
    roomName: string;
    maxPlayers: number;
    startHearts: number;
  }) => void;
  // Player-Phase
  "host:request-state": () => void;
  "player:toast": (toast: {
    kind: "dice" | "wheel" | "info";
    label: string;
    value: string;
  }) => void;
  // Spieler → GM Vorschlag
  "gm:suggestion": (payload: GmSuggestionPayload) => void;
  // Würfel & Glücksrad für alle sichtbar (Live-Broadcast)
  "gm:dice-show": (payload: {
    sides: number;
    value: number | null;
    rolling: boolean;
    player?: string;
  }) => void;
  "gm:dice-hide": () => void;
  "gm:wheel-show": (payload: {
    segments: WheelSegment[];
    rotation: number;
    spinning: boolean;
    result?: string;
  }) => void;
  "gm:wheel-hide": () => void;
}

export interface ClientToServerEvents {
  "host:create": (
    payload: {
      roomName: string;
      maxPlayers: number;
      startHearts: number;
      hostName: string;
    },
    ack: (res: HostCreateAck) => void
  ) => void;
  "player:join": (
    payload: { roomCode: string; playerName: string },
    ack: (res: PlayerJoinAck) => void
  ) => void;
  // Lobby
  "host:start-game": () => void;
  "host:kick": (memberId: string) => void;
  "host:ban": (memberId: string) => void;
  // Game
  "host:state-sync": (state: GameState) => void;
  "host:player-update": (player: Player) => void;
  "host:player-remove": (playerId: string) => void;
  "host:wheel-result": (label: string) => void;
  "host:dice-result": (value: number, sides: number) => void;
  // Würfel & Rad für alle sichtbar
  "host:dice-show": (payload: {
    sides: number;
    value: number | null;
    rolling: boolean;
    player?: string;
  }) => void;
  "host:dice-hide": () => void;
  "host:wheel-show": (payload: {
    segments: WheelSegment[];
    rotation: number;
    spinning: boolean;
    result?: string;
  }) => void;
  "host:wheel-hide": () => void;
  // Spieler schlägt Asset vor
  "player:suggest": (payload: {
    asset: Asset;
    label: string;
  }) => void;
}

export type HostCreateAck =
  | {
      ok: true;
      roomCode: string;
      isHost: true;
      yourId: string;
      maxPlayers: number;
      startHearts: number;
      roomName: string;
    }
  | { ok: false; error: string };

export type PlayerJoinAck =
  | {
      ok: true;
      roomCode: string;
      isHost: false;
      yourId: string;
      gameStarted: boolean;
    }
  | { ok: false; error: string };

export interface LobbyMember {
  id: string; // socketId
  name: string;
  isHost: boolean;
  joinedAt: number;
}
