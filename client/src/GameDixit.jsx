import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Palette, Check, Loader2, Trophy, Eye } from 'lucide-react';

export default function GameDixit({ players, isHost, roomId, gameData, phase }) {
  const [myHand, setMyHand] = useState([]);
  const [clueInput, setClueInput] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);

  useEffect(() => {
      const handleHand = (hand) => setMyHand(hand);
      socket.on('dixit_hand', handleHand);
      return () => socket.off('dixit_hand', handleHand);
  }, []);

  const narratorId = gameData.narratorId; 
  const isNarrator = narratorId === socket.id;
  const getCardUrl = (id) => `https://picsum.photos/seed/${id}/300/450`;

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

  const voteCard = (id) => {
      if(confirm("Confirmar voto nesta carta?")) socket.emit('dixit_vote', { roomId, cardId: id });
  };

  const nextRound = () => {
      socket.emit('dixit_next_round', { roomId });
      setClueInput('');
      setSelectedCard(null);
  };

  // --- COMPONENTE CARTA (Com proteção anti-crash) ---
  const Card = ({ id, onClick, isSelected, disabled, label, showOwner, isNarratorMark, size = "normal" }) => {
      // Tenta encontrar o dono de forma segura
      const cardData = gameData.tableCards?.find(tc => tc.id === id);
      const ownerId = showOwner ? (cardData?.ownerId) : null;
      const owner = players.find(p => p.id === ownerId);
      
      const sizeClasses = size === "small" ? "w-20 md:w-28" : "w-32 md:w-48";

      return (
        <div 
            onClick={() => !disabled && onClick && onClick(id)}
            className={`relative group rounded-xl overflow-hidden transition-all duration-300 shadow-lg cursor-pointer flex-shrink-0
            ${isSelected ? 'ring-4 ring-yellow-400 scale-105 z-10' : 'hover:scale-105'}
            ${disabled ? 'opacity-90 cursor-default' : ''}
            bg-slate-800 ${sizeClasses} aspect-[2/3]
            `}
        >
            {id ? (
                <img src={getCardUrl(id)} alt={`Carta ${id}`} className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <div className="w-full h-full bg-indigo-900/50 flex items-center justify-center text-indigo-300 font-bold">?</div>
            )}
            
            {isSelected && <div className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center"><Check className="text-yellow-400 w-12 h-12 drop-shadow-lg"/></div>}
            {label && <div className="absolute bottom-0 w-full bg-black/70 text-white text-xs font-bold py-1 text-center backdrop-blur-sm">{label}</div>}

            {showOwner && (
                <div className={`absolute top-0 w-full text-white text-xs font-bold py-1 text-center truncate px-1 shadow-sm ${isNarratorMark ? 'bg-pink-600' : 'bg-indigo-600'}`}>
                    {isNarratorMark && "★ "} {owner ? owner.nickname : "Desconhecido"}
                </div>
            )}
        </div>
      );
  };

  // --- ÁREA DE CONTEÚDO CENTRAL ---
  const renderPhaseContent = () => {
      if (phase === 'NARRATOR') {
          return (
              <div className="flex flex-col items-center animate-in fade-in">
                  <h1 className="text-3xl font-black text-pink-500 mb-8 flex items-center gap-2"><Palette /> IMAGINÁRIO</h1>
                  {isNarrator ? (
                      <div className="w-full max-w-lg bg-slate-800 p-6 rounded-2xl shadow-xl border border-pink-500/30">
                          <h2 className="text-xl font-bold mb-2 text-white text-center">VOCÊ É O NARRADOR!</h2>
                          <p className="text-slate-400 text-sm mb-4 text-center">1. Selecione uma carta abaixo.<br/>2. Escreva uma dica.</p>
                          <input className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white outline-none focus:border-pink-500 transition mb-4" placeholder="Dica..." value={clueInput} onChange={e => setClueInput(e.target.value)} maxLength={50} autoFocus />
                          <button onClick={submitClue} disabled={!selectedCard || !clueInput.trim()} className="bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl w-full">CONFIRMAR</button>
                      </div>
                  ) : (
                      <div className="text-center mt-10">
                          <Loader2 size={40} className="text-pink-500 animate-spin mx-auto mb-4"/>
                          <h2 className="text-2xl font-bold">Aguardando Narrador...</h2>
                          <p className="text-slate-400 mt-2"><b>{players.find(p => p.id === narratorId)?.nickname || "Alguém"}</b> está pensando.</p>
                      </div>
                  )}
              </div>
          );
      }

      if (phase === 'PLAYS') {
          const hasPlayed = gameData.tableCards?.some(c => c.ownerId === socket.id);
          return (
              <div className="flex flex-col items-center animate-in fade-in">
                  <div className="bg-pink-900/50 px-8 py-6 rounded-3xl border border-pink-500/30 mb-8 text-center shadow-xl">
                      <span className="text-pink-300 text-xs font-bold uppercase tracking-widest">A DICA É</span>
                      <h2 className="text-2xl md:text-4xl font-black text-white mt-2">"{gameData.clue}"</h2>
                  </div>
                  {!isNarrator ? (
                      !hasPlayed ? (
                          <div className="text-center">
                              <p className="text-slate-300 mb-6 font-bold text-lg">Escolha uma carta da sua mão que combine.</p>
                              <button onClick={playCard} disabled={!selectedCard} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-4 px-12 rounded-full shadow-xl">JOGAR CARTA</button>
                          </div>
                      ) : <div className="text-center"><Check className="w-16 h-16 text-emerald-500 mx-auto mb-4"/><h3 className="text-xl font-bold">Aguardando os outros...</h3></div>
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
          );
      }

      if (phase === 'VOTING') {
          const myVote = gameData.votes ? gameData.votes[socket.id] : null;
          return (
              <div className="flex flex-col items-center w-full animate-in fade-in">
                  <div className="mb-6 text-center">
                      <h2 className="text-3xl font-black text-white mb-2">"{gameData.clue}"</h2>
                      {!isNarrator && !myVote && <p className="text-emerald-400 font-bold animate-pulse bg-emerald-900/20 px-4 py-1 rounded-full">Ache a carta do Narrador!</p>}
                      {isNarrator && <p className="text-slate-400 font-bold">Aguardando votos...</p>}
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 mb-24 w-full max-w-6xl">
                      {gameData.tableCards?.map(card => {
                          const isVotedByMe = myVote === card.id;
                          return <Card key={card.id} id={card.id} disabled={isNarrator || !!myVote} onClick={voteCard} isSelected={isVotedByMe} label={isVotedByMe ? "SEU VOTO" : null} />;
                      })}
                  </div>
              </div>
          );
      }

      if (phase === 'SCORING' || phase === 'VICTORY') {
          return (
              <div className="flex flex-col items-center w-full animate-in fade-in">
                   <h1 className="text-4xl font-black text-yellow-400 mb-6 flex items-center gap-2"><Trophy /> RESULTADO</h1>
                   <div className="flex flex-wrap justify-center gap-6 mb-8 w-full max-w-6xl">
                      {gameData.tableCards?.map(card => {
                          const isNarratorCard = card.ownerId === narratorId;
                          return <Card key={card.id} id={card.id} showOwner={true} isNarratorMark={isNarratorCard} disabled={true} />;
                      })}
                   </div>
                   <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl mb-32">
                       <h3 className="text-slate-400 text-xs font-bold uppercase mb-4 text-center">Placar</h3>
                       <div className="space-y-2">
                           {players.sort((a,b) => (gameData.scores[b.id]||0) - (gameData.scores[a.id]||0)).map((p, index) => (
                               <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg ${p.id === socket.id ? 'bg-indigo-900/50 border border-indigo-500/50' : 'bg-slate-700/30'}`}>
                                   <div className="flex items-center gap-3"><span className="font-mono text-slate-500 font-bold w-4">{index + 1}.</span><span className="font-bold">{p.nickname}</span>{p.id === narratorId && <span className="text-[10px] bg-pink-600 px-1 rounded text-white">NARRADOR</span>}</div>
                                   <span className="text-yellow-400 font-black text-lg">{gameData.scores[p.id] || 0}</span>
                               </div>
                           ))}
                       </div>
                       {isHost && <button onClick={nextRound} className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2">PRÓXIMA RODADA <Eye size={16}/></button>}
                   </div>
              </div>
          );
      }
      return <div className="text-center mt-20"><Loader2 className="animate-spin text-pink-500 mx-auto"/> Carregando...</div>;
  };

  // --- RENDERIZAÇÃO PRINCIPAL ---
  return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
          {renderPhaseContent()}
          
          {/* BARRA DE MÃO FIXA (SEMPRE VISÍVEL) */}
          <div className="fixed bottom-0 left-0 w-full bg-slate-950/95 border-t border-slate-800 p-2 z-50 backdrop-blur-md pb-4 safe-area-bottom">
              <div className="max-w-6xl mx-auto flex flex-col gap-1">
                <p className="text-slate-500 text-[10px] font-bold uppercase text-center tracking-widest">SUAS CARTAS</p>
                <div className="flex justify-center gap-2 overflow-x-auto pb-2 px-4 no-scrollbar min-h-[100px] items-center">
                    {myHand.length > 0 ? myHand.map(id => (
                        <Card key={id} id={id} onClick={phase === 'NARRATOR' || (phase === 'PLAYS' && !isNarrator) ? setSelectedCard : null} isSelected={selectedCard === id} disabled={phase === 'VOTING' || phase === 'SCORING' || (phase === 'PLAYS' && isNarrator)} size="small"/>
                    )) : <div className="text-slate-600 text-sm italic">Distribuindo...</div>}
                </div>
              </div>
          </div>
      </div>
  );
}