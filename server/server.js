const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Importações dos Módulos
const gameModules = {
    'ITO': require('./games/game_ito'),
    'CHA_CAFE': require('./games/game_chacafe'),
    'CODENAMES': require('./games/game_codenames'),
    'STOP': require('./games/game_stop'),
    'TERMO': require('./games/game_termo')
};

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000, 
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Nova: ${socket.id}`);

  // --- GESTÃO DE SALAS ---
  socket.on('create_room', ({ nickname, gameType }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    console.log(`[CRIAR] Sala ${roomId} (${gameType}) por ${nickname}`);
    
    rooms.set(roomId, {
      id: roomId, gameType, host: socket.id, phase: 'LOBBY', players: [], gameData: {} 
    });
    
    socket.emit('room_created', roomId);
    joinRoomInternal(socket, roomId, nickname, true);
  });

  socket.on('join_room', ({ roomId, nickname }) => joinRoomInternal(socket, roomId?.toUpperCase(), nickname, false));

  // --- RECONEXÃO BLINDADA (REFATORADA) ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error_msg', 'A sala expirou.'); return; }
    
    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       const newSocketId = socket.id;

       // 1. Atualizar Socket na Lista de Jogadores
       room.players[existingIndex].id = newSocketId;
       socket.join(roomId);
       if (room.host === oldSocketId) { room.host = newSocketId; room.players[existingIndex].isHost = true; }

       // 2. Delegar atualização de GameData para o Módulo
       let gameDataUpdated = false;
       if (room.gameData && gameModules[room.gameType]) {
           const module = gameModules[room.gameType];
           if (module.handleRejoin) {
               gameDataUpdated = module.handleRejoin(room, oldSocketId, newSocketId);
           }
       }
       
       socket.emit('joined_room', { 
         roomId, isHost: room.players[existingIndex].isHost, players: room.players, 
         phase: room.phase, gameType: room.gameType, gameData: room.gameData, 
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       io.to(roomId).emit('update_players', room.players);
       if(gameDataUpdated) io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
    } else {
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- ROTEADOR DE INÍCIO DINÂMICO ---
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    const module = gameModules[room.gameType];
    const starter = module ? (module[`start${toPascalCase(room.gameType)}`] || module.startIto || module.startStop || module.startTermo || module.startChaCafe || module.startCodenames) : null;
    
    // Fallback manual se a convenção de nomes falhar, ou apenas chame explicitamente se preferir:
    if (room.gameType === 'ITO') gameModules.ITO.startIto(io, room, roomId);
    else if (room.gameType === 'CHA_CAFE') gameModules.CHA_CAFE.startChaCafe(io, room, roomId);
    else if (room.gameType === 'CODENAMES') gameModules.CODENAMES.startCodenames(io, room, roomId);
    else if (room.gameType === 'STOP') gameModules.STOP.startStop(io, room, roomId);
    else if (room.gameType === 'TERMO') gameModules.TERMO.startTermo(io, room, roomId);
  });

  socket.on('restart_game', ({ roomId }) => {
      const room = rooms.get(roomId); if(room && room.host === socket.id) {
        if (room.gameType === 'ITO') gameModules.ITO.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') gameModules.CHA_CAFE.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') gameModules.CODENAMES.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') gameModules.STOP.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') gameModules.TERMO.startTermo(io, room, roomId);
      }
  });

  // --- REGISTRO DOS HANDLERS ---
  Object.values(gameModules).forEach(mod => {
      // Procura função que comece com "register"
      const registerFn = Object.values(mod).find(fn => fn.name && fn.name.startsWith('register'));
      if(registerFn) registerFn(io, socket, rooms);
  });

  // --- UTILITÁRIOS GERAIS ---
  socket.on('send_message', (data) => io.to(data.roomId).emit('receive_message', data));
  socket.on('kick_player', ({roomId, targetId}) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    room.players = room.players.filter(p => p.id !== targetId);
    io.to(targetId).emit('kicked'); 
    const s = io.sockets.sockets.get(targetId); if(s) s.leave(roomId);
    io.to(roomId).emit('update_players', room.players);
  });

  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const idx = room.players.findIndex(p => p.id === socket.id);
         if(idx !== -1 && room.phase === 'LOBBY') {
             room.players.splice(idx, 1);
             if(room.players.length === 0) rooms.delete(roomId);
             else {
                 if(room.host === socket.id && room.players.length > 0) { room.host = room.players[0].id; room.players[0].isHost = true; }
                 io.to(roomId).emit('update_players', room.players);
             }
         }
     });
  });
});

function joinRoomInternal(socket, roomId, nickname, isHost) {
  if (!roomId) return; const room = rooms.get(roomId.toUpperCase()); if (!room) { socket.emit('error_msg', 'Sala não encontrada'); return; }
  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id)); if (isDuplicate) return;
  const newPlayer = { id: socket.id, nickname, isHost, secretNumber: null, clue: '', hasSubmitted: false };
  room.players.push(newPlayer); socket.join(roomId);
  socket.emit('joined_room', { roomId, isHost, players: room.players, gameType: room.gameType, phase: room.phase, gameData: room.gameData });
  io.to(roomId).emit('update_players', room.players);
}

// Auxiliar apenas se quiser automatizar o start_game no futuro
function toPascalCase(str) { return str.replace(/(\w)(\w*)/g, (g0,g1,g2) => g1.toUpperCase() + g2.toLowerCase()).replace(/_/g, ''); }

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SERVIDOR ONLINE NA PORTA ${PORT}`);
});