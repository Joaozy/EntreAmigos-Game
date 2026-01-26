const { generateDeck } = require('../utils/helpers');

// Temas de segurança
const THEMES = [
    { title: "Popularidade", min: "Baixa", max: "Alta" },
    { title: "Tamanho", min: "Pequeno", max: "Grande" },
    { title: "Utilidade", min: "Inútil", max: "Útil" },
    { title: "Perigo", min: "Seguro", max: "Mortal" }
];

const startIto = (io, room, roomId) => {
    const deck = generateDeck();
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    room.gameData = { theme };
    room.phase = 'GAME';

    room.players.forEach(p => {
        p.secretNumber = deck.pop();
        p.clue = '';
        p.hasSubmitted = false;
        delete p.isCorrect;
    });

    io.to(roomId).emit('game_started', {
        gameType: 'ITO',
        phase: 'CLUE_PHASE',
        gameData: room.gameData,
        players: room.players
    });

    // Envia segredo individualmente
    room.players.forEach(p => {
        io.to(p.socketId).emit('your_secret_number', p.secretNumber);
    });
};

const registerHandlers = (io, socket, rooms) => {
    socket.on('submit_clue', ({ roomId, clue }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.socketId === socket.id);

        if (player) {
            player.clue = clue;
            player.hasSubmitted = true;

            // Verifica se todos enviaram
            if (room.players.every(p => p.hasSubmitted)) {
                io.to(roomId).emit('phase_change', { phase: 'ORDERING', players: room.players });
            } else {
                io.to(roomId).emit('player_submitted', { playerId: player.userId }); // Usa userId pra front saber quem foi
                io.to(roomId).emit('update_players', room.players);
            }
        }
    });

    socket.on('update_order', ({ roomId, newOrderIds }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Reordena baseado no userId (que é o ID que o front usa nas keys)
        const reordered = [];
        newOrderIds.forEach(uid => {
            const p = room.players.find(pl => pl.userId === uid);
            if (p) reordered.push(p);
        });
        room.players = reordered;
        socket.to(roomId).emit('order_updated', room.players);
    });

    socket.on('reveal_cards', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        room.phase = 'REVEAL';
        const perfectOrder = [...room.players].sort((a, b) => a.secretNumber - b.secretNumber);
        
        let totalScore = 0;
        const results = room.players.map((player, index) => {
            const isCorrect = player.userId === perfectOrder[index].userId;
            if (isCorrect) totalScore++;
            return { ...player, isCorrect };
        });

        io.to(roomId).emit('game_over', { results, totalScore, maxScore: room.players.length });
    });

    socket.on('ito_restart', ({ roomId }) => {
        const room = rooms.get(roomId);
        if(room) startIto(io, room, roomId);
    });
};

module.exports = { startIto, registerHandlers };