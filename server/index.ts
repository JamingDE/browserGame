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
  banPlayer,
  createRoom,
  generateRoomCode,
  getRoom,
  getRoomBySocket,
  isBanned,
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

// Hilfsfunktion: Socket in die Socket.IO-Room aufnehmen (falls noch nicht drin)
function ensureSocketInRoom(socketId: string, roomCode: string) {
  const s = io.sockets.sockets.get(socketId);
  if (s && !s.rooms.has(roomCode)) {
    s.join(roomCode);
    console.log(`[io] re-joined ${socketId} → ${roomCode}`);
  }
}

// Broadcast-Hilfsfunktionen
function broadcastRoster(roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) return;
  // Sicherstellen, dass alle Mitglieder in der Socket.IO-Room sind
  for (const socketId of room.members.keys()) {
    ensureSocketInRoom(socketId, roomCode);
  }
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
    const code = payload.roomCode.toUpperCase();
    // Ban-Check VOR joinRoom
    if (isBanned(code, payload.playerName)) {
      ack({ ok: false, error: "Du wurdest aus diesem Raum gebannt." });
      return;
    }
    const result = joinRoom(code, socket.id, payload.playerName);
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

    if (room.gameStarted) {
      console.log(
        `[room] ${socket.id} joined running game ${room.roomCode} → notify`
      );
      io.to(socket.id).emit("game:started", {
        members: lobbySnapshot(room).members,
        roomName: room.config.roomName,
        maxPlayers: room.config.maxPlayers,
        startHearts: room.config.startHearts,
      });
      io.to(room.hostSocketId).emit("host:request-state");
    }
    console.log(
      `[room] ${socket.id} joined ${room.roomCode} (members=${room.members.size}, started=${room.gameStarted})`
    );
  });

  // === Host startet das Spiel ===
  socket.on("host:start-game", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) {
      console.warn(`[room] start-game: no room for ${socket.id}`);
      return;
    }
    if (room.hostSocketId !== socket.id) {
      console.warn(
        `[room] start-game: ${socket.id} is not host of ${room.roomCode}`
      );
      return;
    }
    room.gameStarted = true;
    // Sicherstellen, dass alle Mitglieder in der Socket.IO-Room sind
    for (const sid of room.members.keys()) {
      ensureSocketInRoom(sid, room.roomCode);
    }
    const snapshot = lobbySnapshot(room);
    console.log(
      `[room] ${room.roomCode} game started → broadcasting to ${room.members.size} members:`,
      Array.from(room.members.keys())
    );
    io.to(room.roomCode).emit("game:started", {
      members: snapshot.members,
      roomName: snapshot.roomName,
      maxPlayers: snapshot.maxPlayers,
      startHearts: snapshot.startHearts,
    });
  });

  // === Host kickt einen Spieler (this session) ===
  socket.on("host:kick", (memberId) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (memberId === socket.id) return;
    io.to(memberId).emit("lobby:kick", "Du wurdest vom Host entfernt.");
    io.sockets.sockets.get(memberId)?.disconnect(true);
  });

  // === Host bannt einen Spieler (auch Reconnect blockiert) ===
  socket.on("host:ban", (memberId) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (memberId === socket.id) return;
    const member = room.members.get(memberId);
    if (member) {
      banPlayer(room.roomCode, member.name);
      io.to(memberId).emit(
        "lobby:kick",
        "Du wurdest aus diesem Raum gebannt."
      );
      io.sockets.sockets.get(memberId)?.disconnect(true);
      console.log(`[room] ${member.name} banned from ${room.roomCode}`);
    }
  });

  // === Host broadcastet Game-State ===
  socket.on("host:state-sync", (state) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = state;
    socket.to(room.roomCode).emit("room:state", state);
  });

  socket.on("host:player-update", () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id || !room.state) return;
    socket.to(room.roomCode).emit("room:state", room.state);
  });

  socket.on("host:wheel-result", (label) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.roomCode).emit("player:toast", {
      kind: "wheel",
      label: "Glücksrad",
      value: label,
    });
  });

  socket.on("host:dice-result", (value, sides) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.roomCode).emit("player:toast", {
      kind: "dice",
      label: `W${sides}`,
      value: String(value),
    });
  });

  // === Würfel & Glücksrad live für alle sichtbar ===
  socket.on("host:dice-show", (payload) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    socket.to(room.roomCode).emit("gm:dice-show", payload);
  });
  socket.on("host:dice-hide", () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    socket.to(room.roomCode).emit("gm:dice-hide");
  });
  socket.on("host:wheel-show", (payload) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    socket.to(room.roomCode).emit("gm:wheel-show", payload);
  });
  socket.on("host:wheel-hide", () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    socket.to(room.roomCode).emit("gm:wheel-hide");
  });

  // === Spieler schlägt gemaltes/erstelltes Asset dem GM vor ===
  socket.on("player:suggest", (payload) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    // Server ist dumm: nur weiterleiten an den Host mit allen Asset-Daten.
    io.to(room.hostSocketId).emit("gm:suggestion", {
      id: `sug-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      fromPlayerId: socket.id,
      fromPlayerName: room.members.get(socket.id)?.name ?? "Unbekannt",
      assetId: payload.asset.id,
      label: payload.label,
      createdAt: Date.now(),
      asset: payload.asset,
    });
    console.log(
      `[room] suggestion from ${socket.id} to host ${room.hostSocketId}: ${payload.label}`
    );
  });

  socket.on("disconnect", () => {
    const info = leaveRoom(socket.id);
    if (info.roomCode && !info.isEmpty) {
      broadcastRoster(info.roomCode);
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
