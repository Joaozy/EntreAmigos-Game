const RoomManager = require('../managers/RoomManager');

const createDeck = () => {
    const deck = [];
    for(let i = 1; i <= 100; i++) deck.push(i);
    return deck.sort(() => 0.5 - Math.random());
};

let THEMES = [
    { title: "Popularidade", min: "Baixa", max: "Alta" },
    { title: "Tamanho", min: "Pequeno", max: "Grande" },
    { title: "Utilidade", min: "Inútil", max: "Útil" },
    { title: "Perigo", min: "Seguro", max: "Mortal" },
    { title: "Inteligência", min: "Burro", max: "Gênio" },
    { title: "Sabor", min: "Ruim", max: "Delicioso" }
];

try {
    const loaded = require('../data/themes.json');
    if (Array.isArray(loaded) && loaded.length > 0) THEMES = loaded;
} catch (e) {
    console.log("[ITO] Usando temas padrão.");
}

module.exports = (io, socket, RoomManager) => {
    
    const getUserId = (room) => {
        const player = room.players.find(p => p.socketId === socket.id);
        return player ? player.userId : socket.data.userId;
    };

    // 1. INICIAR RODADA (Host escolheu o tema)
    socket.on('ito_start_round', async ({ roomId, themeType, customTheme }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            const userId = getUserId(room);

            // Validação: Só o Escolhedor da vez pode iniciar
            if (room.state.chooserId && room.state.chooserId !== userId) return;

            // Define o Tema
            let selectedTheme;
            if (themeType === 'custom' && customTheme) {
                selectedTheme = customTheme;
            } else {
                selectedTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
            }

            // Distribui Cartas
            const deck = createDeck();
            const playerData = {};
            
            room.players.forEach(p => {
                playerData[p.userId] = {
                    secretNumber: deck.pop(),
                    clue: ''
                };
            });

            // Atualiza Estado
            room.state.theme = selectedTheme;
            room.state.playerData = playerData;
            room.state.currentOrder = room.players.map(p => p.userId);
            room.state.phase = 'CLUE_PHASE';

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 2. ENVIAR PISTA
    socket.on('submit_clue', async ({ roomId, clue }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room || !room.state) return;
            const userId = getUserId(room);

            if (!room.state.playerData[userId]) return;

            room.state.playerData[userId].clue = clue;
            
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

    // 3. REORDENAR
    socket.on('update_order', async ({ roomId, newOrderIds }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            
            room.state.currentOrder = newOrderIds;
            await RoomManager.saveRoom(room);
            socket.to(roomId).emit('update_game_data', { gameData: { currentOrder: newOrderIds } });
        } catch(e) { console.error(e); }
    });

    // 4. REVELAR
    socket.on('reveal_cards', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            
            room.state.phase = 'REVEAL';
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 5. NOVA RODADA (Sorteia novo Escolhedor)
    socket.on('ito_back_to_setup', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room) {
                const players = room.players;
                const randomPlayer = players[Math.floor(Math.random() * players.length)];
                
                // Passa o ID explicitamente como string
                module.exports.initGame(room, randomPlayer.userId); 
                
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- INIT DO JOGO (COM PROTEÇÃO CONTRA O OBJETO IO) ---
module.exports.initGame = (room, arg2 = null) => {
    
    // CORREÇÃO DO ERRO CIRCULAR:
    // Se arg2 for uma String, é o ID do jogador (veio do 'ito_back_to_setup').
    // Se arg2 for um Objeto (IO) ou null, é o início do jogo (veio do 'server.js').
    let specificChooserId = null;
    if (typeof arg2 === 'string') {
        specificChooserId = arg2;
    }

    let chooser = specificChooserId;
    
    // Se não foi passado um ID válido, define o Host como chooser
    if (!chooser) {
        const host = room.players.find(p => p.isHost);
        chooser = host ? host.userId : room.players[0].userId;
    }

    room.state = { 
        theme: null, 
        phase: 'SETUP',
        playerData: {},
        currentOrder: [],
        chooserId: chooser 
    };
    return { phase: 'SETUP' }; 
};

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
                secretNumber: (isReveal || isMe) ? data.secretNumber : null
            };
        });
    }

    return {
        theme: gd.theme,
        phase: gd.phase,
        currentOrder: gd.currentOrder,
        playersData: publicPlayersData,
        chooserId: gd.chooserId
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;

        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'ITO',
            phase: room.state.phase,
            gameData: getPublicData(room.state, targetUserId)
        });
    }
}

module.exports.getPublicData = getPublicData;