const { shuffle } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');

// --- CARREGAMENTO SEGURO DE DADOS ---
let QUESTIONS = [];

function loadQuestions() {
    try {
        // Usa path.join para garantir que ache a pasta data independente de onde o node rodou
        const dataPath = path.join(__dirname, '../data/themes_megaquiz.json');
        
        if (fs.existsSync(dataPath)) {
            const rawData = fs.readFileSync(dataPath, 'utf-8');
            const loaded = JSON.parse(rawData);

            if (Array.isArray(loaded) && loaded.length > 0) {
                QUESTIONS = loaded.map(q => ({
                    question: q.q || q.question || q.pergunta || "Texto Indisponível",
                    options: q.options || q.opcoes || ["Erro A", "Erro B", "Erro C", "Erro D"],
                    answer: (q.correct !== undefined) ? q.correct : 0,
                    theme: q.theme || "Geral"
                }));
                console.log(`[MEGAQUIZ] ${QUESTIONS.length} perguntas carregadas.`);
            } else if (loaded.questions) {
                 QUESTIONS = loaded.questions;
            }
        } else {
            console.error("[MEGAQUIZ] Arquivo não encontrado:", dataPath);
        }
    } catch (e) {
        console.error("[MEGAQUIZ] Erro ao carregar JSON:", e.message);
    }

    // Fallback de Emergência (Se falhar tudo, usa estas perguntas para não travar)
    if (QUESTIONS.length === 0) {
        QUESTIONS = [
            { question: "Onde fica a Torre Eiffel?", options: ["Londres", "Paris", "Berlim", "Roma"], answer: 1, theme: "Teste" },
            { question: "Quanto é 5 + 5?", options: ["10", "20", "30", "40"], answer: 0, theme: "Teste" }
        ];
    }
}

// Carrega as perguntas ao iniciar o servidor
loadQuestions();

const STARTING_POINTS_BATTLE = 1000;

const startMegaQuiz = (io, room, roomId) => {
    // Recarrega caso tenha mudado ou esteja vazio
    if (QUESTIONS.length <= 2) loadQuestions();

    let deck = shuffle([...QUESTIONS]);
    const mode = room.players.length < 3 ? 'SURVIVAL' : 'BATTLE';

    room.players.forEach(p => {
        if (mode === 'SURVIVAL') {
            p.score = 0;      
            p.lives = 3;      
            p.isDead = false;
        } else {
            p.score = STARTING_POINTS_BATTLE; 
            p.bet = 0;
            p.lives = null; 
        }
        p.lastAnswer = null; 
    });

    room.gameData = {
        mode: mode, 
        deck: deck,
        round: 1, 
        phase: 'PRE_ROUND', 
        currentQuestion: null,
        answers: {}, 
        timer: null
    };
    
    room.phase = 'GAME';

    io.to(roomId).emit('game_started', { 
        gameType: 'MEGAQUIZ', 
        phase: 'PRE_ROUND', 
        gameData: getPublicData(room), 
        players: room.players 
    });

    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd || !gd.deck || room.phase !== 'GAME') return;

    // --- LÓGICA DE FIM DE JOGO ---
    if (gd.mode === 'SURVIVAL') {
        const activePlayers = room.players.filter(p => p.lives > 0);
        const survivorLimit = room.players.length > 1 ? 1 : 0;

        if (activePlayers.length <= survivorLimit) {
            endGame(io, room, roomId);
            return;
        }
    } else {
        const alivePlayers = room.players.filter(p => p.score > 0);
        if ((gd.round >= 15 && alivePlayers.length <= 1) || alivePlayers.length === 0) {
            endGame(io, room, roomId); return; 
        }
    }

    // Reset da rodada
    gd.answers = {};
    gd.firstAnswer = null;
    gd.attackData = null;
    room.players.forEach(p => p.bet = 0);

    // Reciclagem do Deck
    if (gd.deck.length === 0) gd.deck = shuffle([...QUESTIONS]);
    gd.currentQuestion = gd.deck.pop();

    // Fase de Aposta (Battle)
    if (gd.mode === 'BATTLE' && gd.round === 12) {
        gd.phase = 'BETTING';
        updateGame(io, room, roomId);
        
        let timeLeft = 15;
        gd.timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) { 
                clearInterval(gd.timer); 
                gd.phase = 'QUESTION'; 
                startQuestionTimer(io, room, roomId); 
            } 
            else { io.to(roomId).emit('megaquiz_timer', timeLeft); }
        }, 1000);
        return;
    }

    gd.phase = 'PRE_ROUND'; 
    updateGame(io, room, roomId);
    
    setTimeout(() => {
        if (room.phase === 'GAME' && room.gameData) {
            gd.phase = 'QUESTION';
            startQuestionTimer(io, room, roomId);
        }
    }, 3000);
};

