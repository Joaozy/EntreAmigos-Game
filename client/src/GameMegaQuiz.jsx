import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket';
import { Trophy, Clock, CheckCircle, XCircle, Home, RotateCcw, LogOut, Skull, Heart, Zap, Sword } from 'lucide-react';

export default function GameMegaQuiz() {
    const { roomId, isHost, gameData, players, currentPhase, sairDoJogo } = useGame();
    
    const [timer, setTimer] = useState(20);
    const [selectedOption, setSelectedOption] = useState(null);
    const [lastRoundResult, setLastRoundResult] = useState(null);

    // Listeners do Socket
    useEffect(() => {
        const onTimer = (t) => setTimer(t);
        const onRoundEnd = (data) => setLastRoundResult(data);
        
        socket.on('megaquiz_timer', onTimer);
        socket.on('megaquiz_round_end', onRoundEnd);

        return () => {
            socket.off('megaquiz_timer', onTimer);
            socket.off('megaquiz_round_end', onRoundEnd);
        };
    }, []);

    // Reset visual ao mudar de fase
    useEffect(() => {
        if (currentPhase === 'QUESTION' || currentPhase === 'PRE_ROUND') {
            setSelectedOption(null);
            if(currentPhase === 'PRE_ROUND') setLastRoundResult(null);
        }
    }, [currentPhase]);

    const handleAnswer = (index) => {
        if (selectedOption !== null) return;
        setSelectedOption(index);
        socket.emit('megaquiz_answer', { roomId, answerIdx: index });
    };

    // --- TELA DE VITÓRIA ---
    if (currentPhase === 'VICTORY' || (gameData && gameData.winner)) {
        const winner = gameData.winner || players[0];
        
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl animate-in zoom-in duration-500 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-yellow-400 via-pink-500 to-indigo-500"></div>
                    
                    <Trophy className="w-24 h-24 mx-auto text-yellow-400 drop-shadow-lg mb-4 animate-bounce" />
                    <h1 className="text-4xl font-black text-slate-800 mb-2 uppercase tracking-tighter">FIM DE JOGO!</h1>
                    
                    <div className="bg-slate-100 rounded-2xl p-6 my-6 border-2 border-slate-200">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">Grande Vencedor</p>
                        <p className="text-4xl font-black text-indigo-600">{winner?.nickname || "..."}</p>
                        <div className="inline-block bg-yellow-400 text-black font-black px-4 py-1 rounded-full text-sm mt-2 shadow-sm">
                            {gameData.mode === 'SURVIVAL' ? `${winner.lives || 0} VIDAS` : `${winner.score} PONTOS`}
                        </div>
                    </div>

                    {isHost ? (
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => socket.emit('request_restart', { roomId })} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition">
                                <RotateCcw size={18}/> Reiniciar
                            </button>
                            <button onClick={sairDoJogo} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition">
                                <Home size={18}/> Lobby
                            </button>
                        </div>
                    ) : (
                        <button onClick={sairDoJogo} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition">Sair</button>
                    )}
                </div>
            </div>
        );
    }

    // --- TELA DE JOGO ---
    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4 font-sans selection:bg-indigo-500 selection:text-white">
            
            {/* TOP BAR */}
            <div className="w-full max-w-3xl flex justify-between items-center bg-slate-900 p-4 rounded-2xl mb-4 shadow-lg border border-slate-800">
                <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider shadow-inner flex items-center gap-2
                        ${gameData?.mode === 'SURVIVAL' ? 'bg-red-600' : 'bg-purple-600'}`}>
                        {gameData?.mode === 'SURVIVAL' ? <><Heart size={14}/> SOBREVIVÊNCIA</> : <><Sword size={14}/> BATALHA</>}
                    </div>
                    {gameData?.round && <span className="text-slate-400 font-mono text-sm font-bold">Rodada {gameData.round}</span>}
                </div>
                {currentPhase === 'QUESTION' && (
                    <div className={`flex items-center gap-2 font-mono font-black text-2xl ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        <Clock size={24}/> {timer}
                    </div>
                )}
                <button onClick={sairDoJogo}><LogOut size={20} className="text-slate-500 hover:text-red-400 transition"/></button>
            </div>

            {/* AVISO DE EVENTO ESPECIAL */}
            {gameData?.specialEvent && currentPhase !== 'VICTORY' && (
                <div className={`w-full max-w-3xl mb-6 p-4 rounded-xl text-center font-black uppercase tracking-widest animate-pulse shadow-lg flex items-center justify-center gap-3
                    ${gameData.specialEvent === 'DOUBLE_DAMAGE' ? 'bg-red-600/20 text-red-400 border border-red-600/50' : ''}
                    ${gameData.specialEvent === 'HEALING' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : ''}
                    ${gameData.specialEvent === 'STEAL' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : ''}
                    ${gameData.specialEvent === 'SUDDEN_DEATH' ? 'bg-purple-900/50 text-red-500 border-2 border-red-500 shadow-red-900/50' : ''}
                `}>
                    {gameData.specialEvent === 'DOUBLE_DAMAGE' && <><Skull size={24}/> Dano Dobrado! Cuidado!</>}
                    {gameData.specialEvent === 'HEALING' && <><Heart size={24}/> Rodada de Cura! Acerte e ganhe!</>}
                    {gameData.specialEvent === 'STEAL' && <><Zap size={24}/> Hora do Roubo! Acerte para roubar!</>}
                    {gameData.specialEvent === 'SUDDEN_DEATH' && <><Skull size={24}/> MORTE SÚBITA! SEJA O PRIMEIRO!</>}
                </div>
            )}

            <div className="w-full max-w-3xl flex-1 flex flex-col">
                {/* ÁREA DA PERGUNTA */}
                {(currentPhase === 'QUESTION' || currentPhase === 'RESULT') && gameData?.currentQuestion ? (
                    <div className="animate-in fade-in zoom-in duration-300">
                        
                        {/* CAIXA DA PERGUNTA */}
                        <div className="bg-slate-800 border-2 border-indigo-500 p-8 rounded-3xl shadow-2xl mb-6 min-h-[160px] flex items-center justify-center text-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
                            <h2 className="text-2xl md:text-3xl font-black leading-snug text-white">
                                {gameData.currentQuestion.question || "Carregando pergunta..."}
                            </h2>
                        </div>

                        {/* OPÇÕES */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {gameData.currentQuestion.options && gameData.currentQuestion.options.map((opt, idx) => {
                                let btnClass = "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200";
                                let icon = null;

                                if (currentPhase === 'RESULT' && lastRoundResult) {
                                    if (idx === lastRoundResult.correctAnswer) {
                                        btnClass = "bg-green-600 border-green-500 text-white ring-4 ring-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.4)]";
                                        icon = <CheckCircle className="ml-2"/>;
                                    } else if (idx === selectedOption) {
                                        btnClass = "bg-red-600 border-red-500 text-white opacity-80";
                                        icon = <XCircle className="ml-2"/>;
                                    } else {
                                        btnClass = "bg-slate-800 opacity-40 grayscale";
                                    }
                                } 
                                else if (selectedOption === idx) {
                                    btnClass = "bg-indigo-600 border-indigo-500 text-white ring-2 ring-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]";
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleAnswer(idx)}
                                        disabled={currentPhase !== 'QUESTION' || selectedOption !== null}
                                        className={`p-6 rounded-2xl text-lg font-bold transition-all transform duration-200 border-b-4 active:border-b-0 active:translate-y-1 flex items-center justify-between ${btnClass} ${selectedOption === null ? 'hover:scale-[1.02]' : ''}`}
                                    >
                                        <span className="text-left leading-tight">{opt}</span>
                                        {icon}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    // PRE_ROUND
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        {currentPhase === 'PRE_ROUND' ? (
                            <>
                                <div className="text-5xl font-black text-white animate-bounce mb-6 tracking-tight">PREPARE-SE</div>
                                <p className="text-indigo-400 font-bold uppercase tracking-widest animate-pulse">A próxima rodada já vai começar...</p>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs uppercase font-bold tracking-widest">Aguardando Servidor</span>
                            </div>
                        )}
                    </div>
                )}

                {/* RESULTADO DA RODADA */}
                {currentPhase === 'RESULT' && lastRoundResult && (
                    <div className="mt-8 bg-black/60 backdrop-blur-md p-6 rounded-2xl border border-white/10 animate-in slide-in-from-bottom fade-in shadow-2xl">
                        <h3 className="text-indigo-300 font-bold mb-3 uppercase tracking-widest text-xs border-b border-white/10 pb-2">Resumo da Rodada</h3>
                        <div className="space-y-2">
                            {lastRoundResult.logs?.slice(0, 4).map((log, i) => ( 
                                <div key={i} className="text-sm font-medium flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                                    <span className={`w-2 h-2 rounded-full ${log.includes('acertou') || log.includes('curou') ? 'bg-green-500' : 'bg-red-500'}`}></span> 
                                    <span className="text-slate-200">{log}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* BARRA INFERIOR DE JOGADORES */}
            <div className="fixed bottom-0 left-0 w-full bg-slate-950/90 border-t border-slate-800 p-4 backdrop-blur-md z-10 pb-6">
                <div className="flex gap-4 overflow-x-auto justify-center no-scrollbar max-w-5xl mx-auto items-end">
                    {players.sort((a,b) => b.score - a.score).map(p => {
                        const isDead = (gameData?.mode === 'SURVIVAL' && p.lives <= 0) || (gameData?.mode === 'BATTLE' && p.score <= 0);
                        
                        return (
                            <div key={p.userId} className={`flex flex-col items-center min-w-[60px] transition-all duration-500 ${isDead ? 'opacity-40 grayscale scale-90' : 'scale-100'}`}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold mb-2 border-2 relative shadow-lg transform transition-transform
                                    ${gameData.answers?.[p.socketId] !== undefined && currentPhase === 'QUESTION' ? 'bg-green-600 border-green-400 -translate-y-2' : 'bg-slate-800 border-slate-700'}`}>
                                    
                                    {isDead ? <Skull size={20} className="text-slate-500"/> : <span className="text-xl">{p.nickname[0].toUpperCase()}</span>}
                                    
                                    {/* Indicador de Host */}
                                    {p.isHost && <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">HOST</div>}
                                </div>
                                
                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-[80px] uppercase tracking-wider mb-1">{p.nickname}</span>
                                
                                <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-black
                                    ${isDead ? 'bg-red-900/50 text-red-500' : 'bg-slate-800 text-yellow-400 border border-slate-700'}`}>
                                    {gameData?.mode === 'SURVIVAL' ? '❤️'.repeat(Math.max(0, p.lives || 0)) : `${p.score}`}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}