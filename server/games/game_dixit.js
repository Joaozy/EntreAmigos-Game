const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

module.exports = (io, socket, RoomManager) => {

    // 1. NARRADOR ENVIA CARTA
    socket.on('dixit_narrate', async ({ roomId, cardId, phrase }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || room.state.phase !== 'STORY') return;
            if(socket.data.userId !== room.state.storytellerId) return;

            const userId = socket.data.userId;
            
            // Remove da mão (agora salva no state.hands)
            if (room.state.hands && room.state.hands[userId]) {
                room.state.hands[userId] = room.state.hands[userId].filter(c => c !== cardId);
            }
            
            room.state.storyCard = cardId;
            room.state.phrase = phrase;
            room.state.tableCards.push({ cardId, ownerId: userId });
            room.state.phase = 'SELECTION';

            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e) { console.error(e); }
    });

    // 2. OUTROS JOGADORES ESCOLHEM
    socket.on('dixit_select_card', async ({ roomId, cardId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || room.state.phase !== 'SELECTION') return;
            
            const userId = socket.data.userId;
            if(room.state.tableCards.some(tc => tc.ownerId === userId)) return;

            // Remove da mão
            if (room.state.hands && room.state.hands[userId]) {
                const hand = room.state.hands[userId];
                if (!hand.includes(cardId)) return;
                
                room.state.hands[userId] = hand.filter(c => c !== cardId);
                room.state.tableCards.push({ cardId, ownerId: userId });
            }

            // Verifica se todos jogaram
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

// --- LÓGICA ---

module.exports.initGame = (room, io) => {
    const deck = shuffle(Array.from({length: 216}, (_, i) => i + 1));
    const hands = {};

    // Distribui mãos e inicializa no STATE
    room.players.forEach(p => {
        hands[p.userId] = deck.splice(0, 6);
        p.score = 0;
    });

    room.state = {
        deck,
        hands, // <--- Agora as cartas ficam aqui!
        storytellerId: room.players[0].userId,
        storyCard: null,
        phrase: '',
        tableCards: [], 
        votes: {},
        phase: 'STORY',
        roundLog: []
    };

    console.log(`[DIXIT] Iniciado. Mãos distribuídas.`);
    return { phase: 'STORY'};
};

async function startNextRound(io, room) {
    // Reabastece mãos
    room.players.forEach(p => {
        const userId = p.userId;
        if (!room.state.hands[userId]) room.state.hands[userId] = [];
        
        while(room.state.hands[userId].length < 6 && room.state.deck.length > 0) {
            room.state.hands[userId].push(room.state.deck.pop());
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
        gd.roundLog.push("Todos ou Ninguém acertou! (+2 para outros)");
    } else {
        const narrator = room.players.find(p => p.userId === gd.storytellerId);
        if(narrator) narrator.score += 3;
        
        Object.entries(gd.votes).forEach(([voterId, cardId]) => {
            if (cardId === storyCard) {
                const p = room.players.find(pl => pl.userId === voterId);
                if(p) p.score += 3;
            }
        });
        gd.roundLog.push(`Narrador pontuou! (${correctVotes} acertos)`);
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

// --- CORREÇÃO PRINCIPAL NO GET PUBLIC DATA ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    if (!gd.tableCards) return { phase: 'LOBBY' };

    const isVoting = gd.phase === 'VOTING';
    const isScoring = gd.phase === 'SCORING';
    
    const publicTableCards = gd.tableCards.map(c => {
        if (isScoring) return c; 
        if (isVoting) return { cardId: c.cardId, ownerId: null }; 
        return { cardId: 'BACK', ownerId: c.ownerId }; 
    });

    // PEGA A MÃO DIRETO DO STATE
    const myHand = (userId && gd.hands) ? gd.hands[userId] : [];

    return {
        ...gd,
        deck: undefined, 
        hands: undefined, // Não envia a mão de todos
        tableCards: publicTableCards,
        myHand: myHand // Envia APENAS a minha mão
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        
        // CORREÇÃO: Descobre quem é o dono do socket olhando a lista da sala
        // (Isso corrige o problema de "s.data.userId" vir vazio)
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;

        const safePlayers = room.players.map(p => ({
            ...p,
            hand: undefined 
        }));

        // Usa o targetUserId descoberto acima
        const publicData = getPublicData(room.state, targetUserId);
        
        s.emit('joined_room', {
            roomId: room.id,
            players: safePlayers, 
            gameType: 'DIXIT',
            phase: room.state.phase,
            gameData: publicData
        });
    }
}
module.exports.getPublicData = getPublicData;