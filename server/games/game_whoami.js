const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// 1. Lista Padrão (Fallback)
let CHARACTERS = [
    "Batman", "Mickey Mouse", "Jesus Cristo", "Michael Jackson", 
    "Pelé", "Rainha Elizabeth", "Harry Potter", "Bob Esponja",
    "Darth Vader", "Pikachu", "Neymar", "Faustão",
    "Goku", "Homem Aranha", "Barbie", "Super Mario",
    "Anitta", "Silvio Santos", "Lula", "Bolsonaro",
    "Chapolin", "Chaves", "Naruto", "Capitão América",
    "Elsa (Frozen)", "Shrek", "Scooby Doo", "Tom Cruise"
];

// 2. Tenta carregar do JSON
try {
    // Certifique-se que o arquivo existe em server/data/themes_whoami.json
    const customList = require('../data/themes_whoami.json');
    
    // Validação simples para garantir que é uma lista válida
    if (Array.isArray(customList) && customList.length > 0) {
        CHARACTERS = customList;
        console.log(`[WHOAMI] Sucesso! Carregados ${CHARACTERS.length} personagens do arquivo JSON.`);
    }
} catch (e) {
    console.log("[WHOAMI] Arquivo themes_whoami.json não encontrado ou inválido. Usando lista padrão.");
}

module.exports = (io, socket, RoomManager) => {

    // 1. FAZER PERGUNTA
    socket.on('whoami_ask', async ({ roomId, question }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || socket.data.userId !== room.state.currentPlayerId) return;

            const player = room.players.find(p => p.userId === socket.data.userId);
            
            room.state.questionLog.unshift({
                nickname: player.nickname,
                text: question,
                type: 'QUESTION',
                timestamp: Date.now()
            });

            // Reseta os votos para a nova pergunta
            room.state.currentVotes = {}; 
            room.state.currentAction = 'WAITING_ANSWER'; 

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch (e) { console.error(e); }
    });

    // 2. ENVIAR CHUTE
    socket.on('whoami_guess_attempt', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || socket.data.userId !== room.state.currentPlayerId) return;

            const player = room.players.find(p => p.userId === socket.data.userId);

            room.state.questionLog.unshift({
                nickname: player.nickname,
                text: `CHUTOU: "${guess}"`,
                type: 'GUESS_ATTEMPT',
                timestamp: Date.now()
            });

            // No chute, a validação continua sendo "primeiro que responder define"
            // (mas se quiser votação aqui também, a lógica seria similar à da pergunta)
            // Por enquanto mantemos validação direta pelos outros
            room.state.currentAction = 'WAITING_VALIDATION'; 
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch (e) { console.error(e); }
    });

    // 3. RESPONDER PERGUNTA (VOTAÇÃO COLETIVA)
    socket.on('whoami_answer', async ({ roomId, answer }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            if (socket.data.userId === room.state.currentPlayerId) return; // Jogador da vez não vota

            // Registra o voto
            if (!room.state.currentVotes) room.state.currentVotes = {};
            room.state.currentVotes[socket.data.userId] = answer;

            // Quem precisa votar? (Todos exceto: o da vez, quem venceu, quem desistiu)
            const activeVoters = room.players.filter(p => 
                p.userId !== room.state.currentPlayerId &&
                !room.state.finished.includes(p.userId) &&
                !room.state.surrendered.includes(p.userId)
            );

            // Verificamos se todos votaram
            const votesCount = Object.keys(room.state.currentVotes).length;
            
            // Se activeVoters for 0 (ninguém pra responder), destrava o jogo
            const requiredVotes = activeVoters.length > 0 ? activeVoters.length : 0;

            if (votesCount >= requiredVotes) {
                // TODOS VOTARAM! CALCULAR RESULTADO.
                const votes = Object.values(room.state.currentVotes);
                const countYes = votes.filter(v => v === 'YES').length;
                const countNo = votes.filter(v => v === 'NO').length;
                const countMaybe = votes.filter(v => v === 'MAYBE').length;

                // Cria string de resumo
                let summary = [];
                if (countYes > 0) summary.push(`${countYes} SIM`);
                if (countNo > 0) summary.push(`${countNo} NÃO`);
                if (countMaybe > 0) summary.push(`${countMaybe} TALVEZ`);

                room.state.questionLog.unshift({
                    nickname: "Consenso",
                    text: `Resultado: ${summary.join(', ') || 'Sem resposta'}`,
                    type: 'ANSWER_SUMMARY',
                    variant: (countYes >= countNo ? 'YES' : 'NO'), 
                    timestamp: Date.now()
                });

                // Limpa votos e passa a vez
                room.state.currentVotes = {};
                await nextTurn(io, room);

            } else {
                // AINDA FALTAM VOTOS -> Apenas atualiza a tela
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }

        } catch (e) { console.error(e); }
    });

    // 4. VALIDAR CHUTE
    socket.on('whoami_validate_guess', async ({ roomId, isCorrect }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            if (socket.data.userId === room.state.currentPlayerId) return;

            const player = room.players.find(p => p.userId === room.state.currentPlayerId);

            if (isCorrect) {
                room.state.finished.push(player.userId);
                room.state.questionLog.unshift({
                    nickname: "SISTEMA",
                    text: `${player.nickname} ACERTOU e venceu!`,
                    type: 'SYSTEM',
                    timestamp: Date.now()
                });
            } else {
                room.state.questionLog.unshift({
                    nickname: "SISTEMA",
                    text: `Errou o chute! Perdeu a vez.`,
                    type: 'SYSTEM',
                    timestamp: Date.now()
                });
            }

            await nextTurn(io, room);

        } catch (e) { console.error(e); }
    });

    // 5. DESISTIR
    socket.on('whoami_give_up', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            
            if (!room.state.surrendered.includes(socket.data.userId)) {
                room.state.surrendered.push(socket.data.userId);
                room.state.questionLog.unshift({
                    nickname: "SISTEMA",
                    text: `${socket.data.nickname || 'Alguém'} desistiu.`,
                    type: 'SYSTEM',
                    timestamp: Date.now()
                });
            }

            if (room.state.currentPlayerId === socket.data.userId) {
                await nextTurn(io, room);
            } else {
                await broadcastUpdate(io, room);
            }
        } catch (e) { console.error(e); }
    });
};

