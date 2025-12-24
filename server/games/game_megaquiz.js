const { shuffle } = require('../utils/helpers');

// --- 1. CARREGAMENTO DE DADOS ---
let QUESTIONS = [];
try {
    const loaded = require('../data/themes_megaquiz.json');
    if (Array.isArray(loaded) && loaded.length > 0) {
        QUESTIONS = loaded.map(q => ({
            question: q.q || q.question || q.pergunta || q.enunciado || q.text || "Pergunta sem texto",
            options: q.options || q.opcoes || q.alternativas || [],
            answer: (q.correct !== undefined) ? q.correct : (q.answer !== undefined) ? q.answer : (q.resposta !== undefined) ? q.resposta : 0,
            theme: q.theme || q.tema || "Geral"
        })).filter(q => q.options.length > 0);
    }
} catch (e) {
    console.warn("[MEGAQUIZ] Erro JSON:", e.message);
}

if (QUESTIONS.length === 0) {
    QUESTIONS = [
        { question: "Qual é a capital da França?", options: ["Paris", "Londres", "Berlim", "Roma"], answer: 0, theme: "Geografia" },
        { question: "Quanto é 5 x 5?", options: ["20", "25", "30", "10"], answer: 1, theme: "Matemática" },
        { question: "Quem pintou a Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Michelangelo"], answer: 2, theme: "Arte" }
    ];
}

const STARTING_POINTS_BATTLE = 1000;

const startMegaQuiz = (io, room, roomId) => {
    let deck = shuffle([...QUESTIONS]);
    
    // DECIDE O MODO DE JOGO
    const mode = room.players.length < 3 ? 'SURVIVAL' : 'BATTLE';

    room.players.forEach(p => {
        if (mode === 'SURVIVAL') {
            p.score = 0;      
            p.lives = 3;      
            p.isDead = false;
        } else {
            p.score = STARTING_POINTS_BATTLE; 
            p.bet = 0;
            p.lives = null; 
        }
        p.lastAnswer = null; 
    });

    room.gameData = {
        mode: mode, 
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
    
    // --- CORREÇÃO DE SEGURANÇA (CRASH FIX) ---
    // Se o jogo foi interrompido (ex: voltou pro lobby) e o gameData foi limpo,
    // ou se o deck não existe, aborta a rodada para não crashar o servidor.
    if (!gd || !gd.deck || room.phase !== 'GAME') {
        return;
    }
    
    // --- VERIFICAÇÃO DE FIM DE JOGO ---
    if (gd.mode === 'SURVIVAL') {
        const activePlayers = room.players.filter(p => p.lives > 0);
        if (activePlayers.length === 0) {
            endGame(io, room, roomId);
            return;
        }
    } else {
        // BATTLE ROYALE
        const alivePlayers = room.players.filter(p => p.score > 0);
        if (gd.round >= 15 && alivePlayers.length <= 1) {
            endGame(io, room, roomId);
            return;
        }
    }

    // Reset da rodada
    gd.answers = {};
    gd.firstAnswer = null;
    gd.attackData = null;
    room.players.forEach(p => p.bet = 0);

    // Pega pergunta (Recicla se acabar)
    if (gd.deck.length === 0) gd.deck = shuffle([...QUESTIONS]);
    gd.currentQuestion = gd.deck.pop();

    // --- FLUXO DE RODADAS ---
    if (gd.mode === 'BATTLE') {
        if (gd.round === 12) {
            gd.phase = 'BETTING';
            updateGame(io, room, roomId);
            let timeLeft = 15;
            gd.timer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) { 
                    if(gd.timer) clearInterval(gd.timer); 
                    gd.phase = 'QUESTION'; 
                    startQuestionTimer(io, room, roomId); 
                } 
                else { io.to(roomId).emit('megaquiz_timer', timeLeft); }
            }, 1000);
            return;
        }
    }

    gd.phase = 'PRE_ROUND'; 
    updateGame(io, room, roomId);
    
    setTimeout(() => {
        // Verifica novamente se o jogo ainda está ativo antes de começar
        if (room.phase === 'GAME' && room.gameData && room.gameData.deck) {
            gd.phase = 'QUESTION';
            startQuestionTimer(io, room, roomId);
        }
    }, 3000);
};

const endGame = (io, room, roomId) => {
    const winner = room.players.sort((a,b) => b.score - a.score)[0];
    io.to(roomId).emit('game_over', { 
        winner: winner, 
        results: room.players,
        phase: 'VICTORY',
        gameData: getPublicData(room)
    });
};

