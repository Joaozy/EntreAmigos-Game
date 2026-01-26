const { shuffle } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');

// --- CARREGAMENTO DE DADOS ---
let QUESTIONS = [];

try {
    const dataPath = path.join(__dirname, '../data/themes_megaquiz.json');
    if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const json = JSON.parse(raw);
        QUESTIONS = Array.isArray(json) ? json : (json.questions || []);
    }
} catch (e) {
    console.error("[MEGAQUIZ] Erro ao carregar JSON:", e.message);
}

// FALLBACK (EMERGÊNCIA)
if (QUESTIONS.length === 0) {
    QUESTIONS = [
        { question: "Qual a capital do Brasil?", options: ["RJ", "SP", "Brasília", "Salvador"], answer: 2, theme: "Geo" },
        { question: "Quanto é 5 + 5?", options: ["10", "20", "55", "0"], answer: 0, theme: "Mat" },
        { question: "Cor do céu?", options: ["Verde", "Azul", "Roxo", "Preto"], answer: 1, theme: "Geral" },
        { question: "Animal que late?", options: ["Gato", "Cachorro", "Pato", "Vaca"], answer: 1, theme: "Bio" },
        { question: "Melhor jogo?", options: ["EntreAmigos", "Outro", "Nada", "Xadrez"], answer: 0, theme: "Meta" }
    ];
}

const startMegaQuiz = (io, room, roomId) => {
    let deck = shuffle([...QUESTIONS]);
    const mode = room.players.length < 3 ? 'SURVIVAL' : 'BATTLE';

    room.players.forEach(p => {
        if (mode === 'SURVIVAL') { p.score = 0; p.lives = 3; } 
        else { p.score = 1000; p.lives = null; p.bet = 0; }
    });

    room.gameData = {
        mode, deck, round: 1, phase: 'PRE_ROUND', 
        currentQuestion: null, answers: {}, timer: null
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', { 
        gameType: 'MEGAQUIZ', phase: 'PRE_ROUND', 
        gameData: getPublicData(room), players: room.players 
    });

    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd) return;

    // Fim de Jogo?
    if (gd.mode === 'SURVIVAL') {
        const survivors = room.players.filter(p => p.lives > 0);
        const limit = room.players.length > 1 ? 1 : 0;
        if (survivors.length <= limit) { endGame(io, room, roomId); return; }
    } else {
        const alive = room.players.filter(p => p.score > 0);
        if (alive.length <= 1 || gd.round > 15) { endGame(io, room, roomId); return; }
    }

    gd.answers = {};
    if (gd.deck.length === 0) gd.deck = shuffle([...QUESTIONS]);
    gd.currentQuestion = gd.deck.pop();

    gd.phase = 'PRE_ROUND';
    updateGame(io, room, roomId);

    setTimeout(() => {
        gd.phase = 'QUESTION';
        startQuestionTimer(io, room, roomId);
    }, 3000);
};

const startQuestionTimer = (io, room, roomId) => {
    const gd = room.gameData;
    if(gd.timer) clearInterval(gd.timer);
    updateGame(io, room, roomId); 
    
    let timeLeft = 20;
    gd.timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(gd.timer);
            resolveRound(io, room, roomId);
        } else {
            io.to(roomId).emit('megaquiz_timer', timeLeft);
        }
    }, 1000);
};

const resolveRound = (io, room, roomId) => {
    const gd = room.gameData;
    if(gd.timer) clearInterval(gd.timer);
    
    const correct = gd.currentQuestion.answer;
    let logs = [];

    room.players.forEach(p => {
        const ans = gd.answers[p.id];
        const isAlive = gd.mode === 'SURVIVAL' ? p.lives > 0 : p.score > 0;
        
        if (isAlive) {
            if (ans === correct) {
                p.score += 100;
            } else {
                if (gd.mode === 'SURVIVAL') {
                    p.lives--;
                    if(p.lives===0) logs.push(`${p.nickname} eliminado!`);
                } else {
                    p.score -= 50;
                }
            }
        }
    });

    gd.phase = 'RESULT';
    io.to(roomId).emit('megaquiz_round_end', { correctAnswer: correct, logs, players: room.players });
    updateGame(io, room, roomId);

    setTimeout(() => {
        gd.round++;
        startRound(io, room, roomId);
    }, 4000);
};

const endGame = (io, room, roomId) => {
    const winner = [...room.players].sort((a,b) => b.score - a.score)[0];
    io.to(roomId).emit('game_over', { winner, results: room.players, phase: 'VICTORY', gameData: getPublicData(room) });
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if(!gd) return {};
    const q = gd.currentQuestion ? {...gd.currentQuestion, answer: undefined} : null;
    return { round: gd.round, phase: gd.phase, mode: gd.mode, currentQuestion: q };
};

const updateGame = (io, room, roomId) => {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: room.gameData.phase });
    io.to(roomId).emit('update_players', room.players);
};

const registerMegaQuizHandlers = (io, socket, rooms) => {
    socket.on('megaquiz_answer', ({ roomId, answerIdx }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameData.phase !== 'QUESTION') return;
        
        room.gameData.answers[socket.id] = answerIdx;
        
        const active = room.players.filter(p => room.gameData.mode === 'SURVIVAL' ? p.lives > 0 : p.score > 0);
        const count = active.filter(p => room.gameData.answers[p.id] !== undefined).length;
        
        if (count >= active.length) resolveRound(io, room, roomId);
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    const gd = room.gameData;
    if (gd && gd.answers && gd.answers[oldId] !== undefined) {
        gd.answers[newId] = gd.answers[oldId];
        delete gd.answers[oldId];
    }
    return false;
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers, handleRejoin };