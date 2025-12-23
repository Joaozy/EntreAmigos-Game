const MOVIES = require('../data/themes_cinemoji.json');

const startCinemoji = (io, room, roomId) => {
    room.gameData = {
        currentMovieIndex: 0,
        shuffledMovies: [...MOVIES].sort(() => Math.random() - 0.5),
        score: {}, // { playerId: points }
        roundEndTime: 0,
        phase: 'PLAYING',
        lastWinner: null
    };
    
    // Inicializa placar zerado
    room.players.forEach(p => room.gameData.score[p.id] = 0);
    room.phase = 'GAME';

    nextRound(io, room, roomId);
};

const nextRound = (io, room, roomId) => {
    const gd = room.gameData;
    
    // Verifica se acabou os filmes
    if (gd.currentMovieIndex >= gd.shuffledMovies.length) {
        io.to(roomId).emit('game_over', { 
            gameData: getPublicData(room), 
            winner: getWinner(room) 
        });
        return;
    }

    const currentMovie = gd.shuffledMovies[gd.currentMovieIndex];
    gd.lastWinner = null;
    
    // Envia novo emoji
    io.to(roomId).emit('game_started', {
        gameType: 'CINEMOJI',
        phase: 'GAME',
        gameData: getPublicData(room),
        players: room.players
    });
};

const getPublicData = (room) => {
    const gd = room.gameData;
    const current = gd.shuffledMovies[gd.currentMovieIndex] || {};
    return {
        emojis: current.emojis,
        score: gd.score,
        phase: gd.phase,
        lastWinner: gd.lastWinner
    };
};

const getWinner = (room) => {
    const scores = room.gameData.score;
    const sorted = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const winnerId = sorted[0][0];
    return room.players.find(p => p.id === winnerId)?.nickname || 'Alguém';
};

const registerCinemojiHandlers = (io, socket, rooms) => {
    socket.on('cinemoji_guess', ({ roomId, guess }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameType !== 'CINEMOJI') return;
        
        const gd = room.gameData;
        const currentMovie = gd.shuffledMovies[gd.currentMovieIndex];
        
        // Normaliza para comparar (remove acentos e deixa minusculo)
        const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userGuess = normalize(guess);
        
        const isCorrect = currentMovie.answers.some(ans => normalize(ans) === userGuess);

        if (isCorrect) {
            // Pontua
            gd.score[socket.id] = (gd.score[socket.id] || 0) + 1;
            gd.lastWinner = { nickname: room.players.find(p=>p.id===socket.id)?.nickname, answer: currentMovie.answers[0] };
            
            // Avança
            gd.currentMovieIndex++;
            
            // Avisa que acertou e manda o próximo
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎬 ${gd.lastWinner.nickname} acertou! Era "${gd.lastWinner.answer}"` });
            
            // Pequeno delay para lerem que alguém acertou
            setTimeout(() => {
                nextRound(io, room, roomId);
            }, 2000);
            
            // Atualiza tela (mostra quem ganhou a rodada)
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'ROUND_WIN' });
        }
    });
};

module.exports = { startCinemoji, registerCinemojiHandlers };