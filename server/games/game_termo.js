// Importação segura
let WORDS = [];
try {
    WORDS = require('../data/words_termo.json');
    console.log(`[TERMO] Carregadas ${WORDS.length} palavras.`);
} catch (e) {
    console.error("[TERMO ERRO] Erro ao carregar JSON de palavras.");
    WORDS = ["ERROO"];
}

const normalize = (str) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const startTermo = (io, room, roomId) => {
    // Inicia na Rodada 1
    room.gameData = {
        totalScores: {}, 
        round: 1,
        maxRounds: 5,
        playersState: {},
        phase: 'PLAYING',
        winner: null,
        secretWord: ''
    };
    
    // Inicializa scores
    room.players.forEach(p => room.gameData.totalScores[p.id] = 0);

    termoInitRound(io, room, roomId);
};

const termoInitRound = (io, room, roomId) => {
    if (!WORDS || WORDS.length === 0) return;

    const rawSecret = WORDS[Math.floor(Math.random() * WORDS.length)];
    const secret = normalize(rawSecret);
    console.log(`[TERMO] Rodada ${room.gameData.round} - Palavra: ${secret}`);

    room.gameData.secretWord = secret;
    room.gameData.phase = 'PLAYING';
    
    // Reseta estado para a nova rodada
    room.players.forEach(p => {
        room.gameData.playersState[p.id] = {
            board: [], 
            status: 'PLAYING'
        };
    });

    io.to(roomId).emit('game_started', { 
        gameType: 'TERMO', 
        phase: 'PLAYING', 
        gameData: getPublicGameData(room), 
        players: room.players 
    });
};

const getPublicGameData = (room) => {
    return {
        playersState: room.gameData.playersState,
        phase: room.gameData.phase,
        winner: room.gameData.winner,
        round: room.gameData.round,
        maxRounds: room.gameData.maxRounds,
        totalScores: room.gameData.totalScores
    };
};

const checkWordLogic = (guess, secret) => {
    const result = Array(5).fill('X'); 
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    guessArr.forEach((char, i) => {
        if (char === secretArr[i]) {
            result[i] = 'G'; 
            secretArr[i] = null; 
        }
    });

    guessArr.forEach((char, i) => {
        if (result[i] !== 'G' && secretArr.includes(char)) {
            result[i] = 'Y'; 
            const indexInSecret = secretArr.indexOf(char);
            secretArr[indexInSecret] = null; 
        }
    });

    return result;
};

const calculateScore = (attempts) => {
    // 1 -> 10, 2 -> 8, 3 -> 6, 4 -> 4, 5 -> 2, 6 -> 1
    if (attempts === 1) return 10;
    if (attempts === 2) return 8;
    if (attempts === 3) return 6;
    if (attempts === 4) return 4;
    if (attempts === 5) return 2;
    if (attempts === 6) return 1;
    return 0;
};

const registerTermoHandlers = (io, socket, rooms) => {
    socket.on('termo_guess', ({ roomId, word }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'PLAYING') return;

        const playerState = room.gameData.playersState[socket.id];
        if (!playerState || playerState.status !== 'PLAYING') return;

        const guess = normalize(word);
        if (guess.length !== 5) return;

        const results = checkWordLogic(guess, room.gameData.secretWord);
        playerState.board.push({ word: guess, results });
        
        if (guess === room.gameData.secretWord) {
            playerState.status = 'WON';
        } else if (playerState.board.length >= 6) {
            playerState.status = 'LOST';
        }

        // Verifica se TODOS acabaram
        const allFinished = room.players.every(p => {
            const st = room.gameData.playersState[p.id];
            return st && (st.status === 'WON' || st.status === 'LOST');
        });

        if (allFinished) {
            // CALCULA PONTUAÇÃO DA RODADA
            room.players.forEach(p => {
                const st = room.gameData.playersState[p.id];
                if (st && st.status === 'WON') {
                    const points = calculateScore(st.board.length);
                    room.gameData.totalScores[p.id] = (room.gameData.totalScores[p.id] || 0) + points;
                }
            });

            // Envia estado final da rodada (ROUND_OVER)
            room.gameData.phase = 'ROUND_OVER';
            io.to(roomId).emit('game_over', { 
                gameData: getPublicGameData(room), 
                secretWord: room.gameData.secretWord, 
                phase: 'ROUND_OVER' // Usamos ROUND_OVER para diferenciar
            });
        } else {
            io.to(roomId).emit('update_game_data', { 
                gameData: getPublicGameData(room), 
                phase: 'PLAYING' 
            });
        }
    });

    // PRÓXIMA RODADA
    socket.on('termo_next_round', ({ roomId }) => {
        const room = rooms.get(roomId); if(!room || room.host !== socket.id) return;
        
        if (room.gameData.round >= room.gameData.maxRounds) {
            // FIM DE JOGO REAL
            room.gameData.phase = 'GAME_OVER';
            // Decide vencedor pelo placar total
            const sorted = [...room.players].sort((a,b) => (room.gameData.totalScores[b.id]||0) - (room.gameData.totalScores[a.id]||0));
            room.gameData.winner = sorted[0];
            
            io.to(roomId).emit('game_over', { 
                gameData: getPublicGameData(room),
                phase: 'VICTORY', // Reaproveita tela de vitória
                winner: room.gameData.winner
            });
        } else {
            room.gameData.round++;
            termoInitRound(io, room, roomId);
        }
    });
};

module.exports = { startTermo, registerTermoHandlers };