import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { HelpCircle, ThumbsUp, ThumbsDown, MessageCircle, ArrowRight, Home, LogOut } from 'lucide-react';

export default function GameWhoAmI() {
    const { socket, roomId, isHost, sairDoJogo, gameData, players, myUserId } = useGame();

    const [question, setQuestion] = useState('');
    const [guess, setGuess] = useState('');
    const [hint, setHint] = useState('');
    
    // Estados derivados do gameData
    const [currentTurnId, setCurrentTurnId] = useState(null);
    const [phase, setPhase] = useState('PLAYING');
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [votes, setVotes] = useState({});
    const [playersData, setPlayersData] = useState([]);

    // --- SINCRONIZAÇÃO ---
    useEffect(() => {
        if (gameData) {
            if (gameData.currentTurnId) setCurrentTurnId(gameData.currentTurnId);
            if (gameData.phase) setPhase(gameData.phase);
            if (gameData.currentQuestion) setCurrentQuestion(gameData.currentQuestion);
            if (gameData.votes) setVotes(gameData.votes);
            if (gameData.playersData) setPlayersData(gameData.playersData);
        }
    }, [gameData]);

    const isMyTurn = myUserId === currentTurnId;
    const currentPlayerName = players?.find(p => p.userId === currentTurnId)?.nickname || 'Alguém';

    // --- AÇÕES ---
    const sendQuestion = (e) => {
        e.preventDefault();
        if (!question.trim()) return;
        socket.emit('whoami_ask', { roomId, question });
        setQuestion('');
    };

    const sendGuess = (e) => {
        e.preventDefault();
        if (!guess.trim()) return;
        socket.emit('whoami_guess', { roomId, guess });
        setGuess('');
    };

    const sendVote = (vote) => {
        socket.emit('whoami_vote', { roomId, vote });
    };

    const sendHint = (e) => {
        e.preventDefault();
        socket.emit('whoami_send_hint', { roomId, hint });
        setHint('');
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2">
                    <HelpCircle className="text-purple-400" />
                    <h1 className="font-bold text-xl">QUEM SOU EU?</h1>
                </div>
                <button onClick={sairDoJogo}><LogOut size={20} className="hover:text-red-400"/></button>
            </div>

            {/* ÁREA CENTRAL */}
            <div className="flex-1 flex flex-col items-center max-w-4xl mx-auto w-full">
                
                {/* Status da Vez */}
                <div className={`w-full text-center p-4 rounded-xl mb-6 ${isMyTurn ? 'bg-purple-600' : 'bg-slate-700'}`}>
                    <h2 className="text-lg font-bold">
                        {isMyTurn ? "SUA VEZ! Faça uma pergunta de SIM ou NÃO." : `Vez de ${currentPlayerName}`}
                    </h2>
                    {phase === 'VOTING' && <p className="animate-pulse mt-2 text-yellow-300">VOTAÇÃO EM ANDAMENTO...</p>}
                    {phase === 'RESULT' && <p className="font-bold mt-2 text-green-300">RESULTADO DA VOTAÇÃO!</p>}
                </div>

                {/* Pergunta Atual */}
                {currentQuestion && (
                    <div className="bg-white/10 p-6 rounded-2xl mb-6 w-full text-center">
                        <p className="text-slate-400 text-sm uppercase tracking-widest mb-2">Pergunta</p>
                        <p className="text-2xl font-bold">"{currentQuestion}"</p>
                    </div>
                )}

                {/* CONTROLES */}
                
                {/* 1. FAZER PERGUNTA (Só no turno e fase PLAYING) */}
                {isMyTurn && phase === 'PLAYING' && (
                    <div className="w-full space-y-4">
                        <form onSubmit={sendQuestion} className="flex gap-2">
                            <input 
                                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl p-4 focus:border-purple-500 outline-none"
                                placeholder="Ex: Eu sou humano?"
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                            />
                            <button type="submit" className="bg-purple-500 hover:bg-purple-600 px-6 rounded-xl font-bold"><ArrowRight/></button>
                        </form>
                        
                        <div className="flex items-center gap-4 my-4">
                            <div className="h-px bg-slate-700 flex-1"></div>
                            <span className="text-slate-500 text-xs">OU TENTE ADIVINHAR</span>
                            <div className="h-px bg-slate-700 flex-1"></div>
                        </div>

                        <form onSubmit={sendGuess} className="flex gap-2">
                            <input 
                                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl p-4 focus:border-green-500 outline-none"
                                placeholder="Eu sou..."
                                value={guess}
                                onChange={e => setGuess(e.target.value)}
                            />
                            <button type="submit" className="bg-green-600 hover:bg-green-500 px-6 rounded-xl font-bold">CHUTAR</button>
                        </form>

                        <button 
                            onClick={() => socket.emit('whoami_request_hint', { roomId })}
                            className="w-full py-3 text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:bg-slate-800 transition"
                        >
                            Pedir Dica (Custa 1 Ponto)
                        </button>
                    </div>
                )}

                {/* 2. VOTAÇÃO (Para os outros) */}
                {!isMyTurn && phase === 'VOTING' && (
                    <div className="flex gap-4 w-full justify-center">
                        <button onClick={() => sendVote('YES')} className="flex-1 bg-green-600 hover:bg-green-500 py-6 rounded-xl font-bold flex flex-col items-center gap-2 transition">
                            <ThumbsUp size={32}/> SIM
                        </button>
                        <button onClick={() => sendVote('NO')} className="flex-1 bg-red-600 hover:bg-red-500 py-6 rounded-xl font-bold flex flex-col items-center gap-2 transition">
                            <ThumbsDown size={32}/> NÃO
                        </button>
                        <button onClick={() => sendVote('MAYBE')} className="flex-1 bg-slate-600 hover:bg-slate-500 py-6 rounded-xl font-bold flex flex-col items-center gap-2 transition">
                            <HelpCircle size={32}/> TALVEZ
                        </button>
                    </div>
                )}

                {/* 3. DICA (Alguém escrevendo) */}
                {phase === 'HINT_MODE' && !isMyTurn && (
                    <form onSubmit={sendHint} className="w-full flex gap-2">
                        <input 
                            className="flex-1 bg-slate-800 border border-yellow-600 rounded-xl p-4 outline-none"
                            placeholder={`Escreva uma dica para ${currentPlayerName}...`}
                            value={hint}
                            onChange={e => setHint(e.target.value)}
                        />
                        <button className="bg-yellow-600 hover:bg-yellow-500 px-6 rounded-xl font-bold">ENVIAR</button>
                    </form>
                )}

                {/* RESULTADO VOTAÇÃO */}
                {phase === 'RESULT' && (
                    <div className="flex gap-4 w-full justify-center mt-4">
                        <div className="bg-green-900/50 border border-green-500 p-4 rounded-xl text-center flex-1">
                            <ThumbsUp className="mx-auto mb-2 text-green-400"/>
                            <span className="text-2xl font-bold">{Object.values(votes).filter(v => v === 'YES').length}</span>
                        </div>
                        <div className="bg-red-900/50 border border-red-500 p-4 rounded-xl text-center flex-1">
                            <ThumbsDown className="mx-auto mb-2 text-red-400"/>
                            <span className="text-2xl font-bold">{Object.values(votes).filter(v => v === 'NO').length}</span>
                        </div>
                    </div>
                )}

                {/* LISTA DE JOGADORES (AS CARTAS) */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full mt-8">
                    {playersData.map((p) => {
                        const isMe = p.userId === myUserId;
                        const isCurrent = p.userId === currentTurnId;
                        const playerInfo = players.find(pl => pl.userId === p.userId);
                        
                        return (
                            <div key={p.userId} className={`relative p-4 rounded-xl border-2 flex flex-col items-center text-center transition-all ${isCurrent ? 'border-purple-500 bg-purple-900/20 scale-105 shadow-purple-500/20 shadow-lg' : 'border-slate-700 bg-slate-800'}`}>
                                {playerInfo?.isGuessed && <div className="absolute top-2 right-2 text-yellow-400">⭐</div>}
                                <div className="font-bold text-slate-300 mb-2">{playerInfo?.nickname}</div>
                                <div className={`text-xl font-black ${isMe ? 'text-slate-500' : 'text-yellow-400'}`}>
                                    {p.character}
                                </div>
                                {isMe && <div className="text-xs text-slate-600 mt-1">(Você não vê isso)</div>}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}