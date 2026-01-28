require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path'); // <--- IMPORTANTE PARA SERVIR O FRONTEND
const { createAdapter } = require("@socket.io/redis-adapter");
const { connectRedis, pubClient, subClient } = require('./config/redis');
const RoomManager = require('./managers/RoomManager');

// --- CARREGA MÓDULOS DOS JOGOS ---
const GAME_MODULES = {
    'ITO': require('./games/game_ito'),
    'CHA_CAFE': require('./games/game_chacafe'),
    'MEGAQUIZ': require('./games/game_megaquiz'),
    'WHOAMI': require('./games/game_whoami'),
    'CODENAMES': require('./games/game_codenames'),
    'STOP': require('./games/game_stop'),
    'TERMO': require('./games/game_termo'),
    'CINEMOJI': require('./games/game_cinemoji'),
    'DIXIT': require('./games/game_dixit'),
    'SPY': require('./games/game_spy'),
    'ENIGMA': require('./games/game_enigma'),
};

const app = express();
app.use(cors());

// --- AJUSTE CRUCIAL: SERVIR FRONTEND REACT ---
// Isso faz o Node entregar a pasta 'dist' (ou 'build') onde está o React compilado
const buildPath = path.join(__dirname, '../client/dist');
app.use(express.static(buildPath));

// Qualquer rota que não seja API/Socket será redirecionada para o index.html do React
// Isso permite que o React Router funcione corretamente (ex: /sala/XYZ)
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

const server = http.createServer(app);

