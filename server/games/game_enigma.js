const { shuffle } = require('../utils/helpers');

// --- CARREGAMENTO DE DADOS ---
let DECKS = [];
try {
    const loaded = require('../data/themes_enigma.json');
    if(Array.isArray(loaded) && loaded.length > 0) DECKS = loaded;
} catch (e) {
    console.warn("[ENIGMA] Erro ao carregar JSON.");
}

if (!DECKS || DECKS.length === 0) {
    DECKS = [{ answer: "Teste", clues: ["Dica 1", "Dica 2"] }];
}

// --- UTILITÁRIOS DE TEXTO ---

// 1. Normalização (Remove acentos, hífens e deixa minúsculo)
const normalize = (str) => {
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove acentos
              .replace(/[^a-zA-Z0-9]/g, "")    // Remove hífens, espaços e pontuação
              .toLowerCase();
};

// 2. Algoritmo de Levenshtein (Calcula distância entre palavras)
const getLevenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const startEnigma = (io, room, roomId) => {
    let deck = shuffle([...DECKS]);
    room.players.forEach(p => p.score = 0);
    
    room.gameData = {
        deck: deck,
        currentCard: null,
        round: 0,
        phase: 'CLUES', 
        revealedCount: 0, 
        lockedPlayers: [], 
        roundWinner: null,
        currentValue: 100,
        timer: null
    };
    
    room.phase = 'GAME';
    
    io.to(roomId).emit('game_started', { 
        gameType: 'ENIGMA', 
        phase: 'CLUES', 
        gameData: getPublicData(room), 
        players: room.players 
    });

    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    if (gd.timer) clearTimeout(gd.timer);

    if (gd.deck.length === 0) {
        const winner = room.players.sort((a,b) => b.score - a.score)[0];
        io.to(roomId).emit('game_over', { winner, results: room.players });
        return;
    }

    gd.round++;
    gd.currentCard = gd.deck.pop();
    gd.phase = 'CLUES';
    gd.revealedCount = 1; 
    gd.lockedPlayers = []; 
    gd.roundWinner = null;
    gd.currentValue = 100;

    updateGame(io, room, roomId);
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd.currentCard) return {};

    const visibleClues = gd.currentCard.clues.slice(0, gd.revealedCount);

    return {
        round: gd.round,
        phase: gd.phase,
        clues: visibleClues,
        totalClues: 10,
        currentValue: gd.currentValue,
        lockedPlayers: gd.lockedPlayers,
        answer: gd.phase === 'ROUND_END' ? gd.currentCard.answer : null,
        roundWinner: gd.roundWinner
    };
};

const updateGame = (io, room, roomId) => {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: room.gameData.phase });
};

const nextClueInternal = (io, room, roomId) => {
    const gd = room.gameData;
    if (gd.phase === 'ROUND_END') return;

    if (gd.revealedCount < 10) {
        gd.revealedCount++;
        gd.currentValue = Math.max(10, 110 - (gd.revealedCount * 10));
        gd.lockedPlayers = []; 
        updateGame(io, room, roomId);
    } else {
        gd.phase = 'ROUND_END';
        updateGame(io, room, roomId);
        gd.timer = setTimeout(() => {
            if (room.phase === 'GAME') startRound(io, room, roomId);
        }, 5000);
    }
};

const registerEnigmaHandlers = (io, socket, rooms) => {
    socket.on('enigma_next_clue', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id || room.gameData.phase !== 'CLUES') return;
        nextClueInternal(io, room, roomId);
    });

    socket.on('enigma_guess', ({ roomId, guess }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'CLUES') return;
        
        const gd = room.gameData;
        if (gd.lockedPlayers.includes(socket.id)) return;

        const player = room.players.find(p => p.id === socket.id);
        
        // --- LÓGICA DE COMPARAÇÃO FLEXÍVEL ---
        const correct = normalize(gd.currentCard.answer);
        const attempt = normalize(guess);
        
        const distance = getLevenshteinDistance(attempt, correct);
        const len = correct.length;

        // Tolerância Dinâmica:
        // Palavras curtas (<=4): Exata (0 erros)
        // Médias (5-8): Aceita 1 erro
        // Longas (>8): Aceita 2 erros
        let tolerance = 0;
        if (len >= 5) tolerance = 1;
        if (len > 8) tolerance = 2;

        const isCorrect = distance <= tolerance;

        if (isCorrect) {
            // ACERTOU
            player.score += gd.currentValue;
            gd.roundWinner = player.nickname;
            gd.phase = 'ROUND_END';
            
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} ACERTOU!` });
            io.to(roomId).emit('update_players', room.players);
            updateGame(io, room, roomId);

            if (gd.timer) clearTimeout(gd.timer);
            gd.timer = setTimeout(() => {
                if (room.gameType === 'ENIGMA') startRound(io, room, roomId);
            }, 5000);

        } else {
            // ERROU
            gd.lockedPlayers.push(socket.id);
            socket.emit('enigma_wrong', 'Errado! Espere a próxima dica.');
            
            const activePlayers = room.players.filter(p => p.connected).length;
            if (gd.lockedPlayers.length >= activePlayers) {
                setTimeout(() => {
                    if (room.gameType === 'ENIGMA' && gd.phase === 'CLUES') {
                        nextClueInternal(io, room, roomId);
                    }
                }, 1500); 
            } else {
                updateGame(io, room, roomId); 
            }
        }
    });

    socket.on('enigma_next_round', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id) return;
        startRound(io, room, roomId);
    });
};

module.exports = { startEnigma, registerEnigmaHandlers };