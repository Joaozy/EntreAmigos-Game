import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Eye, MapPin, UserSecret, Clock, Lock } from 'lucide-react';

export default function GameSpy({ players, isHost, roomId, gameData, phase }) {
  const [myRole, setMyRole] = useState(null);     // 'ESPIÃO' ou 'CIVIL'
  const [myLocation, setMyLocation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Escuta o segredo individual
  useEffect(() => {
    socket.on('spy_secret', (data) => {
        setMyRole(data.role);
        setMyLocation(data.location);
    });
    return () => socket.off('spy_secret');
  }, []);

  // Timer
  useEffect(() => {
      const timer = setInterval(() => {
          if (gameData?.endTime && phase === 'GAME') {
              const diff = Math.floor((gameData.endTime - Date.now()) / 1000);
              setTimeLeft(diff > 0 ? diff : 0);
          }
      }, 1000);
      return () => clearInterval(timer);
  }, [gameData, phase]);

  const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // TELA DE REVELAÇÃO (FIM DE JOGO)
  if (phase === 'REVEAL') {
      const spy = players.find(p => p.id === gameData.spyId);
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
              <div className="mb-8">
                  <h1 className="text-4xl font-black text-red-500 mb-2">FIM DE JOGO</h1>
                  <p className="text-slate-400">O local era:</p>
                  <h2 className="text-5xl font-black text-indigo-400 mt-2 bg-indigo-900/30 p-4 rounded-xl border border-indigo-500/50">{gameData.location}</h2>
              </div>
              
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-md">
                  <p className="text-slate-400 text-sm uppercase font-bold mb-4">O Espião era</p>
                  <div className="flex items-center justify-center gap-4">
                      <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-3xl font-bold">
                        {spy?.nickname[0]}
                      </div>
                      <span className="text-2xl font-bold">{spy?.nickname}</span>
                  </div>
              </div>

              {isHost && (
                  <button 
                    onClick={() => socket.emit('restart_game', { roomId })}
                    className="mt-10 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-8 rounded-full transition"
                  >
                      Voltar ao Lobby
                  </button>
              )}
          </div>
      );
  }

  // TELA DE JOGO
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
        {/* CABEÇALHO COM TIMER */}
        <div className="w-full max-w-md flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
            <div className="flex items-center gap-2">
                <Clock className={timeLeft < 60 ? "text-red-500 animate-pulse" : "text-emerald-400"} />
                <span className={`text-2xl font-mono font-bold ${timeLeft < 60 ? "text-red-500" : "text-white"}`}>
                    {formatTime(timeLeft)}
                </span>
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase">O Espião</div>
        </div>

        {/* CARTÃO DE IDENTIDADE */}
        <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden animate-in zoom-in duration-500">
            <div className={`absolute top-0 left-0 w-full h-4 ${myRole === 'ESPIÃO' ? 'bg-red-500' : 'bg-indigo-500'}`}></div>
            
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">SUA IDENTIDADE</p>
            
            {myRole === 'ESPIÃO' ? (
                <div className="flex flex-col items-center">
                    <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                         <UserSecret size={48} />
                    </div>
                    <h1 className="text-4xl font-black text-red-600 mb-2">VOCÊ É O ESPIÃO!</h1>
                    <p className="text-slate-500 font-medium">Descubra o local sem ser descoberto.</p>
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <div className="w-24 h-24 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                         <MapPin size={48} />
                    </div>
                    <h1 className="text-3xl font-black text-indigo-900 mb-2">{myLocation || "Carregando..."}</h1>
                    <p className="text-slate-500 font-medium">Encontre o espião fazendo perguntas.</p>
                </div>
            )}
        </div>

        {/* LISTA DE JOGADORES (Para lembrar quem está jogando) */}
        <div className="mt-8 w-full max-w-md">
            <h3 className="text-slate-500 text-xs font-bold uppercase mb-2 ml-2">Suspeitos</h3>
            <div className="grid grid-cols-2 gap-2">
                {players.map(p => (
                    <div key={p.id} className="bg-slate-800 p-2 rounded flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold">{p.nickname[0]}</div>
                        <span className="text-sm font-bold text-slate-300 truncate">{p.nickname}</span>
                    </div>
                ))}
            </div>
        </div>

        {/* BOTÃO DE REVELAR (HOST) */}
        {isHost && (
            <button 
                onClick={() => socket.emit('spy_reveal', { roomId })}
                className="mt-8 bg-red-600/20 hover:bg-red-600/40 text-red-200 border border-red-900/50 font-bold py-4 px-8 rounded-xl transition w-full max-w-md flex items-center justify-center gap-2"
            >
                <Lock size={18} /> REVELAR IDENTIDADE
            </button>
        )}
    </div>
  );
}