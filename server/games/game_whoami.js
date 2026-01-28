const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let CHARACTERS = ["Batman", "Monalisa", "Einstein", "Bob Esponja", "Harry Potter", "Goku", "Sherlock Holmes", "Cleópatra"];
try {
    const loaded = require('../data/themes_whoami.json');
    if(Array.isArray(loaded) && loaded.length > 0) CHARACTERS = loaded;
} catch(e){}

module.exports = (io, socket, RoomManager) => {
    
    // 1. FAZER PERGUNTA
    socket.on('whoami_ask', async ({ roomId, question }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || !room.state || room.state.phase !== 'PLAYING') return;

            if (room.state.currentTurnId !== socket.data.userId) return;

            room.state.currentQuestion = question;
            room.state.phase = 'VOTING';
            room.state.votes = {};
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 2. VOTAR (SIM/NÃO)
    socket.on('whoami_vote', async ({ roomId, vote }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || !room.state || room.state.phase !== 'VOTING') return;

            // Quem perguntou não vota
            if (socket.data.userId === room.state.currentTurnId) return;

            room.state.votes[socket.data.userId] = vote;
            
            // Verifica se todos votaram (Total de jogadores - 1)
            const votersCount = room.players.length - 1;
            
            if (Object.keys(room.state.votes).length >= votersCount) {
                room.state.phase = 'RESULT';
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);

                // Delay para voltar ao jogo
                setTimeout(async () => {
                    const r = await RoomManager.getRoom(roomId);
                    if(r) {
                        nextTurn(r);
                        await RoomManager.saveRoom(r);
                        await broadcastUpdate(io, r);
                    }
                }, 5000);
            } else {
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e) { console.error(e); }
    });

    // 3. TENTAR ADIVINHAR
    socket.on('whoami_guess', async ({ roomId, guess }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room || !room.state) return;
            
            if (socket.data.userId !== room.state.currentTurnId) return;
            
            const userId = socket.data.userId;
            const character = room.state.assignments[userId];
            const player = room.players.find(p => p.userId === userId);

            if (guess.toLowerCase().trim() === character.toLowerCase().trim()) {
                if (player) player.isGuessed = true; // Marca vitória pública
                io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player?.nickname} acertou! Era ${character}.` });
            } else {
                io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🚫 ${player?.nickname} errou! (Chutou ${guess})` });
            }
            
            nextTurn(room);
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);

        } catch(e) { console.error(e); }
    });

    // 4. DICAS
    socket.on('whoami_request_hint', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if(!room) return;
        room.state.phase = 'HINT_MODE';
        await RoomManager.saveRoom(room);
        await broadcastUpdate(io, room);
    });

    socket.on('whoami_send_hint', async ({ roomId, hint }) => {
        const room = await RoomManager.getRoom(roomId);
        if(!room) return;
        
        room.state.phase = 'PLAYING';
        io.to(roomId).emit('receive_message', { nickname: 'DICA', text: `💡 ${hint}` });
        
        // Consome a dica do jogador atual
        const p = room.players.find(p => p.userId === room.state.currentTurnId);
        if(p) p.hasHintAvailable = false;
        
        await RoomManager.saveRoom(room);
        await broadcastUpdate(io, room);
    });
};

// --- HELPERS ---

module.exports.initGame = (room, io) => {
    const deck = shuffle([...CHARACTERS]);
    const assignments = {};

    room.players.forEach(p => { 
        assignments[p.userId] = deck.pop() || "Curinga"; 
        p.isGuessed = false; 
        p.hasHintAvailable = true; 
    });

    room.state = { 
        assignments, 
        currentTurnId: room.players[0].userId, 
        totalQuestions: 0, 
        currentQuestion: null, 
        votes: {}, 
        phase: 'PLAYING'
    };

    return { phase: 'PLAYING', gameData: getPublicData(room.state, null) };
};

function nextTurn(room) {
    room.state.phase = 'PLAYING'; 
    room.state.currentQuestion = null; 
    room.state.votes = {};
    
    let currentIdx = room.players.findIndex(p => p.userId === room.state.currentTurnId);
    let attempts = 0;
    
    // Passa a vez (pula quem já ganhou)
    do { 
        currentIdx = (currentIdx + 1) % room.players.length; 
        attempts++; 
    } while (room.players[currentIdx].isGuessed && attempts < room.players.length);
    
    room.state.currentTurnId = room.players[currentIdx].userId;
    room.state.totalQuestions++;
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'WHOAMI',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

function getPublicData(gd, userId) {
    if(!gd || !gd.assignments) return {};

    const playersData = Object.keys(gd.assignments).map(pId => {
        const character = gd.assignments[pId];
        // SEGREDO: Se sou eu, vejo "???", senão vejo o nome.
        const isMe = pId === userId;
        return {
            userId: pId,
            character: isMe ? "???" : character
        };
    });

    return {
        ...gd,
        playersData,
        assignments: undefined // Remove o objeto completo pra não vazar
    };
}

module.exports.getPublicData = getPublicData;