require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createAdapter } = require("@socket.io/redis-adapter");
const { connectRedis, pubClient, subClient } = require('./config/redis');
const RoomManager = require('./managers/RoomManager');

// IMPORTAÇÃO DOS JOGOS
const GAME_MODULES = {
    'TERMO': require('./games/game_termo'),
    'MEGAQUIZ': require('./games/game_megaquiz'),
    'DIXIT': require('./games/game_dixit'),
    'STOP': require('./games/game_stop'),
    'CODENAMES': require('./games/game_codenames'),
    'WHOAMI': require('./games/game_whoami'),
    'CINEMOJI': require('./games/game_cinemoji'),
    'CHACAFE': require('./games/game_chacafe'),
    'SPY': require('./games/game_spy'),
    'ENIGMA': require('./games/game_enigma'),
    'ITO': require('./games/game_ito'),
    'TABLE': require('./games/game_table'),
    'CAMALEAO': require('./games/game_camaleao') 
};

const app = express();
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"]
}));

// Rota para assets (cartas, imagens)
app.use(express.static(path.join(__dirname, '../client/public')));
// Rota para o build do React
const buildPath = path.join(__dirname, '../client/dist');
app.use(express.static(buildPath));

const server = http.createServer(app);

// --- MAPA DE SESSÕES GLOBAIS (UserId -> SocketId) ---
// Isso garante que cada usuário só tenha 1 conexão ativa
const userSessions = {}; 

