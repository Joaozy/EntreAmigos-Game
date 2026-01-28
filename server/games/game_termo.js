const { normalize } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let WORDS = ["AMIGO", "TERMO", "JOGOS", "FESTA", "NOITE", "LIVRO", "MUNDO", "CARTA", "PODER", "AUDIO", "VIDEO"];
try {
    const loaded = require('../data/words_termo.json');
    if (Array.isArray(loaded) && loaded.length > 0) WORDS = loaded;
} catch (e) {}

const MAX_ATTEMPTS = 6;
const MAX_ROUNDS = 5;

module.exports = (io, socket, RoomManager) => {

    // 1. CHUTE
    socket.on('termo_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state || !room.state.playersState) return;

            const userId = socket.data.userId;
            
            // Auto-Healing: Cria estado se não existir
            if (!room.state.playersState[userId]) {
                room.state.playersState[userId] = { attempts: [], finished: false, won: false };
            }
            
            const playerState = room.state.playersState[userId];
            if (playerState.finished) return;

            if (!guess || guess.length !== 5) return socket.emit('error_msg', 'A palavra deve ter 5 letras.');

            const word = normalize(guess).toUpperCase();
            const solution = room.state.solution;
            const result = checkWord(word, solution);

            playerState.attempts.push({ word, result });
            
            if (word === solution) {
                playerState.finished = true;
                playerState.won = true;
                // Pontuação: 6 pts na 1ª tentativa, 1 pt na última
                const points = (MAX_ATTEMPTS - playerState.attempts.length) + 1;
                
                const player = room.players.find(p => p.userId === userId);
                if(player) player.score = (player.score || 0) + points;
                
                socket.emit('termo_success', 'Parabéns! Você acertou.');
            } else if (playerState.attempts.length >= MAX_ATTEMPTS) {
                playerState.finished = true;
                socket.emit('termo_fail', `A palavra era: ${solution}`);
            }

            await RoomManager.saveRoom(room);

            // Atualiza apenas este jogador com dados sensíveis
            socket.emit('update_game_data', { gameData: getPublicData(room.state, userId) });
            // Atualiza placar para todos
            io.to(roomId).emit('update_players', room.players);

        } catch (err) {
            console.error('[TERMO] Erro guess:', err);
        }
    });

    // 2. PRÓXIMA RODADA (Mantém pontos)
    socket.on('termo_next_round', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if(!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isHost) {
            
            if (room.state.round < MAX_ROUNDS) {
                // AVANÇA ROUND
                room.state.round++;
                const newWord = WORDS[Math.floor(Math.random() * WORDS.length)];
                room.state.solution = normalize(newWord).toUpperCase();
                
                // Reseta tentativas, mas MANTÉM score
                Object.keys(room.state.playersState).forEach(uid => {
                    room.state.playersState[uid] = { attempts: [], finished: false, won: false };
                });

                room.phase = 'PLAYING';
                await RoomManager.saveRoom(room);
                broadcastGameUpdate(io, room);

            } else {
                // FIM DE JOGO (Acabou os 5 rounds)
                room.phase = 'GAME_OVER';
                await RoomManager.saveRoom(room);
                io.to(roomId).emit('game_over', { 
                    phase: 'GAME_OVER',
                    results: room.players 
                });
            }
        }
    });

    // 3. REINICIAR JOGO (Zera pontos e volta pro Round 1)
    socket.on('termo_restart', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if(!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isHost) {
            // Reinicia Scores Globais
            room.players.forEach(p => p.score = 0);
            
            // Reinicia Estado do Jogo
            module.exports.initGame(room); 
            
            await RoomManager.saveRoom(room);
            broadcastGameUpdate(io, room);
        }
    });
};

// Helper para enviar dados customizados a todos
async function broadcastGameUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'TERMO',
            phase: room.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

function checkWord(guess, solution) {
    const res = Array(5).fill('gray');
    const solutionArr = solution.split('');
    const guessArr = guess.split('');

    // Verdes
    guessArr.forEach((letter, i) => {
        if (letter === solutionArr[i]) {
            res[i] = 'green';
            solutionArr[i] = null;
            guessArr[i] = null;
        }
    });

    // Amarelos
    guessArr.forEach((letter, i) => {
        if (letter && solutionArr.includes(letter)) {
            res[i] = 'yellow';
            const idx = solutionArr.indexOf(letter);
            solutionArr[idx] = null;
        }
    });
    return res;
}

module.exports.initGame = (room, io) => {
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    
    room.state = {
        solution: normalize(randomWord).toUpperCase(),
        round: 1,
        maxRounds: MAX_ROUNDS,
        playersState: {}
    };

    room.players.forEach(p => {
        if (p.userId) {
            room.state.playersState[p.userId] = {
                attempts: [], finished: false, won: false
            };
        }
    });

    // Se estiver reiniciando, reseta pontos globais também
    // (Opcional: initGame é chamado no start_game e termo_restart)
    
    return { phase: 'PLAYING', gameData: {} };
};

function getPublicData(gd, userId) {
    if (!gd || !gd.playersState || !userId) return {};
    
    const playerSt = gd.playersState[userId];
    if (!playerSt) return { attempts: [], finished: false, won: false, round: gd.round, maxRounds: gd.maxRounds };

    return {
        attempts: playerSt.attempts,
        finished: playerSt.finished,
        won: playerSt.won,
        solution: playerSt.finished ? gd.solution : null,
        round: gd.round,
        maxRounds: gd.maxRounds
    };
}

module.exports.getPublicData = getPublicData;