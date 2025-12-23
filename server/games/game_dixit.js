const startDixit = (io, room, roomId) => {
    // 1. Cria baralho virtual (IDs de sementes para imagens)
    // Usamos números grandes para garantir imagens variadas no Picsum
    const deck = Array.from({ length: 200 }, (_, i) => i + 100).sort(() => Math.random() - 0.5);

    // 2. Distribui 6 cartas para cada
    room.players.forEach(p => {
        p.hand = deck.splice(0, 6);
        p.score = 0;
        p.selectedCard = null; // Carta escolhida na rodada
        p.votedCard = null;    // Carta em que votou
    });

    // 3. Define ordem
    const turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);

    room.gameData = {
        deck: deck,
        turnOrder: turnOrder,
        storytellerIndex: 0,
        
        // Estado da Rodada
        clue: null,           // A dica do narrador
        storytellerCard: null,// A carta correta
        tableCards: [],       // Cartas jogadas na mesa para votação { id, ownerId }
        
        phase: 'STORYTELLER', // STORYTELLER -> SELECTION -> VOTING -> RESULT
        roundWinners: []      // Info de quem ganhou pontos
    };
    
    room.phase = 'GAME';
    
    updateGame(io, room, roomId);
};

const updateGame = (io, room, roomId) => {
    io.to(roomId).emit('game_started', {
        gameType: 'DIXIT',
        phase: 'GAME',
        gameData: getPublicData(room),
        players: room.players.map(p => ({
            id: p.id,
            nickname: p.nickname,
            score: p.score,
            hasPlayed: !!p.selectedCard,
            hasVoted: !!p.votedCard
        }))
    });
    
    // Envia a mão privada para cada jogador
    room.players.forEach(p => {
        io.to(p.id).emit('dixit_hand', p.hand);
    });
};

const getPublicData = (room) => {
    const gd = room.gameData;
    return {
        storytellerId: gd.turnOrder[gd.storytellerIndex],
        clue: gd.clue,
        phase: gd.phase,
        // Na fase de votação/resultado, mostra as cartas da mesa embaralhadas
        tableCards: (gd.phase === 'VOTING' || gd.phase === 'RESULT') ? gd.tableCards : [],
        roundWinners: gd.roundWinners
    };
};

const nextTurn = (room) => {
    const gd = room.gameData;
    
    // Repor cartas (cada um compra 1)
    room.players.forEach(p => {
        if (gd.deck.length > 0) {
            p.hand = p.hand.filter(c => c !== p.selectedCard); // Remove a usada
            p.hand.push(gd.deck.pop()); // Compra nova
        }
        p.selectedCard = null;
        p.votedCard = null;
    });

    gd.clue = null;
    gd.storytellerCard = null;
    gd.tableCards = [];
    gd.roundWinners = [];
    
    // Passa o narrador
    gd.storytellerIndex = (gd.storytellerIndex + 1) % gd.turnOrder.length;
    gd.phase = 'STORYTELLER';
};

const registerDixitHandlers = (io, socket, rooms) => {
    // 1. Narrador define carta e dica
    socket.on('dixit_set_clue', ({ roomId, card, clue }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        // Verifica se é o narrador
        if (socket.id !== gd.turnOrder[gd.storytellerIndex]) return;

        gd.clue = clue;
        gd.storytellerCard = card;
        
        // Registra a carta do narrador na mesa
        const player = room.players.find(p => p.id === socket.id);
        player.selectedCard = card;
        gd.tableCards.push({ id: card, ownerId: socket.id });

        gd.phase = 'SELECTION';
        updateGame(io, room, roomId);
    });

    // 2. Outros jogadores escolhem cartas
    socket.on('dixit_select_card', ({ roomId, card }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        
        // Narrador não joga aqui
        if (socket.id === gd.turnOrder[gd.storytellerIndex]) return;

        const player = room.players.find(p => p.id === socket.id);
        player.selectedCard = card;
        gd.tableCards.push({ id: card, ownerId: socket.id });

        // Se todos jogaram
        if (gd.tableCards.length === room.players.length) {
            // Embaralha as cartas da mesa para ninguém saber de quem é qual
            gd.tableCards.sort(() => Math.random() - 0.5);
            gd.phase = 'VOTING';
        }
        updateGame(io, room, roomId);
    });

    // 3. Votação
    socket.on('dixit_vote', ({ roomId, cardId }) => {
        const room = rooms.get(roomId); if (!room) return;
        const gd = room.gameData;
        const player = room.players.find(p => p.id === socket.id);

        // Não pode votar na própria carta
        if (player.selectedCard === cardId) return;
        // Narrador não vota
        if (socket.id === gd.turnOrder[gd.storytellerIndex]) return;

        player.votedCard = cardId;

        // Verifica se todos (menos narrador) votaram
        const votersCount = room.players.length - 1;
        const votesCount = room.players.filter(p => p.votedCard).length;

        if (votesCount >= votersCount) {
            calculateScores(room);
            gd.phase = 'RESULT';
            updateGame(io, room, roomId);
            
            // Próxima rodada após 10s
            setTimeout(() => {
                nextTurn(room);
                updateGame(io, room, roomId);
            }, 10000);
        } else {
            updateGame(io, room, roomId);
        }
    });
};

const calculateScores = (room) => {
    const gd = room.gameData;
    const storyteller = room.players.find(p => p.id === gd.turnOrder[gd.storytellerIndex]);
    const others = room.players.filter(p => p.id !== storyteller.id);

    // Votos na carta do narrador
    const correctVotes = others.filter(p => p.votedCard === gd.storytellerCard).length;

    gd.roundWinners = []; // Log para mostrar na tela

    // REGRA 1: Todos acertaram OU Ninguém acertou -> Narrador 0, Outros 2
    if (correctVotes === 0 || correctVotes === others.length) {
        others.forEach(p => { p.score += 2; });
        gd.roundWinners.push({ msg: "Narrador falhou! (Todos ou Ninguém acertou)", type: 'bad' });
    } else {
        // REGRA 2: Alguns acertaram -> Narrador 3, Acertadores 3
        storyteller.score += 3;
        others.filter(p => p.votedCard === gd.storytellerCard).forEach(p => {
            p.score += 3;
            gd.roundWinners.push({ msg: `${p.nickname} encontrou a carta! (+3)`, type: 'good' });
        });
    }

    // REGRA 3: Bônus de Enganação (1 ponto por voto recebido na sua carta falsa)
    others.forEach(p => {
        const votesReceived = others.filter(voter => voter.votedCard === p.selectedCard).length;
        if (votesReceived > 0) {
            p.score += votesReceived;
            gd.roundWinners.push({ msg: `${p.nickname} enganou ${votesReceived} pessoas! (+${votesReceived})`, type: 'bonus' });
        }
    });
};

module.exports = { startDixit, registerDixitHandlers };