const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');
const path = require('path');
const fs = require('fs');

let QUESTIONS = [];

try {
    const dataPath = path.resolve(__dirname, '../data/themes_megaquiz.json');
    if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const json = JSON.parse(raw);
        const rawList = Array.isArray(json) ? json : (json.questions || []);
        
        if (rawList.length > 0) {
            QUESTIONS = rawList.map(item => {
                let finalAnswer = item.answer;
                if (finalAnswer === undefined) finalAnswer = item.a;
                if (finalAnswer === undefined) finalAnswer = item.correct;
                if (finalAnswer === undefined) finalAnswer = 0;

                return {
                    question: item.question || item.q || "Erro",
                    options: item.options || [],
                    answer: parseInt(finalAnswer)
                };
            });
            console.log(`[MEGAQUIZ] ${QUESTIONS.length} perguntas carregadas.`);
        }
    }
} catch (e) { console.error("[MEGAQUIZ] Erro JSON:", e.message); }

const activeTimers = {}; 

module.exports = (io, socket, RoomManager) => {
    
    socket.on('megaquiz_answer', async ({ roomId, answerIdx }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || room.state.phase !== 'QUESTION') return;
            
            if (room.state.answers[socket.id] === undefined) {
                room.state.answers[socket.id] = answerIdx;
                room.state.answerOrder.push(socket.id);
            }
            
            await RoomManager.saveRoom(room);
            module.exports.checkAnswers(io, room);

        } catch(e) { console.error("[MEGAQUIZ] Erro answer:", e); }
    });

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
        } catch(e) { console.error("[MEGAQUIZ] Erro restart:", e); }
    });
};

module.exports.checkAnswers = async (io, room) => {
    const gd = room.state;
    const activeAndOnline = room.players.filter(p => {
        const isAlive = gd.mode === 'BATTLE' ? p.score > 0 : p.lives > 0;
        return isAlive && p.isOnline;
    });

    const answersCount = activeAndOnline.filter(p => gd.answers[p.socketId] !== undefined).length;

    if (gd.round > 20 && answersCount >= 1) {
        await resolveRound(io, room.id);
        return;
    }

    if (answersCount >= activeAndOnline.length && activeAndOnline.length > 0) {
        await resolveRound(io, room.id);
    } else {
        await broadcastUpdate(io, room);
    }
};

module.exports.initGame = (room, io) => {
    const isMultiplayer = room.players.length >= 2;
    const mode = isMultiplayer ? 'BATTLE' : 'SURVIVAL';
    
    room.players.forEach(p => {
        if (mode === 'SURVIVAL') { p.lives = 3; p.score = 0; } 
        else { p.score = 1000; p.lives = 1; }
    });

    const state = {
        mode,
        deck: shuffle([...QUESTIONS]), 
        round: 0, 
        phase: 'PRE_ROUND',
        currentQuestion: null, 
        answers: {}, 
        answerOrder: [],
        specialEvent: null,
        winner: null
    };

    if (io) setTimeout(() => startRound(io, room.id), 1000);
    return { phase: 'PRE_ROUND', gameData: getPublicData(state) };
};

function prepareQuestion(q) {
    if (!q) return null;
    const optionsWithFlag = q.options.map((opt, index) => ({
        text: opt,
        isCorrect: index === q.answer
    }));

    const shuffled = shuffle(optionsWithFlag);
    const newOptions = shuffled.map(o => o.text);
    const newAnswerIndex = shuffled.findIndex(o => o.isCorrect);

    return {
        question: q.question,
        options: newOptions,
        answer: newAnswerIndex
    };
}

async function startRound(io, roomId) {
    const room = await RoomManager.getRoom(roomId);
    
    // --- 1. CHECAGEM ANTI-ZUMBI (NOVO) ---
    // Se a sala não existe OU não tem ninguém online, PARA TUDO.
    if (!room) return;
    const onlinePlayers = room.players.filter(p => p.isOnline).length;
    
    if (onlinePlayers === 0) {
        console.log(`[MEGAQUIZ] 🛑 Sala ${roomId} vazia. Encerrando jogo para economizar recursos.`);
        if(activeTimers[roomId]) { clearInterval(activeTimers[roomId]); delete activeTimers[roomId]; }
        return; // <--- O PULO DO GATO: Isso mata o loop.
    }
    // -------------------------------------
    
    if (!room.state?.deck?.length) room.state.deck = shuffle([...QUESTIONS]);
    const gd = room.state;

    const alive = room.players.filter(p => gd.mode === 'BATTLE' ? p.score > 0 : p.lives > 0);
    if ((room.players.length > 1 && alive.length <= 1) || alive.length === 0) {
        const winner = alive.length > 0 ? alive[0] : room.players.sort((a,b) => b.score - a.score)[0];
        await endGame(io, roomId, winner);
        return;
    }

    gd.round = (gd.round || 0) + 1;
    gd.answers = {};
    gd.answerOrder = [];
    
    gd.specialEvent = null;
    if (gd.round <= 20 && gd.round % 5 === 0) {
        const events = ['DOUBLE_DAMAGE', 'HEALING', 'STEAL'];
        gd.specialEvent = events[Math.floor(Math.random() * events.length)];
    } else if (gd.round > 20) {
        gd.specialEvent = 'SUDDEN_DEATH';
    }

    const rawQuestion = gd.deck.pop();
    gd.currentQuestion = prepareQuestion(rawQuestion);
    gd.phase = 'PRE_ROUND';
    
    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);

    // Usa setTimeout mas verifica se a sala ainda existe antes de prosseguir
    setTimeout(async () => {
        const r = await RoomManager.getRoom(roomId);
        if(!r || r.players.every(p => !p.isOnline)) return; // Checagem dupla
        
        r.state.phase = 'QUESTION';
        await RoomManager.saveRoom(r);
        await broadcastUpdate(io, r); 
        startQuestionTimer(io, roomId);
    }, 4000);
}

