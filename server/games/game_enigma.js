const { shuffle } = require('../utils/helpers');
let DECKS = [{ answer: "Teste", clues: ["Dica 1", "Dica 2"] }];
try {
    const loaded = require('../data/themes_enigma.json');
    if(Array.isArray(loaded) && loaded.length > 0) DECKS = loaded;
} catch (e) {}

const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const getLevenshteinDistance = (a, b) => {
    if(a.length === 0) return b.length; 
    if(b.length === 0) return a.length;
    const matrix = [];
    for(let i=0; i<=b.length; i++) matrix[i] = [i];
    for(let j=0; j<=a.length; j++) matrix[0][j] = j;
    for(let i=1; i<=b.length; i++) {
        for(let j=1; j<=a.length; j++) {
            if(b.charAt(i-1)===a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
            else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1));
        }
    }
    return matrix[b.length][a.length];
};

module.exports = (io, socket, rooms) => {
    socket.on('enigma_next_clue', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room || room.gameData.phase !== 'CLUES') return;
        nextClueInternal(io, room, roomId);
    });

    socket.on('enigma_guess', ({ roomId, guess }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room || room.state.phase !== 'CLUES') return;
        const gd = room.state;
        if (gd.lockedPlayers.includes(socket.id)) return;

        const player = room.players.find(p => p.socketId === socket.id);
        const correct = normalize(gd.currentCard.answer);
        const attempt = normalize(guess);
        const distance = getLevenshteinDistance(attempt, correct);
        const len = correct.length;
        let tolerance = len > 8 ? 2 : (len >= 5 ? 1 : 0);

        if (distance <= tolerance) {
            player.score += gd.currentValue;
            gd.roundWinner = player.nickname;
            gd.phase = 'ROUND_END';
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} ACERTOU!` });
            io.to(roomId).emit('update_players', room.players);
            updateGame(io, room, roomId);
            if (gd.timer) clearTimeout(gd.timer);
            gd.timer = setTimeout(() => startRound(io, room, roomId), 5000);
        } else {
            gd.lockedPlayers.push(socket.id);
            socket.emit('enigma_wrong', 'Errado! Espere a próxima dica.');
            const activePlayers = room.players.filter(p => p.socketId).length; // Simplificado
            if (gd.lockedPlayers.length >= activePlayers) {
                setTimeout(() => { if(gd.phase==='CLUES') nextClueInternal(io, room, roomId); }, 1500);
            } else {
                updateGame(io, room, roomId);
            }
        }
    });
};

module.exports.initGame = (room) => {
    room.state = {
        deck: shuffle([...DECKS]),
        currentCard: null, round: 0, phase: 'CLUES', revealedCount: 0, 
        lockedPlayers: [], roundWinner: null, currentValue: 100, timer: null
    };
    room.players.forEach(p => p.score = 0);
    startRound(null, room, room.id); // Inicia rodada
    return { phase: 'CLUES', gameData: getPublicData(room.state) };
};

function startRound(io, room, roomId) {
    const serverIO = io || require('../server').io;
    const gd = room.state;
    if (gd.timer) clearTimeout(gd.timer);
    if (gd.deck.length === 0) {
        const winner = room.players.sort((a,b) => b.score - a.score)[0];
        serverIO.to(roomId).emit('game_over', { winner, results: room.players });
        return;
    }
    gd.round++;
    gd.currentCard = gd.deck.pop();
    gd.phase = 'CLUES';
    gd.revealedCount = 1; 
    gd.lockedPlayers = []; 
    gd.roundWinner = null;
    gd.currentValue = 100;
    updateGame(serverIO, room, roomId);
}

function nextClueInternal(io, room, roomId) {
    const gd = room.state;
    if (gd.phase === 'ROUND_END') return;
    if (gd.revealedCount < 10) {
        gd.revealedCount++;
        gd.currentValue = Math.max(10, 110 - (gd.revealedCount * 10));
        gd.lockedPlayers = []; 
        updateGame(io, room, roomId);
    } else {
        gd.phase = 'ROUND_END';
        updateGame(io, room, roomId);
        gd.timer = setTimeout(() => startRound(io, room, roomId), 5000);
    }
}

function getPublicData(gd) {
    if (!gd.currentCard) return {};
    return {
        round: gd.round, phase: gd.phase,
        clues: gd.currentCard.clues.slice(0, gd.revealedCount),
        totalClues: 10, currentValue: gd.currentValue,
        lockedPlayers: gd.lockedPlayers,
        answer: gd.phase === 'ROUND_END' ? gd.currentCard.answer : null,
        roundWinner: gd.roundWinner
    };
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: room.state.phase });
}