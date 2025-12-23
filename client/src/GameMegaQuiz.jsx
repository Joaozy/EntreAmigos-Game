import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Brain, Zap, Coins, Skull, Clock, Trophy, Target } from 'lucide-react';

export default function GameMegaQuiz({ players, isHost, roomId, gameData, phase }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // Timer Local (visual)
  useEffect(() => {
    const timer = setInterval(() => {
        if (gameData.endTime && gameData.phase === 'QUESTION') {
            const diff = Math.ceil((gameData.endTime - Date.now()) / 1000);
            setTimeLeft(diff > 0 ? diff : 0);
        }
    }, 100);
    return () => clearInterval(timer);
  }, [gameData]);

  // Reset seleção ao mudar pergunta
  useEffect(() => {
      if (gameData.phase === 'PRE_ACTION' || gameData.phase === 'QUESTION') {
          setSelectedOption(null);
      }
  }, [gameData.question]);

  const submitAnswer = (idx) => {
      if (selectedOption !== null) return; // Só permite 1 resposta
      setSelectedOption(idx);
      socket.emit('quiz_submit_answer', { roomId, answerIndex: idx });
  };

  const submitAction = (data) => {
      socket.emit('quiz_send_action', { roomId, action: data });
  };

  // Cores baseadas no tipo de rodada
  const getThemeColor = () => {
      switch(gameData.roundType) {
          case 'DOUBLE': return 'from-purple-600 to-indigo-900';
          case 'STEAL': return 'from-red-600 to-slate-900';
          case 'WAGER': return 'from-yellow-600 to-amber-900';
          default: return 'from-blue-600 to-slate-900';
      }
  };

  // --- TELA DE RESULTADO FINAL ---
  if (phase === 'VICTORY' || (gameData.phase === 'REVEAL' && !gameData.question)) {
     // Lógica de fim de jogo já existente no App.jsx pode tratar isso, 
     // mas se o server mandar phase específica, tratamos aqui.
     // O server manda phase REVEAL mesmo no fim, então vamos confiar no App.jsx 
     // ou mostrar placar parcial se for REVEAL.
  }

  // --- COMPONENTES AUXILIARES ---
  const RoundBadge = () => {
      let icon = <Brain />; let text = "RODADA NORMAL"; let color = "bg-blue-500";
      if (gameData.roundType === 'DOUBLE') { icon = <Zap />; text = "PONTOS EM DOBRO"; color = "bg-purple-500"; }
      if (gameData.roundType === 'STEAL') { icon = <Skull />; text = "RODADA DO LADRÃO"; color = "bg-red-500"; }
      if (gameData.roundType === 'WAGER') { icon = <Coins />; text = "HORA DA APOSTA"; color = "bg-yellow-500"; }
      
      return (
          <div className={`${color} px-6 py-2 rounded-full font-black text-white flex items-center gap-2 shadow-lg mb-4 animate-bounce`}>
              {icon} {text}
          </div>
      );
  };

  return (
    <div className={`min-h-screen w-full bg-gradient-to-b ${getThemeColor()} flex flex-col items-center p-4 text-white font-sans transition-colors duration-1000`}>
        
        {/* CABEÇALHO */}
        <div className="w-full max-w-4xl flex justify-between items-end mb-6 border-b border-white/10 pb-4">
             <div>
                 <h1 className="text-3xl font-black italic tracking-tighter">MEGA QUIZ</h1>
                 <p className="text-xs font-bold opacity-70">PERGUNTA {gameData.roundNumber} / 15</p>
             </div>
             {gameData.phase === 'QUESTION' && (
                 <div className="flex items-center gap-2 text-2xl font-mono font-bold">
                     <Clock className={timeLeft < 5 ? 'text-red-400 animate-spin' : ''} />
                     {timeLeft}s
                 </div>
             )}
        </div>

        <RoundBadge />

        {/* --- FASE DE AÇÃO PRÉVIA (APOSTA OU ROUBO) --- */}
        {gameData.phase === 'PRE_ACTION' && (
            <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl text-center max-w-lg w-full animate-in zoom-in">
                {gameData.roundType === 'WAGER' && (
                    <>
                        <h2 className="text-2xl font-bold mb-4">QUANTO VOCÊ QUER APOSTAR?</h2>
                        <p className="text-sm opacity-70 mb-6">Se acertar ganha, se errar perde.</p>
                        <div className="grid grid-cols-3 gap-4">
                            {[100, 250, 500].map(val => (
                                <button key={val} onClick={() => submitAction({ wager: val })} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-xl transition transform hover:scale-105">
                                    {val}
                                </button>
                            ))}
                            <button onClick={() => submitAction({ wager: 0 })} className="col-span-3 bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-xl">Não apostar nada (Seguro)</button>
                        </div>
                    </>
                )}
                {gameData.roundType === 'STEAL' && (
                    <>
                        <h2 className="text-2xl font-bold mb-4">ESCOLHA SUA VÍTIMA</h2>
                        <p className="text-sm opacity-70 mb-6">Se você acertar a pergunta, vai roubar 150 pontos de quem?</p>
                        <div className="grid grid-cols-2 gap-3">
                            {players.filter(p => p.id !== socket.id).map(p => (
                                <button key={p.id} onClick={() => submitAction({ targetId: p.id })} className="bg-red-600 hover:bg-red-500 p-4 rounded-xl font-bold flex flex-col items-center gap-2">
                                    <Target size={24}/> {p.nickname}
                                </button>
                            ))}
                        </div>
                        {players.length === 1 && <p>Jogando sozinho não dá pra roubar :( (Ganhe pontos extras)</p>}
                    </>
                )}
                <p className="mt-4 text-xs opacity-50">Aguardando todos os jogadores...</p>
            </div>
        )}

        {/* --- FASE DE PERGUNTA --- */}
        {(gameData.phase === 'QUESTION' || gameData.phase === 'REVEAL') && gameData.question && (
            <div className="w-full max-w-3xl flex flex-col items-center">
                
                {/* PERGUNTA */}
                <div className="bg-white text-slate-900 p-8 rounded-3xl shadow-2xl text-center w-full mb-8 min-h-[160px] flex items-center justify-center relative overflow-hidden">
                    <h2 className="text-2xl md:text-3xl font-black relative z-10">{gameData.question.q}</h2>
                </div>

                {/* OPÇÕES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {gameData.question.options.map((opt, idx) => {
                        let btnClass = "bg-slate-800/50 hover:bg-white/20 border-2 border-white/20"; // Padrão
                        
                        // Revelação
                        if (gameData.phase === 'REVEAL') {
                            if (idx === gameData.question.correct) btnClass = "bg-emerald-500 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105"; // Correta
                            else if (idx === selectedOption) btnClass = "bg-red-500/50 border-red-500 opacity-50"; // Errada selecionada
                            else btnClass = "opacity-30"; // Outras
                        } 
                        // Durante a pergunta (selecionado)
                        else if (selectedOption === idx) {
                            btnClass = "bg-yellow-500 text-slate-900 border-yellow-400 font-bold transform scale-105";
                        }

                        return (
                            <button 
                                key={idx} 
                                onClick={() => submitAnswer(idx)}
                                disabled={selectedOption !== null || gameData.phase === 'REVEAL'}
                                className={`p-6 rounded-2xl text-lg font-bold transition-all duration-300 ${btnClass} flex items-center gap-4`}
                            >
                                <span className="bg-white/10 w-8 h-8 flex items-center justify-center rounded-full text-xs opacity-70">
                                    {['A','B','C','D'][idx]}
                                </span>
                                <span className="text-left flex-1">{opt}</span>
                                {gameData.phase === 'REVEAL' && idx === gameData.question.correct && <Zap size={20} className="text-white"/>}
                            </button>
                        )
                    })}
                </div>

                {/* RESULTADO PESSOAL (TOAST) */}
                {gameData.phase === 'REVEAL' && gameData.roundResults?.[socket.id] && (
                    <div className={`mt-8 px-6 py-3 rounded-xl font-bold animate-bounce text-xl border-2 ${gameData.roundResults[socket.id].isCorrect ? 'bg-emerald-600 border-emerald-400' : 'bg-red-600 border-red-400'}`}>
                        {gameData.roundResults[socket.id].isCorrect ? "ACERTOU!" : "ERROU!"} 
                        <span className="ml-2 bg-black/20 px-2 rounded">
                            {gameData.roundResults[socket.id].pointsChange > 0 ? '+' : ''}{gameData.roundResults[socket.id].pointsChange} pts
                        </span>
                        {gameData.roundResults[socket.id].msg && <div className="text-xs font-normal mt-1 opacity-90">{gameData.roundResults[socket.id].msg}</div>}
                    </div>
                )}
            </div>
        )}

        {/* --- PLACAR --- */}
        <div className="fixed bottom-0 left-0 w-full bg-slate-900/90 backdrop-blur border-t border-white/10 p-4">
             <div className="max-w-4xl mx-auto flex items-center gap-6 overflow-x-auto custom-scrollbar pb-2">
                 {gameData.scores?.sort((a,b) => b.score - a.score).map((p, i) => (
                     <div key={p.id} className={`flex items-center gap-3 min-w-[140px] px-4 py-2 rounded-xl border ${p.id === socket.id ? 'bg-white/10 border-yellow-500' : 'border-transparent'}`}>
                         <div className={`font-black text-lg ${i===0 ? 'text-yellow-400' : 'text-slate-400'}`}>#{i+1}</div>
                         <div>
                             <div className="text-xs font-bold opacity-70 truncate max-w-[80px]">{p.nickname}</div>
                             <div className="font-mono font-bold">{p.score}</div>
                         </div>
                     </div>
                 ))}
             </div>
        </div>
    </div>
  );
}