const startQuestionTimer = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd) return; // Proteção extra
    if (gd.timer) clearInterval(gd.timer);

    gd.questionStartTime = Date.now();
    let duration = 20;

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
    if (gd && gd.timer) clearInterval(gd.timer);
    if (!gd || !gd.currentQuestion) return;

    const correctAnswerIdx = gd.currentQuestion.answer;
    let roundLog = []; 

    // --- RESOLUÇÃO MODO SURVIVAL ---
    if (gd.mode === 'SURVIVAL') {
        let anyoneDied = false;
        room.players.forEach(p => {
            if (p.lives > 0) {
                const answer = gd.answers[p.id];
                const isCorrect = answer === correctAnswerIdx;
                
                if (isCorrect) {
                    p.score += 100;
                } else {
                    p.lives -= 1;
                    if (p.lives === 0) {
                        roundLog.push(`💀 ${p.nickname} perdeu a última vida!`);
                        anyoneDied = true;
                    } 
                }
            }
        });
        if (!anyoneDied) {
             const correctCount = room.players.filter(p => p.lives > 0 && gd.answers[p.id] === correctAnswerIdx).length;
             if (correctCount > 0) roundLog.push(`${correctCount} acertos!`);
             else roundLog.push("Ninguém acertou.");
        }
    } 
    // --- RESOLUÇÃO MODO BATTLE ---
    else {
        if (gd.round === 8 && gd.firstAnswer) {
             const { playerId, answerIdx } = gd.firstAnswer;
             const player = room.players.find(p => p.id === playerId);
             const isCorrect = answerIdx === correctAnswerIdx;
             const sortedPlayers = [...room.players].sort((a,b) => b.score - a.score);
             let target = sortedPlayers[0];
             if (target.id === playerId && sortedPlayers.length > 1) target = sortedPlayers[1];
             if (isCorrect) { player.score += 500; if(target) target.score = Math.max(0, target.score - 500); roundLog.push(`⚡ ${player.nickname} ROUBOU 500pts de ${target?.nickname}!`); }
             else { player.score = Math.max(0, player.score - 500); if(target) target.score += 500; roundLog.push(`❌ ${player.nickname} ERROU e deu 500pts para ${target?.nickname}!`); }
        }
        else if (gd.round >= 15 && gd.firstAnswer) {
             const { playerId, answerIdx } = gd.firstAnswer;
             const player = room.players.find(p => p.id === playerId);
             if (answerIdx === correctAnswerIdx) {
                 gd.phase = 'ATTACK';
                 gd.attackData = { attackerId: playerId, damage: 300 };
                 roundLog.push(`⚔️ ${player.nickname} ACERTOU! Escolhendo vítima...`);
                 updateGame(io, room, roomId);
                 return;
             } else {
                 player.score = Math.max(0, player.score - 300);
                 roundLog.push(`💀 ${player.nickname} ERROU e perdeu 300pts.`);
             }
        }
        else {
            let correctNames = [];
            room.players.forEach(p => {
                if (gd.answers[p.id] !== undefined) {
                    const isCorrect = gd.answers[p.id] === correctAnswerIdx;
                    if (isCorrect) correctNames.push(p.nickname);
                    
                    if (gd.round === 12) { if (isCorrect) p.score += p.bet; else p.score = Math.max(0, p.score - p.bet); }
                    else { let pts = isCorrect ? 100 : -50; if (gd.round === 4) pts *= 2; p.score = Math.max(0, p.score + pts); }
                }
            });
            if (correctNames.length > 0) roundLog.push(`✅ Acertaram: ${correctNames.join(", ")}`);
            else roundLog.push("Ninguém acertou.");
        }
    }

    finalizeRound(io, room, roomId, roundLog);
};

const finalizeRound = (io, room, roomId, logs) => {
    const gd = room.gameData;
    if (!gd) return;

    gd.phase = 'RESULT';
    io.to(roomId).emit('megaquiz_round_end', { correctAnswer: gd.currentQuestion.answer, logs, players: room.players });
    updateGame(io, room, roomId);
    
    // Timer para próxima rodada
    setTimeout(() => {
        // VERIFICA SE O JOGO AINDA EXISTE ANTES DE INICIAR A PRÓXIMA RODADA
        if (room.phase === 'GAME' && room.gameData && room.gameData.deck) {
            gd.round++; 
            startRound(io, room, roomId); 
        }
    }, 5000);
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd) return {};
    const safeQuestion = gd.currentQuestion ? { ...gd.currentQuestion, answer: undefined } : null;
    return {
        round: gd.round,
        phase: gd.phase,
        mode: gd.mode,
        currentQuestion: safeQuestion,
        attackData: gd.attackData
    };
};

const updateGame = (io, room, roomId) => {
    if (!room.gameData) return;
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: room.gameData.phase });
    io.to(roomId).emit('update_players', room.players);
};

const registerMegaQuizHandlers = (io, socket, rooms) => {
    socket.on('megaquiz_bet', ({ roomId, amount }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameData || room.gameData.phase !== 'BETTING') return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.bet = Math.min(Math.max(0, parseInt(amount)), player.score);
    });

    socket.on('megaquiz_answer', ({ roomId, answerIdx }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameData || room.gameData.phase !== 'QUESTION') return;
        const gd = room.gameData;
        if (gd.answers[socket.id] !== undefined) return;

        gd.answers[socket.id] = answerIdx;

        if (gd.mode === 'BATTLE' && (gd.round === 8 || gd.round >= 15) && !gd.firstAnswer) {
            gd.firstAnswer = { playerId: socket.id, answerIdx: answerIdx };
            resolveRound(io, room, roomId); 
            return;
        }

        const alivePlayers = room.players.filter(p => gd.mode === 'SURVIVAL' ? p.lives > 0 : p.score > 0);
        let activeAnswers = 0;
        alivePlayers.forEach(p => { if (gd.answers[p.id] !== undefined) activeAnswers++; });

        if (activeAnswers >= alivePlayers.length) {
            resolveRound(io, room, roomId);
        }
    });

    socket.on('megaquiz_attack', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameData || room.gameData.phase !== 'ATTACK') return;
        const gd = room.gameData;
        if (gd.attackData?.attackerId === socket.id) {
            const target = room.players.find(p => p.id === targetId);
            const attacker = room.players.find(p => p.id === socket.id);
            let log = [];
            if (target) { target.score = Math.max(0, target.score - gd.attackData.damage); log.push(`⚔️ ${attacker.nickname} atacou ${target.nickname} (-${gd.attackData.damage})!`); }
            finalizeRound(io, room, roomId, log);
        }
    });
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers };