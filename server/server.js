const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- CARREGAMENTO SEGURO DOS JOGOS ---
const safeRequire = (path) => {
    try { return require(path); } 
    catch (e) { console.error(`[ERRO LOAD] ${path}:`, e.message); return null; }
};

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

// --- ESTADO GLOBAL (RAM) ---
const rooms = new Map();
const activeUsers = new Map(); // socketId -> { userId, nickname }

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] ${socket.id}`);

  // 1. IDENTIFICAÇÃO (Vem do Front após login no Supabase)
  socket.on('identify', ({ userId, nickname }) => {
      activeUsers.set(socket.id, { userId, nickname });
      console.log(`[IDENTIFICADO] ${nickname} (${userId})`);
  });

  // 2. CRIAR SALA
  socket.on('create_room', ({ userId, nickname, gameType }) => {
      if (!userId) return;
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      console.log(`[CRIAR] Sala ${roomId} (${gameType}) - Host: ${nickname}`);
      
      const newRoom = {
          id: roomId, gameType, hostId: userId, phase: 'LOBBY', 
          players: [], gameData: {} 
      };
      rooms.set(roomId, newRoom);
      
      socket.emit('room_created', roomId);
      joinRoomInternal(io, socket, newRoom, { id: userId, name: nickname });
  });

  // 3. ENTRAR NA SALA
  socket.on('join_room', ({ roomId, userId, nickname }) => {
      const room = rooms.get(roomId?.toUpperCase());
      if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }
      joinRoomInternal(io, socket, room, { id: userId, name: nickname });
  });

  // 4. RECONEXÃO (F5)
  socket.on('rejoin_room', ({ roomId, userId }) => {
      const room = rooms.get(roomId);
      // Se o usuário já enviou 'identify' antes, usamos o cache. Se não, esperamos.
      // O joinRoomInternal atualiza o socketId se o userId bater.
      if (room) {
          // Precisamos do nickname. Vamos tentar achar na sala ou no cache.
          const existingPlayer = room.players.find(p => p.userId === userId);
          const cachedUser = activeUsers.get(socket.id);
          const name = existingPlayer?.nickname || cachedUser?.nickname || "Jogador";
          
          joinRoomInternal(io, socket, room, { id: userId, name });
      }
  });

  // 5. START GAME
  socket.on('start_game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      // Validação de Host
      const player = room.players.find(p => p.socketId === socket.id);
      if (player && player.userId === room.hostId) {
          const module = gameModules[room.gameType];
          if (module) {
              // Tenta achar a função de start correta
              const startFn = module[`start${toPascalCase(room.gameType)}`] || module.startGame || module.startChaCafe;
              if (typeof startFn === 'function') startFn(io, room, roomId);
          }
      }
  });

  // 6. EVENTOS DE JOGO GENÉRICOS
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
  
  Object.values(gameModules).forEach(mod => {
      if (mod) Object.values(mod).forEach(fn => {
          if (typeof fn === 'function' && fn.name?.startsWith('register')) fn(io, socket, rooms);
      });
  });

  socket.on('disconnect', () => {
      activeUsers.delete(socket.id);
      rooms.forEach((room, roomId) => {
          const player = room.players.find(p => p.socketId === socket.id);
          if (player) {
              player.connected = false;
              io.to(roomId).emit('update_players', room.players);
              // Timeout para remover (60s)
              setTimeout(() => {
                  const r = rooms.get(roomId);
                  if(r) {
                      const pIdx = r.players.findIndex(pl => pl.userId === player.userId);
                      // Remove apenas se ainda estiver desconectado
                      if(pIdx !== -1 && !r.players[pIdx].connected) {
                          r.players.splice(pIdx, 1);
                          if(r.players.length === 0) rooms.delete(roomId);
                          else {
                              // Passa host se necessário
                              if(r.hostId === player.userId) {
                                  r.hostId = r.players[0].userId;
                                  r.players[0].isHost = true;
                              }
                              io.to(roomId).emit('update_players', r.players);
                          }
                      }
                  }
              }, 60000);
          }
      });
  });
});

function joinRoomInternal(io, socket, room, user) {
    let player = room.players.find(p => p.userId === user.id);
    
    if (player) {
        // Reconexão
        player.socketId = socket.id;
        player.connected = true;
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
    
    if(player.secretNumber) socket.emit('your_secret_number', player.secretNumber);
    if(player.character) socket.emit('your_character', player.character);
    
    io.to(room.id).emit('update_players', room.players);
}

function toPascalCase(s) { return s.toLowerCase().replace(/_(\w)/g, (m,c)=>c.toUpperCase()).replace(/^\w/,c=>c.toUpperCase()); }

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR V3 (SUPABASE) RODANDO NA PORTA ${PORT}`));