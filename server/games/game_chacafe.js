const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// Banco de palavras padrão (Fallback)
let WORDS = ["Futebol", "Internet", "Amor", "Brasil", "Cerveja", "Dinheiro", "Música", "Praia", "Natal", "Carnaval", "Escola"];
try {
    const loaded = require('../data/words.json');
    if (Array.isArray(loaded) && loaded.length > 0) WORDS = loaded;
} catch (e) {
    console.log("[CHA_CAFE] Usando lista padrão.");
}

module.exports = (io, socket, RoomManager) => {

    // 1. SETUP: Narrador escolhe Chá ou Café
    socket.on('cc_setup', async ({ roomId, choice }) => { // choice = 'Chá' ou 'Café'
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'SETUP') return;
            
            if (socket.data.userId === room.state.narratorId) {
                room.state.currentBestWord = choice;
                room.state.history.push({ type: 'start', word: choice });
                
                // Avança para o primeiro jogador chutar
                room.state.phase = 'GUESSING';
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });

    // 2. GUESS: Jogador da vez chuta uma palavra
    socket.on('cc_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'GUESSING') return;

            // Valida se é a vez do jogador
            const currentGuesserId = room.state.turnQueue[room.state.turnIndex];
            if (socket.data.userId !== currentGuesserId) return;

            const guessNorm = normalize(guess);
            const secretNorm = normalize(room.state.secretWord);

            // VERIFICA VITÓRIA
            if (guessNorm === secretNorm) {
                room.state.phase = 'WIN';
                room.state.winnerId = socket.data.userId;
                room.state.currentBestWord = room.state.secretWord; // Revela
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
                return;
            }

            // SE ERROU: Vai para comparação
            room.state.pendingGuess = guess; // Palavra nova esperando julgamento
            room.state.guesserId = socket.data.userId; // Quem chutou
            room.state.phase = 'COMPARISON'; // Narrador precisa trabalhar agora

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 3. COMPARE: Narrador escolhe a melhor palavra
    socket.on('cc_compare', async ({ roomId, choice }) => { // choice = currentBestWord OU pendingGuess
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'COMPARISON') return;

            if (socket.data.userId === room.state.narratorId) {
                // Registra no histórico o duelo
                const loser = (choice === room.state.currentBestWord) ? room.state.pendingGuess : room.state.currentBestWord;
                room.state.history.push({ 
                    winner: choice, 
                    loser: loser,
                    guesser: room.players.find(p => p.userId === room.state.guesserId)?.nickname 
                });

                // Atualiza a melhor palavra
                room.state.currentBestWord = choice;
                room.state.pendingGuess = null;

                // Passa a vez para o próximo jogador
                room.state.turnIndex = (room.state.turnIndex + 1) % room.state.turnQueue.length;
                room.state.phase = 'GUESSING';

                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });

    // 4. RESTART
    socket.on('cc_restart', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.players.find(p => p.socketId === socket.id)?.isHost) {
                module.exports.initGame(room, io);
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- INICIALIZAÇÃO ---
module.exports.initGame = (room, io) => {
    // Escolhe Narrador (o primeiro da lista ou o próximo se estiver rodando)
    // Para simplificar, vamos rodar o narrador:
    let nextNarratorIdx = 0;
    if (room.state && room.state.narratorId) {
        const oldIdx = room.players.findIndex(p => p.userId === room.state.narratorId);
        nextNarratorIdx = (oldIdx + 1) % room.players.length;
    }
    const narrator = room.players[nextNarratorIdx];

    // Fila de jogadores (todos menos o narrador)
    const turnQueue = room.players
        .filter(p => p.userId !== narrator.userId)
        .map(p => p.userId);

    const secretWord = WORDS[Math.floor(Math.random() * WORDS.length)];

    room.state = {
        narratorId: narrator.userId,
        secretWord: secretWord, // Palavra Alvo
        currentBestWord: null,  // Começa null, Narrador define no SETUP
        pendingGuess: null,     // Palavra sendo julgada
        turnQueue: turnQueue,
        turnIndex: 0,           // Quem chuta agora
        history: [],            // Log dos duelos
        phase: 'SETUP',         // Setup -> Guessing -> Comparison -> Win
        round: (room.state?.round || 0) + 1
    };

    return { phase: 'SETUP', gameData: getPublicData(room.state, null) };
};

// --- DADOS PÚBLICOS ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    
    // O segredo só é revelado no final ou para o Narrador
    const isNarrator = userId === gd.narratorId;
    const isWin = gd.phase === 'WIN';

    return {
        phase: gd.phase,
        narratorId: gd.narratorId,
        currentBestWord: gd.currentBestWord,
        pendingGuess: gd.pendingGuess,
        currentGuesserId: gd.turnQueue ? gd.turnQueue[gd.turnIndex] : null,
        history: gd.history,
        winnerId: gd.winnerId,
        // Narrador vê a palavra o tempo todo. Outros só no final.
        secretWord: (isNarrator || isWin) ? gd.secretWord : null 
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'CHA_CAFE',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

module.exports.getPublicData = getPublicData;