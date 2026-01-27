const fs = require('fs');
const path = require('path');

// 1. Carregar Palavras
let WORDS = ['TERMO', 'JOGAR', 'AMIGO', 'NOITE', 'MUNDO', 'VIVER', 'SAUDE', 'LETRA', 'MESMO', 'MUITO']; 
try {
    const wordsPath = path.join(__dirname, '../data/words_termo.json');
    if (fs.existsSync(wordsPath)) {
        const raw = fs.readFileSync(wordsPath, 'utf8');
        const json = JSON.parse(raw);
        if (Array.isArray(json)) WORDS = json.map(w => w.toUpperCase());
    }
} catch (e) {
    console.error("[TERMO] Erro ao carregar palavras:", e.message);
}

// Tabela de Pontos por Tentativa (1ª a 6ª)
const POINTS_TABLE = [0, 100, 80, 60, 40, 20, 10]; 

// 2. Lógica de Cores
function processGuess(guess, secret) {
    const guessArr = guess.split('');
    const secretArr = secret.split('');
    const result = new Array(5).fill(null);

    // A. Verdes (Posição Certa)
    guessArr.forEach((char, i) => {
        if (char === secretArr[i]) {
            result[i] = { letter: char, status: 'correct' };
            secretArr[i] = null;
            guessArr[i] = null;
        }
    });

    // B. Amarelos (Posição Errada) e Cinzas
    guessArr.forEach((char, i) => {
        if (char === null) return; 
        const idx = secretArr.indexOf(char);
        if (idx !== -1) {
            result[i] = { letter: char, status: 'present' };
            secretArr[idx] = null;
        } else {
            result[i] = { letter: char, status: 'absent' };
        }
    });
    return result;
}

module.exports = (io, socket, rooms) => {
    
    // Carregar Estado
    socket.on('game_termo_load_state', () => {
        const room = rooms[socket.data.roomId];
        if (!room || !room.state || room.gameType !== 'TERMO') return;

        const userId = socket.id;
        const myGuesses = room.state.guesses[userId] || [];
        
        const history = myGuesses.map(g => processGuess(g, room.state.secretWord));
        const won = myGuesses.includes(room.state.secretWord);
        const lost = myGuesses.length >= 6 && !won;

        socket.emit('game_termo_my_update', {
            history,
            status: won ? 'WON' : (lost ? 'LOST' : 'PLAYING'),
            secretWord: (won || lost) ? room.state.secretWord : null,
            round: room.state.round,
            totalScores: room.state.scores
        });
    });

    // Jogar
    socket.on('game_termo_guess', ({ guess }) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room || !room.state) return;

        const word = guess.toUpperCase();
        if (!WORDS.includes(word)) {
            socket.emit('game_termo_error', { message: 'Palavra não existe!' });
            return;
        }

        const userId = socket.id;
        if (!room.state.guesses[userId]) room.state.guesses[userId] = [];
        
        const prevGuesses = room.state.guesses[userId];
        if (prevGuesses.includes(room.state.secretWord) || prevGuesses.length >= 6) return;

        room.state.guesses[userId].push(word);
        const attempts = room.state.guesses[userId].length;

        // Feedback Visual
        const history = room.state.guesses[userId].map(g => processGuess(g, room.state.secretWord));
        const won = word === room.state.secretWord;
        const lost = attempts >= 6 && !won;

        if (won) {
            room.state.finished[userId] = 'WON';
            // Adiciona Pontos (Apenas se ainda não tinha finalizado)
            const pts = POINTS_TABLE[attempts] || 10;
            room.state.scores[userId] = (room.state.scores[userId] || 0) + pts;
        } 
        else if (lost) {
            room.state.finished[userId] = 'LOST';
        }

        socket.emit('game_termo_my_update', {
            history,
            status: won ? 'WON' : (lost ? 'LOST' : 'PLAYING'),
            secretWord: (won || lost) ? room.state.secretWord : null,
            round: room.state.round,
            totalScores: room.state.scores
        });

        // Placar da Sala (Com pontos)
        const scoreboard = room.players.map(p => ({
            nickname: p.nickname,
            attempts: (room.state.guesses[p.socketId] || []).length,
            status: room.state.finished[p.socketId] || 'PLAYING',
            score: room.state.scores[p.socketId] || 0
        }));
        
        io.to(roomId).emit('game_termo_scoreboard', scoreboard);
    });

    // --- CONTROLES DE RODADA ---

    // Próxima Rodada (Host)
    socket.on('game_termo_next_round', ({ roomId }) => {
        const room = rooms[roomId];
        // Verifica Host usando socketId
        const player = room?.players.find(p => p.socketId === socket.id);
        if (!room || !player || !player.isHost) return;

        if (room.state.round >= 5) {
            // FIM DE JOGO
            endGame(io, room, roomId);
        } else {
            // NOVA RODADA
            startNextRound(room);
            
            // Avisa a todos para atualizar estado
            io.to(roomId).emit('game_termo_my_update', {
                history: [],
                status: 'PLAYING',
                secretWord: null,
                round: room.state.round,
                totalScores: room.state.scores
            });
            
            // Atualiza placar zerado de tentativas
            const scoreboard = room.players.map(p => ({
                nickname: p.nickname, attempts: 0, status: 'PLAYING', score: room.state.scores[p.socketId] || 0
            }));
            io.to(roomId).emit('game_termo_scoreboard', scoreboard);
        }
    });

    // Voltar ao Lobby (Host)
    socket.on('game_termo_back_to_lobby', ({ roomId }) => {
        const room = rooms[roomId];
        const player = room?.players.find(p => p.socketId === socket.id);
        if (!room || !player || !player.isHost) return;

        room.phase = 'LOBBY';
        room.state = {}; 

        io.to(roomId).emit('joined_room', {
            roomId,
            players: room.players,
            gameType: 'TERMO',
            phase: 'LOBBY'
        });
    });

    // Reiniciar Jogo (Host)
    socket.on('game_termo_restart', ({ roomId }) => {
        const room = rooms[roomId];
        const player = room?.players.find(p => p.socketId === socket.id);
        if (!room || !player || !player.isHost) return;

        const nextState = module.exports.initGame(room);
        
        io.to(roomId).emit('joined_room', {
            roomId, players: room.players, gameType: 'TERMO', phase: 'PLAYING', gameData: nextState.gameData
        });
        
        // Força atualização dos clientes
        io.to(roomId).emit('game_termo_my_update', {
            history: [], status: 'PLAYING', secretWord: null, round: 1, totalScores: room.state.scores
        });
        io.to(roomId).emit('game_termo_scoreboard', []);
    });
};

// Funções Auxiliares
function startNextRound(room) {
    const secretWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    room.state.round++;
    room.state.secretWord = secretWord;
    room.state.guesses = {};
    room.state.finished = {};
}

function endGame(io, room, roomId) {
    room.phase = 'GAME_OVER';
    // Ordena vencedor
    const sorted = [...room.players].sort((a,b) => (room.state.scores[b.socketId]||0) - (room.state.scores[a.socketId]||0));
    const winner = sorted[0];

    io.to(roomId).emit('game_over', {
        winner,
        results: room.players.map(p => ({...p, score: room.state.scores[p.socketId] || 0})),
        phase: 'GAME_OVER'
    });
}

// Inicializador
module.exports.initGame = (room) => {
    const secretWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    
    room.state = {
        secretWord: secretWord,
        guesses: {}, 
        finished: {},
        scores: {}, // Acumulado
        round: 1
    };
    
    // Zera scores
    room.players.forEach(p => room.state.scores[p.socketId] = 0);

    return { phase: 'PLAYING' };
};