const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let WORDS = ["AGENTE", "ÁFRICA", "ALIEN", "ALPES", "ANJO", "ANTÁRTIDA", "MAÇÃ", "AZUL", "BANCO", "BATERIA", "BERLIM", "BOMBA", "BOTA", "BRAÇO", "CABO", "CAIXA", "CAMA", "CAMPO", "CAPITAL", "CELA", "CENTAURO", "CHUVA", "CÍRCULO", "CLUBE"];
try {
    const loaded = require('../data/words_codenames.json');
    if (Array.isArray(loaded)) WORDS = loaded;
} catch(e) {}

module.exports = (io, socket, RoomManager) => {
    
    // 1. ENTRAR NO TIME
    socket.on('cn_join_team', async ({ roomId, team }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            const gd = room.state;

            // Remove de outros times
            gd.teams.red.members = gd.teams.red.members.filter(id => id !== socket.data.userId);
            gd.teams.blue.members = gd.teams.blue.members.filter(id => id !== socket.data.userId);
            
            // Remove status de Spymaster se tiver
            if(gd.teams.red.spymaster === socket.data.userId) gd.teams.red.spymaster = null;
            if(gd.teams.blue.spymaster === socket.data.userId) gd.teams.blue.spymaster = null;
            
            // Adiciona no novo
            gd.teams[team].members.push(socket.data.userId);
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 2. VIRAR SPYMASTER
    socket.on('cn_become_spymaster', async ({ roomId, team }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            const gd = room.state;

            // Se não estiver no time, entra
            if(!gd.teams[team].members.includes(socket.data.userId)) {
                gd.teams.red.members = gd.teams.red.members.filter(id => id !== socket.data.userId);
                gd.teams.blue.members = gd.teams.blue.members.filter(id => id !== socket.data.userId);
                gd.teams[team].members.push(socket.data.userId);
            }
            
            gd.teams[team].spymaster = socket.data.userId;
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 3. INICIAR PARTIDA
    socket.on('cn_start_match', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room) return;
            
            startGameLogic(room);
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 4. DAR DICA (Spymaster)
    socket.on('cn_give_hint', async ({ roomId, word, count }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room) return;
            const gd = room.state;
            
            // Validação de segurança
            if (gd.teams[gd.turn].spymaster !== socket.data.userId) return;
            
            gd.hint = { word, count: parseInt(count)||1 }; 
            gd.guessesCount = 0; 
            gd.phase = 'GUESSING';
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 5. CLICAR NA CARTA (Operadores)
    socket.on('cn_click_card', async ({ roomId, cardId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room) return;
            const gd = room.state;
            const card = gd.grid[cardId]; 
            
            if (card.revealed) return; 
            card.revealed = true;
            
            const currentTeam = gd.turn;
            const enemyTeam = currentTeam === 'red' ? 'blue' : 'red';
            let turnEnds = false;

            // Lógica de Jogo
            if (card.type === 'assassin') { 
                endGame(room, enemyTeam); 
            } else if (card.type === currentTeam) {
                gd.score[currentTeam]--;
                if (gd.score[currentTeam] === 0) { endGame(room, currentTeam); }
                else {
                    gd.guessesCount++;
                    // Turno acaba se errar ou se esgotar palpites (Dica + 1)
                    if (gd.guessesCount > gd.hint.count) turnEnds = true;
                }
            } else {
                if (card.type === enemyTeam) {
                    gd.score[enemyTeam]--;
                    if (gd.score[enemyTeam] === 0) { endGame(room, enemyTeam); }
                }
                turnEnds = true;
            }

            if (turnEnds && gd.phase !== 'GAME_OVER') {
                gd.turn = enemyTeam;
                gd.phase = 'HINT';
                gd.hint = null;
            }
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 6. PASSAR A VEZ
    socket.on('cn_pass_turn', async ({ roomId }) => {
        try {
            const room = await RoomManager.getRoom(roomId); 
            if(room) { 
                const enemy = room.state.turn === 'red' ? 'blue' : 'red';
                room.state.turn = enemy;
                room.state.phase = 'HINT';
                room.state.hint = null;
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e){ console.error(e); }
    });
    
    // 7. REINICIAR
    socket.on('restart_game', async ({ roomId }) => { // Evento padronizado
        const room = await RoomManager.getRoom(roomId);
        if(room) {
            // Mantém os times, reinicia o tabuleiro
            startGameLogic(room);
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        }
    });
};

// --- LOGICA INTERNA ---

function startGameLogic(room) {
    const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
    const secondTeam = startingTeam === 'red' ? 'blue' : 'red';
    
    // 9 para quem começa, 8 para o outro, 1 assassino, 7 neutros = 25
    const types = [
        ...Array(9).fill(startingTeam), 
        ...Array(8).fill(secondTeam), 
        'assassin', 
        ...Array(7).fill('neutral')
    ];
    const shuffledTypes = shuffle(types);
    const gameWords = shuffle([...WORDS]).slice(0, 25);
    
    room.state.grid = gameWords.map((word, i) => ({ 
        id: i, 
        word, 
        type: shuffledTypes[i], 
        revealed: false 
    }));
    
    room.state.turn = startingTeam;
    room.state.phase = 'HINT'; 
    room.state.guessesCount = 0; 
    room.state.score = { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 };
    room.state.winner = null;
}

function endGame(room, winner) {
    room.state.phase = 'GAME_OVER';
    room.state.winner = winner;
    // Revela tudo no final
    room.state.grid.forEach(c => c.revealed = true);
}

module.exports.initGame = (room) => {
    room.state = {
        teams: { red: { spymaster: null, members: [] }, blue: { spymaster: null, members: [] } },
        phase: 'SETUP',
        grid: [],
        score: { red: 0, blue: 0 }
    };
    return { phase: 'SETUP', gameData: getPublicData(room.state, null) };
};

// --- SEGURANÇA (FILTRO DE DADOS) ---
function getPublicData(gd, userId) {
    if (!gd) return {};
    if (gd.phase === 'SETUP') return gd; // No setup pode ver tudo (não tem cartas ainda)

    const isRedSpy = gd.teams.red.spymaster === userId;
    const isBlueSpy = gd.teams.blue.spymaster === userId;
    const isGameOver = gd.phase === 'GAME_OVER';
    
    // Se for Spymaster ou Fim de Jogo, vê todas as cores.
    // Se for Operador, vê apenas as reveladas.
    const canSeeAll = isRedSpy || isBlueSpy || isGameOver;

    const safeGrid = gd.grid ? gd.grid.map(card => ({
        ...card,
        type: (canSeeAll || card.revealed) ? card.type : null // Esconde a cor se não puder ver
    })) : [];

    return {
        ...gd,
        grid: safeGrid
    };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'CODENAMES',
            phase: room.state.phase,
            gameData: getPublicData(room.state, s.data.userId)
        });
    }
}

module.exports.getPublicData = getPublicData;