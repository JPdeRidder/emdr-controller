const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// Track which users are in which rooms: { roomCode: { socketId: role } }
const roomRosters = {};

function updateAndBroadcastRoster(io, roomCode) {
    if (!roomRosters[roomCode]) return;

    const rolesInRoom = Object.values(roomRosters[roomCode]);
    const therapistPresent = rolesInRoom.includes('therapist');
    const patientPresent = rolesInRoom.includes('patient');

    io.to(roomCode).emit('rosterUpdate', {
        therapist: therapistPresent,
        patient: patientPresent
    });
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', ({ roomCode, role }) => {
        const cleanRoom = roomCode.trim().toUpperCase();
        
        if (currentRoom) {
            socket.leave(currentRoom);
            if (roomRosters[currentRoom]) {
                delete roomRosters[currentRoom][socket.id];
                if (Object.keys(roomRosters[currentRoom]).length === 0) {
                    delete roomRosters[currentRoom];
                } else {
                    updateAndBroadcastRoster(io, currentRoom);
                }
            }
        }
        
        currentRoom = cleanRoom;
        socket.join(currentRoom);

        if (!roomRosters[currentRoom]) {
            roomRosters[currentRoom] = {};
        }
        roomRosters[currentRoom][socket.id] = role;

        console.log(`User ${socket.id} (${role}) joined room: ${currentRoom}`);
        updateAndBroadcastRoster(io, currentRoom);
    });

    socket.on('updateControls', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('applyControls', data);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && roomRosters[currentRoom]) {
            delete roomRosters[currentRoom][socket.id];
            if (Object.keys(roomRosters[currentRoom]).length === 0) {
                delete roomRosters[currentRoom];
            } else {
                updateAndBroadcastRoster(io, currentRoom);
            }
            console.log(`User ${socket.id} left room: ${currentRoom}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`EMDR Server running on port ${PORT}`);
});