const endGame = (io, room, roomId) => {
    const winner = [...room.players].sort((a,b) => {
        if (room.gameData.mode === 'SURVIVAL') {
            if (b.lives !== a.lives) return b.lives - a.lives;
            return b.score - a.score;
        }
        return b.score - a.score;
    })[0];

    io.to(roomId).emit('game_over', { 
        winner: winner, 
        results: room.players,
        phase: 'VICTORY',
        gameData: getPublicData(room)
    });
};

const startQuestionTimer = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd) return;
    if (gd.timer) clearInterval(gd.timer);

    gd.questionStartTime = Date.now();
    let duration = 20;

    updateGame(io, room, roomId); 

    gd.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gd.questionStartTime) / 1000);
        const timeLeft = duration - elapsed;

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
    if (gd && gd.timer) clearInterval(gd.timer);
    if (!gd || !gd.currentQuestion) return;

    const correctAnswerIdx = gd.currentQuestion.answer;
    let roundLog = []; 

    if (gd.mode === 'SURVIVAL') {
        room.players.forEach(p => {
            if (p.lives > 0) {
                const ans = gd.answers[p.id];
                if (ans === correctAnswerIdx) p.score += 100;
                else { 
                    p.lives--; 
                    if(p.lives===0) roundLog.push(`💀 ${p.nickname} foi eliminado!`); 
                }
            }
        });
    } else {
         let correctCount = 0;
         room.players.forEach(p => {
             if (gd.answers[p.id] === correctAnswerIdx) {
                 p.score += 100; correctCount++;
             } else if (gd.answers[p.id] !== undefined) {
                 p.score = Math.max(0, p.score - 50);
             }
         });
         if(correctCount === 0) roundLog.push("Ninguém acertou!");
    }

    finalizeRound(io, room, roomId, roundLog);
};

const finalizeRound = (io, room, roomId, logs) => {
    const gd = room.gameData;
    gd.phase = 'RESULT';
    io.to(roomId).emit('megaquiz_round_end', { correctAnswer: gd.currentQuestion.answer, logs, players: room.players });
    updateGame(io, room, roomId);
    
    setTimeout(() => {
        if (room.phase === 'GAME') {
            gd.round++; 
            startRound(io, room, roomId); 
        }
    }, 4000); 
};

const getPublicData = (room) => {
    const gd = room.gameData;
    if (!gd) return {};
    const safeQuestion = gd.currentQuestion ? { ...gd.currentQuestion, answer: undefined } : null;
    return {
        round: gd.round,
        phase: gd.phase,
        mode: gd.mode,
        currentQuestion: safeQuestion,
        attackData: gd.attackData
    };
};

const updateGame = (io, room, roomId) => {
    io.to(roomId).emit('update_game_data', { gameData: getPublicData(room), phase: room.gameData.phase });
    io.to(roomId).emit('update_players', room.players);
};

const registerMegaQuizHandlers = (io, socket, rooms) => {
    socket.on('megaquiz_answer', ({ roomId, answerIdx }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameData || room.gameData.phase !== 'QUESTION') return;
        
        const gd = room.gameData;
        if (gd.answers[socket.id] !== undefined) return;
        gd.answers[socket.id] = answerIdx;
        
        const activePlayers = room.players.filter(p => gd.mode === 'SURVIVAL' ? p.lives > 0 : p.score > 0);
        const answeredCount = activePlayers.filter(p => gd.answers[p.id] !== undefined).length;
        
        if (answeredCount >= activePlayers.length) {
            resolveRound(io, room, roomId);
        }
    });
    
    socket.on('megaquiz_bet', ({ roomId, amount }) => {
        const room = rooms.get(roomId);
        if(room) { const p = room.players.find(x => x.id === socket.id); if(p) p.bet = parseInt(amount); }
    });
};

const handleRejoin = (io, socket, room, oldId, newId) => {
    // Nada a fazer de especial no MegaQuiz, os dados são públicos no gameData
    return false;
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers, handleRejoin };