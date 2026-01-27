const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- 1. IMPORTAÇÃO AUTOMATIZADA DOS JOGOS ---
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

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {}; 

io.on('connection', (socket) => {
    console.log(`[+] Cliente conectado: ${socket.id}`);

    // --- 2. REGISTRAR LISTENERS DE TODOS OS JOGOS ---
    Object.values(GAME_MODULES).forEach(gameModule => {
        if (typeof gameModule === 'function') {
            gameModule(io, socket, rooms);
        }
    });

    // --- 3. EVENTOS GERAIS DA SALA ---

    socket.on('identify', ({ userId, nickname }) => {
        socket.data.userId = userId;
        socket.data.nickname = nickname;
    });

    socket.on('rejoin_room', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            socket.join(roomId);
            socket.data.roomId = roomId;
            const player = room.players.find(p => p.userId === socket.data.userId);
            if (player) {
                player.socketId = socket.id;
                console.log(`[↻] Player ${player.nickname} reconectou na sala ${roomId}`);
            }

            // Pega dados públicos formatados se o jogo tiver helper
            let gameDataToSend = room.state;
            const gameModule = GAME_MODULES[room.gameType];
            if (gameModule && typeof gameModule.getPublicData === 'function') {
                gameDataToSend = gameModule.getPublicData(room.state);
            }

            socket.emit('joined_room', {
                roomId,
                players: room.players,
                gameType: room.gameType,
                phase: room.phase,
                gameData: gameDataToSend
            });
        }
    });

    socket.on('create_room', ({ nickname, gameId, userId }) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const selectedGame = gameId || 'TERMO'; 

        rooms[roomId] = {
            id: roomId,
            players: [],
            gameType: selectedGame,
            phase: 'LOBBY',
            state: {} 
        };

        const player = { 
            id: socket.id, socketId: socket.id, userId: userId || socket.id,
            nickname, isHost: true, score: 0 
        };
        
        rooms[roomId].players.push(player);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.userId = userId;

        socket.emit('joined_room', { 
            roomId, players: rooms[roomId].players, gameType: selectedGame, phase: 'LOBBY'
        });
        
        console.log(`[★] Sala ${roomId} criada: ${selectedGame}`);
    });

    socket.on('join_room', ({ roomId, nickname, userId }) => {
        const room = rooms[roomId?.toUpperCase()];
        if (room) {
            const existingIdx = room.players.findIndex(p => p.userId === userId);
            if (existingIdx !== -1) {
                room.players[existingIdx].socketId = socket.id;
                room.players[existingIdx].nickname = nickname;
            } else {
                room.players.push({ 
                    id: socket.id, socketId: socket.id, userId: userId || socket.id,
                    nickname, isHost: false, score: 0 
                });
            }
            
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.data.userId = userId;

            io.to(room.id).emit('joined_room', {
                roomId: room.id,
                players: room.players,
                gameType: room.gameType,
                phase: room.phase,
                gameData: room.state
            });
            console.log(`[->] ${nickname} entrou na sala ${room.id}`);
        } else {
            socket.emit('error_msg', 'Sala não encontrada!');
        }
    });

    socket.on('select_game', ({ gameId }) => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        if (GAME_MODULES[gameId]) {
            room.gameType = gameId;
            io.to(room.id).emit('joined_room', {
                roomId: room.id, players: room.players, gameType: gameId, phase: 'LOBBY'
            });
        }
    });

    // INICIAR JOGO (CORRIGIDO PARA PASSAR IO)
    socket.on('start_game', () => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        const gameModule = GAME_MODULES[room.gameType];
        console.log(`[▶] Iniciando ${room.gameType} na sala ${roomId}`);

        if (gameModule && typeof gameModule.initGame === 'function') {
            try {
                // AQUI ESTÁ O SEGREDO: PASSAMOS O IO
                const initData = gameModule.initGame(room, io); 
                room.phase = initData.phase || 'PLAYING';
                
                // Prioriza os dados retornados pelo initGame
                let dataToSend = initData.gameData || room.state;

                io.to(roomId).emit('joined_room', {
                    roomId: room.id,
                    players: room.players,
                    gameType: room.gameType,
                    phase: room.phase,
                    gameData: dataToSend
                });
            } catch (err) {
                console.error(`Erro init ${room.gameType}:`, err);
                socket.emit('error_msg', 'Erro ao iniciar jogo.');
            }
        } else {
            room.phase = 'PLAYING';
            room.state = { status: 'started' };
            io.to(roomId).emit('joined_room', {
                roomId: room.id,
                players: room.players,
                gameType: room.gameType,
                phase: room.phase,
                gameData: room.state
            });
        }
    });

    socket.on('send_message', (data) => {
        io.to(data.roomId).emit('receive_message', data);
    });

    socket.on('leave_room', () => {
        const roomId = socket.data.roomId;
        if(roomId && rooms[roomId]) {
            socket.leave(roomId);
            rooms[roomId].players = rooms[roomId].players.filter(p => p.socketId !== socket.id);
            io.to(roomId).emit('update_players', rooms[roomId].players);
            socket.data.roomId = null;
        }
    });

    socket.on('disconnect', () => {
        // Lógica de desconexão silenciosa para permitir reconnect
    });
});

const PORT = process.env.PORT || 3001;
// CORREÇÃO CRÍTICA: Escutar em 0.0.0.0 para aceitar conexões locais e de rede
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Servidor rodando na porta ${PORT}`);
});