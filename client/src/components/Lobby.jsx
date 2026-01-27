import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

// Lista COMPLETA de jogos baseada nos arquivos que você enviou
const GAMES = [
    { id: 'ITO', name: 'ITO', icon: '🌊', color: 'bg-blue-500', desc: 'Cooperativo' },
    { id: 'CHA_CAFE', name: 'Chá ou Café', icon: '☕', color: 'bg-orange-500', desc: 'Debate' },
    { id: 'MEGAQUIZ', name: 'MegaQuiz', icon: '🧠', color: 'bg-purple-600', desc: 'Trivia' },
    { id: 'WHOAMI', name: 'Quem Sou Eu', icon: '🤔', color: 'bg-yellow-500', desc: 'Adivinhação' },
    { id: 'CODENAMES', name: 'Codenames', icon: '🕵️', color: 'bg-red-600', desc: 'Estratégia' },
    { id: 'STOP', name: 'Stop / Adedonha', icon: '✋', color: 'bg-pink-500', desc: 'Palavras' },
    { id: 'TERMO', name: 'Termo', icon: '🔤', color: 'bg-emerald-600', desc: 'Lógica' },
    { id: 'CINEMOJI', name: 'Cinemoji', icon: '🎬', color: 'bg-cyan-500', desc: 'Emojis' },
    { id: 'DIXIT', name: 'Dixit', icon: '🎨', color: 'bg-rose-400', desc: 'Imaginação' },
    { id: 'SPY', name: 'Spyfall', icon: '🕶️', color: 'bg-gray-600', desc: 'Bluff' },
    { id: 'ENIGMA', name: 'Enigma', icon: '🧩', color: 'bg-indigo-800', desc: 'Mistério' },
];

export default function Lobby() {
  const { criarSala, entrarSala, nickname, setRoomId, roomId, setSelectedGame, selectedGame, myStats, logout } = useGame(); 
  const [mode, setMode] = useState('MENU'); 

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center">
      {/* HEADER USER */}
      <div className="w-full max-w-md flex justify-between items-center bg-slate-800 p-4 rounded-2xl mb-8 shadow-lg border border-slate-700">
          <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl border-2 border-indigo-400">
                  {nickname ? nickname[0].toUpperCase() : '?'}
              </div>
              <div className="text-left">
                  <p className="text-white font-bold leading-tight text-lg">{nickname || "Visitante"}</p>
                  <p className="text-xs text-green-400 font-bold">● Online</p>
              </div>
          </div>
          <button onClick={logout} className="text-xs bg-red-900/50 text-red-300 px-3 py-1 rounded-lg hover:bg-red-900 transition font-bold">
              SAIR 🚪
          </button>
      </div>

      {/* MENU PRINCIPAL */}
      {mode === 'MENU' && (
          <div className="w-full max-w-md grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4">
              <button onClick={() => setMode('CREATE')} className="col-span-2 bg-gradient-to-r from-indigo-600 to-purple-600 p-8 rounded-3xl text-white font-black text-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition transform text-left flex items-center justify-between">
                  <span>CRIAR<br/>SALA</span>
                  <span className="text-4xl">🏠</span>
              </button>
              <button onClick={() => setMode('JOIN')} className="col-span-2 bg-slate-700 p-6 rounded-2xl text-white font-bold text-lg shadow-lg hover:bg-slate-600 transition border-2 border-slate-600 flex items-center justify-between">
                  <span>ENTRAR EM SALA</span>
                  <span className="text-2xl">🔑</span>
              </button>
          </div>
      )}

      {/* CRIAR SALA */}
      {mode === 'CREATE' && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-right h-full flex flex-col">
              <h2 className="text-white font-bold text-xl mb-4">Escolha o Jogo</h2>
              <div className="grid grid-cols-2 gap-3 mb-6 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                  {GAMES.map(g => (
                      <button 
                        key={g.id}
                        onClick={() => setSelectedGame(g.id)}
                        className={`p-4 rounded-xl text-left transition border-2 relative overflow-hidden group ${selectedGame === g.id ? 'border-white bg-white/10' : 'border-transparent bg-slate-800 hover:bg-slate-700'}`}
                      >
                          <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-20 ${g.color}`}></div>
                          <span className="text-3xl mb-2 block transform group-hover:scale-110 transition">{g.icon}</span>
                          <span className={`text-sm font-bold block ${selectedGame === g.id ? 'text-white' : 'text-slate-300'}`}>{g.name}</span>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">{g.desc}</span>
                      </button>
                  ))}
              </div>
              <div className="mt-auto pt-4 bg-slate-900 sticky bottom-0">
                <button onClick={criarSala} className="w-full bg-green-500 py-4 rounded-xl font-black text-white shadow-lg hover:bg-green-400 transition transform active:scale-95 text-lg mb-3">
                    INICIAR JOGO
                </button>
                <button onClick={() => setMode('MENU')} className="w-full text-slate-500 font-bold text-sm py-2 hover:text-white transition">VOLTAR</button>
              </div>
          </div>
      )}

      {/* ENTRAR */}
      {mode === 'JOIN' && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-right">
              <h2 className="text-white font-bold text-xl mb-4">Código da Sala</h2>
              <input 
                  className="w-full bg-slate-800 text-white font-mono text-center text-4xl p-6 rounded-2xl outline-none border-2 border-slate-700 focus:border-indigo-500 mb-6 uppercase tracking-widest placeholder-slate-600"
                  placeholder="ABCD"
                  maxLength={4}
                  value={roomId}
                  onChange={e => setRoomId(e.target.value.toUpperCase())}
              />
              <button onClick={entrarSala} disabled={roomId.length < 4} className="w-full bg-indigo-600 py-4 rounded-xl font-black text-white shadow-lg hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg">
                  ENTRAR
              </button>
              <button onClick={() => setMode('MENU')} className="w-full mt-4 text-slate-500 font-bold text-sm py-3 hover:text-white transition">VOLTAR</button>
          </div>
      )}
    </div>
  );
}