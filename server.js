const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// Track room states including rosters and structural state flags
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

        console.log(`User ${socket.id} (${role}) joined room: ${currentRoom}`);
        updateAndBroadcastState(io, currentRoom);
    });

    // Handle updates when a patient connects/disconnects a controller hardware component
    socket.on('updateGamepadStatus', (status) => {
        if (currentRoom && roomStates[currentRoom]) {
            roomStates[currentRoom].controllerReady = status.ready;
            updateAndBroadcastState(io, currentRoom);
        }
    });

    // Handle updates when the patient activates the emergency panic freeze override
    socket.on('patientEmergencyStop', () => {
        if (currentRoom && roomStates[currentRoom]) {
            roomStates[currentRoom].stoppedByPatient = true;
            updateAndBroadcastState(io, currentRoom);
            // Alert therapist directly to switch off the master toggle
            socket.to(currentRoom).emit('applyControls', { enabled: false });
        }
    });

    socket.on('updateControls', (data) => {
        if (currentRoom && roomStates[currentRoom]) {
            // If therapist starts stimulation again, clear the emergency warning sign automatically
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
            console.log(`User ${socket.id} left room: ${currentRoom}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`EMDR Server running on port ${PORT}`);
});