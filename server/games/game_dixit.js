const { shuffle } = require('../utils/helpers');

// --- CONFIGURAÇÕES ---
const TOTAL_CARDS = 100; 
const HAND_SIZE = 6;
const TARGET_SCORE = 30; 

const startDixit = (io, room, roomId) => {
    // 1. Configura Estado Inicial
    const deck = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);
    
    room.phase = 'GAME';
    
    room.gameData = {
        deck: shuffle(deck),
        discardPile: [], 
        round: 1,
        targetScore: TARGET_SCORE,
        votingDeadline: null, 
        narratorIndex: 0,
        narratorId: room.players[0].id,
        phase: 'NARRATOR',
        clue: '',
        tableCards: [], 
        votes: {},      
        scores: {},
        hands: {}       
    };

    room.players.forEach(p => {
        room.gameData.scores[p.id] = 0;
        room.gameData.hands[p.id] = [];
    });

    dealCards(room);

    io.to(roomId).emit('game_started', { 
        gameType: 'DIXIT', 
        phase: 'NARRATOR', 
        gameData: getPublicData(room.gameData), 
        players: room.players 
    });

    sendHands(io, room);
};

// --- HELPER PARA DADOS PÚBLICOS ---
const getPublicData = (gd) => {
    let publicTableCards = [];

    // Sanitização para evitar trapaça
    if (gd.phase === 'PLAYS') {
        publicTableCards = gd.tableCards.map(c => ({ 
            id: null, 
            ownerId: c.ownerId, 
            status: 'played' 
        }));
    } else if (gd.phase === 'VOTING') {
        publicTableCards = gd.tableCards.map(c => ({ 
            id: c.id, 
            ownerId: null // Oculta dono na votação
        }));
    } else if (gd.phase === 'SCORING' || gd.phase === 'VICTORY') {
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
        scores: gd.scores,
        targetScore: gd.targetScore,
        votingDeadline: gd.votingDeadline
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
        
        while (hand.length < HAND_SIZE) {
            if (gd.deck.length === 0) {
                if (gd.discardPile.length === 0) break;
                console.log(`[DIXIT] Reciclando ${gd.discardPile.length} cartas.`);
                gd.deck = shuffle([...gd.discardPile]);
                gd.discardPile = [];
            }
            hand.push(gd.deck.pop());
        }
    });
};

const sendHands = (io, room, targetId = null) => {
    const playersToSend = targetId ? room.players.filter(p => p.id === targetId) : room.players;
    playersToSend.forEach(p => {
        const hand = room.gameData.hands[p.id] || [];
        io.to(p.id).emit('dixit_hand', hand);
    });
};

// NOVA: Envia para o jogador qual é a carta dele (privado)
const sendMyCardInfo = (io, room, targetId = null) => {
    const playersToSend = targetId ? room.players.filter(p => p.id === targetId) : room.players;
    playersToSend.forEach(p => {
        // Procura a carta que esse jogador jogou na mesa
        const myCard = room.gameData.tableCards.find(c => c.ownerId === p.id);
        // Envia o ID ou null (se ainda não jogou ou não tem carta na mesa)
        io.to(p.id).emit('dixit_my_card', myCard ? myCard.id : null);
    });
};

const updateGame = (io, room, roomId) => {
    const gd = room.gameData;
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(gd), phase: gd.phase });
    sendHands(io, room);
    sendMyCardInfo(io, room); // Atualiza quem é dono de qual carta privadamente
};

const checkVictory = (room) => {
    const gd = room.gameData;
    const sorted = [...room.players].sort((a,b) => (gd.scores[b.id]||0) - (gd.scores[a.id]||0));
    const leader = sorted[0];
    if ((gd.scores[leader.id] || 0) >= gd.targetScore) return leader;
    return null;
};

const nextPhase = (io, room, roomId) => {
    const gd = room.gameData;

    if (gd.phase === 'NARRATOR') {
        gd.phase = 'PLAYS';
        
    } else if (gd.phase === 'PLAYS') {
        gd.tableCards = shuffle(gd.tableCards);
        gd.phase = 'VOTING';
        gd.votingDeadline = Date.now() + 30000;

    } else if (gd.phase === 'VOTING') {
        calculateScores(room);
        const winner = checkVictory(room);
        if (winner) { endGame(io, room, roomId, winner); return; }
        
        gd.phase = 'SCORING';
        gd.votingDeadline = null;
        
    } else if (gd.phase === 'SCORING') {
        gd.tableCards.forEach(c => gd.discardPile.push(c.id));
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
    Object.values(gd.votes).forEach(cardId => { if (cardId === narratorCard.id) votesOnNarrator++; });

    const othersCount = room.players.length - 1;

    if (votesOnNarrator === othersCount || votesOnNarrator === 0) {
        room.players.forEach(p => { if (p.id !== narratorId) gd.scores[p.id] += 2; });
    } else {
        gd.scores[narratorId] += 3;
        Object.entries(gd.votes).forEach(([voterId, cardId]) => { if (cardId === narratorCard.id) gd.scores[voterId] += 3; });
    }

    Object.entries(gd.votes).forEach(([voterId, cardId]) => {
        if (cardId !== narratorCard.id) {
            const cardOwner = gd.tableCards.find(c => c.id === cardId)?.ownerId;
            if (cardOwner && cardOwner !== voterId && cardOwner !== narratorId) gd.scores[cardOwner] += 1;
        }
    });
};

const endGame = (io, room, roomId, winner) => {
    const gd = room.gameData;
    io.to(roomId).emit('game_over', { winner: winner, gameData: getPublicData(gd), phase: 'VICTORY' });
};

// --- HANDLERS ---
const registerDixitHandlers = (io, socket, rooms) => {
    // NOVO: Handler para sincronizar dados privados ao reconectar
    socket.on('dixit_sync_state', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room && room.gameType === 'DIXIT') {
            sendHands(io, room, socket.id);
            sendMyCardInfo(io, room, socket.id);
        }
    });

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

        // Validação extra no backend:
        const myCard = room.gameData.tableCards.find(c => c.ownerId === socket.id);
        if (myCard && myCard.id === cardId) return; 

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