import React from 'react';
import { useGame } from '../context/GameContext';

export default function WaitingRoom() {
    const { roomId, players, gameType, isHost, iniciarJogo, sairDoJogo } = useGame();

    const copyCode = () => {
        navigator.clipboard.writeText(roomId);
        // Feedback visual simples pode ser adicionado aqui
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
            
            <div className="w-full max-w-md bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700 relative overflow-hidden">
                {/* Background Decorativo */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>

                {/* Header */}
                <div className="text-center mb-8">
                    <span className="inline-block bg-slate-900 text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-slate-700 mb-3">
                        Sala de Espera
                    </span>
                    <h1 className="text-3xl font-black text-white">{gameType}</h1>
                </div>

                {/* Código */}
                <div className="bg-slate-900 rounded-2xl p-6 mb-8 text-center border-2 border-dashed border-slate-700 relative group cursor-pointer hover:border-blue-500/50 transition" onClick={copyCode}>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-2">Código da Sala</p>
                    <div className="text-5xl font-mono font-bold tracking-widest text-blue-400 group-hover:scale-105 transition-transform">
                        {roomId}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">Clique para copiar</p>
                </div>

                {/* Jogadores */}
                <div className="mb-8">
                    <div className="flex justify-between items-end mb-3">
                        <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider">Jogadores ({players.length})</h3>
                    </div>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {players.map(p => (
                            <li key={p.userId} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-xl border border-slate-700/50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.isHost ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-slate-600 text-slate-300'}`}>
                                        {p.nickname.substring(0,2).toUpperCase()}
                                    </div>
                                    <span className={`font-medium ${p.isHost ? 'text-yellow-100' : 'text-slate-200'}`}>
                                        {p.nickname}
                                    </span>
                                </div>
                                {p.isHost && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded font-bold">HOST</span>}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Ações */}
                <div className="space-y-3">
                    {isHost ? (
                        <button 
                            onClick={iniciarJogo}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/20 text-lg transition-all active:scale-95"
                        >
                            INICIAR PARTIDA
                        </button>
                    ) : (
                        <div className="w-full bg-slate-700/50 border border-slate-700 text-slate-400 font-bold py-4 rounded-xl text-center animate-pulse text-sm">
                            Aguardando o anfitrião iniciar...
                        </div>
                    )}
                    
                    <button 
                        onClick={sairDoJogo}
                        className="w-full bg-transparent hover:bg-red-500/10 text-red-400 hover:text-red-300 font-bold py-3 rounded-xl text-sm transition"
                    >
                        Sair da Sala
                    </button>
                </div>
            </div>
        </div>
    );
}