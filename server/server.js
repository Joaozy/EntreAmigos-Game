const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- IMPORTAÇÃO DOS MÓDULOS DE JOGO ---
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

// Configuração Robustecida do Socket.IO
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  // Aumenta a tolerância para conexões lentas (4G/Mobile)
  pingTimeout: 60000,   // Espera 60s antes de considerar desconectado
  pingInterval: 25000   // Envia ping a cada 25s para manter a conexão viva
});

// --- ESTADO GLOBAL ---
const rooms = new Map();
// Mapa para guardar os timers de destruição de sala (Grace Period)
const roomDestructionTimers = new Map();

// Tempo que a sala espera por reconexão antes de ser apagada (5 minutos)
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
    
    // Se a sala não existe, avisar o cliente para limpar o estado local
    if (!room) { 
        socket.emit('error_msg', 'A sala expirou ou o servidor reiniciou.'); 
        return; 
    }
    
    // Se a sala estava marcada para ser destruída (estava vazia), CANCELA a destruição
    cancelRoomDestruction(roomId);

    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       const newSocketId = socket.id;

       // 1. Atualizar Socket ID e Status
       room.players[existingIndex].id = newSocketId;
       room.players[existingIndex].connected = true; // Marca como online
       socket.join(roomId);

       // Recupera Host se necessário
       if (room.host === oldSocketId) { 
           room.host = newSocketId; 
           room.players[existingIndex].isHost = true; 
       }

       // 2. Atualizar GameData (Lógica Específica dos Jogos)
       // Isso garante que se era a vez do jogador, continue sendo a vez dele com o novo ID
       let gameDataUpdated = false;
       if (room.gameData && gameModules[room.gameType]) {
           const module = gameModules[room.gameType];
           // Verifica se o módulo tem a função de tratar rejoin
           if (module.handleRejoin) {
               gameDataUpdated = module.handleRejoin(room, oldSocketId, newSocketId);
           }
       }
       
       // Envia estado atual para quem reconectou
       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         gameType: room.gameType, 
         gameData: room.gameData, 
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       
       // Avisa a todos que o jogador voltou
       io.to(roomId).emit('update_players', room.players);
       
       if(gameDataUpdated) {
           io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
       }
       
       console.log(`[REJOIN] ${nickname} voltou para a sala ${roomId}`);
    } else {
       // Se não achou pelo nick (pode ter sido expulso ou erro), tenta entrar como novo
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- ROTEADOR DE INÍCIO (CORRIGIDO E EXPLÍCITO) ---
  socket.on('start_game', ({ roomId }) => {
    console.log(`[START] Recebido pedido de início para sala ${roomId} do socket ${socket.id}`);
    
    const room = rooms.get(roomId); 
    
    if (!room) {
        console.error(`[START ERRO] Sala ${roomId} não encontrada na memória.`);
        return;
    }

    // Verificação de segurança do Host
    if (room.host !== socket.id) {
        console.warn(`[START BLOQUEADO] Socket ${socket.id} tentou iniciar, mas o host é ${room.host}`);
        return; 
    }
    
    const module = gameModules[room.gameType];
    if (!module) {
        console.error(`[START ERRO] Módulo do jogo '${room.gameType}' não foi carregado corretamente.`);
        return;
    }

    console.log(`[START] Iniciando lógica para ${room.gameType}...`);

    try {
        // Chamada Explícita para garantir que a função existe e evitar erros dinâmicos
        if (room.gameType === 'ITO') module.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
        else {
            console.error(`[START ERRO] Tipo de jogo '${room.gameType}' não tem rota definida no if/else.`);
        }
    } catch (error) {
        console.error(`[START CRASH] Erro fatal ao iniciar o jogo:`, error);
    }
  });

  socket.on('restart_game', ({ roomId }) => {
      const room = rooms.get(roomId); 
      if(room && room.host === socket.id) {
        // Reinicia usando a mesma lógica explícita
        const module = gameModules[room.gameType];
        if (room.gameType === 'ITO') module.startIto(io, room, roomId);
        else if (room.gameType === 'CHA_CAFE') module.startChaCafe(io, room, roomId);
        else if (room.gameType === 'CODENAMES') module.startCodenames(io, room, roomId);
        else if (room.gameType === 'STOP') module.startStop(io, room, roomId);
        else if (room.gameType === 'TERMO') module.startTermo(io, room, roomId);
      }
  });

  // --- REGISTRO AUTOMÁTICO DOS HANDLERS ---
  Object.values(gameModules).forEach(mod => {
      // Procura função que comece com "register" em cada módulo e executa
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

  // --- DISCONNECT INTELIGENTE (COM GRACE PERIOD) ---
  socket.on('disconnect', () => {
     rooms.forEach((room, roomId) => {
         const player = room.players.find(p => p.id === socket.id);
         
         if (player) {
             player.connected = false; // Marca como offline, mas NÃO remove ainda do array
             
             // Verifica quantos jogadores ainda estão conectados na sala do Socket.IO
             const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
             const activeCount = socketsInRoom ? socketsInRoom.size : 0;

             if (activeCount === 0) {
                 // Se NINGUÉM sobrou na sala, agenda destruição para o futuro
                 console.log(`[SALA VAZIA] Sala ${roomId} agendada para exclusão em ${ROOM_TIMEOUT_MS/1000}s`);
                 scheduleRoomDestruction(roomId);
             } else {
                 // Se ainda tem gente, verifica se precisamos remover (Lobby vs Jogo)
                 
                 if (room.phase === 'LOBBY') {
                     // No lobby, removemos imediatamente para liberar visualmente
                     room.players = room.players.filter(p => p.id !== socket.id);
                     io.to(roomId).emit('update_players', room.players);
                     
                     // Se esvaziou o lobby com essa saída, agenda destruição
                     if(room.players.length === 0) scheduleRoomDestruction(roomId);
                     else {
                         // Passa o host se o host saiu
                         if(room.host === socket.id && room.players.length > 0) {
                             room.host = room.players[0].id;
                             room.players[0].isHost = true;
                             io.to(roomId).emit('update_players', room.players);
                         }
                     }
                 }
                 // Se estiver em JOGO ('GAME', 'PLAYING', etc), NÃO fazemos nada.
                 // O jogador fica "offline" na lista interna mas não é removido,
                 // permitindo que ele volte (rejoin) e continue jogando.
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
    // Se já tiver timer rodando, não cria outro
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
  if (!room) { 
      socket.emit('error_msg', 'Sala não encontrada'); 
      return; 
  }
  
  // Garante que a sala não suma se alguém entrar nela agora
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

// CONFIGURAÇÃO DE PORTA PARA DEPLOY (Importante para Render/Vercel)
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR MODULAR ONLINE NA PORTA ${PORT}`);
});