const { generateDeck } = require('../utils/helpers');

let THEMES_ITO = [];
try { THEMES_ITO = require('../data/themes.json'); } catch (e) { THEMES_ITO = [{ title: "Tema Livre", min: "-", max: "+" }]; }

const startIto = (io, room, roomId) => {
    const deck = generateDeck(); 
    const theme = (THEMES_ITO && THEMES_ITO.length > 0) ? THEMES_ITO[Math.floor(Math.random() * THEMES_ITO.length)] : { title: "Livre", min: "Min", max: "Max" };

    room.gameData = { theme }; 
    room.phase = 'GAME'; 
    
    room.players.forEach(p => { 
        p.secretNumber = deck.pop(); 
        p.clue = ''; 
        p.hasSubmitted = false;
        delete p.isCorrect;
    });
    
    io.to(roomId).emit('game_started', { 
        gameType: 'ITO', phase: 'CLUE_PHASE', 
        gameData: room.gameData, players: room.players 
    });
    
    room.players.forEach(p => io.to(p.id).emit('your_secret_number', p.secretNumber));
};

const registerItoHandlers = (io, socket, rooms) => {
    socket.on('submit_clue', ({ roomId, clue }) => {
        const room = rooms.get(roomId); if(!room) return;
        const p = room.players.find(x => x.id === socket.id);
        if(p) { 
            p.clue = clue; p.hasSubmitted = true;
            if(room.players.every(x => x.hasSubmitted)) {
                io.to(roomId).emit('phase_change', { phase: 'ORDERING', players: room.players });
            } else {
                io.to(roomId).emit('player_submitted', { playerId: socket.id });
            }
        }
    });

    socket.on('update_order', ({ roomId, newOrderIds }) => {
        const room = rooms.get(roomId); if(!room) return;
        const reordered = []; 
        newOrderIds.forEach(id => { const p = room.players.find(pl => pl.id === id); if(p) reordered.push(p); });
        room.players = reordered; 
        socket.to(roomId).emit('order_updated', room.players);
    });

    socket.on('reveal_cards', ({ roomId }) => {
        const room = rooms.get(roomId); if(!room || room.host !== socket.id) return; 
        room.phase = 'REVEAL';
        const perfectOrder = [...room.players].sort((a, b) => a.secretNumber - b.secretNumber);
        let totalScore = 0;
        const results = room.players.map((player, index) => {
            const isCorrect = player.id === perfectOrder[index].id; 
            if (isCorrect) totalScore++;
            return { ...player, isCorrect, secretNumber: player.secretNumber };
        });
        io.to(roomId).emit('game_over', { results, totalScore, maxScore: room.players.length });
    });

    socket.on('ito_restart', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room && room.host === socket.id) startIto(io, room, roomId);
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    const me = room.players.find(p => p.id === newId);
    if (me && me.secretNumber !== undefined) socket.emit('your_secret_number', me.secretNumber);
    
    // ITO não tem gameData complexo, mas garante envio de estado
    return true; 
};

module.exports = { startIto, registerItoHandlers, handleRejoin };