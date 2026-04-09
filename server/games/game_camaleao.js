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

if (THEMES.length === 0) {
    THEMES = [{ main: "Animal que mia", chameleon: "Inimigo do gato" }];
}

module.exports = (io, socket, RoomManager) => { // <-- Agora usa o RoomManager
    
    // 1. Carregar Estado
    socket.on('camaleao_load_state', async () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = await RoomManager.getRoom(roomId);
        if (!room || !room.state || room.gameType !== 'CAMALEAO') return;

        const userId = socket.data.userId;
        const isChameleon = room.state.chameleonId === userId;
        
        const theme = room.state.currentTheme || THEMES[0];
        const myQuestion = isChameleon ? theme.chameleon : theme.main;

        const revealRole = room.state.phase === 'REVEAL';

        socket.emit('camaleao_secret', { 
            question: myQuestion, 
            isChameleon: revealRole ? isChameleon : null 
        });
    });

    // 2. Receber Resposta
    socket.on('camaleao_answer', async ({ answer }) => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        if (!room || room.state.phase !== 'ANSWERING') return;

        const userId = socket.data.userId;
        room.state.answers[userId] = answer;

        if (Object.keys(room.state.answers).length >= room.players.length) {
            room.state.phase = 'DISCUSSION';
        }
        
        await RoomManager.saveRoom(room);
        updateGame(io, room, roomId);
    });

    // 3. Iniciar Votação
    socket.on('camaleao_start_voting', async () => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        const player = room?.players.find(p => p.socketId === socket.id);
        
        if (room && player?.isHost && room.state.phase === 'DISCUSSION') {
            room.state.phase = 'VOTING';
            await RoomManager.saveRoom(room);
            updateGame(io, room, roomId);
        }
    });

    // 4. Votar
    socket.on('camaleao_vote', async ({ targetId }) => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        if (!room || room.state.phase !== 'VOTING') return;

        const userId = socket.data.userId;
        room.state.votes[userId] = targetId;

        if (Object.keys(room.state.votes).length >= room.players.length) {
            await calculateResult(io, room, roomId, RoomManager);
        } else {
            await RoomManager.saveRoom(room);
            updateGame(io, room, roomId);
        }
    });

    // 5. Próxima Rodada
    socket.on('camaleao_next_round', async () => {
        const roomId = socket.data.roomId;
        const room = await RoomManager.getRoom(roomId);
        const player = room?.players.find(p => p.socketId === socket.id);
        
        if (room && player?.isHost && room.state.phase === 'REVEAL') {
            module.exports.initGame(room); // Modifica o room.state
            await RoomManager.saveRoom(room);
            
            io.to(roomId).emit('joined_room', {
                roomId,
                players: room.players,
                gameType: 'CAMALEAO',
                phase: room.phase,
                gameData: getPublicData(room.state)
            });
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
        chameleonId: chameleonPlayer.userId, // Usa userId para segurança
        answers: {},
        votes: {},
        scores: room.state?.scores || {},
        phase: 'ANSWERING',
        winner: null,
        winReason: null
    };

    if (room.state.round === 1) {
        room.players.forEach(p => room.state.scores[p.userId] = 0);
    }

    room.phase = 'ANSWERING';
    return { phase: 'ANSWERING' };
};

async function calculateResult(io, room, roomId, RoomManager) {
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
    room.phase = 'REVEAL';

    if (tie) {
        gd.winner = 'CAMALEAO';
        gd.winReason = "Houve um empate na votação! O Camaleão escapou.";
        gd.scores[gd.chameleonId] = (gd.scores[gd.chameleonId] || 0) + 10;
    } else if (accusedId === gd.chameleonId) {
        gd.winner = 'JOGADORES';
        gd.winReason = "Os jogadores descobriram o Camaleão!";
        Object.entries(gd.votes).forEach(([voterId, votedFor]) => {
            if (votedFor === gd.chameleonId && voterId !== gd.chameleonId) {
                gd.scores[voterId] = (gd.scores[voterId] || 0) + 5;
            }
        });
    } else {
        gd.winner = 'CAMALEAO';
        gd.winReason = "Os jogadores acusaram a pessoa errada!";
        gd.scores[gd.chameleonId] = (gd.scores[gd.chameleonId] || 0) + 10;
    }

    room.players.forEach(p => p.score = gd.scores[p.userId] || 0);

    await RoomManager.saveRoom(room);
    updateGame(io, room, roomId);
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: room.state.phase });
}

function getPublicData(gd, targetUserId) {
    if (!gd) return {};
    const isReveal = gd.phase === 'REVEAL';
    return {
        round: gd.round,
        phase: gd.phase,
        mainQuestion: (gd.phase !== 'ANSWERING') ? gd.currentTheme?.main : null,
        answers: gd.answers || {},
        votes: gd.votes || {},
        scores: gd.scores || {},
        chameleonId: isReveal ? gd.chameleonId : null,
        chameleonQuestion: isReveal ? gd.currentTheme?.chameleon : null,
        winner: isReveal ? gd.winner : null,
        winReason: isReveal ? gd.winReason : null
    };
}

module.exports.getPublicData = getPublicData;