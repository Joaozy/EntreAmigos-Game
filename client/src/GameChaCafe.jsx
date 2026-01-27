import React, { useState } from 'react';
import { socket } from './socket';
import { useGame } from './context/GameContext'; 

export default function GameChaCafe({ players, isHost, roomId, gameData, phase }) {
  const { myUserId } = useGame(); 
  const [word, setWord] = useState('');

  const isNarrator = gameData.narratorUserId === myUserId;
  const isGuesser = gameData.guesserUserId === myUserId;
  const options = gameData.options || ["Opção A", "Opção B"];

  const narratorName = players.find(p => p.userId === gameData.narratorUserId)?.nickname || "Narrador";
  const guesserName = players.find(p => p.userId === gameData.guesserUserId)?.nickname || "Desafiante";

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-950 to-slate-900 text-white p-6 flex flex-col items-center justify-center">
      
      {/* PLACAR DE RODADA */}
      <div className="absolute top-6 bg-orange-900/50 px-6 py-2 rounded-full font-bold border border-orange-500/30 shadow-lg text-xs tracking-widest">
        RODADA {gameData.round || 1}
      </div>

      <div className="w-full max-w-3xl text-center">
        
        {/* FASE 1: SELEÇÃO (Narrador escolhe) */}
        {phase === 'SELECTION' && (
          <div className="animate-in fade-in zoom-in duration-500">
            <h2 className="text-3xl md:text-4xl font-black mb-8 text-orange-100">
              {isNarrator 
                ? <span className="text-orange-400">VOCÊ É O NARRADOR!</span> 
                : <span className="text-slate-400">AGUARDANDO {narratorName}...</span>}
            </h2>
            
            <p className="mb-8 text-lg font-medium opacity-80">
                {isNarrator ? "Escolha secretamente uma das opções abaixo:" : "Ele está escolhendo entre:"}
            </p>

            <div className="flex flex-col md:flex-row gap-6">
              {options.map((opt, i) => (
                <button 
                  key={i}
                  disabled={!isNarrator}
                  onClick={() => socket.emit('cc_select', { roomId, index: i })}
                  className={`flex-1 p-10 rounded-3xl text-3xl font-black transition-all transform duration-300 relative overflow-hidden group
                    ${isNarrator 
                      ? 'bg-gradient-to-br from-orange-600 to-orange-800 hover:from-orange-500 hover:to-orange-700 hover:scale-105 cursor-pointer shadow-2xl border-4 border-orange-400/20' 
                      : 'bg-slate-800 opacity-60 cursor-default border-2 border-slate-700'}
                  `}
                >
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition"></div>
                  <span className="relative z-10">{opt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FASE 2: ADIVINHAÇÃO (Todos veem as opções, Guesser digita) */}
        {phase === 'GUESSING' && (
          <div className="animate-in slide-in-from-bottom duration-500">
            <h2 className="text-3xl font-bold mb-2">
              {isGuesser ? <span className="text-green-400">SUA VEZ!</span> : `Vez de ${guesserName}...`}
            </h2>
            <p className="text-slate-400 mb-8">Diga uma palavra que conecte as duas opções!</p>
            
            {/* Opções visuais (Bloqueadas) */}
            <div className="flex justify-center gap-4 mb-10 opacity-70">
               <div className="bg-slate-800 px-6 py-4 rounded-xl font-bold border border-slate-600">{options[0]}</div>
               <span className="self-center font-black text-orange-500 text-xl">VS</span>
               <div className="bg-slate-800 px-6 py-4 rounded-xl font-bold border border-slate-600">{options[1]}</div>
            </div>

            {isGuesser ? (
              <div className="flex gap-3 justify-center max-w-md mx-auto">
                <input 
                  className="bg-white text-slate-900 px-6 py-4 rounded-xl font-black text-xl outline-none w-full shadow-xl focus:ring-4 focus:ring-green-500/50 transition"
                  placeholder="DIGITE SUA PALAVRA..."
                  value={word}
                  onChange={e => setWord(e.target.value)}
                  autoFocus
                  maxLength={20}
                  onKeyDown={(e) => {
                      if(e.key === 'Enter' && word.trim()) socket.emit('cc_guess', { roomId, word });
                  }}
                />
                <button 
                  onClick={() => socket.emit('cc_guess', { roomId, word })}
                  className="bg-green-500 hover:bg-green-400 px-6 rounded-xl font-black shadow-lg transition transform active:scale-95"
                >
                  GO
                </button>
              </div>
            ) : (
                <div className="bg-black/30 p-4 rounded-xl inline-block animate-pulse">
                    <p className="text-orange-400 font-bold tracking-widest">AGUARDANDO RESPOSTA...</p>
                </div>
            )}
          </div>
        )}

        {/* FASE 3: RESULTADO FINAL */}
        {phase === 'RESULT' && (
          <div className="animate-in zoom-in duration-500 bg-slate-900/80 p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-sm">
            <div className="mb-12">
              <span className="block text-slate-500 text-xs uppercase font-bold tracking-[0.2em] mb-3">PALAVRA DO DESAFIANTE</span>
              <span className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-lg">
                  "{gameData.guesserWord}"
              </span>
            </div>

            <div className="flex flex-col items-center gap-4 mb-10">
                <span className="text-orange-500 font-bold text-sm uppercase animate-bounce">A OPÇÃO SECRETA ERA</span>
                <div className="bg-gradient-to-r from-orange-600 to-red-600 p-1 rounded-2xl shadow-xl transform scale-110">
                    <div className="bg-slate-900 px-10 py-6 rounded-xl">
                        <span className="text-4xl font-black text-white">{options[gameData.selectedOptionIndex]}</span>
                    </div>
                </div>
            </div>

            {isNarrator && (
              <button 
                onClick={() => socket.emit('cc_next', { roomId })}
                className="w-full max-w-sm bg-white text-slate-900 py-4 rounded-xl font-black hover:bg-slate-200 transition shadow-lg text-lg tracking-wide hover:scale-105 active:scale-95"
              >
                PRÓXIMA RODADA ➡️
              </button>
            )}
            {!isNarrator && <p className="text-slate-500 text-xs mt-4">Aguardando o narrador avançar...</p>}
          </div>
        )}

      </div>
    </div>
  );
}