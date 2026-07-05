const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, "public")));

const socketRoomMap = new Map();

io.on("connection", (socket) => {
  socket.on("join", (room) => {
    if (!room) return;

    socketRoomMap.set(socket.id, room);
    socket.join(room);

    const clientsInRoom = io.sockets.adapter.rooms.get(room);
    const count = clientsInRoom ? clientsInRoom.size : 0;

    if (count > 1) {
      socket.to(room).emit("ready");
    }

    socket.emit("joined", room);
    socket.to(room).emit("peer-joined", socket.id);

    console.log(`Socket ${socket.id} joined room ${room}`);
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
    if (room) {
      socket.leave(room);
      socket.to(room).emit("peer-left");
      socketRoomMap.delete(socket.id);
      console.log(`Socket ${socket.id} left room ${room}`);
    }
  });

  socket.on("disconnect", () => {
    const room = socketRoomMap.get(socket.id);
    if (room) {
      socket.to(room).emit("peer-left");
      socketRoomMap.delete(socket.id);
      console.log(`Socket ${socket.id} disconnected from room ${room}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});