// --- LÓGICA INTERNA ---

async function nextTurn(io, room) {
    let currentIdx = room.players.findIndex(p => p.userId === room.state.currentPlayerId);
    let attempts = 0;
    let found = false;

    // Tenta achar o próximo jogador válido
    while (attempts < room.players.length) {
        currentIdx = (currentIdx + 1) % room.players.length;
        const nextUserId = room.players[currentIdx].userId;
        
        const isFinished = room.state.finished.includes(nextUserId);
        const isSurrendered = room.state.surrendered.includes(nextUserId);

        if (!isFinished && !isSurrendered) {
            room.state.currentPlayerId = nextUserId;
            room.state.currentAction = 'DECIDING';
            found = true;
            break;
        }
        attempts++;
    }

    if (!found) {
        room.state.phase = 'GAME_OVER';
        room.state.currentPlayerId = null;
    }
    
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

module.exports.initGame = (room, io) => {
    // USA A LISTA QUE FOI CARREGADA NO INÍCIO
    const deck = shuffle([...CHARACTERS]);
    const assignments = {};

    room.players.forEach(p => {
        p.score = 0;
        if (deck.length > 0) assignments[p.userId] = deck.pop();
        else assignments[p.userId] = "Coringa";
    });

    room.state = {
        assignments,
        currentPlayerId: room.players[0].userId,
        currentAction: 'DECIDING', 
        surrendered: [], 
        finished: [], 
        questionLog: [],
        currentVotes: {}, 
        phase: 'PLAYING'
    };

    console.log(`[WHOAMI] Jogo iniciado com palavras: ${Object.values(assignments).join(', ')}`);
    return { phase: 'PLAYING' };
};

function getPublicData(gd, userId) {
    if (!gd) return {};
    
    const publicAssignments = {};
    const iAmDone = (gd.surrendered && gd.surrendered.includes(userId)) || 
                    (gd.finished && gd.finished.includes(userId));
    
    if (gd.assignments) {
        Object.keys(gd.assignments).forEach(pId => {
            // Se for eu E eu não terminei => Esconde
            if (pId === userId && !iAmDone) {
                publicAssignments[pId] = "???"; 
            } else {
                publicAssignments[pId] = gd.assignments[pId]; 
            }
        });
    }

    return {
        assignments: publicAssignments,
        currentPlayerId: gd.currentPlayerId,
        currentAction: gd.currentAction,
        questionLog: gd.questionLog || [],
        surrendered: gd.surrendered || [],
        finished: gd.finished || [],
        currentVotes: gd.currentVotes || {},
        phase: gd.phase
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;
        const safeGameData = getPublicData(room.state, targetUserId);

        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'WHOAMI',
            phase: room.state.phase,
            gameData: safeGameData
        });
    }
}

module.exports.getPublicData = getPublicData;