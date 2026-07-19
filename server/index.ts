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
} from "./rooms.js";
import { imageProxyRouter } from "./imageProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const isProd = process.env.NODE_ENV === "production";

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  maxHttpBufferSize: 5 * 1024 * 1024, // 5 MB — für State-Syncs mit eingebetteten data-URLs
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

io.on("connection", (socket) => {
  console.log(`[io] connect ${socket.id}`);

  // === Host erstellt Raum ===
  socket.on("host:create", (payload, ack) => {
    const roomCode = generateRoomCode();
    createRoom(roomCode, socket.id, payload.hostName);
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
  });

  // === Spieler joint ===
  socket.on("player:join", (payload, ack) => {
    const result = joinRoom(payload.roomCode.toUpperCase(), socket.id, payload.playerName);
    if ("error" in result) {
      ack({ ok: false, error: result.error });
      return;
    }
    const room = result.room;
    socket.join(room.roomCode);
    ack({
      ok: true,
      roomCode: room.roomCode,
      isHost: false,
      yourId: socket.id,
    });
    // Host über neuen Spieler informieren & um aktuellen State bitten
    io.to(room.hostSocketId).emit("host:request-state");
    console.log(
      `[room] ${socket.id} joined ${room.roomCode} (members=${room.members.size})`
    );
  });

  // === Host broadcastet aktuellen Game-State ===
  socket.on("host:state-sync", (state) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = state; // cachen für sehr späte Joins
    socket.to(room.roomCode).emit("room:state", state);
  });

  // === Host: Spieler aktualisiert (HP/Inventar/etc.) ===
  socket.on("host:player-update", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id || !room.state) return;
    socket.to(room.roomCode).emit("room:state", room.state);
  });

  socket.on("host:player-remove", (playerId) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    // Kick-Logik folgt in M2 — vorerst nur Log
    console.log(`[room] host removes ${playerId}`);
  });

  // === Ergebnis-Broadcasts (Würfel/Glücksrad) ===
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
      io.to(info.roomCode).emit("room:player-left", socket.id);
      if (info.newHostId) {
        console.log(`[room] ${info.roomCode} new host=${info.newHostId}`);
        // Host-Wechsel wird vom neuen Host-Client gehandhabt —
        // wir informieren, sobald der neue Host-State schickt.
      }
    }
    console.log(`[io] disconnect ${socket.id}`);
  });
});

function findRoomBySocket(socketId: string) {
  // Iterate rooms, find the one where socket is a member.
  for (const code of io.sockets.adapter.rooms.keys()) {
    // Skip socket-id rooms (only uppercase codes count)
    if (code.length !== 4 || code !== code.toUpperCase()) continue;
    const set = io.sockets.adapter.rooms.get(code);
    if (set?.has(socketId)) {
      return getRoom(code);
    }
  }
  return undefined;
}

server.listen(PORT, () => {
  console.log(`[vtt] server listening on :${PORT} (prod=${isProd})`);
});
