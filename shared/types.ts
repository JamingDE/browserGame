// Geteilte Typen zwischen Server, Host und Clients.
// NICHT in src/ oder server/ — wird von beiden benutzt.

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  hearts: number; // aktuelle HP
  maxHearts: number; // (für Anzeige der leeren Herzen)
  inventory: string[]; // Items als Strings, vorerst frei Text
  abilities: string[]; // Fähigkeiten als Strings
}

export interface SlideElement {
  id: string;
  type: "image" | "text";
  assetId?: string; // Referenz auf assets.library
  text?: string;
  x: number; // Position relativ zur Slide (0..1)
  y: number;
  w: number; // Breite relativ (0..1)
  h: number;
  rotation: number; // Grad
}

export interface Slide {
  id: string;
  name: string;
  background: string; // Farbe oder "transparent"
  elements: SlideElement[];
}

export interface Asset {
  id: string;
  name: string;
  src: string; // data-URL oder extern
  tags: string[];
  width?: number;
  height?: number;
}

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
  weight: number; // Wahrscheinlichkeits-Gewicht
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
    saved: { [roomName: string]: string[] }; // assetIds pro Raum-Name
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
  };
}

// === Socket-Events ===
export interface ServerToClientEvents {
  "room:state": (state: GameState) => void;
  "room:joined": (info: { roomCode: string; isHost: boolean; yourId: string }) => void;
  "room:error": (message: string) => void;
  "room:player-joined": (player: Player) => void;
  "room:player-left": (playerId: string) => void;
  "host:request-state": () => void; // Server bittet Host um aktuellen State (z.B. neuer Spieler joinen)
  "player:toast": (toast: { kind: "dice" | "wheel"; label: string; value: string }) => void;
}

// Ack-Antworten vom Server an den Sender.
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
  | { ok: true; roomCode: string; isHost: false; yourId: string }
  | { ok: false; error: string };

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
  "host:state-sync": (state: GameState) => void;
  "host:player-update": (player: Player) => void;
  "host:player-remove": (playerId: string) => void;
  "host:wheel-result": (label: string) => void;
  "host:dice-result": (value: number, sides: number) => void;
}
