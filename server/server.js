const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');

const safeRequire = (path) => {
    try { return require(path); } 
    catch (e) { console.error(`[ERRO LOAD] ${path}:`, e.message); return null; }
};

// Módulos de Jogo
const gameModules = {
    'ITO': safeRequire('./games/game_ito'),
    'CHA_CAFE': safeRequire('./games/game_chacafe'),
    'CODENAMES': safeRequire('./games/game_codenames'),
    'STOP': safeRequire('./games/game_stop'),
    'TERMO': safeRequire('./games/game_termo'),
    'CINEMOJI': safeRequire('./games/game_cinemoji'),
    'DIXIT': safeRequire('./games/game_dixit'),
    'MEGAQUIZ': safeRequire('./games/game_megaquiz'),
    'SPY': safeRequire('./games/game_spy'),
    'WHOAMI': safeRequire('./games/game_whoami'),
    'ENIGMA': safeRequire('./games/game_enigma')
};

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingTimeout: 60000 });

// Mapas em Memória
const rooms = new Map();
const playerDisconnectTimers = new Map(); 

io.on('connection', (socket) => {
  console.log(`[SOCKET] Nova conexão: ${socket.id}`);

  // --- 1. SISTEMA DE AUTENTICAÇÃO ---
  
  socket.on('auth_register', ({ name, email, password }) => {
      console.log(`[AUTH] Tentativa de cadastro: ${email}`);
      const result = db.registerUser(name, email, password);
      if (result.success) {
          socket.emit('auth_success', result.user);
      } else {
          socket.emit('auth_error', result.error);
      }
  });

  socket.on('auth_login', ({ email, password }) => {
      console.log(`[AUTH] Tentativa de login: ${email}`);
      const result = db.loginUser(email, password);
      if (result.success) {
          socket.emit('auth_success', result.user);
      } else {
          socket.emit('auth_error', result.error);
      }
  });

  // Login Automático (Reconectar via ID salvo no localStorage)
  socket.on('auth_reconnect', ({ userId }) => {
      const user = db.getUser(userId);
      if (user) {
          socket.emit('auth_success', user);
          console.log(`[AUTH] Reconexão automática: ${user.name}`);
      } else {
          socket.emit('auth_error', 'Sessão expirada. Faça login novamente.');
      }
  });

  // --- 2. SISTEMA DE SALAS ---

  socket.on('create_room', ({ userId, gameType }) => {
      const user = db.getUser(userId);
      if (!user) { socket.emit('error_msg', 'Usuário não autenticado.'); return; }

      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      console.log(`[SALA] Criada ${roomId} (${gameType}) por ${user.name}`);
      
      const newRoom = {
          id: roomId,
          gameType,
          hostId: user.id,
          phase: 'LOBBY',
          players: [],
          gameData: {} 
      };
      rooms.set(roomId, newRoom);
      
      socket.emit('room_created', roomId);
      joinRoomInternal(io, socket, newRoom, user);
  });

  socket.on('join_room', ({ roomId, userId }) => {
      const room = rooms.get(roomId?.toUpperCase());
      const user = db.getUser(userId);

      if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }
      if (!user) { socket.emit('error_msg', 'Usuário inválido.'); return; }

      joinRoomInternal(io, socket, room, user);
  });

  // --- 3. RECONEXÃO EM JOGO (F5) ---
  socket.on('rejoin_game', ({ roomId, userId }) => {
      const room = rooms.get(roomId);
      const user = db.getUser(userId);
      
      if (room && user) {
          joinRoomInternal(io, socket, room, user);
      }
  });

  // --- 4. GAMEPLAY CONTROLLERS ---
  
  socket.on('start_game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      // Validação de Host segura
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.userId !== room.hostId) return;

      const module = gameModules[room.gameType];
      if (module) {
          try {
              const startFn = module[`start${toPascalCase(room.gameType)}`] || module.startGame || module.startChaCafe;
              if (typeof startFn === 'function') startFn(io, room, roomId);
          } catch (e) { console.error(e); }
      }
  });

  // Reset e Lobby
  const handleReset = ({ roomId }) => {
      const room = rooms.get(roomId);
      if(room) {
          if(room.gameData?.timer) clearInterval(room.gameData.timer);
          room.phase = 'LOBBY'; room.gameData = {};
          room.players.forEach(p => { 
              p.score = 0; p.lives = null; p.cards = []; p.hasSubmitted = false; 
          });
          io.to(roomId).emit('returned_to_lobby', { phase: 'LOBBY', players: room.players });
      }
  };
  socket.on('request_restart', handleReset);
  socket.on('restart_game', handleReset);
  socket.on('return_to_lobby', handleReset);

  // Registro de eventos específicos dos jogos
  Object.values(gameModules).forEach(mod => {
      if (mod) Object.values(mod).forEach(fn => {
          if (typeof fn === 'function' && fn.name?.startsWith('register')) fn(io, socket, rooms);
      });
  });

  // Salvar Vitória
  socket.on('record_win', ({ roomId, winnerId }) => {
      const room = rooms.get(roomId);
      if(room) db.saveMatch(room.gameType, winnerId, room.players);
  });

  socket.on('kick_player', ({roomId, targetId}) => {
      const room = rooms.get(roomId);
      if(room) {
          const p = room.players.find(x => x.userId === targetId);
          if(p) { io.to(p.socketId).emit('kicked'); removePlayer(io, roomId, targetId); }
      }
  });

  socket.on('disconnect', () => {
      rooms.forEach((room, roomId) => {
          const player = room.players.find(p => p.socketId === socket.id);
          if (player) {
              player.connected = false;
              io.to(roomId).emit('update_players', room.players);
              const timeout = room.phase === 'LOBBY' ? 2000 : 60000;
              const timer = setTimeout(() => removePlayer(io, roomId, player.userId), timeout);
              playerDisconnectTimers.set(player.userId, timer);
          }
      });
  });
});

