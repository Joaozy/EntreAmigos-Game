import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Eye, MapPin, VenetianMask, Clock, Lock, MessageCircle, Send, Users, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

export default function GameSpy({ players, isHost, roomId, gameData, phase }) {
  const [myRole, setMyRole] = useState(null);
  const [myWord, setMyWord] = useState(null);
  const [myCategory, setMyCategory] = useState(null);
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
      if(confirm(`Tem certeza que a palavra secreta é "${word}"?`)) {
          socket.emit('spy_guess_location', { roomId, word });
      }
  };

  // --- TELA DE REVELAÇÃO FINAL ---
  if (phase === 'REVEAL') {
      const spy = players.find(p => p.id === gameData.spyId);
      const isSpyWin = gameData.winner === 'SPY';
      
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in">
              <div className={`mb-8 p-8 rounded-3xl border-4 shadow-2xl max-w-lg w-full ${isSpyWin ? 'bg-red-900/40 border-red-500' : 'bg-emerald-900/40 border-emerald-500'}`}>
                  <h1 className="text-4xl md:text-5xl font-black mb-2 uppercase tracking-tight">{isSpyWin ? "VITÓRIA DO ESPIÃO" : "VITÓRIA DOS CIVIS"}</h1>
                  <p className="text-xl font-bold opacity-90">{gameData.winReason}</p>
              </div>

              <div className="mb-10 bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-sm">
                  <p className="text-slate-500 text-xs uppercase font-bold tracking-widest mb-2">A Palavra Secreta Era</p>
                  <h2 className="text-4xl font-black text-white">{gameData.secretWord}</h2>
                  <p className="mt-1 text-indigo-400 font-bold text-sm uppercase">{gameData.category}</p>
              </div>
              
              <div className="bg-slate-800 p-4 rounded-full border border-slate-700 flex items-center gap-4 px-8 mb-8">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-red-400">
                    {spy?.nickname[0] || "?"}
                  </div>
                  <div className="text-left">
                      <p className="text-slate-500 text-[10px] uppercase font-bold">O Espião Era</p>
                      <p className="text-xl font-bold text-white">{spy?.nickname || "Desconhecido"}</p>
                  </div>
              </div>

              {isHost && (
                  <button onClick={() => socket.emit('restart_game', { roomId })} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-full transition shadow-lg hover:scale-105">
                      JOGAR NOVAMENTE 🔄
                  </button>
              )}
          </div>
      );
  }

  // --- TELA DE CHUTE DO ESPIÃO ---
  if (phase === 'SPY_GUESS') {
      const imSpy = myRole === 'ESPIÃO';
      return (
          <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center justify-center text-center">
              <div className="mb-8">
                  <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 animate-bounce" />
                  <h1 className="text-3xl font-black text-white mb-2">ESPIÃO ENCURRALADO!</h1>
                  <p className="text-slate-400 max-w-md mx-auto">
                      {imSpy 
                        ? "Eles descobriram você! Esta é sua última chance: Adivinhe a palavra secreta para roubar a vitória." 
                        : "O Espião foi descoberto! Se ele adivinhar a palavra secreta, ele ainda vence."}
                  </p>
              </div>
              
              {imSpy ? (
                  <div className="w-full max-w-4xl">
                      <p className="text-indigo-400 font-bold text-sm uppercase mb-4 tracking-widest">QUAL É A PALAVRA?</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {gameData.possibleWords.map(word => (
                              <button key={word} onClick={() => chutarPalavra(word)} className="bg-slate-800 hover:bg-indigo-600 text-white p-4 rounded-xl font-bold transition border border-slate-700 hover:border-indigo-400 text-sm">
                                  {word}
                              </button>
                          ))}
                      </div>
                  </div>
              ) : (
                  <div className="flex items-center gap-3 text-slate-300 bg-slate-800 p-6 rounded-2xl border border-slate-700">
                      <Clock className="animate-spin text-indigo-500" /> 
                      <span className="font-bold">O Espião está escolhendo...</span>
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
              <h1 className="text-3xl font-black text-yellow-400 mb-2 uppercase">Votação de Emergência</h1>
              <p className="text-slate-400 mb-8 max-w-sm">Quem é o impostor? A maioria decide. Se errarem, o Espião vence.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
                  {players.map(p => {
                      const votesReceived = Object.values(gameData.votes || {}).filter(id => id === p.id).length;
                      return (
                          <button 
                            key={p.id} 
                            onClick={() => votar(p.id)}
                            className={`p-4 rounded-xl border-2 transition flex items-center justify-between group relative overflow-hidden ${
                                myVote === p.id 
                                ? 'bg-red-600 border-red-500 text-white' 
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-red-500/50'
                            }`}
                          >
                              <div className="flex items-center gap-3 z-10">
                                 <div className="w-10 h-10 bg-black/20 rounded-full flex items-center justify-center font-bold text-lg">{p.nickname[0]}</div>
                                 <span className="font-bold">{p.nickname}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 z-10">
                                  {votesReceived > 0 && (
                                      <span className="text-xs bg-black/40 px-2 py-1 rounded-full text-white font-bold flex items-center gap-1">
                                          {votesReceived} <Users size={12}/>
                                      </span>
                                  )}
                                  {myVote === p.id && <CheckCircle size={20} />}
                              </div>
                          </button>
                      );
                  })}
              </div>
              <p className="mt-8 text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Votação em andamento...</p>
          </div>
      );
  }

  // --- TELA PRINCIPAL ---
  const isDiscussion = phase === 'DISCUSSION';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-2 md:p-4 flex flex-col items-center">
        
        {/* HEADER INFO */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
            <div className="flex items-center gap-2">
                {phase === 'DISCUSSION' ? <MessageCircle className="text-yellow-400" size={20}/> : <Clock className="text-emerald-400" size={20}/>}
                <div className="text-xs font-bold uppercase tracking-wide text-white">
                    {phase === 'DISCUSSION' ? 'DISCUSSÃO LIVRE' : 'RODADA DE PERGUNTAS'}
                </div>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase">CATEGORIA</div>
                <div className="font-bold text-indigo-400 text-sm truncate max-w-[150px]">{myCategory || gameData.category}</div>
            </div>
        </div>

        {/* CARTÃO DE IDENTIDADE (Expansível ou Fixo) */}
        <div className={`w-full max-w-2xl rounded-2xl p-5 shadow-xl mb-6 relative overflow-hidden transition-all ${myRole === 'ESPIÃO' ? 'bg-gradient-to-r from-red-900 to-slate-900 border border-red-500/30' : 'bg-gradient-to-r from-indigo-900 to-slate-900 border border-indigo-500/30'}`}>
            <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg ${myRole === 'ESPIÃO' ? 'bg-red-600' : 'bg-indigo-600'}`}>
                     {myRole === 'ESPIÃO' ? <VenetianMask size={28} className="text-white"/> : <MapPin size={28} className="text-white"/>}
                </div>
                <div>
                    <p className={`text-xs font-bold uppercase mb-1 tracking-widest ${myRole === 'ESPIÃO' ? 'text-red-300' : 'text-indigo-300'}`}>SUA IDENTIDADE SECRETA</p>
                    <h2 className="text-2xl md:text-3xl font-black text-white leading-none tracking-tight">
                        {myRole === 'ESPIÃO' ? "VOCÊ É O ESPIÃO" : (myWord || "Carregando...")}
                    </h2>
                    {myRole === 'ESPIÃO' && <p className="text-xs text-red-200 mt-1 opacity-80">Descubra a palavra sem ser notado.</p>}
                </div>
            </div>
        </div>

        {/* ÁREA DE JOGO (CHAT / PERGUNTAS) */}
        <div className="w-full max-w-2xl flex-1 flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden min-h-[350px]">
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                {isDiscussion ? (
                    <h3 className="text-yellow-400 font-bold text-sm uppercase flex items-center gap-2"><Users size={16}/> Debate Aberto</h3>
                ) : (
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">PERGUNTA ATUAL</div>
                        <h3 className="text-sm md:text-base font-bold text-white line-clamp-2">
                            "{gameData.questions ? gameData.questions[gameData.currentQuestionIndex] : '...'}"
                        </h3>
                    </div>
                )}
                {isDiscussion && <span className="text-[10px] bg-slate-700 px-2 py-1 rounded text-slate-300">Sem Ordem</span>}
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-slate-900/30">
                {gameData.answers && gameData.answers.map((ans, idx) => {
                    const isMe = ans.playerId === socket.id;
                    return (
                        <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                            <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">{ans.nickname}</span>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'}`}>
                                {ans.text}
                            </div>
                            {idx < gameData.answers.length - 1 && gameData.answers[idx+1].questionIndex !== ans.questionIndex && (
                                <div className="w-full flex items-center gap-2 my-4 opacity-50">
                                    <div className="h-px bg-slate-600 flex-1"></div>
                                    <span className="text-[9px] uppercase font-bold text-slate-500">Nova Rodada</span>
                                    <div className="h-px bg-slate-600 flex-1"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={answersEndRef} />
            </div>

            {/* BARRA DE INPUT (Apenas na fase de perguntas e na vez certa) */}
            {!isDiscussion && (
                <div className="p-3 bg-slate-800 border-t border-slate-700">
                    {gameData.currentTurnId === socket.id ? (
                        <form onSubmit={submitAnswer} className="flex gap-2">
                            <input autoFocus className="flex-1 bg-slate-900 text-white border border-indigo-500 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="Sua resposta..." value={answerInput} onChange={e => setAnswerInput(e.target.value)} maxLength={80} />
                            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 transition disabled:opacity-50" disabled={!answerInput.trim()}><Send size={20} /></button>
                        </form>
                    ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-3 bg-slate-900/50 rounded-xl border border-slate-700 border-dashed">
                            <Clock size={16} className="animate-spin-slow" />
                            <span className="text-xs font-bold uppercase">Vez de {players.find(p => p.id === gameData.currentTurnId)?.nickname}...</span>
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
                <AlertTriangle size={20} /> INICIAR VOTAÇÃO AGORA
            </button>
        )}
    </div>
  );
}