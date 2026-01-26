const { shuffle } = require('../utils/helpers');

// --- DADOS DO JOGO (HARDCODED PARA EVITAR BUGS) ---
const THEMES_DATA = [
    "Uma viagem inesquecível",
    "Um sonho muito estranho",
    "Uma comida que eu odeio",
    "Um mico que já paguei",
    "Se eu ganhasse na loteria...",
    "Um superpoder inútil",
    "O melhor dia da minha vida",
    "Uma fobia bizarra"
];

const startChaCafe = (io, room, roomId) => {
    // Define narrador (Host começa)
    const narrator = room.players[0]; 
    
    // Embaralha temas para oferecer opções
    const availableThemes = shuffle([...THEMES_DATA]).slice(0, 3);

    room.gameData = {
        round: 1,
        narratorId: narrator.id,
        currentTheme: null, 
        themeOptions: availableThemes, // Envia opções para o narrador escolher
        answers: {},
        votes: {},
        phase: 'THEME_SELECTION'
    };
    
    room.phase = 'GAME';
    
    // Envia o estado inicial para todos
    io.to(roomId).emit('game_started', {
        gameType: 'CHA_CAFE',
        phase: 'THEME_SELECTION',
        gameData: getPublicData(room),
        players: room.players
    });

    console.log(`[CHA_CAFE] Iniciado na sala ${roomId}. Narrador: ${narrator.nickname}`);
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd) return {};
    return {
        round: gd.round,
        narratorId: gd.narratorId,
        currentTheme: gd.currentTheme,
        themeOptions: gd.themeOptions, // Importante enviar isso
        phase: gd.phase,
        answersCount: Object.keys(gd.answers || {}).length,
        answers: (gd.phase === 'VOTING' || gd.phase === 'RESULT') ? gd.answers : {} 
    };
};

const registerChaCafeHandlers = (io, socket, rooms) => {
    // Seleção do Tema
    socket.on('chacafe_select_theme', ({ roomId, theme }) => {
        const room = rooms.get(roomId);
        // Verifica se é o narrador
        if (!room || room.gameData.narratorId !== socket.id) return;
        
        console.log(`[CHA_CAFE] Tema escolhido: ${theme}`);
        room.gameData.currentTheme = theme;
        room.gameData.phase = 'WRITING';
        room.gameData.answers = {};
        
        io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'WRITING' });
    });

    // Envio de Resposta
    socket.on('chacafe_submit', ({ roomId, text }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'WRITING') return;
        
        const gd = room.gameData;
        gd.answers[socket.id] = text;
        
        // Verifica se todos (menos narrador se ele não jogar) responderam. 
        // Lógica atual: Todos escrevem.
        if (Object.keys(gd.answers).length >= room.players.length) {
            gd.phase = 'VOTING'; // Vai para leitura/votação
            io.to(roomId).emit('update_game_data', { 
                gameData: getPublicData(room), 
                phase: 'VOTING' 
            });
        } else {
            // Apenas atualiza o contador de respostas
            io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'WRITING' });
        }
    });

    // Votação (Próxima fase seria escolher a melhor)
    socket.on('chacafe_vote', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'VOTING') return;
        
        // Implementar lógica de pontuação aqui se quiser
        // Por enquanto, vamos só ir para RESULT quando o narrador decidir
    });
    
    // Narrador encerra rodada
    socket.on('chacafe_end_round', ({ roomId, winnerId }) => {
         const room = rooms.get(roomId);
         if (!room || room.gameData.narratorId !== socket.id) return;
         
         // Dá pontos pro vencedor
         const winner = room.players.find(p => p.id === winnerId);
         if(winner) winner.score += 1;

         // Passa narrador
         const currentIdx = room.players.findIndex(p => p.id === socket.id);
         const nextIdx = (currentIdx + 1) % room.players.length;
         const nextNarrator = room.players[nextIdx];

         room.gameData.narratorId = nextNarrator.id;
         room.gameData.round++;
         room.gameData.phase = 'THEME_SELECTION';
         room.gameData.themeOptions = shuffle([...THEMES_DATA]).slice(0, 3);
         room.gameData.currentTheme = null;
         room.gameData.answers = {};
         
         io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: 'THEME_SELECTION' });
         io.to(roomId).emit('update_players', room.players);
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    
    if (!gd) return false;

    if (gd.narratorId === oldId) {
        gd.narratorId = newId;
        updated = true;
    }

    if (gd.answers && gd.answers[oldId]) {
        gd.answers[newId] = gd.answers[oldId];
        delete gd.answers[oldId];
        updated = true;
    }

    return updated;
};

module.exports = { startChaCafe, registerChaCafeHandlers, handleRejoin };