import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { ArrowRight, Trophy, RotateCcw, Home, Scale, Coffee, CheckCircle } from 'lucide-react';

export default function GameChaCafe() {
  const { socket, roomId, gameData, players, myUserId, isHost, sairDoJogo } = useGame(); 
  const [guess, setGuess] = useState('');

  // Estados Seguros
  if (!gameData) return <div className="text-white text-center mt-20">Carregando...</div>;

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
    <div className="min-h-screen bg-amber-900 text-white p-6 flex flex-col items-center">
      
      {/* HEADER: Palavra Secreta (Só Narrador vê) */}
      <div className="w-full max-w-4xl flex justify-between items-start mb-8">
          <div className="bg-black/30 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-sm">
              <span className="text-xs text-amber-300 font-bold uppercase tracking-widest block mb-1">Palavra Secreta</span>
              <span className="text-2xl font-black">
                  {secretWord ? secretWord : "🔒 ??????"}
              </span>
          </div>
          <button onClick={sairDoJogo}><Home className="hover:text-amber-400 transition" /></button>
      </div>

      <div className="w-full max-w-2xl text-center flex-1 flex flex-col justify-center">
        
        {/* --- FASE 1: SETUP (Narrador escolhe inicio) --- */}
        {phase === 'SETUP' && (
          <div className="animate-in zoom-in">
            <h1 className="text-3xl font-bold mb-8 text-amber-100">
                {isNarrator ? "Como o jogo começa?" : `Aguardando ${narratorName} começar...`}
            </h1>
            
            {isNarrator ? (
                <div className="flex gap-6 justify-center">
                    <button onClick={() => socket.emit('cc_setup', { roomId, choice: 'Chá' })} className="bg-green-700 p-8 rounded-3xl text-2xl font-bold hover:bg-green-600 transition shadow-xl border-b-4 border-green-900">🍵 CHÁ</button>
                    <button onClick={() => socket.emit('cc_setup', { roomId, choice: 'Café' })} className="bg-amber-700 p-8 rounded-3xl text-2xl font-bold hover:bg-amber-600 transition shadow-xl border-b-4 border-amber-900">☕ CAFÉ</button>
                </div>
            ) : (
                <div className="flex justify-center gap-4 opacity-50">
                    <div className="bg-slate-800 p-6 rounded-2xl">🍵</div>
                    <div className="bg-slate-800 p-6 rounded-2xl">☕</div>
                </div>
            )}
          </div>
        )}

        {/* --- FASE 2: GUESSING (Jogadores chutam) --- */}
        {phase === 'GUESSING' && (
          <div className="animate-in fade-in slide-in-from-bottom">
            <div className="bg-white/10 p-6 rounded-3xl mb-8 inline-block shadow-2xl border border-amber-500/30">
                <p className="text-xs uppercase tracking-widest text-amber-300 mb-2">Melhor Palavra Atual</p>
                <p className="text-5xl font-black">{currentBestWord}</p>
            </div>

            {isMyTurn ? (
                <div className="w-full max-w-md mx-auto">
                    <p className="mb-4 text-xl font-bold animate-pulse text-green-300">SUA VEZ! Tente acertar a palavra secreta.</p>
                    <form onSubmit={handleGuess} className="flex gap-2">
                        <input 
                            className="flex-1 bg-white text-black p-4 rounded-xl font-bold text-xl outline-none shadow-lg"
                            placeholder="Digite seu palpite..."
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="bg-green-600 px-6 rounded-xl hover:bg-green-500 transition shadow-lg"><ArrowRight size={32}/></button>
                    </form>
                </div>
            ) : (
                <div className="text-amber-200/60 font-bold bg-black/20 py-3 px-6 rounded-full inline-block">
                    Vez de {guesserName}...
                </div>
            )}
          </div>
        )}

        {/* --- FASE 3: COMPARISON (Narrador decide) --- */}
        {phase === 'COMPARISON' && (
          <div className="animate-in zoom-in">
            <h2 className="text-2xl font-bold mb-8 text-amber-100">
                {isNarrator ? "Qual palavra está MAIS PERTO da secreta?" : `${narratorName} está decidindo...`}
            </h2>

            <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
                
                {/* Opção A: Atual Campeã */}
                <button 
                    disabled={!isNarrator}
                    onClick={() => socket.emit('cc_compare', { roomId, choice: currentBestWord })}
                    className={`p-8 rounded-3xl w-full md:w-64 text-2xl font-black transition relative overflow-hidden group
                        ${isNarrator ? 'bg-slate-700 hover:bg-green-600 cursor-pointer shadow-xl hover:scale-105' : 'bg-slate-800 opacity-60'}
                    `}
                >
                    <div className="text-xs uppercase font-normal mb-2 opacity-50">Atual</div>
                    {currentBestWord}
                </button>

                <div className="bg-amber-500 text-black font-black p-4 rounded-full z-10 shadow-lg">OU</div>

                {/* Opção B: Novo Chute */}
                <button 
                    disabled={!isNarrator}
                    onClick={() => socket.emit('cc_compare', { roomId, choice: pendingGuess })}
                    className={`p-8 rounded-3xl w-full md:w-64 text-2xl font-black transition relative overflow-hidden group
                        ${isNarrator ? 'bg-slate-700 hover:bg-green-600 cursor-pointer shadow-xl hover:scale-105' : 'bg-slate-800 opacity-60'}
                    `}
                >
                    <div className="text-xs uppercase font-normal mb-2 opacity-50">Palpite de {guesserName}</div>
                    {pendingGuess}
                </button>
            </div>
          </div>
        )}

        {/* --- FASE 4: WIN (Vitória) --- */}
        {phase === 'WIN' && (
          <div className="animate-in zoom-in bg-black/40 backdrop-blur-md p-10 rounded-3xl border-2 border-green-500 shadow-2xl">
            <Trophy size={80} className="text-yellow-400 mx-auto mb-6 animate-bounce" />
            <h1 className="text-4xl font-black mb-2 text-white">ACERTOU!</h1>
            <p className="text-2xl text-green-300 font-bold mb-8">{winnerName} venceu!</p>
            
            <div className="bg-green-900/50 p-6 rounded-2xl mb-8">
                <p className="text-xs uppercase tracking-widest text-green-300 mb-1">A palavra era</p>
                <p className="text-5xl font-black text-white">{secretWord}</p>
            </div>

            {isHost && (
                <button onClick={() => socket.emit('cc_restart', { roomId })} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto transition shadow-lg">
                    <RotateCcw/> JOGAR NOVAMENTE
                </button>
            )}
          </div>
        )}

        {/* --- HISTÓRICO DE DUELOS (Rodapé) --- */}
        {history && history.length > 0 && phase !== 'WIN' && (
            <div className="mt-12 w-full max-w-3xl">
                <p className="text-xs uppercase tracking-widest text-amber-500/50 mb-4 font-bold">Histórico da Partida</p>
                <div className="flex flex-col-reverse gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-lg text-sm border border-white/5">
                            {h.type === 'start' ? (
                                <span className="text-amber-200">🏁 Jogo começou com <b>{h.word}</b></span>
                            ) : (
                                <>
                                    <span className="text-slate-400 opacity-60 line-through decoration-red-500">{h.loser}</span>
                                    <ArrowRight size={14} className="text-amber-600"/>
                                    <span className="font-bold text-green-400">{h.winner}</span>
                                    <span className="text-xs text-slate-500 ml-2">({h.guesser || 'Narrador'})</span>
                                </>
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