const { shuffle } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');

let QUESTIONS = [];
try {
    const dataPath = path.join(__dirname, '../data/themes_megaquiz.json');
    if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const json = JSON.parse(raw);
        QUESTIONS = Array.isArray(json) ? json : (json.questions || []);
    }
} catch (e) {}

if (QUESTIONS.length === 0) {
    QUESTIONS = [{ question: "Teste?", options: ["A", "B"], answer: 0 }];
}

module.exports = (io, socket, rooms) => {
    socket.on('megaquiz_answer', ({ roomId, answerIdx }) => {
        const room = rooms[roomId];
        if (!room || room.state.phase !== 'QUESTION') return;
        
        room.state.answers[socket.id] = answerIdx;
        const active = room.players.filter(p => room.state.mode === 'SURVIVAL' ? p.lives > 0 : p.score > 0);
        const count = active.filter(p => room.state.answers[p.socketId] !== undefined).length;
        
        if (count >= active.length) resolveRound(io, room, roomId);
    });

    socket.on('request_restart', ({ roomId }) => {
        const room = rooms[roomId];
        if(room) {
            const nextState = module.exports.initGame(room, io);
            io.to(roomId).emit('game_started', { gameType: 'MEGAQUIZ', phase: nextState.phase, gameData: nextState.gameData });
        }
    });
};

module.exports.initGame = (room, io) => {
    const mode = room.players.length < 2 ? 'SURVIVAL' : 'BATTLE';
    room.players.forEach(p => {
        if (mode === 'SURVIVAL') { p.lives = 3; p.score = 0; } 
        else { p.score = 0; p.lives = null; }
    });

    room.state = {
        mode, deck: shuffle([...QUESTIONS]), round: 0, phase: 'PRE_ROUND',
        currentQuestion: null, answers: {}, timer: null, winner: null
    };

    if (io) setTimeout(() => startRound(io, room, room.id), 100);
    
    return { phase: 'PRE_ROUND', gameData: getPublicData(room.state) };
};

function startRound(io, room, roomId) {
    const gd = room.state;
    if (!gd) return;

    const alive = room.players.filter(p => gd.mode === 'SURVIVAL' ? p.lives > 0 : true);
    if (alive.length <= 1 && room.players.length > 1) { endGame(io, room, roomId, alive[0]); return; }
    if (gd.deck.length === 0) {
        const winner = room.players.sort((a,b) => b.score - a.score)[0];
        endGame(io, room, roomId, winner); return;
    }

    gd.round++;
    gd.answers = {};
    gd.currentQuestion = gd.deck.pop();
    gd.phase = 'PRE_ROUND';
    updateGame(io, room, roomId);

    setTimeout(() => {
        gd.phase = 'QUESTION';
        startQuestionTimer(io, room, roomId);
    }, 3000);
}

function startQuestionTimer(io, room, roomId) {
    const gd = room.state;
    updateGame(io, room, roomId);
    let timeLeft = 20;
    if(gd.timer) clearInterval(gd.timer);
    gd.timer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit('megaquiz_timer', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(gd.timer);
            resolveRound(io, room, roomId);
        }
    }, 1000);
}

function resolveRound(io, room, roomId) {
    const gd = room.state;
    if(gd.timer) clearInterval(gd.timer);
    const correct = gd.currentQuestion.answer;
    let logs = [];

    room.players.forEach(p => {
        const ans = gd.answers[p.socketId];
        if (gd.mode === 'SURVIVAL' && p.lives <= 0) return;
        
        if (ans === correct) {
            p.score += 100;
        } else {
            if (gd.mode === 'SURVIVAL') {
                p.lives--;
                if(p.lives === 0) logs.push(`${p.nickname} eliminado!`);
            } else {
                p.score = Math.max(0, p.score - 50);
            }
        }
    });

    gd.phase = 'RESULT';
    io.to(roomId).emit('megaquiz_round_end', { correctAnswer: correct, logs, players: room.players });
    updateGame(io, room, roomId);
    setTimeout(() => startRound(io, room, roomId), 5000);
}

function endGame(io, room, roomId, winner) {
    const gd = room.state;
    gd.phase = 'VICTORY';
    gd.winner = winner || room.players[0];
    io.to(roomId).emit('game_over', { winner: gd.winner, results: room.players, gameData: getPublicData(gd) });
}

function getPublicData(gd) {
    const q = gd.currentQuestion ? { ...gd.currentQuestion, answer: undefined } : null;
    return { round: gd.round, phase: gd.phase, mode: gd.mode, currentQuestion: q, answers: gd.answers };
}

function updateGame(io, room, roomId) {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room.state), phase: room.state.phase });
    io.to(roomId).emit('update_players', room.players);
}