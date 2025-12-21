const WORDS_CHACAFE = require('../data/words.json');

const startChaCafe = (io, room, roomId) => {
    const targetWord = WORDS_CHACAFE[Math.floor(Math.random() * WORDS_CHACAFE.length)];
    let candidates = room.players;
    if (room.gameData && room.gameData.narratorId && room.players.length > 1) {
        candidates = room.players.filter(p => p.id !== room.gameData.narratorId);
    }
    const narrator = candidates[Math.floor(Math.random() * candidates.length)];
    const guessers = room.players.filter(p => p.id !== narrator.id);
    room.gameData = { 
        targetWord, narratorId: narrator.id, currentWord: "Chá", challengerWord: "Café", 
        turnIndex: 0, guessersIds: guessers.map(p => p.id), lastGuesserId: null, roundCount: 1, hint: null 
    };
    room.phase = 'JUDGING'; 
    io.to(roomId).emit('game_started', { gameType: 'CHA_CAFE', phase: 'JUDGING', gameData: room.gameData, players: room.players });
};

const registerChaCafeHandlers = (io, socket, rooms) => {
    socket.on('cc_judge', ({ roomId, winnerWord }) => {
        const room = rooms.get(roomId); if (!room || room.gameData.narratorId !== socket.id) return;
        const data = room.gameData;
        if (winnerWord.toLowerCase() === data.targetWord.toLowerCase()) {
            room.phase = 'VICTORY';
            io.to(roomId).emit('game_over', { winnerWord, targetWord: data.targetWord, winnerPlayer: room.players.find(p => p.id === data.lastGuesserId)?.nickname || "Ninguém" });
            return;
        }
        data.currentWord = winnerWord; data.challengerWord = null; data.roundCount = (data.roundCount || 1) + 1; room.phase = 'GUESSING';
        io.to(roomId).emit('update_game_data', { gameData: data, phase: 'GUESSING' });
    });

    socket.on('cc_guess', ({ roomId, word }) => {
        const room = rooms.get(roomId); if(!room) return; 
        const data = room.gameData;
        data.challengerWord = word; data.lastGuesserId = socket.id; 
        data.turnIndex = (data.turnIndex + 1) % data.guessersIds.length; room.phase = 'JUDGING';
        io.to(roomId).emit('update_game_data', { gameData: data, phase: 'JUDGING' });
    });

    socket.on('cc_give_hint', ({ roomId, hint }) => {
        const room = rooms.get(roomId); if(!room) return;
        room.gameData.hint = hint; 
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
    });
};

module.exports = { startChaCafe, registerChaCafeHandlers };