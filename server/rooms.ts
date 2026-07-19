import type { GameState, LobbyMember, Player } from "../shared/types.js";

// Raum-Verwaltung auf dem Server. Zwei Phasen:
// 1. LOBBY: Server führt die Lobby-Liste (roster), Host kann Spieler kicken
//    und das Spiel starten. Clients sehen das Wartezimmer.
// 2. GAME: Host wird autoritativ, broadcastet seinen State. Server cached
//    den letzten State für Reconnects/späte Joins.

export interface RoomConfig {
  roomName: string;
  maxPlayers: number;
  startHearts: number;
}

export interface RoomMembership {
  roomCode: string;
  hostSocketId: string;
  hostName: string;
  config: RoomConfig;
  members: Map<string, LobbyMember>; // socketId -> member
  gameStarted: boolean;
  state?: GameState; // letzter Host-State (für Reconnects)
}

const rooms = new Map<string, RoomMembership>();

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

export function getRoom(roomCode: string): RoomMembership | undefined {
  return rooms.get(roomCode);
}

export function createRoom(
  roomCode: string,
  hostSocketId: string,
  hostName: string,
  config: RoomConfig
): RoomMembership {
  const now = Date.now();
  const room: RoomMembership = {
    roomCode,
    hostSocketId,
    hostName,
    config,
    members: new Map([
      [
        hostSocketId,
        { id: hostSocketId, name: hostName, isHost: true, joinedAt: now },
      ],
    ]),
    gameStarted: false,
  };
  rooms.set(roomCode, room);
  return room;
}

export function joinRoom(
  roomCode: string,
  socketId: string,
  playerName: string
):
  | { room: RoomMembership; member: LobbyMember }
  | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: `Raum ${roomCode} existiert nicht.` };
  if (room.members.size >= room.config.maxPlayers) {
    return { error: "Raum ist voll." };
  }
  const member: LobbyMember = {
    id: socketId,
    name: playerName,
    isHost: false,
    joinedAt: Date.now(),
  };
  room.members.set(socketId, member);
  return { room, member };
}

export function leaveRoom(socketId: string): {
  roomCode?: string;
  newHostId?: string;
  isEmpty: boolean;
} {
  for (const [code, room] of rooms.entries()) {
    if (room.members.has(socketId)) {
      room.members.delete(socketId);
      const wasHost = room.hostSocketId === socketId;

      if (room.members.size === 0) {
        rooms.delete(code);
        return { roomCode: code, isEmpty: true };
      }

      let newHostId: string | undefined;
      if (wasHost) {
        const next = room.members.keys().next();
        if (!next.done && next.value) {
          room.hostSocketId = next.value;
          room.hostName = room.members.get(next.value)!.name;
          room.members.get(next.value)!.isHost = true;
          newHostId = next.value;
        }
      }
      return { roomCode: code, newHostId, isEmpty: false };
    }
  }
  return { isEmpty: false };
}

// Snapshot für Lobby-Broadcast (Map → Array, sortiert nach Join-Reihenfolge).
export function lobbySnapshot(room: RoomMembership) {
  const members = Array.from(room.members.values()).sort(
    (a, b) => a.joinedAt - b.joinedAt
  );
  return {
    roomCode: room.roomCode,
    roomName: room.config.roomName,
    hostName: room.hostName,
    maxPlayers: room.config.maxPlayers,
    startHearts: room.config.startHearts,
    members,
    gameStarted: room.gameStarted,
  };
}

// Hilfsliste (legacy, in M2 nicht mehr direkt verwendet).
export function listPlayers(room: RoomMembership): Player[] {
  return Array.from(room.members.values()).map((m) => ({
    id: m.id,
    name: m.name,
    hearts: 0,
    maxHearts: 0,
    inventory: [],
    abilities: [],
  }));
}
