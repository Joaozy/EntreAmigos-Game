import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { ArrowRight, Trophy, RotateCcw, Home, Scale, Coffee, CheckCircle, BrainCircuit } from 'lucide-react';

export default function GameChaCafe() {
  const { socket, roomId, gameData, players, user, isHost, sairDoJogo } = useGame(); 
  const myUserId = user?.id;
  const [guess, setGuess] = useState('');

  // Estados Seguros
  if (!gameData || !players) return <div className="text-white text-center mt-20">Carregando Chá ou Café...</div>;

  const { phase, narratorId, currentGuesserId, currentBestWord, pendingGuess, secretWord, history, winnerId } = gameData;

  // Identidade
  const isNarrator = myUserId === narratorId;
  const isMyTurn = myUserId === currentGuesserId;
  
  const narratorName = players.find(p => p.userId === narratorId)?.nickname || "Narrador";
  const guesserName = players.find(p => p.userId === currentGuesserId)?.nickname || "Alguém";
  const winnerName = players.find(p => p.userId === winnerId)?.nickname;

  // Enviar Chute
  const handleGuess = (e) => {
      e.preventDefault();
      if(guess.trim()) {
          socket.emit('cc_guess', { roomId, guess });
          setGuess('');
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 to-amber-950 text-white p-6 flex flex-col items-center font-sans">
      
      {/* HEADER: Palavra Secreta (Só Narrador vê) */}
      <div className="w-full max-w-4xl flex justify-between items-start mb-8">
          <div className={`px-6 py-3 rounded-2xl border backdrop-blur-sm shadow-lg transition-all ${isNarrator ? 'bg-amber-500/20 border-amber-400/50' : 'bg-black/30 border-white/10'}`}>
              <span className="text-[10px] text-amber-200 font-bold uppercase tracking-widest block mb-1">
                  {isNarrator ? "Sua Palavra Secreta" : "Objetivo"}
              </span>
              <span className="text-2xl font-black tracking-tight">
                  {secretWord ? secretWord.toUpperCase() : "🔒 ??????"}
              </span>
          </div>
          <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition"><Home className="text-amber-200/50 hover:text-amber-100" /></button>
      </div>

      <div className="w-full max-w-3xl text-center flex-1 flex flex-col justify-center">
        
        {/* --- FASE 1: SETUP (Narrador escolhe inicio) --- */}
        {phase === 'SETUP' && (
          <div className="animate-in zoom-in duration-300">
            <h1 className="text-3xl font-black mb-8 text-amber-100 leading-tight">
                {isNarrator ? "Para começar, o que se aproxima mais da sua palavra?" : `Aguardando ${narratorName} dar a dica inicial...`}
            </h1>
            
            {isNarrator ? (
                <div className="flex flex-col sm:flex-row gap-6 justify-center">
                    <button onClick={() => socket.emit('cc_setup', { roomId, choice: 'Chá' })} className="bg-emerald-800 hover:bg-emerald-700 p-8 rounded-3xl text-2xl font-black transition shadow-xl border-b-8 border-emerald-950 active:border-b-0 active:translate-y-2 flex flex-col items-center gap-2">
                        <span className="text-4xl">🍵</span> CHÁ
                    </button>
                    <button onClick={() => socket.emit('cc_setup', { roomId, choice: 'Café' })} className="bg-amber-800 hover:bg-amber-700 p-8 rounded-3xl text-2xl font-black transition shadow-xl border-b-8 border-amber-950 active:border-b-0 active:translate-y-2 flex flex-col items-center gap-2">
                        <span className="text-4xl">☕</span> CAFÉ
                    </button>
                </div>
            ) : (
                <div className="flex justify-center gap-8 opacity-40 animate-pulse">
                    <div className="bg-emerald-900/50 p-6 rounded-2xl text-4xl">🍵</div>
                    <div className="bg-amber-900/50 p-6 rounded-2xl text-4xl">☕</div>
                </div>
            )}
          </div>
        )}

        {/* --- FASE 2: GUESSING (Jogadores chutam) --- */}
        {phase === 'GUESSING' && (
          <div className="animate-in fade-in slide-in-from-bottom duration-500">
            <div className="mb-12">
                <p className="text-xs uppercase tracking-widest text-amber-400 mb-2 font-bold">A palavra atual é</p>
                <div className="bg-white/10 p-8 rounded-[2rem] inline-block shadow-2xl border border-white/20 backdrop-blur-md">
                    <p className="text-5xl md:text-6xl font-black text-white drop-shadow-lg uppercase">{currentBestWord}</p>
                </div>
            </div>

            {isMyTurn ? (
                <div className="w-full max-w-md mx-auto bg-black/20 p-6 rounded-3xl border border-white/10">
                    <p className="mb-4 text-lg font-bold text-green-300 flex items-center justify-center gap-2">
                        <BrainCircuit/> SUA VEZ DE CHUTAR!
                    </p>
                    <form onSubmit={handleGuess} className="flex gap-2">
                        <input 
                            className="flex-1 bg-white/90 text-slate-900 p-4 rounded-xl font-bold text-xl outline-none border-4 border-transparent focus:border-green-400 transition"
                            placeholder="Digite seu palpite..."
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="bg-green-500 hover:bg-green-400 text-black px-6 rounded-xl transition shadow-lg font-bold"><ArrowRight size={28}/></button>
                    </form>
                </div>
            ) : (
                <div className="inline-flex items-center gap-3 bg-black/30 py-3 px-8 rounded-full border border-white/5">
                    <div className="w-3 h-3 bg-amber-500 rounded-full animate-ping"/>
                    <span className="text-amber-100 font-bold">Vez de {guesserName} tentar...</span>
                </div>
            )}
          </div>
        )}

        {/* --- FASE 3: COMPARISON (Narrador decide) --- */}
        {phase === 'COMPARISON' && (
          <div className="animate-in zoom-in duration-300">
            <h2 className="text-2xl md:text-3xl font-black mb-10 text-amber-100">
                {isNarrator ? "Qual palavra está MAIS PERTO da secreta?" : `${narratorName} está decidindo...`}
            </h2>

            <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
                
                {/* Opção A: Atual Campeã */}
                <button 
                    disabled={!isNarrator}
                    onClick={() => socket.emit('cc_compare', { roomId, choice: currentBestWord })}
                    className={`p-8 rounded-3xl w-full md:w-72 text-2xl font-black transition relative overflow-hidden group border-b-8 active:border-b-0 active:translate-y-2
                        ${isNarrator 
                            ? 'bg-slate-700 hover:bg-green-600 border-slate-900 hover:border-green-800 cursor-pointer shadow-2xl' 
                            : 'bg-slate-800 border-slate-950 opacity-60 cursor-default'}
                    `}
                >
                    <div className="text-xs uppercase font-bold mb-2 opacity-50 tracking-widest">Manter Atual</div>
                    <span className="uppercase">{currentBestWord}</span>
                </button>

                <div className="bg-amber-500 text-black font-black w-12 h-12 flex items-center justify-center rounded-full z-10 shadow-lg border-4 border-amber-900/50">VS</div>

                {/* Opção B: Novo Chute */}
                <button 
                    disabled={!isNarrator}
                    onClick={() => socket.emit('cc_compare', { roomId, choice: pendingGuess })}
                    className={`p-8 rounded-3xl w-full md:w-72 text-2xl font-black transition relative overflow-hidden group border-b-8 active:border-b-0 active:translate-y-2
                        ${isNarrator 
                            ? 'bg-slate-700 hover:bg-green-600 border-slate-900 hover:border-green-800 cursor-pointer shadow-2xl' 
                            : 'bg-slate-800 border-slate-950 opacity-60 cursor-default'}
                    `}
                >
                    <div className="text-xs uppercase font-bold mb-2 opacity-50 tracking-widest">Palpite de {guesserName}</div>
                    <span className="uppercase">{pendingGuess}</span>
                </button>
            </div>
          </div>
        )}

        {/* --- FASE 4: WIN (Vitória) --- */}
        {phase === 'WIN' && (
          <div className="animate-in zoom-in bg-black/40 backdrop-blur-md p-10 rounded-3xl border-2 border-green-500 shadow-2xl max-w-lg mx-auto">
            <Trophy size={80} className="text-yellow-400 mx-auto mb-6 animate-bounce" />
            <h1 className="text-5xl font-black mb-2 text-white tracking-tighter">ACERTOU!</h1>
            <p className="text-2xl text-green-300 font-bold mb-8 uppercase tracking-widest">{winnerName} venceu!</p>
            
            <div className="bg-gradient-to-br from-green-900 to-emerald-900 p-6 rounded-2xl mb-8 border border-green-500/30">
                <p className="text-xs uppercase tracking-widest text-green-300 mb-1 font-bold">A palavra era</p>
                <p className="text-4xl font-black text-white uppercase">{secretWord}</p>
            </div>

            {isHost && (
                <button onClick={() => socket.emit('cc_restart', { roomId })} className="bg-white hover:bg-slate-200 text-black px-8 py-4 rounded-xl font-bold flex items-center gap-2 mx-auto transition shadow-lg">
                    <RotateCcw size={20}/> JOGAR NOVAMENTE
                </button>
            )}
          </div>
        )}

        {/* --- HISTÓRICO DE DUELOS (Rodapé) --- */}
        {history && history.length > 0 && phase !== 'WIN' && (
            <div className="mt-12 w-full max-w-3xl">
                <p className="text-[10px] uppercase tracking-widest text-amber-500/60 mb-3 font-bold border-b border-amber-500/20 pb-1">Histórico da Partida</p>
                <div className="flex flex-col-reverse gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-lg text-sm border border-white/5 animate-in slide-in-from-left">
                            {h.type === 'start' ? (
                                <span className="text-amber-200/80 italic">🏁 Começou com <b>{h.word}</b></span>
                            ) : (
                                <div className="flex items-center gap-3 w-full">
                                    <span className="text-red-400/50 line-through text-xs w-1/3 text-right">{h.loser}</span>
                                    <ArrowRight size={12} className="text-amber-600 shrink-0"/>
                                    <div className="w-1/3 text-left">
                                        <span className="font-bold text-green-400 uppercase">{h.winner}</span>
                                        <span className="text-[10px] text-slate-500 block">({h.guesser || 'Narrador'})</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
    </div>
  );
}