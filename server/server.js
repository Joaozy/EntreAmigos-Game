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
const playerDisconnectTimers = new Map(); // Timer para jogador desconectado (60s)
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; 

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
    if (!room) { socket.emit('error_msg', 'A sala expirou ou o servidor reiniciou.'); return; }
    
    cancelRoomDestruction(roomId);

    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       const newSocketId = socket.id;

       // CANCELA O TIMER DE KICK (O JOGADOR VOLTOU A TEMPO!)
       cancelPlayerDisconnectTimer(roomId, nickname);

       // 1. Atualiza ID na lista de players
       room.players[existingIndex].id = newSocketId;
       room.players[existingIndex].connected = true; 
       socket.join(roomId);

       // 2. Recupera Host
       if (room.host === oldSocketId) { 
           room.host = newSocketId; 
           room.players[existingIndex].isHost = true; 
       }

       // 3. --- MÁGICA DA CORREÇÃO (Chama o módulo para consertar o jogo) ---
       const module = gameModules[room.gameType];
       let gameDataUpdated = false;
       
       if (module && typeof module.handleRejoin === 'function') {
           // O módulo troca oldId por newId dentro do gameData e reenvia dados privados
           gameDataUpdated = module.handleRejoin(io, socket, room, oldSocketId, newSocketId);
       }
       
       // 4. Envia o estado atualizado
       const safeGameData = { ...room.gameData };
       delete safeGameData.timer; 
       delete safeGameData.deck; 
       delete safeGameData.questions;

       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         gameType: room.gameType, 
         gameData: safeGameData,
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       
       io.to(roomId).emit('update_players', room.players);
       
       if(gameDataUpdated) {
           io.to(roomId).emit('update_game_data', { gameData: safeGameData, phase: room.phase });
       }
       
       console.log(`[REJOIN] ${nickname} recuperou sessão na sala ${roomId}`);
    } else {
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- START GAME ---
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId); 
    if (!room || room.host !== socket.id) return;
    
    const module = gameModules[room.gameType];
    if (module) {
        try {
            console.log(`[START] Iniciando ${room.gameType} na sala ${roomId}`);
            
            if (room.gameType === 'ITO') module.startIto(io, room, roomId);
            else if (room.gameType === 'MEGAQUIZ') module.startMegaQuiz(io, room, roomId);
            else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
            else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
            else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
            else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
            else if (room.gameType === 'CINEMOJI') module.startCinemoji(io, room, roomId);
            else if (room.gameType === 'DIXIT') module.startDixit(io, room, roomId);
            else if (room.gameType === 'SPY') module.startSpy(io, room, roomId);
            else if (room.gameType === 'WHOAMI') module.startWhoAmI(io, room, roomId);
            else if (room.gameType === 'ENIGMA') module.startEnigma(io, room, roomId);

        } catch (error) {
            console.error(`❌ ERRO FATAL ao iniciar ${room.gameType}:`, error);
            socket.emit('error_msg', 'Erro interno ao iniciar o jogo. Tente novamente.');
        }
    }
  });

  // --- REINICIAR JOGO / VOLTAR AO LOBBY ---
  socket.on('request_restart', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.host === socket.id) {
          console.log(`[RESTART] Host reiniciou sala ${roomId} para Lobby`);
          
          if (room.gameData && room.gameData.timer) clearInterval(room.gameData.timer);
          room.phase = 'LOBBY';
          room.gameData = {}; 
          
          room.players.forEach(p => {
              p.score = 0;
              p.lives = null;
              p.cards = [];
              p.isReady = false;
              p.hasSubmitted = false;
              p.clue = '';
              p.secretNumber = null;
          });

          io.to(roomId).emit('returned_to_lobby', { phase: 'LOBBY', players: room.players });
      }
  });

  socket.on('return_to_lobby', ({ roomId }) => {
      const s = io.sockets.sockets.get(socket.id);
      if(s) s.emit('request_restart', { roomId });
  });

  Object.values(gameModules).forEach(mod => {
      Object.values(mod).forEach(fn => {
          if (typeof fn === 'function' && fn.name && fn.name.startsWith('register')) {
              fn(io, socket, rooms);
          }
      });
  });

  socket.on('send_message', (data) => io.to(data.roomId).emit('receive_message', data));
  socket.on('kick_player', ({roomId, targetId}) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    room.players = room.players.filter(p => p.id !== targetId);
    io.to(targetId).emit('kicked'); 
    io.to(roomId).emit('update_players', room.players);
  });

  // --- DISCONNECT HÍBRIDO ---
  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const player = room.players.find(p => p.id === socket.id);
         
         if (player) {
             // LOBBY: Sai na hora
             if (room.phase === 'LOBBY') {
                 handleImmediateExit(io, room, roomId, socket.id);
             } 
             // JOGO: Espera 60s
             else {
                 console.log(`[GAME] ${player.nickname} caiu. Esperando 60s...`);
                 player.connected = false; 
                 io.to(roomId).emit('update_players', room.players); 

                 startPlayerDisconnectTimer(io, roomId, player.nickname, socket.id);

                 if (room.players.every(p => !p.connected)) {
                     scheduleRoomDestruction(roomId);
                 }
             }
         }
     });
  });
});

// --- FUNÇÕES DE TIMER ---
function startPlayerDisconnectTimer(io, roomId, nickname, oldSocketId) {
    const key = `${roomId}-${nickname}`;
    if (playerDisconnectTimers.has(key)) return;

    const timer = setTimeout(() => {
        console.log(`[TIMEOUT] ${nickname} não voltou a tempo. Removendo.`);
        const room = rooms.get(roomId);
        if (room) {
            handleImmediateExit(io, room, roomId, oldSocketId);
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) hostSocket.emit('error_msg', `${nickname} desconectou por inatividade.`);
            
            // Força volta ao lobby se sobrar menos de 2
            if (room.players.length < 2) {
                 io.to(roomId).emit('request_restart', { roomId });
            }
        }
        playerDisconnectTimers.delete(key);
    }, 60000); 

    playerDisconnectTimers.set(key, timer);
}

function cancelPlayerDisconnectTimer(roomId, nickname) {
    const key = `${roomId}-${nickname}`;
    if (playerDisconnectTimers.has(key)) {
        clearTimeout(playerDisconnectTimers.get(key));
        playerDisconnectTimers.delete(key);
    }
}

function handleImmediateExit(io, room, roomId, socketId) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx === -1) return;

    room.players.splice(idx, 1);

    if (room.players.length === 0) {
        rooms.delete(roomId);
    } else {
        if (room.host === socketId) {
            room.host = room.players[0].id;
            room.players[0].isHost = true;
        }
        io.to(roomId).emit('update_players', room.players);
    }
}

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
            const room = rooms.get(roomId);
            if (room && room.gameData && room.gameData.timer) clearInterval(room.gameData.timer);
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
  const isDuplicate = room.players.some(p => p.nickname === nickname && p.connected); 
  if (isDuplicate) { socket.emit('error_msg', 'Nome em uso.'); return; }

  const newPlayer = { id: socket.id, nickname, isHost, connected: true, secretNumber: null, clue: '', hasSubmitted: false, score: 0 };
  room.players.push(newPlayer); 
  socket.join(roomId);
  
  const safeGameData = { ...room.gameData };
  delete safeGameData.timer;
  delete safeGameData.deck;

  socket.emit('joined_room', { roomId, isHost, players: room.players, gameType: room.gameType, phase: room.phase, gameData: safeGameData });
  io.to(roomId).emit('update_players', room.players);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`));