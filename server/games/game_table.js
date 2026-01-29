module.exports = (io, socket, RoomManager) => {
    // Lógica genérica de mesa (se necessário no futuro)
    socket.on('table_update', async ({ roomId, data }) => {
        const room = await RoomManager.getRoom(roomId);
        if (room) {
            room.state = { ...room.state, ...data };
            await RoomManager.saveRoom(room);
            io.to(roomId).emit('update_game_data', { gameData: room.state });
        }
    });
};

module.exports.initGame = (room) => {
    console.log(`[TABLE] Iniciando mesa genérica na sala ${room.id}`);
    return {
        phase: 'PLAYING',
        gameData: {
            notes: [],
            active: true
        }
    };
};

module.exports.getPublicData = (gameData) => {
    return gameData || {};
};