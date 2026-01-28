const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let THEMES = [{ category: "Geral", words: ["Sol", "Lua"], questions: ["O que é?"] }];
try {
    const loaded = require('../data/themes_spy.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {}

module.exports = (io, socket, RoomManager) => {

    socket.on('spy_submit_answer', async ({ roomId, answer }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            const gd = room.state;
            
            if (socket.data.userId !== gd.turnOrder[gd.currentTurnIndex]) return;
            
            const player = room.players.find(p => p.userId === socket.data.userId);
            
            gd.answers.push({ 
                playerId: socket.data.userId, 
                nickname: player ? player.nickname : '???', 
                text: answer, 
                questionIndex: gd.currentQuestionIndex 
            });
            
            gd.currentTurnIndex++;

            if (gd.currentTurnIndex >= gd.turnOrder.length) {
                if (gd.currentQuestionIndex < 2) {
                    gd.currentQuestionIndex++;
                    const first = gd.turnOrder.shift(); 
                    gd.turnOrder.push(first); 
                    gd.currentTurnIndex = 0; 
                } else {
                    gd.phase = 'DISCUSSION';
                }
            }
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    socket.on('spy_start_voting', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if (room) { 
            room.state.phase = 'VOTING'; 
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room); 
        }
    });

    socket.on('spy_vote', async ({ roomId, targetId }) => {
        const room = await RoomManager.getRoom(roomId);
        if (!room) return;
        const gd = room.state;
        
        gd.votes[socket.data.userId] = targetId;

        if (Object.keys(gd.votes).length >= room.players.length) {
            const counts = {};
            Object.values(gd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            
            let max = 0; 
            let accusedId = null;
            Object.entries(counts).forEach(([id, c]) => { if(c > max){ max = c; accusedId = id; } });

            if (accusedId === gd.spyId) {
                gd.phase = 'SPY_GUESS';
            } else {
                await endGame(io, room, roomId, 'SPY', 'Civis votaram errado! O Espião venceu.');
                return;
            }
        }
        await RoomManager.saveRoom(room);
        await broadcastUpdate(io, room);
    });

    socket.on('spy_guess_location', async ({ roomId, word }) => {
        const room = await RoomManager.getRoom(roomId);
        if (!room) return;
        const gd = room.state;
        
        if (socket.data.userId !== gd.spyId) return;

        if (word.toUpperCase() === gd.secretWord.toUpperCase()) {
            await endGame(io, room, roomId, 'SPY', 'Espião acertou o local!');
        } else {
            await endGame(io, room, roomId, 'CIVILIANS', `Espião errou (Disse ${word}). Civis venceram!`);
        }
    });
};

module.exports.initGame = (room, io) => {
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    room.state = {
        category: themeObj.category, 
        secretWord, 
        possibleWords: themeObj.words,
        questions: shuffle([...themeObj.questions]).slice(0, 3),
        spyId: spyPlayer.userId,
        currentQuestionIndex: 0, 
        turnOrder: shuffle(room.players.map(p => p.userId)), 
        currentTurnIndex: 0,
        answers: [], 
        votes: {}, 
        phase: 'QUESTIONS', 
        winner: null, 
        winReason: null
    };

    return { phase: 'QUESTIONS', gameData: {} };
};

// --- CORREÇÃO AQUI ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    
    // PROTEÇÃO: Se o jogo não começou (turnOrder não existe), retorna vazio
    // Isso evita o erro "reading 'undefined'" no Lobby
    if (!gd.turnOrder || !gd.questions) return {};

    const isOver = gd.phase === 'REVEAL';
    const isSpy = userId === gd.spyId;

    return {
        category: gd.category, 
        possibleWords: gd.possibleWords, 
        questions: gd.questions,
        currentQuestionIndex: gd.currentQuestionIndex, 
        currentTurnId: gd.turnOrder[gd.currentTurnIndex], // Essa linha quebrava antes
        answers: gd.answers, 
        phase: gd.phase, 
        votes: gd.votes,
        role: isSpy ? 'ESPIÃO' : 'CIVIL',
        secretWord: (isSpy && !isOver) ? null : gd.secretWord, 
        spyId: isOver ? gd.spyId : null, 
        winner: gd.winner, 
        winReason: gd.winReason
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'SPY',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

async function endGame(io, room, roomId, winner, reason) {
    const gd = room.state;
    gd.phase = 'REVEAL'; 
    gd.winner = winner; 
    gd.winReason = reason;
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

module.exports.getPublicData = getPublicData;