import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Palette, Check, Loader2, Trophy, Eye, Maximize2, X, Clock, AlertTriangle } from 'lucide-react';

export default function GameDixit({ players, isHost, roomId, gameData, phase }) {
  const [myHand, setMyHand] = useState([]);
  const [clueInput, setClueInput] = useState('');
  const [myPlayedCardId, setMyPlayedCardId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [zoomedCard, setZoomedCard] = useState(null);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
      const handleHand = (hand) => setMyHand(hand);
      const handleMyCard = (id) => setMyPlayedCardId(id);

      socket.on('dixit_hand', handleHand);
      socket.on('dixit_my_card', handleMyCard);
      
      // Sincroniza estado ao montar (caso de refresh)
      socket.emit('dixit_sync_state', { roomId });

      return () => {
          socket.off('dixit_hand', handleHand);
          socket.off('dixit_my_card', handleMyCard);
      };
  }, [roomId]);

  useEffect(() => {
      if (phase === 'VOTING' && gameData.votingDeadline) {
          const interval = setInterval(() => {
              const seconds = Math.ceil((gameData.votingDeadline - Date.now()) / 1000);
              setTimeLeft(Math.max(0, seconds));
          }, 1000);
          return () => clearInterval(interval);
      } else {
          setMyPlayedCardId(null);
      }
  }, [phase, gameData.votingDeadline]);

  const narratorId = gameData.narratorId; 
  const isNarrator = narratorId === socket.id;
  // Ajuste o caminho conforme onde você salvou as imagens no servidor/public
  const getCardUrl = (id) => `/dixit_cards/card_${id}.jpg`;

  const handleCardClick = (id) => {
      if (zoomedCard) return; // Não seleciona se estiver com zoom aberto
      setSelectedCard(prev => (prev === id ? null : id));
  };

  const confirmVote = () => {
      if(!selectedCard) return;
      socket.emit('dixit_vote', { roomId, cardId: selectedCard });
      setSelectedCard(null); 
  };

  const submitClue = () => {
      if(!selectedCard || !clueInput.trim()) return;
      socket.emit('dixit_set_clue', { roomId, cardId: selectedCard, clue: clueInput });
      setSelectedCard(null);
  };

  const playCard = () => {
      if(!selectedCard) return;
      socket.emit('dixit_play_card', { roomId, cardId: selectedCard });
      setSelectedCard(null); 
  };

  const nextRound = () => {
      socket.emit('dixit_next_round', { roomId });
      setClueInput('');
      setSelectedCard(null);
  };

  // --- MODAIS ---
  const ZoomModal = () => {
      if (!zoomedCard) return null;
      return (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={() => setZoomedCard(null)}>
              <button className="absolute top-4 right-4 text-white hover:text-red-500 transition bg-black/50 rounded-full p-2"><X size={32} /></button>
              <img src={getCardUrl(zoomedCard)} className="max-h-[85vh] max-w-[95vw] rounded-lg shadow-2xl border-2 border-slate-700 object-contain" alt="Zoom" />
          </div>
      );
  };

  const ScoreboardModal = () => {
      if (!showScoreboard) return null;
      return (
          <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowScoreboard(false)}>
              <div className="bg-slate-800 p-6 rounded-3xl border border-slate-600 shadow-2xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
                   <button className="absolute top-4 right-4 text-slate-400 hover:text-white" onClick={() => setShowScoreboard(false)}>
                      <X size={24} />
                   </button>
                   <div className="flex justify-between items-end mb-6 border-b border-slate-700 pb-4">
                       <h3 className="text-white text-xl font-black uppercase flex items-center gap-2">
                           <Trophy className="text-yellow-400" /> PLACAR
                       </h3>
                       <span className="text-pink-500 text-xs font-bold uppercase bg-pink-900/30 px-2 py-1 rounded">Meta: {gameData.targetScore || 30} Pts</span>
                   </div>
                   <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                       {players.sort((a,b) => (gameData.scores[b.id]||0) - (gameData.scores[a.id]||0)).map((p, index) => {
                           const score = gameData.scores[p.id] || 0;
                           const target = gameData.targetScore || 30;
                           const percentage = Math.min((score / target) * 100, 100);
                           return (
                               <div key={p.id} className="relative group">
                                   <div className="absolute left-0 top-0 h-full bg-indigo-900/40 rounded-xl transition-all duration-500" style={{width: `${percentage}%`}}></div>
                                   <div className={`relative flex justify-between items-center p-3 rounded-xl border ${p.id === socket.id ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-transparent'}`}>
                                       <div className="flex items-center gap-3">
                                           <span className={`font-mono font-bold w-6 text-center ${index === 0 ? 'text-yellow-400 text-lg' : 'text-slate-500'}`}>{index === 0 ? '👑' : `${index + 1}.`}</span>
                                           <span className="font-bold z-10 text-white truncate max-w-[150px]">{p.nickname}</span>
                                           {p.id === gameData.narratorId && <span className="text-[9px] bg-pink-600 px-1.5 py-0.5 rounded text-white font-bold z-10 tracking-wider">NARRADOR</span>}
                                       </div>
                                       <span className="text-yellow-400 font-black text-xl z-10">{score}</span>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
              </div>
          </div>
      );
  };

  const Card = ({ id, onClick, isSelected, disabled, label, showOwner, isNarratorMark, isMine, size = "normal" }) => {
      const [imgError, setImgError] = useState(false);
      const cardData = gameData.tableCards?.find(tc => tc.id === id);
      const ownerId = showOwner ? (cardData?.ownerId) : null;
      const owner = players.find(p => p.id === ownerId);
      const sizeClasses = size === "small" ? "w-20 md:w-28" : "w-32 md:w-48";

      return (
        <div className={`relative group ${sizeClasses} aspect-[2/3] flex-shrink-0 transition-transform duration-200 ${isSelected ? 'scale-105 z-10' : 'hover:scale-105 hover:z-10'}`}>
            <div 
                onClick={() => !disabled && !isMine && onClick && onClick(id)}
                className={`w-full h-full rounded-xl overflow-hidden shadow-lg cursor-pointer flex flex-col bg-slate-800 relative
                ${isSelected ? 'ring-4 ring-yellow-400' : ''}
                ${isMine ? 'ring-4 ring-indigo-500' : ''}
                ${disabled && !isSelected ? 'grayscale opacity-80 cursor-default' : ''}
                `}
            >
                {id && !imgError ? (
                    <img 
                        src={getCardUrl(id)} 
                        onError={() => setImgError(true)}
                        alt={`Carta ${id}`} 
                        className="w-full h-full object-cover" 
                        loading="lazy" 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-700 text-slate-500 font-bold text-xs p-2 text-center">
                        {imgError ? "Erro Imagem" : "?"}
                    </div>
                )}
                
                {isSelected && <div className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center z-20"><Check className="text-yellow-400 w-12 h-12 drop-shadow-md"/></div>}
                {label && <div className="absolute bottom-0 w-full bg-black/80 text-white text-xs font-bold py-1 text-center backdrop-blur-sm z-20">{label}</div>}
                {isMine && <div className="absolute bottom-0 w-full bg-indigo-600 text-white text-xs font-bold py-1 text-center shadow-lg z-20 uppercase tracking-wider">SUA CARTA</div>}
                {showOwner && (
                    <div className={`absolute top-0 w-full text-white text-xs font-bold py-1 text-center truncate px-1 shadow-sm z-20 ${isNarratorMark ? 'bg-pink-600' : 'bg-indigo-600'}`}>
                        {isNarratorMark && "★ "} {owner ? owner.nickname : "..."}
                    </div>
                )}
            </div>
            {id && !imgError && (
                <button 
                    onClick={(e) => { e.stopPropagation(); setZoomedCard(id); }}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
                >
                    <Maximize2 size={16} />
                </button>
            )}
        </div>
      );
  };

  return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
          <ZoomModal />
          <ScoreboardModal />
          
          {phase !== 'SCORING' && phase !== 'VICTORY' && (
              <button 
                onClick={() => setShowScoreboard(true)}
                className="fixed top-20 right-4 z-[40] bg-slate-800/90 hover:bg-slate-700 text-yellow-400 p-3 rounded-full backdrop-blur-md shadow-xl border border-slate-700 transition-all hover:scale-110 flex items-center justify-center"
              >
                <Trophy size={22}/>
              </button>
          )}

          {/* FASE 1: NARRADOR */}
          {phase === 'NARRATOR' && (
              <div className="flex flex-col items-center animate-in fade-in w-full max-w-lg mt-10">
                  <h1 className="text-3xl font-black text-pink-500 mb-8 flex items-center gap-2"><Palette /> IMAGINÁRIO</h1>
                  {isNarrator ? (
                      <div className="w-full bg-slate-800 p-6 rounded-2xl shadow-xl border border-pink-500/30">
                          <h2 className="text-xl font-bold mb-2 text-white text-center">VOCÊ É O NARRADOR!</h2>
                          <p className="text-slate-400 text-sm mb-4 text-center">Escolha uma carta e dê uma dica.</p>
                          <input className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white outline-none focus:border-pink-500 transition mb-4" placeholder="Escreva sua dica aqui..." value={clueInput} onChange={e => setClueInput(e.target.value)} maxLength={50} autoFocus />
                          <button onClick={submitClue} disabled={!selectedCard || !clueInput.trim()} className="bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl w-full transition">CONFIRMAR</button>
                      </div>
                  ) : (
                      <div className="text-center mt-10 p-8 bg-slate-800/50 rounded-2xl">
                          <Loader2 size={40} className="text-pink-500 animate-spin mx-auto mb-4"/>
                          <h2 className="text-2xl font-bold">Aguardando Narrador...</h2>
                          <p className="text-slate-400 mt-2"><b>{players.find(p => p.id === narratorId)?.nickname || "..."}</b> está pensando.</p>
                      </div>
                  )}
              </div>
          )}

          {/* FASE 2: JOGADAS */}
          {phase === 'PLAYS' && (
              <div className="flex flex-col items-center animate-in fade-in w-full mt-10">
                  <div className="bg-pink-900/50 px-10 py-6 rounded-3xl border-2 border-pink-500/30 mb-8 text-center shadow-[0_0_30px_rgba(236,72,153,0.2)]">
                      <span className="text-pink-300 text-xs font-bold uppercase tracking-widest block mb-2">A DICA É</span>
                      <h2 className="text-3xl md:text-5xl font-black text-white italic">"{gameData.clue}"</h2>
                  </div>
                  {!isNarrator ? (
                      !gameData.tableCards?.some(c => c.ownerId === socket.id) ? (
                          <div className="text-center">
                              <p className="text-slate-300 mb-6 font-bold text-lg animate-pulse">Escolha uma carta da sua mão que combine com a dica.</p>
                              <button onClick={playCard} disabled={!selectedCard} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 px-12 rounded-full shadow-xl transition-all hover:scale-105 active:scale-95">CONFIRMAR CARTA</button>
                          </div>
                      ) : <div className="text-center p-6 bg-emerald-900/20 rounded-2xl border border-emerald-500/50"><Check className="w-12 h-12 text-emerald-500 mx-auto mb-2"/><h3 className="text-xl font-bold text-emerald-400">Carta Enviada!</h3><p className="text-slate-400 text-sm">Aguardando os outros jogadores...</p></div>
                  ) : (
                      <div className="text-center">
                          <p className="text-slate-400 font-bold mb-4">Esperando cartas falsas...</p>
                          <div className="flex justify-center gap-3">
                              {gameData.tableCards?.map((c, i) => (
                                  <div key={i} className="w-10 h-14 bg-indigo-600 rounded border border-indigo-400 shadow-lg animate-bounce" style={{animationDelay: `${i*0.1}s`}}></div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* FASE 3: VOTAÇÃO */}
          {phase === 'VOTING' && (
              <div className="flex flex-col items-center w-full animate-in fade-in pb-32 mt-6">
                  <div className="mb-6 text-center w-full">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold text-xl mb-4 ${timeLeft <= 10 ? 'bg-red-900/50 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-300'}`}>
                          <Clock size={20} /> 00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2">"{gameData.clue}"</h2>
                      {!isNarrator && !gameData.votes?.[socket.id] && (
                          <p className="text-emerald-400 font-bold animate-bounce">Qual é a carta do Narrador?</p>
                      )}
                      {isNarrator && <p className="text-slate-400 font-bold">Acompanhe a votação...</p>}
                  </div>

                  <div className="flex flex-wrap justify-center gap-4 mb-8 w-full max-w-6xl">
                      {gameData.tableCards?.map(card => {
                          const isVotedByMe = gameData.votes?.[socket.id] === card.id;
                          const isMine = card.id === myPlayedCardId;
                          const isSelected = isVotedByMe || (selectedCard === card.id);
                          
                          return <Card 
                            key={card.id} 
                            id={card.id} 
                            disabled={isNarrator || !!gameData.votes?.[socket.id] || isMine} 
                            onClick={handleCardClick} 
                            isSelected={isSelected} 
                            isMine={isMine} 
                            label={isVotedByMe ? "SEU VOTO" : (selectedCard === card.id ? "SELECIONADA" : null)} 
                          />;
                      })}
                  </div>

                  {!isNarrator && !gameData.votes?.[socket.id] && (
                      <div className="fixed bottom-32 left-0 w-full flex justify-center z-40 px-4 pointer-events-none">
                          <button 
                            onClick={confirmVote} 
                            disabled={!selectedCard} 
                            className="pointer-events-auto bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:translate-y-10 disabled:opacity-0 text-white font-black py-4 px-12 rounded-2xl shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
                          >
                             <Check strokeWidth={4} /> CONFIRMAR VOTO
                          </button>
                      </div>
                  )}
              </div>
          )}

          {/* FASE 4: RESULTADO */}
          {(phase === 'SCORING' || phase === 'VICTORY') && (
              <div className="flex flex-col items-center w-full animate-in fade-in mt-6">
                   <h1 className="text-4xl font-black text-yellow-400 mb-6 flex items-center gap-2">
                       <Trophy /> {phase === 'VICTORY' ? "VENCEDOR!" : "RESULTADO"}
                   </h1>
                   <div className="flex flex-wrap justify-center gap-6 mb-8 w-full max-w-6xl">
                      {gameData.tableCards?.map(card => {
                          const isNarratorCard = card.ownerId === narratorId;
                          return <Card key={card.id} id={card.id} showOwner={true} isNarratorMark={isNarratorCard} disabled={true} />;
                      })}
                   </div>
                   {/* Placar Inline */}
                   <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl mb-32">
                       <h3 className="text-white font-bold text-center mb-4 uppercase tracking-widest">Pontuação da Rodada</h3>
                       <div className="space-y-3">
                           {players.sort((a,b) => (gameData.scores[b.id]||0) - (gameData.scores[a.id]||0)).slice(0, 5).map((p, i) => (
                               <div key={p.id} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg">
                                   <span className="font-bold text-slate-300">{i+1}. {p.nickname}</span>
                                   <span className="font-black text-yellow-400">+{gameData.roundScores?.[p.id] || 0} pts</span>
                               </div>
                           ))}
                       </div>
                       {isHost && phase !== 'VICTORY' && (
                            <button onClick={nextRound} className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 animate-bounce">
                                PRÓXIMA RODADA <Eye size={16}/>
                            </button>
                       )}
                   </div>
              </div>
          )}

          {/* MÃO DO JOGADOR (Fixo embaixo) */}
          {phase !== 'VOTING' && phase !== 'SCORING' && phase !== 'VICTORY' && (
            <div className="fixed bottom-0 left-0 w-full bg-slate-950/90 border-t border-slate-800 p-2 z-50 backdrop-blur-md pb-6">
                <div className="max-w-6xl mx-auto flex flex-col gap-1">
                    <p className="text-slate-500 text-[10px] font-bold uppercase text-center tracking-widest mb-1">SUAS CARTAS</p>
                    <div className="flex justify-center gap-3 overflow-x-auto pb-2 px-4 no-scrollbar min-h-[120px] items-center">
                        {myHand.length > 0 ? myHand.map(id => (
                            <Card 
                                key={id} id={id} 
                                onClick={phase === 'NARRATOR' || (phase === 'PLAYS' && !isNarrator) ? handleCardClick : null} 
                                isSelected={selectedCard === id} 
                                disabled={phase === 'VOTING' || phase === 'SCORING' || (phase === 'PLAYS' && isNarrator) || phase === 'VICTORY'} 
                                size="small"
                            />
                        )) : <div className="text-slate-500 text-xs font-bold animate-pulse">Distribuindo cartas...</div>}
                    </div>
                </div>
            </div>
          )}
      </div>
  );
}