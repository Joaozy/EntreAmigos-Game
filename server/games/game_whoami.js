const { shuffle } = require('../utils/helpers');
let CHARACTERS = ["Batman", "Monalisa", "Einstein"];
try {
    const loaded = require('../data/themes_whoami.json');
    if(Array.isArray(loaded)) CHARACTERS = loaded;
} catch(e){}

module.exports = (io, socket, rooms) => {
    socket.on('whoami_ask', ({ roomId, question }) => {
        const room = rooms[roomId]; if(!room || room.state.phase !== 'PLAYING') return; // CORRIGIDO
        if (room.state.currentTurnId !== socket.id) return;
        room.state.currentQuestion = question;
        room.state.phase = 'VOTING';
        room.state.votes = {};
        updateGame(io, room, roomId);
    });

    socket.on('whoami_vote', ({ roomId, vote }) => {
        const room = rooms[roomId]; if(!room || room.state.phase !== 'VOTING') return; // CORRIGIDO
        if (socket.id === room.state.currentTurnId) return;
        room.state.votes[socket.id] = vote;
        const votersCount = room.players.length - 1;
        if (Object.keys(room.state.votes).length >= votersCount) {
            room.state.phase = 'RESULT';
            updateGame(io, room, roomId);
            setTimeout(() => { nextTurn(room); updateGame(io, room, roomId); }, 5000);
        } else {
            updateGame(io, room, roomId);
        }
    });

    socket.on('whoami_guess', ({ roomId, guess }) => {
        const room = rooms[roomId]; if(!room) return; // CORRIGIDO
        if (socket.id !== room.state.currentTurnId) return;
        const player = room.players.find(p => p.socketId === socket.id);
        
        if (guess.toLowerCase().trim() === player.character.toLowerCase().trim()) {
            player.isGuessed = true;
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🎉 ${player.nickname} acertou!` });
        } else {
            io.to(roomId).emit('receive_message', { nickname: 'SISTEMA', text: `🚫 ${player.nickname} errou!` });
        }
        nextTurn(room);
        updateGame(io, room, roomId);
    });

    socket.on('whoami_request_hint', ({ roomId, targetId }) => {
        const room = rooms[roomId]; if(!room) return; // CORRIGIDO
        room.state.phase = 'HINT_MODE';
        room.state.hintTargetId = targetId;
        updateGame(io, room, roomId);
    });

    socket.on('whoami_send_hint', ({ roomId, hint }) => {
        const room = rooms[roomId]; if(!room) return; // CORRIGIDO
        room.state.phase = 'PLAYING';
        io.to(roomId).emit('receive_message', { nickname: 'DICA', text: `💡 ${hint}` });
        const p = room.players.find(p => p.socketId === room.state.currentTurnId);
        if(p) p.hasHintAvailable = false;
        updateGame(io, room, roomId);
    });
};

module.exports.initGame = (room) => {
    const deck = shuffle([...CHARACTERS]);
    room.players.forEach(p => { p.character = deck.pop() || "Curinga"; p.isGuessed = false; p.hasHintAvailable = true; });
    room.state = { currentTurnId: room.players[0].socketId, totalQuestions: 0, currentQuestion: null, votes: {}, phase: 'PLAYING', hintTargetId: null };
    return { phase: 'PLAYING', gameData: getPublicData(room, room.state) };
};

function nextTurn(room) {
    room.state.phase = 'PLAYING'; room.state.currentQuestion = null; room.state.votes = {};
    let currentIdx = room.players.findIndex(p => p.socketId === room.state.currentTurnId);
    let attempts = 0;
    do { currentIdx = (currentIdx + 1) % room.players.length; attempts++; } 
    while (room.players[currentIdx].isGuessed && attempts < room.players.length);
    room.state.currentTurnId = room.players[currentIdx].socketId;
    room.state.totalQuestions++;
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room, room.state), phase: room.state.phase });
}

function getPublicData(room, gd) {
    const playersData = room.players.map(p => ({
        id: p.socketId, nickname: p.nickname, isGuessed: p.isGuessed, hasHintAvailable: p.hasHintAvailable,
        character: p.isGuessed ? p.character : null 
    }));
    return { ...gd, playersData };
}