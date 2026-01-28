import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket';
import { Hand, Clock, AlertTriangle, CheckCircle, Play, LogOut } from 'lucide-react';

export default function GameStop() {
    const { roomId, isHost, gameData, players, currentPhase, myUserId, sairDoJogo } = useGame();
    
    const [timer, setTimer] = useState(180);
    const [myInputs, setMyInputs] = useState({});

    // Sincronia de Timer
    useEffect(() => {
        const onTimer = (t) => setTimer(t);
        socket.on('stop_timer', onTimer);
        return () => socket.off('stop_timer', onTimer);
    }, []);

    // Sincronia de Inputs (Recupera se cair a conexão)
    useEffect(() => {
        if (gameData?.answers && gameData.answers[myUserId]) {
            setMyInputs(gameData.answers[myUserId]);
        }
    }, [gameData, myUserId]);

    const handleInputChange = (cat, val) => {
        const newInputs = { ...myInputs, [cat]: val };
        setMyInputs(newInputs);
        // Otimização: Não envia a cada letra para não flodar o socket. 
        // Enviaremos no onBlur ou em intervalo, mas para STOP é crítico enviar logo.
        // Vamos enviar com debounce manual ou confiar que o user vai clicar fora?
        // Vamos enviar direto por enquanto, o Node aguenta.
        socket.emit('stop_submit', { roomId, answers: newInputs });
    };

    const callStop = () => {
        if (confirm("TEM CERTEZA QUE QUER GRITAR STOP?")) {
            socket.emit('stop_call', { roomId });
        }
    };

    const toggleInvalid = (targetId, cat) => {
        socket.emit('stop_validate', { roomId, targetUserId: targetId, category: cat });
    };

    const categories = gameData?.categories || [];
    const letter = gameData?.letter || "?";

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
            
            {/* TOP BAR */}
            <div className="w-full max-w-4xl flex justify-between items-center bg-slate-800 p-4 rounded-2xl mb-6 shadow-lg border border-slate-700 sticky top-2 z-50">
                <div className="flex items-center gap-4">
                    <div className="bg-yellow-500 text-black w-12 h-12 rounded-xl flex items-center justify-center font-black text-3xl shadow-lg border-2 border-white">
                        {letter}
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase">Rodada {gameData?.round}</p>
                        <p className="font-bold text-white">{currentPhase === 'PLAYING' ? 'VALENDO!' : 'PAUSADO'}</p>
                    </div>
                </div>
                <div className={`flex items-center gap-2 font-mono font-black text-2xl ${timer <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    <Clock size={24}/> {timer}s
                </div>
                <button onClick={sairDoJogo}><LogOut className="text-slate-500 hover:text-red-400"/></button>
            </div>

            {/* --- FASE 1: JOGANDO --- */}
            {currentPhase === 'PLAYING' && (
                <div className="w-full max-w-4xl animate-in fade-in">
                    <div className="grid gap-4 md:grid-cols-2 mb-24">
                        {categories.map((cat) => (
                            <div key={cat} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                <label className="text-slate-400 text-xs font-bold uppercase mb-1 block">{cat}</label>
                                <input 
                                    className="w-full bg-slate-900 text-white font-bold text-lg p-3 rounded-lg border border-slate-600 focus:border-yellow-500 outline-none uppercase"
                                    value={myInputs[cat] || ''}
                                    onChange={(e) => handleInputChange(cat, e.target.value)}
                                    placeholder={`Começa com ${letter}...`}
                                />
                            </div>
                        ))}
                    </div>
                    
                    {/* BOTÃO STOP FLUTUANTE */}
                    <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-auto">
                        <button 
                            onClick={callStop}
                            className="w-full md:w-auto bg-red-600 hover:bg-red-500 text-white font-black text-2xl py-6 px-12 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse hover:animate-none active:scale-95 transition border-4 border-red-800 flex items-center justify-center gap-3"
                        >
                            <Hand size={32}/> STOP!
                        </button>
                    </div>
                </div>
            )}

            {/* --- FASE 2: VALIDAÇÃO --- */}
            {currentPhase === 'VALIDATION' && (
                <div className="w-full max-w-5xl animate-in slide-in-from-bottom">
                    <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl mb-6 text-center text-yellow-200 font-bold flex items-center justify-center gap-2">
                        <AlertTriangle/> REVISÃO! Clique nas respostas erradas para anular.
                    </div>

                    <div className="overflow-x-auto pb-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-3 text-slate-400 font-bold uppercase text-xs">Jogador</th>
                                    {categories.map(cat => <th key={cat} className="p-3 text-slate-400 font-bold uppercase text-xs">{cat}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {players.map(p => (
                                    <tr key={p.userId} className="border-b border-slate-800 hover:bg-slate-800/50">
                                        <td className="p-3 font-bold flex items-center gap-2">
                                            {p.nickname}
                                            {gameData.stopperId === p.userId && <span className="bg-red-600 text-white text-[10px] px-1 rounded">STOPPER</span>}
                                        </td>
                                        {categories.map(cat => {
                                            const answer = gameData.answers[p.userId]?.[cat] || "";
                                            const invalidVotes = gameData.invalidations?.[p.userId]?.[cat]?.length || 0;
                                            const isInvalid = invalidVotes >= Math.ceil(players.length / 2);
                                            const isMyVote = gameData.invalidations?.[p.userId]?.[cat]?.includes(myUserId);

                                            return (
                                                <td key={cat} className="p-1">
                                                    <button 
                                                        onClick={() => toggleInvalid(p.userId, cat)}
                                                        className={`w-full text-left p-2 rounded transition relative group border ${
                                                            isInvalid 
                                                                ? 'bg-red-900/30 text-red-400 border-red-800 line-through decoration-2' 
                                                                : 'bg-slate-900 text-white border-transparent hover:border-slate-600'
                                                        }`}
                                                    >
                                                        {answer || <span className="opacity-20">-</span>}
                                                        {isMyVote && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"/>}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {isHost && (
                        <div className="text-center mt-8 pb-10">
                            <button onClick={() => socket.emit('stop_finish_validation', { roomId })} className="bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-10 rounded-xl shadow-lg text-lg flex items-center gap-2 mx-auto">
                                <CheckCircle/> FINALIZAR RODADA E CALCULAR PONTOS
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- FASE 3: RESULTADO --- */}
            {currentPhase === 'RESULT' && (
                <div className="w-full max-w-2xl text-center animate-in zoom-in">
                    <h2 className="text-3xl font-black mb-8 text-white">RANKING DA RODADA</h2>
                    
                    <div className="space-y-4 mb-10">
                        {players.sort((a,b) => b.score - a.score).map((p, i) => (
                            <div key={p.userId} className={`flex justify-between items-center p-4 rounded-xl border-l-4 shadow-lg ${i===0 ? 'bg-yellow-500/10 border-yellow-500' : 'bg-slate-800 border-slate-600'}`}>
                                <div className="flex items-center gap-4">
                                    <span className={`font-black text-xl w-8 ${i===0 ? 'text-yellow-500' : 'text-slate-500'}`}>#{i+1}</span>
                                    <span className="font-bold text-lg">{p.nickname}</span>
                                </div>
                                <span className="font-mono font-black text-2xl text-green-400">{p.score} pts</span>
                            </div>
                        ))}
                    </div>

                    {isHost && (
                        <button onClick={() => socket.emit('stop_next_round', { roomId })} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-xl shadow-lg flex items-center gap-2 mx-auto">
                            <Play/> PRÓXIMA RODADA
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}