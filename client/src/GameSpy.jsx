import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { Eye, MapPin, VenetianMask, Clock, Lock, MessageCircle, Send, HelpCircle } from 'lucide-react';

export default function GameSpy({ players, isHost, roomId, gameData, phase }) {
  const [myRole, setMyRole] = useState(null);
  const [myWord, setMyWord] = useState(null);
  const [myCategory, setMyCategory] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerInput, setAnswerInput] = useState('');
  
  const answersEndRef = useRef(null);

  // Escuta o segredo individual
  useEffect(() => {
    socket.on('spy_secret', (data) => {
        setMyRole(data.role);
        setMyWord(data.word);
        setMyCategory(data.category);
    });
    return () => socket.off('spy_secret');
  }, []);

  // Timer
  useEffect(() => {
      const timer = setInterval(() => {
          if (gameData?.endTime && phase === 'GAME') {
              const diff = Math.floor((gameData.endTime - Date.now()) / 1000);
              setTimeLeft(diff > 0 ? diff : 0);
          }
      }, 1000);
      return () => clearInterval(timer);
  }, [gameData, phase]);

  // Scroll automático para novas respostas
  useEffect(() => {
      answersEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameData.answers, gameData.currentQuestionIndex]);

  const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const submitAnswer = (e) => {
      e.preventDefault();
      if (!answerInput.trim()) return;
      socket.emit('spy_submit_answer', { roomId, answer: answerInput });
      setAnswerInput('');
  };

  // --- TELA DE REVELAÇÃO (FIM DE JOGO) ---
  if (phase === 'REVEAL') {
      const spy = players.find(p => p.id === gameData.spyId);
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in">
              <div className="mb-8">
                  <h1 className="text-4xl font-black text-red-500 mb-2">FIM DE JOGO</h1>
                  <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">A palavra secreta era</p>
                  <h2 className="text-5xl font-black text-indigo-400 mt-4 bg-indigo-900/30 p-6 rounded-2xl border-2 border-indigo-500/50 shadow-xl shadow-indigo-500/20">{gameData.secretWord}</h2>
                  <p className="mt-2 text-indigo-300 font-bold uppercase text-xs tracking-widest">{gameData.category}</p>
              </div>
              
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-md shadow-lg">
                  <p className="text-slate-400 text-sm uppercase font-bold mb-4">O Espião era</p>
                  <div className="flex items-center justify-center gap-4">
                      <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg">
                        {spy?.nickname[0]}
                      </div>
                      <span className="text-2xl font-bold">{spy?.nickname}</span>
                  </div>
              </div>

              {isHost && (
                  <button 
                    onClick={() => socket.emit('restart_game', { roomId })}
                    className="mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-10 rounded-full transition shadow-lg hover:scale-105"
                  >
                      Jogar Novamente
                  </button>
              )}
          </div>
      );
  }

  // --- TELA DE JOGO ---
  const isMyTurn = gameData.currentTurnId === socket.id;
  const currentQuestionText = gameData.questions ? gameData.questions[gameData.currentQuestionIndex] : "Carregando...";
  const isDiscussion = gameData.phase === 'DISCUSSION';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-2 md:p-4 flex flex-col items-center">
        
        {/* CABEÇALHO: TIMER E CATEGORIA */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
            <div className="flex items-center gap-2">
                <Clock size={20} className={timeLeft < 60 ? "text-red-500 animate-pulse" : "text-emerald-400"} />
                <span className={`text-xl font-mono font-bold ${timeLeft < 60 ? "text-red-500" : "text-white"}`}>
                    {formatTime(timeLeft)}
                </span>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CATEGORIA</div>
                <div className="font-bold text-indigo-400 text-sm md:text-base">{myCategory || gameData.category}</div>
            </div>
        </div>

        {/* CARTÃO DE IDENTIDADE COMPACTO */}
        <div className={`w-full max-w-2xl rounded-2xl p-4 shadow-xl mb-6 relative overflow-hidden transition-all duration-500 ${myRole === 'ESPIÃO' ? 'bg-gradient-to-br from-red-900 to-slate-900 border border-red-500/30' : 'bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/30'}`}>
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${myRole === 'ESPIÃO' ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white'}`}>
                     {myRole === 'ESPIÃO' ? <VenetianMask size={24} /> : <MapPin size={24} />}
                </div>
                <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${myRole === 'ESPIÃO' ? 'text-red-300' : 'text-indigo-300'}`}>SUA IDENTIDADE</p>
                    <h2 className="text-2xl font-black text-white leading-none">
                        {myRole === 'ESPIÃO' ? "VOCÊ É O ESPIÃO" : (myWord || "...")}
                    </h2>
                    {myRole === 'ESPIÃO' && <p className="text-xs text-red-200 mt-1">Engane os outros. Descubra a palavra.</p>}
                </div>
            </div>
        </div>

        {/* ÁREA DE PERGUNTAS E RESPOSTAS */}
        <div className="w-full max-w-2xl flex-1 flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden shadow-inner min-h-[400px]">
            
            {/* Título da Pergunta Atual */}
            <div className="bg-slate-800 p-4 border-b border-slate-700">
                {isDiscussion ? (
                    <div className="text-center animate-pulse">
                        <h3 className="text-yellow-400 font-bold text-lg uppercase flex items-center justify-center gap-2"><MessageCircle /> Discussão Livre</h3>
                        <p className="text-slate-400 text-xs">As perguntas acabaram. Debatam e votem!</p>
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1 uppercase">
                            <span>Pergunta {gameData.currentQuestionIndex + 1} de 3</span>
                            <span>Turno de respostas</span>
                        </div>
                        <h3 className="text-xl font-bold text-white leading-tight">
                            "{currentQuestionText}"
                        </h3>
                    </div>
                )}
            </div>

            {/* Lista de Respostas (Feed) */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
                {gameData.answers && gameData.answers.map((ans, idx) => (
                    <div key={idx} className={`flex flex-col ${ans.playerId === socket.id ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                            ans.playerId === socket.id 
                            ? 'bg-indigo-600 text-white rounded-br-none' 
                            : 'bg-slate-700 text-slate-200 rounded-bl-none'
                        }`}>
                            <span className="block text-[10px] font-bold opacity-50 mb-0.5 uppercase">{ans.nickname}</span>
                            {ans.text}
                        </div>
                        {/* Divisor visual se mudar a pergunta */}
                        {idx < gameData.answers.length - 1 && gameData.answers[idx+1].questionIndex !== ans.questionIndex && (
                             <div className="w-full h-px bg-slate-700 my-4 flex items-center justify-center">
                                 <span className="bg-slate-900 text-slate-500 text-[10px] px-2 rounded-full">Próxima Pergunta</span>
                             </div>
                        )}
                    </div>
                ))}
                <div ref={answersEndRef} />
            </div>

            {/* Input de Resposta (Apenas se for a vez e não for discussão) */}
            {!isDiscussion && (
                <div className="p-3 bg-slate-800 border-t border-slate-700">
                    {isMyTurn ? (
                        <form onSubmit={submitAnswer} className="flex gap-2 animate-in slide-in-from-bottom-2">
                            <input 
                                autoFocus
                                className="flex-1 bg-slate-900 text-white border border-indigo-500 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition placeholder:text-slate-600"
                                placeholder="Sua resposta..."
                                value={answerInput}
                                onChange={e => setAnswerInput(e.target.value)}
                                maxLength={60}
                            />
                            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 flex items-center justify-center transition disabled:opacity-50" disabled={!answerInput.trim()}>
                                <Send size={20} />
                            </button>
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

        {/* BOTÃO DE REVELAR (HOST) */}
        {isHost && (
            <button 
                onClick={() => {
                    if (confirm("Tem certeza que quer revelar o espião e encerrar o jogo?")) {
                        socket.emit('spy_reveal', { roomId });
                    }
                }}
                className="mt-6 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-900/50 font-bold py-3 px-6 rounded-full transition flex items-center justify-center gap-2 text-xs uppercase tracking-widest hover:scale-105"
            >
                <Lock size={14} /> Encerrar Jogo & Revelar
            </button>
        )}
    </div>
  );
}