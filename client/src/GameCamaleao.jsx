import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { socket } from './socket';
import { Home, LogOut, Loader2, Send, MessageCircle, Eye, Users, Trophy, ArrowRight } from 'lucide-react';

export default function GameCamaleao({ players, isHost, roomId, gameData, phase }) {
    const { sairDoJogo } = useGame();
    const [secretQuestion, setSecretQuestion] = useState('A carregar a sua pergunta...');
    const [isChameleonResult, setIsChameleonResult] = useState(null);
    const [myAnswer, setMyAnswer] = useState('');

    // Sincronização Segura de Estado
    useEffect(() => {
        socket.emit('camaleao_load_state');

        const handleSecret = ({ question, isChameleon }) => {
            setSecretQuestion(question);
            setIsChameleonResult(isChameleon); // Só será true/false no final do jogo
        };

        socket.on('camaleao_secret', handleSecret);
        return () => socket.off('camaleao_secret', handleSecret);
    }, [phase]); // Re-sincroniza a cada mudança de fase

    // Acões
    const sendAnswer = (e) => {
        e.preventDefault();
        if (myAnswer.trim()) {
            socket.emit('camaleao_answer', { answer: myAnswer });
        }
    };

    const castVote = (targetId) => {
        socket.emit('camaleao_vote', { targetId });
    };

    if (!gameData) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <Loader2 className="animate-spin mr-2" /> A preparar a mesa...
            </div>
        );
    }

    const hasAnswered = !!gameData.answers?.[socket.id];
    const hasVoted = !!gameData.votes?.[socket.id];

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4 relative">
            
            {/* BARRA DE NAVEGAÇÃO FIXA (Requisito 1) */}
            <div className="fixed top-4 right-4 z-50 flex gap-2">
                {isHost && (
                    <button 
                        onClick={() => socket.emit('return_to_lobby', { roomId })}
                        className="bg-slate-800/80 backdrop-blur p-2 rounded-full hover:bg-slate-700 border border-slate-600 shadow-lg transition"
                        title="Voltar ao Lobby"
                    >
                        <Home size={20} />
                    </button>
                )}
                <button 
                    onClick={sairDoJogo} 
                    className="bg-red-900/80 backdrop-blur p-2 rounded-full hover:bg-red-800 border border-red-700 shadow-lg transition"
                    title="Sair do Jogo"
                >
                    <LogOut size={20} />
                </button>
            </div>

            {/* Cabeçalho do Jogo */}
            <div className="w-full max-w-3xl flex justify-between items-center mt-12 mb-6 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
                <div className="flex items-center gap-2">
                    <Eye className="text-emerald-500" size={28} />
                    <h1 className="text-2xl font-black tracking-widest text-emerald-400">CAMALEÃO</h1>
                </div>
                <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Rodada</span>
                    <p className="text-xl font-mono font-bold leading-none">{gameData.round || 1}</p>
                </div>
            </div>

            <div className="w-full max-w-3xl flex-1 flex flex-col">
                
                {/* FASE 1: RESPONDER */}
                {phase === 'ANSWERING' && (
                    <div className="flex flex-col items-center animate-in zoom-in duration-300">
                        <div className="bg-emerald-900/30 border-2 border-emerald-600/50 p-8 rounded-3xl text-center shadow-2xl mb-8 w-full max-w-xl">
                            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4">A SUA PERGUNTA SECRETA</p>
                            <h2 className="text-2xl md:text-3xl font-black text-white leading-snug">"{secretQuestion}"</h2>
                        </div>

                        {!hasAnswered ? (
                            <form onSubmit={sendAnswer} className="w-full max-w-lg flex gap-2">
                                <input 
                                    className="flex-1 bg-slate-800 border-2 border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-4 text-lg outline-none transition text-white placeholder:text-slate-500 shadow-inner"
                                    placeholder="Escreva a sua resposta..."
                                    value={myAnswer}
                                    onChange={e => setMyAnswer(e.target.value)}
                                    autoFocus
                                    maxLength={30}
                                />
                                <button className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl font-black transition transform hover:scale-105 shadow-lg flex items-center justify-center">
                                    <Send size={20} />
                                </button>
                            </form>
                        ) : (
                            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center w-full max-w-md">
                                <Loader2 className="animate-spin mx-auto mb-3 text-emerald-500" size={32} />
                                <p className="font-bold text-slate-300">A aguardar os outros jogadores...</p>
                                <p className="text-xs text-slate-500 mt-2">
                                    {Object.keys(gameData.answers || {}).length} / {players.length} responderam.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 2: DISCUSSÃO */}
                {phase === 'DISCUSSION' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-slate-800 p-6 rounded-3xl text-center mb-8 border border-slate-700 shadow-xl">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                                <MessageCircle size={14} /> PERGUNTA PRINCIPAL
                            </p>
                            <h2 className="text-2xl font-black text-white">"{gameData.mainQuestion}"</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {players.map(p => (
                                <div key={p.id} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 flex flex-col">
                                    <span className="text-xs font-bold text-emerald-500 mb-1">{p.nickname}</span>
                                    <span className="text-lg font-bold text-white">"{gameData.answers[p.id]}"</span>
                                </div>
                            ))}
                        </div>

                        {isHost ? (
                            <button onClick={() => socket.emit('camaleao_start_voting')} className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black py-4 rounded-xl shadow-lg transition">
                                INICIAR VOTAÇÃO
                            </button>
                        ) : (
                            <p className="text-center text-slate-500 font-bold animate-pulse">Debatam! O anfitrião irá iniciar a votação.</p>
                        )}
                    </div>
                )}

                {/* FASE 3: VOTAÇÃO */}
                {phase === 'VOTING' && (
                    <div className="animate-in zoom-in">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-black text-yellow-400 flex items-center justify-center gap-2 mb-2">
                                <Users /> QUEM É O CAMALEÃO?
                            </h2>
                            <p className="text-slate-400">Vote no jogador que deu a resposta mais estranha.</p>
                        </div>

                        {!hasVoted ? (
                            <div className="grid grid-cols-2 gap-4">
                                {players.map(p => (
                                    <button 
                                        key={p.id} 
                                        disabled={p.id === socket.id} // Não pode votar em si mesmo
                                        onClick={() => castVote(p.id)}
                                        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-2xl border-2 border-slate-700 hover:border-yellow-500 transition font-bold text-lg flex flex-col items-center gap-2"
                                    >
                                        <span>{p.nickname}</span>
                                        <span className="text-xs font-normal text-slate-400">"{gameData.answers[p.id]}"</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center p-8 bg-slate-800 rounded-3xl border border-slate-700">
                                <Loader2 className="animate-spin mx-auto mb-4 text-yellow-500" size={40} />
                                <p className="font-bold text-xl text-white">Voto registado!</p>
                                <p className="text-sm text-slate-400 mt-2">A aguardar o resto do grupo...</p>
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 4: RESULTADO */}
                {phase === 'REVEAL' && (
                    <div className="flex flex-col items-center text-center animate-in zoom-in duration-500">
                        <h1 className="text-4xl font-black mb-2">
                            {gameData.winner === 'CAMALEAO' ? <span className="text-red-500">O CAMALEÃO VENCEU!</span> : <span className="text-emerald-500">OS JOGADORES VENCERAM!</span>}
                        </h1>
                        <p className="text-lg text-slate-300 mb-8">{gameData.winReason}</p>

                        <div className="bg-slate-800 p-8 rounded-3xl border-2 border-slate-600 shadow-2xl w-full max-w-md relative overflow-hidden mb-8">
                            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">O Camaleão era...</p>
                            <h2 className="text-4xl font-black text-white mb-6">
                                {players.find(p => p.id === gameData.chameleonId)?.nickname}
                            </h2>
                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">A pergunta dele era:</p>
                            <p className="text-lg font-medium text-emerald-300 italic">"{gameData.chameleonQuestion}"</p>
                        </div>

                        {/* Placar Atualizado */}
                        <div className="w-full max-w-md bg-slate-800/50 p-4 rounded-2xl border border-slate-700 mb-8">
                            <h3 className="font-bold text-sm text-slate-400 uppercase mb-3 flex items-center justify-center gap-2"><Trophy size={16}/> Pontuação</h3>
                            <div className="space-y-2">
                                {players.sort((a,b) => gameData.scores[b.id] - gameData.scores[a.id]).map((p, idx) => (
                                    <div key={p.id} className="flex justify-between bg-slate-900/50 p-2 rounded-lg">
                                        <span className="font-bold text-slate-300">{idx + 1}. {p.nickname}</span>
                                        <span className="font-mono text-yellow-400 font-bold">{gameData.scores[p.id]} pts</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isHost ? (
                            <button onClick={() => { setMyAnswer(''); socket.emit('camaleao_next_round'); }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-10 rounded-full shadow-lg transition flex items-center gap-2">
                                PRÓXIMA RODADA <ArrowRight size={20} />
                            </button>
                        ) : (
                            <p className="text-slate-500 font-bold animate-pulse">A aguardar que o anfitrião avance...</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}