const { shuffle, normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// --- GERENCIADOR DE TIMERS (MEMÓRIA RAM) ---
// O Redis guarda dados, mas o relógio precisa viver no processo Node.js
const activeTimers = {}; // { roomId: intervalId }

// --- TEMAS (COM FALLBACK) ---
let THEMES = [
    { emojis: "🦁👑", answers: ["O Rei Leão", "Rei Leao"] },
    { emojis: "🚢🧊💔", answers: ["Titanic"] },
    { emojis: "👻🚫", answers: ["Caça Fantasmas", "Ghostbusters"] }
];

try {
    const loaded = require('../data/themes_cinemoji.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {
    console.log("[CINEMOJI] Usando temas padrão.");
}

// --- FUNÇÕES AUXILIARES ---
const getLevenshteinDistance = (a, b) => {
    if(a.length === 0) return b.length;
    if(b.length === 0) return a.length;
    const matrix = [];
    for(let i = 0; i <= b.length; i++) matrix[i] = [i];
    for(let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for(let i = 1; i <= b.length; i++){
        for(let j = 1; j <= a.length; j++){
            if(b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
            else matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
};

const generateHint = (title) => {
    if (!title) return "???";
    return title.split('').map((char, i) => {
        if (char === ' ') return '  '; 
        if (/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(char)) return char; 
        return i === 0 ? char : '_'; 
    }).join(' ');
};

// --- MÓDULO PRINCIPAL ---
module.exports = (io, socket, RoomManager) => {

    socket.on('cinemoji_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || room.state.phase !== 'GUESSING') return;
            
            const gd = room.state;
            if (!guess || typeof guess !== 'string') return;

            const userGuessNorm = normalize(guess);
            const validAnswers = gd.currentTheme.answers.map(a => normalize(a));
            const player = room.players.find(p => p.socketId === socket.id);

            if (!player) return;

            // 1. ACERTOU
            if (validAnswers.includes(userGuessNorm)) {
                if (!gd.winners.includes(player.nickname)) {
                    // Pontuação
                    let basePoints = gd.winners.length === 0 ? 10 : (gd.winners.length === 1 ? 5 : 3);
                    if (gd.hintRevealed) basePoints = Math.ceil(basePoints / 2);

                    player.score = (player.score || 0) + basePoints;
                    gd.winners.push(player.nickname);
                    
                    await RoomManager.saveRoom(room);

                    io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} acertou!` });
                    io.to(roomId).emit('update_players', room.players);
                    
                    // Atualiza dados (incluindo vencedores)
                    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'GUESSING' });

                    // Se todos acertaram (quem está online)
                    const activePlayers = room.players.filter(p => p.isOnline !== false);
                    if (gd.winners.length >= activePlayers.length) {
                        await endRound(io, roomId);
                    }
                }
                return;
            }

            // 2. QUASE LÁ
            let isClose = false;
            for (let answer of validAnswers) {
                const distance = getLevenshteinDistance(userGuessNorm, answer);
                const len = answer.length;
                let tolerance = len > 10 ? 3 : (len > 5 ? 2 : 1);
                if (distance <= tolerance) { isClose = true; break; }
            }

            if (isClose) socket.emit('cinemoji_close', 'Quase lá!');
            else socket.emit('cinemoji_wrong');

        } catch (error) { console.error("[CINEMOJI] Erro no guess:", error); }
    });
};

// --- CONTROLE DE FLUXO E TEMPO ---

async function endRound(io, roomId) {
    // 1. Limpa timer na memória
    if (activeTimers[roomId]) {
        clearInterval(activeTimers[roomId]);
        delete activeTimers[roomId];
    }

    const room = await RoomManager.getRoom(roomId);
    if (!room) return;
    
    const gd = room.state;
    gd.phase = 'REVEAL';
    
    await RoomManager.saveRoom(room);

    // Revela resposta
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(gd), phase: 'REVEAL' });
    
    // Espera 5s e começa próxima
    setTimeout(async () => {
        const currentRoom = await RoomManager.getRoom(roomId);
        if(!currentRoom) return;

        const nextState = module.exports.initGame(currentRoom, io); 
        await RoomManager.saveRoom(currentRoom);

        if (nextState.phase === 'GAME_OVER') {
             const winner = currentRoom.players.sort((a,b) => b.score - a.score)[0];
             io.to(roomId).emit('game_over', { winner, results: currentRoom.players });
             // Limpa dados da sala se quiser
             // RoomManager.deleteRoom(roomId);
        } else {
             io.to(roomId).emit('joined_room', {
                 roomId: currentRoom.id,
                 players: currentRoom.players,
                 gameType: 'CINEMOJI',
                 phase: 'GUESSING',
                 gameData: nextState.gameData
             });
        }
    }, 5000);
}

// Chamado pelo server.js (start_game) e internamente (next round)
module.exports.initGame = (room, io) => {
    // Setup inicial
    if(!room.state || !room.state.deck) {
        room.state = {
            deck: shuffle([...THEMES]),
            currentTheme: null,
            round: 0,
            winners: [],
            hintRevealed: false
        };
        room.players.forEach(p => p.score = 0);
    }

    const gd = room.state;
    
    // Verifica Fim de Jogo
    if (gd.deck.length === 0) return { phase: 'GAME_OVER' };

    // Nova Rodada
    gd.round++;
    gd.currentTheme = gd.deck.pop();
    gd.phase = 'GUESSING';
    gd.winners = [];
    gd.hintRevealed = false;
    gd.hint = generateHint(gd.currentTheme.answers[0]);

    // Inicia Timer se tiver IO
    if (io) {
        startRoundLoop(io, room.id);
    }

    return { 
        phase: 'GUESSING', 
        gameData: getPublicData(room.state) 
    };
};

function startRoundLoop(io, roomId) {
    // 1. Limpa anterior se existir (Segurança)
    if (activeTimers[roomId]) {
        clearInterval(activeTimers[roomId]);
    }

    let timeLeft = 60;
    console.log(`[CINEMOJI] Timer iniciado para sala ${roomId} (${timeLeft}s)`);

    // 2. Cria novo Timer
    const timerId = setInterval(async () => {
        timeLeft--;
        
        // Emite tempo real (apenas socket, não salva no redis pra não pesar)
        io.to(roomId).emit('cinemoji_timer', timeLeft);

        // Evento de Dica (30s)
        if (timeLeft === 30) {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.state) {
                room.state.hintRevealed = true;
                await RoomManager.saveRoom(room);
                io.to(roomId).emit('cinemoji_hint', room.state.hint);
                console.log(`[CINEMOJI] Dica revelada sala ${roomId}`);
            }
        }

        // Fim do Tempo
        if (timeLeft <= 0) {
            clearInterval(timerId); // Limpa intervalo local
            if (activeTimers[roomId] === timerId) delete activeTimers[roomId]; // Limpa referência do mapa
            await endRound(io, roomId);
        }
    }, 1000);

    // 3. Salva referência na memória
    activeTimers[roomId] = timerId;
}

function getPublicData(gd) {
    if (!gd || !gd.currentTheme) return {};
    return {
        emojis: gd.currentTheme.emojis,
        title: gd.phase === 'REVEAL' ? gd.currentTheme.answers[0] : null, 
        hint: gd.hintRevealed ? gd.hint : null,
        round: gd.round,
        winners: gd.winners
    };
}

module.exports.getPublicData = getPublicData;