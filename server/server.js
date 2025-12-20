const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- IMPORTAÇÃO DOS DADOS ---
// Certifique-se de que estes arquivos existem na pasta server/
const THEMES_ITO = require('./themes.json'); 
const WORDS_CHACAFE = require('./words.json'); 
const WORDS_CODENAMES = require('./words_codenames.json'); 

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000, // Tolerância alta para conexões mobile
});

const rooms = new Map();

// --- UTILITÁRIOS ---

const shuffle = (array) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const generateDeck = () => {
  const deck = Array.from({ length: 100 }, (_, i) => i + 1);
  return shuffle(deck);
};

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Nova: ${socket.id}`);

  // ================= GESTÃO DE SALAS =================

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

  // --- RECONEXÃO INTELIGENTE ---
  socket.on('rejoin_room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error_msg', 'A sala expirou.');
      return;
    }
    
    const existingIndex = room.players.findIndex(p => p.nickname === nickname);
    
    if (existingIndex !== -1) {
       const oldSocketId = room.players[existingIndex].id;
       
       // 1. Atualiza ID na lista principal
       room.players[existingIndex].id = socket.id;
       socket.join(roomId);
       
       // 2. Transfere Host se necessário
       if (room.host === oldSocketId) {
         room.host = socket.id;
         room.players[existingIndex].isHost = true;
       }

       // 3. FIX: Atualiza IDs dentro das estruturas dos jogos
       let gameDataUpdated = false;

       if (room.gameData) {
           // CHA OU CAFE
           if (room.gameType === 'CHA_CAFE') {
               if (room.gameData.narratorId === oldSocketId) { room.gameData.narratorId = socket.id; gameDataUpdated = true; }
               if (room.gameData.lastGuesserId === oldSocketId) { room.gameData.lastGuesserId = socket.id; gameDataUpdated = true; }
               if (room.gameData.guessersIds) {
                   const gIdx = room.gameData.guessersIds.indexOf(oldSocketId);
                   if (gIdx !== -1) { room.gameData.guessersIds[gIdx] = socket.id; gameDataUpdated = true; }
               }
           }
           
           // CODENAMES (Atualiza times)
           if (room.gameType === 'CODENAMES' && room.gameData.teams) {
               ['red', 'blue'].forEach(color => {
                   // Atualiza Espião
                   if (room.gameData.teams[color].spymaster === oldSocketId) {
                       room.gameData.teams[color].spymaster = socket.id;
                       gameDataUpdated = true;
                   }
                   // Atualiza Membro na lista
                   const mIdx = room.gameData.teams[color].members.indexOf(oldSocketId);
                   if (mIdx !== -1) {
                       room.gameData.teams[color].members[mIdx] = socket.id;
                       gameDataUpdated = true;
                   }
               });
           }
       }

       console.log(`[RECONECTOU] ${nickname} -> ${roomId}`);
       
       // Envia estado ATUAL para quem voltou
       socket.emit('joined_room', { 
         roomId, 
         isHost: room.players[existingIndex].isHost, 
         players: room.players, 
         phase: room.phase, 
         gameType: room.gameType,
         gameData: room.gameData, 
         mySecretNumber: room.players[existingIndex].secretNumber 
       });
       
       // 4. IMPORTANTE: Avisa TODOS que os dados mudaram (Resolve bugs visuais)
       io.to(roomId).emit('update_players', room.players);
       if(gameDataUpdated) {
           io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
       }

    } else {
       joinRoomInternal(socket, roomId, nickname, false);
    }
  });


  // ================= ROTEADOR DE JOGOS =================
  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    if (room.gameType === 'ITO') startIto(room, roomId);
    else if (room.gameType === 'CHA_CAFE') startChaCafe(room, roomId);
    else if (room.gameType === 'CODENAMES') startCodenamesSetup(room, roomId);
  });

  socket.on('restart_game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if(room && room.host === socket.id) {
          if(room.gameType === 'ITO') startIto(room, roomId);
          if(room.gameType === 'CHA_CAFE') startChaCafe(room, roomId);
          if(room.gameType === 'CODENAMES') startCodenamesSetup(room, roomId);
      }
  });


  // ================= LÓGICA: ITO =================
  const startIto = (room, roomId) => {
    const deck = generateDeck();
    room.gameData = { theme: THEMES_ITO[Math.floor(Math.random() * THEMES_ITO.length)] };
    room.phase = 'GAME'; 
    room.players.forEach(p => { p.secretNumber = deck.pop(); p.clue = ''; p.hasSubmitted = false; });
    io.to(roomId).emit('game_started', { gameType: 'ITO', phase: 'CLUE_PHASE', gameData: room.gameData, players: room.players });
    room.players.forEach(p => io.to(p.id).emit('your_secret_number', p.secretNumber));
  };
  socket.on('submit_clue', ({ roomId, clue }) => {
     const room = rooms.get(roomId); if(!room) return;
     const p = room.players.find(x => x.id === socket.id);
     if(p) {
         p.clue = clue; p.hasSubmitted = true;
         if(room.players.every(x => x.hasSubmitted)) {
             io.to(roomId).emit('phase_change', { phase: 'ORDERING', players: room.players });
         } else {
             io.to(roomId).emit('player_submitted', { playerId: socket.id });
         }
     }
  });
  socket.on('update_order', ({ roomId, newOrderIds }) => {
    const room = rooms.get(roomId); if(!room) return;
    const reordered = [];
    newOrderIds.forEach(id => { const p = room.players.find(pl => pl.id === id); if(p) reordered.push(p); });
    room.players = reordered;
    socket.to(roomId).emit('order_updated', room.players);
  });
  socket.on('reveal_cards', ({ roomId }) => {
    const room = rooms.get(roomId); if(!room || room.host !== socket.id) return;
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


  // ================= LÓGICA: CHÁ OU CAFÉ =================
  const startChaCafe = (room, roomId) => {
    const targetWord = WORDS_CHACAFE[Math.floor(Math.random() * WORDS_CHACAFE.length)];
    // Evita repetir narrador
    let candidates = room.players;
    if (room.gameData && room.gameData.narratorId && room.players.length > 1) {
        candidates = room.players.filter(p => p.id !== room.gameData.narratorId);
    }
    const narrator = candidates[Math.floor(Math.random() * candidates.length)];
    const guessers = room.players.filter(p => p.id !== narrator.id);
    room.gameData = { targetWord, narratorId: narrator.id, currentWord: "Chá", challengerWord: "Café", turnIndex: 0, guessersIds: guessers.map(p => p.id), lastGuesserId: null, roundCount: 1, hint: null };
    room.phase = 'JUDGING'; 
    io.to(roomId).emit('game_started', { gameType: 'CHA_CAFE', phase: 'JUDGING', gameData: room.gameData, players: room.players });
  };
  socket.on('cc_judge', ({ roomId, winnerWord }) => {
      const room = rooms.get(roomId); if (!room || room.gameData.narratorId !== socket.id) return;
      const data = room.gameData;
      if (winnerWord.toLowerCase() === data.targetWord.toLowerCase()) {
          room.phase = 'VICTORY';
          io.to(roomId).emit('game_over', { winnerWord, targetWord: data.targetWord, winnerPlayer: room.players.find(p => p.id === data.lastGuesserId)?.nickname || "Ninguém" });
          return;
      }
      data.currentWord = winnerWord; data.challengerWord = null; data.roundCount = (data.roundCount || 1) + 1; room.phase = 'GUESSING';
      io.to(roomId).emit('update_game_data', { gameData: data, phase: 'GUESSING' });
  });
  socket.on('cc_guess', ({ roomId, word }) => {
      const room = rooms.get(roomId); if(!room) return;
      const data = room.gameData;
      data.challengerWord = word; data.lastGuesserId = socket.id; data.turnIndex = (data.turnIndex + 1) % data.guessersIds.length; room.phase = 'JUDGING';
      io.to(roomId).emit('update_game_data', { gameData: data, phase: 'JUDGING' });
  });
  socket.on('cc_give_hint', ({ roomId, hint }) => {
      const room = rooms.get(roomId); if(!room) return;
      room.gameData.hint = hint; 
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.phase });
  });


  // ================= LÓGICA: CÓDIGO SECRETO (CODENAMES) =================
  
  // 1. SETUP (CORRIGIDO: AGORA TEM PHASE='SETUP')
  const startCodenamesSetup = (room, roomId) => {
      room.gameData = {
          teams: { red: { spymaster: null, members: [] }, blue: { spymaster: null, members: [] } },
          grid: [], 
          turn: null, 
          score: { red: 0, blue: 0 }, 
          hint: { word: '', count: 0 }, 
          guessesCount: 0, 
          winner: null,
          phase: 'SETUP' // <--- Fix da Tela em Branco
      };
      room.phase = 'GAME'; 
      io.to(roomId).emit('game_started', { gameType: 'CODENAMES', phase: 'SETUP', gameData: room.gameData, players: room.players });
  };

  // 2. ENTRAR EM TIME
  socket.on('cn_join_team', ({ roomId, team }) => {
      const room = rooms.get(roomId); if (!room) return;
      room.gameData.teams.red.members = room.gameData.teams.red.members.filter(id => id !== socket.id);
      room.gameData.teams.blue.members = room.gameData.teams.blue.members.filter(id => id !== socket.id);
      if(room.gameData.teams.red.spymaster === socket.id) room.gameData.teams.red.spymaster = null;
      if(room.gameData.teams.blue.spymaster === socket.id) room.gameData.teams.blue.spymaster = null;
      room.gameData.teams[team].members.push(socket.id);
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'SETUP' });
  });

  // 3. VIRAR ESPIÃO
  socket.on('cn_become_spymaster', ({ roomId, team }) => {
      const room = rooms.get(roomId); if (!room) return;
      if(!room.gameData.teams[team].members.includes(socket.id)) {
          const otherTeam = team === 'red' ? 'blue' : 'red';
          room.gameData.teams[otherTeam].members = room.gameData.teams[otherTeam].members.filter(id => id !== socket.id);
          room.gameData.teams[team].members.push(socket.id);
      }
      room.gameData.teams[team].spymaster = socket.id;
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'SETUP' });
  });

  // 4. INICIAR PARTIDA
  socket.on('cn_start_match', ({ roomId }) => {
      const room = rooms.get(roomId); if(!room || room.host !== socket.id) return;
      const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
      const secondTeam = startingTeam === 'red' ? 'blue' : 'red';
      const cards = [];
      for(let i=0; i<9; i++) cards.push({ type: startingTeam, revealed: false });
      for(let i=0; i<8; i++) cards.push({ type: secondTeam, revealed: false });
      cards.push({ type: 'assassin', revealed: false });
      for(let i=0; i<7; i++) cards.push({ type: 'neutral', revealed: false });
      const shuffledCards = shuffle(cards);
      const gameWords = shuffle([...WORDS_CODENAMES]).slice(0, 25);
      const grid = gameWords.map((word, i) => ({
          id: i, word: word, type: shuffledCards[i].type, revealed: false
      }));
      room.gameData.grid = grid; room.gameData.turn = startingTeam; room.gameData.phase = 'HINT'; 
      room.gameData.guessesCount = 0; room.gameData.score = { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 }; 
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'HINT' });
  });

  // 5. DAR DICA (FIX: CONVERSÃO DE INTEIRO PARA EVITAR ERRO DE N+1)
  socket.on('cn_give_hint', ({ roomId, word, count }) => {
      const room = rooms.get(roomId); if(!room) return;
      const currentTeam = room.gameData.turn;
      if (room.gameData.teams[currentTeam].spymaster !== socket.id) return;

      // Garante que é número
      let numericCount = parseInt(count, 10);
      if (isNaN(numericCount) || numericCount < 0) numericCount = 1;

      console.log(`[CODENAMES] Dica: ${word} (${numericCount})`);

      room.gameData.hint = { word, count: numericCount };
      room.gameData.guessesCount = 0; 
      room.gameData.phase = 'GUESSING';
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'GUESSING' });
  });

  // 6. CLICAR CARTA (COM LÓGICA CORRIGIDA DE FIM DE TURNO)
  socket.on('cn_click_card', ({ roomId, cardId }) => {
      const room = rooms.get(roomId); if(!room) return;
      const card = room.gameData.grid[cardId];
      if (card.revealed) return; 

      card.revealed = true;
      const currentTeam = room.gameData.turn;
      const enemyTeam = currentTeam === 'red' ? 'blue' : 'red';
      let turnEnds = false;

      if (card.type === 'assassin') {
          console.log(`[CODENAMES] Assassino!`);
          endCodenames(roomId, enemyTeam); return;

      } else if (card.type === currentTeam) {
          // ACERTOU
          room.gameData.score[currentTeam]--;
          if (room.gameData.score[currentTeam] === 0) {
              endCodenames(roomId, currentTeam); return;
          }

          // CONTAGEM DE PALPITES
          const currentCount = (room.gameData.guessesCount || 0) + 1;
          room.gameData.guessesCount = currentCount;
          
          // REGRA N+1
          const maxGuesses = (room.gameData.hint.count || 0) + 1; 

          console.log(`[CODENAMES] Palpites: ${currentCount} / Limite: ${maxGuesses}`);
          
          if (currentCount >= maxGuesses) {
              console.log(`[CODENAMES] Limite atingido. Passando vez.`);
              turnEnds = true;
          }

      } else if (card.type === 'neutral') {
          turnEnds = true;

      } else if (card.type === enemyTeam) {
          room.gameData.score[enemyTeam]--;
          turnEnds = true;
          if (room.gameData.score[enemyTeam] === 0) {
              endCodenames(roomId, enemyTeam); return;
          }
      }

      if (turnEnds) cnEndTurn(room);
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.gameData.phase });
  });

  socket.on('cn_pass_turn', ({ roomId }) => {
      const room = rooms.get(roomId); if(room) {
          cnEndTurn(room);
          io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.gameData.phase });
      }
  });

  const cnEndTurn = (room) => {
      room.gameData.turn = room.gameData.turn === 'red' ? 'blue' : 'red';
      room.gameData.phase = 'HINT';
      room.gameData.hint = { word: '', count: 0 };
      room.gameData.guessesCount = 0;
  };

  const endCodenames = (roomId, winnerTeam) => {
      const room = rooms.get(roomId);
      room.gameData.phase = 'GAME_OVER';
      room.gameData.winner = winnerTeam;
      room.gameData.grid.forEach(c => c.revealed = true);
      io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'GAME_OVER' });
  };


  // ================= UTILITÁRIOS GERAIS =================
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
                 if(room.host === socket.id && room.players.length > 0) {
                     room.host = room.players[0].id; room.players[0].isHost = true;
                 }
                 io.to(roomId).emit('update_players', room.players);
             }
         }
     });
  });
});

function joinRoomInternal(socket, roomId, nickname, isHost) {
  if (!roomId) return;
  const room = rooms.get(roomId.toUpperCase());
  if (!room) { socket.emit('error_msg', 'Sala não encontrada'); return; }
  const isDuplicate = room.players.some(p => p.id === socket.id || (p.nickname === nickname && p.id !== socket.id)); if (isDuplicate) return;
  const newPlayer = { id: socket.id, nickname, isHost, secretNumber: null, clue: '', hasSubmitted: false };
  room.players.push(newPlayer);
  socket.join(roomId);
  socket.emit('joined_room', { roomId, isHost, players: room.players, gameType: room.gameType, phase: room.phase, gameData: room.gameData });
  io.to(roomId).emit('update_players', room.players);
}

server.listen(3001, '0.0.0.0', () => console.log('SERVIDOR ONLINE 3001'));