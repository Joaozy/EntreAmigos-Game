const CHARACTERS = require('../data/themes_whoami.json');

// Auxiliar Shuffle
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const startWhoAmI = (io, room, roomId) => {
    // 1. Embaralha lista completa
    // Verifica se CHARACTERS existe para evitar crash
    if (!CHARACTERS || CHARACTERS.length === 0) {
        console.error("ERRO: themes_whoami.json vazio ou não encontrado.");
        return;
    }

    const availableWords = shuffle([...CHARACTERS]);

    // 2. Distribui Personagens
    room.players.forEach((p, index) => {
        p.secretWord = availableWords[index % availableWords.length];
        p.isGuessed = false;
        p.hasHintAvailable = false; 
    });

    // 3. Define Ordem
    const turnOrder = shuffle(room.players.map(p => p.id));

    room.gameData = {
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        currentQuestion: null,
        votes: {}, 
        totalQuestions: 0,
        phase: 'PLAYING', 
        winners: [],
        hintTargetId: null
    };
    
    room.phase = 'GAME'; // Fase da sala genérica

    // CORREÇÃO: Envia phase: 'PLAYING' para o front renderizar a interface correta
    io.to(roomId).emit('game_started', { 
        gameType: 'WHOAMI', 
        phase: 'PLAYING', 
        gameData: getPublicGameData(room),
        players: room.players 
    });
};

const getPublicGameData = (room) => {
    const gd = room.gameData;
    const playersPublic = room.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        character: p.secretWord, 
        isGuessed: p.isGuessed,
        hasHintAvailable: p.hasHintAvailable
    }));

    return {
        currentTurnId: gd.turnOrder[gd.currentTurnIndex],
        currentQuestion: gd.currentQuestion,
        votes: gd.votes,
        phase: gd.phase,
        playersData: playersPublic,
        winners: gd.winners,
        totalQuestions: gd.totalQuestions,
        hintTargetId: gd.hintTargetId
    };
};

const handleWhoAmIRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    const turnIdx = gd.turnOrder.indexOf(oldId);
    if (turnIdx !== -1) { gd.turnOrder[turnIdx] = newId; updated = true; }
    if (gd.votes[oldId]) { gd.votes[newId] = gd.votes[oldId]; delete gd.votes[oldId]; updated = true; }
    if (gd.hintTargetId === oldId) { gd.hintTargetId = newId; updated = true; }
    return updated;
};

const registerWhoAmIHandlers = (io, socket, rooms) => {
    // Jogador faz uma pergunta
    socket.on('whoami_ask', ({ roomId, question }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const gd = room.gameData;

        if (socket.id !== gd.turnOrder[gd.currentTurnIndex]) return;

        gd.currentQuestion = question;
        gd.votes = {}; 
        gd.phase = 'VOTING';
        gd.totalQuestions++; 

        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'VOTING' });
    });

    // Outros votam
    socket.on('whoami_vote', ({ roomId, vote }) => { 
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;

        if (socket.id === gd.turnOrder[gd.currentTurnIndex]) return;
        gd.votes[socket.id] = vote;

        // Espera votos de todos (menos quem perguntou)
        const votersCount = room.players.length - 1; 
        const currentVotes = Object.keys(gd.votes).length;

        if (currentVotes >= votersCount) {
            gd.phase = 'RESULT';
            io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'RESULT' });
            
            setTimeout(() => {
                // Lógica de Dica (a cada 10 perguntas)
                if (gd.totalQuestions > 0 && gd.totalQuestions % 10 === 0) {
                     const currentPlayer = room.players.find(p => p.id === gd.turnOrder[gd.currentTurnIndex]);
                     if (currentPlayer) {
                         currentPlayer.hasHintAvailable = true;
                         io.to(roomId).emit('receive_message', { 
                             nickname: 'SISTEMA', 
                             text: `🎁 ${currentPlayer.nickname} ganhou uma DICA!` 
                         });
                     }
                }

                advanceTurn(room);
                
                gd.currentQuestion = null;
                gd.votes = {};
                gd.phase = 'PLAYING';
                
                io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
            }, 3500);
        } else {
            io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'VOTING' });
        }
    });

    // Pedir Dica
    socket.on('whoami_request_hint', ({ roomId, targetId }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        const player = room.players.find(p => p.id === socket.id);

        if (socket.id !== gd.turnOrder[gd.currentTurnIndex] || !player.hasHintAvailable) return;

        player.hasHintAvailable = false; 
        gd.hintTargetId = targetId;
        gd.phase = 'HINT_MODE'; 

        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'HINT_MODE' });
    });

    // Enviar Dica
    socket.on('whoami_send_hint', ({ roomId, hint }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        if (socket.id !== gd.hintTargetId) return;

        io.to(roomId).emit('receive_message', { 
            nickname: 'DICA', 
            text: `💡 Dica: "${hint}"` 
        });

        gd.hintTargetId = null;
        gd.phase = 'PLAYING';
        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
    });

    // Chutar
    socket.on('whoami_guess', ({ roomId, guess }) => {
        const room = rooms.get(roomId); if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        
        if (player.secretWord.toLowerCase() === guess.toLowerCase()) {
            player.isGuessed = true;
            room.gameData.winners.push(player.nickname);
            
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} ACERTOU! Era ${player.secretWord}.` });
            
            if (room.players.every(p => p.isGuessed)) {
                io.to(roomId).emit('game_over', { winner: 'TODOS', gameData: getPublicGameData(room) });
            } else {
                advanceTurn(room);
                io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
            }
        } else {
             io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `❌ ${player.nickname} chutou "${guess}" e ERROU!` });
             advanceTurn(room); 
             io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
        }
    });
};

function advanceTurn(room) {
    const gd = room.gameData;
    let steps = 0;
    // Avança para o próximo jogador que ainda NÃO acertou
    do {
        gd.currentTurnIndex = (gd.currentTurnIndex + 1) % gd.turnOrder.length;
        steps++;
    } while (room.players.find(p => p.id === gd.turnOrder[gd.currentTurnIndex])?.isGuessed && steps < room.players.length);
}

module.exports = { startWhoAmI, registerWhoAmIHandlers, handleWhoAmIRejoin };