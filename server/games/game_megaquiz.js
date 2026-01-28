const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');
const path = require('path');
const fs = require('fs');

// --- GERENCIADOR DE TIMER EM MEMÓRIA ---
const activeTimers = {}; // { roomId: intervalId }

// --- CARREGAMENTO DE DADOS (COM CORREÇÃO DE FORMATO) ---
let QUESTIONS = [];
try {
    const dataPath = path.join(__dirname, '../data/themes_megaquiz.json');
    if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const json = JSON.parse(raw);
        const rawList = Array.isArray(json) ? json : (json.questions || []);

        // --- CORREÇÃO AQUI: PADRONIZAÇÃO DOS DADOS ---
        // Converte 'q' -> 'question' e 'a' -> 'answer' se necessário
        QUESTIONS = rawList.map(item => ({
            question: item.question || item.q || "Erro: Pergunta sem texto",
            options: item.options || [],
            answer: item.answer !== undefined ? item.answer : (item.a !== undefined ? item.a : 0)
        }));
        
        console.log(`[MEGAQUIZ] ${QUESTIONS.length} perguntas carregadas.`);
    }
} catch (e) {
    console.error("[MEGAQUIZ] Erro ao carregar perguntas:", e.message);
}

// Fallback se falhar
if (QUESTIONS.length === 0) {
    QUESTIONS = [{ question: "O arquivo JSON falhou. Teste?", options: ["Sim", "Não"], answer: 0 }];
}

module.exports = (io, socket, RoomManager) => {
    
    // 1. RECEBER RESPOSTA
    socket.on('megaquiz_answer', async ({ roomId, answerIdx }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'QUESTION') return;
            
            room.state.answers[socket.id] = answerIdx;
            
            const active = room.players.filter(p => room.state.mode === 'SURVIVAL' ? p.lives > 0 : true);
            const count = active.filter(p => room.state.answers[p.socketId] !== undefined).length;
            
            await RoomManager.saveRoom(room);

            if (count >= active.length) {
                await resolveRound(io, roomId);
            }
        } catch(e) { console.error(e); }
    });

    // 2. REINICIAR
    socket.on('request_restart', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.players.find(p => p.socketId === socket.id)?.isHost) {
                const newState = module.exports.initGame(room, io);
                room.state = newState.gameData;
                room.phase = newState.phase;
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- INICIALIZAÇÃO ---
module.exports.initGame = (room, io) => {
    const mode = room.players.length < 2 ? 'SURVIVAL' : 'BATTLE';
    
    room.players.forEach(p => {
        if (mode === 'SURVIVAL') { p.lives = 3; p.score = 0; } 
        else { p.score = 0; p.lives = null; }
    });

    room.state = {
        mode, 
        deck: shuffle([...QUESTIONS]), 
        round: 0, 
        phase: 'PRE_ROUND',
        currentQuestion: null, 
        answers: {}, 
        winner: null
    };

    if (io) setTimeout(() => startRound(io, room.id), 1000);
    
    return { phase: 'PRE_ROUND', gameData: getPublicData(room.state) };
};

// --- FLUXO DO JOGO ---

async function startRound(io, roomId) {
    const room = await RoomManager.getRoom(roomId);
    if (!room) return;
    const gd = room.state;

    // Fim de Jogo?
    const alive = room.players.filter(p => gd.mode === 'SURVIVAL' ? p.lives > 0 : true);
    if ((gd.mode === 'SURVIVAL' && alive.length <= 1 && room.players.length > 1) || gd.deck.length === 0) {
        const winner = alive.length > 0 ? alive.sort((a,b) => b.score - a.score)[0] : room.players[0];
        await endGame(io, roomId, winner); 
        return;
    }

    gd.round++;
    gd.answers = {};
    gd.currentQuestion = gd.deck.pop();
    gd.phase = 'PRE_ROUND';
    
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);

    // Espera 3s
    setTimeout(async () => {
        const r = await RoomManager.getRoom(roomId);
        if(!r) return;
        r.state.phase = 'QUESTION';
        await RoomManager.saveRoom(r);
        await broadcastUpdate(io, r); 
        startQuestionTimer(io, roomId);
    }, 3000);
}

function startQuestionTimer(io, roomId) {
    if(activeTimers[roomId]) clearInterval(activeTimers[roomId]);
    
    let timeLeft = 20; // Tempo por pergunta
    
    activeTimers[roomId] = setInterval(async () => {
        timeLeft--;
        io.to(roomId).emit('megaquiz_timer', timeLeft);
        
        if (timeLeft <= 0) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
            await resolveRound(io, roomId);
        }
    }, 1000);
}

async function resolveRound(io, roomId) {
    if(activeTimers[roomId]) { clearInterval(activeTimers[roomId]); delete activeTimers[roomId]; }

    const room = await RoomManager.getRoom(roomId);
    if(!room) return;
    
    const gd = room.state;
    const correct = gd.currentQuestion.answer;
    let logs = [];

    room.players.forEach(p => {
        const ans = gd.answers[p.socketId];
        if (gd.mode === 'SURVIVAL' && p.lives <= 0) return;
        
        if (ans === correct) {
            p.score += 100;
        } else {
            if (gd.mode === 'SURVIVAL') {
                p.lives--;
                if(p.lives === 0) logs.push(`${p.nickname} eliminado!`);
            } else {
                p.score = Math.max(0, p.score - 50);
            }
        }
    });

    gd.phase = 'RESULT';
    
    await RoomManager.saveRoom(room);
    
    io.to(roomId).emit('megaquiz_round_end', { 
        correctAnswer: correct, 
        logs, 
        players: room.players 
    });
    
    await broadcastUpdate(io, room);

    setTimeout(() => startRound(io, roomId), 5000);
}

async function endGame(io, roomId, winner) {
    const room = await RoomManager.getRoom(roomId);
    if(!room) return;
    
    room.state.phase = 'VICTORY';
    room.state.winner = winner || room.players[0];
    
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

function getPublicData(gd) {
    if(!gd) return {};
    const q = gd.currentQuestion ? { ...gd.currentQuestion, answer: undefined } : null;
    return { 
        round: gd.round, 
        phase: gd.phase, 
        mode: gd.mode, 
        currentQuestion: (gd.phase === 'RESULT' || gd.phase === 'VICTORY') ? gd.currentQuestion : q,
        answers: gd.answers,
        winner: gd.winner
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'MEGAQUIZ',
            phase: room.state.phase,
            gameData: getPublicData(room.state)
        });
    }
}

module.exports.getPublicData = getPublicData;