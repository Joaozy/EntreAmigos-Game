const THEMES = require('../data/themes_spy.json');

const startSpy = (io, room, roomId) => {
    // 1. Sorteia Categoria e Palavra
    const themeObj = THEMES[Math.floor(Math.random() * THEMES.length)];
    const secretWord = themeObj.words[Math.floor(Math.random() * themeObj.words.length)];
    
    // 2. Sorteia Espião
    const spyPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    // 3. Define Ordem de Turnos (Shuffle inicial)
    // Criamos uma cópia dos IDs para gerenciar a rotação
    const turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);

    // 4. Configura Estado do Jogo
    const duration = 10 * 60 * 1000; // 10 minutos totais (segurança)
    
    room.gameData = {
        category: themeObj.category,
        secretWord: secretWord, // Guardado no servidor, enviado só pra civis
        questions: themeObj.questions,
        spyId: spyPlayer.id,
        
        // Estado da Rodada de Perguntas
        currentQuestionIndex: 0, // 0, 1 ou 2
        turnOrder: turnOrder,    // Lista de IDs na ordem atual
        currentTurnIndex: 0,     // Índice do jogador que deve responder agora
        answers: [],             // Histórico de respostas: { playerId, nickname, text, questionIdx }
        
        endTime: Date.now() + duration,
        phase: 'QUESTIONS', // QUESTIONS -> DISCUSSION -> REVEAL
        isRevealed: false
    };
    
    room.phase = 'GAME';

    // 5. Envia dados para todos (Dados Públicos)
    io.to(roomId).emit('game_started', { 
        gameType: 'SPY', 
        phase: 'GAME', 
        gameData: getPublicGameData(room),
        players: room.players 
    });

    // 6. Envia segredos individuais
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
        currentTurnId: gd.turnOrder[gd.currentTurnIndex], // ID de quem responde agora
        answers: gd.answers,
        endTime: gd.endTime,
        phase: gd.phase,
        isRevealed: gd.isRevealed,
        // Se já revelou, manda tudo, senão esconde
        secretWord: gd.isRevealed ? gd.secretWord : null,
        spyId: gd.isRevealed ? gd.spyId : null
    };
};

const handleSpyRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    
    if (gd.spyId === oldId) { gd.spyId = newId; updated = true; }
    
    // Atualiza na ordem de turnos
    const turnIdx = gd.turnOrder.indexOf(oldId);
    if (turnIdx !== -1) { gd.turnOrder[turnIdx] = newId; updated = true; }

    return updated;
};

const registerSpyHandlers = (io, socket, rooms) => {
    socket.on('spy_submit_answer', ({ roomId, answer }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameType !== 'SPY') return;
        const gd = room.gameData;

        // Verifica se é a vez do jogador
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

        // Verifica se todos responderam a pergunta atual
        if (gd.currentTurnIndex >= gd.turnOrder.length) {
            // Fim da Pergunta Atual
            if (gd.currentQuestionIndex < 2) {
                // Vai para a próxima pergunta
                gd.currentQuestionIndex++;
                
                // ROTACIONA A ORDEM (Jogador 2 vira o primeiro, etc)
                const first = gd.turnOrder.shift();
                gd.turnOrder.push(first);
                
                gd.currentTurnIndex = 0; // Reseta para o novo primeiro
            } else {
                // Acabaram as perguntas -> Fase de Discussão Livre
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
        room.gameData.phase = 'REVEAL'; // Atualiza fase interna
        
        io.to(roomId).emit('game_over', { 
            gameData: getPublicGameData(room),
            phase: 'REVEAL'
        });
    });
};

module.exports = { startSpy, registerSpyHandlers, handleSpyRejoin };