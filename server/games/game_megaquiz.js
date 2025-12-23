const QUESTIONS_DB = require('../data/themes_megaquiz.json');

const INITIAL_POINTS = 500;
const BASE_POINTS = 100;
const PENALTY_POINTS = 50;

// Tipos de Rodada
const ROUND_TYPES = ['NORMAL', 'NORMAL', 'NORMAL', 'DOUBLE', 'STEAL', 'WAGER'];

const startMegaQuiz = (io, room, roomId) => {
    // Inicializa pontos
    room.players.forEach(p => p.score = INITIAL_POINTS);
    
    // Embaralha perguntas
    const shuffledQuestions = [...QUESTIONS_DB].sort(() => Math.random() - 0.5);

    room.gameData = {
        questionsQueue: shuffledQuestions,
        currentQuestionIndex: 0,
        currentRoundType: 'NORMAL',
        roundNumber: 1,
        
        // Dados da rodada atual
        activeQuestion: null,
        playerActions: {}, // { playerId: { answer: 1, wager: 100, targetId: 'xyz' } }
        
        phase: 'PREPARE' // PREPARE -> (PRE_ACTION) -> QUESTION -> REVEAL -> END
    };
    
    room.phase = 'GAME';
    
    // Começa o loop
    nextRound(io, room, roomId);
};

const nextRound = (io, room, roomId) => {
    const gd = room.gameData;

    if (gd.currentQuestionIndex >= gd.questionsQueue.length || gd.currentQuestionIndex >= 15) { // Limite de 15 perguntas por jogo
        finishGame(io, room, roomId);
        return;
    }

    // 1. Define tipo da rodada
    // Se for single player, só tem NORMAL ou WAGER
    if (room.players.length === 1) {
        gd.currentRoundType = Math.random() > 0.7 ? 'WAGER' : 'NORMAL';
    } else {
        gd.currentRoundType = ROUND_TYPES[Math.floor(Math.random() * ROUND_TYPES.length)];
    }

    gd.activeQuestion = gd.questionsQueue[gd.currentQuestionIndex];
    gd.playerActions = {};
    
    // 2. Decide se precisa de fase de "Ação Prévia" (Aposta ou Escolher Vítima)
    if (gd.currentRoundType === 'WAGER' || gd.currentRoundType === 'STEAL') {
        gd.phase = 'PRE_ACTION';
        io.to(roomId).emit('game_started', { // Reutilizando evento para update forçado
            gameType: 'MEGAQUIZ',
            phase: 'GAME',
            gameData: getPublicData(room),
            players: room.players
        });
    } else {
        // Se for Normal ou Double, vai direto pra pergunta
        startQuestionPhase(io, room, roomId);
    }
};

const startQuestionPhase = (io, room, roomId) => {
    const gd = room.gameData;
    gd.phase = 'QUESTION';
    gd.endTime = Date.now() + 15000; // 15 segundos para responder

    io.to(roomId).emit('update_game_data', { 
        gameData: getPublicData(room), 
        phase: 'QUESTION' 
    });

    // Timeout para fim da pergunta
    setTimeout(() => {
        // Verifica se a fase ainda é QUESTION (para evitar bugs de duplo timeout)
        if (room.gameData.phase === 'QUESTION') {
            resolveRound(io, room, roomId);
        }
    }, 15000);
};

