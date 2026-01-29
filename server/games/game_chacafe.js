const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// Banco de palavras padrão
let WORDS = ["Futebol", "Internet", "Amor", "Brasil", "Cerveja", "Dinheiro", "Música", "Praia", "Natal", "Carnaval", "Escola", "Videogame", "Churrasco", "Avião", "Harry Potter"];

// Tenta carregar JSON externo
try {
    // Ajuste o caminho conforme sua estrutura real
    const dataPath = require('path').resolve(__dirname, '../data/words_chacafe.json');
    const fs = require('fs');
    if (fs.existsSync(dataPath)) {
        const loaded = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (Array.isArray(loaded) && loaded.length > 0) WORDS = loaded;
    }
} catch (e) {
    console.log("[CHA_CAFE] Usando lista padrão.");
}

module.exports = (io, socket, RoomManager) => {

    // 1. SETUP: Narrador escolhe Chá ou Café
    socket.on('cc_setup', async ({ roomId, choice }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'SETUP') return;
            
            if (socket.data.userId === room.state.narratorId) {
                room.state.currentBestWord = choice;
                room.state.history.push({ type: 'start', word: choice });
                
                room.state.phase = 'GUESSING';
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });

    // 2. GUESS: Jogador chuta
    socket.on('cc_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'GUESSING') return;

            // Valida vez
            const currentGuesserId = room.state.turnQueue[room.state.turnIndex];
            if (socket.data.userId !== currentGuesserId) return;

            const guessNorm = normalize(guess);
            const secretNorm = normalize(room.state.secretWord);

            // VITÓRIA
            if (guessNorm === secretNorm) {
                room.state.phase = 'WIN';
                room.state.winnerId = socket.data.userId;
                room.state.currentBestWord = room.state.secretWord;
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
                return;
            }

            // SE ERROU: Vai para comparação
            room.state.pendingGuess = guess;
            room.state.guesserId = socket.data.userId; 
            room.state.phase = 'COMPARISON'; 

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 3. COMPARE: Narrador decide
    socket.on('cc_compare', async ({ roomId, choice }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'COMPARISON') return;

            if (socket.data.userId === room.state.narratorId) {
                const loser = (choice === room.state.currentBestWord) ? room.state.pendingGuess : room.state.currentBestWord;
                
                room.state.history.push({ 
                    winner: choice, 
                    loser: loser,
                    guesser: room.players.find(p => p.userId === room.state.guesserId)?.nickname 
                });

                room.state.currentBestWord = choice;
                room.state.pendingGuess = null;

                // Passa a vez
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
                module.exports.initGame(room, io); // Recria estado
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- INICIALIZAÇÃO ---
module.exports.initGame = (room, io) => {
    // 1. Define Narrador
    let nextNarratorIdx = 0;
    
    // Se já existia um estado anterior, tenta pegar o próximo da lista
    if (room.state && room.state.narratorId) {
        const oldIdx = room.players.findIndex(p => p.userId === room.state.narratorId);
        if (oldIdx !== -1) {
            nextNarratorIdx = (oldIdx + 1) % room.players.length;
        }
    }
    const narrator = room.players[nextNarratorIdx];

    // 2. Fila de quem chuta (todos exceto narrador)
    const turnQueue = room.players
        .filter(p => p.userId !== narrator.userId)
        .map(p => p.userId);

    const secretWord = WORDS[Math.floor(Math.random() * WORDS.length)];

    // 3. Salva no STATE (Memória principal)
    room.state = {
        narratorId: narrator.userId,
        secretWord: secretWord, 
        currentBestWord: null,  
        pendingGuess: null,     
        guesserId: null,
        turnQueue: turnQueue,
        turnIndex: 0,           
        history: [],            
        phase: 'SETUP',         
        winnerId: null,
        round: (room.state?.round || 0) + 1
    };

    console.log(`[CHA_CAFE] Iniciado. Narrador: ${narrator.nickname}, Palavra: ${secretWord}`);

    // --- CORREÇÃO CRÍTICA: Retorna só a fase ---
    return { phase: 'SETUP' }; 
};

// --- DADOS PÚBLICOS ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    
    const isNarrator = userId === gd.narratorId;
    const isWin = gd.phase === 'WIN';

    return {
        phase: gd.phase,
        narratorId: gd.narratorId,
        currentBestWord: gd.currentBestWord,
        pendingGuess: gd.pendingGuess,
        currentGuesserId: gd.turnQueue && gd.turnQueue.length > 0 ? gd.turnQueue[gd.turnIndex] : null,
        history: gd.history,
        winnerId: gd.winnerId,
        // Só mostra a palavra secreta para o Narrador ou se o jogo acabou
        secretWord: (isNarrator || isWin) ? gd.secretWord : null 
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;

        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            
            // --- CORREÇÃO AQUI ---
            // Estava 'CHA_CAFE', mudei para 'CHACAFE' para bater com o server.js
            gameType: 'CHACAFE', 
            // ---------------------
            
            phase: room.state.phase,
            gameData: getPublicData(room.state, targetUserId)
        });
    }
}

module.exports.getPublicData = getPublicData;