import type { GameState, Player } from "../shared/types.js";

// Raum-Verwaltung auf dem Server. Der Server ist "dumm":
// er weiß nur, welcher Socket zu welchem Raum gehört, wer Host ist,
// und reicht Nachrichten weiter. Game-State selbst liegt beim Host.

export interface RoomMembership {
  roomCode: string;
  hostSocketId: string;
  members: Map<string, { name: string; isHost: boolean }>; // socketId -> info
  state?: GameState; // letzter bekannter State vom Host (für sehr späte Joins / Reconnects)
}

// roomCode (groß) -> Room
const rooms = new Map<string, RoomMembership>();

// Großbuchstaben-Code generieren (Base32-ähnlich, vermeidet leicht verwechselbare Zeichen)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // kein I,L,O,0,1
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  // Kollision vermeiden
  return rooms.has(code) ? generateRoomCode() : code;
}

export function getRoom(roomCode: string): RoomMembership | undefined {
  return rooms.get(roomCode);
}

export function createRoom(
  roomCode: string,
  hostSocketId: string,
  hostName: string
): RoomMembership {
  const room: RoomMembership = {
    roomCode,
    hostSocketId,
    members: new Map([[hostSocketId, { name: hostName, isHost: true }]]),
  };
  rooms.set(roomCode, room);
  return room;
}

export function joinRoom(
  roomCode: string,
  socketId: string,
  playerName: string
): { room: RoomMembership; created?: boolean } | { error: string } {
  let room = rooms.get(roomCode);
  if (!room) {
    return { error: `Raum ${roomCode} existiert nicht.` };
  }
  if (room.members.size >= 16) {
    // Sicherheits-Cap, echtes Limit prüft der Host anhand state.maxPlayers
    return { error: "Raum ist voll." };
  }
  room.members.set(socketId, { name: playerName, isHost: false });
  return { room };
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
        // Host-Wechsel: ältestes verbleibendes Mitglied wird Host
        const next = room.members.keys().next();
        if (!next.done && next.value) {
          room.hostSocketId = next.value;
          const info = room.members.get(next.value);
          if (info) info.isHost = true;
          newHostId = next.value;
        }
      }
      return { roomCode: code, newHostId, isEmpty: false };
    }
  }
  return { isEmpty: false };
}

export function listPlayers(room: RoomMembership): Player[] {
  // Nur Namen/IDs — echte Player-Objekte kommen vom Host-State.
  // Hier nur Hilfsliste für die Lobby.
  return Array.from(room.members.entries()).map(([socketId, info]) => ({
    id: socketId,
    name: info.name,
    hearts: 0,
    maxHearts: 0,
    inventory: [],
    abilities: [],
  }));
}