const resolveRound = (io, room, roomId) => {
    const gd = room.gameData;
    const q = gd.activeQuestion;

    // Processa pontuação
    room.players.forEach(p => {
        const action = gd.playerActions[p.id] || {};
        const userAnswer = action.answer;
        const isCorrect = userAnswer === q.correct;
        
        let pointsChange = 0;
        let msg = "";

        if (gd.currentRoundType === 'NORMAL') {
            pointsChange = isCorrect ? BASE_POINTS : -PENALTY_POINTS;
        } 
        else if (gd.currentRoundType === 'DOUBLE') {
            pointsChange = isCorrect ? (BASE_POINTS * 2) : -(PENALTY_POINTS * 2);
        }
        else if (gd.currentRoundType === 'WAGER') {
            const wager = action.wager || 0; // Se não apostou, é 0
            pointsChange = isCorrect ? wager : -wager;
        }
        else if (gd.currentRoundType === 'STEAL') {
            // Se acertou, ganha o base E rouba do alvo
            if (isCorrect) {
                pointsChange += BASE_POINTS;
                const targetId = action.targetId;
                const target = room.players.find(tp => tp.id === targetId);
                
                // Só rouba se o alvo existir e não for ele mesmo
                if (target && target.id !== p.id) {
                    const stealAmount = 150;
                    target.score -= stealAmount;
                    pointsChange += stealAmount; // Ladrão ganha o roubado
                    msg = `Roubou ${stealAmount} de ${target.nickname}!`;
                }
            } else {
                pointsChange = -PENALTY_POINTS;
            }
        }

        p.score += pointsChange;
        // Evita pontuação negativa? Não, deixa ficar negativo pra ser engraçado!
        
        // Salva resultado pra mostrar no front
        action.pointsChange = pointsChange;
        action.isCorrect = isCorrect;
        action.msg = msg;
    });

    gd.phase = 'REVEAL';
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });

    // Espera 5s e vai pra próxima
    setTimeout(() => {
        gd.currentQuestionIndex++;
        gd.roundNumber++;
        nextRound(io, room, roomId);
    }, 6000);
};

const finishGame = (io, room, roomId) => {
    // Ordena vencedores
    const winners = [...room.players].sort((a,b) => b.score - a.score);
    io.to(roomId).emit('game_over', { 
        winner: winners[0].nickname, 
        results: winners,
        gameData: getPublicData(room)
    });
};

const getPublicData = (room) => {
    const gd = room.gameData;
    // Esconde a resposta correta se estiver na fase de pergunta
    const safeQuestion = gd.activeQuestion ? {
        ...gd.activeQuestion,
        correct: (gd.phase === 'REVEAL') ? gd.activeQuestion.correct : undefined
    } : null;

    return {
        phase: gd.phase,
        roundType: gd.currentRoundType,
        roundNumber: gd.roundNumber,
        question: safeQuestion,
        endTime: gd.endTime,
        scores: room.players.map(p => ({ id: p.id, nickname: p.nickname, score: p.score })),
        // Retorna resultados da rodada (quem acertou/errou) apenas no Reveal
        roundResults: (gd.phase === 'REVEAL') ? gd.playerActions : {},
        isSinglePlayer: room.players.length === 1
    };
};

const registerMegaQuizHandlers = (io, socket, rooms) => {
    // Enviar Ação Prévia (Aposta ou Escolha de Vítima)
    socket.on('quiz_send_action', ({ roomId, action }) => { // action: { wager: 200 } OU { targetId: '...' }
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;

        if (gd.phase !== 'PRE_ACTION') return;

        if (!gd.playerActions[socket.id]) gd.playerActions[socket.id] = {};
        
        if (gd.currentRoundType === 'WAGER') gd.playerActions[socket.id].wager = action.wager;
        if (gd.currentRoundType === 'STEAL') gd.playerActions[socket.id].targetId = action.targetId;

        // Se todos mandaram ação, inicia a pergunta
        const allReady = room.players.every(p => gd.playerActions[p.id] && (gd.playerActions[p.id].wager !== undefined || gd.playerActions[p.id].targetId !== undefined));
        
        if (allReady) {
            startQuestionPhase(io, room, roomId);
        } else {
             // Atualiza para mostrar quem já está pronto
             io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'PRE_ACTION' });
        }
    });

    // Enviar Resposta
    socket.on('quiz_submit_answer', ({ roomId, answerIndex }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;

        if (gd.phase !== 'QUESTION') return;

        if (!gd.playerActions[socket.id]) gd.playerActions[socket.id] = {};
        gd.playerActions[socket.id].answer = answerIndex;

        // Se todos responderam, encerra antecipado (opcional, deixa o timer para dar emoção)
        // Vamos deixar o timer rolar para dar chance de mudar de ideia? Não, quiz geralmente trava a resposta.
        // Vamos deixar travar a resposta.
    });
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers };