import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Hand, AlertTriangle, CheckCircle, Clock, ThumbsDown, Copy, Trophy, Send } from 'lucide-react';

export default function GameStop({ players, isHost, roomId, gameData, phase }) {
  // ESTADOS
  const [myAnswers, setMyAnswers] = useState({}); 
  const [stopTriggered, setStopTriggered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0); 
  const answersRef = useRef({}); // Garante acesso ao estado mais recente dentro do socket listener

  // DADOS SERVER
  const letter = gameData?.letter || "?";
  const categories = gameData?.categories || [];
  const serverAnswers = gameData?.answers || {};
  const votes = gameData?.votes || {}; 
  const totalScores = gameData?.totalScores || {}; 
  const currentRound = gameData?.round || 1;
  const currentPhase = gameData?.phase || 'PLAYING';
  const endTime = gameData?.endTime;

  const timerRef = useRef(null);

  // Sync Ref
  useEffect(() => { answersRef.current = myAnswers; }, [myAnswers]);

  // TIMER
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentPhase === 'PLAYING' && !stopTriggered && endTime) {
        const updateTimer = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((endTime - now) / 1000));
            setTimeLeft(diff);
            if (diff <= 0 && timerRef.current) clearInterval(timerRef.current);
        };
        updateTimer();
        timerRef.current = setInterval(updateTimer, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [endTime, currentPhase, stopTriggered]);

  // RESET
  useEffect(() => {
      if (currentPhase === 'PLAYING') {
          setStopTriggered(false);
          // Limpa respostas apenas se for uma nova rodada (não se for reconnect)
          if (!gameData.stopCaller) {
              setMyAnswers({});
              answersRef.current = {};
          }
      }
  }, [currentPhase, gameData.round]);

  // LISTENER DO STOP
  useEffect(() => {
    const handleStop = () => {
        setStopTriggered(true);
        // Envia o que tiver na REF imediatamente
        socket.emit('stop_submit', { roomId, answers: answersRef.current });
    };

    socket.on('stop_triggered', handleStop);
    return () => socket.off('stop_triggered', handleStop);
  }, [roomId]);

  const handleSubmit = () => {
      setStopTriggered(true);
      socket.emit('stop_call', { roomId, answers: myAnswers });
  };

  const handleInputChange = (catIndex, val) => {
      setMyAnswers(prev => ({ ...prev, [catIndex]: val }));
  };

  const cycleVote = (targetId, catIndex) => {
      const key = `${targetId}_${catIndex}`;
      const cellVotes = votes[key] || { invalid: [], duplicate: [] };
      const myId = socket.id;
      
      const isInvalid = cellVotes.invalid.includes(myId);
      const isDuplicate = cellVotes.duplicate.includes(myId);

      // Ciclo: Nada -> Inválido -> Duplicado -> Nada
      if (!isInvalid && !isDuplicate) socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'invalid' });
      else if (isInvalid) socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'duplicate' });
      else socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'none' }); // Remove votos
  };

  const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

  // Lógica Visual de Pontos (Estimativa Client-Side para feedback imediato)
  const calculatePoints = (playerId) => {
      let score = 0; 
      categories.forEach((cat, idx) => {
          const rawWord = serverAnswers[playerId]?.[idx] || "";
          const normWord = normalize(rawWord);
          if (!normWord) return;

          const key = `${playerId}_${idx}`;
          const cellVotes = votes[key] || { invalid: [], duplicate: [] };
          if (cellVotes.invalid.length > players.length / 2) return; // Anulado

          // Verifica duplicatas globais
          let isAutoDuplicate = false;
          players.forEach(p => { 
              if (p.id !== playerId) { 
                  const otherNorm = normalize(serverAnswers[p.id]?.[idx]); 
                  if (otherNorm && otherNorm === normWord) isAutoDuplicate = true; 
              } 
          });

          if (isAutoDuplicate || cellVotes.duplicate.length > players.length / 2) score += 5;
          else score += 10;
      });
      return score;
  };

  const countFilled = Object.values(myAnswers).filter(v => v && v.trim().length > 0).length;
  const canCallStop = countFilled >= categories.length && categories.length > 0; // Só pode chamar se preencher tudo (opcional, ou countFilled > 0)

  // --- TELA 1: JOGO ---
  if (currentPhase === 'PLAYING') {
      return (
          <div className="min-h-screen bg-purple-900 text-white p-4 flex flex-col items-center">
              <div className="w-full max-w-2xl flex justify-between items-center mb-6 bg-purple-950 p-4 rounded-xl border border-purple-700 shadow-lg relative overflow-hidden">
                  <div className="text-center z-10">
                      <p className="text-[10px] uppercase font-bold text-purple-300">Rodada {currentRound}</p>
                      <h1 className="text-6xl font-black text-yellow-400 drop-shadow-md">{letter}</h1>
                  </div>
                  
                  {/* Timer Bar */}
                  {endTime && (
                      <div className="absolute top-0 right-0 h-1 bg-yellow-400 transition-all duration-1000" style={{ width: `${(timeLeft/180)*100}%` }}></div>
                  )}

                  {stopTriggered ? (
                      <div className="text-center animate-pulse text-red-400 z-10">
                          <Send size={40} className="mx-auto mb-1"/>
                          <p className="font-bold text-xl">ENVIANDO...</p>
                      </div>
                  ) : (
                      <div className="text-right z-10">
                         <div className={`text-2xl font-black font-mono ${timeLeft < 20 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                             {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                         </div>
                         <p className="text-xs text-purple-400">Preenchidos: {countFilled}/{categories.length}</p>
                      </div>
                  )}
              </div>

              <div className="w-full max-w-2xl space-y-3 mb-32">
                  {categories.map((cat, idx) => (
                      <div key={idx} className="bg-white/10 px-4 py-2 rounded-xl border border-white/5 flex flex-col focus-within:bg-white/20 transition-colors">
                          <label className="text-[10px] font-bold uppercase text-purple-200 ml-1 mb-1">{cat}</label>
                          <input 
                              disabled={stopTriggered}
                              value={myAnswers[idx] || ""}
                              onChange={e => handleInputChange(idx, e.target.value)}
                              className="w-full bg-transparent border-b-2 border-purple-500/50 py-1 text-xl font-bold text-white outline-none focus:border-yellow-400 transition uppercase placeholder:text-purple-800 disabled:opacity-50"
                              autoComplete="off"
                              placeholder={`Começa com ${letter}...`}
                          />
                      </div>
                  ))}
              </div>

              {!stopTriggered && (
                  <div className="fixed bottom-0 left-0 w-full p-4 bg-purple-900/90 backdrop-blur border-t border-purple-800 flex justify-center z-50">
                      <button 
                        onClick={handleSubmit}
                        // Permite STOP se preencheu pelo menos 1 (ou mude a regra aqui)
                        disabled={countFilled < 1} 
                        className={`
                            font-black text-2xl py-4 px-12 rounded-full shadow-2xl transition flex items-center gap-3 border-4 w-full max-w-md justify-center
                            ${countFilled >= 1 ? 'bg-red-600 hover:bg-red-500 text-white border-red-800 hover:scale-105 cursor-pointer' : 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed opacity-80'}
                        `}
                      >
                          <Hand size={32} /> STOP!
                      </button>
                  </div>
              )}
          </div>
      );
  }

  // --- TELA 3: GAME OVER ---
  if (currentPhase === 'GAME_OVER') {
      const winner = gameData.winner;
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
              <Trophy size={80} className="text-yellow-400 mb-6 animate-bounce" />
              <h1 className="text-4xl font-black text-white mb-2">FIM DE JOGO!</h1>
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 rounded-3xl shadow-2xl mb-10 transform hover:scale-105 transition w-full max-w-sm">
                  <h2 className="text-4xl font-black text-white mb-2">{winner?.nickname}</h2>
                  <p className="text-xl font-bold text-purple-200">{totalScores[winner?.id]} pontos</p>
              </div>
              <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6">
                  {players.sort((a,b) => (totalScores[b.id]||0) - (totalScores[a.id]||0)).map((p, i) => (
                      <div key={p.id} className="flex justify-between items-center py-3 border-b border-slate-700 last:border-0">
                          <span className={`font-bold ${i===0 ? 'text-yellow-400' : 'text-white'}`}>#{i+1} {p.nickname}</span>
                          <span className="font-mono text-slate-400">{totalScores[p.id] || 0} pts</span>
                      </div>
                  ))}
              </div>
              {isHost && (<button onClick={() => socket.emit('restart_game', { roomId })} className="mt-8 bg-slate-700 text-white font-bold py-4 px-10 rounded-full hover:bg-slate-600 shadow-lg">Voltar ao Lobby</button>)}
          </div>
      );
  }

  // --- TELA 2: REVISÃO ---
  return (
      <div className="min-h-screen bg-slate-900 text-white p-2 md:p-6 flex flex-col items-center">
          <div className="text-center mb-4">
            <h1 className="text-2xl md:text-3xl font-black text-yellow-400 uppercase tracking-widest">Correção</h1>
            <p className="text-slate-400 text-xs">Clique nas palavras incorretas para anular.</p>
          </div>
          
          <div className="w-full max-w-[95vw] overflow-x-auto pb-32 border border-slate-700 rounded-xl shadow-2xl bg-slate-800/50">
              <table className="w-full border-collapse">
                  <thead>
                      <tr>
                          <th className="p-3 text-left bg-slate-800 border-b border-r border-slate-700 min-w-[120px] sticky left-0 z-20 text-yellow-500 font-bold uppercase text-xs shadow-[2px_0_5px_rgba(0,0,0,0.3)]">Categoria</th>
                          {players.map(p => (
                              <th key={p.id} className="p-2 text-center bg-slate-800 border-b border-slate-700 min-w-[140px]">
                                  <div className="font-bold text-white text-sm truncate max-w-[120px] mx-auto">{p.nickname}</div>
                                  <div className="text-[10px] text-slate-500">Total: {totalScores[p.id] || 0}</div>
                                  <div className="text-xs text-green-400 bg-green-900/20 rounded py-0.5 mt-1">+{calculatePoints(p.id)}</div>
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody>
                      {categories.map((cat, idx) => (
                          <tr key={idx} className="hover:bg-slate-700/30 transition">
                              <td className="p-3 bg-slate-800/95 border-b border-r border-slate-700 font-bold text-slate-300 text-xs sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">{cat}</td>
                              {players.map(p => {
                                  const rawWord = serverAnswers[p.id]?.[idx] || "";
                                  const normWord = normalize(rawWord);
                                  const isEmpty = !normWord;
                                  const key = `${p.id}_${idx}`;
                                  
                                  const cellVotes = votes[key] || { invalid: [], duplicate: [] };
                                  const threshold = players.length / 2;
                                  const isInvalid = cellVotes.invalid.length > threshold;
                                  const isDuplicate = cellVotes.duplicate.length > threshold;
                                  
                                  // Auto-detecção de duplicata visual
                                  let isAutoDuplicate = false;
                                  if (!isEmpty && !isInvalid) {
                                      players.forEach(op => { if (op.id !== p.id) { const onorm = normalize(serverAnswers[op.id]?.[idx]); if (onorm && onorm === normWord) isAutoDuplicate = true; } });
                                  }

                                  let styleClass = "bg-transparent";
                                  let icon = null;
                                  
                                  if (isEmpty) styleClass = "bg-black/20 opacity-30";
                                  else if (isInvalid) { styleClass = "bg-red-900/40 text-red-400 decoration-red-500 line-through"; icon = <ThumbsDown size={14} className="inline mr-1"/>; }
                                  else if (isDuplicate) { styleClass = "bg-yellow-900/30 text-yellow-300"; icon = <Copy size={14} className="inline mr-1"/>; }
                                  else if (isAutoDuplicate) { styleClass = "bg-yellow-900/10 text-yellow-200/80"; icon = <AlertTriangle size={14} className="inline mr-1"/>; }
                                  else { styleClass = "text-green-300"; icon = <CheckCircle size={14} className="inline mr-1 text-green-500"/>; }

                                  return (
                                      <td key={p.id} onClick={() => !isEmpty && cycleVote(p.id, idx)} className={`p-2 border-b border-slate-700 text-center cursor-pointer select-none transition relative ${styleClass}`}>
                                          <div className="text-sm font-medium break-words px-1">{rawWord || "-"}</div>
                                          {!isEmpty && <div className="text-[10px] opacity-70 mt-1">{icon}</div>}
                                          
                                          {/* Marcadores de Voto */}
                                          <div className="absolute top-1 right-1 flex gap-0.5">
                                              {cellVotes.invalid.length > 0 && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                                              {cellVotes.duplicate.length > 0 && <div className="w-2 h-2 rounded-full bg-yellow-500"></div>}
                                          </div>
                                      </td>
                                  );
                              })}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          
          {isHost && (
              <div className="fixed bottom-0 left-0 w-full p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-center z-50">
                  <button 
                    onClick={() => socket.emit('stop_next_round', { roomId })} 
                    className="bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 px-12 rounded-full shadow-2xl transition hover:scale-105 border-4 border-emerald-300 flex items-center gap-2"
                  >
                      {currentRound < 5 ? "PRÓXIMA RODADA ➡️" : "FINALIZAR JOGO 🏁"}
                  </button>
              </div>
          )}
      </div>
  );
}