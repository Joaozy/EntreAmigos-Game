const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Importação dos Módulos de Jogo
const { startIto, registerItoHandlers } = require('./games/game_ito');
const { startChaCafe, registerChaCafeHandlers } = require('./games/game_chacafe');
const { startCodenames, registerCodenamesHandlers } = require('./games/game_codenames');
const { startStop, registerStopHandlers } = require('./games/game_stop');

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

  // --- RECONEXÃO BLINDADA (Mantida aqui pois afeta todos) ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error_msg', 'A sala expirou.'); return; }
    
    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       room.players[existingIndex].id = socket.id;
       socket.join(roomId);
       if (room.host === oldSocketId) { room.host = socket.id; room.players[existingIndex].isHost = true; }

       // Atualização de IDs nos dados dos jogos
       let gameDataUpdated = false;
       if (room.gameData) {
           // Lógica de recuperação específica de cada jogo (simplificada aqui para brevidade, 
           // idealmente poderia ser uma função exportada de cada módulo também, mas ok manter aqui)
           if (room.gameType === 'CHA_CAFE') {
               if (room.gameData.narratorId === oldSocketId) { room.gameData.narratorId = socket.id; gameDataUpdated = true; }
               if (room.gameData.lastGuesserId === oldSocketId) { room.gameData.lastGuesserId = socket.id; gameDataUpdated = true; }
               if (room.gameData.guessersIds) {
                   const gIdx = room.gameData.guessersIds.indexOf(oldSocketId);
                   if (gIdx !== -1) { room.gameData.guessersIds[gIdx] = socket.id; gameDataUpdated = true; }
               }
           }
           if (room.gameType === 'CODENAMES' && room.gameData.teams) {
               ['red', 'blue'].forEach(color => {
                   if (room.gameData.teams[color].spymaster === oldSocketId) { room.gameData.teams[color].spymaster = socket.id; gameDataUpdated = true; }
                   const mIdx = room.gameData.teams[color].members.indexOf(oldSocketId);
                   if (mIdx !== -1) { room.gameData.teams[color].members[mIdx] = socket.id; gameDataUpdated = true; }
               });
           }
           if (room.gameType === 'STOP') {
               if (room.gameData.stopCaller === oldSocketId) { room.gameData.stopCaller = socket.id; gameDataUpdated = true; }
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

  // --- ROTEADOR DE INÍCIO ---
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room || room.host !== socket.id) return;
    if (room.gameType === 'ITO') startIto(io, room, roomId);
    else if (room.gameType === 'CHA_CAFE') startChaCafe(io, room, roomId);
    else if (room.gameType === 'CODENAMES') startCodenames(io, room, roomId);
    else if (room.gameType === 'STOP') startStop(io, room, roomId);
  });

  socket.on('restart_game', ({ roomId }) => {
      const room = rooms.get(roomId); if(room && room.host === socket.id) {
          if(room.gameType === 'ITO') startIto(io, room, roomId);
          if(room.gameType === 'CHA_CAFE') startChaCafe(io, room, roomId);
          if(room.gameType === 'CODENAMES') startCodenames(io, room, roomId);
          if(room.gameType === 'STOP') startStop(io, room, roomId);
      }
  });

  // --- REGISTRO DOS HANDLERS (Ouvintes de Eventos) ---
  registerItoHandlers(io, socket, rooms);
  registerChaCafeHandlers(io, socket, rooms);
  registerCodenamesHandlers(io, socket, rooms);
  registerStopHandlers(io, socket, rooms);

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

server.listen(3001, '0.0.0.0', () => console.log('SERVIDOR MODULAR ONLINE 3001'));