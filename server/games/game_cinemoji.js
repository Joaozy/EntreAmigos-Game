const { shuffle } = require('../utils/helpers');

// --- 1. FUNÇÕES AUXILIARES DE TEXTO ---

// Remove acentos e deixa minúsculo (Ex: "O Rei Leão" -> "o rei leao")
const normalize = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Calcula a distância entre duas strings (Algoritmo de Levenshtein)
const getLevenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substituição
                    Math.min(
                        matrix[i][j - 1] + 1, // inserção
                        matrix[i - 1][j] + 1  // remoção
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// --- 2. CARREGAMENTO DE DADOS ---
let THEMES = [];
try {
    const loaded = require('../data/themes_cinemoji.json');
    if (Array.isArray(loaded)) THEMES = loaded.filter(t => t && t.answers && t.emojis);
} catch (e) {
    console.warn("[CINEMOJI] Erro JSON:", e.message);
}

// Backup (agora usando 'answers' que é um array, para suportar variações)
if (!THEMES || THEMES.length === 0) {
    THEMES = [
        { emojis: "🦁👑", answers: ["O Rei Leão", "Rei Leao"] },
        { emojis: "🚢🧊💔", answers: ["Titanic"] },
        { emojis: "👻🚫", answers: ["Caça Fantasmas", "Ghostbusters"] }
    ];
}

const generateHint = (title) => {
    if (!title) return "???";
    return title.split('').map((char, i) => {
        if (char === ' ') return '  '; 
        if (/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(char)) return char; 
        return i === 0 ? char : '_'; 
    }).join(' ');
};

const startCinemoji = (io, room, roomId) => {
    let deck = shuffle([...THEMES]);
    room.players.forEach(p => p.score = 0);
    
    room.gameData = {
        deck: deck,
        currentTheme: null,
        round: 0,
        phase: 'GUESSING',
        winners: [],
        timer: null,
        hint: null,
        hintRevealed: false
    };
    
    room.phase = 'GAME';
    io.to(roomId).emit('game_started', { gameType: 'CINEMOJI', phase: 'GAME', players: room.players });
    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    try {
        const gd = room.gameData;
        if (gd.timer) clearInterval(gd.timer);

        if (gd.deck.length === 0) {
            const winner = room.players.sort((a,b) => b.score - a.score)[0];
            io.to(roomId).emit('game_over', { winner, results: room.players });
            return;
        }

        gd.round++;
        gd.currentTheme = gd.deck.pop();

        // Validação: Garante que tem 'answers' e pega o primeiro como título principal
        if (!gd.currentTheme || !gd.currentTheme.answers || gd.currentTheme.answers.length === 0) {
            startRound(io, room, roomId); 
            return;
        }

        // Título principal é o primeiro do array
        const mainTitle = gd.currentTheme.answers[0];

        gd.phase = 'GUESSING';
        gd.winners = [];
        gd.hintRevealed = false;
        gd.hint = generateHint(mainTitle); 
        
        let timeLeft = 60;
        
        io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });

        gd.timer = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('cinemoji_timer', timeLeft);

            if (timeLeft === 30 && !gd.hintRevealed) {
                gd.hintRevealed = true;
                io.to(roomId).emit('cinemoji_hint', gd.hint);
                io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: '💡 DICA LIBERADA! (Metade dos pontos)' });
            }

            if (timeLeft <= 0) {
                clearInterval(gd.timer);
                gd.phase = 'REVEAL';
                io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
                setTimeout(() => startRound(io, room, roomId), 5000);
            }
        }, 1000);

    } catch (error) {
        console.error(`[CINEMOJI] Crash: ${error.message}`);
        setTimeout(() => startRound(io, room, roomId), 2000);
    }
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd.currentTheme) return {};
    return {
        emojis: gd.currentTheme.emojis,
        title: gd.phase === 'REVEAL' ? gd.currentTheme.answers[0] : null, 
        hint: gd.hintRevealed ? gd.hint : null,
        round: gd.round,
        winners: gd.winners
    };
};

const registerCinemojiHandlers = (io, socket, rooms) => {
    socket.on('cinemoji_guess', ({ roomId, guess }) => {
        try {
            const room = rooms.get(roomId);
            if (!room || room.gameData.phase !== 'GUESSING') return;
            
            const gd = room.gameData;
            if (!guess || typeof guess !== 'string') return;

            const userGuessNorm = normalize(guess);
            const validAnswers = gd.currentTheme.answers.map(a => normalize(a));
            const player = room.players.find(p => p.id === socket.id);

            if (!player) return;

            // 1. VERIFICA ACERTO EXATO (Em qualquer uma das respostas aceitas)
            if (validAnswers.includes(userGuessNorm)) {
                if (!gd.winners.includes(player.nickname)) {
                    let basePoints = gd.winners.length === 0 ? 10 : (gd.winners.length === 1 ? 5 : 3);
                    if (gd.hintRevealed) basePoints = Math.ceil(basePoints / 2);

                    player.score += basePoints;
                    gd.winners.push(player.nickname);
                    
                    io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} acertou! (+${basePoints})` });
                    io.to(roomId).emit('update_players', room.players);
                    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });

                    if (gd.winners.length === room.players.length) {
                        if (gd.timer) clearInterval(gd.timer);
                        gd.phase = 'REVEAL';
                        io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
                        setTimeout(() => startRound(io, room, roomId), 4000);
                    }
                }
                return;
            }

            // 2. VERIFICA "QUASE LÁ" (Typos / Ortografia)
            // Checa a distância contra a resposta PRINCIPAL (a primeira) e as outras
            let isClose = false;
            for (let answer of validAnswers) {
                const distance = getLevenshteinDistance(userGuessNorm, answer);
                const len = answer.length;
                
                // Tolerância dinâmica:
                // Palavras curtas (<5): Tolera 1 erro
                // Palavras médias (5-10): Tolera 2 erros
                // Palavras longas (>10): Tolera 3 erros
                let tolerance = 1;
                if (len > 5) tolerance = 2;
                if (len > 10) tolerance = 3;

                if (distance <= tolerance && distance > 0) {
                    isClose = true;
                    break;
                }
            }

            if (isClose) {
                socket.emit('cinemoji_close', 'Quase lá! Verifique a ortografia.');
            } else {
                socket.emit('cinemoji_wrong');
            }

        } catch (error) {
            console.error("[CINEMOJI] Handler Error:", error);
        }
    });
};

module.exports = { startCinemoji, registerCinemojiHandlers };