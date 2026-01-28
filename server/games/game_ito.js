const { generateDeck } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

// Carrega os temas do arquivo JSON
let THEMES = [
    // Fallback caso o arquivo falhe
    { title: "Popularidade", min: "Baixa", max: "Alta" },
    { title: "Tamanho", min: "Pequeno", max: "Grande" }
];

try {
    // Importa da pasta data
    const loaded = require('../data/themes.json');
    if (Array.isArray(loaded) && loaded.length > 0) {
        THEMES = loaded;
        console.log(`[ITO] ${THEMES.length} temas carregados com sucesso.`);
    }
} catch (e) {
    console.error("[ITO] Erro ao carregar themes.json, usando padrão.", e.message);
}

module.exports = (io, socket, RoomManager) => {
    
    // 1. ENVIAR PISTA
    socket.on('submit_clue', async ({ roomId, clue }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;

            // Inicializa playerData se não existir
            if (!room.state.playerData) room.state.playerData = {};
            // Garante que o jogador tem dados
            if (!room.state.playerData[socket.data.userId]) return;

            room.state.playerData[socket.data.userId].clue = clue;
            
            // Verifica se todos enviaram (apenas quem tem carta)
            const allSubmitted = room.players.every(p => {
                const pData = room.state.playerData[p.userId];
                return pData && pData.clue;
            });

            if (allSubmitted) {
                room.state.phase = 'ORDERING';
            }

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 2. REORDENAR CARTAS
    socket.on('update_order', async ({ roomId, newOrderIds }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            
            room.state.currentOrder = newOrderIds;
            
            await RoomManager.saveRoom(room);
            // Broadcast direto para atualização rápida visual
            socket.to(roomId).emit('update_game_data', { gameData: { currentOrder: newOrderIds } });
        } catch(e) { console.error(e); }
    });

    // 3. REVELAR CARTAS
    socket.on('reveal_cards', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            
            room.state.phase = 'REVEAL';
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 4. REINICIAR
    socket.on('ito_restart', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room) {
                // Reinicia lógica mantendo a sala
                const newState = module.exports.initGame(room); 
                room.state = newState.gameData; // Atualiza o estado da sala
                room.phase = newState.phase;
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- LÓGICA DO JOGO ---

module.exports.initGame = (room) => {
    const deck = generateDeck(); // Usa a função importada
    const playerData = {};
    
    room.players.forEach(p => {
        playerData[p.userId] = {
            secretNumber: deck.pop(),
            clue: ''
        };
    });

    // Escolhe um tema aleatório da lista carregada
    const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];

    // Estado inicial salvo no Redis
    room.state = { 
        theme: randomTheme, 
        phase: 'CLUE_PHASE',
        playerData: playerData,
        currentOrder: room.players.map(p => p.userId)
    };

    // Retorna para o server.js usar
    return { phase: 'CLUE_PHASE', gameData: room.state }; 
};

// --- FILTRO DE DADOS (SEGURANÇA) ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    
    const isReveal = gd.phase === 'REVEAL';

    const publicPlayersData = {};
    if (gd.playerData) {
        Object.keys(gd.playerData).forEach(pid => {
            const data = gd.playerData[pid];
            const isMe = pid === userId;
            
            publicPlayersData[pid] = {
                clue: data.clue,
                hasSubmitted: !!data.clue,
                // O Segredo (Carta) só aparece se for REVEAL ou se for EU mesmo
                secretNumber: (isReveal || isMe) ? data.secretNumber : null
            };
        });
    }

    return {
        theme: gd.theme,
        phase: gd.phase,
        currentOrder: gd.currentOrder,
        playersData: publicPlayersData
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'ITO',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

module.exports.getPublicData = getPublicData;