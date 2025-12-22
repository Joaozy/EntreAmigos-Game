const THEMES = require('../data/themes_spy.json');

const startSpy = (io, room, roomId) => {
    // 1. Sorteia Categoria e Palavra
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    
    // 2. Sorteia Espião
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    // 3. Define Ordem de Turnos (Shuffle inicial)
    const turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);

    // 4. Configura Estado do Jogo
    const duration = 10 * 60 * 1000; // 10 minutos
    
    room.gameData = {
        category: themeObj.category,
        secretWord: secretWord, 
        questions: themeObj.questions,
        spyId: spyPlayer.id,
        
        // Estado das Perguntas
        currentQuestionIndex: 0,
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        answers: [],
        
        endTime: Date.now() + duration,
        phase: 'QUESTIONS',
        isRevealed: false
    };
    
    room.phase = 'GAME';

    // 5. Envia dados PÚBLICOS
    io.to(roomId).emit('game_started', { 
        gameType: 'SPY', 
        phase: 'GAME', 
        gameData: getPublicGameData(room),
        players: room.players 
    });

    // 6. Envia segredos INDIVIDUAIS
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
    return {
        category: gd.category,
        questions: gd.questions,
        currentQuestionIndex: gd.currentQuestionIndex,
        currentTurnId: gd.turnOrder[gd.currentTurnIndex], 
        answers: gd.answers,
        endTime: gd.endTime,
        phase: gd.phase,
        isRevealed: gd.isRevealed,
        // Só envia segredos se o jogo acabou
        secretWord: gd.isRevealed ? gd.secretWord : null,
        spyId: gd.isRevealed ? gd.spyId : null
    };
};

const handleSpyRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    
    if (gd.spyId === oldId) { gd.spyId = newId; updated = true; }
    
    const turnIdx = gd.turnOrder.indexOf(oldId);
    if (turnIdx !== -1) { gd.turnOrder[turnIdx] = newId; updated = true; }

    return updated;
};

const registerSpyHandlers = (io, socket, rooms) => {
    socket.on('spy_submit_answer', ({ roomId, answer }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameType !== 'SPY') return;
        const gd = room.gameData;

        // Verifica vez
        const expectedId = gd.turnOrder[gd.currentTurnIndex];
        if (socket.id !== expectedId) return;

        // Salva resposta
        const player = room.players.find(p => p.id === socket.id);
        gd.answers.push({
            playerId: socket.id,
            nickname: player ? player.nickname : '???',
            text: answer,
            questionIndex: gd.currentQuestionIndex
        });

        // Avança turno
        gd.currentTurnIndex++;

        // Se todos responderam
        if (gd.currentTurnIndex >= gd.turnOrder.length) {
            if (gd.currentQuestionIndex < 2) {
                // Próxima pergunta
                gd.currentQuestionIndex++;
                // Rotaciona quem começa (o primeiro vai pro fim)
                const first = gd.turnOrder.shift();
                gd.turnOrder.push(first);
                gd.currentTurnIndex = 0; 
            } else {
                // Acabou as perguntas
                gd.phase = 'DISCUSSION';
            }
        }

        io.to(roomId).emit('update_game_data', { 
            gameData: getPublicGameData(room), 
            phase: 'GAME' 
        });
    });

    socket.on('spy_reveal', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id) return;

        room.gameData.isRevealed = true;
        room.gameData.phase = 'REVEAL';
        
        io.to(roomId).emit('game_over', { 
            gameData: getPublicGameData(room),
            phase: 'REVEAL'
        });
    });
};

module.exports = { startSpy, registerSpyHandlers, handleSpyRejoin };