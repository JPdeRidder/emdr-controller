const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
    let currentRoom = null;

    // Handle joining a specific room
    socket.on('joinRoom', (roomCode) => {
        // Clean up code formatting
        const cleanRoom = roomCode.trim().toLowerCase();
        
        // Leave previous room if switching
        if (currentRoom) {
            socket.leave(currentRoom);
        }
        
        currentRoom = cleanRoom;
        socket.join(currentRoom);
        console.log(`User ${socket.id} joined room: ${currentRoom}`);
    });

    // Broadcast updates strictly to the user's specific room
    socket.on('updateControls', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('applyControls', data);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`EMDR Server running on port ${PORT}`);
});
