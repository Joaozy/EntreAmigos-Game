const { shuffle } = require('../utils/helpers');
let THEMES = [];
try {
    THEMES = require('../data/themes_cinemoji.json');
} catch (e) {
    // Backup
    THEMES = [
        { emojis: "🦁👑", title: "O Rei Leão" },
        { emojis: "🚢🧊💔", title: "Titanic" },
        { emojis: "🕷️👨", title: "Homem Aranha" },
        { emojis: "👻🚫", title: "Caça Fantasmas" }
    ];
}

const startCinemoji = (io, room, roomId) => {
    let deck = shuffle([...THEMES]);
    
    room.players.forEach(p => p.score = 0);
    
    room.gameData = {
        deck: deck,
        currentTheme: null,
        round: 0,
        phase: 'GUESSING', // GUESSING, REVEAL
        winners: [],
        timer: null
    };
    
    room.phase = 'GAME';
    io.to(roomId).emit('game_started', { gameType: 'CINEMOJI', phase: 'GAME', players: room.players });
    
    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    
    if (gd.deck.length === 0) {
        // Fim de jogo
        const winner = room.players.sort((a,b) => b.score - a.score)[0];
        io.to(roomId).emit('game_over', { winner, results: room.players });
        return;
    }

    gd.round++;
    gd.currentTheme = gd.deck.pop();
    gd.phase = 'GUESSING';
    gd.winners = [];
    
    // --- TIMER DE 60 SEGUNDOS ---
    let timeLeft = 60;
    if (gd.timer) clearInterval(gd.timer);
    
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'GUESSING' });

    gd.timer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit('cinemoji_timer', timeLeft); // Envia o tempo para o front

        if (timeLeft <= 0) {
            clearInterval(gd.timer);
            // Tempo acabou: Revela a resposta sem vencedores
            gd.phase = 'REVEAL';
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
            
            setTimeout(() => {
                startRound(io, room, roomId);
            }, 5000);
        }
    }, 1000);
};

const getPublicData = (room) => {
    return {
        emojis: room.gameData.currentTheme.emojis,
        title: room.gameData.phase === 'REVEAL' ? room.gameData.currentTheme.title : null, // Esconde título
        round: room.gameData.round,
        winners: room.gameData.winners
    };
};

const registerCinemojiHandlers = (io, socket, rooms) => {
    socket.on('cinemoji_guess', ({ roomId, guess }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'GUESSING') return;
        
        const gd = room.gameData;
        const correctTitle = gd.currentTheme.title.toLowerCase().trim();
        const userGuess = guess.toLowerCase().trim();
        
        // Verifica resposta (simplificada, pode usar string similarity se quiser)
        if (userGuess === correctTitle) {
            const player = room.players.find(p => p.id === socket.id);
            if (player && !gd.winners.includes(player.nickname)) {
                
                // Pontuação baseada na ordem de chegada
                const points = gd.winners.length === 0 ? 10 : (gd.winners.length === 1 ? 5 : 3);
                player.score += points;
                gd.winners.push(player.nickname);
                
                io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `${player.nickname} acertou!` });
                io.to(roomId).emit('update_players', room.players);

                // Se todos acertaram, encerra logo
                if (gd.winners.length === room.players.length) {
                    clearInterval(gd.timer);
                    gd.phase = 'REVEAL';
                    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'REVEAL' });
                    setTimeout(() => startRound(io, room, roomId), 4000);
                }
            }
        }
    });
};

module.exports = { startCinemoji, registerCinemojiHandlers };