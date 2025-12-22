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
    'TERMO': require('./games/game_termo'),
    'SPY': require('./games/game_spy')
};

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000, 
  pingInterval: 25000 
});

const rooms = new Map();
// Mapa para guardar os timers de destruição de sala (Grace Period)
const roomDestructionTimers = new Map();

// Tempo que a sala espera por reconexão antes de ser apagada (ex: 5 minutos)
const ROOM_TIMEOUT_MS = 5 * 60 * 1000;

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

  // --- RECONEXÃO BLINDADA ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    
    // Se a sala não existe, avisar o cliente para limpar o estado
    if (!room) { 
        socket.emit('error_msg', 'Sala expirou ou servidor reiniciou.'); 
        return; 
    }
    
    // Se a sala estava marcada para ser destruída (estava vazia), CANCELA a destruição
    cancelRoomDestruction(roomId);

    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       const newSocketId = socket.id;

       // 1. Atualizar Socket ID
       room.players[existingIndex].id = newSocketId;
       room.players[existingIndex].connected = true; // Marca como online
       socket.join(roomId);

       // Recupera Host se necessário
       if (room.host === oldSocketId) { 
           room.host = newSocketId; 
           room.players[existingIndex].isHost = true; 
       }

       // 2. Atualizar GameData (Lógica Específica dos Jogos)
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
       
       console.log(`[REJOIN] ${nickname} voltou para a sala ${roomId}`);
    } else {
       // Se não achou pelo nick, tenta entrar como novo
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- ROTEADORES DE JOGO ---
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    const module = gameModules[room.gameType];
    // Tenta encontrar a função startXxx dinamicamente ou manualmente
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

  // Registra handlers de cada jogo
  Object.values(gameModules).forEach(mod => {
      const registerFn = Object.values(mod).find(fn => fn.name && fn.name.startsWith('register'));
      if(registerFn) registerFn(io, socket, rooms);
  });

  socket.on('send_message', (data) => io.to(data.roomId).emit('receive_message', data));
  
  socket.on('kick_player', ({roomId, targetId}) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    room.players = room.players.filter(p => p.id !== targetId);
    io.to(targetId).emit('kicked'); 
    const s = io.sockets.sockets.get(targetId); if(s) s.leave(roomId);
    io.to(roomId).emit('update_players', room.players);
  });

  // --- DISCONNECT INTELIGENTE ---
  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const player = room.players.find(p => p.id === socket.id);
         
         if (player) {
             player.connected = false; // Marca como offline, mas NÃO remove ainda
             
             // Verifica quantos jogadores ainda estão conectados (socket.connected não funciona bem aqui, melhor usar flag)
             // Vamos confiar na lista de sockets da sala do Socket.IO
             const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
             const activeCount = socketsInRoom ? socketsInRoom.size : 0;

             if (activeCount === 0) {
                 // Se NINGUÉM sobrou na sala, agenda destruição
                 console.log(`[SALA VAZIA] Sala ${roomId} agendada para exclusão em ${ROOM_TIMEOUT_MS/1000}s`);
                 scheduleRoomDestruction(roomId);
             } else {
                 // Se ainda tem gente, só avisa que o jogador caiu (opcional: mudar cor no front)
                 // Se estiver no LOBBY e cair, removemos? 
                 // Melhor manter consistência: no lobby removemos rápido, no jogo mantemos.
                 if (room.phase === 'LOBBY') {
                     // No lobby, removemos imediatamente para não "trancar" slots
                     room.players = room.players.filter(p => p.id !== socket.id);
                     io.to(roomId).emit('update_players', room.players);
                     if(room.players.length === 0) scheduleRoomDestruction(roomId);
                 }
             }
         }
     });
  });
});

// Funções Auxiliares de Gerenciamento de Sala

function cancelRoomDestruction(roomId) {
    if (roomDestructionTimers.has(roomId)) {
        console.log(`[RESGATADA] Sala ${roomId} teve a exclusão cancelada.`);
        clearTimeout(roomDestructionTimers.get(roomId));
        roomDestructionTimers.delete(roomId);
    }
}

function scheduleRoomDestruction(roomId) {
    // Se já tiver timer, não cria outro
    if (roomDestructionTimers.has(roomId)) return;

    const timer = setTimeout(() => {
        if (rooms.has(roomId)) {
            console.log(`[DESTRUINDO] Sala ${roomId} expirou por inatividade.`);
            rooms.delete(roomId);
            roomDestructionTimers.delete(roomId);
        }
    }, ROOM_TIMEOUT_MS);
    
    roomDestructionTimers.set(roomId, timer);
}

function joinRoomInternal(socket, roomId, nickname, isHost) {
  if (!roomId) return; 
  const room = rooms.get(roomId.toUpperCase()); 
  if (!room) { socket.emit('error_msg', 'Sala não encontrada'); return; }
  
  cancelRoomDestruction(roomId.toUpperCase()); // Garante que a sala não suma ao entrar

  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id)); 
  if (isDuplicate) return; // Talvez emitir um rejoin aqui?

  const newPlayer = { id: socket.id, nickname, isHost, connected: true, secretNumber: null, clue: '', hasSubmitted: false };
  room.players.push(newPlayer); 
  socket.join(roomId);
  
  socket.emit('joined_room', { roomId, isHost, players: room.players, gameType: room.gameType, phase: room.phase, gameData: room.gameData });
  io.to(roomId).emit('update_players', room.players);
}

// Configuração de Porta para Deploy
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`SERVIDOR ONLINE NA PORTA ${PORT}`));