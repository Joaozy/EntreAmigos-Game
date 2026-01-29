const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let THEMES = [
    { category: "Geral", words: ["Sol", "Lua", "Praia", "Escola", "Hospital"], questions: ["O que se faz lá?", "É quente?", "Tem cheiro?"] }
];

try {
    const loaded = require('../data/themes_spy.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {
    console.log("[SPY] Usando temas padrão.");
}

module.exports = (io, socket, RoomManager) => {

    const getUserId = (room) => {
        const player = room.players.find(p => p.socketId === socket.id);
        return player ? player.userId : socket.data.userId;
    };

    socket.on('spy_submit_answer', async ({ roomId, answer }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            const gd = room.state;
            const userId = getUserId(room);
            
            // Valida vez
            if (userId !== gd.turnOrder[gd.currentTurnIndex]) return;
            
            const player = room.players.find(p => p.userId === userId);
            
            gd.answers.push({ 
                playerId: userId, 
                nickname: player ? player.nickname : '???', 
                text: answer, 
                questionIndex: gd.currentQuestionIndex 
            });
            
            gd.currentTurnIndex++;

            // Se todos responderam
            if (gd.currentTurnIndex >= gd.turnOrder.length) {
                // Avança pergunta ou fase
                if (gd.currentQuestionIndex < 2) { // 3 perguntas no total (0, 1, 2)
                    gd.currentQuestionIndex++;
                    // Rotaciona quem começa respondendo para não ser sempre o mesmo
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
        const userId = getUserId(room);
        
        gd.votes[userId] = targetId;

        // Se todos votaram
        if (Object.keys(gd.votes).length >= room.players.length) {
            const counts = {};
            Object.values(gd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            
            let max = 0; 
            let accusedId = null;
            // Define quem foi o mais votado
            Object.entries(counts).forEach(([id, c]) => { if(c > max){ max = c; accusedId = id; } });

            // Lógica de acusação
            if (accusedId === gd.spyId) {
                // Se pegaram o espião, ele tem chance de chutar o local
                gd.phase = 'SPY_GUESS';
            } else {
                // Acusaram inocente -> Espião vence
                await endGame(io, room, roomId, 'SPY', 'Civis votaram errado num inocente! O Espião venceu.');
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
        const userId = getUserId(room);
        
        if (userId !== gd.spyId) return;

        if (word.toUpperCase() === gd.secretWord.toUpperCase()) {
            await endGame(io, room, roomId, 'SPY', 'Espião foi pego mas acertou o local!');
        } else {
            await endGame(io, room, roomId, 'CIVILIANS', `Espião errou o local (Disse: ${word}). Civis venceram!`);
        }
    });

    // REINICIAR JOGO NA MESMA SALA
    socket.on('spy_restart', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if (room && room.players.find(p => p.socketId === socket.id)?.isHost) {
            module.exports.initGame(room, io);
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        }
    });
};

module.exports.initGame = (room, io) => {
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    // Garante IDs dos jogadores para a ordem de turno
    const playerIds = room.players.map(p => p.userId);

    room.state = {
        category: themeObj.category, 
        secretWord, 
        possibleWords: themeObj.words,
        questions: shuffle([...themeObj.questions]).slice(0, 3), // Pega 3 perguntas aleatórias
        spyId: spyPlayer.userId,
        currentQuestionIndex: 0, 
        turnOrder: shuffle(playerIds), 
        currentTurnIndex: 0,
        answers: [], 
        votes: {}, 
        phase: 'QUESTIONS', 
        winner: null, 
        winReason: null
    };

    console.log(`[SPY] Iniciado. Local: ${secretWord}, Espião: ${spyPlayer.nickname}`);

    // --- CORREÇÃO CRÍTICA: Retorna apenas a fase ---
    return { phase: 'QUESTIONS' };
};

function getPublicData(gd, userId) {
    if (!gd) return {};
    
    // Se o jogo não foi inicializado corretamente, retorna vazio
    if (!gd.turnOrder) return {};

    const isOver = gd.phase === 'REVEAL';
    const isSpy = userId === gd.spyId;

    return {
        category: gd.category, 
        possibleWords: gd.possibleWords, 
        questions: gd.questions,
        currentQuestionIndex: gd.currentQuestionIndex, 
        currentTurnId: gd.turnOrder[gd.currentTurnIndex], 
        answers: gd.answers, 
        phase: gd.phase, 
        votes: gd.votes,
        role: isSpy ? 'ESPIÃO' : 'CIVIL',
        // Se for espião, vê NULL. Se for civil, vê a palavra.
        // No final (isOver), todos veem a palavra.
        secretWord: (isSpy && !isOver) ? null : gd.secretWord, 
        spyId: isOver ? gd.spyId : null, 
        winner: gd.winner, 
        winReason: gd.winReason
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        // Busca segura do userId
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;

        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'SPY',
            phase: room.state.phase,
            gameData: getPublicData(room.state, targetUserId)
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