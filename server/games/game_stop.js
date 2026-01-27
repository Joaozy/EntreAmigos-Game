const { shuffle, normalize } = require('../utils/helpers');
let CATEGORIES = ["Nome", "CEP", "Cor", "Animal", "Fruta", "Marca", "Objeto", "Filme"];
try {
    const loaded = require('../data/categories_stop.json');
    if (Array.isArray(loaded)) CATEGORIES = loaded;
} catch (e) {}

module.exports = (io, socket, rooms) => {
    socket.on('stop_submit', ({ roomId, answers }) => {
        const room = rooms[roomId]; if(!room) return;
        room.state.answers[socket.id] = answers;
        if (room.state.stopCaller) {
             const submittedCount = Object.keys(room.state.answers).length;
             if (submittedCount >= room.players.length) startReviewPhase(io, room, roomId);
        }
    });

    socket.on('stop_call', ({ roomId, answers }) => {
        const room = rooms[roomId]; if(!room || room.state.stopCaller) return; 
        room.state.answers[socket.id] = answers;
        room.state.stopCaller = socket.id;
        if (room.state.timer) clearTimeout(room.state.timer);
        io.to(roomId).emit('stop_triggered', { callerId: socket.id, nickname: room.players.find(p=>p.socketId===socket.id)?.nickname });
        setTimeout(() => startReviewPhase(io, room, roomId), 5000); 
    });

    socket.on('stop_toggle_vote', ({ roomId, targetId, categoryIndex, voteType }) => {
        const room = rooms[roomId]; if(!room) return;
        const key = `${targetId}_${categoryIndex}`;
        if (!room.state.votes[key]) room.state.votes[key] = { invalid: [], duplicate: [] };
        const votesObj = room.state.votes[key];
        ['invalid', 'duplicate'].forEach(t => {
            if(votesObj[t].includes(socket.id)) votesObj[t] = votesObj[t].filter(id => id !== socket.id);
        });
        if (voteType !== 'none') votesObj[voteType].push(socket.id);
        updateGame(io, room, roomId);
    });

    socket.on('stop_next_round', ({ roomId }) => {
        const room = rooms[roomId]; if(!room) return;
        calculateScores(room);
        if (room.state.round >= 5) {
            endGame(io, room, roomId);
        } else {
            initRound(room, room.state.round + 1);
            io.to(roomId).emit('update_game_data', { gameData: room.state, phase: 'PLAYING' });
            startTimer(io, room, roomId);
        }
    });
};

module.exports.initGame = (room, io) => {
    room.state = { totalScores: {}, round: 0 };
    room.players.forEach(p => room.state.totalScores[p.socketId] = 0);
    initRound(room, 1);
    
    // Timer
    if (io) setTimeout(() => startTimer(io, room, room.id), 100);

    return { phase: 'PLAYING', gameData: room.state };
};

function initRound(room, roundNum) {
    const alphabet = "ABCDEFGHIJKLMNOPRSTUV"; 
    const letter = alphabet[Math.floor(Math.random() * alphabet.length)];
    const cats = shuffle([...CATEGORIES]).slice(0, 8);
    room.state = { ...room.state, round: roundNum, letter, categories: cats, answers: {}, votes: {}, stopCaller: null, phase: 'PLAYING', endTime: Date.now() + 180000 };
}

function startReviewPhase(io, room, roomId) {
    if (room.state.phase === 'REVIEW') return;
    room.state.phase = 'REVIEW';
    updateGame(io, room, roomId);
}

function calculateScores(room) {
    room.players.forEach(p => {
        let roundScore = 0;
        const playerAns = room.state.answers[p.socketId] || {};
        room.state.categories.forEach((cat, idx) => {
            const raw = playerAns[idx];
            if (!raw) return;
            const norm = normalize(raw);
            if (!norm || norm[0].toUpperCase() !== room.state.letter) return;

            const key = `${p.socketId}_${idx}`;
            const votes = room.state.votes[key] || { invalid: [], duplicate: [] };
            if (votes.invalid.length > room.players.length / 2) return; 
            
            let isDuplicate = votes.duplicate.length > room.players.length / 2;
            if(!isDuplicate) {
                room.players.forEach(op => {
                    if (op.socketId !== p.socketId) {
                        const otherNorm = normalize((room.state.answers[op.socketId] || {})[idx]);
                        if (otherNorm === norm) isDuplicate = true;
                    }
                });
            }
            roundScore += isDuplicate ? 5 : 10;
        });
        room.state.totalScores[p.socketId] = (room.state.totalScores[p.socketId] || 0) + roundScore;
    });
}

function endGame(io, room, roomId) {
    const gd = room.state;
    const sorted = Object.entries(gd.totalScores).sort((a,b) => b[1] - a[1]);
    const winner = room.players.find(p => p.socketId === sorted[0][0]);
    gd.phase = 'GAME_OVER'; gd.winner = winner;
    io.to(roomId).emit('game_over', { winner, gameData: gd, phase: 'GAME_OVER' });
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: room.state, phase: room.state.phase });
}

function startTimer(io, room, roomId) {
    if (room.state.timer) clearTimeout(room.state.timer);
    room.state.timer = setTimeout(() => {
        if (room.state.phase === 'PLAYING') {
            room.state.stopCaller = 'TIMEOUT'; 
            io.to(roomId).emit('stop_triggered', { callerId: 'TIMEOUT', nickname: "TEMPO ESGOTADO" });
            setTimeout(() => startReviewPhase(io, room, roomId), 3000);
        }
    }, 180000);
}