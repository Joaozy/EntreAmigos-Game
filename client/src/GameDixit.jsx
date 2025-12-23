import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Palette, ArrowRight, Check, Eye } from 'lucide-react';

export default function GameDixit({ players, isHost, roomId, gameData, phase }) {
  const [myHand, setMyHand] = useState([]);
  const [clueInput, setClueInput] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);

  useEffect(() => {
      socket.on('dixit_hand', (hand) => setMyHand(hand));
      return () => socket.off('dixit_hand');
  }, []);

  const isStoryteller = gameData.storytellerId === socket.id;
  
  // URL da imagem baseada no ID (Seed)
  const getCardUrl = (id) => `https://picsum.photos/seed/${id}/300/450`;

  const submitClue = () => {
      if(!selectedCard || !clueInput.trim()) return;
      socket.emit('dixit_set_clue', { roomId, card: selectedCard, clue: clueInput });
  };

  const selectCard = () => {
      if(!selectedCard) return;
      socket.emit('dixit_select_card', { roomId, card: selectedCard });
      setSelectedCard(null); // Limpa seleção local
  };

  const voteCard = (id) => {
      if(confirm("Votar nesta carta?")) {
          socket.emit('dixit_vote', { roomId, cardId: id });
      }
  };

  // --- RENDERIZAR UMA CARTA ---
  const Card = ({ id, onClick, isSelected, disabled, label, showOwner }) => {
      // Procura dono da carta se estiver no result
      const ownerId = gameData.tableCards?.find(tc => tc.id === id)?.ownerId;
      const owner = players.find(p => p.id === ownerId);

      return (
        <div 
            onClick={() => !disabled && onClick && onClick(id)}
            className={`relative group rounded-xl overflow-hidden transition-all duration-300 shadow-lg cursor-pointer
            ${isSelected ? 'ring-4 ring-yellow-400 scale-105' : 'hover:scale-105'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            bg-slate-800 w-32 md:w-48 aspect-[2/3]
            `}
        >
            <img src={getCardUrl(id)} alt="Carta" className="w-full h-full object-cover" loading="lazy" />
            
            {/* Overlay Seleção */}
            {isSelected && <div className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center"><Check className="text-yellow-400 w-12 h-12 drop-shadow-lg"/></div>}
            
            {/* Label (Ex: "Sua Carta") */}
            {label && <div className="absolute bottom-0 w-full bg-black/60 text-white text-xs font-bold py-1 text-center">{label}</div>}

            {/* Resultado: Dono da carta */}
            {showOwner && owner && (
                <div className="absolute top-0 w-full bg-indigo-600/90 text-white text-xs font-bold py-1 text-center truncate px-1">
                    {owner.nickname}
                </div>
            )}
        </div>
      );
  };

  // --- FASE 1: NARRADOR (Storyteller) ---
  if (gameData.phase === 'STORYTELLER') {
      return (
          <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
              <h1 className="text-3xl font-black text-pink-500 mb-2 flex items-center gap-2"><Palette /> IMAGINÁRIO</h1>
              
              {isStoryteller ? (
                  <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in">
                      <div className="bg-slate-800 p-6 rounded-2xl mb-6 text-center shadow-xl border border-pink-500/30">
                          <h2 className="text-xl font-bold mb-2 text-white">VOCÊ É O NARRADOR!</h2>
                          <p className="text-slate-400 text-sm mb-4">1. Escolha uma carta. <br/>2. Escreva uma frase, palavra ou som sobre ela.</p>
                          
                          <input 
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white outline-none focus:border-pink-500 transition mb-4"
                            placeholder="Sua dica criativa..."
                            value={clueInput}
                            onChange={e => setClueInput(e.target.value)}
                            maxLength={50}
                          />
                          <button 
                            onClick={submitClue} 
                            disabled={!selectedCard || !clueInput.trim()}
                            className="bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl transition w-full"
                          >
                              CONFIRMAR
                          </button>
                      </div>
                      
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                          {myHand.map(id => (
                              <Card key={id} id={id} onClick={setSelectedCard} isSelected={selectedCard === id} />
                          ))}
                      </div>
                  </div>
              ) : (
                  <div className="text-center mt-20">
                      <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                          <Palette size={40} className="text-pink-500"/>
                      </div>
                      <h2 className="text-2xl font-bold">Aguardando o Narrador...</h2>
                      <p className="text-slate-400 mt-2"><b>{players.find(p => p.id === gameData.storytellerId)?.nickname}</b> está escolhendo uma carta.</p>
                  </div>
              )}
          </div>
      );
  }

  // --- FASE 2: SELEÇÃO (Outros jogadores escolhem carta falsa) ---
  if (gameData.phase === 'SELECTION') {
      const myPlayer = players.find(p => p.id === socket.id);
      const hasPlayed = myPlayer?.hasPlayed;

      return (
          <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
              <div className="bg-pink-900/30 px-6 py-4 rounded-full border border-pink-500/50 mb-8 text-center">
                  <span className="text-pink-300 text-xs font-bold uppercase tracking-widest">A DICA É</span>
                  <h2 className="text-3xl font-black text-white">"{gameData.clue}"</h2>
              </div>

              {!isStoryteller ? (
                  !hasPlayed ? (
                      <div className="flex flex-col items-center w-full max-w-4xl">
                          <p className="text-slate-300 mb-6 font-bold">Escolha a carta da sua mão que mais combina com essa dica para enganar os outros.</p>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8">
                              {myHand.map(id => (
                                  <Card key={id} id={id} onClick={setSelectedCard} isSelected={selectedCard === id} />
                              ))}
                          </div>
                          <button 
                            onClick={selectCard} 
                            disabled={!selectedCard}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-3 px-10 rounded-full transition shadow-lg"
                          >
                              JOGAR CARTA
                          </button>
                      </div>
                  ) : (
                      <div className="text-center mt-10">
                          <Check className="w-16 h-16 text-emerald-500 mx-auto mb-4"/>
                          <h3 className="text-xl font-bold">Carta Enviada!</h3>
                          <p className="text-slate-400">Esperando os outros jogadores...</p>
                      </div>
                  )
              ) : (
                   <div className="text-center mt-10">
                      <p className="text-slate-400 font-bold">Você é o narrador.</p>
                      <p className="text-sm text-slate-500">Esperando os outros escolherem cartas falsas...</p>
                  </div>
              )}
          </div>
      );
  }

  // --- FASE 3: VOTAÇÃO ---
  if (gameData.phase === 'VOTING') {
      const myPlayer = players.find(p => p.id === socket.id);
      const hasVoted = myPlayer?.hasVoted;

      return (
          <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
              <div className="mb-8 text-center">
                  <span className="text-pink-300 text-xs font-bold uppercase tracking-widest">A DICA ERA</span>
                  <h2 className="text-3xl font-black text-white mb-2">"{gameData.clue}"</h2>
                  {!isStoryteller && !hasVoted && <p className="text-emerald-400 font-bold animate-pulse">Qual é a carta do Narrador?</p>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {gameData.tableCards?.map(card => {
                      // Não pode votar na própria carta
                      const isMine = card.ownerId === socket.id;
                      return (
                          <Card 
                             key={card.id} 
                             id={card.id} 
                             disabled={isStoryteller || hasVoted || isMine}
                             onClick={voteCard}
                             label={isMine ? "SUA CARTA" : null}
                          />
                      );
                  })}
              </div>
              
              {(hasVoted || isStoryteller) && (
                  <div className="mt-8 bg-slate-800 px-6 py-3 rounded-xl flex items-center gap-3">
                      <Loader2 className="animate-spin text-indigo-400"/>
                      <span>Aguardando votos...</span>
                  </div>
              )}
          </div>
      );
  }

  // --- FASE 4: RESULTADO ---
  if (gameData.phase === 'RESULT') {
      return (
          <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center">
               <h1 className="text-3xl font-black text-yellow-400 mb-6">RESULTADO</h1>
               
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mb-8">
                  {gameData.tableCards?.map(card => {
                      const isStorytellerCard = card.ownerId === gameData.storytellerId;
                      return (
                          <div key={card.id} className="relative flex flex-col items-center">
                              <Card id={card.id} showOwner={true} isSelected={isStorytellerCard} />
                              {isStorytellerCard && <div className="mt-2 bg-pink-600 text-xs font-bold px-2 py-1 rounded">CARTA DO NARRADOR</div>}
                          </div>
                      );
                  })}
              </div>

              <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-2xl">
                  <h3 className="text-slate-400 text-xs font-bold uppercase mb-4">O que aconteceu?</h3>
                  <div className="space-y-2">
                      {gameData.roundWinners?.map((w, i) => (
                          <div key={i} className={`p-3 rounded-lg font-bold text-sm ${w.type === 'good' ? 'bg-emerald-900/50 text-emerald-300' : w.type === 'bad' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                              {w.msg}
                          </div>
                      ))}
                  </div>
              </div>
              
              <div className="mt-4 text-slate-500 text-xs animate-pulse">Próxima rodada em instantes...</div>
          </div>
      );
  }

  return <div>Carregando...</div>;
}