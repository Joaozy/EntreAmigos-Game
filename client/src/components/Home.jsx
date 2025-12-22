import React from 'react';
import { useGame } from '../context/GameContext';
import { Coffee, Eye, Hand, LayoutGrid } from 'lucide-react';

export default function Home() {
  const { setSelectedGame, setView } = useGame();

  const select = (game) => { setSelectedGame(game); setView('LOGIN'); };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-10">
        <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">ENTREAMIGOS</h1>
        <p className="text-slate-400 text-lg">Escolha seu jogo</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-7xl">
        <Card title="ITO" desc="Sincronia e cooperação." color="indigo" icon={<span className="text-3xl font-black">?</span>} onClick={() => select('ITO')} />
        <Card title="Chá ou Café?" desc="Adivinhação por contexto." color="pink" icon={<Coffee size={32} />} onClick={() => select('CHA_CAFE')} />
        <Card title="Código Secreto" desc="Times, espiões e palavras." color="emerald" icon={<Eye size={32} />} onClick={() => select('CODENAMES')} />
        <Card title="Stop!" desc="Adedonha clássica." color="purple" icon={<Hand size={32} />} onClick={() => select('STOP')} />
        <Card title="Termo" desc="Acerte a palavra." color="emerald" icon={<LayoutGrid size={32} />} onClick={() => select('TERMO')} />
      </div>
    </div>
  );
}

const Card = ({ title, desc, color, icon, onClick }) => (
    <div onClick={onClick} className={`group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-${color}-500 transition hover:-translate-y-2`}>
        <div className={`w-16 h-16 bg-${color}-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg`}>{icon}</div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-xs mt-2">{desc}</p>
    </div>
);