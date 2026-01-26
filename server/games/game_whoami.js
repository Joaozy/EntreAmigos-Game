const { shuffle } = require('../utils/helpers');

const CHARACTERS = [
    "Batman", "Monalisa", "Albert Einstein", "Pikachu", "Harry Potter", 
    "Beyoncé", "Homem Aranha", "Cleópatra", "Neymar", "Bob Esponja"
];

const startWhoAmI = (io, room, roomId) => {
    const shuffled = shuffle([...CHARACTERS]);
    
    room.players.forEach(p => {
        p.character = shuffled.pop() || "Desconhecido";
    });

    room.gameData = {
        currentTurn: room.players[0].id,
        phase: 'GUESSING',
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', {
        gameType: 'WHOAMI',
        phase: 'GUESSING',
        gameData: { currentTurn: room.gameData.currentTurn },
        players: room.players 
    });
};

const registerWhoAmIHandlers = (io, socket, rooms) => {
    socket.on('whoami_next_turn', ({ roomId }) => {
        const room = rooms.get(roomId);
        if(!room || room.gameData.currentTurn !== socket.id) return;
        
        const currentIndex = room.players.findIndex(p => p.id === socket.id);
        const nextIndex = (currentIndex + 1) % room.players.length;
        room.gameData.currentTurn = room.players[nextIndex].id;
        
        io.to(roomId).emit('update_game_data', { 
            gameData: { currentTurn: room.gameData.currentTurn }, 
            phase: 'GUESSING' 
        });
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    if (!gd) return false;

    if (gd.currentTurn === oldId) {
        gd.currentTurn = newId;
        updated = true;
    }
    return updated;
};

module.exports = { startWhoAmI, registerWhoAmIHandlers, handleRejoin };