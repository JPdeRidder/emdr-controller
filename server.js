const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const roomStates = {};

function updateAndBroadcastState(io, roomCode) {
    if (!roomStates[roomCode]) return;
    const roster = roomStates[roomCode].roster;
    const rolesInRoom = Object.values(roster);
    
    const therapistPresent = rolesInRoom.includes('therapist');
    const patientPresent = rolesInRoom.includes('patient');

    io.to(roomCode).emit('sessionStateUpdate', {
        therapist: therapistPresent,
        patient: patientPresent,
        controllerReady: roomStates[roomCode].controllerReady,
        stoppedByPatient: roomStates[roomCode].stoppedByPatient
    });
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinRoom', ({ roomCode, role }) => {
        const cleanRoom = roomCode.trim().toUpperCase();
        
        if (currentRoom) {
            socket.leave(currentRoom);
            if (roomStates[currentRoom]) {
                delete roomStates[currentRoom].roster[socket.id];
                if (Object.keys(roomStates[currentRoom].roster).length === 0) {
                    delete roomStates[currentRoom];
                } else {
                    updateAndBroadcastState(io, currentRoom);
                }
            }
        }
        
        currentRoom = cleanRoom;
        socket.join(currentRoom);

        if (!roomStates[currentRoom]) {
            roomStates[currentRoom] = {
                roster: {},
                controllerReady: false,
                stoppedByPatient: false
            };
        }
        roomStates[currentRoom].roster[socket.id] = role;
        updateAndBroadcastState(io, currentRoom);
    });

    socket.on('updateGamepadStatus', (status) => {
        if (currentRoom && roomStates[currentRoom]) {
            roomStates[currentRoom].controllerReady = status.ready;
            updateAndBroadcastState(io, currentRoom);
        }
    });

    socket.on('patientEmergencyStop', () => {
        if (currentRoom && roomStates[currentRoom]) {
            roomStates[currentRoom].stoppedByPatient = true;
            updateAndBroadcastState(io, currentRoom);
            socket.to(currentRoom).emit('applyControls', { enabled: false });
        }
    });

    socket.on('updateControls', (data) => {
        if (currentRoom && roomStates[currentRoom]) {
            if (data.enabled) {
                roomStates[currentRoom].stoppedByPatient = false;
            }
            socket.to(currentRoom).emit('applyControls', data);
            updateAndBroadcastState(io, currentRoom);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && roomStates[currentRoom]) {
            delete roomStates[currentRoom].roster[socket.id];
            if (Object.keys(roomStates[currentRoom].roster).length === 0) {
                delete roomStates[currentRoom];
            } else {
                updateAndBroadcastState(io, currentRoom);
            }
        }
    });
});

// Render Keep-Alive System: Pings itself every 14 minutes to prevent winding down
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        console.log(`Sending keep-alive ping to ${RENDER_URL}`);
        https.get(RENDER_URL, (res) => {
            console.log(`Keep-alive response status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('Keep-alive ping error:', err.message);
        });
    }, 14 * 60 * 1000); // 14 minutes in milliseconds
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`EMDR Server running on port ${PORT}`);
});