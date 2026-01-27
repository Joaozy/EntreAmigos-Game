const PAIRS = [
    ["Chá", "Café"], ["Praia", "Montanha"], ["Cachorro", "Gato"],
    ["Dia", "Noite"], ["Marvel", "DC"], ["Doce", "Salgado"],
    ["Pizza", "Hambúrguer"], ["Série", "Filme"], ["Livro", "Kindle"]
];

module.exports = (io, socket, rooms) => {
    socket.on('cc_select', ({ roomId, index }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        
        if (socket.data.userId === room.state.narratorUserId) {
            room.state.selectedOptionIndex = index;
            room.state.phase = 'GUESSING';
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'GUESSING' });
        }
    });

    socket.on('cc_guess', ({ roomId, word }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;

        if (socket.data.userId === room.state.guesserUserId) {
            room.state.guesserWord = word;
            room.state.phase = 'RESULT';
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'RESULT' });
        }
    });

    socket.on('cc_next', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;

        if (socket.data.userId === room.state.narratorUserId) {
            startNextRound(room);
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'SELECTION' });
        }
    });
};

function startNextRound(room) {
    if (!room.players || room.players.length === 0) return;
    const currentNarratorIdx = room.players.findIndex(p => p.userId === room.state.narratorUserId);
    const nextNarratorIdx = (currentNarratorIdx + 1) % room.players.length;
    const nextGuesserIdx = (nextNarratorIdx + 1) % room.players.length;

    room.state.narratorUserId = room.players[nextNarratorIdx].userId;
    room.state.guesserUserId = room.players[nextGuesserIdx].userId;
    room.state.options = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    room.state.selectedOptionIndex = null;
    room.state.guesserWord = null;
    room.state.phase = 'SELECTION';
    room.state.round = (room.state.round || 0) + 1;
}

module.exports.initGame = (room) => {
    room.state = { round: 0 };
    const lastIdx = room.players.length - 1;
    room.state.narratorUserId = room.players[lastIdx].userId; 
    startNextRound(room);
    return { phase: 'SELECTION', gameData: getPublicData(room.state) };
};

function getPublicData(gd) {
    if (!gd) return {};
    return {
        options: gd.options,
        selectedOptionIndex: (gd.phase === 'RESULT') ? gd.selectedOptionIndex : null,
        narratorUserId: gd.narratorUserId,
        guesserUserId: gd.guesserUserId,
        guesserWord: gd.guesserWord,
        phase: gd.phase,
        round: gd.round
    };
}