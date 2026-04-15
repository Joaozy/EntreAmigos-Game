const { shuffle } = require('../utils/helpers');

module.exports = (io, socket, RoomManager) => {
    
    // 1. Carregar Estado
    socket.on('quale_load_state', async () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = await RoomManager.getRoom(roomId);
        if (room && room.gameType === 'QUALEANOTA') {
            updateGame(io, room, roomId);
        }
    });
    socket.on('quale_request_secret', async () => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        const userId = socket.data.userId;
        
        if (room && room.state.narratorId === userId) {
            socket.emit('quale_my_secret', room.state.secretRating);
        }
    });

    // 2. Enviar Perguntas (Fase ASKING)
    socket.on('quale_submit_question', async ({ questionIndex, questionText }) => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        if (!room || room.state.phase !== 'ASKING') return;

        const userId = socket.data.userId;
        const q = room.state.questions[questionIndex];
        
        if (q && q.askerId === userId) {
            q.question = questionText;
        }

        // Se todas as perguntas foram feitas, avança para o Narrador responder
        const allQuestionsAsked = room.state.questions.every(q => q.question !== null && q.question.trim() !== '');
        if (allQuestionsAsked) {
            room.state.phase = 'ANSWERING';
        }

        await RoomManager.saveRoom(room);
        updateGame(io, room, roomId);
    });

    // 3. Enviar Respostas do Narrador (Fase ANSWERING)
    socket.on('quale_submit_answer', async ({ answers }) => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        if (!room || room.state.phase !== 'ANSWERING') return;

        const userId = socket.data.userId;
        if (userId === room.state.narratorId) {
            // answers é um array [resp1, resp2]
            room.state.questions[0].answer = answers[0];
            room.state.questions[1].answer = answers[1];
            room.state.phase = 'GUESSING';
            
            await RoomManager.saveRoom(room);
            updateGame(io, room, roomId);
        }
    });

    // 4. Enviar Palpites (Fase GUESSING)
    socket.on('quale_submit_guess', async ({ guess }) => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        if (!room || room.state.phase !== 'GUESSING') return;

        const userId = socket.data.userId;
        
        // Narrador não chuta
        if (userId === room.state.narratorId) return;

        room.state.guesses[userId] = guess;

        // Se todos os não-narradores chutaram
        const nonNarrators = room.players.filter(p => p.userId !== room.state.narratorId);
        if (Object.keys(room.state.guesses).length >= nonNarrators.length) {
            calculateResult(room);
        }

        await RoomManager.saveRoom(room);
        updateGame(io, room, roomId);
    });

    // 5. Próxima Rodada
    socket.on('quale_next_round', async () => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        const player = room?.players.find(p => p.socketId === socket.id);
        
        if (room && player?.isHost && (room.state.phase === 'REVEAL' || room.state.phase === 'END')) {
            if (room.state.phase === 'END') return; // Jogo já acabou
            
            startNewRound(room);
            await RoomManager.saveRoom(room);
            updateGame(io, room, roomId);
        }
    });
};

function startNewRound(room) {
    const state = room.state;
    
    // 1. Controle de Fila e Ciclos (Rotatividade do Narrador)
    if (!state.narratorQueue || state.narratorQueue.length === 0) {
        state.cycle = (state.cycle || 0) + 1;
        
        // Regra de fim de jogo
        const maxCycles = room.players.length >= 6 ? 1 : 2;
        if (state.cycle > maxCycles) {
            state.phase = 'END';
            room.phase = 'END';
            return;
        }
        
        // Refaz a fila de narradores embaralhada
        state.narratorQueue = shuffle(room.players.map(p => p.userId));
    }

    const narratorId = state.narratorQueue.pop();
    const secretRating = Math.floor(Math.random() * 10) + 1;

    // 2. Escolher os Inquisidores (Quem faz as perguntas)
    let nonNarrators = room.players.filter(p => p.userId !== narratorId);
    let askers = [];
    
    if (nonNarrators.length === 1) {
        // Se só tem 2 jogando: o outro faz as 2 perguntas
        askers = [nonNarrators[0].userId, nonNarrators[0].userId];
    } else if (nonNarrators.length === 2) {
        // Se tem 3 jogando: cada um faz 1
        askers = [nonNarrators[0].userId, nonNarrators[1].userId];
    } else {
        // Mais de 3 jogando: Pega 2 aleatórios
        const shuffled = shuffle([...nonNarrators]);
        askers = [shuffled[0].userId, shuffled[1].userId];
    }

    // 3. Montar o estado inicial da rodada
    state.round = (state.round || 0) + 1;
    state.narratorId = narratorId;
    state.secretRating = secretRating;
    state.questions = [
        { askerId: askers[0], question: null, answer: null },
        { askerId: askers[1], question: null, answer: null }
    ];
    state.guesses = {};
    state.phase = 'ASKING';
    room.phase = 'ASKING';
}

module.exports.initGame = (room) => {
    room.state = {
        scores: {},
        cycle: 0,
        narratorQueue: []
    };
    
    // Zera os pontos iniciais
    room.players.forEach(p => room.state.scores[p.userId] = 0);
    
    startNewRound(room);
    return { phase: room.phase }; // Retorna apenas a fase para evitar sobrescrever a nota
};

function calculateResult(room) {
    const gd = room.state;
    let correctCount = 0;
    
    const isScoringActive = room.players.length > 2;

    for (const [userId, guess] of Object.entries(gd.guesses)) {
        if (parseInt(guess) === gd.secretRating) {
            correctCount++;
            if (isScoringActive) gd.scores[userId] = (gd.scores[userId] || 0) + 2; // Acertador ganha 2
        }
    }

    if (isScoringActive && correctCount > 0) {
        gd.scores[gd.narratorId] = (gd.scores[gd.narratorId] || 0) + (correctCount * 1); // Narrador ganha 1 por cada acerto
    }

    room.players.forEach(p => p.score = gd.scores[p.userId] || 0);
    gd.phase = 'REVEAL';
    room.phase = 'REVEAL';
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { 
        gameData: getPublicData(room.state), 
        phase: room.state.phase 
    });
}

function getPublicData(gd) {
    if (!gd) return {};
    const isReveal = gd.phase === 'REVEAL' || gd.phase === 'END';

    // Oculta palpites de quem ainda não chutou (Manda só um true/false pra saber quem já foi)
    let safeGuesses = {};
    if (isReveal) {
        safeGuesses = gd.guesses;
    } else {
        Object.keys(gd.guesses || {}).forEach(k => safeGuesses[k] = true);
    }

    return {
        round: gd.round,
        phase: gd.phase,
        narratorId: gd.narratorId,
        questions: gd.questions,
        scores: gd.scores,
        guesses: safeGuesses,
        // Envia a nota secreta pra todo mundo APENAS no reveal
        secretRating: isReveal ? gd.secretRating : null
    };
}