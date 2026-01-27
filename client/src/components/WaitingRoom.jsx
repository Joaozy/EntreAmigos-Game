import React from 'react';
import { useGame } from '../context/GameContext';

export default function WaitingRoom() {
  const { roomId, players, isHost, selectedGame, socket, sairDoJogo } = useGame();

  const handleStart = () => {
    socket.emit('start_game', { roomId });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomId);
    alert("Código copiado!");
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center justify-center text-white">
      
      {/* HEADER DA SALA */}
      <div className="text-center mb-8">
        <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase mb-2">SALA DE ESPERA</h2>
        <h1 className="text-4xl font-black text-indigo-500 mb-4">{selectedGame}</h1>
        
        <div 
          onClick={copyCode}
          className="bg-slate-800 border-2 border-indigo-500/30 rounded-2xl p-4 inline-flex items-center gap-4 cursor-pointer hover:bg-slate-700 transition"
        >
          <span className="text-3xl font-mono font-bold tracking-wider">{roomId}</span>
          <span className="text-xs bg-indigo-600 px-2 py-1 rounded text-white font-bold">COPIAR</span>
        </div>
      </div>

      {/* LISTA DE JOGADORES */}
      <div className="w-full max-w-md bg-slate-800 rounded-3xl p-6 shadow-2xl mb-8">
        <h3 className="text-slate-400 font-bold text-sm mb-4 uppercase flex justify-between">
          <span>Jogadores</span>
          <span>{players.length} Online</span>
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          {players.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 bg-slate-700 p-3 rounded-xl">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${p.isHost ? 'bg-yellow-500 text-black' : 'bg-indigo-500 text-white'}`}>
                {p.nickname[0].toUpperCase()}
              </div>
              <div className="truncate">
                <p className="font-bold text-sm truncate">{p.nickname}</p>
                {p.isHost && <p className="text-[10px] text-yellow-400 font-bold uppercase">HOST</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOTÕES DE AÇÃO */}
      <div className="w-full max-w-md space-y-3">
        {isHost ? (
          <button 
            onClick={handleStart}
            className="w-full bg-green-500 hover:bg-green-400 text-white font-black py-4 rounded-xl shadow-lg shadow-green-500/20 transition transform active:scale-95 text-xl"
          >
            INICIAR PARTIDA 🚀
          </button>
        ) : (
          <div className="text-center p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-pulse">
            <p className="text-slate-400 font-bold">Aguardando o host iniciar...</p>
          </div>
        )}

        <button 
          onClick={sairDoJogo}
          className="w-full text-slate-500 font-bold text-sm py-4 hover:text-red-400 transition"
        >
          SAIR DA SALA
        </button>
      </div>
    </div>
  );
}