const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// Configuração
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
const CATEGORIES = [
    "Nome", "CEP (Cidade/Estado/País)", "Animal", "Cor", 
    "Objeto", "Alimento", "Profissão", "Minha Sogra é..."
];

module.exports = (io, socket, RoomManager) => {

    // 1. JOGADOR DIGITA (AGORA SALVANDO!)
    socket.on('stop_answer', async ({ roomId, answers }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || room.state.phase !== 'PLAYING') return;

            const userId = socket.data.userId;

            // Garante existência dos objetos
            if (!room.state.answers) room.state.answers = {};
            if (!room.state.answers[userId]) room.state.answers[userId] = {};

            // Atualiza as respostas
            room.state.answers[userId] = answers;
            
            // --- CORREÇÃO CRÍTICA: PERSISTÊNCIA ---
            // Precisamos salvar agora, senão o Redis/Server "esquece" os dados
            // quando outra requisição (como o stop_call) vier buscar a sala.
            await RoomManager.saveRoom(room);
            // -------------------------------------

        } catch (e) { console.error("[STOP] Erro answer:", e); }
    });

    // 2. ALGUÉM APERTOU STOP!
    socket.on('stop_call', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'PLAYING') return;

            const stopper = room.players.find(p => p.userId === socket.data.userId);
            room.state.stopperId = socket.data.userId;
            room.state.phase = 'VALIDATION';
            
            if (!room.state.answers) room.state.answers = {};

            // Inicializa validação garantindo que todos tenham entrada
            room.state.validations = {};
            room.players.forEach(p => {
                if (!room.state.answers[p.userId]) room.state.answers[p.userId] = {};
                room.state.validations[p.userId] = {}; 
            });

            await RoomManager.saveRoom(room);
            
            // Envia evento avisando quem parou
            io.to(roomId).emit('stop_called', { 
                stopper: stopper?.nickname || "Alguém",
                answers: room.state.answers 
            });
            
            // Atualiza a tela de todos para a fase de Validação
            await broadcastUpdate(io, room);

        } catch (e) { console.error("[STOP] Erro stop_call:", e); }
    });

    // 3. VALIDAR RESPOSTA
    socket.on('stop_validate', async ({ roomId, targetUserId, categoryIdx, isValid }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'VALIDATION') return;

            // Blindagem de objetos
            if (!room.state.validations) room.state.validations = {};
            if (!room.state.validations[targetUserId]) room.state.validations[targetUserId] = {};
            if (!room.state.validations[targetUserId][categoryIdx]) room.state.validations[targetUserId][categoryIdx] = {};

            const voterId = socket.data.userId;
            room.state.validations[targetUserId][categoryIdx][voterId] = isValid;

            // Salva o voto
            await RoomManager.saveRoom(room);

            // Repassa voto para UI atualizar em tempo real
            await broadcastUpdate(io, room);

        } catch (e) { console.error("[STOP] Erro validate:", e); }
    });

    // 4. FINALIZAR RODADA
    socket.on('stop_finish_round', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            
            const player = room.players.find(p => p.userId === socket.data.userId);
            if (!player?.isHost || room.state.phase !== 'VALIDATION') return;

            calculateScores(room);
            
            room.state.phase = 'SCORING';
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch (e) { console.error("[STOP] Erro finish round:", e); }
    });

    // 5. PRÓXIMA RODADA
    socket.on('stop_next', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.players.find(p=>p.userId === socket.data.userId)?.isHost) {
                const init = module.exports.initGame(room, io);
                
                room.state = { 
                    ...init.gameData, 
                    round: (room.state.round || 0) + 1,
                    // Mantém scores antigos se existirem no state anterior, 
                    // mas o initGame já lida com players.score
                };
                room.phase = 'PLAYING';
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- LÓGICA ---

module.exports.initGame = (room, io) => {
    const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    
    // Garante score inicial
    room.players.forEach(p => {
        if (p.score === undefined) p.score = 0;
    });

    const state = {
        letter,
        categories: CATEGORIES,
        answers: {},     
        validations: {}, 
        stopperId: null,
        round: room.state?.round || 1,
        phase: 'PLAYING'
    };

    // Preenche answers vazio
    room.players.forEach(p => {
        state.answers[p.userId] = {};
        state.validations[p.userId] = {};
    });

    return { phase: 'PLAYING', gameData: getPublicData(state, null) };
};

function calculateScores(room) {
    const gd = room.state;
    if (!gd.answers) gd.answers = {};
    if (!gd.validations) gd.validations = {};

    room.players.forEach(p => {
        const pId = p.userId;
        const pAnswers = gd.answers[pId] || {};
        const pValidations = gd.validations[pId] || {};

        let roundScore = 0;

        gd.categories.forEach((cat, idx) => {
            const answer = (pAnswers[idx] || "").trim().toUpperCase();
            
            // Regra 1: Vazio ou letra errada = 0
            if (!answer || answer[0] !== gd.letter) return;

            // Regra 2: Validação da maioria
            const votesObj = pValidations[idx] || {};
            const votes = Object.values(votesObj); 
            const invalidVotes = votes.filter(v => v === false).length;
            // Se mais de 50% dos votos forem 'false' (inválido), anula.
            // (Considerando total de jogadores como base ou apenas quem votou)
            // Vamos considerar apenas votos ativos para simplificar:
            if (votes.length > 0 && invalidVotes >= (votes.length / 2)) return;

            // Regra 3: Pontuação
            let isUnique = true;
            let isRepeated = false;

            room.players.forEach(other => {
                if (other.userId === pId) return;
                const otherAns = (gd.answers[other.userId]?.[idx] || "").trim().toUpperCase();
                
                if (otherAns && otherAns[0] === gd.letter) {
                    isUnique = false; 
                    if (otherAns === answer) isRepeated = true; 
                }
            });

            if (isUnique) roundScore += 20;
            else if (isRepeated) roundScore += 5;
            else roundScore += 10;
        });

        p.score += roundScore;
    });
}

function getPublicData(gd, userId) {
    if (!gd) return {};
    return { ...gd };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        // Encontra o userId correto
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;

        let safeGameData = { ...room.state };
        
        // Na fase PLAYING, só mando as minhas respostas para não colar
        if (room.state.phase === 'PLAYING') {
            const myAnswers = (room.state.answers && room.state.answers[targetUserId]) 
                ? room.state.answers[targetUserId] 
                : {};
            safeGameData.answers = { [targetUserId]: myAnswers };
        }
        // Na fase VALIDATION ou SCORING, safeGameData tem tudo (respostas de todos)

        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'STOP',
            phase: room.state.phase,
            gameData: safeGameData
        });
    }
}

module.exports.getPublicData = getPublicData;