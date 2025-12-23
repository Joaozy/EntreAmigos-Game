const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- 1. IMPORTAÇÃO DE TODOS OS MÓDULOS DE JOGO ---
const gameModules = {
    'ITO': require('./games/game_ito'),
    'CHA_CAFE': require('./games/game_chacafe'),
    'CODENAMES': require('./games/game_codenames'),
    'STOP': require('./games/game_stop'),
    'TERMO': require('./games/game_termo'),
    'CINEMOJI': require('./games/game_cinemoji'),
    'DIXIT': require('./games/game_dixit'),
    'MEGAQUIZ': require('./games/game_megaquiz'),
    'SPY': require('./games/game_spy'),
    'WHOAMI': require('./games/game_whoami')
};

const app = express();
app.use(cors());

const server = http.createServer(app);

// Configuração Robustecida do Socket.IO
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,   
  pingInterval: 25000   
});

// --- ESTADO GLOBAL ---
const rooms = new Map();
const roomDestructionTimers = new Map();
const ROOM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de tolerância

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Nova: ${socket.id}`);

  // --- GESTÃO DE SALAS ---
  
  socket.on('create_room', ({ nickname, gameType }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    console.log(`[CRIAR] Sala ${roomId} (${gameType}) por ${nickname}`);
    
    rooms.set(roomId, {
      id: roomId, 
      gameType, 
      host: socket.id, 
      phase: 'LOBBY', 
      players: [], 
      gameData: {} 
    });
    
    socket.emit('room_created', roomId);
    joinRoomInternal(socket, roomId, nickname, true);
  });

  socket.on('join_room', ({ roomId, nickname }) => {
      joinRoomInternal(socket, roomId?.toUpperCase(), nickname, false);
  });

  // --- RECONEXÃO BLINDADA (REJOIN) ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    
    if (!room) { 
        socket.emit('error_msg', 'A sala expirou ou o servidor reiniciou.'); 
        return; 
    }
    
    cancelRoomDestruction(roomId);

    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       const newSocketId = socket.id;

       // Atualizar Socket ID e Status
       room.players[existingIndex].id = newSocketId;
       room.players[existingIndex].connected = true; 
       socket.join(roomId);

       if (room.host === oldSocketId) { 
           room.host = newSocketId; 
           room.players[existingIndex].isHost = true; 
       }

       // Lógica de Rejoin Específica do Jogo
       let gameDataUpdated = false;
       if (room.gameData && gameModules[room.gameType]) {
           const module = gameModules[room.gameType];
           if (module.handleRejoin) {
               gameDataUpdated = module.handleRejoin(room, oldSocketId, newSocketId);
           }
       }
       
       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         gameType: room.gameType, 
         gameData: room.gameData, 
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       
       io.to(roomId).emit('update_players', room.players);
       
       if(gameDataUpdated) {
           io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
       }
       
       console.log(`[REJOIN] ${nickname} voltou para a sala ${roomId}`);
    } else {
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- 2. ROTEADOR DE INÍCIO (ATUALIZADO PARA TODOS OS JOGOS) ---
  socket.on('start_game', ({ roomId }) => {
    console.log(`[START] Recebido pedido de início para sala ${roomId} do socket ${socket.id}`);
    
    const room = rooms.get(roomId); 
    
    if (!room) { console.error(`[START ERRO] Sala ${roomId} não encontrada.`); return; }
    if (room.host !== socket.id) { console.warn(`[START BLOQUEADO] Host inválido.`); return; }
    
    const module = gameModules[room.gameType];
    if (!module) { console.error(`[START ERRO] Módulo '${room.gameType}' não carregado.`); return; }

    console.log(`[START] Iniciando lógica para ${room.gameType}...`);

    try {
        // Rotas explícitas para evitar erros dinâmicos
        if (room.gameType === 'ITO') module.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
        else if (room.gameType === 'CINEMOJI') module.startCinemoji(io, room, roomId);
        // Novos Jogos
        else if (room.gameType === 'DIXIT') module.startDixit(io, room, roomId);
        else if (room.gameType === 'MEGAQUIZ') module.startMegaquiz(io, room, roomId);
        else if (room.gameType === 'SPY') module.startSpy(io, room, roomId);
        else if (room.gameType === 'WHOAMI') module.startWhoami(io, room, roomId);
        
        else {
            console.error(`[START ERRO] Tipo de jogo '${room.gameType}' não tem rota definida.`);
        }
    } catch (error) {
        console.error(`[START CRASH] Erro fatal ao iniciar o jogo:`, error);
    }
  });

  // --- 3. ROTEADOR DE REINÍCIO ---
  socket.on('restart_game', ({ roomId }) => {
      const room = rooms.get(roomId); 
      if(room && room.host === socket.id) {
        const module = gameModules[room.gameType];
        if(!module) return;

        if (room.gameType === 'ITO') module.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
        else if (room.gameType === 'CINEMOJI') module.startCinemoji(io, room, roomId);
        // Novos Jogos
        else if (room.gameType === 'DIXIT') module.startDixit(io, room, roomId);
        else if (room.gameType === 'MEGAQUIZ') module.startMegaquiz(io, room, roomId);
        else if (room.gameType === 'SPY') module.startSpy(io, room, roomId);
        else if (room.gameType === 'WHOAMI') module.startWhoami(io, room, roomId);
      }
  });

  // --- REGISTRO AUTOMÁTICO DOS HANDLERS ---
  Object.values(gameModules).forEach(mod => {
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

  // --- DISCONNECT INTELIGENTE ---
  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const player = room.players.find(p => p.id === socket.id);
         
         if (player) {
             player.connected = false; 
             
             const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
             const activeCount = socketsInRoom ? socketsInRoom.size : 0;

             if (activeCount === 0) {
                 console.log(`[SALA VAZIA] Sala ${roomId} agendada para exclusão em ${ROOM_TIMEOUT_MS/1000}s`);
                 scheduleRoomDestruction(roomId);
             } else {
                 if (room.phase === 'LOBBY') {
                     room.players = room.players.filter(p => p.id !== socket.id);
                     io.to(roomId).emit('update_players', room.players);
                     
                     if(room.players.length === 0) scheduleRoomDestruction(roomId);
                     else {
                         if(room.host === socket.id && room.players.length > 0) {
                             room.host = room.players[0].id;
                             room.players[0].isHost = true;
                             io.to(roomId).emit('update_players', room.players);
                         }
                     }
                 }
             }
         }
     });
  });
});

// --- FUNÇÕES AUXILIARES ---

function cancelRoomDestruction(roomId) {
    if (roomDestructionTimers.has(roomId)) {
        console.log(`[RESGATADA] Sala ${roomId} teve a exclusão cancelada.`);
        clearTimeout(roomDestructionTimers.get(roomId));
        roomDestructionTimers.delete(roomId);
    }
}

function scheduleRoomDestruction(roomId) {
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
  
  cancelRoomDestruction(roomId.toUpperCase()); 

  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id)); 
  if (isDuplicate) return; 

  const newPlayer = { 
      id: socket.id, 
      nickname, 
      isHost, 
      connected: true, 
      secretNumber: null, 
      clue: '', 
      hasSubmitted: false 
  };
  
  room.players.push(newPlayer); 
  socket.join(roomId);
  
  socket.emit('joined_room', { 
      roomId, 
      isHost, 
      players: room.players, 
      gameType: room.gameType, 
      phase: room.phase, 
      gameData: room.gameData 
  });
  
  io.to(roomId).emit('update_players', room.players);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`SERVIDOR FULL (10 JOGOS) ONLINE NA PORTA ${PORT}`));