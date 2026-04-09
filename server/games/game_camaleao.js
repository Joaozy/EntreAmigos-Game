const { shuffle } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');

let THEMES = [];
try {
    const dataPath = path.join(__dirname, '../data/themes_camaleao.json');
    if (fs.existsSync(dataPath)) {
        THEMES = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
} catch (e) {
    console.error("[CAMALEAO] Erro ao carregar perguntas:", e.message);
}

// Fallback caso o ficheiro não exista
if (THEMES.length === 0) {
    THEMES = [{ main: "Animal que mia", chameleon: "Inimigo do gato" }];
}

module.exports = (io, socket, rooms) => {
    
    // 1. Enviar pergunta secreta individualmente (segurança contra F5)
    socket.on('camaleao_load_state', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || !room.state || room.gameType !== 'CAMALEAO') return;

        const isChameleon = room.state.chameleonId === socket.id;
        const myQuestion = isChameleon ? room.state.currentTheme.chameleon : room.state.currentTheme.main;

        // Revelar se é o camaleão apenas se o jogo tiver acabado
        const revealRole = room.state.phase === 'REVEAL';

        socket.emit('camaleao_secret', { 
            question: myQuestion, 
            isChameleon: revealRole ? isChameleon : null 
        });
    });

    // 2. Receber Resposta
    socket.on('camaleao_answer', ({ answer }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || room.state.phase !== 'ANSWERING') return;

        room.state.answers[socket.id] = answer;

        // Se todos responderam, passa para a Discussão
        if (Object.keys(room.state.answers).length >= room.players.length) {
            room.state.phase = 'DISCUSSION';
            updateGame(io, room, roomId);
        } else {
            updateGame(io, room, roomId); // Atualiza para mostrar quem já respondeu
        }
    });

    // 3. Iniciar Votação (Apenas Host)
    socket.on('camaleao_start_voting', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.socketId === socket.id);
        
        if (room && player?.isHost && room.state.phase === 'DISCUSSION') {
            room.state.phase = 'VOTING';
            updateGame(io, room, roomId);
        }
    });

    // 4. Receber Voto
    socket.on('camaleao_vote', ({ targetId }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || room.state.phase !== 'VOTING') return;

        room.state.votes[socket.id] = targetId;

        // Se todos votaram, vai para a Revelação
        if (Object.keys(room.state.votes).length >= room.players.length) {
            calculateResult(io, room, roomId);
        } else {
            updateGame(io, room, roomId);
        }
    });

    // 5. Próxima Rodada (Apenas Host)
    socket.on('camaleao_next_round', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const player = room?.players.find(p => p.socketId === socket.id);
        
        if (room && player?.isHost && room.state.phase === 'REVEAL') {
            const nextState = module.exports.initGame(room);
            io.to(roomId).emit('joined_room', {
                roomId,
                players: room.players,
                gameType: 'CAMALEAO',
                phase: 'ANSWERING',
                gameData: nextState.gameData
            });
            // O frontend pedirá o 'camaleao_load_state' automaticamente
        }
    });
};

// --- LOGICA INTERNA ---

module.exports.initGame = (room) => {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    const chameleonPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    
    room.state = {
        round: (room.state?.round || 0) + 1,
        currentTheme: theme,
        chameleonId: chameleonPlayer.socketId,
        answers: {},
        votes: {},
        scores: room.state?.scores || {},
        phase: 'ANSWERING',
        winner: null,
        winReason: null
    };

    // Garante que todos têm score na primeira rodada
    if (room.state.round === 1) {
        room.players.forEach(p => room.state.scores[p.socketId] = 0);
    }

    return { phase: 'ANSWERING', gameData: getPublicData(room.state) };
};

function calculateResult(io, room, roomId) {
    const gd = room.state;
    const counts = {};
    
    Object.values(gd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    
    let maxVotes = 0;
    let accusedId = null;
    let tie = false;

    Object.entries(counts).forEach(([id, count]) => {
        if (count > maxVotes) {
            maxVotes = count;
            accusedId = id;
            tie = false;
        } else if (count === maxVotes) {
            tie = true;
        }
    });

    gd.phase = 'REVEAL';

    if (tie) {
        gd.winner = 'CAMALEAO';
        gd.winReason = "Houve um empate na votação! O Camaleão escapou.";
        gd.scores[gd.chameleonId] += 10;
    } else if (accusedId === gd.chameleonId) {
        gd.winner = 'JOGADORES';
        gd.winReason = "Os jogadores descobriram o Camaleão!";
        // Pontos para quem votou certo
        Object.entries(gd.votes).forEach(([voterId, votedFor]) => {
            if (votedFor === gd.chameleonId && voterId !== gd.chameleonId) {
                gd.scores[voterId] += 5;
            }
        });
    } else {
        gd.winner = 'CAMALEAO';
        gd.winReason = "Os jogadores acusaram a pessoa errada!";
        gd.scores[gd.chameleonId] += 10;
    }

    // Sync dos scores com os players
    room.players.forEach(p => p.score = gd.scores[p.socketId]);

    updateGame(io, room, roomId);
}

function getPublicData(gd) {
    const isReveal = gd.phase === 'REVEAL';
    return {
        round: gd.round,
        phase: gd.phase,
        // Só revela a pergunta principal quando todos responderem
        mainQuestion: (gd.phase !== 'ANSWERING') ? gd.currentTheme.main : null,
        answers: gd.answers,
        votes: gd.votes,
        scores: gd.scores,
        // Revelações finais
        chameleonId: isReveal ? gd.chameleonId : null,
        chameleonQuestion: isReveal ? gd.currentTheme.chameleon : null,
        winner: isReveal ? gd.winner : null,
        winReason: isReveal ? gd.winReason : null
    };
}

module.exports.getPublicData = getPublicData;