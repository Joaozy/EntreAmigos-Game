const THEMES = require('../data/themes_spy.json');

// Função auxiliar para embaralhar array
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const startSpy = (io, room, roomId) => {
    // 1. Sorteia Categoria e Palavra
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    
    // 2. Sorteia Espião
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    // 3. Sorteia 3 perguntas únicas
    const shuffledQuestions = shuffle([...themeObj.questions]).slice(0, 3);

    // 4. Define Ordem de Turnos
    const turnOrder = shuffle(room.players.map(p => p.id));

    // 5. Configura Estado
    const duration = 15 * 60 * 1000; // Tempo de segurança
    
    room.gameData = {
        category: themeObj.category,
        secretWord: secretWord, 
        possibleWords: themeObj.words, // Envia lista completa para o espião chutar
        questions: shuffledQuestions,
        spyId: spyPlayer.id,
        
        // Estado das Perguntas
        currentQuestionIndex: 0,
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        answers: [],
        
        // Estado de Votação
        votes: {}, // { voterId: targetId }
        
        endTime: Date.now() + duration,
        phase: 'QUESTIONS', // QUESTIONS -> DISCUSSION -> VOTING -> SPY_GUESS -> REVEAL
        winner: null,       // 'SPY' ou 'CIVILIANS'
        winReason: null     // Motivo da vitória
    };
    
    room.phase = 'GAME';

    // 6. Envia dados iniciais
    io.to(roomId).emit('game_started', { 
        gameType: 'SPY', 
        phase: 'GAME', 
        gameData: getPublicGameData(room),
        players: room.players 
    });

    // 7. Envia segredos (Identidades)
    room.players.forEach(p => {
        const isSpy = p.id === spyPlayer.id;
        io.to(p.id).emit('spy_secret', { 
            role: isSpy ? 'ESPIÃO' : 'CIVIL',
            word: isSpy ? null : secretWord,
            category: themeObj.category
        });
    });
};

const getPublicGameData = (room) => {
    const gd = room.gameData;
    const isOver = gd.phase === 'REVEAL';
    return {
        category: gd.category,
        possibleWords: gd.possibleWords, // Lista pública para todos consultarem
        questions: gd.questions,
        currentQuestionIndex: gd.currentQuestionIndex,
        currentTurnId: gd.turnOrder[gd.currentTurnIndex], 
        answers: gd.answers,
        phase: gd.phase,
        votes: gd.votes,
        // Revelações finais
        secretWord: isOver ? gd.secretWord : null,
        spyId: isOver ? gd.spyId : null,
        winner: gd.winner,
        winReason: gd.winReason
    };
};

const handleSpyRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    if (gd.spyId === oldId) { gd.spyId = newId; updated = true; }
    
    // Atualiza turnos
    const turnIdx = gd.turnOrder.indexOf(oldId);
    if (turnIdx !== -1) { gd.turnOrder[turnIdx] = newId; updated = true; }
    
    // Atualiza votos
    if (gd.votes[oldId]) { gd.votes[newId] = gd.votes[oldId]; delete gd.votes[oldId]; updated = true; }
    Object.keys(gd.votes).forEach(voter => {
        if (gd.votes[voter] === oldId) { gd.votes[voter] = newId; updated = true; }
    });

    return updated;
};

const registerSpyHandlers = (io, socket, rooms) => {
    // --- RESPOSTAS DAS PERGUNTAS ---
    socket.on('spy_submit_answer', ({ roomId, answer }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameType !== 'SPY') return;
        const gd = room.gameData;

        if (socket.id !== gd.turnOrder[gd.currentTurnIndex]) return;

        const player = room.players.find(p => p.id === socket.id);
        gd.answers.push({
            playerId: socket.id,
            nickname: player ? player.nickname : '???',
            text: answer,
            questionIndex: gd.currentQuestionIndex
        });

        gd.currentTurnIndex++;

        // Fim do Turno da Pergunta
        if (gd.currentTurnIndex >= gd.turnOrder.length) {
            if (gd.currentQuestionIndex < 2) {
                gd.currentQuestionIndex++;
                const first = gd.turnOrder.shift(); gd.turnOrder.push(first); // Roda quem começa
                gd.currentTurnIndex = 0; 
            } else {
                gd.phase = 'DISCUSSION';
            }
        }
        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: gd.phase });
    });

    // --- INICIAR VOTAÇÃO (Host) ---
    socket.on('spy_start_voting', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id) return;
        room.gameData.phase = 'VOTING';
        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'VOTING' });
    });

    // --- VOTAR EM ALGUÉM ---
    socket.on('spy_vote', ({ roomId, targetId }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        // Registra voto
        gd.votes[socket.id] = targetId;

        // Verifica se todos votaram
        if (Object.keys(gd.votes).length >= room.players.length) {
            // Contagem
            const counts = {};
            Object.values(gd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            
            // Acha o mais votado
            let maxVotes = 0;
            let accusedId = null;
            Object.entries(counts).forEach(([id, count]) => {
                if (count > maxVotes) { maxVotes = count; accusedId = id; }
            });

            // Se o mais votado for o Espião -> Espião tem chance de chutar
            if (accusedId === gd.spyId) {
                gd.phase = 'SPY_GUESS';
                io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'SPY_GUESS' });
            } else {
                // Civis votaram errado -> Espião Ganha
                gd.winner = 'SPY';
                gd.winReason = 'Civis votaram na pessoa errada!';
                gd.phase = 'REVEAL';
                io.to(roomId).emit('game_over', { gameData: getPublicGameData(room), phase: 'REVEAL' });
            }
        } else {
            io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'VOTING' });
        }
    });

    // --- ESPIÃO CHUTA A PALAVRA (Chance Final) ---
    socket.on('spy_guess_location', ({ roomId, word }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        if (socket.id !== gd.spyId) return;

        if (word.toUpperCase() === gd.secretWord.toUpperCase()) {
            gd.winner = 'SPY';
            gd.winReason = 'O Espião foi descoberto, mas adivinhou a palavra secreta!';
        } else {
            gd.winner = 'CIVILIANS';
            gd.winReason = `O Espião errou a palavra! Ele chutou "${word}".`;
        }
        gd.phase = 'REVEAL';
        io.to(roomId).emit('game_over', { gameData: getPublicGameData(room), phase: 'REVEAL' });
    });
};

module.exports = { startSpy, registerSpyHandlers, handleSpyRejoin };