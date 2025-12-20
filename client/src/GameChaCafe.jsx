import React, { useState } from 'react';
import { socket } from './socket';
import { Lightbulb, Send } from 'lucide-react';

export default function GameChaCafe({ players, isHost, roomId, gameData, phase }) {
  const [guessInput, setGuessInput] = useState('');
  const [hintInput, setHintInput] = useState('');     
  const [showHintForm, setShowHintForm] = useState(false); 
  
  // Identifica papéis
  const myId = socket.id;
  const isNarrator = gameData?.narratorId === myId;
  const currentGuesserId = gameData?.guessersIds?.[gameData.turnIndex];
  const isMyTurnToGuess = currentGuesserId === myId;
  const guesserName = players.find(p => p.id === currentGuesserId)?.nickname || "Alguém";

  // Dados do Jogo
  const currentWord = gameData?.currentWord || "Início";
  // Desafiante: se estiver no guessing e sou eu, mostro o que digito. Se não, mostro interrogação.
  const challengerWord = phase === 'JUDGING' 
      ? (gameData?.challengerWord || "?") 
      : (isMyTurnToGuess && guessInput ? guessInput : "?");

  const targetWord = gameData?.targetWord; 
  const roundCount = gameData?.roundCount || 1;
  const activeHint = gameData?.hint;

  // Lógica da Dica: Disponível a partir da rodada 5
  const canGiveHint = isNarrator && roundCount >= 5 && !activeHint;

  const sendGuess = (e) => {
    e.preventDefault();
    if(guessInput.trim()) {
      socket.emit('cc_guess', { roomId, word: guessInput });
      setGuessInput('');
    }
  };

  const sendHint = (e) => {
    e.preventDefault();
    if(hintInput.trim()) {
        socket.emit('cc_give_hint', { roomId, hint: hintInput });
        setShowHintForm(false);
    }
  };

  const judge = (winnerWord) => {
    if(isNarrator) {
      socket.emit('cc_judge', { roomId, winnerWord });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-4 pt-12 text-white font-sans">
      
      {/* HEADER INFO */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
          <div className="bg-slate-800 px-4 py-2 rounded-full font-bold text-slate-400 text-sm border border-slate-700">
              RODADA <span className="text-white text-lg ml-1">{roundCount}</span>
          </div>

          {isNarrator ? (
            <div className="bg-yellow-500 text-slate-900 px-6 py-2 rounded-full font-black shadow-lg border-2 border-yellow-300 animate-pulse">
              ALVO: {targetWord?.toUpperCase()}
            </div>
          ) : (
            <div className="bg-slate-800 px-4 py-2 rounded-full text-slate-500 text-xs font-bold uppercase tracking-widest">
                Adivinhe a palavra
            </div>
          )}
      </div>

      {/* DICA */}
      {activeHint && (
          <div className="bg-indigo-900/50 border border-indigo-500 text-indigo-200 px-6 py-3 rounded-xl mb-6 flex items-center gap-3 w-full max-w-md animate-in fade-in slide-in-from-top-4">
              <Lightbulb className="text-yellow-400 shrink-0" />
              <p className="font-bold">DICA: <span className="text-white uppercase">{activeHint}</span></p>
          </div>
      )}

      {canGiveHint && !showHintForm && (
          <button onClick={() => setShowHintForm(true)} className="mb-6 bg-yellow-600/20 text-yellow-500 border border-yellow-600/50 px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-600 hover:text-white transition flex items-center gap-2">
              <Lightbulb size={16} /> Liberar Dica
          </button>
      )}

      {showHintForm && (
          <form onSubmit={sendHint} className="mb-6 flex gap-2 w-full max-w-md animate-in zoom-in-95">
              <input className="flex-1 bg-slate-800 border border-yellow-600 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Escreva uma dica..." value={hintInput} onChange={e => setHintInput(e.target.value)} maxLength={30} autoFocus />
              <button type="submit" className="bg-yellow-600 text-white p-2 rounded-lg hover:bg-yellow-500"><Send size={18} /></button>
          </form>
      )}

      {/* DUELO */}
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-4xl mb-8 items-stretch h-64 md:h-80">
        <div className="flex-1 flex flex-col">
            <span className="text-center text-xs font-bold text-indigo-400 uppercase mb-2 tracking-widest">🏆 Atual Campeão</span>
            <button
            onClick={() => phase === 'JUDGING' && judge(currentWord)}
            disabled={!isNarrator || phase !== 'JUDGING'}
            className={`flex-1 p-6 rounded-3xl text-3xl md:text-5xl font-black transition-all duration-300 relative overflow-hidden flex items-center justify-center break-words bg-indigo-600 shadow-xl border-b-8 border-indigo-800 ${phase === 'JUDGING' && isNarrator ? 'hover:scale-105 cursor-pointer ring-4 ring-white' : 'cursor-default opacity-100'}`}
            >
            {currentWord}
            </button>
        </div>

        <div className="flex items-center justify-center z-10 -my-4 md:my-0 md:-mx-4">
            <div className="bg-slate-800 text-slate-400 font-black rounded-full w-12 h-12 flex items-center justify-center border-4 border-slate-900 shadow-lg">OU</div>
        </div>

        <div className="flex-1 flex flex-col">
            <span className="text-center text-xs font-bold text-pink-400 uppercase mb-2 tracking-widest">🥊 Desafiante</span>
            <button
            onClick={() => phase === 'JUDGING' && judge(gameData?.challengerWord)}
            disabled={!isNarrator || phase !== 'JUDGING'}
            className={`flex-1 p-6 rounded-3xl text-3xl md:text-5xl font-black transition-all duration-300 relative overflow-hidden flex items-center justify-center break-words ${phase === 'JUDGING' ? 'bg-pink-600 shadow-xl border-b-8 border-pink-800 text-white' : 'bg-slate-800 border-2 border-dashed border-slate-600 text-slate-500'} ${phase === 'JUDGING' && isNarrator ? 'hover:scale-105 cursor-pointer ring-4 ring-white' : 'cursor-default'}`}
            >
            {challengerWord} 
            </button>
        </div>
      </div>

      {/* AÇÕES */}
      <div className="w-full max-w-md">
        {phase === 'JUDGING' && (
           <div className="bg-slate-800 p-6 rounded-2xl border-2 border-indigo-500/30 text-center animate-in slide-in-from-bottom">
              <p className="text-xl font-bold text-indigo-300 mb-1">{isNarrator ? "QUAL ESTÁ MAIS PERTO?" : `O Narrador está escolhendo...`}</p>
           </div>
        )}

        {phase === 'GUESSING' && (
           <div className="animate-in slide-in-from-bottom">
              {isMyTurnToGuess ? (
                 <form onSubmit={sendGuess} className="flex flex-col gap-3 bg-slate-800 p-6 rounded-2xl border-2 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.2)]">
                    <label className="font-bold text-pink-400 text-lg text-center uppercase animate-pulse">Sua vez! Desafie {currentWord}:</label>
                    <div className="flex gap-2">
                        <input autoFocus className="flex-1 bg-slate-900 border-2 border-slate-700 rounded-xl p-4 text-white font-bold outline-none focus:border-pink-500 text-lg uppercase transition-colors placeholder:text-slate-600" placeholder="DIGITE..." value={guessInput} onChange={e => setGuessInput(e.target.value)} maxLength={20} />
                        <button type="submit" className="bg-pink-500 text-white font-black px-6 rounded-xl hover:bg-pink-400 transition shadow-lg active:translate-y-1">ENVIA</button>
                    </div>
                 </form>
              ) : (
                 <div className="text-center p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                    <p className="text-xl font-bold text-slate-300 mb-1">Vez de <span className="text-pink-400">{guesserName}</span></p>
                    <p className="text-sm text-slate-500">Esperando desafio...</p>
                 </div>
              )}
           </div>
        )}

        {phase === 'VICTORY' && (
            <div className="animate-in zoom-in duration-500 text-center bg-yellow-500/10 p-8 rounded-3xl border-2 border-yellow-500">
                <h2 className="text-5xl font-black text-yellow-400 mb-4">ACERTOU! 🎉</h2>
                <div className="bg-slate-900 inline-block px-6 py-3 rounded-xl mb-6">
                    <p className="text-sm text-slate-400 uppercase font-bold mb-1">Palavra Secreta</p>
                    <p className="text-3xl font-black text-white">{targetWord}</p>
                </div>
                <p className="text-slate-400 text-sm mb-6">Vitória em {roundCount} rodadas</p>
                {isHost && (
                    <button onClick={() => socket.emit('restart_game', { roomId })} className="bg-yellow-500 text-slate-900 font-black py-4 px-10 rounded-full shadow-lg hover:scale-105 hover:bg-yellow-400 transition">PRÓXIMA RODADA 🔄</button>
                )}
            </div>
        )}
      </div>
    </div>
  );
}