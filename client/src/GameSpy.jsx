import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Eye, MapPin, VenetianMask, Clock, Lock, MessageCircle, Send, Users, AlertTriangle, CheckCircle } from 'lucide-react';

export default function GameSpy({ players, isHost, roomId, gameData, phase }) {
  const [myRole, setMyRole] = useState(null);
  const [myWord, setMyWord] = useState(null);
  const [myCategory, setMyCategory] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerInput, setAnswerInput] = useState('');
  
  const answersEndRef = useRef(null);

  useEffect(() => {
    socket.on('spy_secret', (data) => {
        setMyRole(data.role);
        setMyWord(data.word);
        setMyCategory(data.category);
    });
    return () => socket.off('spy_secret');
  }, []);

  useEffect(() => {
      answersEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameData.answers, gameData.currentQuestionIndex]);

  const submitAnswer = (e) => {
      e.preventDefault();
      if (!answerInput.trim()) return;
      socket.emit('spy_submit_answer', { roomId, answer: answerInput });
      setAnswerInput('');
  };

  const votar = (targetId) => {
      socket.emit('spy_vote', { roomId, targetId });
  };

  const chutarPalavra = (word) => {
      // CORREÇÃO: Texto genérico "a palavra"
      if(confirm(`Tem certeza que a palavra secreta é ${word}?`)) {
          socket.emit('spy_guess_location', { roomId, word });
      }
  };

  // --- TELA DE REVELAÇÃO FINAL ---
  if (phase === 'REVEAL') {
      const spy = players.find(p => p.id === gameData.spyId);
      const isSpyWin = gameData.winner === 'SPY';
      
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in">
              <div className={`mb-6 p-6 rounded-3xl border-4 shadow-2xl ${isSpyWin ? 'bg-red-900/50 border-red-500' : 'bg-emerald-900/50 border-emerald-500'}`}>
                  <h1 className="text-4xl font-black mb-2 uppercase">{isSpyWin ? "O ESPIÃO VENCEU!" : "OS CIVIS VENCERAM!"}</h1>
                  <p className="text-lg font-bold opacity-80">{gameData.winReason}</p>
              </div>

              <div className="mb-8">
                  {/* CORREÇÃO: "A palavra secreta era" em vez de "O local era" */}
                  <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">A palavra secreta era</p>
                  <h2 className="text-4xl font-black text-white mt-2">{gameData.secretWord}</h2>
                  <p className="mt-2 text-indigo-300 font-bold uppercase text-xs tracking-widest">{gameData.category}</p>
              </div>
              
              <div className="bg-slate-800 p-4 rounded-2xl w-full max-w-xs border border-slate-700">
                  <p className="text-slate-500 text-xs uppercase font-bold mb-2">Identidade do Espião</p>
                  <div className="flex items-center justify-center gap-3">
                      <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-2xl font-bold">
                        {spy?.nickname[0]}
                      </div>
                      <span className="text-xl font-bold">{spy?.nickname}</span>
                  </div>
              </div>

              {isHost && (
                  <button onClick={() => socket.emit('restart_game', { roomId })} className="mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-full transition shadow-lg">
                      Jogar Novamente
                  </button>
              )}
          </div>
      );
  }

  // --- TELA DE CHUTE DO ESPIÃO (Contra-Ataque) ---
  if (phase === 'SPY_GUESS') {
      const imSpy = myRole === 'ESPIÃO';
      return (
          <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center justify-center text-center">
              <h1 className="text-3xl font-black text-red-500 mb-2 animate-pulse">ESPIÃO DESCOBERTO!</h1>
              <p className="text-white mb-6 max-w-md">
                  {/* CORREÇÃO: Texto genérico "adivinhar a palavra" */}
                  {imSpy ? "Você foi pego! Mas ainda pode vencer se adivinhar a palavra secreta." : "O Espião foi pego! Agora ele tem uma chance de adivinhar a palavra secreta."}
              </p>
              
              {imSpy ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl">
                      {gameData.possibleWords.map(word => (
                          <button key={word} onClick={() => chutarPalavra(word)} className="bg-slate-800 hover:bg-red-600 text-white p-3 rounded-xl font-bold transition border border-slate-700 hover:border-red-400">
                              {word}
                          </button>
                      ))}
                  </div>
              ) : (
                  <div className="flex items-center gap-2 text-slate-400 bg-slate-800 p-4 rounded-xl">
                      <Clock className="animate-spin-slow" /> Aguardando o Espião tentar adivinhar...
                  </div>
              )}
          </div>
      );
  }

  // --- TELA DE VOTAÇÃO ---
  if (phase === 'VOTING') {
      const myVote = gameData.votes?.[socket.id];
      return (
          <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center justify-center text-center">
              <h1 className="text-3xl font-black text-yellow-400 mb-2">HORA DA VOTAÇÃO</h1>
              <p className="text-slate-400 mb-8">Quem vocês acham que é o espião? A maioria decide.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
                  {players.map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => votar(p.id)}
                        disabled={myVote}
                        className={`p-4 rounded-xl border-2 transition flex items-center justify-between group ${
                            myVote === p.id 
                            ? 'bg-red-600 border-red-600 text-white' 
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-red-500'
                        }`}
                      >
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center font-bold">{p.nickname[0]}</div>
                             <span className="font-bold">{p.nickname}</span>
                          </div>
                          {myVote === p.id && <CheckCircle size={20} />}
                          {gameData.votes && Object.values(gameData.votes).filter(id => id === p.id).length > 0 && (
                              <span className="text-xs bg-slate-900 px-2 py-1 rounded-full text-slate-400">
                                  {Object.values(gameData.votes).filter(id => id === p.id).length} votos
                              </span>
                          )}
                      </button>
                  ))}
              </div>
              <p className="mt-6 text-slate-500 text-sm">Aguardando todos votarem...</p>
          </div>
      );
  }

  // --- TELA PRINCIPAL (PERGUNTAS & DISCUSSÃO) ---
  const isDiscussion = phase === 'DISCUSSION';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-2 md:p-4 flex flex-col items-center">
        
        {/* INFO BAR */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
            <div className="flex items-center gap-2">
                <Clock size={20} className="text-emerald-400" />
                <div className="text-xs text-slate-400 font-bold uppercase">{phase === 'DISCUSSION' ? 'DISCUSSÃO' : 'PERGUNTAS'}</div>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CATEGORIA</div>
                <div className="font-bold text-indigo-400 text-sm">{myCategory || gameData.category}</div>
            </div>
        </div>

        {/* IDENTIDADE */}
        <div className={`w-full max-w-2xl rounded-2xl p-4 shadow-xl mb-6 relative overflow-hidden ${myRole === 'ESPIÃO' ? 'bg-gradient-to-r from-red-900 to-slate-900' : 'bg-gradient-to-r from-indigo-900 to-slate-900'}`}>
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${myRole === 'ESPIÃO' ? 'bg-red-500' : 'bg-indigo-500'}`}>
                     {myRole === 'ESPIÃO' ? <VenetianMask size={24} className="text-white"/> : <MapPin size={24} className="text-white"/>}
                </div>
                <div>
                    <p className="text-xs font-bold uppercase opacity-70 mb-1">SUA IDENTIDADE</p>
                    <h2 className="text-2xl font-black text-white leading-none">
                        {/* CORREÇÃO: "..." para não quebrar layout se word for null */}
                        {myRole === 'ESPIÃO' ? "VOCÊ É O ESPIÃO" : (myWord || "...")}
                    </h2>
                </div>
            </div>
        </div>

        {/* CHAT / PERGUNTAS */}
        <div className="w-full max-w-2xl flex-1 flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden min-h-[400px]">
            <div className="bg-slate-800 p-4 border-b border-slate-700">
                {isDiscussion ? (
                    <div className="text-center">
                        <h3 className="text-yellow-400 font-bold text-lg uppercase flex items-center justify-center gap-2"><MessageCircle /> Discussão Livre</h3>
                        <p className="text-slate-400 text-xs mt-1">Debatam quem é o espião. O Host pode iniciar a votação.</p>
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1 uppercase">
                            <span>Pergunta {gameData.currentQuestionIndex + 1} de 3</span>
                        </div>
                        <h3 className="text-lg font-bold text-white leading-tight">
                            "{gameData.questions ? gameData.questions[gameData.currentQuestionIndex] : '...'}"
                        </h3>
                    </div>
                )}
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
                {gameData.answers && gameData.answers.map((ans, idx) => (
                    <div key={idx} className={`flex flex-col ${ans.playerId === socket.id ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${ans.playerId === socket.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                            <span className="block text-[10px] font-bold opacity-50 mb-0.5 uppercase">{ans.nickname}</span>
                            {ans.text}
                        </div>
                        {idx < gameData.answers.length - 1 && gameData.answers[idx+1].questionIndex !== ans.questionIndex && (
                             <div className="w-full h-px bg-slate-700 my-4 flex items-center justify-center"><span className="bg-slate-900 text-slate-500 text-[10px] px-2 rounded-full">Próxima Pergunta</span></div>
                        )}
                    </div>
                ))}
                <div ref={answersEndRef} />
            </div>

            {!isDiscussion && (
                <div className="p-3 bg-slate-800 border-t border-slate-700">
                    {gameData.currentTurnId === socket.id ? (
                        <form onSubmit={submitAnswer} className="flex gap-2">
                            <input autoFocus className="flex-1 bg-slate-900 text-white border border-indigo-500 rounded-xl px-4 py-3 outline-none" placeholder="Sua resposta..." value={answerInput} onChange={e => setAnswerInput(e.target.value)} maxLength={60} />
                            <button type="submit" className="bg-indigo-600 text-white rounded-xl px-4" disabled={!answerInput.trim()}><Send size={20} /></button>
                        </form>
                    ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-3 bg-slate-900/50 rounded-xl border border-slate-700 border-dashed">
                            <Clock size={16} className="animate-spin-slow" />
                            <span className="text-sm font-bold uppercase">Esperando {players.find(p => p.id === gameData.currentTurnId)?.nickname}...</span>
                        </div>
                    )}
                </div>
            )}
        </div>

        {isHost && isDiscussion && (
            <button 
                onClick={() => socket.emit('spy_start_voting', { roomId })}
                className="mt-6 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-8 rounded-full transition shadow-lg hover:scale-105 flex items-center gap-2 animate-bounce"
            >
                <Users size={20} /> INICIAR VOTAÇÃO
            </button>
        )}
    </div>
  );
}