const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000, // Aumenta tolerância para conexões instáveis (celular)
});

const THEMES = [
  { id: 1, title: "Coisas para levar numa ilha deserta", min: "Inútil", max: "Essencial" },
  { id: 2, title: "Animais perigosos", min: "Inofensivo", max: "Mortal" },
  { id: 3, title: "Comidas de primeiro encontro", min: "Horrível", max: "Perfeita" },
  { id: 4, title: "Poderes de super-herói", min: "Inútil", max: "Divino" },
  { id: 5, title: "Situações para rir", min: "Sem graça", max: "Mijei de rir" },
  { id: 6, title: "Filmes de Terror", min: "Durmo assistindo", max: "Pesadelo garantido" }
];

const rooms = new Map();

const generateDeck = () => {
  const deck = Array.from({ length: 100 }, (_, i) => i + 1);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Nova conexão: ${socket.id}`);

  // --- CRIAR SALA ---
  socket.on('create_room', ({ nickname, gameType }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    console.log(`[CRIAR] Sala ${roomId} (${gameType}) por ${nickname}`);
    
    rooms.set(roomId, {
      id: roomId,
      gameType, // Ex: 'ITO'
      host: socket.id,
      phase: 'LOBBY',
      players: [],
      currentTheme: null
    });
    socket.emit('room_created', roomId);
    joinRoomInternal(socket, roomId, nickname, true);
  });

  // --- ENTRAR NA SALA (Com proteção de duplicidade) ---
  socket.on('join_room', ({ roomId, nickname }) => {
    joinRoomInternal(socket, roomId?.toUpperCase(), nickname, false);
  });

  // --- RECONEXÃO (Para celular que bloqueou tela) ---
  socket.on('rejoin_room', ({ roomId, nickname, oldSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error_msg', 'A sala expirou ou não existe mais.');
      return;
    }
    
    // Procura se o jogador "antigo" ainda está lá (fantasma) e remove
    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    if (existingIndex !== -1) {
       // Atualiza o ID do socket para o novo
       room.players[existingIndex].id = socket.id;
       socket.join(roomId);
       
       // Se era Host, transfere a coroa
       if (room.host === oldSocketId) {
         room.host = socket.id;
         room.players[existingIndex].isHost = true;
       }

       console.log(`[RECONECTOU] ${nickname} voltou para sala ${roomId}`);
       
       // Envia estado atual para quem voltou
       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         theme: room.currentTheme,
         mySecretNumber: room.players[existingIndex].secretNumber // Devolve o número secreto dele
       });
       io.to(roomId).emit('update_players', room.players);
    } else {
       // Se não achou, entra como novo
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- EXPULSAR JOGADOR (Novo) ---
  socket.on('kick_player', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Só Host pode expulsar
    if (room.host !== socket.id) return;

    // Remove da lista
    room.players = room.players.filter(p => p.id !== targetId);
    
    // Avisa o expulso
    io.to(targetId).emit('kicked', 'Você foi removido da sala pelo Host.');
    // Desconecta o socket da sala (força saída)
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.leave(roomId);

    // Atualiza lista para os restantes
    io.to(roomId).emit('update_players', room.players);
  });

  // ... (RESTANTE DA LÓGICA DO JOGO IGUAL ANTES) ...
  const startGameLogic = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const deck = generateDeck();
    room.currentTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    room.phase = 'CLUE_PHASE';
    
    room.players.forEach((player) => {
      player.secretNumber = deck.pop(); 
      player.clue = '';
      player.hasSubmitted = false;
      player.isCorrect = null;
    });

    io.to(roomId).emit('game_started', {
      phase: room.phase,
      theme: room.currentTheme,
      players: room.players.map(p => ({ id: p.id, nickname: p.nickname, isHost: p.isHost, hasSubmitted: false }))
    });

    room.players.forEach((player) => {
      io.to(player.id).emit('your_secret_number', player.secretNumber);
    });
  };

  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id) startGameLogic(roomId);
  });

  socket.on('restart_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.host === socket.id) startGameLogic(roomId);
  });

  socket.on('submit_clue', ({ roomId, clue }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.clue = clue;
      player.hasSubmitted = true;
      const allReady = room.players.every(p => p.hasSubmitted);
      if (allReady) {
        room.phase = 'ORDERING';
        io.to(roomId).emit('phase_change', { phase: 'ORDERING', players: room.players });
      } else {
        io.to(roomId).emit('player_submitted', { playerId: socket.id });
      }
    }
  });

  socket.on('update_order', ({ roomId, newOrderIds }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const reordered = [];
    newOrderIds.forEach(id => {
      const p = room.players.find(pl => pl.id === id);
      if (p) reordered.push(p);
    });
    room.players = reordered;
    socket.to(roomId).emit('order_updated', room.players);
  });

  socket.on('reveal_cards', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    room.phase = 'REVEAL';
    const perfectOrder = [...room.players].sort((a, b) => a.secretNumber - b.secretNumber);
    let totalScore = 0;
    const results = room.players.map((player, index) => {
      const isCorrect = player.id === perfectOrder[index].id;
      if (isCorrect) totalScore++;
      return { ...player, isCorrect, secretNumber: player.secretNumber };
    });
    io.to(roomId).emit('game_over', { results, totalScore, maxScore: room.players.length });
  });

  socket.on('send_message', ({ roomId, message, nickname }) => {
    io.to(roomId).emit('receive_message', { 
      id: Math.random().toString(36).substr(2, 9),
      text: message, nickname, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    // Não removemos imediatamente para dar chance de reconexão (delay de 5s)
    // Mas para simplificar neste código, vamos remover apenas se não reconnectar logo.
    // Lógica simples: Remove da lista visual, mas se reconectar com mesmo nome/sala, recupera.
    rooms.forEach((room, roomId) => {
      // room.players = room.players.filter(p => p.id !== socket.id); // <--- REMOVIDO PARA EVITAR PISCAR
      // Apenas notificamos que saiu? Não, vamos remover para não encher de fantasmas.
      // O truque do mobile é o "rejoin" enviar os dados antes do disconnect total limpar a sala.
      
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) rooms.delete(roomId);
          else io.to(roomId).emit('update_players', room.players);
      }
    });
  });
});

function joinRoomInternal(socket, roomId, nickname, isHost) {
  if (!roomId) return;
  const room = rooms.get(roomId.toUpperCase());
  if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }
  
  // FIX: Evita duplicidade (se já tem alguém com esse socket ou nome exato na sala)
  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id));
  if (isDuplicate) return;

  const newPlayer = { id: socket.id, nickname, isHost, secretNumber: null, clue: '', hasSubmitted: false };
  room.players.push(newPlayer);
  socket.join(roomId);
  io.to(roomId).emit('update_players', room.players);
  socket.emit('joined_room', { roomId, isHost, players: room.players, phase: room.phase, theme: room.currentTheme });
}

server.listen(3001, '0.0.0.0', () => console.log('SERVER ON 3001'));