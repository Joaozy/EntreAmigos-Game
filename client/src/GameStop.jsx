import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket'; // Importação direta se necessário, ou via hook
import { Hand, Clock, AlertTriangle, CheckCircle, Play, LogOut } from 'lucide-react';

export default function GameStop() {
    const { roomId, isHost, gameData, players, currentPhase, user, sairDoJogo } = useGame();
    const myUserId = user?.id;
    
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
        // Se estamos jogando, recupera meus inputs
        if (currentPhase === 'PLAYING' && gameData?.answers && gameData.answers[myUserId]) {
            setMyInputs(gameData.answers[myUserId]);
        }
    }, [gameData, myUserId, currentPhase]);

    const handleInputChange = (catIdx, val) => {
        const newInputs = { ...myInputs, [catIdx]: val };
        setMyInputs(newInputs);
        // Envia resposta (backend foi otimizado para aceitar)
        socket.emit('stop_answer', { roomId, answers: newInputs });
    };

    const callStop = () => {
        if (confirm("TEM CERTEZA QUE QUER GRITAR STOP?")) {
            socket.emit('stop_call', { roomId });
        }
    };

    const toggleInvalid = (targetId, catIdx) => {
        // Verifica se já invalidei antes
        const currentValidations = gameData.validations?.[targetId]?.[catIdx] || {};
        const myVote = currentValidations[myUserId]; 
        
        // Se myVote for false (inválido), eu quero tornar true (válido). E vice-versa.
        // Se undefined (nunca votei), assumo que quero invalidar (false).
        const newStatus = myVote === false ? true : false;

        socket.emit('stop_validate', { roomId, targetUserId: targetId, categoryIdx: catIdx, isValid: newStatus });
    };

    const categories = gameData?.categories || [];
    const letter = gameData?.letter || "?";

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center font-sans">
            
            {/* TOP BAR */}
            <div className="w-full max-w-4xl flex justify-between items-center bg-slate-800 p-4 rounded-2xl mb-6 shadow-lg border border-slate-700 sticky top-2 z-50">
                <div className="flex items-center gap-4">
                    <div className="bg-yellow-500 text-black w-12 h-12 rounded-xl flex items-center justify-center font-black text-3xl shadow-lg border-2 border-white animate-bounce">
                        {letter}
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase">Rodada {gameData?.round || 1}</p>
                        <p className="font-bold text-white text-sm">{currentPhase === 'PLAYING' ? 'VALENDO!' : 'PAUSADO'}</p>
                    </div>
                </div>
                {/* Timer (Opcional se tiver timer no server) */}
                {/* <div className="flex items-center gap-2 font-mono font-black text-2xl text-white">
                    <Clock size={24}/> {timer}s
                </div> */}
                <button onClick={sairDoJogo}><LogOut className="text-slate-500 hover:text-red-400"/></button>
            </div>

            {/* --- FASE 1: JOGANDO --- */}
            {currentPhase === 'PLAYING' && (
                <div className="w-full max-w-4xl animate-in fade-in">
                    <div className="grid gap-4 md:grid-cols-2 mb-24">
                        {categories.map((cat, idx) => (
                            <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm hover:border-slate-600 transition">
                                <label className="text-slate-400 text-xs font-bold uppercase mb-1 block tracking-wider">{cat}</label>
                                <input 
                                    className="w-full bg-slate-900 text-white font-bold text-lg p-3 rounded-lg border border-slate-600 focus:border-yellow-500 outline-none uppercase transition-colors"
                                    value={myInputs[idx] || ''}
                                    onChange={(e) => handleInputChange(idx, e.target.value)}
                                    placeholder={`Começa com ${letter}...`}
                                />
                            </div>
                        ))}
                    </div>
                    
                    {/* BOTÃO STOP FLUTUANTE */}
                    <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-auto z-50">
                        <button 
                            onClick={callStop}
                            className="w-full md:w-auto bg-red-600 hover:bg-red-500 text-white font-black text-2xl py-6 px-12 rounded-full shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse hover:animate-none active:scale-95 transition border-4 border-red-800 flex items-center justify-center gap-3"
                        >
                            <Hand size={32}/> STOP!
                        </button>
                    </div>
                </div>
            )}

            {/* --- FASE 2: VALIDAÇÃO --- */}
            {currentPhase === 'VALIDATION' && (
                <div className="w-full max-w-6xl animate-in slide-in-from-bottom pb-20">
                    <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl mb-6 text-center text-yellow-200 font-bold flex items-center justify-center gap-2 shadow-lg">
                        <AlertTriangle/> REVISÃO! Clique nas respostas inválidas para anular (ficam vermelhas).
                    </div>

                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-800/50">
                                    <th className="p-3 text-slate-400 font-bold uppercase text-xs border-b border-slate-700 sticky left-0 bg-slate-900 z-10">Jogador</th>
                                    {categories.map((cat, idx) => <th key={idx} className="p-3 text-slate-400 font-bold uppercase text-xs border-b border-slate-700 min-w-[120px]">{cat}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {players.map(p => (
                                    <tr key={p.userId} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                                        
                                        {/* Nome do Jogador */}
                                        <td className="p-3 font-bold flex items-center gap-2 sticky left-0 bg-slate-900 border-r border-slate-800 shadow-md">
                                            <span className={p.userId === myUserId ? "text-yellow-400" : "text-white"}>{p.nickname}</span>
                                            {gameData.stopperId === p.userId && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">STOPPER</span>}
                                        </td>

                                        {/* Células de Resposta */}
                                        {categories.map((cat, idx) => {
                                            const answer = gameData.answers?.[p.userId]?.[idx] || "";
                                            const votesObj = gameData.validations?.[p.userId]?.[idx] || {};
                                            const votes = Object.values(votesObj);
                                            
                                            // Calcula se está inválido (Maioria votou false)
                                            const invalidCount = votes.filter(v => v === false).length;
                                            const totalVotes = votes.length; // Ou total de jogadores
                                            const isInvalid = invalidCount > (players.length / 2); // Regra simples: > 50% rejeitou
                                            
                                            const myVote = votesObj[myUserId]; 
                                            // Se eu votei false, mostra feedback visual pessoal

                                            return (
                                                <td key={idx} className="p-1">
                                                    <button 
                                                        onClick={() => toggleInvalid(p.userId, idx)}
                                                        disabled={!answer} // Não clica em vazio
                                                        className={`w-full text-left p-3 rounded-lg transition relative group border font-mono text-sm
                                                            ${!answer ? 'bg-slate-800/30 text-slate-600 cursor-default' : 'cursor-pointer'}
                                                            ${myVote === false ? 'ring-2 ring-red-500' : ''} 
                                                            ${isInvalid 
                                                                ? 'bg-red-900/40 text-red-300 border-red-900 line-through decoration-red-500/50 decoration-2' 
                                                                : 'bg-slate-800 text-white border-transparent hover:bg-slate-700'}
                                                        `}
                                                    >
                                                        {answer || "-"}
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
                        <div className="fixed bottom-6 left-0 w-full flex justify-center z-50">
                            <button 
                                onClick={() => socket.emit('stop_finish_round', { roomId })} // CORRIGIDO: Evento certo
                                className="bg-green-600 hover:bg-green-500 text-white font-black py-4 px-12 rounded-full shadow-2xl shadow-green-900/50 text-lg flex items-center gap-3 transition transform hover:scale-105"
                            >
                                <CheckCircle size={24}/> FINALIZAR RODADA
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- FASE 3: PLACAR (SCORING) --- */}
            {currentPhase === 'SCORING' && (
                <div className="w-full max-w-2xl text-center animate-in zoom-in mt-10">
                    <h2 className="text-4xl font-black mb-2 text-white tracking-tighter">FIM DA RODADA</h2>
                    <p className="text-slate-400 mb-8 uppercase tracking-widest font-bold text-sm">Confira a pontuação parcial</p>
                    
                    <div className="space-y-3 mb-12">
                        {players.sort((a,b) => b.score - a.score).map((p, i) => (
                            <div key={p.userId} className={`flex justify-between items-center p-5 rounded-2xl border-l-8 shadow-xl transition hover:scale-102 ${i===0 ? 'bg-slate-800 border-yellow-500' : 'bg-slate-800/50 border-slate-600'}`}>
                                <div className="flex items-center gap-4">
                                    <span className={`font-black text-2xl w-8 text-right ${i===0 ? 'text-yellow-500' : 'text-slate-600'}`}>#{i+1}</span>
                                    <span className={`font-bold text-lg ${p.userId === myUserId ? 'text-white' : 'text-slate-300'}`}>{p.nickname}</span>
                                </div>
                                <span className="font-mono font-black text-3xl text-green-400 tracking-tighter">{p.score}</span>
                            </div>
                        ))}
                    </div>

                    {isHost ? (
                        <button 
                            onClick={() => socket.emit('stop_next', { roomId })} // CORRIGIDO: Evento certo
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-xl shadow-lg flex items-center gap-2 mx-auto transition"
                        >
                            <Play/> PRÓXIMA RODADA
                        </button>
                    ) : (
                        <p className="text-slate-500 animate-pulse uppercase font-bold text-xs tracking-widest">Aguardando Host iniciar...</p>
                    )}
                </div>
            )}
        </div>
    );
}