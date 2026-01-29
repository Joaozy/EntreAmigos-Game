const { shuffle } = require('../utils/helpers');
const RoomManager = require('../managers/RoomManager');

let WORDS = ["AGENTE", "ÁFRICA", "ALIEN", "ALPES", "ANJO", "ANTÁRTIDA", "MAÇÃ", "AZUL", "BANCO", "BATERIA", "BERLIM", "BOMBA", "BOTA", "BRAÇO", "CABO", "CAIXA", "CAMA", "CAMPO", "CAPITAL", "CELA", "CENTAURO", "CHUVA", "CÍRCULO", "CLUBE"];
try {
    const loaded = require('../data/words_codenames.json');
    if (Array.isArray(loaded)) WORDS = loaded;
} catch(e) {}

module.exports = (io, socket, RoomManager) => {
    
    const getUserId = (room) => {
        const player = room.players.find(p => p.socketId === socket.id);
        return player ? player.userId : socket.data.userId;
    };

    // 1. ENTRAR NO TIME
    socket.on('cn_join_team', async ({ roomId, team }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            const gd = room.state;
            const userId = getUserId(room);

            // Garante estrutura para 3 times
            if (!gd.teams.white) gd.teams.white = { spymaster: null, members: [] };

            // Remove de todos
            ['red', 'blue', 'white'].forEach(t => {
                gd.teams[t].members = gd.teams[t].members.filter(id => id !== userId);
                if(gd.teams[t].spymaster === userId) gd.teams[t].spymaster = null;
            });
            
            // Adiciona no novo
            if (gd.teams[team]) gd.teams[team].members.push(userId);
            
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
            const userId = getUserId(room);

            // Se já tem um, não deixa roubar (UI deve prevenir, mas backend garante)
            if (gd.teams[team].spymaster) return;

            // Se não está no time, entra
            if(!gd.teams[team].members.includes(userId)) {
                ['red', 'blue', 'white'].forEach(t => {
                    gd.teams[t].members = gd.teams[t].members.filter(id => id !== userId);
                });
                gd.teams[team].members.push(userId);
            }
            
            gd.teams[team].spymaster = userId;
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 2.5 DEIXAR DE SER SPYMASTER (NOVO)
    socket.on('cn_demote_spymaster', async ({ roomId, team }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if (!room) return;
            const gd = room.state;
            const userId = getUserId(room);

            if (gd.teams[team].spymaster === userId) {
                gd.teams[team].spymaster = null;
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
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

    // 4. DAR DICA
    socket.on('cn_give_hint', async ({ roomId, word, count }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room) return;
            const userId = getUserId(room);
            
            if (room.state.teams[room.state.turn].spymaster !== userId) return;
            
            room.state.hint = { word, count: parseInt(count)||1 }; 
            room.state.guessesCount = 0; 
            room.state.phase = 'GUESSING';
            
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        } catch(e){ console.error(e); }
    });

    // 5. CLICK CARD
    socket.on('cn_click_card', async ({ roomId, cardId }) => {
        try {
            const room = await RoomManager.getRoom(roomId);
            if(!room) return;
            const gd = room.state;
            const card = gd.grid[cardId]; 
            
            if (card.revealed) return; 
            card.revealed = true;
            
            const currentTeam = gd.turn;
            let turnEnds = false;

            if (card.type === 'assassin') { 
                // Quem clicou perdeu. O jogo acaba.
                // Em 3 times, seria complexo definir o vencedor, então quem clicou perde e o jogo acaba sem vencedor ou vence o próximo.
                // Simplificação: Fim de jogo, derrota de quem clicou.
                endGame(room, 'ASSASSIN'); 
            } else if (card.type === currentTeam) {
                gd.score[currentTeam]--;
                if (gd.score[currentTeam] === 0) { endGame(room, currentTeam); }
                else {
                    gd.guessesCount++;
                    // Turno acaba se esgotar palpites (Dica + 1)
                    if (gd.guessesCount > gd.hint.count) turnEnds = true;
                }
            } else {
                // Clicou na cor de outro time ou neutro
                if (gd.score[card.type] !== undefined) {
                    gd.score[card.type]--; // Ajuda o inimigo
                    if (gd.score[card.type] === 0) { endGame(room, card.type); }
                }
                turnEnds = true;
            }

            if (turnEnds && gd.phase !== 'GAME_OVER') {
                advanceTurn(gd);
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
                advanceTurn(room.state);
                await RoomManager.saveRoom(room);
                await broadcastUpdate(io, room);
            }
        } catch(e){ console.error(e); }
    });

    socket.on('restart_game', async ({ roomId }) => { 
        const room = await RoomManager.getRoom(roomId);
        if(room) {
            startGameLogic(room);
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        }
    });

    socket.on('cn_back_to_setup', async ({ roomId }) => {
        const room = await RoomManager.getRoom(roomId);
        if(room) {
            room.state.phase = 'SETUP';
            room.state.grid = [];
            room.state.score = { red: 0, blue: 0, white: 0 };
            await RoomManager.saveRoom(room);
            await broadcastUpdate(io, room);
        }
    });
};

// --- LOGICA INTERNA ---

function advanceTurn(gd) {
    const teams = ['red', 'blue'];
    if (gd.teams.white && gd.teams.white.members.length > 0) teams.push('white'); // Inclui branco se existir

    const currentIdx = teams.indexOf(gd.turn);
    const nextIdx = (currentIdx + 1) % teams.length;
    
    gd.turn = teams[nextIdx];
    gd.phase = 'HINT';
    gd.hint = null;
}

function startGameLogic(room) {
    // Verifica se o time branco tem jogadores
    const hasWhiteTeam = room.state.teams.white && room.state.teams.white.members.length > 0;
    
    let types;
    let scores;
    let startingTeam = Math.random() < 0.5 ? 'red' : 'blue';

    if (hasWhiteTeam) {
        // Lógica para 3 Times (8-8-8-1)
        // Redefine quem começa aleatoriamente entre 3
        const rand = Math.random();
        if (rand < 0.33) startingTeam = 'red';
        else if (rand < 0.66) startingTeam = 'blue';
        else startingTeam = 'white';

        types = [
            ...Array(8).fill('red'), 
            ...Array(8).fill('blue'), 
            ...Array(8).fill('white'),
            'assassin'
        ];
        scores = { red: 8, blue: 8, white: 8 };
    } else {
        // Lógica Padrão 2 Times
        const secondTeam = startingTeam === 'red' ? 'blue' : 'red';
        types = [
            ...Array(9).fill(startingTeam), 
            ...Array(8).fill(secondTeam), 
            'assassin', 
            ...Array(7).fill('neutral')
        ];
        scores = { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 };
    }

    const shuffledTypes = shuffle(types);
    const gameWords = shuffle([...WORDS]).slice(0, 25);
    
    room.state.grid = gameWords.map((word, i) => ({ id: i, word, type: shuffledTypes[i], revealed: false }));
    room.state.turn = startingTeam;
    room.state.phase = 'HINT'; 
    room.state.guessesCount = 0; 
    room.state.score = scores;
    room.state.winner = null;
}

function endGame(room, winner) {
    room.state.phase = 'GAME_OVER';
    room.state.winner = winner;
    if (room.state.grid) room.state.grid.forEach(c => c.revealed = true);
}

module.exports.initGame = (room) => {
    room.state = {
        teams: { 
            red: { spymaster: null, members: [] }, 
            blue: { spymaster: null, members: [] },
            white: { spymaster: null, members: [] } 
        },
        phase: 'SETUP',
        grid: [],
        score: { red: 0, blue: 0, white: 0 }
    };
    return { phase: 'SETUP' };
};

function getPublicData(gd, userId) {
    if (!gd) return {};
    if (gd.phase === 'SETUP') return gd;
    
    const teams = gd.teams || { red: {}, blue: {}, white: {} };
    const isRedSpy = teams.red?.spymaster === userId;
    const isBlueSpy = teams.blue?.spymaster === userId;
    const isWhiteSpy = teams.white?.spymaster === userId;
    const isGameOver = gd.phase === 'GAME_OVER';
    
    const canSeeAll = isRedSpy || isBlueSpy || isWhiteSpy || isGameOver;
    const safeGrid = gd.grid ? gd.grid.map(card => ({
        ...card,
        type: (canSeeAll || card.revealed) ? card.type : null 
    })) : [];
    return { ...gd, grid: safeGrid };
}

async function broadcastUpdate(io, room) {
    const sockets = await io.in(room.id).fetchSockets();
    for(const s of sockets) {
        const player = room.players.find(p => p.socketId === s.id);
        const targetUserId = player ? player.userId : s.data.userId;
        s.emit('joined_room', {
            roomId: room.id,
            players: room.players,
            gameType: 'CODENAMES',
            phase: room.state.phase,
            gameData: getPublicData(room.state, targetUserId)
        });
    }
}
module.exports.getPublicData = getPublicData;