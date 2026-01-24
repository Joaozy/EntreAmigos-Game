const { shuffle } = require('../utils/helpers');

// ... (CARREGAMENTO DE QUESTÕES - MANTENHA O CÓDIGO DE LOAD EXISTENTE) ...
let QUESTIONS = []; 
// (Assumindo que você manteve o código de require JSON aqui)

// --- FUNÇÕES DE CONTROLE ---

const startMegaQuiz = (io, room, roomId) => {
    // 1. Prepara o Deck APENAS no servidor
    let deck = shuffle([...QUESTIONS]);
    const mode = room.players.length < 3 ? 'SURVIVAL' : 'BATTLE';

    room.players.forEach(p => {
        p.score = mode === 'SURVIVAL' ? 0 : 1000;
        p.lives = mode === 'SURVIVAL' ? 3 : null;
        p.lastAnswer = null;
    });

    room.gameData = {
        mode: mode,
        deck: deck, // Fica na memória do server, NÃO mandamos pro cliente
        round: 1,
        phase: 'PRE_ROUND',
        currentQuestion: null,
        answers: {},
        timer: null,
        endTime: null // NOVO: Para sync de tempo preciso
    };
    
    // NOTA: Não emitimos 'game_started' aqui, o server.js vai emitir 'prepare_game'
    // Apenas preparamos o estado e iniciamos o fluxo
    
    // Inicia a primeira rodada
    startRound(io, room, roomId);
};

const startRound = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd) return;

    // ... (Lógica de fim de jogo mantida) ...

    // Limpa estado da rodada
    gd.answers = {};
    
    // Pega pergunta
    if (gd.deck.length === 0) gd.deck = shuffle([...QUESTIONS]);
    gd.currentQuestion = gd.deck.pop();

    // Payload Otimizado para o Cliente (Apenas a pergunta atual)
    // O server.js usa getPublicData, então vamos garantir que o objeto room esteja atualizado
    
    gd.phase = 'PRE_ROUND';
    updateGame(io, room, roomId);

    // Delay para leitura
    setTimeout(() => {
        if (room.phase === 'GAME') {
            gd.phase = 'QUESTION';
            startQuestionTimer(io, room, roomId);
        }
    }, 3000);
};

const startQuestionTimer = (io, room, roomId) => {
    const gd = room.gameData;
    if (!gd) return;
    if (gd.timer) clearInterval(gd.timer);

    const DURATION_SEC = 20;
    // USE DATE.NOW() PARA PRECISÃO
    gd.endTime = Date.now() + (DURATION_SEC * 1000); 

    updateGame(io, room, roomId); // Cliente recebe o endTime e pode fazer contagem regressiva local também

    gd.timer = setInterval(() => {
        const now = Date.now();
        const timeLeft = Math.ceil((gd.endTime - now) / 1000);

        if (timeLeft <= 0) {
            clearInterval(gd.timer);
            resolveRound(io, room, roomId);
        } else {
            // Opcional: emitir a cada segundo apenas para sync, 
            // mas o cliente já pode calcular baseado no endTime
            // io.to(roomId).emit('megaquiz_timer', timeLeft); 
        }
    }, 1000);
};

// ... (Restante da lógica de resolveRound e endGame mantida) ...

// --- REGISTER HANDLERS ---
const registerMegaQuizHandlers = (io, socket, rooms) => {
    // ... (Mantido igual) ...
};

module.exports = { startMegaQuiz, registerMegaQuizHandlers };