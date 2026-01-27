const { shuffle, normalize } = require('../utils/helpers');

// Fallback Temas
let THEMES = [
    { emojis: "🦁👑", answers: ["O Rei Leão", "Rei Leao"] },
    { emojis: "🚢🧊💔", answers: ["Titanic"] },
    { emojis: "👻🚫", answers: ["Caça Fantasmas", "Ghostbusters"] }
];

try {
    const loaded = require('../data/themes_cinemoji.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {}

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

module.exports = (io, socket, rooms) => {
    socket.on('cinemoji_guess', ({ roomId, guess }) => {
        try {
            const room = rooms[roomId];
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
                    let basePoints = gd.winners.length === 0 ? 10 : (gd.winners.length === 1 ? 5 : 3);
                    if (gd.hintRevealed) basePoints = Math.ceil(basePoints / 2);

                    player.score = (player.score || 0) + basePoints;
                    gd.winners.push(player.nickname);
                    
                    io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} acertou!` });
                    io.to(roomId).emit('update_players', room.players);
                    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'GUESSING' });

                    if (gd.winners.length === room.players.length) {
                        endRound(io, room, roomId);
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

        } catch (error) { console.error("[CINEMOJI] Erro:", error); }
    });
};

function endRound(io, room, roomId) {
    const gd = room.state;
    if (gd.timer) clearInterval(gd.timer);
    gd.phase = 'REVEAL';
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: 'REVEAL' });
    
    // Próxima rodada automática após 5s
    setTimeout(() => {
        // Chama initGame passando IO para iniciar o próximo timer
        const nextState = module.exports.initGame(room, io); 
        
        if (nextState.phase === 'GAME_OVER') {
             const winner = room.players.sort((a,b) => b.score - a.score)[0];
             io.to(roomId).emit('game_over', { winner, results: room.players });
        } else {
             // Atualiza todos com o novo estado
             io.to(roomId).emit('update_game_data', { gameData: nextState.gameData, phase: 'GUESSING' });
        }
    }, 5000);
}

// Inicializador (Recebe IO para iniciar timers)
module.exports.initGame = (room, io) => {
    // Inicializa estado se não existir
    if(!room.state || !room.state.deck) {
        room.state = {
            deck: shuffle([...THEMES]),
            currentTheme: null,
            round: 0,
            winners: [],
            timer: null
        };
        room.players.forEach(p => p.score = 0);
    }

    const gd = room.state;
    if (gd.deck.length === 0) return { phase: 'GAME_OVER' };

    // Configura nova rodada
    gd.round++;
    gd.currentTheme = gd.deck.pop();
    gd.phase = 'GUESSING';
    gd.winners = [];
    gd.hintRevealed = false;
    gd.hint = generateHint(gd.currentTheme.answers[0]);

    // Inicia Timer se IO foi passado
    if (io) {
        startRoundLoop(io, room, room.id);
    }

    return { 
        phase: 'GUESSING', 
        gameData: getPublicData(room.state) 
    };
};

function startRoundLoop(io, room, roomId) {
    const gd = room.state;
    let timeLeft = 60;
    
    if(gd.timer) clearInterval(gd.timer);
    gd.timer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit('cinemoji_timer', timeLeft);

        if (timeLeft === 30 && !gd.hintRevealed) {
            gd.hintRevealed = true;
            io.to(roomId).emit('cinemoji_hint', gd.hint);
        }

        if (timeLeft <= 0) {
            endRound(io, room, roomId);
        }
    }, 1000);
}

function getPublicData(gd) {
    if (!gd.currentTheme) return {};
    return {
        emojis: gd.currentTheme.emojis,
        title: gd.phase === 'REVEAL' ? gd.currentTheme.answers[0] : null, 
        hint: gd.hintRevealed ? gd.hint : null,
        round: gd.round,
        winners: gd.winners
    };
}

module.exports.getPublicData = getPublicData;