// --- HELPER FUNCTIONS ---

function joinRoomInternal(io, socket, room, user) {
    if (playerDisconnectTimers.has(user.id)) {
        clearTimeout(playerDisconnectTimers.get(user.id));
        playerDisconnectTimers.delete(user.id);
    }

    let player = room.players.find(p => p.userId === user.id);
    
    if (player) {
        // Reconexão
        player.socketId = socket.id;
        player.connected = true;
        player.nickname = user.name; // Atualiza nome do DB
    } else {
        // Novo na sala
        player = {
            userId: user.id,
            socketId: socket.id,
            nickname: user.name,
            connected: true,
            isHost: room.hostId === user.id,
            score: 0
        };
        room.players.push(player);
    }
    
    socket.join(room.id);

    const safeData = { ...room.gameData };
    delete safeData.timer; delete safeData.deck;

    socket.emit('joined_room', { 
        roomId: room.id, isHost: player.isHost, players: room.players, 
        gameType: room.gameType, phase: room.phase, gameData: safeData 
    });

    // Reenvio de dados privados
    if(player.secretNumber) socket.emit('your_secret_number', player.secretNumber);
    if(player.character) socket.emit('your_character', player.character);

    io.to(room.id).emit('update_players', room.players);
}

function removePlayer(io, roomId, userId) {
    const room = rooms.get(roomId); if (!room) return;
    const idx = room.players.findIndex(p => p.userId === userId);
    if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) rooms.delete(roomId);
        else {
            if (room.hostId === userId) { 
                room.hostId = room.players[0].userId; 
                room.players[0].isHost = true; 
            }
            io.to(roomId).emit('update_players', room.players);
        }
    }
    playerDisconnectTimers.delete(userId);
}

function toPascalCase(s) { return s.toLowerCase().replace(/_(\w)/g, (m,c)=>c.toUpperCase()).replace(/^\w/,c=>c.toUpperCase()); }

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR SEGURO RODANDO NA PORTA ${PORT}`));