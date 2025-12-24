const { shuffle } = require('../utils/helpers');

// Configurações
const TOTAL_CARDS = 150; 
const HAND_SIZE = 6; // 6 Cartas na mão

const startDixit = (io, room, roomId) => {
    // 1. Configura Estado Inicial
    const deck = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);
    
    room.phase = 'GAME'; // Importante: Marca a sala como 'Em Jogo'
    
    room.gameData = {
        deck: shuffle(deck),
        round: 1,
        maxRounds: 10,
        narratorIndex: 0,
        narratorId: room.players[0].id,
        phase: 'NARRATOR', // Fase inicial do jogo
        clue: '',
        tableCards: [], 
        votes: {},      
        scores: {},
        hands: {}       
    };

    // Inicializa scores e mãos vazias
    room.players.forEach(p => {
        room.gameData.scores[p.id] = 0;
        room.gameData.hands[p.id] = [];
    });

    // 2. Distribui as cartas
    dealCards(room);

    // 3. AVISA O FRONT-END QUE O JOGO COMEÇOU (Isso corrige o bug do "Carregando")
    io.to(roomId).emit('game_started', { 
        gameType: 'DIXIT', 
        phase: 'NARRATOR', 
        gameData: getPublicData(room.gameData), 
        players: room.players 
    });

    // Envia as mãos individuais
    sendHands(io, room);
};

// --- HELPER PARA DADOS PÚBLICOS ---
const getPublicData = (gd) => {
    // Tratamento de privacidade das cartas da mesa
    let publicTableCards = [];

    if (gd.phase === 'PLAYS') {
        // Fase de jogar: Mostra quem jogou, mas esconde a carta
        publicTableCards = gd.tableCards.map(c => ({ 
            id: null, // ID null = Carta virada
            ownerId: c.ownerId, 
            status: 'played' 
        }));
    } else if (gd.phase === 'VOTING') {
        // Fase de voto: Mostra a carta, mas esconde o dono
        publicTableCards = gd.tableCards.map(c => ({ 
            id: c.id, 
            ownerId: null 
        }));
    } else if (gd.phase === 'SCORING' || gd.phase === 'VICTORY') {
        // Final: Mostra tudo
        publicTableCards = gd.tableCards.map(c => ({ 
            id: c.id, 
            ownerId: c.ownerId 
        }));
    }

    return {
        round: gd.round,
        phase: gd.phase,
        narratorId: gd.narratorId,
        clue: gd.clue,
        tableCards: publicTableCards,
        votes: (gd.phase === 'SCORING' || gd.phase === 'VICTORY') ? gd.votes : {},
        scores: gd.scores
    };
};

const handleDixitRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;

    if (gd.scores[oldId] !== undefined) { gd.scores[newId] = gd.scores[oldId]; delete gd.scores[oldId]; updated = true; }
    if (gd.hands[oldId]) { gd.hands[newId] = gd.hands[oldId]; delete gd.hands[oldId]; updated = true; }
    if (gd.narratorId === oldId) { gd.narratorId = newId; updated = true; }
    
    const tableCard = gd.tableCards.find(c => c.ownerId === oldId);
    if (tableCard) { tableCard.ownerId = newId; updated = true; }

    if (gd.votes[oldId]) { gd.votes[newId] = gd.votes[oldId]; delete gd.votes[oldId]; updated = true; }

    return updated;
};

// --- LÓGICA DO JOGO ---

const dealCards = (room) => {
    const gd = room.gameData;
    room.players.forEach(p => {
        if (!gd.hands[p.id]) gd.hands[p.id] = [];
        const hand = gd.hands[p.id];
        // Completa até ter 6 cartas
        while (hand.length < HAND_SIZE && gd.deck.length > 0) {
            hand.push(gd.deck.pop());
        }
    });
};

const sendHands = (io, room) => {
    room.players.forEach(p => {
        const hand = room.gameData.hands[p.id] || [];
        io.to(p.id).emit('dixit_hand', hand);
    });
};

const updateGame = (io, room, roomId) => {
    const gd = room.gameData;
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(gd), phase: gd.phase });
    sendHands(io, room);
};

