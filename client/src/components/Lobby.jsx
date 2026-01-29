import React, { useState } from 'react';
import { LogOut, Users, Play, Hash, Gamepad2, Brain, Search, Eye, MessageSquare, ListOrdered, Film, Coffee, XCircle, HelpCircle } from 'lucide-react';

const GAMES = [
    { id: 'TERMO', name: 'Termo', icon: <ListOrdered size={32} className="text-green-400"/>, desc: 'Descubra a palavra secreta.', color: 'from-green-900/50 to-emerald-900/50 border-green-500/30' },
    { id: 'MEGAQUIZ', name: 'MegaQuiz', icon: <HelpCircle size={32} className="text-yellow-400"/>, desc: 'Desafie seus conhecimentos.', color: 'from-yellow-900/50 to-orange-900/50 border-yellow-500/30' },
    { id: 'DIXIT', name: 'Dixit', icon: <MessageSquare size={32} className="text-pink-400"/>, desc: 'Imagens, dicas e imaginação.', color: 'from-pink-900/50 to-rose-900/50 border-pink-500/30' },
    { id: 'STOP', name: 'Stop', icon: <XCircle size={32} className="text-red-400"/>, desc: 'Adedonha online rápido.', color: 'from-red-900/50 to-orange-900/50 border-red-500/30' },
    { id: 'CODENAMES', name: 'Codenames', icon: <Users size={32} className="text-blue-400"/>, desc: 'Espiões e palavras secretas.', color: 'from-blue-900/50 to-indigo-900/50 border-blue-500/30' },
    { id: 'WHOAMI', name: 'Quem Sou Eu?', icon: <Search size={32} className="text-purple-400"/>, desc: 'Faça perguntas para descobrir.', color: 'from-purple-900/50 to-violet-900/50 border-purple-500/30' },
    { id: 'CINEMOJI', name: 'Cinemoji', icon: <Film size={32} className="text-red-500"/>, desc: 'Adivinhe o filme pelos emojis.', color: 'from-red-900/50 to-rose-900/50 border-red-500/30' },
    { id: 'CHACAFE', name: 'Chá & Café', icon: <Coffee size={32} className="text-amber-400"/>, desc: 'Conversas e descontração.', color: 'from-amber-900/50 to-orange-900/50 border-amber-500/30' },
    { id: 'SPY', name: 'O Espião', icon: <Eye size={32} className="text-emerald-400"/>, desc: 'Descubra o intruso.', color: 'from-emerald-900/50 to-green-900/50 border-emerald-500/30' },
    { id: 'ENIGMA', name: 'Enigma', icon: <Brain size={32} className="text-cyan-400"/>, desc: 'Charadas estilo Perfil.', color: 'from-cyan-900/50 to-blue-900/50 border-cyan-500/30' },
    { id: 'ITO', name: 'Ito', icon: <ListOrdered size={32} className="text-indigo-400"/>, desc: 'Cooperativo de números.', color: 'from-indigo-900/50 to-purple-900/50 border-indigo-500/30' },
];

export default function Lobby({ nickname, onCreate, onJoin, onLogout }) {
    const [roomIdInput, setRoomIdInput] = useState('');
    const [selectedGame, setSelectedGame] = useState(null);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white p-6 font-sans">
            
            {/* CABEÇALHO */}
            <div className="max-w-7xl mx-auto flex justify-between items-center mb-12 bg-slate-800/50 p-4 rounded-2xl border border-slate-700 backdrop-blur-sm sticky top-4 z-50 shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
                        <Gamepad2 size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-white leading-none">EntreAmigos</h1>
                        <p className="text-xs text-slate-400 font-bold uppercase mt-1 flex items-center gap-1">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            {nickname || 'Visitante'}
                        </p>
                    </div>
                </div>
                
                <button 
                    onClick={onLogout} 
                    className="flex items-center gap-2 bg-slate-800 hover:bg-red-900/80 hover:text-white text-slate-400 px-4 py-2 rounded-xl transition border border-slate-700 hover:border-red-500 group"
                >
                    <LogOut size={18} className="group-hover:-translate-x-1 transition-transform"/>
                    <span className="hidden md:inline font-bold text-sm">SAIR</span>
                </button>
            </div>

            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
                
                {/* LADO ESQUERDO: LISTA DE JOGOS */}
                <div className="flex-1 w-full">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-200">
                        <Play size={20} className="text-green-400"/> Escolha um Jogo
                    </h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {GAMES.map((g) => (
                            <button 
                                key={g.id}
                                onClick={() => setSelectedGame(g.id)}
                                className={`group relative overflow-hidden rounded-2xl p-5 border text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl 
                                    ${selectedGame === g.id 
                                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 border-blue-400 ring-2 ring-blue-400/50' 
                                        : `bg-gradient-to-br ${g.color} bg-slate-800 border-slate-700 hover:border-white/20`
                                    }`}
                            >
                                <div className="relative z-10 flex items-center gap-4">
                                    <div className={`p-3 rounded-xl backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 ${selectedGame === g.id ? 'bg-white/20 text-white' : 'bg-black/30'}`}>
                                        {g.icon}
                                    </div>
                                    <div>
                                        <h3 className={`font-black text-lg mb-0.5 ${selectedGame === g.id ? 'text-white' : 'text-slate-100'}`}>{g.name}</h3>
                                        <p className={`text-xs font-medium leading-tight ${selectedGame === g.id ? 'text-blue-100' : 'text-slate-400'}`}>{g.desc}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 sticky bottom-6 z-40">
                        <button 
                            onClick={() => onCreate(selectedGame)}
                            disabled={!selectedGame}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale py-4 rounded-xl font-bold text-lg shadow-lg transform active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            INICIAR {selectedGame ? GAMES.find(g => g.id === selectedGame)?.name.toUpperCase() : 'JOGO'}
                        </button>
                    </div>
                </div>

                {/* LADO DIREITO: ENTRAR EM SALA (STICKY) */}
                <div className="w-full lg:w-80 shrink-0">
                    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl sticky top-28 shadow-xl backdrop-blur-sm">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-200">
                            <Hash size={20} className="text-blue-400"/> Entrar em Sala
                        </h2>
                        <p className="text-xs text-slate-400 mb-4">Tem um código? Digite abaixo.</p>
                        
                        <div className="flex flex-col gap-3">
                            <input 
                                className="bg-slate-900 border border-slate-600 text-white p-4 rounded-xl font-mono text-center text-2xl uppercase tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition placeholder:text-slate-700"
                                placeholder="ABCD"
                                maxLength={4}
                                value={roomIdInput}
                                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                            />
                            <button 
                                onClick={() => onJoin(roomIdInput)}
                                disabled={roomIdInput.length < 4}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                ENTRAR
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}