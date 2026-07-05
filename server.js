const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const socketRoomMap = new Map();

io.on("connection", (socket) => {
  socket.on("join", (room) => {
    if (!room) return;

    const normalizedRoom = String(room).trim();
    if (!normalizedRoom) return;

    socketRoomMap.set(socket.id, normalizedRoom);
    socket.join(normalizedRoom);

    const roomSet = io.sockets.adapter.rooms.get(normalizedRoom);
    const roomSize = roomSet ? roomSet.size : 0;

    socket.emit("joined", normalizedRoom);

    if (roomSize > 1) {
      socket.to(normalizedRoom).emit("peer-joined", socket.id);
      socket.to(normalizedRoom).emit("ready");
    }
  });

  socket.on("offer", (room, offer) => {
    socket.to(room).emit("offer", offer);
  });

  socket.on("answer", (room, answer) => {
    socket.to(room).emit("answer", answer);
  });

  socket.on("ice-candidate", (room, candidate) => {
    socket.to(room).emit("ice-candidate", candidate);
  });

  socket.on("leave", () => {
    const room = socketRoomMap.get(socket.id);
    if (!room) return;

    socket.leave(room);
    socket.to(room).emit("peer-left");
    socketRoomMap.delete(socket.id);
  });

  socket.on("disconnect", () => {
    const room = socketRoomMap.get(socket.id);
    if (!room) return;

    socket.to(room).emit("peer-left");
    socketRoomMap.delete(socket.id);
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});