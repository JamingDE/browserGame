import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types.js";
import {
  createRoom,
  generateRoomCode,
  getRoom,
  joinRoom,
  leaveRoom,
  lobbySnapshot,
} from "./rooms.js";
import { imageProxyRouter } from "./imageProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const isProd = process.env.NODE_ENV === "production";

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024,
});

app.use(express.json({ limit: "10mb" }));
app.use("/api", imageProxyRouter);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

if (isProd) {
  const dist = path.resolve(__dirname, "../../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

// Hilfsfunktion: Socket → Room finden
function findRoomBySocket(socketId: string) {
  for (const code of io.sockets.adapter.rooms.keys()) {
    if (code.length !== 4 || code !== code.toUpperCase()) continue;
    const set = io.sockets.adapter.rooms.get(code);
    if (set?.has(socketId)) return getRoom(code);
  }
  return undefined;
}

// Lobby-Roster an alle Mitglieder eines Raums broadcasten
function broadcastRoster(roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit("lobby:roster", lobbySnapshot(room));
}

io.on("connection", (socket) => {
  console.log(`[io] connect ${socket.id}`);

  // === Host erstellt Raum ===
  socket.on("host:create", (payload, ack) => {
    const roomCode = generateRoomCode();
    createRoom(roomCode, socket.id, payload.hostName, {
      roomName: payload.roomName,
      maxPlayers: payload.maxPlayers,
      startHearts: payload.startHearts,
    });
    socket.join(roomCode);
    console.log(`[room] created ${roomCode} host=${socket.id}`);
    ack({
      ok: true,
      roomCode,
      isHost: true,
      yourId: socket.id,
      maxPlayers: payload.maxPlayers,
      startHearts: payload.startHearts,
      roomName: payload.roomName,
    });
    broadcastRoster(roomCode);
  });

  // === Spieler joint ===
  socket.on("player:join", (payload, ack) => {
    const result = joinRoom(
      payload.roomCode.toUpperCase(),
      socket.id,
      payload.playerName
    );
    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }
    const { room } = result;
    socket.join(room.roomCode);
    ack({
      ok: true,
      roomCode: room.roomCode,
      isHost: false,
      yourId: socket.id,
      gameStarted: room.gameStarted,
    });
    broadcastRoster(room.roomCode);
    // Falls das Spiel schon läuft: Host um aktuellen State bitten
    if (room.gameStarted) {
      io.to(room.hostSocketId).emit("host:request-state");
    }
    console.log(
      `[room] ${socket.id} joined ${room.roomCode} (members=${room.members.size})`
    );
  });

  // === Host startet das Spiel ===
  socket.on("host:start-game", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    room.gameStarted = true;
    // Allen Bescheid sagen: Lobby-Phase ist vorbei
    io.to(room.roomCode).emit("game:started");
    console.log(`[room] ${room.roomCode} game started`);
  });

  // === Host kickt einen Spieler (in der Lobby) ===
  socket.on("host:kick", (memberId) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (memberId === socket.id) return; // sich selbst nicht kicken
    io.to(memberId).emit("lobby:kick", "Du wurdest vom Host entfernt.");
    io.sockets.sockets.get(memberId)?.disconnect(true);
  });

  // === Host broadcastet aktuellen Game-State ===
  socket.on("host:state-sync", (state) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = state;
    socket.to(room.roomCode).emit("room:state", state);
  });

  socket.on("host:player-update", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id || !room.state) return;
    socket.to(room.roomCode).emit("room:state", room.state);
  });

  socket.on("host:wheel-result", (label) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.roomCode).emit("player:toast", {
      kind: "wheel",
      label: "Glücksrad",
      value: label,
    });
  });

  socket.on("host:dice-result", (value, sides) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.roomCode).emit("player:toast", {
      kind: "dice",
      label: `W${sides}`,
      value: String(value),
    });
  });

  socket.on("disconnect", () => {
    const info = leaveRoom(socket.id);
    if (info.roomCode && !info.isEmpty) {
      // Allen verbleibenden Mitgliedern aktualisierte Roster schicken
      broadcastRoster(info.roomCode);
      // Falls das Spiel läuft: State an Host-Anfrage weiterleiten etc.
      if (info.newHostId) {
        console.log(`[room] ${info.roomCode} new host=${info.newHostId}`);
      }
    }
    console.log(`[io] disconnect ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`[vtt] server listening on :${PORT} (prod=${isProd})`);
});
