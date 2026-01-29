import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { Eye, MapPin, MessageSquare, AlertTriangle, LogOut, CheckCircle, HelpCircle, RotateCcw } from 'lucide-react';

export default function GameSpy() {
    // CORREÇÃO: Pega 'user' do contexto
    const { socket, roomId, isHost, sairDoJogo, gameData, players, user } = useGame();
    // CORREÇÃO: Extrai ID
    const myUserId = user?.id;

    const [answer, setAnswer] = useState('');
    
    // Se não tiver dados, carrega
    if (!gameData || !players) return <div className="text-white text-center mt-20">Carregando Spyfall...</div>;

    const { 
        role, secretWord, category, possibleWords, questions, 
        currentQuestionIndex, currentTurnId, answers, phase, 
        winner, winReason, votes 
    } = gameData;

    const isMyTurn = myUserId === currentTurnId;
    const currentQuestionText = questions && questions[currentQuestionIndex] ? questions[currentQuestionIndex] : "Carregando pergunta...";
    const turnPlayerName = players.find(p => p.userId === currentTurnId)?.nickname || "Alguém";

    // --- AÇÕES ---

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
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
                <div className="flex items-center gap-2">
                    <Eye className="text-red-500" />
                    <h1 className="font-black text-xl tracking-widest text-slate-200">SPYFALL</h1>
                </div>
                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition"><LogOut size={20} className="text-slate-400 hover:text-white"/></button>
            </div>

            <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 pb-20">
                
                {/* CARTÃO DE IDENTIDADE (SECRETO) */}
                <div className={`p-6 rounded-2xl shadow-2xl border-l-8 relative overflow-hidden ${role === 'ESPIÃO' ? 'bg-red-900/20 border-red-600' : 'bg-green-900/20 border-green-500'}`}>
                    <div className="text-xs uppercase tracking-widest text-slate-400 mb-1 font-bold">SUA IDENTIDADE</div>
                    <div className="text-4xl font-black mb-2 tracking-tighter">{role}</div>
                    
                    {role === 'CIVIL' ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-green-300">
                                <MapPin size={20}/> Local: <span className="font-bold text-white text-xl uppercase">{secretWord}</span>
                            </div>
                            <div className="text-xs text-slate-500">Categoria: {category}</div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-red-300 animate-pulse font-bold">
                            <AlertTriangle size={20}/> DESCUBRA O LOCAL!
                        </div>
                    )}
                </div>

                {/* FASE 1: PERGUNTAS */}
                {phase === 'QUESTIONS' && (
                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                        <div className="text-center mb-8">
                            <div className="inline-block bg-black/30 px-4 py-1 rounded-full text-slate-400 text-xs font-bold mb-2 uppercase tracking-wide">
                                Pergunta {currentQuestionIndex + 1} de 3
                            </div>
                            <div className="text-xl md:text-2xl font-bold text-yellow-400 leading-relaxed">"{currentQuestionText}"</div>
                        </div>

                        {isMyTurn ? (
                            <div className="animate-in slide-in-from-bottom">
                                <p className="text-center text-green-400 font-bold mb-2 text-sm uppercase">Sua vez de responder!</p>
                                <form onSubmit={submitAnswer} className="flex gap-2">
                                    <input 
                                        className="flex-1 bg-slate-900 border-2 border-slate-600 rounded-xl p-4 focus:border-yellow-500 outline-none transition text-white"
                                        placeholder="Digite uma resposta astuta..."
                                        value={answer}
                                        onChange={e => setAnswer(e.target.value)}
                                        autoFocus
                                    />
                                    <button className="bg-yellow-500 hover:bg-yellow-600 text-black font-black px-6 rounded-xl shadow-lg transition transform hover:scale-105">ENVIAR</button>
                                </form>
                            </div>
                        ) : (
                            <div className="text-center p-6 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className="flex justify-center items-center gap-2 text-slate-400">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"/>
                                    Aguardando resposta de <span className="text-white font-bold">{turnPlayerName}</span>...
                                </div>
                            </div>
                        )}

                        {/* Histórico Recente */}
                        {answers && answers.length > 0 && (
                            <div className="mt-8">
                                <p className="text-xs uppercase font-bold text-slate-500 mb-2">Últimas Respostas</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                    {answers.slice().reverse().map((log, i) => (
                                        <div key={i} className="flex flex-col bg-slate-900/40 p-3 rounded-lg border-l-4 border-slate-600">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{log.nickname}</span>
                                            <span className="text-white italic">"{log.text}"</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 2: VOTAÇÃO */}
                {(phase === 'DISCUSSION' || phase === 'VOTING') && (
                    <div className="bg-slate-800 p-6 rounded-2xl text-center border border-slate-700 animate-in zoom-in">
                        <h2 className="text-2xl font-black mb-2 text-white">QUEM É O ESPIÃO?</h2>
                        <p className="text-slate-400 mb-6 text-sm">Discutam e votem no suspeito.</p>
                        
                        {phase === 'DISCUSSION' && isHost && (
                            <button onClick={() => socket.emit('spy_start_voting', { roomId })} className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-black shadow-lg hover:scale-105 transition w-full md:w-auto">
                                INICIAR VOTAÇÃO AGORA
                            </button>
                        )}
                        
                        {phase === 'VOTING' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {players.filter(p => p.userId !== myUserId).map(p => {
                                    const hasVoted = votes && votes[myUserId];
                                    return (
                                        <button 
                                            key={p.userId} 
                                            disabled={hasVoted}
                                            onClick={() => submitVote(p.userId)}
                                            className={`p-4 rounded-xl font-bold transition flex items-center justify-between group
                                                ${hasVoted ? 'bg-slate-700 opacity-50 cursor-not-allowed' : 'bg-slate-700 hover:bg-red-600 text-white'}
                                            `}
                                        >
                                            <span>{p.nickname}</span>
                                            <span className="text-xs opacity-0 group-hover:opacity-100 uppercase">Acusar</span>
                                        </button>
                                    );
                                })}
                                {votes && votes[myUserId] && <p className="col-span-full text-green-400 font-bold mt-2">Voto registrado! Aguardando os outros...</p>}
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 3: ESPIÃO TENTA CHUTAR (ÚLTIMA CHANCE) */}
                {phase === 'SPY_GUESS' && (
                    <div className="bg-red-900/30 border border-red-500 p-6 rounded-2xl text-center animate-pulse">
                        <h2 className="text-2xl font-black mb-2 text-red-400">ESPIÃO FOI PEGO!</h2>
                        <p className="text-red-200 mb-6 text-sm">Última chance: Se adivinhar o local, o Espião vence.</p>
                        
                        {role === 'ESPIÃO' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {possibleWords?.map(loc => (
                                    <button key={loc} onClick={() => spyGuess(loc)} className="bg-slate-800 hover:bg-yellow-500 hover:text-black text-white p-3 rounded-lg text-sm font-bold transition border border-slate-600">
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-slate-400 italic">O Espião está escolhendo o local...</div>
                        )}
                    </div>
                )}

                {/* FASE 4: GAME OVER */}
                {phase === 'REVEAL' && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-in fade-in duration-500">
                        <div className="bg-slate-800 p-8 rounded-3xl max-w-lg w-full text-center border-2 border-yellow-500 shadow-2xl relative">
                            <button onClick={sairDoJogo} className="absolute top-4 right-4 text-slate-500 hover:text-white"><LogOut size={20}/></button>
                            
                            <h1 className={`text-4xl font-black mb-2 ${winner === 'SPY' ? 'text-red-500' : 'text-green-500'}`}>
                                {winner === 'SPY' ? 'ESPIÃO VENCEU!' : 'CIVIS VENCERAM!'}
                            </h1>
                            <p className="text-lg text-slate-300 mb-8">{winReason}</p>
                            
                            <div className="bg-slate-900 p-6 rounded-2xl mb-8 border border-white/5">
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">O local era</p>
                                <p className="text-4xl font-black text-white uppercase">{secretWord}</p>
                            </div>

                            {isHost && (
                                <button onClick={() => socket.emit('spy_restart', { roomId })} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black px-8 py-4 rounded-xl shadow-lg hover:scale-105 transition flex items-center justify-center gap-2">
                                    <RotateCcw size={20}/> JOGAR NOVAMENTE
                                </button>
                            )}
                        </div>
                    </div>
                )}
                
                {/* LISTA DE LOCAIS (AJUDA VISUAL PARA TODOS) */}
                {phase !== 'REVEAL' && phase !== 'SPY_GUESS' && (
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-4 flex items-center gap-2">
                            <MapPin size={14}/> Locais Possíveis
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {possibleWords?.map(loc => (
                                <span key={loc} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${role === 'ESPIÃO' ? 'bg-slate-800 border-slate-700 text-slate-400' : (loc === secretWord ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-500 line-through decoration-slate-600')}`}>
                                    {loc}
                                </span>
                            ))}
                        </div>
                        {role === 'CIVIL' && <p className="text-[10px] text-slate-600 mt-2 italic">* Locais riscados não são o seu (ajuda visual)</p>}
                    </div>
                )}
            </div>
        </div>
    );
}