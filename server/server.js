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
    'WHOAMI': require('./games/game_whoami'),
    'ENIGMA': require('./games/game_enigma')
};

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,   
  pingInterval: 25000   
});

// --- ESTADO GLOBAL ---
const rooms = new Map();
const roomDestructionTimers = new Map();
const ROOM_TIMEOUT_MS = 5 * 60 * 1000; 

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

       room.players[existingIndex].id = newSocketId;
       room.players[existingIndex].connected = true; 
       socket.join(roomId);

       if (room.host === oldSocketId) { 
           room.host = newSocketId; 
           room.players[existingIndex].isHost = true; 
       }

       let gameDataUpdated = false;
       // Tenta usar lógica de rejoin específica se existir no módulo
       const module = gameModules[room.gameType];
       if (room.gameData && module) {
           if (room.gameType === 'DIXIT' && module.handleDixitRejoin) gameDataUpdated = module.handleDixitRejoin(room, oldSocketId, newSocketId);
           else if (room.gameType === 'WHOAMI' && module.handleWhoAmIRejoin) gameDataUpdated = module.handleWhoAmIRejoin(room, oldSocketId, newSocketId);
       }
       
       // --- CORREÇÃO CRÍTICA AQUI ---
       // Sanitiza o gameData para remover Timers e Decks antes de enviar
       const safeGameData = { ...room.gameData };
       delete safeGameData.timer; // Remove o setInterval (Causa do Crash)
       delete safeGameData.deck;  // Remove respostas para não pesar o envio
       delete safeGameData.questions;

       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         gameType: room.gameType, 
         gameData: safeGameData, // Envia versão limpa
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       
       io.to(roomId).emit('update_players', room.players);
       
       // Se o jogo exigir atualização de dados públicos após rejoin
       if(gameDataUpdated) {
           io.to(roomId).emit('update_game_data', { gameData: safeGameData, phase: room.phase });
       }
       
       console.log(`[REJOIN] ${nickname} voltou para a sala ${roomId}`);
    } else {
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- ROTEADORES DE JOGO ---
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId); 
    if (!room || room.host !== socket.id) return;
    
    const module = gameModules[room.gameType];
    if (module) {
        console.log(`[START] Iniciando ${room.gameType} na sala ${roomId}`);
        
        if (room.gameType === 'ITO') module.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
        else if (room.gameType === 'CINEMOJI') module.startCinemoji(io, room, roomId);
        else if (room.gameType === 'DIXIT') module.startDixit(io, room, roomId);
        else if (room.gameType === 'MEGAQUIZ') module.startMegaQuiz(io, room, roomId);
        else if (room.gameType === 'SPY') module.startSpy(io, room, roomId);
        else if (room.gameType === 'WHOAMI') module.startWhoAmI(io, room, roomId);
        else if (room.gameType === 'ENIGMA') module.startEnigma(io, room, roomId);
    } else {
        console.error(`[ERRO] Módulo não encontrado para: ${room.gameType}`);
    }
  });

  // --- VOLTAR AO LOBBY ---
  socket.on('return_to_lobby', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.host === socket.id) {
          // Limpa timers ativos do jogo anterior para evitar vazamento de memória
          if (room.gameData && room.gameData.timer) {
              clearInterval(room.gameData.timer);
          }

          console.log(`[RESET] Sala ${roomId} voltando para o Lobby.`);
          room.phase = 'LOBBY';
          room.gameData = {}; 
          io.to(roomId).emit('returned_to_lobby', { phase: 'LOBBY', players: room.players });
      }
  });

  // --- REGISTRO AUTOMÁTICO DOS HANDLERS ---
  Object.values(gameModules).forEach(mod => {
      Object.values(mod).forEach(fn => {
          if (typeof fn === 'function' && fn.name && fn.name.startsWith('register')) {
              fn(io, socket, rooms);
          }
      });
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

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const playerIndex = room.players.findIndex(p => p.id === socket.id);
         
         if (playerIndex !== -1) {
             const player = room.players[playerIndex];
             player.connected = false; 
             
             room.players = room.players.filter(p => p.id !== socket.id);
             io.to(roomId).emit('update_players', room.players);

             const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
             const activeCount = socketsInRoom ? socketsInRoom.size : 0;

             if (activeCount === 0) {
                 scheduleRoomDestruction(roomId);
             } else {
                 if (room.host === socket.id && room.players.length > 0) {
                     const newHostId = room.players[0].id;
                     room.host = newHostId;
                     room.players[0].isHost = true;
                     io.to(roomId).emit('update_players', room.players);
                     io.to(newHostId).emit('msg_success', 'Você agora é o Host da sala!');
                 }
             }
         }
     });
  });
});

// --- FUNÇÕES AUXILIARES ---

function cancelRoomDestruction(roomId) {
    if (roomDestructionTimers.has(roomId)) {
        clearTimeout(roomDestructionTimers.get(roomId));
        roomDestructionTimers.delete(roomId);
    }
}

function scheduleRoomDestruction(roomId) {
    if (roomDestructionTimers.has(roomId)) return;
    const timer = setTimeout(() => {
        if (rooms.has(roomId)) {
            // Limpeza final de timers
            const room = rooms.get(roomId);
            if (room && room.gameData && room.gameData.timer) {
                clearInterval(room.gameData.timer);
            }
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
  
  // Sanitização Inicial (Segurança extra)
  const safeGameData = { ...room.gameData };
  delete safeGameData.timer;
  delete safeGameData.deck;

  socket.emit('joined_room', { 
      roomId, 
      isHost, 
      players: room.players, 
      gameType: room.gameType, 
      phase: room.phase, 
      gameData: safeGameData 
  });
  
  io.to(roomId).emit('update_players', room.players);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`SERVIDOR RODANDO NA PORTA ${PORT}`));