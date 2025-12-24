import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Brain, Zap, DollarSign, Skull, ShieldAlert, Trophy, Clock, Check, X, Crown } from 'lucide-react';

export default function GameMegaQuiz({ players, isHost, roomId, gameData, phase }) {
  const [betInput, setBetInput] = useState(0);
  const [timer, setTimer] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [roundLogs, setRoundLogs] = useState([]);
  const [correctAnswer, setCorrectAnswer] = useState(null);

  const myPlayer = players.find(p => p.id === socket.id);
  const myScore = myPlayer?.score || 0;
  const isAlive = myScore > 0;

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

  // --- TELA DE VITÓRIA / FIM DE JOGO ---
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
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i===0 ? 'bg-yellow-500 text-black' : 'bg-slate-600 text-white'}`}>
                                      {i+1}º
                                  </div>
                                  <span className={`font-bold ${i===0 ? 'text-yellow-400' : 'text-slate-300'}`}>{p.nickname}</span>
                              </div>
                              <span className="font-mono font-bold text-xl">{p.score}</span>
                          </div>
                      ))}
                  </div>
              </div>
              
              <div className="mt-8 text-slate-500 text-sm animate-pulse">
                  O Host pode voltar ao Lobby para reiniciar.
              </div>
          </div>
      );
  }

  // --- CABEÇALHO ---
  const renderHeader = () => {
      const r = gameData.round;
      
      let headerContent = (
          <div className="bg-slate-800 w-full p-4 text-center border-b border-slate-700">
              <h2 className="text-xl font-bold text-slate-400">RODADA {r}</h2>
          </div>
      );

      if (r === 4) headerContent = (
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 w-full p-4 text-center shadow-lg">
              <h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><Zap className="text-yellow-300"/> RODADA BÔNUS (x2)</h2>
          </div>
      );
      if (r === 8) headerContent = (
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 w-full p-4 text-center shadow-lg">
              <h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><ShieldAlert className="text-white"/> ROUBO RÁPIDO</h2>
          </div>
      );
      if (r === 12) headerContent = (
          <div className="bg-gradient-to-r from-emerald-600 to-green-500 w-full p-4 text-center shadow-lg">
              <h2 className="text-2xl font-black text-white flex justify-center items-center gap-2"><DollarSign className="text-green-200"/> APOSTA</h2>
          </div>
      );
      if (r >= 15) headerContent = (
          <div className="bg-gradient-to-r from-red-900 to-red-600 w-full p-4 text-center shadow-lg animate-pulse">
              <h2 className="text-3xl font-black text-white flex justify-center items-center gap-2"><Skull className="text-white"/> MORTE SÚBITA - {r}</h2>
          </div>
      );

      return headerContent;
  };

  // --- TELA DE APOSTA ---
  if (phase === 'BETTING') {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center">
            {renderHeader()}
            <div className="flex-1 flex flex-col justify-center items-center w-full max-w-md p-6">
                <DollarSign size={64} className="text-emerald-500 mb-4 animate-bounce"/>
                <h3 className="text-2xl font-bold mb-2">Quanto você aposta?</h3>
                <p className="text-slate-400 mb-8">Você tem <b>{myScore}</b> pontos.</p>
                {isAlive ? (
                    <div className="w-full space-y-4">
                        <input type="range" min="0" max={myScore} step="50" value={betInput} onChange={e => setBetInput(parseInt(e.target.value))} className="w-full accent-emerald-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                        <div className="text-4xl font-black text-emerald-400 text-center">{betInput} pts</div>
                        <button onClick={sendBet} className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-xl font-bold text-xl transition">CONFIRMAR</button>
                    </div>
                ) : <div className="text-red-500 font-bold">Você foi eliminado.</div>}
                <div className="mt-8 flex items-center gap-2 text-slate-500 font-mono"><Clock/> {timer}s</div>
            </div>
        </div>
      );
  }

  // --- TELA DE ATAQUE ---
  if (phase === 'ATTACK') {
      const attackerId = gameData.attackData?.attackerId;
      const isMeAttacker = attackerId === socket.id;
      const attackerName = players.find(p => p.id === attackerId)?.nickname;

      return (
          <div className="min-h-screen bg-red-950 text-white flex flex-col items-center p-4">
               <Skull size={64} className="text-red-500 mt-10 mb-4 animate-pulse"/>
               <h1 className="text-3xl font-black text-white mb-2">HORA DO ATAQUE!</h1>
               {isMeAttacker ? (
                   <div className="text-center w-full max-w-4xl animate-in zoom-in">
                       <p className="text-xl text-red-200 font-bold mb-8">Escolha quem vai perder 300 pontos:</p>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           {players.filter(p => p.id !== socket.id && p.score > 0).map(p => (
                               <button key={p.id} onClick={() => sendAttack(p.id)} className="bg-red-800 hover:bg-red-600 border-2 border-red-500 p-6 rounded-2xl flex flex-col items-center transition transform hover:scale-105">
                                   <div className="text-2xl font-black">{p.nickname}</div>
                                   <div className="text-red-300">{p.score} pts</div>
                               </button>
                           ))}
                       </div>
                   </div>
               ) : (
                   <div className="text-center">
                       <p className="text-lg text-slate-300"><b>{attackerName}</b> está escolhendo uma vítima...</p>
                       <div className="mt-8 animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500 mx-auto"></div>
                   </div>
               )}
          </div>
      );
  }

  // --- TELA PADRÃO ---
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center">
        {renderHeader()}
        
        {/* PLACAR */}
        <div className="w-full bg-slate-800/50 p-2 flex gap-4 overflow-x-auto justify-center no-scrollbar">
            {players.sort((a,b)=>b.score - a.score).map((p, i) => (
                <div key={p.id} className={`flex flex-col items-center min-w-[60px] transition-all duration-500 ${p.score <= 0 ? 'opacity-30 grayscale' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.id === socket.id ? 'bg-indigo-500 text-white ring-2 ring-indigo-300' : 'bg-slate-700 text-slate-300'}`}>
                        {i === 0 ? '👑' : p.nickname.substring(0,2).toUpperCase()}
                    </div>
                    <span className="text-[10px] font-bold mt-1 text-slate-400">{p.score}</span>
                </div>
            ))}
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
            {phase === 'PRE_ROUND' && <div className="text-center animate-pulse"><h3 className="text-2xl text-slate-400 font-bold">Preparando Pergunta...</h3></div>}

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

            {/* LOGS DOS EVENTOS */}
            {phase === 'RESULT' && roundLogs.length > 0 && (
                <div className="mt-8 bg-slate-800/80 p-4 rounded-xl border border-slate-700 animate-in slide-in-from-bottom">
                    <h4 className="text-slate-500 font-bold text-xs uppercase mb-2 border-b border-slate-700 pb-1">Resumo da Rodada</h4>
                    <ul className="space-y-1">
                        {roundLogs.map((log, i) => (
                            <li key={i} className="text-sm font-bold text-white flex items-center gap-2">
                                • {log}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>

        {/* TIMER */}
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