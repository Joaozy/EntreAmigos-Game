const { shuffle, normalize } = require('../utils/helpers');
const CATEGORIES_STOP = require('../data/categories_stop.json');

const startStop = (io, room, roomId) => {
    stopInitRound(io, room, roomId, 1);
    room.gameData.totalScores = {}; 
    room.gameData.round = 1;
    room.gameData.maxRounds = 5;
    room.phase = 'GAME';
    
    io.to(roomId).emit('game_started', { gameType: 'STOP', phase: 'PLAYING', gameData: room.gameData, players: room.players });
    startStopTimer(io, room, roomId);
};

const stopInitRound = (io, room, roomId, roundNum) => {
    const alphabet = "ABCDEFGHIJKLMNOPRSTUV"; 
    const letter = alphabet[Math.floor(Math.random() * alphabet.length)];
    const shuffledCats = shuffle([...CATEGORIES_STOP]).slice(0, 8);
    
    room.gameData.round = roundNum;
    room.gameData.letter = letter;
    room.gameData.categories = shuffledCats;
    room.gameData.answers = {};
    room.gameData.votes = {};
    room.gameData.stopCaller = null;
    room.gameData.phase = 'PLAYING';
    room.gameData.endTime = Date.now() + 120000;
};

const startStopTimer = (io, room, roomId) => {
    if (room.stopTimer) clearTimeout(room.stopTimer);
    
    room.stopTimer = setTimeout(() => {
        if (room.gameType === 'STOP' && room.gameData.phase === 'PLAYING') {
            console.log(`[STOP] Timeout na sala ${roomId}`);
            room.gameData.stopCaller = 'TIMEOUT'; 
            io.to(roomId).emit('stop_triggered', { callerId: 'TIMEOUT', nickname: "TEMPO ESGOTADO" });
            
            setTimeout(() => {
                room.gameData.phase = 'REVIEW';
                io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'REVIEW' });
            }, 3000);
        }
    }, 120000); 
};

const registerStopHandlers = (io, socket, rooms) => {
    socket.on('stop_submit', ({ roomId, answers }) => {
        const room = rooms.get(roomId); if(!room) return;
        room.gameData.answers[socket.id] = answers;
        if (room.gameData.stopCaller) {
             if (room.players.every(p => room.gameData.answers[p.id])) { 
                 room.gameData.phase = 'REVIEW'; 
                 io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'REVIEW' }); 
             }
        }
    });

    socket.on('stop_call', ({ roomId, answers }) => {
        const room = rooms.get(roomId); if(!room || room.gameData.stopCaller) return; 
        
        const filledCount = Object.values(answers || {}).filter(v => v && v.trim().length > 0).length;
        if (filledCount < 8) return; 

        room.gameData.answers[socket.id] = answers;
        room.gameData.stopCaller = socket.id;
        
        if (room.stopTimer) clearTimeout(room.stopTimer);
        
        io.to(roomId).emit('stop_triggered', { callerId: socket.id, nickname: room.players.find(p=>p.id===socket.id)?.nickname });
        
        setTimeout(() => { 
            if(room.phase === 'GAME' && room.gameData.phase === 'PLAYING') { 
                room.gameData.phase = 'REVIEW'; 
                io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'REVIEW' }); 
            } 
        }, 5000); 
    });

    socket.on('stop_toggle_vote', ({ roomId, targetId, categoryIndex, voteType }) => {
        const room = rooms.get(roomId); if(!room) return;
        const key = `${targetId}_${categoryIndex}`;
        if (!room.gameData.votes[key]) room.gameData.votes[key] = { invalid: [], duplicate: [] };
        const currentVotes = room.gameData.votes[key][voteType];
        const voterIndex = currentVotes.indexOf(socket.id);
        if (voterIndex !== -1) currentVotes.splice(voterIndex, 1);
        else {
            const otherType = voteType === 'invalid' ? 'duplicate' : 'invalid';
            const otherVotes = room.gameData.votes[key][otherType];
            const otherIdx = otherVotes.indexOf(socket.id);
            if (otherIdx !== -1) otherVotes.splice(otherIdx, 1);
            currentVotes.push(socket.id);
        }
        io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'REVIEW' });
    });

    socket.on('stop_next_round', ({ roomId }) => {
        const room = rooms.get(roomId); if(!room || room.host !== socket.id) return;
        
        // Calcular Pontos
        room.players.forEach(p => {
            let roundScore = 0;
            const playerAns = room.gameData.answers[p.id] || {};
            room.gameData.categories.forEach((cat, idx) => {
                const rawWord = playerAns[idx] || "";
                const normWord = normalize(rawWord);
                if (!normWord) return;

                const key = `${p.id}_${idx}`;
                const votes = (room.gameData.votes && room.gameData.votes[key]) ? room.gameData.votes[key] : { invalid: [], duplicate: [] };
                const threshold = room.players.length / 2;

                if (votes.invalid.length > threshold) return; 

                let isDuplicate = false;
                if (votes.duplicate.length > threshold) {
                    isDuplicate = true;
                } else {
                    room.players.forEach(op => {
                        if (op.id !== p.id) {
                            const otherNorm = normalize((room.gameData.answers[op.id] || {})[idx]);
                            if (otherNorm === normWord) isDuplicate = true;
                        }
                    });
                }
                roundScore += isDuplicate ? 5 : 10;
            });
            room.gameData.totalScores[p.id] = (room.gameData.totalScores[p.id] || 0) + roundScore;
        });

        // Next Round ou Game Over
        if (room.gameData.round >= 5) {
            room.gameData.phase = 'GAME_OVER';
            const sorted = [...room.players].sort((a,b) => (room.gameData.totalScores[b.id]||0) - (room.gameData.totalScores[a.id]||0));
            room.gameData.winner = sorted[0];
            io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'GAME_OVER' });
        } else {
            stopInitRound(io, room, roomId, room.gameData.round + 1);
            io.to(roomId).emit('update_game_data', { gameData: room.gameData, phase: 'PLAYING' });
            startStopTimer(io, room, roomId);
        }
    });
};

module.exports = { startStop, registerStopHandlers };