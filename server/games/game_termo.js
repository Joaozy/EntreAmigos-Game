const fs = require('fs');
const path = require('path');

// Carrega as palavras
const wordsPath = path.join(__dirname, '../data/words_termo.json');
let WORDS = [];
try {
    WORDS = JSON.parse(fs.readFileSync(wordsPath, 'utf8')).map(w => w.toUpperCase());
} catch (e) {
    console.error("Erro ao carregar palavras do Termo. Usando fallback.", e);
    WORDS = ['TERMO', 'JOGAR', 'AMIGO', 'TESTE', 'SOLAR']; 
}

// Lógica de Cores (Verde, Amarelo, Cinza)
function processGuess(guess, secret) {
    const result = new Array(5).fill(null);
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    // 1. Identificar VERDES (Posição correta)
    guessArr.forEach((letter, i) => {
        if (letter === secretArr[i]) {
            result[i] = { letter, status: 'correct' }; // Verde
            secretArr[i] = null; // Remove do pool
            guessArr[i] = null;  // Marca como processado
        }
    });

    // 2. Identificar AMARELOS (Posição errada) e CINZAS
    guessArr.forEach((letter, i) => {
        if (letter === null) return; // Já é verde

        const indexInSecret = secretArr.indexOf(letter);
        if (indexInSecret !== -1) {
            result[i] = { letter, status: 'present' }; // Amarelo
            secretArr[indexInSecret] = null; // Remove do pool para não repetir
        } else {
            result[i] = { letter, status: 'absent' }; // Cinza
        }
    });

    return result;
}

module.exports = (io, socket, rooms, roomId) => {
    // Evento de tentativa de palavra
    socket.on('game_termo_guess', ({ guess }) => {
        const room = rooms[roomId];
        if (!room || !room.state || room.gameType !== 'TERMO') return;

        const word = guess.toUpperCase();
        const userId = socket.id; // Identificador da sessão atual

        // Validação: Palavra existe?
        if (!WORDS.includes(word)) {
            socket.emit('game_termo_error', { message: 'Palavra não encontrada!' });
            return;
        }

        // Inicializa estado do jogador se não existir
        if (!room.state.guesses[userId]) room.state.guesses[userId] = [];
        
        // Verifica se já acabou para este jogador
        if (room.state.finished[userId]) return;

        // Adiciona tentativa
        room.state.guesses[userId].push(word);

        const guessesCount = room.state.guesses[userId].length;
        const won = word === room.state.secretWord;
        const lost = guessesCount >= 6 && !won;

        if (won) room.state.finished[userId] = 'WON';
        if (lost) room.state.finished[userId] = 'LOST';

        // Processa histórico (cores)
        const history = room.state.guesses[userId].map(g => processGuess(g, room.state.secretWord));

        // Envia atualização PRIVADA para quem jogou
        socket.emit('game_termo_update_private', {
            history,
            status: room.state.finished[userId] || 'PLAYING',
            secretWord: (won || lost) ? room.state.secretWord : null
        });

        // Envia atualização PÚBLICA (Scoreboard) para todos
        // Mostra apenas quantas tentativas cada um fez, sem revelar as palavras
        const publicState = Object.keys(room.state.guesses).map(uid => {
            const player = room.players.find(p => p.socketId === uid); // Busca pelo socketId
            return {
                nickname: player ? player.nickname : 'Desconhecido',
                attempts: room.state.guesses[uid].length,
                status: room.state.finished[uid] || 'PLAYING'
            };
        });

        io.to(roomId).emit('game_termo_scoreboard', publicState);
    });
};

// Função chamada pelo server.js quando o jogo começa
module.exports.initGame = (room) => {
    const secretWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    console.log(`[TERMO] Sala ${room.id} iniciou. Palavra: ${secretWord}`);

    room.state = {
        secretWord: secretWord,
        guesses: {}, // { socketId: ['PALAVRA', ...] }
        finished: {}, // { socketId: 'WON' | 'LOST' }
    };

    return {
        gameType: 'TERMO',
        phase: 'PLAYING'
    };
};