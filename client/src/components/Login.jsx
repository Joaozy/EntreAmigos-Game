import React from 'react';
import { useGame } from '../context/GameContext';

export default function Login() {
  const { selectedGame, nickname, setNickname, roomId, setRoomId, criarSala, entrarSala, isJoining, setView } = useGame();

  // Helper simples para cores
  const getColor = () => {
      if(selectedGame === 'ITO') return 'indigo';
      if(selectedGame === 'CHA_CAFE') return 'pink';
      if(selectedGame === 'CODENAMES') return 'emerald';
      if(selectedGame === 'STOP') return 'purple';
      return 'slate';
  };
  const color = getColor();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 relative animate-in zoom-in-95">
        <button onClick={() => setView('HOME')} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">← Voltar</button>
        <div className="text-center pt-4">
          <h1 className="text-3xl font-black text-slate-800">Preparar Jogo</h1>
          <p className={`text-${color}-600 text-sm font-bold uppercase tracking-wider`}>{selectedGame}</p>
        </div>
        <input className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold outline-none" placeholder="Seu Apelido" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12}/>
        <button className={`w-full text-white p-4 rounded-xl font-bold shadow-lg transition bg-${color}-600 hover:bg-${color}-700`} onClick={criarSala} disabled={isJoining || !nickname}>{isJoining ? 'Criando...' : 'Criar Nova Sala'}</button>
        <div className="flex gap-2"><input className="flex-1 bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-center outline-none uppercase" placeholder="CÓDIGO" value={roomId} onChange={e => setRoomId(e.target.value)} maxLength={4}/><button className="bg-slate-800 text-white px-6 rounded-xl font-bold" onClick={entrarSala} disabled={isJoining || !nickname || !roomId}>Entrar</button></div>
      </div>
    </div>
  );
}