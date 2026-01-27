import React, { useState } from 'react';
import { socket } from './socket';
import { User, CheckCircle, Lightbulb, HelpCircle, Send } from 'lucide-react';

export default function GameWhoAmI({ players, isHost, roomId, gameData, phase }) {
  const [questionInput, setQuestionInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [hintInput, setHintInput] = useState('');
  const [showGuessInput, setShowGuessInput] = useState(false);
  const [requestingHint, setRequestingHint] = useState(false);

  const isMyTurn = gameData.currentTurnId === socket.id;
  const myPlayer = gameData.playersData?.find(p => p.id === socket.id);
  const amIGuessed = myPlayer?.isGuessed;
  const hasHint = myPlayer?.hasHintAvailable;

  const sendQuestion = (e) => {
      e.preventDefault();
      if(!questionInput.trim()) return;
      socket.emit('whoami_ask', { roomId, question: questionInput });
      setQuestionInput('');
  };

  const sendVote = (vote) => { socket.emit('whoami_vote', { roomId, vote }); };

  const sendGuess = (e) => {
      e.preventDefault();
      if(!guessInput.trim()) return;
      if(confirm(`Tem certeza que você é "${guessInput}"?`)) {
          socket.emit('whoami_guess', { roomId, guess: guessInput });
          setShowGuessInput(false); setGuessInput('');
      }
  };

  const pedirDica = (targetId) => {
      socket.emit('whoami_request_hint', { roomId, targetId });
      setRequestingHint(false);
  };

  const enviarDica = (e) => {
      e.preventDefault();
      socket.emit('whoami_send_hint', { roomId, hint: hintInput });
      setHintInput('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
        {/* CABEÇALHO */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-2xl shadow-lg border border-slate-700">
            <div>
                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex items-center gap-2">
                    <HelpCircle className="text-blue-400" /> QUEM SOU EU?
                </h1>
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                   <span>Rodada Global #{gameData.totalQuestions || 0}</span>
                </div>
            </div>
            {amIGuessed ? (
                <div className="bg-emerald-600 px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg animate-in zoom-in">
                    <CheckCircle size={16}/> VOCÊ ACERTOU!
                </div>
            ) : (
                <div className="bg-slate-700 px-3 py-1 rounded-lg text-xs font-mono text-slate-300">
                    Ainda jogando
                </div>
            )}
        </div>

        {/* ÁREA PRINCIPAL: CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl mb-8">
            {gameData.playersData?.map(p => {
                const isMe = p.id === socket.id;
                const isCurrent = p.id === gameData.currentTurnId;
                
                return (
                    <div key={p.id} className={`relative p-4 rounded-xl flex flex-col items-center text-center transition-all duration-300
                        ${isCurrent ? 'bg-slate-700 ring-4 ring-blue-500/50 scale-105 shadow-2xl z-10' : 'bg-slate-800/50 border border-slate-700'} 
                        ${p.isGuessed ? 'opacity-60 grayscale-[0.5]' : ''}
                    `}>
                        {isCurrent && <div className="absolute -top-3 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">VEZ DE PERGUNTAR</div>}
                        
                        <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center text-2xl font-bold mb-3 border-4 border-slate-700 relative shadow-inner">
                            {p.nickname[0]}
                            {p.hasHintAvailable && !p.isGuessed && (
                                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 rounded-full p-1.5 border-2 border-slate-800 shadow-sm" title="Tem dica">
                                    <Lightbulb size={12} fill="currentColor"/>
                                </div>
                            )}
                        </div>
                        
                        <div className="font-bold text-sm mb-2 text-slate-200">{p.nickname}</div>
                        
                        <div className={`px-4 py-2 rounded-lg font-black text-lg w-full shadow-inner leading-tight ${isMe ? 'bg-slate-900 text-blue-400 border border-blue-500/30' : 'bg-white text-slate-900'}`}>
                            {isMe ? (p.isGuessed ? p.character : <span className="text-3xl">???</span>) : p.character}
                        </div>

                        {/* Botão Pedir Dica */}
                        {requestingHint && !isMe && !p.isGuessed && (
                             <button onClick={() => pedirDica(p.id)} className="absolute inset-0 bg-yellow-500/90 text-slate-900 font-bold rounded-xl flex flex-col items-center justify-center animate-in fade-in cursor-pointer hover:bg-yellow-400 transition">
                                 <Lightbulb size={32} className="mb-1"/>
                                 PEDIR DICA
                             </button>
                        )}
                        
                        {p.isGuessed && <div className="absolute top-2 right-2 text-green-500"><CheckCircle size={20} fill="currentColor" className="text-green-900"/></div>}
                    </div>
                );
            })}
        </div>

        {/* ÁREA DE AÇÃO INFERIOR */}
        <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl relative mb-10 overflow-hidden">
            
            {/* SELEÇÃO DE DICA */}
            {requestingHint && (
                <div className="text-center py-6 animate-in slide-in-from-bottom">
                    <h3 className="text-yellow-400 font-bold text-xl mb-2">QUEM VAI TE AJUDAR?</h3>
                    <p className="text-slate-400 text-sm mb-4">Clique no card de um jogador acima para pedir uma dica.</p>
                    <button onClick={() => setRequestingHint(false)} className="px-6 py-2 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold transition">CANCELAR</button>
                </div>
            )}

            {/* DAR DICA */}
            {phase === 'HINT_MODE' && gameData.hintTargetId === socket.id && (
                <div className="text-center animate-in slide-in-from-bottom">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-500/20 text-yellow-400 rounded-full mb-3"><Lightbulb size={24}/></div>
                    <h3 className="text-white font-bold text-lg mb-2">HORA DA DICA</h3>
                    <p className="text-slate-300 mb-4 text-sm">Ajude <b>{gameData.playersData.find(p => p.id === gameData.currentTurnId)?.nickname}</b> a descobrir quem é.</p>
                    <form onSubmit={enviarDica} className="flex gap-2">
                        <input className="flex-1 bg-slate-900 border border-yellow-500/50 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-400 transition" placeholder="Escreva uma dica curta..." value={hintInput} onChange={e => setHintInput(e.target.value)} maxLength={60} autoFocus/>
                        <button className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold px-6 rounded-xl transition shadow-lg"><Send size={20}/></button>
                    </form>
                </div>
            )}

            {/* ESPERANDO DICA */}
            {phase === 'HINT_MODE' && gameData.hintTargetId !== socket.id && (
                <div className="text-center py-8 flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-300 font-bold">
                        {gameData.playersData.find(p => p.id === gameData.hintTargetId)?.nickname} está escrevendo uma dica...
                    </p>
                </div>
            )}

            {/* PERGUNTA E VOTAÇÃO */}
            {phase !== 'HINT_MODE' && !requestingHint && (
                <div>
                    {gameData.currentQuestion && (
                        <div className="bg-slate-900/50 p-4 rounded-xl border-l-4 border-blue-500 mb-6">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">PERGUNTA ATUAL</p>
                            <h2 className="text-xl md:text-2xl font-black text-white italic">"{gameData.currentQuestion}"</h2>
                        </div>
                    )}

                    {/* MINHA VEZ */}
                    {phase === 'PLAYING' && isMyTurn && !amIGuessed && (
                        <div className="space-y-4 animate-in fade-in">
                            <p className="text-center text-blue-300 font-bold text-sm">Sua vez! Faça uma pergunta de SIM ou NÃO.</p>
                            <form onSubmit={sendQuestion} className="flex gap-2">
                                <input className="flex-1 bg-slate-900 border border-blue-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition" placeholder="Ex: Eu sou um animal?" value={questionInput} onChange={e => setQuestionInput(e.target.value)} maxLength={60} autoFocus/>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-bold shadow-lg transition"><Send size={20}/></button>
                            </form>
                            
                            <div className="flex justify-between items-center pt-3 border-t border-slate-700/50">
                                <button onClick={() => setShowGuessInput(!showGuessInput)} className="text-xs text-slate-400 font-bold hover:text-white underline decoration-dotted underline-offset-4">
                                    {showGuessInput ? "Cancelar chute" : "Sei quem sou! (Chutar)"}
                                </button>
                                
                                {hasHint && (
                                    <button onClick={() => setRequestingHint(true)} className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/50 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-yellow-500/20 transition">
                                        <Lightbulb size={14}/> USAR DICA
                                    </button>
                                )}
                            </div>
                            
                            {showGuessInput && (
                                <form onSubmit={sendGuess} className="flex gap-2 animate-in slide-in-from-top-2 pt-2">
                                    <input className="flex-1 bg-emerald-900/30 border border-emerald-500/50 rounded-xl px-4 py-2 outline-none text-emerald-200 placeholder:text-emerald-700/50 focus:border-emerald-400 transition" placeholder="Quem é você?" value={guessInput} onChange={e => setGuessInput(e.target.value)} autoFocus />
                                    <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 rounded-xl font-bold shadow-lg transition">CHUTAR</button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* VOTAÇÃO */}
                    {phase === 'VOTING' && !isMyTurn && !gameData.votes?.[socket.id] && (
                        <div className="animate-in slide-in-from-bottom">
                            <p className="text-center text-slate-400 text-sm mb-4">Responda para <b>{gameData.playersData.find(p => p.id === gameData.currentTurnId)?.nickname}</b>:</p>
                            <div className="flex gap-3">
                                <button onClick={() => sendVote('YES')} className="bg-slate-700 hover:bg-emerald-600 hover:text-white text-emerald-400 font-black p-4 rounded-xl flex-1 transition-all hover:scale-105 border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">SIM</button>
                                <button onClick={() => sendVote('NO')} className="bg-slate-700 hover:bg-red-600 hover:text-white text-red-400 font-black p-4 rounded-xl flex-1 transition-all hover:scale-105 border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">NÃO</button>
                                <button onClick={() => sendVote('MAYBE')} className="bg-slate-700 hover:bg-yellow-600 hover:text-white text-yellow-400 font-black p-4 rounded-xl flex-1 transition-all hover:scale-105 border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">??</button>
                            </div>
                        </div>
                    )}

                    {/* AGUARDANDO VOTOS */}
                    {phase === 'VOTING' && (isMyTurn || gameData.votes?.[socket.id]) && (
                        <div className="text-center py-2">
                            <div className="flex justify-center gap-1.5 mb-2 h-4">
                                {Object.values(gameData.votes || {}).map((v, i) => (
                                    <div key={i} className={`w-3 h-3 rounded-full animate-bounce ${v === 'YES' ? 'bg-emerald-500' : v === 'NO' ? 'bg-red-500' : 'bg-yellow-500'}`} style={{animationDelay: `${i*100}ms`}}></div>
                                ))}
                            </div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Computando respostas...</p>
                        </div>
                    )}

                    {/* RESULTADO DA VOTAÇÃO */}
                    {phase === 'RESULT' && (
                        <div className="text-center animate-in zoom-in py-2">
                            <div className="flex justify-center gap-8">
                                <div className="text-emerald-400 flex flex-col items-center">
                                    <span className="text-3xl font-black">{Object.values(gameData.votes).filter(v=>v==='YES').length}</span>
                                    <span className="text-[10px] font-bold uppercase">Sim</span>
                                </div>
                                <div className="text-red-400 flex flex-col items-center">
                                    <span className="text-3xl font-black">{Object.values(gameData.votes).filter(v=>v==='NO').length}</span>
                                    <span className="text-[10px] font-bold uppercase">Não</span>
                                </div>
                                <div className="text-yellow-400 flex flex-col items-center">
                                    <span className="text-3xl font-black">{Object.values(gameData.votes).filter(v=>v==='MAYBE').length}</span>
                                    <span className="text-[10px] font-bold uppercase">Talvez</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}