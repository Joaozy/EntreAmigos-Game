import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Film, Send, Trophy } from 'lucide-react';

export default function GameCinemoji({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [shake, setShake] = useState(false);

  const submitGuess = (e) => {
      e.preventDefault();
      if (!guess.trim()) return;
      socket.emit('cinemoji_guess', { roomId, guess });
      setGuess('');
      // Feedback visual simples
      setShake(true); setTimeout(() => setShake(false), 200);
  };

  // Ordena placar
  const sortedPlayers = [...players].sort((a,b) => (gameData.score?.[b.id] || 0) - (gameData.score?.[a.id] || 0));

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center font-sans">
        <h1 className="text-3xl font-black text-yellow-400 mb-6 flex items-center gap-2">
            <Film /> CINEMOJI
        </h1>

        {/* ÁREA DO DESAFIO */}
        <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl p-10 text-center shadow-2xl mb-8 transform transition-all hover:scale-105">
            {phase === 'ROUND_WIN' ? (
                <div className="animate-in zoom-in">
                    <p className="text-slate-400 font-bold uppercase text-xs mb-2">RESPOSTA CORRETA!</p>
                    <h2 className="text-2xl font-black text-emerald-600 mb-2">{gameData.lastWinner?.answer}</h2>
                    <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-full inline-block font-bold text-sm">
                        🏆 Ponto para {gameData.lastWinner?.nickname}
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-slate-400 font-bold uppercase text-xs mb-4 tracking-widest">QUE FILME É ESSE?</p>
                    <div className="text-6xl md:text-8xl animate-bounce">{gameData.emojis}</div>
                </>
            )}
        </div>

        {/* INPUT */}
        <div className="w-full max-w-md mb-8">
            <form onSubmit={submitGuess} className={`flex gap-2 transition-transform ${shake ? 'translate-x-2' : ''}`}>
                <input 
                    className="flex-1 bg-slate-800 border-2 border-slate-700 text-white rounded-xl px-4 py-4 text-lg outline-none focus:border-yellow-400 focus:bg-slate-900 transition placeholder:text-slate-500 uppercase font-bold"
                    placeholder="DIGITE O NOME do filme..."
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    autoFocus
                    disabled={phase === 'ROUND_WIN'}
                />
                <button className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold px-6 rounded-xl transition" disabled={phase === 'ROUND_WIN'}>
                    <Send />
                </button>
            </form>
        </div>

        {/* PLACAR */}
        <div className="w-full max-w-md bg-slate-800 rounded-xl p-4">
            <h3 className="text-slate-400 text-xs font-bold uppercase mb-4 flex items-center gap-2"><Trophy size={14}/> Ranking</h3>
            <div className="space-y-2">
                {sortedPlayers.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
                        <div className="flex items-center gap-3">
                            <span className={`font-bold w-6 text-center ${i === 0 ? 'text-yellow-400' : 'text-slate-500'}`}>#{i+1}</span>
                            <span className="font-bold">{p.nickname}</span>
                        </div>
                        <span className="font-mono font-bold text-yellow-400 text-xl">{gameData.score?.[p.id] || 0}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}