function startQuestionTimer(io, roomId) {
    if(activeTimers[roomId]) clearInterval(activeTimers[roomId]);
    let timeLeft = 20;
    
    activeTimers[roomId] = setInterval(async () => {
        timeLeft--;
        
        // Opcional: Para o timer se a sala esvaziar no meio da pergunta
        // (Isso evita logs de timer desnecessários)
        const hasClients = io.sockets.adapter.rooms.get(roomId);
        if(!hasClients || hasClients.size === 0) {
             clearInterval(activeTimers[roomId]);
             delete activeTimers[roomId];
             return;
        }

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
    // Checagem Anti-Zumbi também no resolve
    if (!room || room.players.every(p => !p.isOnline)) {
        console.log(`[MEGAQUIZ] 🛑 Sala ${roomId} vazia no resolve. Parando.`);
        return;
    }

    const gd = room.state;
    if(!gd.currentQuestion) return startRound(io, roomId);

    const correct = gd.currentQuestion.answer;
    let logs = [];

    if (gd.specialEvent === 'SUDDEN_DEATH') {
        const firstId = gd.answerOrder[0];
        const shooter = room.players.find(p => p.socketId === firstId);
        const damage = 100 + ((gd.round - 20) * 50);

        if (!shooter) {
            logs.push("Ninguém atirou! Todos -50pts");
            room.players.forEach(p => p.score = Math.max(0, p.score - 50));
        } else {
            const ans = gd.answers[firstId];
            if (ans === correct) {
                logs.push(`${shooter.nickname} ACERTOU PRIMEIRO!`);
                room.players.forEach(t => {
                    if (t.userId !== shooter.userId && t.score > 0) {
                        t.score = Math.max(0, t.score - damage);
                        logs.push(`${t.nickname} sofreu -${damage}`);
                    }
                });
            } else {
                shooter.score = Math.max(0, shooter.score - damage);
                logs.push(`${shooter.nickname} ERROU! (-${damage}pts)`);
            }
        }
    } else {
        room.players.forEach(p => {
            const ans = gd.answers[p.socketId];
            const isAlive = gd.mode === 'BATTLE' ? p.score > 0 : p.lives > 0;
            if (!isAlive || !p.isOnline) return;

            const acertou = (ans === correct);

            if (gd.mode === 'SURVIVAL') {
                if (acertou) p.score += 100;
                else { p.lives--; logs.push(`${p.nickname} perdeu vida`); }
            } else {
                if (acertou) {
                    if (gd.specialEvent === 'HEALING') { p.score += 100; logs.push(`${p.nickname} curou!`); }
                    else if (gd.specialEvent === 'STEAL') { 
                        p.score += 50; 
                        logs.push(`${p.nickname} roubou pts!`);
                    }
                } else {
                    let dmg = gd.specialEvent === 'DOUBLE_DAMAGE' ? 100 : 50;
                    p.score = Math.max(0, p.score - dmg);
                    logs.push(`${p.nickname} errou (-${dmg})`);
                }
            }
        });
    }

    gd.phase = 'RESULT';
    await RoomManager.saveRoom(room);
    
    io.to(roomId).emit('megaquiz_round_end', { 
        correctAnswer: correct, 
        logs, 
        players: room.players,
        specialEvent: gd.specialEvent
    });
    
    await broadcastUpdate(io, room);
    setTimeout(() => startRound(io, roomId), 6000);
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
        round: gd.round, phase: gd.phase, mode: gd.mode, specialEvent: gd.specialEvent,
        currentQuestion: (gd.phase === 'RESULT' || gd.phase === 'VICTORY') ? gd.currentQuestion : q,
        answers: gd.answers || {}, winner: gd.winner
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id, players: room.players, gameType: 'MEGAQUIZ',
            phase: room.state.phase, gameData: getPublicData(room.state)
        });
    }
}

module.exports.getPublicData = getPublicData;