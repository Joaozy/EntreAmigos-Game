import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Hand, AlertTriangle, CheckCircle, XCircle, Clock, ThumbsDown, Copy, Trophy } from 'lucide-react';

export default function GameStop({ players, isHost, roomId, gameData, phase }) {
  // ESTADOS LOCAIS
  const [myAnswers, setMyAnswers] = useState({}); 
  const [stopTriggered, setStopTriggered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120); 
  
  // REF PARA MANTER RESPOSTAS ATUALIZADAS NO SOCKET (CORREÇÃO CRÍTICA)
  const answersRef = useRef({}); 

  // DADOS DO SERVER
  const letter = gameData?.letter || "?";
  const categories = gameData?.categories || [];
  const serverAnswers = gameData?.answers || {};
  const votes = gameData?.votes || {}; 
  const totalScores = gameData?.totalScores || {}; 
  const currentRound = gameData?.round || 1;
  const currentPhase = gameData?.phase || 'PLAYING';
  const stopCaller = gameData?.stopCaller;
  const endTime = gameData?.endTime;

  const timerRef = useRef(null);

  const normalize = (str) => {
      if(!str) return "";
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // ATUALIZA A REF SEMPRE QUE DIGITA (Para o envio automático ler o valor certo)
  useEffect(() => {
      answersRef.current = myAnswers;
  }, [myAnswers]);

  // --- TIMER ---
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

  // RESET ESTADO LOCAL
  useEffect(() => {
      if (currentPhase === 'PLAYING') {
          setStopTriggered(false);
          if (!stopCaller) {
              setMyAnswers({});
              answersRef.current = {};
          }
      }
  }, [gameData]);

  // EVENTO STOP (Modificado para usar Ref)
  useEffect(() => {
    const handleStop = () => {
        setStopTriggered(true);
        
        // Envia imediatamente o que tem na REF (O estado mais atual)
        console.log("Enviando respostas forçadas:", answersRef.current);
        socket.emit('stop_submit', { roomId, answers: answersRef.current });
    };

    socket.on('stop_triggered', handleStop);
    return () => socket.off('stop_triggered', handleStop);
  }, [roomId]); // Dependência roomId garante que socket tenha ID certo

  const handleSubmit = (isStopCall = false) => {
      if (isStopCall) socket.emit('stop_call', { roomId, answers: myAnswers });
      else socket.emit('stop_submit', { roomId, answers: myAnswers });
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

      if (!isInvalid && !isDuplicate) socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'invalid' });
      else if (isInvalid) socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'duplicate' });
      else socket.emit('stop_toggle_vote', { roomId, targetId, categoryIndex: catIndex, voteType: 'duplicate' }); 
  };

  const calculatePoints = (playerId) => {
      let score = 0; const playerAns = serverAnswers[playerId] || {};
      categories.forEach((cat, idx) => {
          const rawWord = playerAns[idx] || ""; const normWord = normalize(rawWord); const key = `${playerId}_${idx}`;
          const cellVotes = votes[key] || { invalid: [], duplicate: [] }; const threshold = players.length / 2;

          if (!normWord) return;
          if (cellVotes.invalid.length > threshold) return; 
          if (cellVotes.duplicate.length > threshold) { score += 5; return; }

          let isAutoDuplicate = false;
          players.forEach(p => { 
              if (p.id !== playerId) { 
                  const otherNorm = normalize(serverAnswers[p.id]?.[idx]); 
                  if (otherNorm && otherNorm === normWord) isAutoDuplicate = true; 
              } 
          });
          score += isAutoDuplicate ? 5 : 10;
      });
      return score;
  };

  const countFilled = Object.values(myAnswers).filter(v => v && v.trim().length > 0).length;
  const canCallStop = countFilled === 8;

  // --- TELA 1: JOGANDO ---
  if (currentPhase === 'PLAYING') {
      return (
          <div className="min-h-screen bg-purple-900 text-white p-4 flex flex-col items-center">
              <div className="w-full max-w-2xl flex justify-between items-center mb-6 bg-purple-950 p-4 rounded-xl border border-purple-700 shadow-lg relative overflow-hidden">
                  <div className="text-center z-10">
                      <p className="text-[10px] uppercase font-bold text-purple-300">Rodada {currentRound}/5</p>
                      <h1 className="text-6xl font-black text-yellow-400 drop-shadow-md">{letter}</h1>
                  </div>
                  <div className="absolute top-0 right-0 h-1 bg-yellow-400 transition-all duration-1000" style={{ width: `${(timeLeft/120)*100}%` }}></div>
                  {stopTriggered ? (
                      <div className="text-center animate-pulse text-red-400 z-10">
                          <Clock size={40} className="mx-auto mb-1"/>
                          <p className="font-bold text-xl">ENVIANDO...</p>
                      </div>
                  ) : (
                      <div className="text-right z-10">
                         <div className={`text-2xl font-black font-mono ${timeLeft < 20 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                             {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                         </div>
                         <p className="text-xs text-purple-400">Preenchidos: {countFilled}/8</p>
                      </div>
                  )}
              </div>

              <div className="w-full max-w-2xl space-y-3 mb-24">
                  {categories.map((cat, idx) => (
                      <div key={idx} className="bg-white/10 px-3 py-2 rounded-lg border border-white/5 flex flex-col">
                          <label className="text-[10px] font-bold uppercase text-purple-200 ml-1">{cat}</label>
                          <input 
                              disabled={stopTriggered}
                              value={myAnswers[idx] || ""}
                              onChange={e => handleInputChange(idx, e.target.value)}
                              className="w-full bg-purple-950/50 border border-purple-500 rounded px-3 py-2 text-lg font-bold text-white outline-none focus:border-yellow-400 focus:bg-purple-900 transition uppercase placeholder:text-purple-800 disabled:opacity-50"
                              autoComplete="off"
                          />
                      </div>
                  ))}
              </div>

              {!stopTriggered && (
                  <div className="fixed bottom-6 w-full px-4 flex justify-center">
                      <button 
                        onClick={() => handleSubmit(true)}
                        disabled={!canCallStop}
                        className={`
                            font-black text-2xl py-4 px-12 rounded-full shadow-2xl transition flex items-center gap-3 border-4 
                            ${canCallStop ? 'bg-red-600 hover:bg-red-500 text-white border-red-800 hover:scale-105 cursor-pointer' : 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed opacity-80'}
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
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 rounded-3xl shadow-2xl mb-10 transform hover:scale-105 transition">
                  <h2 className="text-5xl font-black text-white mb-2">{winner?.nickname}</h2>
                  <p className="text-xl font-bold text-purple-200">{totalScores[winner?.id]} pontos</p>
              </div>
              <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6">
                  {players.sort((a,b) => (totalScores[b.id]||0) - (totalScores[a.id]||0)).map((p, i) => (
                      <div key={p.id} className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0">
                          <span className={`font-bold ${i===0 ? 'text-yellow-400' : 'text-white'}`}>#{i+1} {p.nickname}</span>
                          <span className="font-mono text-slate-400">{totalScores[p.id] || 0} pts</span>
                      </div>
                  ))}
              </div>
              {isHost && (<button onClick={() => socket.emit('restart_game', { roomId })} className="mt-8 bg-slate-700 text-white font-bold py-3 px-8 rounded-full hover:bg-slate-600">Voltar ao Lobby</button>)}
          </div>
      );
  }

  // --- TELA 2: REVISÃO ---
  return (
      <div className="min-h-screen bg-slate-900 text-white p-2 md:p-6 flex flex-col items-center">
          <div className="text-center mb-4">
            <h1 className="text-2xl md:text-3xl font-black text-yellow-400 uppercase tracking-widest">Correção - Rodada {currentRound}</h1>
            <p className="text-slate-400 text-xs">Toque na palavra para votar</p>
          </div>
          <div className="w-full max-w-7xl overflow-x-auto pb-20">
              <table className="w-full border-collapse">
                  <thead>
                      <tr>
                          <th className="p-3 text-left bg-slate-800 border border-slate-700 min-w-[140px] sticky left-0 z-10 text-yellow-500 font-bold uppercase text-xs">Categoria</th>
                          {players.map(p => (
                              <th key={p.id} className="p-2 text-center bg-slate-800 border border-slate-700 min-w-[120px]">
                                  <div className="font-bold text-white text-sm truncate max-w-[100px] mx-auto">{p.nickname}</div>
                                  <div className="text-[10px] text-slate-500 mb-1">Total: {totalScores[p.id] || 0}</div>
                                  <div className="text-xs text-indigo-400 bg-indigo-900/30 rounded py-0.5">+{calculatePoints(p.id)}</div>
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody>
                      {categories.map((cat, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                              <td className="p-2 bg-slate-800/90 border border-slate-700 font-bold text-slate-300 text-xs sticky left-0 z-10 shadow-lg">{cat}</td>
                              {players.map(p => {
                                  const rawWord = serverAnswers[p.id]?.[idx] || "";
                                  const normWord = normalize(rawWord);
                                  const isEmpty = !normWord;
                                  const key = `${p.id}_${idx}`;
                                  const cellVotes = votes[key] || { invalid: [], duplicate: [] };
                                  const invalidCount = cellVotes.invalid.length;
                                  const duplicateCount = cellVotes.duplicate.length;
                                  const threshold = players.length / 2;
                                  const isVotedInvalid = invalidCount > threshold;
                                  const isVotedDuplicate = duplicateCount > threshold;
                                  
                                  let isAutoDuplicate = false;
                                  if (!isEmpty && !isVotedInvalid) {
                                      players.forEach(op => { if (op.id !== p.id) { const onorm = normalize(serverAnswers[op.id]?.[idx]); if (onorm && onorm === normWord) isAutoDuplicate = true; } });
                                  }

                                  let cellStyle = "bg-slate-900/50"; let icon = null; let points = 10; let statusText = "";
                                  if (isEmpty) { cellStyle = "bg-slate-950/50 opacity-40"; points = 0; } 
                                  else if (isVotedInvalid) { cellStyle = "bg-red-950/50 text-red-500 line-through decoration-2 decoration-red-600"; icon = <ThumbsDown size={12} className="inline mr-1" />; points = 0; statusText = "Anulado"; } 
                                  else if (isVotedDuplicate) { cellStyle = "bg-yellow-900/20 text-yellow-300 border-yellow-800"; icon = <Copy size={12} className="inline mr-1" />; points = 5; statusText = "Repetido (Voto)"; } 
                                  else if (isAutoDuplicate) { cellStyle = "bg-yellow-900/10 text-yellow-200/80"; icon = <AlertTriangle size={12} className="inline mr-1" />; points = 5; statusText = "Repetido"; } 
                                  else { cellStyle = "bg-green-900/10 text-green-300/80"; icon = <CheckCircle size={12} className="inline mr-1" />; points = 10; }

                                  return (
                                      <td key={p.id} onClick={() => !isEmpty && cycleVote(p.id, idx)} className={`p-2 border border-slate-700 text-center cursor-pointer select-none transition relative ${cellStyle}`}>
                                          {!isEmpty && (invalidCount > 0 || duplicateCount > 0) && (
                                              <div className="absolute top-1 right-1 flex gap-1">
                                                  {invalidCount > 0 && <span className="text-[9px] bg-red-600 text-white px-1 rounded-full">{invalidCount}</span>}
                                                  {duplicateCount > 0 && <span className="text-[9px] bg-yellow-600 text-black px-1 rounded-full">{duplicateCount}</span>}
                                              </div>
                                          )}
                                          <div className="font-bold text-sm break-all">{rawWord || "-"}</div>
                                          {!isEmpty && <div className="text-[9px] opacity-70 mt-1 flex flex-col items-center"><span>{icon} {points} pts</span>{statusText && <span className="scale-75 origin-top">{statusText}</span>}</div>}
                                      </td>
                                  );
                              })}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          {isHost && (
              <button 
                onClick={() => socket.emit('stop_next_round', { roomId })} 
                className="fixed bottom-8 bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 px-10 rounded-full shadow-lg transition hover:scale-105 z-50 border-4 border-emerald-300"
              >
                  {currentRound < 5 ? `IR PARA RODADA ${currentRound + 1}` : "FINALIZAR JOGO"}
              </button>
          )}
      </div>
  );
}