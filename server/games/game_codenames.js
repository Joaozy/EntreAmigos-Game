const { shuffle } = require('../utils/helpers');
let WORDS = ["AGENTE", "ÁFRICA", "ALIEN", "ALPES", "ANJO", "ANTÁRTIDA", "MAÇÃ", "AZUL", "BANCO", "BATERIA", "BERLIM", "BOMBA", "BOTA", "BRAÇO", "CABO", "CAIXA", "CAMA", "CAMPO", "CAPITAL", "CELA", "CENTAURO", "CHUVA", "CÍRCULO", "CLUBE"];
try {
    const loaded = require('../data/words_codenames.json');
    if (Array.isArray(loaded)) WORDS = loaded;
} catch(e) {}

module.exports = (io, socket, rooms) => {
    socket.on('cn_join_team', ({ roomId, team }) => {
        const room = rooms[roomId]; if (!room) return; // CORRIGIDO
        const gd = room.state;
        gd.teams.red.members = gd.teams.red.members.filter(id => id !== socket.id);
        gd.teams.blue.members = gd.teams.blue.members.filter(id => id !== socket.id);
        if(gd.teams.red.spymaster === socket.id) gd.teams.red.spymaster = null;
        if(gd.teams.blue.spymaster === socket.id) gd.teams.blue.spymaster = null;
        gd.teams[team].members.push(socket.id);
        io.to(roomId).emit('update_game_data', { gameData: gd, phase: 'SETUP' });
    });

    socket.on('cn_become_spymaster', ({ roomId, team }) => {
        const room = rooms[roomId]; if (!room) return; // CORRIGIDO
        const gd = room.state;
        if(!gd.teams[team].members.includes(socket.id)) {
            const other = team === 'red' ? 'blue' : 'red';
            gd.teams[other].members = gd.teams[other].members.filter(id => id !== socket.id);
            gd.teams[team].members.push(socket.id);
        }
        gd.teams[team].spymaster = socket.id;
        io.to(roomId).emit('update_game_data', { gameData: gd, phase: 'SETUP' });
    });

    socket.on('cn_start_match', ({ roomId }) => {
        const room = rooms[roomId]; 
        if(!room) return; // CORRIGIDO
        startGameLogic(room);
        io.to(roomId).emit('update_game_data', { gameData: room.state, phase: 'HINT' });
    });

    socket.on('cn_give_hint', ({ roomId, word, count }) => {
        const room = rooms[roomId]; if(!room) return;
        const gd = room.state;
        if (gd.teams[gd.turn].spymaster !== socket.id) return;
        gd.hint = { word, count: parseInt(count)||1 }; 
        gd.guessesCount = 0; 
        gd.phase = 'GUESSING';
        io.to(roomId).emit('update_game_data', { gameData: gd, phase: 'GUESSING' });
    });

    socket.on('cn_click_card', ({ roomId, cardId }) => {
        const room = rooms[roomId]; if(!room) return;
        const gd = room.state;
        const card = gd.grid[cardId]; 
        if (card.revealed) return; 
        card.revealed = true;
        
        const currentTeam = gd.turn;
        const enemyTeam = currentTeam === 'red' ? 'blue' : 'red';
        let turnEnds = false;

        if (card.type === 'assassin') { endGame(io, roomId, room, enemyTeam); return; } 
        else if (card.type === currentTeam) {
            gd.score[currentTeam]--;
            if (gd.score[currentTeam] === 0) { endGame(io, roomId, room, currentTeam); return; }
            gd.guessesCount++;
            if (gd.guessesCount > gd.hint.count) turnEnds = true;
        } else {
            if (card.type === enemyTeam) {
                gd.score[enemyTeam]--;
                if (gd.score[enemyTeam] === 0) { endGame(io, roomId, room, enemyTeam); return; }
            }
            turnEnds = true;
        }

        if (turnEnds) {
            gd.turn = enemyTeam;
            gd.phase = 'HINT';
            gd.hint = null;
        }
        io.to(roomId).emit('update_game_data', { gameData: gd, phase: gd.phase });
    });

    socket.on('cn_pass_turn', ({ roomId }) => {
        const room = rooms[roomId]; 
        if(room) { 
            const enemy = room.state.turn === 'red' ? 'blue' : 'red';
            room.state.turn = enemy;
            room.state.phase = 'HINT';
            room.state.hint = null;
            io.to(roomId).emit('update_game_data', { gameData: room.state, phase: 'HINT' }); 
        }
    });
};

function startGameLogic(room) {
    const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
    const secondTeam = startingTeam === 'red' ? 'blue' : 'red';
    const types = [...Array(9).fill(startingTeam), ...Array(8).fill(secondTeam), 'assassin', ...Array(7).fill('neutral')];
    const shuffledTypes = shuffle(types);
    const gameWords = shuffle([...WORDS]).slice(0, 25);
    
    room.state.grid = gameWords.map((word, i) => ({ id: i, word, type: shuffledTypes[i], revealed: false }));
    room.state.turn = startingTeam;
    room.state.phase = 'HINT'; 
    room.state.guessesCount = 0; 
    room.state.score = { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 };
}

function endGame(io, roomId, room, winner) {
    room.state.phase = 'GAME_OVER';
    room.state.winner = winner;
    room.state.grid.forEach(c => c.revealed = true);
    io.to(roomId).emit('update_game_data', { gameData: room.state, phase: 'GAME_OVER' });
}

module.exports.initGame = (room) => {
    room.state = {
        teams: { red: { spymaster: null, members: [] }, blue: { spymaster: null, members: [] } },
        phase: 'SETUP'
    };
    return { phase: 'SETUP' };
};