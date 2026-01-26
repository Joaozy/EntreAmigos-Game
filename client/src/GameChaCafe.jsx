import React, { useState } from 'react';
import { socket } from './socket';
import { useGame } from './context/GameContext'; // IMPORTANTE

export default function GameChaCafe({ players, isHost, roomId, gameData, phase }) {
  const { myUserId } = useGame(); // Pega meu ID fixo do contexto
  const [word, setWord] = useState('');

  // Compara IDs fixos, não sockets
  const isNarrator = gameData.narratorUserId === myUserId;
  const isGuesser = gameData.guesserUserId === myUserId;
  const options = gameData.options || ["Opção A", "Opção B"];

  const narratorName = players.find(p => p.userId === gameData.narratorUserId)?.nickname || "Narrador";
  const guesserName = players.find(p => p.userId === gameData.guesserUserId)?.nickname || "Desafiante";

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 to-slate-900 text-white p-6 flex flex-col items-center">
      <div className="bg-orange-800/50 px-6 py-2 rounded-full font-bold mb-8 border border-orange-500 shadow-lg">
        RODADA {gameData.round}
      </div>

      <div className="w-full max-w-2xl text-center">
        
        {/* FASE 1: SELEÇÃO */}
        {phase === 'SELECTION' && (
          <div className="animate-in fade-in">
            <h2 className="text-2xl font-bold mb-6 text-orange-200">
              {isNarrator ? "Escolha uma opção secreta:" : `Aguardando ${narratorName} escolher...`}
            </h2>
            <div className="flex gap-4">
              {options.map((opt, i) => (
                <button 
                  key={i}
                  disabled={!isNarrator}
                  onClick={() => socket.emit('cc_select', { roomId, index: i })}
                  className={`flex-1 p-8 rounded-2xl text-2xl font-black transition transform ${
                    isNarrator 
                    ? 'bg-orange-600 hover:bg-orange-500 hover:scale-105 cursor-pointer shadow-xl' 
                    : 'bg-slate-700 opacity-50 cursor-default'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FASE 2: ADIVINHAÇÃO */}
        {phase === 'GUESSING' && (
          <div className="animate-in slide-in-from-bottom duration-500">
            <h2 className="text-3xl font-bold mb-4">
              {isGuesser ? "Diga uma palavra relacionada!" : `Vez de ${guesserName}...`}
            </h2>
            
            {/* Mostra as opções apenas como referência visual */}
            <div className="flex gap-4 mb-8 justify-center opacity-60">
               <div className="bg-slate-800 px-4 py-2 rounded-lg font-bold">{options[0]}</div>
               <span className="self-center font-bold">OU</span>
               <div className="bg-slate-800 px-4 py-2 rounded-lg font-bold">{options[1]}</div>
            </div>

            {isGuesser ? (
              <div className="flex gap-2 justify-center">
                <input 
                  className="bg-white text-slate-900 p-4 rounded-xl font-bold text-xl outline-none w-full max-w-xs shadow-lg"
                  placeholder="Sua palavra..."
                  value={word}
                  onChange={e => setWord(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                      if(e.key === 'Enter' && word.trim()) socket.emit('cc_guess', { roomId, word });
                  }}
                />
                <button 
                  onClick={() => socket.emit('cc_guess', { roomId, word })}
                  className="bg-green-500 hover:bg-green-600 px-6 rounded-xl font-black shadow-lg transition"
                >
                  ENVIAR
                </button>
              </div>
            ) : (
                <div className="text-orange-400 animate-pulse font-bold">Esperando resposta...</div>
            )}
          </div>
        )}

        {/* FASE 3: RESULTADO */}
        {phase === 'RESULT' && (
          <div className="animate-in zoom-in duration-300">
            <div className="mb-10">
              <span className="block text-slate-400 text-sm uppercase font-bold tracking-widest mb-2">Palavra dita</span>
              <span className="text-6xl font-black text-white drop-shadow-lg">{gameData.guesserWord}</span>
            </div>

            <div className="bg-slate-800 p-8 rounded-3xl border-4 border-orange-500 mb-8 inline-block shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-orange-500"></div>
              <span className="block text-orange-400 text-xs uppercase font-bold mb-2">A ESCOLHA ERA</span>
              <span className="text-4xl font-black">{options[gameData.selectedOptionIndex]}</span>
            </div>

            {isNarrator && (
              <button 
                onClick={() => socket.emit('cc_next', { roomId })}
                className="block w-full max-w-md mx-auto bg-white text-orange-900 py-4 rounded-xl font-black hover:bg-orange-100 transition shadow-lg text-xl"
              >
                PRÓXIMA RODADA ➡️
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}