(async () => {
    try {
        console.log("⏳ Iniciando serviços...");
        await connectRedis();

        const io = new Server(server, {
            cors: { origin: "*", methods: ["GET", "POST"] },
            adapter: createAdapter(pubClient, subClient)
        });

        io.on('connection', (socket) => {
            console.log(`[+] Cliente conectado: ${socket.id}`);

            // Injeta dependências nos módulos de jogo
            Object.values(GAME_MODULES).forEach(gameModule => {
                if (typeof gameModule === 'function') {
                    gameModule(io, socket, RoomManager);
                }
            });

            // 1. IDENTIFICAÇÃO DO USUÁRIO
            socket.on('identify', ({ userId, nickname }) => {
                socket.data.userId = userId;
                socket.data.nickname = nickname;
            });

            // 2. RECONEXÃO (Com proteção contra salas expiradas)
            socket.on('rejoin_room', async ({ roomId, userId }) => {
                if (!roomId) return;
                const effectiveUserId = userId || socket.data.userId;
                
                const room = await RoomManager.getRoom(roomId);
                
                if (room) {
                    // Sucesso: Reconecta
                    socket.join(roomId);
                    socket.data.roomId = roomId;
                    socket.data.userId = effectiveUserId;
                    
                    const player = room.players.find(p => p.userId === effectiveUserId);
                    if (player) {
                        player.socketId = socket.id;
                        player.isOnline = true;
                        console.log(`[↻] Player ${player.nickname} reconectou na sala ${roomId}`);
                        await RoomManager.saveRoom(room);
                    }

                    // Prepara dados personalizados (segurança)
                    let gameDataToSend = room.state;
                    const gameModule = GAME_MODULES[room.gameType];
                    if (gameModule && typeof gameModule.getPublicData === 'function') {
                        gameDataToSend = gameModule.getPublicData(room.state, effectiveUserId);
                    }

                    socket.emit('joined_room', {
                        roomId,
                        players: room.players,
                        gameType: room.gameType,
                        phase: room.phase,
                        gameData: gameDataToSend || {}
                    });
                } else {
                    // Falha: Sala não existe mais -> Avisa o cliente para limpar cache
                    console.log(`[🚫] Rejoin falhou: Sala ${roomId} não encontrada.`);
                    socket.emit('rejoin_failed');
                }
            });

            // 3. CRIAR SALA
            socket.on('create_room', async ({ nickname, gameId, userId }) => {
                const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
                const selectedGame = gameId || 'TERMO';

                const newRoom = {
                    id: roomId, players: [], gameType: selectedGame, 
                    phase: 'LOBBY', state: {}, createdAt: Date.now()
                };

                const player = { 
                    id: socket.id, socketId: socket.id, userId: userId || socket.id,
                    nickname, isHost: true, score: 0, isOnline: true
                };
                
                newRoom.players.push(player);
                await RoomManager.saveRoom(newRoom);

                socket.join(roomId);
                socket.data.roomId = roomId;
                socket.data.userId = userId;

                socket.emit('joined_room', { 
                    roomId, players: newRoom.players, gameType: selectedGame, phase: 'LOBBY'
                });
                console.log(`[★] Sala ${roomId} criada: ${selectedGame}`);
            });

            // 4. ENTRAR NA SALA
            socket.on('join_room', async ({ roomId, nickname, userId }) => {
                if (!roomId) return socket.emit('error_msg', 'ID inválido.');
                const room = await RoomManager.getRoom(roomId);

                if (room) {
                    const existingIdx = room.players.findIndex(p => p.userId === userId);
                    if (existingIdx !== -1) {
                        room.players[existingIdx].socketId = socket.id;
                        room.players[existingIdx].nickname = nickname;
                        room.players[existingIdx].isOnline = true;
                    } else {
                        room.players.push({ 
                            id: socket.id, socketId: socket.id, userId: userId || socket.id,
                            nickname, isHost: false, score: 0, isOnline: true
                        });
                    }

                    await RoomManager.saveRoom(room);
                    
                    socket.join(room.id);
                    socket.data.roomId = room.id;
                    socket.data.userId = userId;

                    // Envia dados personalizados
                    let myData = room.state;
                    const gameModule = GAME_MODULES[room.gameType];
                    if (gameModule && typeof gameModule.getPublicData === 'function') {
                        myData = gameModule.getPublicData(room.state, userId);
                    }

                    socket.emit('joined_room', {
                        roomId: room.id,
                        players: room.players,
                        gameType: room.gameType,
                        phase: room.phase,
                        gameData: myData || {}
                    });

                    // Avisa os outros (apenas atualização de lista de players)
                    socket.to(room.id).emit('update_players', room.players);
                    console.log(`[->] ${nickname} entrou na sala ${room.id}`);
                } else {
                    socket.emit('error_msg', 'Sala não encontrada!');
                }
            });

            // 5. SELECIONAR JOGO (Lobby)
            socket.on('select_game', async ({ gameId }) => {
                const roomId = socket.data.roomId;
                if (!roomId) return;
                const room = await RoomManager.getRoom(roomId);
                if (room && GAME_MODULES[gameId]) {
                    room.gameType = gameId;
                    room.state = {}; 
                    room.phase = 'LOBBY';
                    await RoomManager.saveRoom(room);

                    io.to(room.id).emit('joined_room', {
                        roomId: room.id, players: room.players, gameType: gameId, phase: 'LOBBY'
                    });
                }
            });

            // 6. INICIAR JOGO (Com Broadcast Personalizado)
            socket.on('start_game', async () => {
                const roomId = socket.data.roomId;
                if (!roomId) return;
                const room = await RoomManager.getRoom(roomId);
                if (!room) return;
        
                const gameModule = GAME_MODULES[room.gameType];
                console.log(`[▶] Iniciando ${room.gameType} na sala ${roomId}`);
        
                if (gameModule && typeof gameModule.initGame === 'function') {
                    try {
                        const initData = gameModule.initGame(room, io); 
                        room.phase = initData.phase || 'PLAYING';
                        
                        // Se o initGame retornou gameData, atualiza o state
                        if(initData.gameData) room.state = initData.gameData;

                        await RoomManager.saveRoom(room);
        
                        // BROADCAST INTELIGENTE: Envia dados filtrados para cada jogador
                        const sockets = await io.in(roomId).fetchSockets();
                        for (const s of sockets) {
                            let personalizedData = room.state;
                            if (gameModule.getPublicData) {
                                personalizedData = gameModule.getPublicData(room.state, s.data.userId);
                            }
                            s.emit('joined_room', {
                                roomId: room.id, players: room.players, gameType: room.gameType,
                                phase: room.phase, gameData: personalizedData || {}
                            });
                        }
                    } catch (err) {
                        console.error(`Erro init ${room.gameType}:`, err);
                        socket.emit('error_msg', 'Erro ao iniciar jogo.');
                    }
                } else {
                    // Fallback para jogos sem módulo
                    room.phase = 'PLAYING';
                    room.state = { status: 'started' };
                    await RoomManager.saveRoom(room);
                    io.to(roomId).emit('joined_room', {
                        roomId: room.id, players: room.players, gameType: room.gameType,
                        phase: room.phase, gameData: room.state
                    });
                }
            });

            // 7. CHAT E SAÍDA
            socket.on('send_message', (data) => io.to(data.roomId).emit('receive_message', data));
            
            socket.on('leave_room', async () => {
                const roomId = socket.data.roomId;
                if (roomId) {
                    const room = await RoomManager.getRoom(roomId);
                    if (room) {
                        socket.leave(roomId);
                        room.players = room.players.filter(p => p.socketId !== socket.id);
                        if (room.players.length === 0) {
                            await RoomManager.deleteRoom(roomId);
                            console.log(`[X] Sala ${roomId} vazia e removida.`);
                        } else {
                            const hasHost = room.players.some(p => p.isHost);
                            if (!hasHost && room.players.length > 0) room.players[0].isHost = true;
                            await RoomManager.saveRoom(room);
                            io.to(roomId).emit('update_players', room.players);
                        }
                    }
                    socket.data.roomId = null;
                }
            });

            socket.on('disconnect', async () => { 
                // A reconexão é tratada no 'rejoin_room', aqui apenas logs opcionais
            });
        });

        const PORT = process.env.PORT || 3001;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🔥 Servidor rodando na porta ${PORT} (Redis Mode + React Static)`);
        });

    } catch (error) {
        console.error("❌ Falha fatal:", error);
        process.exit(1);
    }
})();