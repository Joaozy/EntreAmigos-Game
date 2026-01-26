const { shuffle } = require('../utils/helpers');

// Pares de oposição para o jogo
const PAIRS = [
    ["Chá", "Café"]
];

const startChaCafe = (io, room, roomId) => {
    // 1. Sorteia um par
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    
    // 2. Define Narrador e Desafiante (Turnos)
    const narrator = room.players[0]; // Host começa
    const guesser = room.players[1] || room.players[0]; // Se tiver só 1 (teste), ele joga contra si mesmo
    
    room.gameData = {
        options: pair,           // ["Chá", "Café"]
        selectedOption: null,    // Narrador vai escolher (0 ou 1)
        narratorId: narrator.id,
        guesserId: guesser.id,
        round: 1,
        guesserWord: null,
        phase: 'SELECTION'       // SELECTION -> GUESSING -> RESULT
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

    // Esconde a escolha do narrador
    return {
        options: gd.options,
        // Só envia qual foi escolhida se já acabou a rodada
        selectedOption: (gd.phase === 'RESULT') ? gd.selectedOption : null,
        narratorId: gd.narratorId,
        guesserId: gd.guesserId,
        guesserWord: gd.guesserWord,
        phase: gd.phase,
        round: gd.round
    };
};

const registerChaCafeHandlers = (io, socket, rooms) => {
    // 1. Narrador escolhe a opção (0 ou 1)
    socket.on('cc_select_option', ({ roomId, optionIndex }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.narratorId !== socket.id) return;
        
        room.gameData.selectedOption = optionIndex;
        room.gameData.phase = 'GUESSING';
        
        io.to(roomId).emit('update_game_data', { 
            gameData: getPublicData(room), 
            phase: 'GUESSING' 
        });
    });

    // 2. Desafiante envia palavra
    socket.on('cc_submit_guess', ({ roomId, word }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.guesserId !== socket.id) return;
        
        room.gameData.guesserWord = word;
        room.gameData.phase = 'RESULT';
        
        // Aqui o jogo poderia ter um julgamento, mas para simplificar:
        // Mostra o resultado e o narrador diz se acertou ou não verbalmente/chat,
        // ou reinicia a rodada.
        
        io.to(roomId).emit('update_game_data', { 
            gameData: getPublicData(room), 
            phase: 'RESULT' 
        });
    });
    
    // 3. Próxima rodada
    socket.on('cc_next_round', ({ roomId }) => {
         const room = rooms.get(roomId);
         if (!room || room.gameData.narratorId !== socket.id) return; // Narrador controla

         // Troca papéis
         const currentNarratorIdx = room.players.findIndex(p => p.id === room.gameData.narratorId);
         const nextNarratorIdx = (currentNarratorIdx + 1) % room.players.length;
         const nextGuesserIdx = (nextNarratorIdx + 1) % room.players.length;

         room.gameData.narratorId = room.players[nextNarratorIdx].id;
         room.gameData.guesserId = room.players[nextGuesserIdx].id;
         room.gameData.options = PAIRS[Math.floor(Math.random() * PAIRS.length)];
         room.gameData.selectedOption = null;
         room.gameData.guesserWord = null;
         room.gameData.phase = 'SELECTION';
         room.gameData.round++;

         io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'SELECTION' });
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    if (!gd) return false;

    if (gd.narratorId === oldId) { gd.narratorId = newId; updated = true; }
    if (gd.guesserId === oldId) { gd.guesserId = newId; updated = true; }

    return updated;
};

module.exports = { startChaCafe, registerChaCafeHandlers, handleRejoin };