const { shuffle } = require('../utils/helpers');
let THEMES = [{ category: "Geral", words: ["Sol", "Lua"], questions: ["O que é?"] }];
try {
    const loaded = require('../data/themes_spy.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {}

module.exports = (io, socket, rooms) => {
    socket.on('spy_submit_answer', ({ roomId, answer }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const gd = room.state;
        
        if (socket.id !== gd.turnOrder[gd.currentTurnIndex]) return;
        const player = room.players.find(p => p.socketId === socket.id);
        
        gd.answers.push({ playerId: socket.id, nickname: player ? player.nickname : '???', text: answer, questionIndex: gd.currentQuestionIndex });
        gd.currentTurnIndex++;

        if (gd.currentTurnIndex >= gd.turnOrder.length) {
            if (gd.currentQuestionIndex < 2) {
                gd.currentQuestionIndex++;
                const first = gd.turnOrder.shift(); gd.turnOrder.push(first); gd.currentTurnIndex = 0; 
            } else {
                gd.phase = 'DISCUSSION';
            }
        }
        updateGame(io, room, roomId);
    });

    socket.on('spy_start_voting', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (room) { room.state.phase = 'VOTING'; updateGame(io, room, roomId); }
    });

    socket.on('spy_vote', ({ roomId, targetId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const gd = room.state;
        gd.votes[socket.id] = targetId;

        if (Object.keys(gd.votes).length >= room.players.length) {
            const counts = {};
            Object.values(gd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            let max = 0; let accusedId = null;
            Object.entries(counts).forEach(([id, c]) => { if(c > max){ max = c; accusedId = id; } });

            if (accusedId === gd.spyId) {
                gd.phase = 'SPY_GUESS';
            } else {
                endGame(io, room, roomId, 'SPY', 'Civis erraram o voto!');
                return;
            }
        }
        updateGame(io, room, roomId);
    });

    socket.on('spy_guess_location', ({ roomId, word }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const gd = room.state;
        if (socket.id !== gd.spyId) return;

        if (word.toUpperCase() === gd.secretWord.toUpperCase()) endGame(io, room, roomId, 'SPY', 'Espião acertou a palavra!');
        else endGame(io, room, roomId, 'CIVILIANS', `Espião errou (chutou ${word})`);
    });
};

module.exports.initGame = (room) => {
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    room.state = {
        category: themeObj.category, secretWord, possibleWords: themeObj.words,
        questions: shuffle([...themeObj.questions]).slice(0, 3),
        spyId: spyPlayer.socketId,
        currentQuestionIndex: 0, turnOrder: shuffle(room.players.map(p => p.socketId)), currentTurnIndex: 0,
        answers: [], votes: {}, phase: 'QUESTIONS', winner: null, winReason: null
    };

    // Delay para enviar segredos
    setTimeout(() => {
        const io = require('../server').io;
        room.players.forEach(p => {
            const isSpy = p.socketId === spyPlayer.socketId;
            io.to(p.socketId).emit('spy_secret', { role: isSpy ? 'ESPIÃO' : 'CIVIL', word: isSpy ? null : secretWord, category: themeObj.category });
        });
    }, 200);

    return { phase: 'QUESTIONS', gameData: getPublicData(room.state) };
};

function getPublicData(gd) {
    const isOver = gd.phase === 'REVEAL';
    return {
        category: gd.category, possibleWords: gd.possibleWords, questions: gd.questions,
        currentQuestionIndex: gd.currentQuestionIndex, currentTurnId: gd.turnOrder[gd.currentTurnIndex], 
        answers: gd.answers, phase: gd.phase, votes: gd.votes,
        secretWord: isOver ? gd.secretWord : null, spyId: isOver ? gd.spyId : null, winner: gd.winner, winReason: gd.winReason
    };
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: room.state.phase });
}

function endGame(io, room, roomId, winner, reason) {
    const gd = room.state;
    gd.phase = 'REVEAL'; gd.winner = winner; gd.winReason = reason;
    io.to(roomId).emit('game_over', { gameData: getPublicData(gd), phase: 'REVEAL' });
}