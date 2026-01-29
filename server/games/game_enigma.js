const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// 1. DADOS PADRÃO
let RIDDLES = [
    { clues: ["Sou feito de algodão.", "Sirvo para secar.", "Fico molhada."], answers: ["Toalha"] }
];

// 2. CARREGAMENTO DO JSON (Estilo Perfil)
try {
    const loaded = require('../data/themes_enigma.json');
    if (Array.isArray(loaded) && loaded.length > 0) {
        RIDDLES = loaded.map(item => {
            // Garante formato correto
            let clueList = [];
            if (item.clues && Array.isArray(item.clues)) clueList = item.clues;
            else if (item.question) clueList = [item.question]; // Fallback

            let ans = [];
            if (item.answer) ans = [item.answer];
            else if (item.answers) ans = item.answers;

            return { clues: clueList, answers: ans };
        });
        console.log(`[ENIGMA/PERFIL] ${RIDDLES.length} cartas carregadas.`);
    }
} catch (e) {
    console.log("[ENIGMA] Erro JSON. Usando padrão.");
}

const checkAnswer = (guess, answers) => {
    if (!guess || !answers) return false;
    const normGuess = normalize(guess).toLowerCase().trim();
    return answers.some(ans => normalize(ans).toLowerCase().trim() === normGuess);
};

module.exports = (io, socket, RoomManager) => {

    // 1. TENTATIVA DE RESPOSTA
    socket.on('enigma_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || room.state.phase !== 'PLAYING') return;

            if (checkAnswer(guess, room.state.currentRiddle.answers)) {
                const player = room.players.find(p => p.userId === socket.data.userId);
                
                // --- PONTUAÇÃO ESTILO PERFIL ---
                // Dica 1 = 10pts, Dica 2 = 9pts... Mínimo 1pt.
                const points = Math.max(1, 10 - room.state.currentClueIndex);
                
                if (player) player.score += points;
                
                room.state.winner = player ? player.nickname : "Alguém";
                room.state.winPoints = points; // Para mostrar na tela de vitória
                room.state.phase = 'REVEAL';
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            } else {
                socket.emit('enigma_wrong');
            }
        } catch(e) { console.error(e); }
    });

    // 2. REVELAR PRÓXIMA DICA (Host)
    socket.on('enigma_reveal_clue', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            // Só host pode, e só se ainda houver dicas
            if (room && room.state.phase === 'PLAYING') {
                const totalClues = room.state.currentRiddle.clues.length;
                if (room.state.currentClueIndex < totalClues - 1) {
                    room.state.currentClueIndex++;
                    await RoomManager.saveRoom(room);
                    await broadcastUpdate(io, room);
                }
            }
        } catch(e) { console.error(e); }
    });

    // 3. PRÓXIMA CARTA (Nova Rodada)
    socket.on('enigma_next', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (room && room.players.find(p => p.userId === socket.data.userId)?.isHost) {
                if (room.state.deck.length === 0) {
                    room.state.phase = 'GAME_OVER';
                } else {
                    room.state.currentRiddle = room.state.deck.pop();
                    room.state.phase = 'PLAYING';
                    room.state.currentClueIndex = 0; // Reseta dicas
                    room.state.winner = null;
                    room.state.round++;
                }
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- INIT SÍNCRONO ---
module.exports.initGame = (room, io) => {
    room.players.forEach(p => p.score = 0);

    const deck = [...RIDDLES].sort(() => 0.5 - Math.random());
    
    let firstRiddle = null;
    let initialPhase = 'GAME_OVER';

    if (deck.length > 0) {
        firstRiddle = deck.pop();
        initialPhase = 'PLAYING';
    }

    room.state = {
        deck: deck,
        currentRiddle: firstRiddle,
        currentClueIndex: 0, // Começa na dica 0 (a primeira)
        round: 1,
        phase: initialPhase,
        winner: null,
        winPoints: 0
    };

    console.log(`[PERFIL] Iniciado.`);
    return { phase: initialPhase };
};

function getPublicData(gd) {
    if (!gd) return {};
    
    // Envia apenas as dicas desbloqueadas até agora
    let visibleClues = [];
    if (gd.currentRiddle && gd.currentRiddle.clues) {
        // Pega do índice 0 até o índice atual + 1
        visibleClues = gd.currentRiddle.clues.slice(0, gd.currentClueIndex + 1);
    }

    const publicData = {
        round: gd.round,
        phase: gd.phase,
        visibleClues: visibleClues,
        totalClues: gd.currentRiddle ? gd.currentRiddle.clues.length : 0,
        currentPoints: Math.max(1, 10 - (gd.currentClueIndex || 0)), // Valor atual da rodada
        winner: gd.winner,
        winPoints: gd.winPoints
    };

    if (gd.phase === 'REVEAL' && gd.currentRiddle) {
        publicData.answer = gd.currentRiddle.answers[0];
        publicData.allClues = gd.currentRiddle.clues; // Mostra tudo no final
    }

    return publicData;
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