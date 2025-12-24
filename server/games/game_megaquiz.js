const { shuffle } = require('../utils/helpers');

// --- 1. CARREGAMENTO E NORMALIZAÇÃO DE DADOS ---
let QUESTIONS = [];
try {
    const loaded = require('../data/themes_megaquiz.json');
    
    if (Array.isArray(loaded) && loaded.length > 0) {
        // NORMALIZAÇÃO: Suporta chaves "q", "question", "pergunta" e "correct", "answer"
        QUESTIONS = loaded.map(q => ({
            question: q.q || q.question || q.pergunta || q.enunciado || q.text || "Pergunta sem texto",
            options: q.options || q.opcoes || q.alternativas || [],
            answer: (q.correct !== undefined) ? q.correct : 
                    (q.answer !== undefined) ? q.answer : 
                    (q.resposta !== undefined) ? q.resposta : 0,
            theme: q.theme || q.tema || "Geral"
        })).filter(q => q.options.length > 0);
    }
} catch (e) {
    console.warn("[MEGAQUIZ] Erro JSON:", e.message);
}

// Backup de segurança
if (QUESTIONS.length === 0) {
    QUESTIONS = [
        { question: "Qual é a capital da França?", options: ["Paris", "Londres", "Berlim", "Roma"], answer: 0, theme: "Geografia" },
        { question: "Quanto é 10 + 10?", options: ["20", "25", "30", "10"], answer: 0, theme: "Matemática" },
        { question: "Quem descobriu o Brasil?", options: ["Colombo", "Cabral", "Vasco da Gama", "Dom Pedro"], answer: 1, theme: "História" }
    ];
}

const STARTING_POINTS = 1000;

const startMegaQuiz = (io, room, roomId) => {
    console.log(`[MEGAQUIZ] Iniciando jogo na sala ${roomId}...`);

    let deck = shuffle([...QUESTIONS]);

    // Inicializa jogadores
    room.players.forEach(p => {
        p.score = STARTING_POINTS;
        p.bet = 0;
        p.lastAnswer = null; 
    });

    room.gameData = {
        deck: deck,
        round: 1, 
        phase: 'PRE_ROUND', 
        currentQuestion: null,
        questionStartTime: null,
        answers: {}, 
        firstAnswer: null, 
        attackData: null, 
        timer: null
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', { 
        gameType: 'MEGAQUIZ', 
        phase: 'PRE_ROUND', 
        gameData: getPublicData(room), 
        players: room.players 
    });

    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    
    // --- VERIFICAÇÃO DE FIM DE JOGO (SOBREVIVÊNCIA) ---
    // Se sobrar apenas 1 jogador com pontos (ou 0), o jogo acaba IMEDIATAMENTE.
    const alivePlayers = room.players.filter(p => p.score > 0);
    
    if (alivePlayers.length <= 1) {
        // Se tem 1 vivo, ele ganha. Se todos morreram, ganha quem tinha mais pontos antes de morrer (ou o último vivo)
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : room.players.sort((a,b)=>b.score-a.score)[0];
        
        console.log(`[MEGAQUIZ] Fim de jogo na sala ${roomId}. Vencedor: ${winner?.nickname}`);
        
        io.to(roomId).emit('game_over', { 
            winner: winner, 
            results: room.players,
            phase: 'VICTORY',
            gameData: getPublicData(room)
        });
        return;
    }

    // Reset da rodada
    gd.answers = {};
    gd.firstAnswer = null;
    gd.attackData = null;
    room.players.forEach(p => p.bet = 0);

    // Pega pergunta
    if (gd.deck.length === 0) gd.deck = shuffle([...QUESTIONS]);
    gd.currentQuestion = gd.deck.pop();

    // Define fluxo
    if (gd.round === 12) {
        gd.phase = 'BETTING';
        updateGame(io, room, roomId);
        
        let timeLeft = 15;
        gd.timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(gd.timer);
                gd.phase = 'QUESTION';
                startQuestionTimer(io, room, roomId);
            } else {
                io.to(roomId).emit('megaquiz_timer', timeLeft);
            }
        }, 1000);

    } else {
        gd.phase = 'PRE_ROUND'; 
        updateGame(io, room, roomId);
        
        setTimeout(() => {
            gd.phase = 'QUESTION';
            startQuestionTimer(io, room, roomId);
        }, 3000);
    }
};

const startQuestionTimer = (io, room, roomId) => {
    const gd = room.gameData;
    if (gd.timer) clearInterval(gd.timer);

    gd.questionStartTime = Date.now();
    let duration = 20; // 20 segundos

    updateGame(io, room, roomId); 

    gd.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gd.questionStartTime) / 1000);
        const timeLeft = duration - elapsed;

        if (timeLeft <= 0) {
            clearInterval(gd.timer);
            resolveRound(io, room, roomId);
        } else {
            io.to(roomId).emit('megaquiz_timer', timeLeft);
        }
    }, 1000);
};

