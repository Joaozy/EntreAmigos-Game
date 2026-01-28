const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

const activeTimers = {}; // { roomId: intervalId }

let CATEGORIES = [
    "Nome", "CEP", "Animal", "Cor", "Fruta", "Objeto", "Marca", "Filme/Série", "Profissão", "Sogra"
];
try {
    const loaded = require('../data/categories_stop.json');
    if (Array.isArray(loaded)) CATEGORIES = loaded;
} catch (e) {}

module.exports = (io, socket, RoomManager) => {

    // 1. ENVIAR RESPOSTAS
    socket.on('stop_submit', async ({ roomId, answers }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'PLAYING') return;

            room.state.answers[socket.data.userId] = answers;
            await RoomManager.saveRoom(room);
        } catch(e) { console.error(e); }
    });

    // 2. GRITAR STOP
    socket.on('stop_call', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'PLAYING') return;

            room.state.stopperId = socket.data.userId;
            await endRound(io, roomId, 'STOP_CALLED');
        } catch(e) { console.error(e); }
    });

    // 3. VALIDAR
    socket.on('stop_validate', async ({ roomId, targetUserId, category }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'VALIDATION') return;

            if (!room.state.invalidations[targetUserId]) room.state.invalidations[targetUserId] = {};
            if (!room.state.invalidations[targetUserId][category]) room.state.invalidations[targetUserId][category] = [];

            const votes = room.state.invalidations[targetUserId][category];
            const voterId = socket.data.userId;

            if (votes.includes(voterId)) {
                room.state.invalidations[targetUserId][category] = votes.filter(id => id !== voterId);
            } else {
                votes.push(voterId);
            }

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 4. CONFIRMAR
    socket.on('stop_finish_validation', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.players.find(p=>p.userId === socket.data.userId)?.isHost) return;

            calculateScore(room);
            room.state.phase = 'RESULT';
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 5. PRÓXIMA RODADA
    socket.on('stop_next_round', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.players.find(p=>p.userId === socket.data.userId)?.isHost) {
                // Aqui usamos o setup assíncrono pois o jogo já está rodando
                setupNewRoundState(room.state);
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
                startTimer(io, roomId);
            }
        } catch(e) { console.error(e); }
    });
};

// --- HELPERS DE ESTADO ---

function setupNewRoundState(state) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letter = alphabet[Math.floor(Math.random() * alphabet.length)];
    const shuffledCats = [...CATEGORIES].sort(() => 0.5 - Math.random()).slice(0, 5);

    state.round = (state.round || 0) + 1;
    state.letter = letter;
    state.categories = shuffledCats;
    state.answers = {};
    state.invalidations = {};
    state.stopperId = null;
    state.phase = 'PLAYING';
}

// --- INICIALIZAÇÃO ---

module.exports.initGame = (room, io) => {
    // 1. Cria o objeto de estado inicial JÁ CONFIGURADO
    const initialState = {
        round: 0,
        categories: [],
        letter: '',
        answers: {},
        invalidations: {},
        phase: 'PLAYING', // Força estado inicial PLAYING
        stopperId: null
    };

    // 2. Aplica a configuração da primeira rodada SÍNCRONA
    setupNewRoundState(initialState);
    
    // 3. Define o estado na sala
    room.state = initialState;

    // 4. Inicia o timer (após breve delay para garantir que o socket conectou)
    if(io) {
        setTimeout(() => startTimer(io, room.id), 500);
    }
    
    // 5. Retorna o estado PRONTO para o server.js salvar
    return { phase: 'PLAYING', gameData: getPublicData(initialState, null) };
};

function startTimer(io, roomId) {
    if(activeTimers[roomId]) clearInterval(activeTimers[roomId]);

    let timeLeft = 180; 
    activeTimers[roomId] = setInterval(async () => {
        timeLeft--;
        io.to(roomId).emit('stop_timer', timeLeft);
        
        if (timeLeft <= 0) {
            clearInterval(activeTimers[roomId]);
            await endRound(io, roomId, 'TIME_UP');
        }
    }, 1000);
}

async function endRound(io, roomId, reason) {
    if(activeTimers[roomId]) { clearInterval(activeTimers[roomId]); delete activeTimers[roomId]; }

    const room = await RoomManager.getRoom(roomId);
    if(!room) return;

    room.state.phase = 'VALIDATION';
    room.state.stopReason = reason;
    
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

function calculateScore(room) {
    const minInvalidVotes = Math.ceil(room.players.length / 2);

    room.players.forEach(p => {
        let roundScore = 0;
        const myAnswers = room.state.answers[p.userId] || {};

        room.state.categories.forEach(cat => {
            const ans = (myAnswers[cat] || "").trim().toUpperCase();
            
            const votes = (room.state.invalidations[p.userId] && room.state.invalidations[p.userId][cat]) || [];
            if (votes.length >= minInvalidVotes) return; 

            if (ans === "") return; 
            if (!ans.startsWith(room.state.letter)) return; 

            let isUnique = true;
            room.players.forEach(other => {
                if (other.userId === p.userId) return;
                const otherAns = (room.state.answers[other.userId]?.[cat] || "").trim().toUpperCase();
                if (otherAns === ans) isUnique = false;
            });

            roundScore += isUnique ? 20 : 10;
        });

        if (p.userId === room.state.stopperId) roundScore += 10; 
        p.score = (p.score || 0) + roundScore;
    });
}

function getPublicData(gd, userId) {
    if (!gd) return {};
    
    if (gd.phase === 'PLAYING') {
        return {
            round: gd.round,
            letter: gd.letter,
            categories: gd.categories,
            phase: gd.phase,
            answers: { [userId]: gd.answers[userId] || {} } // Filtra respostas
        };
    }
    return gd;
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'STOP',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

module.exports.getPublicData = getPublicData;