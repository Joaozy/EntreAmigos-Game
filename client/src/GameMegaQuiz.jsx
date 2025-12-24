import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Zap, DollarSign, Skull, ShieldAlert, Trophy, Clock, Check, X, Crown, Heart, HeartCrack } from 'lucide-react';

export default function GameMegaQuiz({ players, isHost, roomId, gameData, phase }) {
  const [betInput, setBetInput] = useState(0);
  const [timer, setTimer] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [roundLogs, setRoundLogs] = useState([]);
  const [correctAnswer, setCorrectAnswer] = useState(null);

  const myPlayer = players.find(p => p.id === socket.id);
  const mode = gameData.mode || 'BATTLE'; // 'SURVIVAL' ou 'BATTLE'
  
  // Verifica se estou vivo (Lógica diferente para cada modo)
  const isAlive = mode === 'SURVIVAL' 
        ? (myPlayer?.lives > 0) 
        : (myPlayer?.score > 0);

  useEffect(() => {
    socket.on('megaquiz_timer', (t) => setTimer(t));
    socket.on('megaquiz_round_end', ({ correctAnswer, logs }) => {
        setCorrectAnswer(correctAnswer);
        setRoundLogs(logs || []);
    });

    if (phase === 'PRE_ROUND' || phase === 'BETTING') {
        setSelectedOption(null);
        setCorrectAnswer(null);
        setRoundLogs([]);
    }

    return () => {
        socket.off('megaquiz_timer');
        socket.off('megaquiz_round_end');
    };
  }, [phase]);

  const sendBet = () => { socket.emit('megaquiz_bet', { roomId, amount: betInput }); };

  const sendAnswer = (idx) => {
      if (!isAlive || selectedOption !== null) return;
      setSelectedOption(idx);
      socket.emit('megaquiz_answer', { roomId, answerIdx: idx });
  };

  const sendAttack = (targetId) => { socket.emit('megaquiz_attack', { roomId, targetId }); };

  // --- TELA DE VITÓRIA ---
  if (phase === 'VICTORY') {
      const winner = gameData.winner || players.sort((a,b)=>b.score - a.score)[0];
      return (
          <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 animate-in zoom-in duration-500">
              <Trophy size={100} className="text-yellow-400 mb-6 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce"/>
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-600 mb-2">VENCEDOR!</h1>
              <div className="text-3xl font-bold mb-8 flex items-center gap-2">
                  <Crown className="text-yellow-500"/> {winner?.nickname}
              </div>

              <div className="w-full max-w-md bg-slate-800 rounded-3xl p-6 shadow-2xl border border-slate-700">
                  <h3 className="text-slate-400 font-bold uppercase text-sm mb-4 border-b border-slate-700 pb-2">Placar Final</h3>
                  <div className="space-y-3">
                      {players.sort((a,b) => b.score - a.score).map((p, i) => (
                          <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl ${i===0 ? 'bg-yellow-500/10 border border-yellow-500/50' : 'bg-slate-700/50'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`font-bold ${i===0 ? 'text-yellow-400' : 'text-slate-300'}`}>{i+1}. {p.nickname}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xl">{p.score}pts</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  // --- CABEÇALHO ---
  const renderHeader = () => {
      const r = gameData.round;

      // Header Simples para Modo Sobrevivência
      if (mode === 'SURVIVAL') {
          return (
            <div className="bg-slate-800 w-full p-4 text-center border-b border-slate-700 flex justify-between items-center px-6">
                <div className="text-xs text-slate-500 font-bold uppercase">SOBREVIVÊNCIA</div>
                <h2 className="text-xl font-bold text-white">RODADA {r}</h2>
                <div className="text-xs text-slate-500 font-bold uppercase">3 VIDAS</div>
            </div>
          );
      }

      // Headers Especiais para Modo Battle (3+ players)
      if (r === 4) return <div className="bg-gradient-to-r from-blue-600 to-cyan-500 w-full p-4 text-center shadow-lg"><h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><Zap className="text-yellow-300"/> RODADA BÔNUS (x2)</h2></div>;
      if (r === 8) return <div className="bg-gradient-to-r from-purple-600 to-pink-600 w-full p-4 text-center shadow-lg"><h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><ShieldAlert className="text-white"/> ROUBO RÁPIDO</h2></div>;
      if (r === 12) return <div className="bg-gradient-to-r from-emerald-600 to-green-500 w-full p-4 text-center shadow-lg"><h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><DollarSign className="text-green-200"/> APOSTA</h2></div>;
      if (r >= 15) return <div className="bg-gradient-to-r from-red-900 to-red-600 w-full p-4 text-center shadow-lg animate-pulse"><h2 className="text-3xl font-black text-white flex justify-center items-center gap-2"><Skull className="text-white"/> MORTE SÚBITA - {r}</h2></div>;

      return <div className="bg-slate-800 w-full p-4 text-center border-b border-slate-700"><h2 className="text-xl font-bold text-slate-400">RODADA {r}</h2></div>;
  };

  // --- TELA PADRÃO ---
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center">
        {renderHeader()}
        
        {/* BARRA DE JOGADORES (PLACAR / VIDAS) */}
        <div className="w-full bg-slate-800/50 p-2 flex gap-4 overflow-x-auto justify-center no-scrollbar">
            {players.sort((a,b)=>b.score - a.score).map((p, i) => {
                const isPlayerDead = mode === 'SURVIVAL' ? p.lives <= 0 : p.score <= 0;
                
                return (
                    <div key={p.id} className={`flex flex-col items-center min-w-[70px] transition-all duration-500 ${isPlayerDead ? 'opacity-40 grayscale' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs relative ${p.id === socket.id ? 'bg-indigo-500 text-white ring-2 ring-indigo-300' : 'bg-slate-700 text-slate-300'}`}>
                            {i === 0 && !isPlayerDead ? '👑' : p.nickname.substring(0,2).toUpperCase()}
                            {isPlayerDead && <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center"><Skull size={16} className="text-red-500"/></div>}
                        </div>
                        <span className="text-[10px] font-bold mt-1 text-slate-400 truncate max-w-[70px]">{p.nickname}</span>
                        
                        {mode === 'SURVIVAL' ? (
                            <div className="flex gap-0.5 mt-1">
                                {[...Array(3)].map((_, idx) => (
                                    <Heart key={idx} size={10} className={`${idx < p.lives ? 'text-red-500 fill-red-500' : 'text-slate-700'}`} />
                                ))}
                            </div>
                        ) : (
                            <span className="text-[10px] font-bold text-slate-300">{p.score}</span>
                        )}
                    </div>
                )
            })}
        </div>

        {/* FEEDBACK DE RESULTADO */}
        {phase === 'RESULT' && (
            <div className={`w-full p-4 text-center animate-in slide-in-from-top-10 z-10 ${selectedOption === correctAnswer ? 'bg-emerald-600' : 'bg-red-600'}`}>
                <h2 className="text-3xl font-black text-white flex items-center justify-center gap-3">
                    {selectedOption === correctAnswer ? <><Check size={32}/> ACERTOU!</> : <><X size={32}/> ERROU!</>}
                </h2>
            </div>
        )}

        <div className="flex-1 w-full max-w-3xl p-6 flex flex-col justify-center relative">
            {/* ... (Renderização das perguntas igual antes) ... */}
            {(phase === 'QUESTION' || phase === 'RESULT') && gameData.currentQuestion && (
                <div className="animate-in zoom-in duration-300">
                    <div className="text-center mb-8">
                        <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">{gameData.currentQuestion.theme}</span>
                        <h1 className="text-2xl md:text-3xl font-black text-white mt-4 leading-relaxed">{gameData.currentQuestion.question}</h1>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {gameData.currentQuestion.options.map((opt, idx) => {
                            let btnClass = "bg-slate-700 hover:bg-slate-600 border-2 border-transparent";
                            
                            if (phase === 'RESULT') {
                                if (idx === correctAnswer) btnClass = "bg-emerald-600 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105 z-10"; 
                                else if (idx === selectedOption) btnClass = "bg-red-600 border-red-400 opacity-60"; 
                                else btnClass = "bg-slate-800 opacity-20 grayscale"; 
                            } 
                            else if (selectedOption === idx) {
                                btnClass = "bg-indigo-600 border-indigo-400 ring-2 ring-indigo-500/50";
                            }

                            return (
                                <button 
                                    key={idx} 
                                    onClick={() => sendAnswer(idx)}
                                    disabled={!isAlive || selectedOption !== null || phase === 'RESULT'}
                                    className={`p-6 rounded-2xl text-left font-bold text-lg transition-all transform ${btnClass} ${(!isAlive || selectedOption!==null) && phase !== 'RESULT' ? 'cursor-not-allowed opacity-80' : 'hover:scale-102'}`}
                                >
                                    {opt}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
            
            {!isAlive && phase === 'QUESTION' && (
                <div className="mt-8 bg-red-900/20 border border-red-900 text-red-400 p-4 rounded-xl text-center font-bold animate-pulse">
                    VOCÊ PERDEU TODAS AS VIDAS!
                </div>
            )}

            {/* LOGS */}
            {phase === 'RESULT' && roundLogs.length > 0 && (
                <div className="mt-8 bg-slate-800/80 p-4 rounded-xl border border-slate-700 animate-in slide-in-from-bottom">
                    <h4 className="text-slate-500 font-bold text-xs uppercase mb-2 border-b border-slate-700 pb-1">Resumo da Rodada</h4>
                    <ul className="space-y-1">
                        {roundLogs.map((log, i) => <li key={i} className="text-sm font-bold text-white flex items-center gap-2">• {log}</li>)}
                    </ul>
                </div>
            )}
        </div>

        {phase === 'QUESTION' && (
            <div className="w-full bg-slate-800 p-4 pb-8 safe-area-bottom">
                <div className="w-full max-w-3xl mx-auto flex items-center gap-4">
                    <Clock className="text-slate-400"/>
                    <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ease-linear ${timer < 5 ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${(timer / 20) * 100}%`}}></div>
                    </div>
                    <span className="font-mono font-bold text-xl w-8">{timer}</span>
                </div>
            </div>
        )}
    </div>
  );
}