const resolveRound = (io, room, roomId) => {
    const gd = room.gameData;
    if (gd.timer) clearInterval(gd.timer);
    if (!gd.currentQuestion) return;

    const correctAnswerIdx = gd.currentQuestion.answer;
    let roundLog = []; 

    // R8: ROUBO
    if (gd.round === 8) {
        if (gd.firstAnswer) {
            const { playerId, answerIdx } = gd.firstAnswer;
            const player = room.players.find(p => p.id === playerId);
            const isCorrect = answerIdx === correctAnswerIdx;
            
            const sortedPlayers = [...room.players].sort((a,b) => b.score - a.score);
            let target = sortedPlayers[0];
            if (target.id === playerId && sortedPlayers.length > 1) target = sortedPlayers[1];

            if (isCorrect) {
                player.score += 500;
                if(target) target.score = Math.max(0, target.score - 500);
                roundLog.push(`⚡ ${player.nickname} ROUBOU 500pts de ${target ? target.nickname : 'alguém'}!`);
            } else {
                player.score = Math.max(0, player.score - 500);
                if(target) target.score += 500;
                roundLog.push(`❌ ${player.nickname} ERROU e deu 500pts para ${target ? target.nickname : 'alguém'}!`);
            }
        } else {
            roundLog.push("Ninguém respondeu a tempo.");
        }
    }
    // R15+: ATAQUE
    else if (gd.round >= 15) {
        if (gd.firstAnswer) {
            const { playerId, answerIdx } = gd.firstAnswer;
            const player = room.players.find(p => p.id === playerId);
            
            if (answerIdx === correctAnswerIdx) {
                gd.phase = 'ATTACK';
                gd.attackData = { attackerId: playerId, damage: 300 };
                roundLog.push(`⚔️ ${player.nickname} ACERTOU! Escolhendo vítima...`);
                updateGame(io, room, roomId);
                return; // Pausa para esperar o ataque
            } else {
                player.score = Math.max(0, player.score - 300);
                roundLog.push(`💀 ${player.nickname} ERROU e perdeu 300pts.`);
            }
        } else {
            roundLog.push("Tempo esgotado.");
        }
    }
    // NORMAL
    else {
        let correctNames = [];
        let wrongNames = [];

        room.players.forEach(p => {
            if (gd.answers[p.id] !== undefined) {
                const isCorrect = gd.answers[p.id] === correctAnswerIdx;
                if (isCorrect) correctNames.push(p.nickname);
                else wrongNames.push(p.nickname);

                if (gd.round === 12) { 
                    if (isCorrect) p.score += p.bet;
                    else p.score = Math.max(0, p.score - p.bet);
                } else { 
                    let points = isCorrect ? 100 : -50;
                    if (gd.round === 4) points *= 2; 
                    p.score = Math.max(0, p.score + points);
                }
            }
        });

        if (correctNames.length > 0) roundLog.push(`✅ Acertaram: ${correctNames.join(", ")}`);
        if (wrongNames.length > 0) roundLog.push(`❌ Erraram: ${wrongNames.join(", ")}`);
        if (correctNames.length === 0 && wrongNames.length === 0) roundLog.push("Ninguém respondeu.");
    }

    finalizeRound(io, room, roomId, roundLog);
};

const finalizeRound = (io, room, roomId, logs) => {
    const gd = room.gameData;
    gd.phase = 'RESULT';
    
    // Atualiza o estado global para que o frontend mude de tela
    io.to(roomId).emit('megaquiz_round_end', {
        correctAnswer: gd.currentQuestion.answer,
        logs: logs,
        players: room.players
    });
    
    // IMPORTANTE: Envia update_game_data com a fase RESULT para sincronizar
    updateGame(io, room, roomId);

    setTimeout(() => {
        gd.round++;
        startRound(io, room, roomId);
    }, 5000);
};

const getPublicData = (room) => {
    const gd = room.gameData;
    const safeQuestion = gd.currentQuestion ? { ...gd.currentQuestion, answer: undefined } : null;

    return {
        round: gd.round,
        phase: gd.phase,
        currentQuestion: safeQuestion,
        attackData: gd.attackData
    };
};

const updateGame = (io, room, roomId) => {
    io.to(roomId).emit('update_game_data', { 
        gameData: getPublicData(room), 
        phase: room.gameData.phase 
    });
    io.to(roomId).emit('update_players', room.players);
};

// HANDLERS
const registerMegaQuizHandlers = (io, socket, rooms) => {
    socket.on('megaquiz_bet', ({ roomId, amount }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'BETTING') return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.bet = Math.min(Math.max(0, parseInt(amount)), player.score);
    });

    socket.on('megaquiz_answer', ({ roomId, answerIdx }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'QUESTION') return;
        
        const gd = room.gameData;
        if (gd.answers[socket.id] !== undefined) return;

        gd.answers[socket.id] = answerIdx;

        // Gatilho Rápido
        if ((gd.round === 8 || gd.round >= 15) && !gd.firstAnswer) {
            gd.firstAnswer = { playerId: socket.id, answerIdx: answerIdx };
            resolveRound(io, room, roomId); 
            return;
        }

        // Skip Timer
        if (gd.round !== 8 && gd.round < 15) {
            const alivePlayers = room.players.filter(p => p.score > 0);
            const answersCount = Object.keys(gd.answers).length;
            if (answersCount >= alivePlayers.length) resolveRound(io, room, roomId);
        }
    });

    socket.on('megaquiz_attack', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'ATTACK') return;
        const gd = room.gameData;
        if (gd.attackData?.attackerId === socket.id) {
            const target = room.players.find(p => p.id === targetId);
            const attacker = room.players.find(p => p.id === socket.id);
            let log = [];
            if (target) {
                target.score = Math.max(0, target.score - gd.attackData.damage);
                log.push(`⚔️ ${attacker.nickname} atacou ${target.nickname} (-${gd.attackData.damage})!`);
            }
            finalizeRound(io, room, roomId, log);
        }
    });
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers };