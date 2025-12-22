const LOCATIONS = require('../data/locations_spy.json');

const startSpy = (io, room, roomId) => {
    // 1. Sorteia Local e Espião
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    // 2. Define tempo (ex: 8 minutos)
    const duration = 8 * 60 * 1000;
    const endTime = Date.now() + duration;

    room.gameData = {
        location,
        spyId: spyPlayer.id,
        endTime,
        isRevealed: false
    };
    room.phase = 'GAME';

    // 3. Envia dados para todos (mas esconde o local e quem é o espião no payload público)
    io.to(roomId).emit('game_started', { 
        gameType: 'SPY', 
        phase: 'GAME', 
        gameData: { endTime, isRevealed: false }, // Dados públicos seguros
        players: room.players 
    });

    // 4. Envia os segredos individualmente
    room.players.forEach(p => {
        const isSpy = p.id === spyPlayer.id;
        io.to(p.id).emit('spy_secret', { 
            role: isSpy ? 'ESPIÃO' : 'CIVIL',
            location: isSpy ? null : location 
        });
    });
};

const handleSpyRejoin = (room, oldId, newId) => {
    let updated = false;
    if (room.gameData.spyId === oldId) {
        room.gameData.spyId = newId;
        updated = true;
    }
    return updated;
};

const registerSpyHandlers = (io, socket, rooms) => {
    socket.on('spy_reveal', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id) return;

        room.gameData.isRevealed = true;
        
        // Revela tudo para todos
        io.to(roomId).emit('game_over', { 
            gameData: { 
                ...room.gameData,
                location: room.gameData.location, // Agora envia o local real
                spyId: room.gameData.spyId 
            },
            phase: 'REVEAL'
        });
    });
};

module.exports = { startSpy, registerSpyHandlers, handleSpyRejoin };