(async () => {
    try {
        console.log("⏳ Iniciando servidor...");
        await connectRedis();

        const io = new Server(server, {
            cors: { 
                origin: "*", // Aceita qualquer origem (útil se o front e back estiverem em domínios diferentes)
                methods: ["GET", "POST"],
                credentials: true
            },
            adapter: createAdapter(pubClient, subClient)
        });

        io.on('connection', (socket) => {
            console.log(`[+] Nova conexão: ${socket.id}`);

            // Injeta dependências nos jogos
            Object.values(GAME_MODULES).forEach(mod => {
                if (typeof mod === 'function') mod(io, socket, RoomManager);
            });

            // --- 1. IDENTIFICAÇÃO (LOGIN ÚNICO) ---
            socket.on('identify', async ({ userId, nickname }) => {
                if (!userId) return;

                // VERIFICA SE JÁ ESTÁ LOGADO EM OUTRO LUGAR
                const previousSocketId = userSessions[userId];
                
                if (previousSocketId && previousSocketId !== socket.id) {
                    console.log(`[AUTH] 🚫 Derrubando sessão anterior de ${nickname} (Socket ${previousSocketId})`);
                    
                    // Avisa o socket antigo para se desconectar
                    io.to(previousSocketId).emit('force_disconnect', { 
                        reason: 'Você conectou em outro dispositivo.' 
                    });
                    
                    // Força a desconexão do socket antigo
                    const oldSocket = io.sockets.sockets.get(previousSocketId);
                    if (oldSocket) oldSocket.disconnect(true);
                }

                // Registra nova sessão
                userSessions[userId] = socket.id;
                socket.data.userId = userId;
                socket.data.nickname = nickname;
                console.log(`[AUTH] ✅ Sessão registrada: ${nickname} -> ${socket.id}`);
            });

            // --- 2. RECONEXÃO INTELIGENTE (F5) ---
            socket.on('rejoin_room', async ({ roomId, userId }) => {
                if (userId) {
                    userSessions[userId] = socket.id;
                    socket.data.userId = userId;
                }

                const room = await RoomManager.getRoom(roomId);
                if (room && room.players.find(p => p.userId === userId)) {
                    socket.join(roomId);
                    socket.data.roomId = roomId;
                    
                    const player = room.players.find(p => p.userId === userId);
                    if (player) {
                        player.socketId = socket.id;
                        player.isOnline = true;
                        socket.data.nickname = player.nickname;
                        await RoomManager.saveRoom(room);
                    }

                    // Envia dados
                    let gd = room.state || {};
                    if (room.phase !== 'LOBBY') {
                        const mod = GAME_MODULES[room.gameType];
                        if (mod && mod.getPublicData) {
                            try {
                                gd = mod.getPublicData(room.state, userId);
                            } catch (e) {
                                console.error("[JOIN] Erro ao formatar dados:", e.message);
                            }
                        }
                    }
                    socket.emit('joined_room', {
                        roomId,
                        players: room.players,
                        gameType: room.gameType,
                        phase: room.phase,
                        gameData: gd || {}
                    });
                    console.log(`[REJOIN] ${player.nickname} voltou para ${roomId}`);
                } else {
                    socket.emit('rejoin_failed');
                }
            });

            // --- 3. CRIAR SALA ---
            socket.on('create_room', async ({ nickname, gameId, userId }) => {
                const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
                const newRoom = {
                    id: roomId,
                    players: [{
                        id: socket.id, socketId: socket.id, userId, nickname,
                        isHost: true, score: 0, isOnline: true
                    }],
                    gameType: gameId || 'TERMO',
                    phase: 'LOBBY',
                    state: {},
                    createdAt: Date.now()
                };

                await RoomManager.saveRoom(newRoom);
                socket.join(roomId);
                socket.data.roomId = roomId;
                socket.data.userId = userId;

                socket.emit('joined_room', {
                    roomId, players: newRoom.players, gameType: newRoom.gameType, phase: 'LOBBY'
                });
            });

            // --- 4. ENTRAR NA SALA ---
            socket.on('join_room', async ({ roomId, nickname, userId }) => {
                const room = await RoomManager.getRoom(roomId);
                if (room) {
                    const existing = room.players.find(p => p.userId === userId);
                    if (existing) {
                        existing.socketId = socket.id;
                        existing.isOnline = true;
                        existing.nickname = nickname;
                    } else {
                        room.players.push({
                            id: socket.id, socketId: socket.id, userId, nickname,
                            isHost: false, score: 0, isOnline: true
                        });
                    }
                    
                    await RoomManager.saveRoom(room);
                    socket.join(roomId);
                    socket.data.roomId = roomId;
                    socket.data.userId = userId;

                    let gd = room.state || {};
                    if (room.phase !== 'LOBBY') {
                        const mod = GAME_MODULES[room.gameType];
                        if (mod && mod.getPublicData) {
                            try {
                                gd = mod.getPublicData(room.state, userId);
                            } catch (e) {
                                console.error("[JOIN] Erro ao formatar dados:", e.message);
                            }
                        }
                    }

                    socket.emit('joined_room', {
                        roomId, players: room.players, gameType: room.gameType,
                        phase: room.phase, gameData: gd || {}
                    });
                    socket.to(roomId).emit('update_players', room.players);
                } else {
                    socket.emit('error_msg', 'Sala não encontrada!');
                }
            });

            // --- 5. INICIAR JOGO ---
            // --- 5. INICIAR JOGO ---
            socket.on('start_game', async () => {
                const roomId = socket.data.roomId;
                if (!roomId) return;
                const room = await RoomManager.getRoom(roomId);
                if (!room) return;

                const mod = GAME_MODULES[room.gameType];
                if (mod && mod.initGame) {
                    try {
                        const init = mod.initGame(room, io);
                        room.phase = init.phase || 'PLAYING';
                        
                        // REMOVIDO: if (init.gameData) room.state = init.gameData; 
                        
                        await RoomManager.saveRoom(room);

                        const sockets = await io.in(roomId).fetchSockets();
                        for (const s of sockets) {
                            let pData = room.state;
                            
                            // --- CORREÇÃO CRÍTICA AQUI ---
                            // Sem isso, o server.js não sabe quem é o socket e manda myHand: []
                            const player = room.players.find(p => p.socketId === s.id);
                            const targetUserId = player ? player.userId : s.data.userId;
                            // -----------------------------

                            if (mod.getPublicData) pData = mod.getPublicData(room.state, targetUserId);
                            
                            s.emit('joined_room', {
                                roomId, players: room.players, gameType: room.gameType,
                                phase: room.phase, gameData: pData || {}
                            });
                        }
                    } catch (e) {
                        console.error("Erro start_game:", e);
                    }
                }
            });

            // --- 6. SAIR / DISCONNECT (CORREÇÃO DE LOOP) ---
            const handleDisconnect = async (reason) => {
                const userId = socket.data.userId;
                const roomId = socket.data.roomId;

                // 1. Remove da sessão global
                if (userId && userSessions[userId] === socket.id) {
                    delete userSessions[userId];
                }

                if (roomId) {
                    // 2. FORÇA A SAÍDA DO CANAL SOCKET (CRÍTICO PARA EVITAR LOOP)
                    socket.leave(roomId);
                    
                    const room = await RoomManager.getRoom(roomId);
                    if (room) {
                        const player = room.players.find(p => p.userId === userId);
                        if (player) {
                            player.isOnline = false;
                            
                            // Passar a coroa se o host sair
                            if (player.isHost) {
                                const nextHost = room.players.find(p => p.isOnline && p.userId !== player.userId);
                                if (nextHost) {
                                    player.isHost = false;
                                    nextHost.isHost = true;
                                }
                            }

                            await RoomManager.saveRoom(room);
                            io.to(roomId).emit('update_players', room.players);
                            
                            // Se for MegaQuiz, checa se precisa finalizar rodada
                            if (room.gameType === 'MEGAQUIZ') {
                                const mod = GAME_MODULES['MEGAQUIZ'];
                                if (mod && mod.checkAnswers) mod.checkAnswers(io, room);
                            }
                        }
                    }
                }
            };

            socket.on('leave_room', () => handleDisconnect('user_left'));
            socket.on('disconnect', () => handleDisconnect('connection_lost'));
        });

        // Rota Catch-All
        app.get(/.*/, (req, res) => {
            res.sendFile(path.join(buildPath, 'index.html'));
        });

        const PORT = process.env.PORT || 3001;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🔥 Servidor rodando na porta ${PORT}`);
        });

    } catch (error) {
        console.error("Falha fatal:", error);
    }
})();