const { shuffle } = require('../utils/helpers');

// Pares de oposição (Dados fixos para não dar erro)
const PAIRS = [
    ["Chá", "Café"]
];

const startChaCafe = (io, room, roomId) => {
    // Escolhe par aleatório
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    
    // Define Narrador (Host) e Desafiante
    const narrator = room.players[0];
    const guesser = room.players[1] || room.players[0]; // Modo teste se tiver 1 pessoa

    room.gameData = {
        options: pair,           // Ex: ["Chá", "Café"]
        selectedOptionIndex: null, 
        narratorUserId: narrator.userId, // Usa ID Fixo
        guesserUserId: guesser.userId,   // Usa ID Fixo
        guesserWord: null,
        round: 1,
        phase: 'SELECTION' // SELECTION -> GUESSING -> RESULT
    };
    
    room.phase = 'GAME';
    
    io.to(roomId).emit('game_started', {
        gameType: 'CHA_CAFE',
        phase: 'SELECTION',
        gameData: getPublicData(room),
        players: room.players
    });
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd) return {};
    
    return {
        options: gd.options,
        // Só revela a escolha na fase de resultado
        selectedOptionIndex: (gd.phase === 'RESULT') ? gd.selectedOptionIndex : null,
        narratorUserId: gd.narratorUserId,
        guesserUserId: gd.guesserUserId,
        guesserWord: gd.guesserWord,
        phase: gd.phase,
        round: gd.round
    };
};

const registerHandlers = (io, socket, rooms) => {
    // 1. Narrador escolhe
    socket.on('cc_select', ({ roomId, index }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);
        
        // Verifica se quem clicou é realmente o narrador (pelo ID Fixo)
        if (player && player.userId === room.gameData.narratorUserId) {
            room.gameData.selectedOptionIndex = index;
            room.gameData.phase = 'GUESSING';
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });
        }
    });

    // 2. Desafiante chuta
    socket.on('cc_guess', ({ roomId, word }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);

        if (player && player.userId === room.gameData.guesserUserId) {
            room.gameData.guesserWord = word;
            room.gameData.phase = 'RESULT';
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'RESULT' });
        }
    });

    // 3. Próxima Rodada
    socket.on('cc_next', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);

        if (player && player.userId === room.gameData.narratorUserId) {
            // Roda os papéis
            const currentNarratorIdx = room.players.findIndex(p => p.userId === room.gameData.narratorUserId);
            const nextNarratorIdx = (currentNarratorIdx + 1) % room.players.length;
            const nextGuesserIdx = (nextNarratorIdx + 1) % room.players.length;

            room.gameData.narratorUserId = room.players[nextNarratorIdx].userId;
            room.gameData.guesserUserId = room.players[nextGuesserIdx].userId;
            room.gameData.options = PAIRS[Math.floor(Math.random() * PAIRS.length)];
            room.gameData.selectedOptionIndex = null;
            room.gameData.guesserWord = null;
            room.gameData.phase = 'SELECTION';
            room.gameData.round++;

            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'SELECTION' });
        }
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    // Se o socket mudou, o userId é o mesmo, então não precisamos migrar dados
    // O sistema de userId no server.js já cuida de tudo.
    return true; // Força reenvio do estado
};

module.exports = { startChaCafe, registerHandlers, handleRejoin };