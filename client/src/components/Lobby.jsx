import React from 'react';
import { useGame } from '../context/GameContext';
import { Trash2, LogOut } from 'lucide-react';
import Chat from '../Chat';

export default function Lobby() {
  const { players, roomId, isHost, sairDoJogo, socket, selectedGame } = useGame();

  const iniciar = () => socket.emit('start_game', { roomId });
  const expulsar = (targetId) => { if(confirm("Expulsar?")) socket.emit('kick_player', { roomId, targetId }); };
  
  // Regra de min players
  const minPlayers = (selectedGame === 'TERMO' || selectedGame === 'STOP') ? 1 : 2; // Ajuste conforme lógica do servidor
  // Nota: selectedGame pode estar desatualizado se entrou via código, melhor usar gameType do context se disponível, mas no lobby inicial o gameType já veio do server.
  
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative animate-in zoom-in-95">
        <div className="flex justify-between items-start mb-6"><button onClick={sairDoJogo} className="text-xs font-bold text-red-400 hover:text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1"><LogOut size={12}/> SAIR</button><h1 className="text-4xl font-black text-slate-800 cursor-pointer" onClick={() => navigator.clipboard.writeText(roomId)}>{roomId}</h1><div className="w-8"></div></div>
        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl"><h3 className="font-bold text-slate-500 text-sm uppercase mb-4">Jogadores ({players.length})</h3><ul className="space-y-3">{players.map(p => (<li key={p.id} className="flex items-center gap-3 group"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${p.isHost ? 'bg-slate-800' : 'bg-slate-400'}`}>{p.nickname[0].toUpperCase()}</div><span className="font-bold text-slate-700 flex-1">{p.nickname}</span>{isHost && !p.isHost && <button onClick={() => expulsar(p.id)} className="text-red-300 hover:text-red-500"><Trash2 size={16} /></button>}</li>))}</ul></div>
        {isHost ? (
          <button className="w-full text-white bg-slate-800 p-4 rounded-xl font-bold text-lg shadow-xl hover:scale-105 transition disabled:opacity-50" onClick={iniciar} disabled={players.length < 1}>INICIAR JOGO 🚀</button>
        ) : (<div className="text-slate-400 font-medium animate-pulse py-3 text-sm">Aguardando Host...</div>)}
      </div>
      <Chat roomId={roomId} nickname={localStorage.getItem('saved_nickname')} />
    </div>
  );
}