const nextPhase = (io, room, roomId) => {
    const gd = room.gameData;

    if (gd.phase === 'NARRATOR') {
        gd.phase = 'PLAYS';
    } else if (gd.phase === 'PLAYS') {
        gd.tableCards = shuffle(gd.tableCards);
        gd.phase = 'VOTING';
    } else if (gd.phase === 'VOTING') {
        calculateScores(room);
        gd.phase = 'SCORING';
    } else if (gd.phase === 'SCORING') {
        if (gd.deck.length < room.players.length || gd.round >= gd.maxRounds) {
            endGame(io, room, roomId);
            return;
        }
        
        gd.round++;
        gd.narratorIndex = (gd.narratorIndex + 1) % room.players.length;
        gd.narratorId = room.players[gd.narratorIndex].id;
        gd.clue = '';
        gd.tableCards = [];
        gd.votes = {};
        gd.phase = 'NARRATOR';
        
        dealCards(room);
    }

    updateGame(io, room, roomId);
};

const calculateScores = (room) => {
    const gd = room.gameData;
    const narratorId = gd.narratorId;
    const narratorCard = gd.tableCards.find(c => c.ownerId === narratorId);
    
    if (!narratorCard) return;

    let votesOnNarrator = 0;
    Object.values(gd.votes).forEach(cardId => {
        if (cardId === narratorCard.id) votesOnNarrator++;
    });

    const othersCount = room.players.length - 1;

    // Todos acertaram ou Ninguém acertou -> Narrador 0, Outros 2
    if (votesOnNarrator === othersCount || votesOnNarrator === 0) {
        room.players.forEach(p => {
            if (p.id !== narratorId) gd.scores[p.id] += 2;
        });
    } else {
        // Narrador e quem acertou ganham 3
        gd.scores[narratorId] += 3;
        Object.entries(gd.votes).forEach(([voterId, cardId]) => {
            if (cardId === narratorCard.id) gd.scores[voterId] += 3;
        });
    }

    // Ponto extra por enganar
    Object.entries(gd.votes).forEach(([voterId, cardId]) => {
        if (cardId !== narratorCard.id) {
            const cardOwner = gd.tableCards.find(c => c.id === cardId)?.ownerId;
            if (cardOwner && cardOwner !== voterId && cardOwner !== narratorId) {
                gd.scores[cardOwner] += 1;
            }
        }
    });
};

const endGame = (io, room, roomId) => {
    const gd = room.gameData;
    const sorted = [...room.players].sort((a,b) => (gd.scores[b.id]||0) - (gd.scores[a.id]||0));
    io.to(roomId).emit('game_over', { winner: sorted[0], gameData: getPublicData(gd), phase: 'VICTORY' });
};

// --- HANDLERS ---
const registerDixitHandlers = (io, socket, rooms) => {
    socket.on('dixit_set_clue', ({ roomId, cardId, clue }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'NARRATOR' || room.gameData.narratorId !== socket.id) return;
        
        const gd = room.gameData;
        const hand = gd.hands[socket.id];
        const idx = hand.indexOf(cardId);
        if (idx === -1) return;
        
        hand.splice(idx, 1);
        gd.clue = clue;
        gd.tableCards.push({ id: cardId, ownerId: socket.id });
        
        nextPhase(io, room, roomId);
    });

    socket.on('dixit_play_card', ({ roomId, cardId }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'PLAYS') return;
        
        const gd = room.gameData;
        if (gd.tableCards.some(c => c.ownerId === socket.id)) return;

        const hand = gd.hands[socket.id];
        const idx = hand.indexOf(cardId);
        if (idx === -1) return;
        
        hand.splice(idx, 1);
        gd.tableCards.push({ id: cardId, ownerId: socket.id });

        if (gd.tableCards.length === room.players.length) nextPhase(io, room, roomId);
        else updateGame(io, room, roomId);
    });

    socket.on('dixit_vote', ({ roomId, cardId }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'VOTING') return;
        if (socket.id === room.gameData.narratorId) return;
        if (room.gameData.votes[socket.id]) return;

        const myCard = room.gameData.tableCards.find(c => c.ownerId === socket.id);
        if (myCard && myCard.id === cardId) return; // Bloqueia voto na própria

        room.gameData.votes[socket.id] = cardId;

        const votersCount = room.players.length - 1;
        if (Object.keys(room.gameData.votes).length === votersCount) nextPhase(io, room, roomId);
        else updateGame(io, room, roomId);
    });

    socket.on('dixit_next_round', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.host !== socket.id) return;
        nextPhase(io, room, roomId);
    });
};

module.exports = { startDixit, registerDixitHandlers, handleDixitRejoin };