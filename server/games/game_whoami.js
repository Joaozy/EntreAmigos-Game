const { shuffle } = require('../utils/helpers');

// Lista simples de personagens
const CHARACTERS = [
    "Batman", "Monalisa", "Albert Einstein", "Pikachu", "Harry Potter", 
    "Beyoncé", "Homem Aranha", "Cleópatra", "Neymar", "Bob Esponja"
];

const startWhoAmI = (io, room, roomId) => {
    // Distribui personagens
    const shuffled = shuffle([...CHARACTERS]);
    
    room.players.forEach(p => {
        p.character = shuffled.pop() || "Desconhecido";
        // Envia para TODOS, menos para o próprio (Lógica clássica: Todos sabem quem eu sou, menos eu)
        // OU Lógica invertida: Só eu sei. 
        // Vamos usar a clássica: Eu tenho um post-it na testa. Eu não sei quem sou.
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
        players: room.players // O Frontend deve esconder o 'character' do próprio jogador
    });
};

const registerWhoAmIHandlers = (io, socket, rooms) => {
    socket.on('whoami_next_turn', ({ roomId }) => {
        const room = rooms.get(roomId);
        if(!room || room.gameData.currentTurn !== socket.id) return;
        
        // Passa a vez
        const currentIndex = room.players.findIndex(p => p.id === socket.id);
        const nextIndex = (currentIndex + 1) % room.players.length;
        room.gameData.currentTurn = room.players[nextIndex].id;
        
        io.to(roomId).emit('update_game_data', { 
            gameData: { currentTurn: room.gameData.currentTurn }, 
            phase: 'GUESSING' 
        });
    });
};

// --- CORREÇÃO DE RECONEXÃO ---
const handleRejoin = (io, socket, room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    
    if (!gd) return false;

    // 1. Atualiza turno se for a vez dele
    if (gd.currentTurn === oldId) {
        gd.currentTurn = newId;
        updated = true;
    }

    // 2. Garante que o jogador tenha o dado do personagem na lista de players
    // (O socket.emit 'joined_room' no server.js já manda a lista de players atualizada)
    // Mas se houver dados privados específicos, mandamos aqui.
    
    return updated;
};

module.exports = { startWhoAmI, registerWhoAmIHandlers, handleRejoin };