const { shuffle } = require('../utils/helpers');
const WORDS_CODENAMES = require('../data/words_codenames.json');

const startCodenames = (io, room, roomId) => {
    room.gameData = {
        teams: { red: { spymaster: null, members: [] }, blue: { spymaster: null, members: [] } },
        grid: [], turn: null, score: { red: 0, blue: 0 }, hint: { word: '', count: 0 }, guessesCount: 0, winner: null, phase: 'SETUP'
    };
    room.phase = 'GAME'; 
    io.to(roomId).emit('game_started', { gameType: 'CODENAMES', phase: 'SETUP', gameData: room.gameData, players: room.players });
};

const handleCodenamesRejoin = (room, oldId, newId) => {
    let updated = false;
    const gd = room.gameData;
    if (!gd.teams) return false;
    ['red', 'blue'].forEach(color => {
        if (gd.teams[color].spymaster === oldId) { gd.teams[color].spymaster = newId; updated = true; }
        const idx = gd.teams[color].members.indexOf(oldId);
        if (idx !== -1) { gd.teams[color].members[idx] = newId; updated = true; }
    });
    return updated;
};

// ... MANTENHA AS FUNÇÕES INTERNAS (cnEndTurn, endCodenames) ...
// (Para economizar espaço, assuma que estão aqui iguais ao seu arquivo original)
const cnEndTurn = (room) => {
    room.gameData.turn = room.gameData.turn === 'red' ? 'blue' : 'red';
    room.gameData.phase = 'HINT';
    room.gameData.hint = { word: '', count: 0 };
    room.gameData.guessesCount = 0;
};
const endCodenames = (io, room, roomId, winnerTeam) => {
    room.gameData.phase = 'GAME_OVER';
    room.gameData.winner = winnerTeam;
    room.gameData.grid.forEach(c => c.revealed = true);
    io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'GAME_OVER' });
};

const registerCodenamesHandlers = (io, socket, rooms) => {
    // ... MANTENHA OS HANDLERS ORIGINAIS ...
    socket.on('cn_join_team', ({ roomId, team }) => {
        const room = rooms.get(roomId); if (!room) return;
        room.gameData.teams.red.members = room.gameData.teams.red.members.filter(id => id !== socket.id);
        room.gameData.teams.blue.members = room.gameData.teams.blue.members.filter(id => id !== socket.id);
        if(room.gameData.teams.red.spymaster === socket.id) room.gameData.teams.red.spymaster = null;
        if(room.gameData.teams.blue.spymaster === socket.id) room.gameData.teams.blue.spymaster = null;
        room.gameData.teams[team].members.push(socket.id);
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'SETUP' });
    });

    socket.on('cn_become_spymaster', ({ roomId, team }) => {
        const room = rooms.get(roomId); if (!room) return;
        if(!room.gameData.teams[team].members.includes(socket.id)) {
            const otherTeam = team === 'red' ? 'blue' : 'red';
            room.gameData.teams[otherTeam].members = room.gameData.teams[otherTeam].members.filter(id => id !== socket.id);
            room.gameData.teams[team].members.push(socket.id);
        }
        room.gameData.teams[team].spymaster = socket.id;
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'SETUP' });
    });

    socket.on('cn_start_match', ({ roomId }) => {
        const room = rooms.get(roomId); if(!room || room.host !== socket.id) return;
        const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
        const secondTeam = startingTeam === 'red' ? 'blue' : 'red';
        const cards = [];
        for(let i=0; i<9; i++) cards.push({ type: startingTeam, revealed: false });
        for(let i=0; i<8; i++) cards.push({ type: secondTeam, revealed: false });
        cards.push({ type: 'assassin', revealed: false });
        for(let i=0; i<7; i++) cards.push({ type: 'neutral', revealed: false });
        const shuffledCards = shuffle(cards);
        const gameWords = shuffle([...WORDS_CODENAMES]).slice(0, 25);
        const grid = gameWords.map((word, i) => ({ id: i, word: word, type: shuffledCards[i].type, revealed: false }));
        room.gameData.grid = grid; room.gameData.turn = startingTeam; room.gameData.phase = 'HINT'; 
        room.gameData.guessesCount = 0; room.gameData.score = { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 }; 
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'HINT' });
    });

    socket.on('cn_give_hint', ({ roomId, word, count }) => {
        const room = rooms.get(roomId); if(!room) return;
        const currentTeam = room.gameData.turn;
        if (room.gameData.teams[currentTeam].spymaster !== socket.id) return;
        let numericCount = parseInt(count, 10);
        if (isNaN(numericCount) || numericCount < 0) numericCount = 1;
        room.gameData.hint = { word, count: numericCount }; room.gameData.guessesCount = 0; room.gameData.phase = 'GUESSING';
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'GUESSING' });
    });

    socket.on('cn_click_card', ({ roomId, cardId }) => {
        const room = rooms.get(roomId); if(!room) return;
        const card = room.gameData.grid[cardId]; if (card.revealed) return; 
        card.revealed = true;
        const currentTeam = room.gameData.turn;
        const enemyTeam = currentTeam === 'red' ? 'blue' : 'red';
        let turnEnds = false;

        if (card.type === 'assassin') { endCodenames(io, room, roomId, enemyTeam); return; } 
        else if (card.type === currentTeam) {
            room.gameData.score[currentTeam]--;
            if (room.gameData.score[currentTeam] === 0) { endCodenames(io, room, roomId, currentTeam); return; }
            room.gameData.guessesCount = (room.gameData.guessesCount || 0) + 1;
            const maxGuesses = (room.gameData.hint.count || 0) + 1;
            if (room.gameData.guessesCount >= maxGuesses) turnEnds = true;
        } else if (card.type === 'neutral') { turnEnds = true; } 
        else if (card.type === enemyTeam) {
            room.gameData.score[enemyTeam]--;
            turnEnds = true;
            if (room.gameData.score[enemyTeam] === 0) { endCodenames(io, room, roomId, enemyTeam); return; }
        }
        if (turnEnds) cnEndTurn(room);
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.gameData.phase });
    });

    socket.on('cn_pass_turn', ({ roomId }) => {
        const room = rooms.get(roomId); if(room) { 
            cnEndTurn(room); 
            io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: room.gameData.phase }); 
        }
    });
};

module.exports = { startCodenames, registerCodenamesHandlers, handleCodenamesRejoin };