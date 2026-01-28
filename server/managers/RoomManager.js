// server/managers/RoomManager.js
const { client } = require('../config/redis');

const ROOM_PREFIX = 'room:';
const ROOM_TTL = 60 * 60 * 24; // 24 horas em segundos

class RoomManager {
    
    // Pega uma sala do Redis
    static async getRoom(roomId) {
        if (!roomId) return null;
        const data = await client.get(ROOM_PREFIX + roomId.toUpperCase());
        return data ? JSON.parse(data) : null;
    }

    // Salva/Atualiza uma sala no Redis
    static async saveRoom(room) {
        if (!room || !room.id) return;
        // Serializa o objeto para texto
        const data = JSON.stringify(room);
        // Salva com "Validade" (TTL) para não acumular lixo
        await client.set(ROOM_PREFIX + room.id.toUpperCase(), data, { EX: ROOM_TTL });
    }

    // Remove uma sala (ex: quando acaba o jogo)
    static async deleteRoom(roomId) {
        if (!roomId) return;
        await client.del(ROOM_PREFIX + roomId.toUpperCase());
    }

    // Verifica se uma sala existe
    static async exists(roomId) {
        return (await client.exists(ROOM_PREFIX + roomId.toUpperCase())) === 1;
    }
}

module.exports = RoomManager;