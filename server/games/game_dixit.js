const { shuffle } = require('../utils/helpers');
const HAND_SIZE = 6;
const TARGET_SCORE = 30; 
const TOTAL_CARDS = 216; 

module.exports = (io, socket, rooms) => {
    socket.on('dixit_sync_state', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (room && room.gameType === 'DIXIT') sendPrivateData(io, room, socket.id);
    });

    socket.on('dixit_set_clue', ({ roomId, cardId, clue }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const gd = room.state;
        const hand = gd.hands[socket.id];
        const idx = hand.indexOf(cardId);
        if (idx === -1) return;
        
        hand.splice(idx, 1);
        gd.clue = clue;
        gd.tableCards.push({ id: cardId, ownerId: socket.id });
        nextPhase(io, room, roomId);
    });

    socket.on('dixit_play_card', ({ roomId, cardId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        const gd = room.state;
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
        const room = rooms[roomId]; // CORRIGIDO
        if (!room) return;
        if (socket.id === room.state.narratorId || room.state.votes[socket.id]) return;
        
        room.state.votes[socket.id] = cardId;
        if (Object.keys(room.state.votes).length >= room.players.length - 1) nextPhase(io, room, roomId);
        else updateGame(io, room, roomId);
    });

    socket.on('dixit_next_round', ({ roomId }) => {
        const room = rooms[roomId]; // CORRIGIDO
        if (room) nextPhase(io, room, roomId);
    });
};

module.exports.initGame = (room) => {
    const deck = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);
    room.state = {
        deck: shuffle(deck),
        discardPile: [], 
        round: 1,
        targetScore: TARGET_SCORE,
        votingDeadline: null, 
        narratorIndex: 0,
        narratorId: room.players[0].socketId,
        phase: 'NARRATOR',
        clue: '',
        tableCards: [], votes: {}, scores: {}, hands: {}, roundScores: {}
    };
    room.players.forEach(p => { room.state.scores[p.socketId] = 0; room.state.hands[p.socketId] = []; });
    dealCards(room);
    return { phase: 'NARRATOR', gameData: getPublicData(room.state) };
};

function dealCards(room) {
    const gd = room.state;
    room.players.forEach(p => {
        if (!gd.hands[p.socketId]) gd.hands[p.socketId] = [];
        const hand = gd.hands[p.socketId];
        while (hand.length < HAND_SIZE) {
            if (gd.deck.length === 0) {
                if (gd.discardPile.length === 0) break;
                gd.deck = shuffle([...gd.discardPile]);
                gd.discardPile = [];
            }
            hand.push(gd.deck.pop());
        }
    });
}

function sendPrivateData(io, room, targetSocketId = null) {
    const playersToSend = targetSocketId ? room.players.filter(p => p.socketId === targetSocketId) : room.players;
    playersToSend.forEach(p => {
        const hand = room.state.hands[p.socketId] || [];
        io.to(p.socketId).emit('dixit_hand', hand);
        const myCard = room.state.tableCards.find(c => c.ownerId === p.socketId);
        io.to(p.socketId).emit('dixit_my_card', myCard ? myCard.id : null);
    });
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: room.state.phase });
    sendPrivateData(io, room);
}

function nextPhase(io, room, roomId) {
    const gd = room.state;
    if (gd.phase === 'NARRATOR') {
        gd.phase = 'PLAYS';
    } else if (gd.phase === 'PLAYS') {
        gd.tableCards = shuffle(gd.tableCards);
        gd.phase = 'VOTING';
        gd.votingDeadline = Date.now() + 60000;
    } else if (gd.phase === 'VOTING') {
        calculateScores(room);
        const winnerId = Object.keys(gd.scores).reduce((a, b) => gd.scores[a] > gd.scores[b] ? a : b);
        if (gd.scores[winnerId] >= gd.targetScore) {
            const winner = room.players.find(p => p.socketId === winnerId);
            io.to(roomId).emit('game_over', { winner, gameData: getPublicData(gd), phase: 'VICTORY' });
            return;
        }
        gd.phase = 'SCORING'; gd.votingDeadline = null;
    } else if (gd.phase === 'SCORING') {
        gd.tableCards.forEach(c => gd.discardPile.push(c.id));
        gd.round++;
        gd.narratorIndex = (gd.narratorIndex + 1) % room.players.length;
        gd.narratorId = room.players[gd.narratorIndex].socketId;
        gd.clue = ''; gd.tableCards = []; gd.votes = {}; gd.roundScores = {}; gd.phase = 'NARRATOR';
        dealCards(room);
    }
    updateGame(io, room, roomId);
}

function calculateScores(room) {
    const gd = room.state;
    const narratorId = gd.narratorId;
    const narratorCard = gd.tableCards.find(c => c.ownerId === narratorId);
    gd.roundScores = {}; 
    room.players.forEach(p => gd.roundScores[p.socketId] = 0);
    if (!narratorCard) return;

    let votesOnNarrator = 0;
    Object.values(gd.votes).forEach(cardId => { if (cardId === narratorCard.id) votesOnNarrator++; });
    const othersCount = room.players.length - 1;

    if (votesOnNarrator === othersCount || votesOnNarrator === 0) {
        room.players.forEach(p => { 
            if (p.socketId !== narratorId) { gd.scores[p.socketId] += 2; gd.roundScores[p.socketId] += 2; }
        });
    } else {
        gd.scores[narratorId] += 3; gd.roundScores[narratorId] += 3;
        Object.entries(gd.votes).forEach(([voterId, cardId]) => { 
            if (cardId === narratorCard.id) { gd.scores[voterId] += 3; gd.roundScores[voterId] += 3; }
        });
    }
    Object.entries(gd.votes).forEach(([voterId, cardId]) => {
        if (cardId !== narratorCard.id) {
            const cardOwner = gd.tableCards.find(c => c.id === cardId)?.ownerId;
            if (cardOwner && cardOwner !== voterId && cardOwner !== narratorId) {
                gd.scores[cardOwner] += 1; gd.roundScores[cardOwner] += 1;
            }
        }
    });
}

function getPublicData(gd) {
    let publicTableCards = [];
    if (gd.phase === 'PLAYS') publicTableCards = gd.tableCards.map(c => ({ id: null, ownerId: c.ownerId, status: 'played' }));
    else if (gd.phase === 'VOTING') publicTableCards = gd.tableCards.map(c => ({ id: c.id, ownerId: null }));
    else publicTableCards = gd.tableCards;

    return {
        round: gd.round, phase: gd.phase, narratorId: gd.narratorId, clue: gd.clue, tableCards: publicTableCards,
        votes: (gd.phase === 'SCORING' || gd.phase === 'VICTORY') ? gd.votes : {},
        scores: gd.scores, roundScores: gd.roundScores, targetScore: gd.targetScore, votingDeadline: gd.votingDeadline
    };
}