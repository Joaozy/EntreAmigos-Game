import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { User, HelpCircle, ThumbsUp, ThumbsDown, Minus, Send, CheckCircle, Lightbulb } from 'lucide-react';

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
      if(confirm(`Chutar que você é "${guessInput}"?`)) {
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

  const getVoteColor = (vote) => {
      if(vote === 'YES') return 'bg-emerald-500';
      if(vote === 'NO') return 'bg-red-500';
      return 'bg-yellow-500';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
        {/* CABEÇALHO */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-2xl shadow-lg border border-slate-700">
            <div>
                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">QUEM SOU EU?</h1>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                   <span>Pergunta Global #{gameData.totalQuestions || 0}</span>
                   {/* Barra de Progresso da Dica */}
                   <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                       <div className="h-full bg-yellow-400 transition-all duration-500" style={{width: `${((gameData.totalQuestions % 10) / 10) * 100}%`}}></div>
                   </div>
                </div>
            </div>
            {amIGuessed && <div className="bg-emerald-600 px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2"><CheckCircle size={16}/> VOCÊ ACERTOU!</div>}
        </div>

        {/* ÁREA PRINCIPAL: CARDS DOS JOGADORES */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-4xl mb-8">
            {gameData.playersData?.map(p => {
                const isMe = p.id === socket.id;
                const isCurrent = p.id === gameData.currentTurnId;
                
                return (
                    <div key={p.id} className={`relative p-4 rounded-xl flex flex-col items-center text-center transition-all ${isCurrent ? 'bg-slate-700 ring-2 ring-blue-500 scale-105 shadow-xl' : 'bg-slate-800/50'} ${p.isGuessed ? 'opacity-50 grayscale' : ''}`}>
                        {isCurrent && <div className="absolute -top-3 bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-bounce">VEZ DE PERGUNTAR</div>}
                        
                        <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center text-2xl font-bold mb-2 border-2 border-slate-500 relative">
                            {p.nickname[0]}
                            {p.hasHintAvailable && <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 rounded-full p-1 border-2 border-slate-800"><Lightbulb size={12}/></div>}
                        </div>
                        <div className="font-bold text-sm mb-1">{p.nickname}</div>
                        
                        <div className={`mt-2 px-3 py-1 rounded-lg font-black text-lg w-full ${isMe ? 'bg-slate-900 text-blue-400 border border-blue-500/30' : 'bg-white text-slate-900'}`}>
                            {isMe ? (p.isGuessed ? p.character : "???") : p.character}
                        </div>

                        {/* Botão de Pedir Dica (Seleção) */}
                        {requestingHint && !isMe && (
                             <button onClick={() => pedirDica(p.id)} className="absolute inset-0 bg-yellow-500/90 text-slate-900 font-bold rounded-xl flex items-center justify-center animate-in zoom-in">PEDIR DICA</button>
                        )}
                    </div>
                );
            })}
        </div>

        {/* ÁREA DE AÇÃO */}
        <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
            
            {/* MODO: ESCOLHER QUEM VAI DAR A DICA */}
            {requestingHint && (
                <div className="text-center py-4">
                    <h3 className="text-yellow-400 font-bold text-lg mb-2">ESCOLHA UM JOGADOR</h3>
                    <p className="text-slate-400 text-sm">Clique no card de quem você quer que te dê uma dica.</p>
                    <button onClick={() => setRequestingHint(false)} className="mt-4 text-sm text-slate-500 underline">Cancelar</button>
                </div>
            )}

            {/* MODO: ESCREVER A DICA (Para o jogador escolhido) */}
            {phase === 'HINT_MODE' && gameData.hintTargetId === socket.id && (
                <div className="text-center">
                    <h3 className="text-yellow-400 font-bold text-lg mb-2 flex items-center justify-center gap-2"><Lightbulb /> HORA DA DICA</h3>
                    <p className="text-slate-300 mb-4">Escreva uma dica sobre o personagem de <b>{gameData.playersData.find(p => p.id === gameData.currentTurnId)?.nickname}</b>:</p>
                    <form onSubmit={enviarDica} className="flex gap-2">
                        <input className="flex-1 bg-slate-900 border border-yellow-500 rounded-xl px-4 py-3 outline-none" placeholder="Ex: Ele usa capa..." value={hintInput} onChange={e => setHintInput(e.target.value)} maxLength={60} autoFocus/>
                        <button className="bg-yellow-600 text-slate-900 font-bold px-6 rounded-xl"><Send size={20}/></button>
                    </form>
                </div>
            )}

            {/* MODO: ESPERANDO DICA (Para os outros) */}
            {phase === 'HINT_MODE' && gameData.hintTargetId !== socket.id && (
                <div className="text-center py-6">
                    <Lightbulb size={40} className="text-yellow-400 mx-auto mb-2 animate-pulse"/>
                    <p className="text-slate-400"><b>{gameData.playersData.find(p => p.id === gameData.hintTargetId)?.nickname}</b> está escrevendo uma dica...</p>
                </div>
            )}

            {/* TÍTULO DA PERGUNTA ATUAL */}
            {phase !== 'HINT_MODE' && gameData.currentQuestion && (
                <div className="text-center mb-6">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-2">PERGUNTA ATUAL</p>
                    <h2 className="text-2xl md:text-3xl font-black text-white">"{gameData.currentQuestion}"</h2>
                </div>
            )}

            {/* MODO: FAZER PERGUNTA (Minha Vez) */}
            {!requestingHint && phase === 'PLAYING' && isMyTurn && !amIGuessed && (
                <div className="space-y-4">
                    <p className="text-center text-blue-300 font-bold animate-pulse">Sua vez! Faça uma pergunta de SIM ou NÃO.</p>
                    <form onSubmit={sendQuestion} className="flex gap-2">
                        <input className="flex-1 bg-slate-900 border border-blue-500 rounded-xl px-4 py-3 outline-none" placeholder="Ex: Eu sou humano?" value={questionInput} onChange={e => setQuestionInput(e.target.value)} maxLength={50} autoFocus/>
                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-bold"><Send size={20}/></button>
                    </form>
                    
                    <div className="flex justify-between items-center pt-2">
                        <button onClick={() => setShowGuessInput(!showGuessInput)} className="text-xs text-slate-400 underline hover:text-white">Chutar personagem</button>
                        
                        {hasHint && (
                            <button onClick={() => setRequestingHint(true)} className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-yellow-500/40 transition">
                                <Lightbulb size={12}/> USAR DICA
                            </button>
                        )}
                    </div>
                    
                    {showGuessInput && (
                        <form onSubmit={sendGuess} className="flex gap-2 animate-in slide-in-from-top-2">
                            <input className="flex-1 bg-emerald-900/50 border border-emerald-500 rounded-xl px-4 py-2 outline-none text-emerald-200 placeholder:text-emerald-700" placeholder="Quem é você?" value={guessInput} onChange={e => setGuessInput(e.target.value)} />
                            <button className="bg-emerald-600 text-white px-4 rounded-xl font-bold">CHUTAR</button>
                        </form>
                    )}
                </div>
            )}

            {/* MODO: VOTAR (Vez do Outro) */}
            {phase === 'VOTING' && !isMyTurn && !gameData.votes?.[socket.id] && (
                <div>
                    <p className="text-center text-slate-400 mb-4">Responda a pergunta acima sobre <b>{gameData.playersData.find(p => p.id === gameData.currentTurnId)?.nickname}</b>:</p>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => sendVote('YES')} className="bg-emerald-600 hover:bg-emerald-500 p-4 rounded-xl flex-1 flex flex-col items-center gap-2 transition hover:scale-105"><ThumbsUp size={32}/> SIM</button>
                        <button onClick={() => sendVote('NO')} className="bg-red-600 hover:bg-red-500 p-4 rounded-xl flex-1 flex flex-col items-center gap-2 transition hover:scale-105"><ThumbsDown size={32}/> NÃO</button>
                        <button onClick={() => sendVote('MAYBE')} className="bg-yellow-600 hover:bg-yellow-500 p-4 rounded-xl flex-1 flex flex-col items-center gap-2 transition hover:scale-105"><Minus size={32}/> TALVEZ</button>
                    </div>
                </div>
            )}

            {/* MODO: AGUARDANDO VOTOS */}
            {phase === 'VOTING' && (isMyTurn || gameData.votes?.[socket.id]) && (
                <div className="text-center py-4">
                    <div className="flex justify-center gap-2 mb-2">
                        {Object.values(gameData.votes || {}).map((v, i) => (
                            <div key={i} className={`w-3 h-3 rounded-full animate-bounce ${getVoteColor(v)}`} style={{animationDelay: `${i*100}ms`}}></div>
                        ))}
                    </div>
                    <p className="text-slate-500 text-sm">Esperando votos...</p>
                </div>
            )}

            {/* MODO: RESULTADO DA VOTAÇÃO */}
            {phase === 'RESULT' && (
                <div className="text-center animate-in zoom-in">
                    <p className="text-slate-400 text-xs uppercase mb-4">O GRUPO RESPONDEU:</p>
                    <div className="flex justify-center gap-8">
                        <div className="text-emerald-400 flex flex-col items-center"><ThumbsUp size={40} className="mb-2"/> <span className="text-2xl font-black">{Object.values(gameData.votes).filter(v=>v==='YES').length}</span></div>
                        <div className="text-red-400 flex flex-col items-center"><ThumbsDown size={40} className="mb-2"/> <span className="text-2xl font-black">{Object.values(gameData.votes).filter(v=>v==='NO').length}</span></div>
                        <div className="text-yellow-400 flex flex-col items-center"><Minus size={40} className="mb-2"/> <span className="text-2xl font-black">{Object.values(gameData.votes).filter(v=>v==='MAYBE').length}</span></div>
                    </div>
                </div>
            )}

            {/* MODO: ESPERA PADRÃO */}
            {!isMyTurn && phase === 'PLAYING' && (
                <div className="text-center text-slate-500 py-4 flex flex-col items-center gap-2">
                     <User size={32} className="opacity-50"/>
                     <p>Esperando <b>{gameData.playersData.find(p => p.id === gameData.currentTurnId)?.nickname}</b> perguntar...</p>
                </div>
            )}
        </div>
    </div>
  );
}