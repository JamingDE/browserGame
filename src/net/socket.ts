import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../shared/types.js";

// Socket.IO-Client-Wrapper. Single shared instance.
// In Dev: Vite-Proxy leitet /socket.io → :3001 weiter (siehe vite.config.ts).
// In Prod: Express serviert alles auf dem gleichen Origin.

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
