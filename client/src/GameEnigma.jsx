import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Search, Send, Lock, Unlock, Trophy, ArrowRight, Loader2, Clock, CheckCircle } from 'lucide-react';

export default function GameEnigma({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [shake, setShake] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameData?.clues?.length, phase]);

  useEffect(() => {
      const handleWrong = () => {
          setShake(true);
          setGuess('');
          setTimeout(() => setShake(false), 500);
      };
      socket.on('enigma_wrong', handleWrong);
      return () => socket.off('enigma_wrong', handleWrong);
  }, []);

  const sendGuess = (e) => {
      e.preventDefault();
      if(guess.trim()) {
          socket.emit('enigma_guess', { roomId, guess });
      }
  };

  const nextClue = () => socket.emit('enigma_next_clue', { roomId });

  if (!gameData || !gameData.clues) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white gap-2"><Loader2 className="animate-spin text-emerald-500"/> Carregando Mistério...</div>;

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
                <p className="text-[10px] text-slate-400 font-bold uppercase">VALE</p>
                <p className="font-mono text-2xl font-bold text-yellow-400">{gameData.currentValue} pts</p>
            </div>
        </div>

        {/* ÁREA DE PISTAS */}
        <div className="flex-1 w-full max-w-2xl flex flex-col overflow-hidden mb-4 relative">
            <div 
                ref={scrollRef}
                className="flex-1 bg-slate-800/50 rounded-2xl p-4 overflow-y-auto space-y-4 custom-scrollbar border border-slate-700 shadow-inner"
            >
                {clues.map((clue, i) => (
                    <div key={i} className="flex gap-3 animate-in slide-in-from-left fade-in duration-500">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900 text-emerald-400 flex items-center justify-center font-bold font-mono border border-emerald-700 shadow-sm">
                            {i + 1}
                        </div>
                        <div className="bg-slate-700 p-4 rounded-r-2xl rounded-bl-2xl text-lg font-medium shadow-md flex-1 border border-slate-600">
                            {clue}
                        </div>
                    </div>
                ))}
                
                {/* RESULTADO DA RODADA */}
                {phase === 'ROUND_END' && (
                    <div className="mt-8 p-6 bg-emerald-900/30 border-2 border-emerald-500 rounded-2xl text-center animate-in zoom-in shadow-2xl">
                        <p className="text-emerald-400 text-xs font-bold uppercase mb-2 tracking-widest">A RESPOSTA ERA</p>
                        <h2 className="text-3xl md:text-4xl font-black text-white uppercase mb-6 tracking-wide drop-shadow-md">{gameData.answer}</h2>
                        
                        {gameData.roundWinner ? (
                            <div className="inline-flex items-center gap-3 bg-slate-900/50 px-6 py-3 rounded-full border border-emerald-500/30">
                                <Trophy size={24} className="text-yellow-400"/>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold text-left">Acertou</p>
                                    <p className="font-bold text-white text-lg">{players.find(p=>p.id === gameData.roundWinner)?.nickname || "Alguém"}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-slate-400 text-sm bg-black/20 p-2 rounded-lg inline-block">Ninguém acertou esta.</p>
                        )}
                        
                        <div className="mt-6 flex justify-center items-center gap-2 text-slate-400 text-xs animate-pulse font-mono">
                            <Clock size={14}/> Próxima rodada em instantes...
                        </div>
                    </div>
                )}
                <div className="h-4"></div>
            </div>
        </div>

        {/* INPUT DE RESPOSTA */}
        {phase === 'CLUES' && (
            <div className="w-full max-w-2xl bg-slate-800 p-4 rounded-2xl shadow-xl border-t border-slate-700">
                <form onSubmit={sendGuess} className={`w-full flex gap-2 transition-transform ${shake ? 'animate-shake' : ''}`}>
                    <div className="relative flex-1">
                        <input 
                            className={`w-full bg-slate-900 border-2 rounded-xl px-4 py-4 pl-12 text-lg outline-none transition text-white placeholder:text-slate-600 font-bold
                            ${shake ? 'border-red-500 text-red-200' : 'border-slate-600 focus:border-emerald-500'}
                            ${isLocked ? 'opacity-50 cursor-not-allowed bg-slate-950' : ''}`}
                            placeholder={isLocked ? "Aguardando próxima dica..." : "Digite sua resposta..."}
                            value={guess} 
                            onChange={e => { setGuess(e.target.value); if(shake) setShake(false); }} 
                            disabled={isLocked}
                            autoFocus
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                            {isLocked ? <Lock size={20} className="text-red-500"/> : <Unlock size={20} className="text-emerald-500"/>}
                        </div>
                    </div>
                    <button 
                        disabled={isLocked || !guess.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 rounded-xl font-black transition transform active:scale-95 shadow-lg"
                    >
                        <Send />
                    </button>
                </form>
                
                {isHost && (
                    <div className="mt-4 flex justify-end">
                        <button 
                            onClick={nextClue}
                            disabled={clues.length >= 10}
                            className="text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest transition flex items-center gap-1 disabled:opacity-0 bg-slate-700/50 hover:bg-slate-700 px-3 py-1 rounded-full"
                        >
                            Pular Dica <ArrowRight size={12}/>
                        </button>
                    </div>
                )}
            </div>
        )}

        {/* PLACAR SIMPLIFICADO */}
        <div className="w-full max-w-2xl mt-6 overflow-x-auto no-scrollbar pb-4">
             <div className="flex gap-3">
                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                    <div key={p.id} className={`bg-slate-800 p-2 px-4 rounded-xl min-w-[100px] flex flex-col items-center border border-slate-700 ${i===0 ? 'border-yellow-500/50 bg-yellow-900/10' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                            {i===0 && <Trophy size={12} className="text-yellow-400"/>}
                            <span className="font-bold text-xs text-slate-300 truncate max-w-[80px]">{p.nickname}</span>
                        </div>
                        <span className="text-emerald-400 font-mono font-black text-lg">{p.score}</span>
                    </div>
                ))}
             </div>
        </div>
    </div>
  );
}