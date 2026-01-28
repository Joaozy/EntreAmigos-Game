import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { Eye, MapPin, MessageSquare, AlertTriangle, LogOut } from 'lucide-react';

export default function GameSpy() {
    const { socket, roomId, isHost, sairDoJogo, gameData, players, myUserId } = useGame();

    const [answer, setAnswer] = useState('');
    const [phase, setPhase] = useState('QUESTIONS');
    
    // Dados do jogo
    const [role, setRole] = useState('');
    const [secretWord, setSecretWord] = useState('');
    const [category, setCategory] = useState('');
    const [locations, setLocations] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [currentTurnId, setCurrentTurnId] = useState('');
    const [answersLog, setAnswersLog] = useState([]);
    const [winner, setWinner] = useState(null);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if(gameData) {
            if(gameData.role) setRole(gameData.role);
            if(gameData.secretWord) setSecretWord(gameData.secretWord);
            if(gameData.category) setCategory(gameData.category);
            if(gameData.possibleWords) setLocations(gameData.possibleWords);
            if(gameData.questions) setQuestions(gameData.questions);
            if(gameData.currentQuestionIndex !== undefined) setQuestionIndex(gameData.currentQuestionIndex);
            if(gameData.currentTurnId) setCurrentTurnId(gameData.currentTurnId);
            if(gameData.answers) setAnswersLog(gameData.answers);
            if(gameData.phase) setPhase(gameData.phase);
            if(gameData.winner) setWinner(gameData.winner);
            if(gameData.winReason) setReason(gameData.winReason);
        }
    }, [gameData]);

    const isMyTurn = myUserId === currentTurnId;
    const currentQuestionText = questions[questionIndex] || "Carregando...";

    const submitAnswer = (e) => {
        e.preventDefault();
        if(!answer.trim()) return;
        socket.emit('spy_submit_answer', { roomId, answer });
        setAnswer('');
    };

    const submitVote = (targetId) => {
        socket.emit('spy_vote', { roomId, targetId });
    };

    const spyGuess = (loc) => {
        if(confirm(`Tem certeza que o local é ${loc}?`)) {
            socket.emit('spy_guess_location', { roomId, word: loc });
        }
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2">
                    <Eye className="text-red-500" />
                    <h1 className="font-bold text-xl tracking-widest">SPYFALL</h1>
                </div>
                <button onClick={sairDoJogo}><LogOut size={20} className="hover:text-red-400"/></button>
            </div>

            <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
                
                {/* CARTÃO DE IDENTIDADE (SECRETO) */}
                <div className={`p-6 rounded-2xl shadow-2xl border-l-8 ${role === 'ESPIÃO' ? 'bg-red-900/20 border-red-600' : 'bg-green-900/20 border-green-500'}`}>
                    <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">SUA IDENTIDADE</div>
                    <div className="text-3xl font-black mb-2">{role}</div>
                    {role === 'CIVIL' ? (
                        <div className="flex items-center gap-2 text-green-300">
                            <MapPin size={20}/> Local: <span className="font-bold text-white">{secretWord}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-red-300 animate-pulse">
                            <AlertTriangle size={20}/> DESCUBRA O LOCAL!
                        </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2">Categoria: {category}</div>
                </div>

                {/* JOGO - PERGUNTAS */}
                {phase === 'QUESTIONS' && (
                    <div className="bg-slate-800 p-6 rounded-2xl">
                        <div className="text-center mb-6">
                            <div className="text-slate-400 text-sm">PERGUNTA {questionIndex + 1}/3</div>
                            <div className="text-2xl font-bold text-yellow-400">"{currentQuestionText}"</div>
                        </div>

                        {isMyTurn ? (
                            <form onSubmit={submitAnswer} className="flex gap-2">
                                <input 
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-4 focus:border-yellow-500 outline-none"
                                    placeholder="Sua resposta..."
                                    value={answer}
                                    onChange={e => setAnswer(e.target.value)}
                                    autoFocus
                                />
                                <button className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-6 rounded-xl">ENVIAR</button>
                            </form>
                        ) : (
                            <div className="text-center p-4 bg-slate-900/50 rounded-xl animate-pulse text-slate-400">
                                Aguardando resposta de {players.find(p => p.userId === currentTurnId)?.nickname}...
                            </div>
                        )}

                        {/* Histórico Recente */}
                        <div className="mt-6 space-y-2 max-h-48 overflow-y-auto">
                            {answersLog.slice().reverse().map((log, i) => (
                                <div key={i} className="flex gap-3 text-sm bg-slate-900/30 p-2 rounded">
                                    <span className="font-bold text-slate-300">{log.nickname}:</span>
                                    <span className="text-white">{log.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE DE VOTAÇÃO */}
                {(phase === 'DISCUSSION' || phase === 'VOTING') && (
                    <div className="bg-slate-800 p-6 rounded-2xl text-center">
                        <h2 className="text-2xl font-bold mb-4 text-red-400">QUEM É O ESPIÃO?</h2>
                        {phase === 'DISCUSSION' && isHost && (
                            <button onClick={() => socket.emit('spy_start_voting', { roomId })} className="bg-red-600 hover:bg-red-500 px-8 py-3 rounded-xl font-bold mb-4">
                                INICIAR VOTAÇÃO
                            </button>
                        )}
                        {phase === 'VOTING' && (
                            <div className="grid grid-cols-2 gap-3">
                                {players.filter(p => p.userId !== myUserId).map(p => (
                                    <button 
                                        key={p.userId} 
                                        onClick={() => submitVote(p.userId)}
                                        className="bg-slate-700 hover:bg-red-900/50 hover:border-red-500 border border-transparent p-4 rounded-xl font-bold transition"
                                    >
                                        VOTAR EM {p.nickname}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ESPIÃO TENTA CHUTAR (ÚLTIMA CHANCE) */}
                {phase === 'SPY_GUESS' && (
                    <div className="bg-red-900/30 border border-red-500 p-6 rounded-2xl text-center">
                        <h2 className="text-2xl font-bold mb-4 text-red-400">ESPIÃO FOI PEGO!</h2>
                        {role === 'ESPIÃO' ? (
                            <div>
                                <p className="mb-4">Tente adivinhar o local para roubar a vitória:</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {locations.map(loc => (
                                        <button key={loc} onClick={() => spyGuess(loc)} className="bg-slate-800 hover:bg-yellow-600 p-2 rounded text-sm font-bold">
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="animate-pulse">O Espião está tentando adivinhar o local...</p>
                        )}
                    </div>
                )}

                {/* GAME OVER */}
                {phase === 'REVEAL' && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-800 p-8 rounded-3xl max-w-lg w-full text-center border-2 border-yellow-500">
                            <h1 className="text-4xl font-black mb-2">{winner === 'SPY' ? 'ESPIÃO VENCEU!' : 'CIVIS VENCERAM!'}</h1>
                            <p className="text-xl text-slate-300 mb-6">{reason}</p>
                            
                            <div className="bg-slate-900 p-4 rounded-xl mb-6">
                                <p className="text-sm text-slate-500 uppercase">O local era</p>
                                <p className="text-3xl font-bold text-green-400">{secretWord}</p>
                            </div>

                            {isHost && (
                                <button onClick={() => socket.emit('create_room', { nickname: players.find(p=>p.isHost).nickname, gameId: 'SPY' })} className="bg-yellow-500 text-black font-bold px-8 py-3 rounded-xl hover:scale-105 transition">
                                    JOGAR NOVAMENTE
                                </button>
                            )}
                            <button onClick={sairDoJogo} className="block w-full mt-4 text-slate-500 hover:text-white">Sair</button>
                        </div>
                    </div>
                )}
                
                {/* Lista de Possíveis Locais (Ajuda visual) */}
                <div className="bg-slate-900/50 p-4 rounded-xl">
                    <p className="text-xs text-slate-500 uppercase mb-2">Locais Possíveis</p>
                    <div className="flex flex-wrap gap-2">
                        {locations.map(loc => (
                            <span key={loc} className={`text-xs px-2 py-1 rounded ${role === 'ESPIÃO' ? 'bg-slate-700' : (loc === secretWord ? 'bg-green-900 text-green-300' : 'bg-slate-800 text-slate-500')}`}>
                                {loc}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}