const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let RIDDLES = [
    { question: "O que é que quanto mais seca, mais molhada fica?", answers: ["Toalha", "A toalha"] },
    { question: "O que é, o que é? Cai em pé e corre deitado?", answers: ["Chuva", "A chuva"] },
    { question: "O que é que anda com os pés na cabeça?", answers: ["Piolho", "O piolho"] },
    { question: "Tenho cidades, mas não tenho casas. Tenho montanhas, mas não tenho árvores. Tenho água, mas não tenho peixe. O que sou eu?", answers: ["Mapa", "Um mapa"] }
];

try {
    const loaded = require('../data/themes_enigma.json');
    if (Array.isArray(loaded)) RIDDLES = loaded;
} catch (e) {}

// Função de distância para aceitar respostas próximas (erros de digitação leves)
const checkAnswer = (guess, answers) => {
    const normGuess = normalize(guess).toLowerCase();
    return answers.some(ans => normalize(ans).toLowerCase() === normGuess);
};

module.exports = (io, socket, RoomManager) => {

    // 1. TENTATIVA DE RESPOSTA
    socket.on('enigma_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'PLAYING') return;

            // Verifica se a resposta está certa
            if (checkAnswer(guess, room.state.currentRiddle.answers)) {
                const player = room.players.find(p => p.userId === socket.data.userId);
                
                // Pontuação e Vitória
                if (player) player.score += 10;
                
                room.state.winner = player ? player.nickname : "Alguém";
                room.state.phase = 'REVEAL';
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            } else {
                // Feedback visual apenas para quem errou (opcional, feito no front)
                socket.emit('enigma_wrong', 'Resposta incorreta!');
            }
        } catch(e) { console.error(e); }
    });

    // 2. PRÓXIMO ENIGMA
    socket.on('enigma_next', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (room && room.players.find(p => p.userId === socket.data.userId)?.isHost) {
                await startNewRound(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- LÓGICA ---

module.exports.initGame = (room, io) => {
    // Zera scores
    room.players.forEach(p => p.score = 0);

    room.state = {
        deck: [...RIDDLES].sort(() => 0.5 - Math.random()), // Embaralha
        currentRiddle: null,
        round: 0,
        phase: 'PLAYING',
        winner: null
    };

    if(io) startNewRound(io, room);
    return { phase: 'PLAYING', gameData: getPublicData(room.state) };
};

async function startNewRound(io, room) {
    const gd = room.state;
    
    if (gd.deck.length === 0) {
        gd.phase = 'GAME_OVER';
    } else {
        gd.currentRiddle = gd.deck.pop();
        gd.phase = 'PLAYING';
        gd.winner = null;
        gd.round++;
    }

    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

// --- FILTRO DE DADOS ---
function getPublicData(gd) {
    if (!gd) return {};
    
    // Esconde a resposta, exceto no final
    const riddlePublic = gd.currentRiddle ? {
        question: gd.currentRiddle.question,
        // answers: undefined // NÃO ENVIA AS RESPOSTAS
    } : null;

    if (gd.phase === 'REVEAL') {
        // Se revelou, manda a resposta principal para mostrar
        riddlePublic.answer = gd.currentRiddle.answers[0];
    }

    return {
        round: gd.round,
        phase: gd.phase,
        currentRiddle: riddlePublic,
        winner: gd.winner
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'ENIGMA',
            phase: room.state.phase,
            gameData: getPublicData(room.state)
        });
    }
}

module.exports.getPublicData = getPublicData;