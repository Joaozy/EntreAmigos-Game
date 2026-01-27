const { generateDeck } = require('../utils/helpers');
const THEMES = [
    { title: "Popularidade", min: "Baixa", max: "Alta" },
    { title: "Tamanho", min: "Pequeno", max: "Grande" },
    { title: "Utilidade", min: "Inútil", max: "Útil" },
    { title: "Perigo", min: "Seguro", max: "Mortal" }
];

module.exports = (io, socket, rooms) => {
    socket.on('submit_clue', ({ roomId, clue }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.clue = clue;
            player.hasSubmitted = true;
            if (room.players.every(p => p.hasSubmitted)) {
                room.state.phase = 'ORDERING';
                io.to(roomId).emit('joined_room', { roomId, players: room.players, phase: 'ORDERING', gameType: 'ITO' });
            } else {
                io.to(roomId).emit('update_players', room.players);
            }
        }
    });

    socket.on('update_order', ({ roomId, newOrderIds }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const reordered = [];
        newOrderIds.forEach(uid => {
            const p = room.players.find(pl => pl.userId === uid);
            if (p) reordered.push(p);
        });
        room.players = reordered;
        socket.to(roomId).emit('update_players', room.players);
    });

    socket.on('reveal_cards', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        room.state.phase = 'REVEAL';
        const perfectOrder = [...room.players].sort((a, b) => a.secretNumber - b.secretNumber);
        let totalScore = 0;
        const results = room.players.map((player, index) => {
            const isCorrect = player.userId === perfectOrder[index].userId;
            if (isCorrect) totalScore++;
            return { ...player, isCorrect };
        });
        io.to(roomId).emit('game_over', { results, totalScore, maxScore: room.players.length, phase: 'REVEAL' });
    });

    socket.on('ito_restart', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if(room) {
            const nextState = module.exports.initGame(room);
            room.phase = nextState.phase;
            io.to(roomId).emit('joined_room', { 
                roomId, players: room.players, phase: nextState.phase, gameType: 'ITO', gameData: nextState.gameData 
            });
            // Reenvia segredos
            room.players.forEach(p => io.to(p.socketId).emit('your_secret_number', p.secretNumber));
        }
    });
};

module.exports.initGame = (room) => {
    const deck = generateDeck();
    room.state = { theme: THEMES[Math.floor(Math.random() * THEMES.length)], phase: 'CLUE_PHASE' };
    
    room.players.forEach(p => {
        p.secretNumber = deck.pop();
        p.clue = '';
        p.hasSubmitted = false;
        delete p.isCorrect;
    });
    
    // Pequeno hack: Enviar segredos aqui é difícil sem o IO. 
    // O ideal é o cliente pedir, mas vamos deixar o start_game do server.js lidar ou o restart lidar.
    // Para o primeiro start, o server.js não envia segredos específicos.
    // Vamos adicionar um delay para enviar via require IO
    setTimeout(() => {
        const io = require('../server').io;
        room.players.forEach(p => io.to(p.socketId).emit('your_secret_number', p.secretNumber));
    }, 200);

    return { phase: 'CLUE_PHASE', gameData: room.state };
};