const { shuffle } = require('../utils/helpers');

// --- CARREGAMENTO SEGURO DE TEMAS ---
let THEMES = [];
try {
    const loaded = require('../data/themes_cinemoji.json');
    if (Array.isArray(loaded)) {
        // Filtra apenas temas que tenham emojis E título, para evitar crash
        THEMES = loaded.filter(t => t && t.title && t.emojis);
    }
} catch (e) {
    console.warn("[CINEMOJI] Erro/Ausência JSON:", e.message);
}

// Backup garantido se a lista estiver vazia ou inválida
if (!THEMES || THEMES.length === 0) {
    THEMES = [
        { emojis: "🦁👑", title: "O Rei Leão" },
        { emojis: "🚢🧊💔", title: "Titanic" },
        { emojis: "🕷️👨", title: "Homem Aranha" },
        { emojis: "👻🚫", title: "Caça Fantasmas" },
        { emojis: "🦖Park", title: "Jurassic Park" },
        { emojis: "🧙‍♂️💍🔥", title: "Senhor dos Aneis" }
    ];
}

// Gera uma dica mascarada (Ex: "Matrix" -> "M _ _ _ _ _")
const generateHint = (title) => {
    if (!title) return "???";
    return title.split('').map((char, i) => {
        if (char === ' ') return '  '; 
        // Mantém caracteres especiais e números visíveis, esconde letras
        if (/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(char)) return char; 
        return i === 0 ? char : '_'; 
    }).join(' ');
};

const startCinemoji = (io, room, roomId) => {
    console.log(`[CINEMOJI] Iniciando na sala ${roomId}`);
    
    // Clona e embaralha
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
    
    // Avisa que começou
    io.to(roomId).emit('game_started', { 
        gameType: 'CINEMOJI', 
        phase: 'GAME', 
        players: room.players 
    });
    
    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    try {
        const gd = room.gameData;
        
        // Limpa timer anterior para evitar sobreposição (causa comum de travamentos)
        if (gd.timer) clearInterval(gd.timer);

        // Se acabou o baralho
        if (gd.deck.length === 0) {
            const winner = room.players.sort((a,b) => b.score - a.score)[0];
            io.to(roomId).emit('game_over', { winner, results: room.players });
            return;
        }

        gd.round++;
        gd.currentTheme = gd.deck.pop();

        // VALIDAÇÃO CRÍTICA: Se o tema for inválido, tenta o próximo recursivamente
        if (!gd.currentTheme || !gd.currentTheme.title) {
            console.error(`[CINEMOJI] Tema inválido encontrado na sala ${roomId}. Pulando.`);
            startRound(io, room, roomId); 
            return;
        }

        gd.phase = 'GUESSING';
        gd.winners = [];
        gd.hintRevealed = false;
        gd.hint = generateHint(gd.currentTheme.title); 
        
        let timeLeft = 60;
        
        // Envia estado inicial da rodada
        io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });

        gd.timer = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('cinemoji_timer', timeLeft);

            // --- LÓGICA DA DICA (30s) ---
            if (timeLeft === 30 && !gd.hintRevealed) {
                gd.hintRevealed = true;
                io.to(roomId).emit('cinemoji_hint', gd.hint); // Envia a dica
                io.to(roomId).emit('receive_message', { 
                    nickname: 'SISTEMA', 
                    text: '💡 DICA LIBERADA! Valendo metade dos pontos.' 
                });
            }

            // --- FIM DO TEMPO ---
            if (timeLeft <= 0) {
                clearInterval(gd.timer);
                gd.phase = 'REVEAL';
                io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
                
                setTimeout(() => {
                    startRound(io, room, roomId);
                }, 5000);
            }
        }, 1000);

    } catch (error) {
        console.error(`[CINEMOJI] CRASH na startRound: ${error.message}`);
        // Recuperação de falha catastrófica
        io.to(roomId).emit('error_msg', "Erro interno no jogo. Tentando próxima rodada...");
        setTimeout(() => startRound(io, room, roomId), 2000);
    }
};

const getPublicData = (room) => {
    const gd = room.gameData;
    // Proteção se currentTheme for nulo
    if (!gd.currentTheme) return {};

    return {
        emojis: gd.currentTheme.emojis,
        // Só envia o título real na fase de revelação
        title: gd.phase === 'REVEAL' ? gd.currentTheme.title : null, 
        hint: gd.hintRevealed ? gd.hint : null, // Envia dica se revelada
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
            
            // Sanitização para evitar crash com input vazio
            if (!guess || typeof guess !== 'string') return;
            if (!gd.currentTheme || !gd.currentTheme.title) return; // Proteção

            const correctTitle = gd.currentTheme.title.toLowerCase().trim();
            const userGuess = guess.toLowerCase().trim();
            const player = room.players.find(p => p.id === socket.id);

            if (!player) return;

            if (userGuess === correctTitle) {
                // --- ACERTOU ---
                if (!gd.winners.includes(player.nickname)) {
                    
                    // Pontuação: Se dica revelada, metade dos pontos
                    let basePoints = gd.winners.length === 0 ? 10 : (gd.winners.length === 1 ? 5 : 3);
                    if (gd.hintRevealed) basePoints = Math.ceil(basePoints / 2);

                    player.score += basePoints;
                    gd.winners.push(player.nickname);
                    
                    io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} acertou! (+${basePoints})` });
                    io.to(roomId).emit('update_players', room.players);
                    
                    // Atualiza lista de vencedores no front
                    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });

                    // Se todos acertaram, finaliza a rodada mais rápido
                    if (gd.winners.length === room.players.length) {
                        if (gd.timer) clearInterval(gd.timer);
                        gd.phase = 'REVEAL';
                        io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
                        setTimeout(() => startRound(io, room, roomId), 4000);
                    }
                }
            } else {
                // --- ERROU (Não trava o jogo, apenas avisa o socket) ---
                socket.emit('cinemoji_wrong');
            }
        } catch (error) {
            console.error("[CINEMOJI] Erro no handler:", error);
        }
    });
};

module.exports = { startCinemoji, registerCinemojiHandlers };