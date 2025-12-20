const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- IMPORTAÇÃO DOS TEMAS ---
// Certifique-se de ter criado o arquivo 'themes.json' na mesma pasta
const THEMES = require('./themes.json'); 

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  // Aumenta tolerância para conexões instáveis (3G/4G/Celular)
  pingTimeout: 60000, 
});

// Armazenamento das salas na memória RAM
const rooms = new Map();

// Função para embaralhar e gerar cartas (1 a 100)
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

  // --- 1. CRIAR SALA ---
  socket.on('create_room', ({ nickname, gameType }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    console.log(`[CRIAR] Sala ${roomId} criada por ${nickname}`);
    
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

  // --- 2. ENTRAR NA SALA ---
  socket.on('join_room', ({ roomId, nickname }) => {
    joinRoomInternal(socket, roomId?.toUpperCase(), nickname, false);
  });

  // --- 3. RECONEXÃO (Salva a vida no Mobile) ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error_msg', 'A sala expirou ou não existe mais.');
      return;
    }
    
    // Procura o jogador pelo NOME (já que o socket mudou)
    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    
    if (existingIndex !== -1) {
       // --- JOGADOR ENCONTRADO (RECUPERAÇÃO) ---
       const oldSocketId = room.players[existingIndex].id;
       
       // Atualiza para o novo ID de conexão
       room.players[existingIndex].id = socket.id;
       socket.join(roomId);
       
       // Se o antigo socket era o Host, passa a coroa para o novo
       if (room.host === oldSocketId) {
         room.host = socket.id;
         room.players[existingIndex].isHost = true;
       }

       console.log(`[RECONECTOU] ${nickname} voltou para sala ${roomId}`);
       
       // Envia TUDO que ele precisa para voltar ao jogo onde parou
       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         theme: room.currentTheme,
         mySecretNumber: room.players[existingIndex].secretNumber // Recupera a carta dele
       });
       
       // Avisa a sala que ele voltou
       io.to(roomId).emit('update_players', room.players);
       
    } else {
       // Se não achou ninguém com esse nome, tenta entrar como novo
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });

  // --- 4. EXPULSAR JOGADOR (KICK) ---
  socket.on('kick_player', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.host !== socket.id) return; // Segurança: só Host expulsa

    // Remove da lista
    room.players = room.players.filter(p => p.id !== targetId);
    
    // Avisa o expulso e força saída
    io.to(targetId).emit('kicked', 'Você foi removido da sala.');
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.leave(roomId);

    // Atualiza a sala
    io.to(roomId).emit('update_players', room.players);
  });

  // --- 5. LÓGICA DO JOGO (INÍCIO) ---
  const startGameLogic = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const deck = generateDeck();
    
    // Sorteia tema do arquivo JSON
    room.currentTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    room.phase = 'CLUE_PHASE';
    
    // Distribui cartas e reseta estados
    room.players.forEach((player) => {
      player.secretNumber = deck.pop(); 
      player.clue = '';
      player.hasSubmitted = false;
      player.isCorrect = null;
    });

    // Envia dados gerais para todos
    io.to(roomId).emit('game_started', {
      phase: room.phase,
      theme: room.currentTheme,
      players: room.players.map(p => ({ 
        id: p.id, nickname: p.nickname, isHost: p.isHost, hasSubmitted: false 
      }))
    });

    // Envia o segredo APENAS para cada jogador específico
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

  // --- 6. RECEBER DICAS ---
  socket.on('submit_clue', ({ roomId, clue }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.clue = clue;
      player.hasSubmitted = true;
      
      // Verifica se todos já enviaram
      const allReady = room.players.every(p => p.hasSubmitted);

      if (allReady) {
        room.phase = 'ORDERING';
        // Envia todas as dicas para todos
        io.to(roomId).emit('phase_change', { phase: 'ORDERING', players: room.players });
      } else {
        // Apenas avisa que fulano terminou
        io.to(roomId).emit('player_submitted', { playerId: socket.id });
      }
    }
  });

  // --- 7. ORDENAÇÃO DAS CARTAS (Drag & Drop) ---
  socket.on('update_order', ({ roomId, newOrderIds }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const reordered = [];
    newOrderIds.forEach(id => {
      const p = room.players.find(pl => pl.id === id);
      if (p) reordered.push(p);
    });
    room.players = reordered;
    
    // Reenvia a nova ordem para sincronizar telas
    socket.to(roomId).emit('order_updated', room.players);
  });

  // --- 8. REVELAÇÃO FINAL ---
  socket.on('reveal_cards', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    // Validações de segurança
    if (!room) {
      socket.emit('error_msg', 'Sala não encontrada.');
      return;
    }
    if (room.host !== socket.id) {
      socket.emit('error_msg', 'Apenas o Host pode revelar!');
      return;
    }
    
    room.phase = 'REVEAL';
    
    // Calcula ordem perfeita (menor para maior)
    const perfectOrder = [...room.players].sort((a, b) => a.secretNumber - b.secretNumber);
    
    let totalScore = 0;
    const results = room.players.map((player, index) => {
      const isCorrect = player.id === perfectOrder[index].id;
      if (isCorrect) totalScore++;
      return { ...player, isCorrect, secretNumber: player.secretNumber };
    });

    io.to(roomId).emit('game_over', { results, totalScore, maxScore: room.players.length });
  });

  // --- 9. CHAT ---
  socket.on('send_message', ({ roomId, message, nickname }) => {
    io.to(roomId).emit('receive_message', { 
      id: Math.random().toString(36).substr(2, 9),
      text: message, 
      nickname, 
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // --- 10. DESCONEXÃO INTELIGENTE ---
  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const pIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (pIndex !== -1) {
        // SE ESTIVER NO LOBBY: Remove imediatamente (não faz sentido segurar vaga)
        if (room.phase === 'LOBBY') {
            room.players.splice(pIndex, 1);
            if (room.players.length === 0) {
                rooms.delete(roomId); // Sala vazia = delete
            } else {
                // Se o Host saiu, passa a coroa para o próximo
                if (socket.id === room.host) {
                    room.host = room.players[0].id;
                    room.players[0].isHost = true;
                }
                io.to(roomId).emit('update_players', room.players);
            }
        } 
        // SE O JOGO JÁ COMEÇOU: NÃO REMOVE DA LISTA!
        // Mantemos os dados lá para que o 'rejoin_room' possa recuperar 
        // as cartas e dicas quando o usuário der F5 ou voltar do bloqueio.
        // O jogador fica "fantasma" até reconectar ou a sala ser deletada manualmente.
      }
    });
  });
});

// --- FUNÇÃO AUXILIAR: ENTRAR NA SALA ---
function joinRoomInternal(socket, roomId, nickname, isHost) {
  if (!roomId) return;
  const room = rooms.get(roomId.toUpperCase());
  
  if (!room) { 
    socket.emit('error_msg', 'Sala não encontrada. Verifique o código.'); 
    return; 
  }
  
  // Anti-Duplicidade: Verifica se já tem alguém com esse socket ou esse Nickname
  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id));
  
  if (isDuplicate) {
    // Se for duplicado, não faz nada (o cliente lá trata ou apenas reconecta)
    return;
  }

  const newPlayer = { id: socket.id, nickname, isHost, secretNumber: null, clue: '', hasSubmitted: false };
  room.players.push(newPlayer);
  
  socket.join(roomId);
  io.to(roomId).emit('update_players', room.players);
  socket.emit('joined_room', { 
    roomId, 
    isHost, 
    players: room.players, 
    phase: room.phase, 
    theme: room.currentTheme 
  });
}

server.listen(3001, '0.0.0.0', () => console.log('SERVIDOR RODANDO NA PORTA 3001'));