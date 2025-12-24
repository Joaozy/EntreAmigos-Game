import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Film, Send, Clock, Trophy } from 'lucide-react';

export default function GameCinemoji({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [timer, setTimer] = useState(60); // Estado do Timer

  useEffect(() => {
    // Listener do Timer
    const handleTimer = (t) => setTimer(t);
    socket.on('cinemoji_timer', handleTimer);

    return () => {
        socket.off('cinemoji_timer', handleTimer);
    };
  }, []);

  const sendGuess = (e) => {
      e.preventDefault();
      if(guess.trim()) {
          socket.emit('cinemoji_guess', { roomId, guess });
          setGuess('');
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
        {/* CABEÇALHO */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl shadow-lg">
            <h1 className="text-2xl font-black text-yellow-400 flex items-center gap-2"><Film /> CINEMOJI</h1>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <p className="text-xs text-slate-400 font-bold uppercase">RODADA</p>
                    <p className="font-mono text-xl">{gameData.round || 1}</p>
                </div>
                {/* TIMER VISUAL */}
                <div className="flex flex-col items-center">
                    <Clock size={20} className={`${timer < 10 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`font-mono font-bold text-lg ${timer < 10 ? 'text-red-500' : 'text-white'}`}>{timer}s</span>
                </div>
            </div>
        </div>

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center animate-in zoom-in">
            
            {/* EMOJIS (O FILME) */}
            <div className="bg-white text-slate-900 p-8 rounded-3xl shadow-2xl mb-8 w-full text-center">
                <div className="text-6xl md:text-8xl tracking-widest mb-4 animate-bounce-slow">
                    {gameData.emojis || "..."}
                </div>
                
                {/* RESPOSTA REVELADA */}
                {phase === 'REVEAL' && (
                    <div className="animate-in slide-in-from-bottom fade-in duration-500">
                        <p className="text-slate-400 text-xs font-bold uppercase mb-1">O FILME ERA</p>
                        <h2 className="text-3xl font-black text-indigo-600 uppercase">{gameData.title}</h2>
                    </div>
                )}
            </div>

            {/* LISTA DE VENCEDORES DA RODADA */}
            {gameData.winners && gameData.winners.length > 0 && (
                <div className="mb-6 flex gap-2 flex-wrap justify-center">
                    {gameData.winners.map(winner => (
                        <span key={winner} className="bg-emerald-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-in zoom-in">
                            <Trophy size={12} className="text-yellow-300"/> {winner}
                        </span>
                    ))}
                </div>
            )}

            {/* INPUT DE RESPOSTA */}
            {phase === 'GUESSING' && (
                <form onSubmit={sendGuess} className="w-full flex gap-2">
                    <input 
                        className="flex-1 bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-4 text-lg outline-none focus:border-yellow-400 transition text-white placeholder:text-slate-500" 
                        placeholder="Qual é o nome do filme?" 
                        value={guess} 
                        onChange={e => setGuess(e.target.value)} 
                        autoFocus
                    />
                    <button className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-6 rounded-xl font-black transition transform hover:scale-105">
                        <Send />
                    </button>
                </form>
            )}
        </div>

        {/* PLACAR GERAL */}
        <div className="w-full max-w-4xl mt-8 overflow-x-auto">
             <div className="flex gap-4 pb-4">
                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                    <div key={p.id} className="bg-slate-800 p-3 rounded-xl min-w-[100px] flex flex-col items-center border border-slate-700">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${i===0 ? 'bg-yellow-400 text-black' : 'bg-slate-600'}`}>
                            {i===0 ? '1º' : i+1}
                        </div>
                        <span className="font-bold truncate max-w-[80px]">{p.nickname}</span>
                        <span className="text-yellow-400 font-mono font-bold text-lg">{p.score}</span>
                    </div>
                ))}
             </div>
        </div>
    </div>
  );
}