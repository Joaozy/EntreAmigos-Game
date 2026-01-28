const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

module.exports = (io, socket, RoomManager) => {

    // 1. NARRADOR ENVIA CARTA E FRASE
    socket.on('dixit_narrate', async ({ roomId, cardId, phrase }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || room.state.phase !== 'STORY') return;
            if(socket.data.userId !== room.state.storytellerId) return;

            // Remove carta da mão
            const p = room.players.find(pl => pl.userId === socket.data.userId);
            if(p && p.hand) p.hand = p.hand.filter(c => c !== cardId);
            
            room.state.storyCard = cardId;
            room.state.phrase = phrase;
            room.state.tableCards.push({ cardId, ownerId: socket.data.userId });
            room.state.phase = 'SELECTION';

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 2. OUTROS JOGADORES ESCOLHEM CARTA
    socket.on('dixit_select_card', async ({ roomId, cardId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || room.state.phase !== 'SELECTION') return;
            
            if(room.state.tableCards.some(tc => tc.ownerId === socket.data.userId)) return;

            const p = room.players.find(pl => pl.userId === socket.data.userId);
            if(!p || !p.hand.includes(cardId)) return;

            p.hand = p.hand.filter(c => c !== cardId);
            room.state.tableCards.push({ cardId, ownerId: socket.data.userId });

            if (room.state.tableCards.length === room.players.length) {
                room.state.phase = 'VOTING';
                room.state.tableCards = shuffle(room.state.tableCards);
            }

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 3. VOTAÇÃO
    socket.on('dixit_vote', async ({ roomId, cardId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || room.state.phase !== 'VOTING') return;
            
            if(socket.data.userId === room.state.storytellerId) return;
            
            const myCard = room.state.tableCards.find(c => c.ownerId === socket.data.userId);
            if(myCard && myCard.cardId === cardId) return;

            room.state.votes[socket.data.userId] = cardId;

            const votersCount = room.players.length - 1;
            if (Object.keys(room.state.votes).length >= votersCount) {
                calculateScores(room);
                room.state.phase = 'SCORING';
            }

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 4. PRÓXIMA RODADA
    socket.on('dixit_next', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(room && room.players.find(p=>p.userId === socket.data.userId)?.isHost) {
                await startNextRound(io, room);
            }
        } catch(e) { console.error(e); }
    });
};

// --- LOGICA ---

module.exports.initGame = (room, io) => {
    // Deck de 1 a 216 (assumindo que as imagens existem)
    const deck = shuffle(Array.from({length: 216}, (_, i) => i + 1));
    
    room.players.forEach(p => {
        p.hand = deck.splice(0, 6);
        p.score = 0;
    });

    room.state = {
        deck,
        storytellerId: room.players[0].userId,
        storyCard: null,
        phrase: '',
        tableCards: [], 
        votes: {},
        phase: 'STORY',
        roundLog: []
    };

    return { phase: 'STORY', gameData: getPublicData(room.state, null) };
};

async function startNextRound(io, room) {
    room.players.forEach(p => {
        while(p.hand.length < 6 && room.state.deck.length > 0) {
            p.hand.push(room.state.deck.pop());
        }
    });

    const currentIdx = room.players.findIndex(p => p.userId === room.state.storytellerId);
    const nextIdx = (currentIdx + 1) % room.players.length;
    
    room.state.storytellerId = room.players[nextIdx].userId;
    room.state.storyCard = null;
    room.state.phrase = '';
    room.state.tableCards = [];
    room.state.votes = {};
    room.state.phase = 'STORY';
    room.state.roundLog = [];

    await RoomManager.saveRoom(room);
    await broadcastUpdate(io, room);
}

function calculateScores(room) {
    const gd = room.state;
    const votes = Object.values(gd.votes);
    const storyCard = gd.storyCard;
    
    const correctVotes = votes.filter(v => v === storyCard).length;
    const totalVoters = room.players.length - 1;

    if (correctVotes === 0 || correctVotes === totalVoters) {
        room.players.forEach(p => {
            if (p.userId !== gd.storytellerId) p.score += 2;
        });
        gd.roundLog.push("Todos ou Ninguém acertou! Narrador: 0, Outros: +2");
    } else {
        const narrator = room.players.find(p => p.userId === gd.storytellerId);
        if(narrator) narrator.score += 3;
        
        Object.entries(gd.votes).forEach(([voterId, cardId]) => {
            if (cardId === storyCard) {
                const p = room.players.find(pl => pl.userId === voterId);
                if(p) p.score += 3;
            }
        });
        gd.roundLog.push(`Narrador pontua! (${correctVotes} acertos)`);
    }

    Object.entries(gd.votes).forEach(([voterId, cardId]) => {
        if (cardId !== storyCard) {
            const ownerEntry = gd.tableCards.find(c => c.cardId === cardId);
            if (ownerEntry && ownerEntry.ownerId !== gd.storytellerId) {
                const owner = room.players.find(p => p.userId === ownerEntry.ownerId);
                if(owner) owner.score += 1;
            }
        }
    });
}

// --- CORREÇÃO AQUI: PROTEÇÃO CONTRA ESTADO VAZIO ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    
    // Se o jogo não começou (Lobby), não tem tableCards ainda. Retorna vazio.
    if (!gd.tableCards) return { phase: 'LOBBY' };

    const isVoting = gd.phase === 'VOTING';
    const isScoring = gd.phase === 'SCORING';
    
    const publicTableCards = gd.tableCards.map(c => {
        if (isScoring) return c; 
        if (isVoting) return { cardId: c.cardId, ownerId: null }; 
        return { cardId: 'BACK', ownerId: c.ownerId }; 
    });

    return {
        ...gd,
        deck: undefined, 
        tableCards: publicTableCards,
        myHand: null
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        const myPlayer = room.players.find(p => p.userId === s.data.userId);
        const myHand = myPlayer ? myPlayer.hand : [];
        
        const safePlayers = room.players.map(p => ({
            ...p,
            hand: undefined 
        }));

        const publicData = getPublicData(room.state, s.data.userId);
        
        s.emit('joined_room', {
            roomId: room.id,
            players: safePlayers, 
            gameType: 'DIXIT',
            phase: room.state.phase,
            gameData: { ...publicData, myHand } 
        });
    }
}

module.exports.getPublicData = getPublicData;