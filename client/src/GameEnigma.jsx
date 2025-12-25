import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Search, Send, Lock, Unlock, Trophy, ArrowRight, Loader2, Clock } from 'lucide-react';

export default function GameEnigma({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [shake, setShake] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameData?.clues?.length]);

  useEffect(() => {
      const handleWrong = () => {
          setShake(true);
          setTimeout(() => setShake(false), 500);
      };
      socket.on('enigma_wrong', handleWrong);
      return () => socket.off('enigma_wrong', handleWrong);
  }, []);

  const sendGuess = (e) => {
      e.preventDefault();
      if(guess.trim()) {
          socket.emit('enigma_guess', { roomId, guess });
          setGuess('');
      }
  };

  const nextClue = () => socket.emit('enigma_next_clue', { roomId });

  if (!gameData || !gameData.clues) return <div className="text-center mt-20 text-white"><Loader2 className="animate-spin mx-auto"/> Carregando Enigma...</div>;

  const isLocked = gameData.lockedPlayers?.includes(socket.id);
  const clues = gameData.clues || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
        
        {/* HEADER */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-xl shadow-lg border-b-4 border-emerald-600">
            <h1 className="text-2xl font-black text-emerald-400 flex items-center gap-2 tracking-tighter">
                <Search strokeWidth={3} /> ENIGMA
            </h1>
            <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">VALENDO</p>
                <p className="font-mono text-2xl font-bold text-yellow-400">{gameData.currentValue} pts</p>
            </div>
        </div>

        {/* ÁREA DE PISTAS */}
        <div className="flex-1 w-full max-w-2xl flex flex-col overflow-hidden mb-4">
            <div 
                ref={scrollRef}
                className="flex-1 bg-slate-800/50 rounded-2xl p-4 overflow-y-auto space-y-3 custom-scrollbar border border-slate-700"
            >
                {clues.map((clue, i) => (
                    <div key={i} className="flex gap-3 animate-in slide-in-from-left fade-in duration-500">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900 text-emerald-400 flex items-center justify-center font-bold font-mono border border-emerald-700">
                            {i + 1}
                        </div>
                        <div className="bg-slate-700 p-3 rounded-r-xl rounded-bl-xl text-lg font-medium shadow-sm flex-1">
                            {clue}
                        </div>
                    </div>
                ))}
                
                {phase === 'ROUND_END' && (
                    <div className="mt-8 p-6 bg-emerald-900/30 border-2 border-emerald-500 rounded-2xl text-center animate-in zoom-in">
                        <p className="text-emerald-400 text-xs font-bold uppercase mb-2">A RESPOSTA ERA</p>
                        <h2 className="text-3xl font-black text-white uppercase mb-4">{gameData.answer}</h2>
                        
                        {gameData.roundWinner ? (
                            <div className="flex justify-center items-center gap-2 text-yellow-400 font-bold bg-black/20 p-2 rounded-lg inline-flex">
                                <Trophy size={20}/> Vencedor: {gameData.roundWinner}
                            </div>
                        ) : (
                            <p className="text-slate-400 text-sm">Ninguém acertou.</p>
                        )}
                        
                        <div className="mt-4 flex justify-center items-center gap-2 text-slate-400 text-xs animate-pulse">
                            <Clock size={12}/> Próxima rodada em instantes...
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* CONTROLES DO HOST (Apenas Pular Dica) */}
        {isHost && phase === 'CLUES' && (
            <button 
                onClick={nextClue}
                disabled={clues.length >= 10}
                className="mb-4 text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest transition flex items-center gap-1 disabled:opacity-0"
            >
                Forçar Próxima Dica <ArrowRight size={12}/>
            </button>
        )}

        {/* ÁREA DE INPUT */}
        {phase === 'CLUES' && (
            <div className="w-full max-w-2xl">
                <form onSubmit={sendGuess} className={`w-full flex gap-2 transition-transform ${shake ? 'animate-shake' : ''}`}>
                    <div className="relative flex-1">
                        <input 
                            className={`w-full bg-slate-800 border-2 rounded-xl px-4 py-4 pl-12 text-lg outline-none transition text-white placeholder:text-slate-500
                            ${shake ? 'border-red-500 text-red-200' : 'border-slate-700 focus:border-emerald-500'}
                            ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            placeholder={isLocked ? "Você já chutou nesta dica..." : "Qual é a resposta?"}
                            value={guess} 
                            onChange={e => { setGuess(e.target.value); if(shake) setShake(false); }} 
                            disabled={isLocked}
                            autoFocus
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                            {isLocked ? <Lock size={20} className="text-red-500"/> : <Unlock size={20}/>}
                        </div>
                    </div>
                    <button 
                        disabled={isLocked || !guess.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 rounded-xl font-black transition transform active:scale-95"
                    >
                        <Send />
                    </button>
                </form>
                {isLocked && <p className="text-center text-slate-500 text-xs font-bold mt-2">Aguardando outros jogadores ou próxima dica...</p>}
            </div>
        )}

        {/* PLACAR */}
        <div className="w-full max-w-4xl mt-6 overflow-x-auto no-scrollbar pb-8">
             <div className="flex gap-4">
                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                    <div key={p.id} className="bg-slate-800 p-3 rounded-xl min-w-[100px] flex flex-col items-center border border-slate-700">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${i===0 ? 'bg-yellow-400 text-black' : 'bg-slate-600'}`}>
                            {i===0 ? '1º' : i+1}
                        </div>
                        <span className="font-bold truncate max-w-[80px] text-sm">{p.nickname}</span>
                        <span className="text-emerald-400 font-mono font-bold text-lg">{p.score}</span>
                    </div>
                ))}
             </div>
        </div>

        <style>{`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.3s ease-in-out; }
        `}</style>
    </div>
  );
}