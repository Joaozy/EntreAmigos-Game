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
    const availableWords = shuffle([...CHARACTERS]);

    // 2. Distribui Personagens
    room.players.forEach((p, index) => {
        p.secretWord = availableWords[index % availableWords.length];
        p.isGuessed = false;
        p.hasHintAvailable = false; // Controle de dicas individuais
    });

    // 3. Define Ordem
    const turnOrder = shuffle(room.players.map(p => p.id));

    room.gameData = {
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        currentQuestion: null,
        votes: {}, 
        totalQuestions: 0, // Contador global de perguntas feitas
        phase: 'PLAYING', 
        winners: [],
        hintTargetId: null // Quem vai dar a dica (na fase de HINT)
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', { 
        gameType: 'WHOAMI', 
        phase: 'GAME', 
        gameData: getPublicGameData(room),
        players: room.players 
    });
};

const getPublicGameData = (room) => {
    const gd = room.gameData;
    const playersPublic = room.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        character: p.secretWord, // Front esconde o próprio
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
        gd.totalQuestions++; // Incrementa contador

        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'VOTING' });
    });

    // Outros votam
    socket.on('whoami_vote', ({ roomId, vote }) => { 
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;

        if (socket.id === gd.turnOrder[gd.currentTurnIndex]) return;
        gd.votes[socket.id] = vote;

        // Simplificação: Espera votos de todos (menos quem perguntou)
        const votersCount = room.players.length - 1; 
        const currentVotes = Object.keys(gd.votes).length;

        if (currentVotes >= votersCount) {
            gd.phase = 'RESULT';
            io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'RESULT' });
            
            setTimeout(() => {
                // VERIFICA SE GANHOU DIREITO A DICA (A cada 10 perguntas globais)
                // E se o jogador atual ainda não usou/ganhou dica recentemente (opcional, aqui simplificado)
                if (gd.totalQuestions > 0 && gd.totalQuestions % 10 === 0) {
                     // Libera dica para o jogador ATUAL
                     const currentPlayer = room.players.find(p => p.id === gd.turnOrder[gd.currentTurnIndex]);
                     if (currentPlayer) currentPlayer.hasHintAvailable = true;
                     
                     io.to(roomId).emit('receive_message', { 
                         nickname: 'SISTEMA', 
                         text: `A cada 10 rodadas, uma DICA é liberada! ${currentPlayer.nickname} ganhou uma dica.` 
                     });
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

    // Jogador pede dica (escolhe alguém para dar a dica)
    socket.on('whoami_request_hint', ({ roomId, targetId }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        const player = room.players.find(p => p.id === socket.id);

        if (socket.id !== gd.turnOrder[gd.currentTurnIndex] || !player.hasHintAvailable) return;

        player.hasHintAvailable = false; // Consome a dica
        gd.hintTargetId = targetId;
        gd.phase = 'HINT_MODE'; // Nova fase onde o Target escreve a dica

        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'HINT_MODE' });
    });

    // Jogador envia a dica
    socket.on('whoami_send_hint', ({ roomId, hint }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        if (socket.id !== gd.hintTargetId) return;

        // Mostra a dica para todos
        io.to(roomId).emit('receive_message', { 
            nickname: 'DICA', 
            text: `Dica para o jogador atual: "${hint}"` 
        });

        // Volta ao jogo normal (mas não avança turno ainda, ele pode chutar ou passar)
        gd.hintTargetId = null;
        gd.phase = 'PLAYING';
        io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
    });

    // Jogador tenta adivinhar
    socket.on('whoami_guess', ({ roomId, guess }) => {
        const room = rooms.get(roomId); if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        
        if (player.secretWord.toLowerCase() === guess.toLowerCase()) {
            player.isGuessed = true;
            room.gameData.winners.push(player.nickname);
            
            if (room.players.every(p => p.isGuessed)) {
                io.to(roomId).emit('game_over', { winner: 'TODOS', gameData: getPublicGameData(room) });
            } else {
                io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `${player.nickname} ACERTOU! Era ${player.secretWord}.` });
                // Passa a vez após acertar (opcional, pode manter se quiser que ele ajude os outros)
                advanceTurn(room);
                io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
            }
        } else {
             io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `${player.nickname} chutou ${guess} e ERROU!` });
             advanceTurn(room); // Errou chute = passa a vez
             io.to(roomId).emit('update_game_data', { gameData: getPublicGameData(room), phase: 'PLAYING' });
        }
    });
};

function advanceTurn(room) {
    const gd = room.gameData;
    // Sempre avança 1
    let steps = 0;
    do {
        gd.currentTurnIndex = (gd.currentTurnIndex + 1) % gd.turnOrder.length;
        steps++;
        // Pula jogadores que já ganharam, a menos que todos tenham ganho
    } while (room.players.find(p => p.id === gd.turnOrder[gd.currentTurnIndex])?.isGuessed && steps < room.players.length);
}

module.exports = { startWhoAmI, registerWhoAmIHandlers, handleWhoAmIRejoin };