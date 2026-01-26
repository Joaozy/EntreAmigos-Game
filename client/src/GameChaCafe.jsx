import React, { useState } from 'react';
import { socket } from './socket';

export default function GameChaCafe({ players, isHost, roomId, gameData, phase }) {
  const [wordInput, setWordInput] = useState('');
  
  const myId = socket.id;
  const isNarrator = gameData?.narratorId === myId;
  const isGuesser = gameData?.guesserId === myId;
  const options = gameData?.options || ["?", "?"];

  const handleSelect = (idx) => {
      socket.emit('cc_select_option', { roomId, optionIndex: idx });
  };

  const handleSubmit = (e) => {
      e.preventDefault();
      if(wordInput.trim()) {
          socket.emit('cc_submit_guess', { roomId, word: wordInput });
          setWordInput('');
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 to-slate-900 text-white p-4 flex flex-col items-center">
      <div className="bg-orange-800/50 px-6 py-2 rounded-full mb-8 font-bold border border-orange-500">
          RODADA {gameData?.round}
      </div>

      {/* FASE 1: SELEÇÃO (NARRADOR) */}
      {phase === 'SELECTION' && (
          <div className="text-center w-full max-w-lg">
              <h2 className="text-2xl font-bold mb-6 text-orange-200">
                  {isNarrator ? "Escolha uma opção secreta:" : "O Narrador está escolhendo..."}
              </h2>
              
              <div className="flex gap-4">
                  {options.map((opt, idx) => (
                      <button 
                        key={idx}
                        disabled={!isNarrator}
                        onClick={() => handleSelect(idx)}
                        className={`flex-1 p-8 rounded-2xl text-2xl font-black transition transform ${isNarrator ? 'bg-orange-600 hover:bg-orange-500 hover:scale-105 shadow-xl cursor-pointer' : 'bg-slate-700 opacity-50 cursor-default'}`}
                      >
                          {opt}
                      </button>
                  ))}
              </div>
          </div>
      )}

      {/* FASE 2: ADIVINHAÇÃO (DESAFIANTE) */}
      {phase === 'GUESSING' && (
          <div className="text-center w-full max-w-lg animate-in slide-in-from-bottom">
              <h2 className="text-2xl font-bold mb-6 text-orange-200">
                  {isGuesser ? "Diga uma palavra que combine!" : `Aguardando o desafiante...`}
              </h2>

              <div className="flex gap-4 mb-8 opacity-50">
                  <div className="flex-1 bg-slate-700 p-4 rounded-xl font-bold">{options[0]}</div>
                  <div className="flex-1 bg-slate-700 p-4 rounded-xl font-bold">{options[1]}</div>
              </div>

              {isGuesser && (
                  <form onSubmit={handleSubmit} className="flex gap-2">
                      <input 
                        className="flex-1 bg-white text-slate-900 p-4 rounded-xl font-bold outline-none text-xl"
                        placeholder="Sua palavra..."
                        value={wordInput}
                        onChange={e => setWordInput(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="bg-green-500 text-white px-6 rounded-xl font-black hover:bg-green-400 transition">ENVIAR</button>
                  </form>
              )}
          </div>
      )}

      {/* FASE 3: RESULTADO */}
      {phase === 'RESULT' && (
          <div className="text-center w-full max-w-lg animate-in zoom-in">
              <h1 className="text-4xl font-black text-white mb-2">{gameData.guesserWord}</h1>
              <p className="text-slate-400 mb-8">foi a palavra dita!</p>

              <div className="bg-slate-800 p-6 rounded-2xl border-2 border-orange-500 mb-6">
                  <p className="text-sm text-orange-400 uppercase font-bold mb-2">A OPÇÃO ESCOLHIDA FOI</p>
                  <p className="text-3xl font-black">{options[gameData.selectedOption]}</p>
              </div>

              {isNarrator && (
                  <button onClick={() => socket.emit('cc_next_round', { roomId })} className="bg-orange-600 px-8 py-3 rounded-xl font-bold hover:bg-orange-500 transition shadow-lg">
                      PRÓXIMA RODADA ➡️
                  </button>
              )}
          </div>
      )}
    </div>
  );
}