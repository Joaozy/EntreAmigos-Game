const { normalize } = require('../utils/helpers'); // Certifique-se de ter essa função
const RoomManager = require('../managers/RoomManager');

// 1. LISTA DE PALAVRAS (5 Letras)
let WORDS = [
    "FESTA", "TERMO", "NOITE", "MUNDO", "VIGOR", "SENHA", "LETRA", "PIANO", "LINDA", "TESTE"
];

try {
    // Tenta carregar lista externa
    const loaded = require('../data/words_termo.json');
    if (Array.isArray(loaded) && loaded.length > 0) WORDS = loaded;
} catch (e) {
    console.log("[TERMO] Usando lista padrão.");
}

// Helper: Normaliza para comparar (remove acentos)
const norm = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

module.exports = (io, socket, RoomManager) => {

    const getUserId = (room) => {
        const player = room.players.find(p => p.socketId === socket.id);
        return player ? player.userId : socket.data.userId;
    };

    // 1. RECEBER TENTATIVA
    socket.on('termo_guess', async ({ roomId, word }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || room.state.phase !== 'PLAYING') return;
            
            // Apenas o jogador da vez (Host ou Coop? Termo geralmente é coop ou individual)
            // Aqui vamos assumir COOPERATIVO: Qualquer um pode chutar, todos veem o mesmo board
            
            const guess = norm(word);
            if (guess.length !== 5) return;

            const secret = norm(room.state.secretWord);
            const secretArr = secret.split('');
            const guessArr = guess.split('');
            
            // Lógica do Termo (Verde, Amarelo, Cinza)
            const result = Array(5).fill('WRONG'); // Começa tudo cinza
            const secretPool = [...secretArr]; // Cópia para controlar os amarelos

            // 1º Passada: Verdes (Posição Exata)
            guessArr.forEach((letter, i) => {
                if (letter === secretArr[i]) {
                    result[i] = 'CORRECT';
                    secretPool[i] = null; // Remove do pool para não contar amarelo duplicado
                }
            });

            // 2º Passada: Amarelos (Posição Errada)
            guessArr.forEach((letter, i) => {
                if (result[i] !== 'CORRECT') {
                    const foundIndex = secretPool.indexOf(letter);
                    if (foundIndex !== -1) {
                        result[i] = 'ALMOST';
                        secretPool[foundIndex] = null;
                    }
                }
            });

            // Adiciona ao histórico
            room.state.board.push({
                word: word.toUpperCase(),
                result: result,
                player: room.players.find(p => p.socketId === socket.id)?.nickname || '???'
            });

            room.state.currentRow++;

            // Verifica Vitória ou Derrota
            if (guess === secret) {
                room.state.phase = 'VICTORY';
            } else if (room.state.currentRow >= 6) {
                room.state.phase = 'GAME_OVER';
            }

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 2. REINICIAR
    socket.on('termo_restart', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if (room) {
            module.exports.initGame(room);
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        }
    });
};

// --- INIT ---
module.exports.initGame = (room) => {
    // Sorteia palavra NOVA a cada init
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    
    room.state = {
        secretWord: randomWord,
        board: [], // Lista de tentativas
        currentRow: 0,
        phase: 'PLAYING'
    };

    console.log(`[TERMO] Iniciado. Palavra: ${randomWord}`);
    return { phase: 'PLAYING' };
};

function getPublicData(gd) {
    if (!gd) return {};
    
    return {
        board: gd.board,
        currentRow: gd.currentRow,
        phase: gd.phase,
        // Só manda a palavra secreta se acabou
        secretWord: (gd.phase === 'VICTORY' || gd.phase === 'GAME_OVER') ? gd.secretWord : null
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'TERMO',
            phase: room.state.phase,
            gameData: getPublicData(room.state)
        });
    }
}

module.exports.getPublicData = getPublicData;