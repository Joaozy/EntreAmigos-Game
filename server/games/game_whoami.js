const { shuffle } = require('../utils/helpers');

const CHARACTERS = [
    "Batman", "Monalisa", "Albert Einstein", "Pikachu", "Harry Potter", 
    "Beyoncé", "Homem Aranha", "Cleópatra", "Neymar", "Bob Esponja"
];

const startWhoAmI = (io, room, roomId) => {
    const deck = shuffle([...CHARACTERS]);
    
    room.players.forEach(p => {
        p.character = deck.pop() || "Desconhecido";
    });

    room.gameData = {
        currentTurnUserId: room.players[0].userId, // Usa UserId
        phase: 'GUESSING'
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', {
        gameType: 'WHOAMI',
        phase: 'GUESSING',
        gameData: room.gameData,
        players: room.players
    });
    
    // Envia personagem para todos (Front esconde o meu)
};

const registerHandlers = (io, socket, rooms) => {
    socket.on('whoami_next_turn', ({ roomId }) => {
        const room = rooms.get(roomId);
        if(!room) return;
        const player = room.players.find(p => p.socketId === socket.id);

        if(player && player.userId === room.gameData.currentTurnUserId) {
            const currentIdx = room.players.findIndex(p => p.userId === player.userId);
            const nextIdx = (currentIdx + 1) % room.players.length;
            room.gameData.currentTurnUserId = room.players[nextIdx].userId;
            
            io.to(roomId).emit('update_game_data', { 
                gameData: room.gameData, phase: 'GUESSING' 
            });
        }
    });
};

module.exports = { startWhoAmI, registerHandlers };