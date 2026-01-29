import React, { useState, useEffect, useRef } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket';
import { HelpCircle, Key, ArrowRight, Trophy, LogOut, Home, ListPlus, Star } from 'lucide-react';

export default function GameEnigma() {
    const { roomId, isHost, gameData, players, currentPhase, sairDoJogo } = useGame();
    const [guess, setGuess] = useState('');
    const [shake, setShake] = useState(false);
    const cluesEndRef = useRef(null);

    // Auto-scroll quando nova dica aparece
    useEffect(() => {
        cluesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [gameData?.visibleClues?.length]);

    useEffect(() => {
        socket.on('enigma_wrong', () => {
            setShake(true);
            setTimeout(() => setShake(false), 500);
        });
        return () => socket.off('enigma_wrong');
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if(guess.trim()) {
            socket.emit('enigma_guess', { roomId, guess });
            setGuess('');
        }
    };

    const revealNext = () => {
        socket.emit('enigma_reveal_clue', { roomId });
    };

    if (currentPhase === 'GAME_OVER') {
        const winner = players.sort((a,b) => b.score - a.score)[0];
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
                <Trophy size={64} className="text-yellow-400 mb-4 animate-bounce"/>
                <h1 className="text-3xl font-bold mb-2">FIM DO JOGO</h1>
                <p className="text-xl">Campeão: <span className="text-green-400 font-bold">{winner?.nickname}</span></p>
                <div className="mt-8 flex gap-4">
                    {isHost && <button onClick={() => socket.emit('start_game')} className="bg-green-600 px-6 py-3 rounded-xl font-bold hover:bg-green-500">Reiniciar</button>}
                    <button onClick={sairDoJogo} className="bg-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-600">Voltar ao Lobby</button>
                </div>
            </div>
        );
    }

    const cluesToShow = currentPhase === 'REVEAL' ? gameData?.allClues : gameData?.visibleClues;
    const canRevealMore = isHost && currentPhase === 'PLAYING' && (gameData?.visibleClues?.length < gameData?.totalClues);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center p-4 relative overflow-hidden font-sans">
            {/* Background */}
            <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                <div className="absolute top-10 left-10 text-9xl">?</div>
                <div className="absolute bottom-20 right-20 text-9xl">?</div>
            </div>

            {/* Header */}
            <div className="w-full max-w-2xl flex justify-between items-center mb-6 z-10 bg-slate-800/80 backdrop-blur p-4 rounded-2xl shadow-lg border border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="bg-yellow-500/20 p-2 rounded-lg"><Key className="text-yellow-500"/></div>
                    <div>
                        <h1 className="font-bold text-lg leading-none">PERFIL</h1>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rodada {gameData?.round}</span>
                    </div>
                </div>
                
                {currentPhase === 'PLAYING' && (
                    <div className="flex items-center gap-1 bg-green-900/50 px-3 py-1 rounded-full border border-green-500/30">
                        <Star size={14} className="text-yellow-400 fill-yellow-400"/>
                        <span className="text-xs font-bold text-green-300">Valendo {gameData?.currentPoints} pts</span>
                    </div>
                )}

                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white" title="Sair"><Home size={20}/></button>
            </div>

            {/* Área de Dicas */}
            <div className="w-full max-w-2xl flex-1 flex flex-col min-h-0 z-10">
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 mb-4 custom-scrollbar">
                    {cluesToShow?.map((clue, i) => (
                        <div key={i} className="bg-slate-800 border-l-4 border-yellow-500 p-4 rounded-r-xl shadow-md animate-in slide-in-from-left">
                            <div className="text-[10px] text-yellow-500 font-bold uppercase mb-1">Dica {i + 1}</div>
                            <div className="text-lg font-medium leading-snug">{clue}</div>
                        </div>
                    ))}
                    <div ref={cluesEndRef} />
                </div>

                {/* Controles do Jogo */}
                <div className="bg-slate-800/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl">
                    {currentPhase === 'PLAYING' ? (
                        <div className="flex flex-col gap-3">
                            <form onSubmit={handleSubmit} className={`relative flex gap-2 ${shake ? 'animate-shake' : ''}`}>
                                <input 
                                    className="flex-1 bg-slate-900 border-2 border-slate-600 focus:border-yellow-500 rounded-xl py-3 px-4 text-lg font-bold outline-none transition-all shadow-inner text-white placeholder:text-slate-600"
                                    placeholder="Quem sou eu?"
                                    value={guess}
                                    onChange={e => setGuess(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="bg-yellow-500 hover:bg-yellow-400 text-black p-3 rounded-xl font-bold transition shadow-lg">
                                    <ArrowRight size={24}/>
                                </button>
                            </form>
                            
                            {canRevealMore && (
                                <button onClick={revealNext} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition">
                                    <ListPlus size={14}/> Revelar Próxima Dica (-1 Ponto)
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="text-center animate-in zoom-in">
                            <div className="text-xs text-slate-400 uppercase font-bold mb-1">Resposta</div>
                            <div className="text-3xl font-black text-green-400 mb-4 uppercase tracking-wider bg-black/20 p-2 rounded-xl">
                                {gameData?.answer}
                            </div>
                            
                            <div className="bg-green-600 text-white px-4 py-2 rounded-lg inline-block mb-4 shadow-lg font-bold">
                                🎉 {gameData?.winner} (+{gameData?.winPoints} pts)
                            </div>

                            {isHost && (
                                <button onClick={() => socket.emit('enigma_next', { roomId })} className="w-full bg-white hover:bg-slate-200 text-slate-900 font-black py-3 rounded-xl shadow-lg transition uppercase tracking-wide">
                                    Próxima Carta
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Placar Rápido */}
            <div className="mt-4 flex gap-3 overflow-x-auto max-w-2xl w-full pb-2 scrollbar-hide z-10">
                {players.sort((a,b) => b.score - a.score).map((p) => (
                    <div key={p.userId} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${gameData?.winner === p.nickname ? 'bg-green-500/20 border-green-500 text-green-200' : 'bg-slate-800 border-slate-700'}`}>
                        <div className="w-2 h-2 rounded-full bg-current"/>
                        <span className="text-xs font-bold truncate max-w-[80px]">{p.nickname}</span>
                        <span className="text-xs font-black opacity-70 ml-1">{p.score}</span>
                    </div>
                ))}
            </div>

            <style>{`
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
            `}</style>
        </div>
    );
}