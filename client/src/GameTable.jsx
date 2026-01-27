import React, { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { socket } from './socket';
import { useGame } from './context/GameContext';

// Carta Secreta (3D Flip)
function SecretCard({ number }) {
  const [isFlipped, setIsFlipped] = useState(false);
  return (
    <div className="perspective-1000 w-32 h-48 cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
      <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Costas da Carta */}
        <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-600 to-purple-800 rounded-2xl shadow-2xl border-2 border-indigo-400 flex flex-col items-center justify-center p-2 group-hover:scale-105 transition-transform">
          <div className="w-20 h-20 rounded-full border-4 border-indigo-300/30 flex items-center justify-center">
             <span className="text-4xl">?</span>
          </div>
          <span className="mt-4 text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Toque para ver</span>
        </div>
        {/* Frente da Carta */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white rounded-2xl shadow-xl border-4 border-indigo-600 flex items-center justify-center">
          <span className="text-7xl font-black text-indigo-600">{number}</span>
        </div>
      </div>
    </div>
  );
}

// Item Arrastável da Lista
function SortableItem({ id, player, phase, myUserId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = { 
      transform: CSS.Transform.toString(transform), 
      transition, 
      zIndex: isDragging ? 99 : 'auto', 
      touchAction: 'none' // Importante para drag no mobile
  };
  
  let statusClass = "bg-white border-slate-200";
  let numberDisplay = null;

  if (phase === 'REVEAL' && player.secretNumber !== undefined) {
    if (player.isCorrect) statusClass = "bg-green-50 border-green-500 ring-2 ring-green-200";
    else statusClass = "bg-red-50 border-red-500 ring-2 ring-red-200";
    
    numberDisplay = (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl shadow-sm border ${player.isCorrect ? 'bg-green-200 text-green-800 border-green-400' : 'bg-red-200 text-red-800 border-red-400'}`}>
            {player.secretNumber}
        </div>
    );
  }

  const isMe = player.userId === myUserId;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} 
      className={`relative p-3 mb-3 rounded-2xl border-2 flex items-center gap-3 transition-all shadow-sm ${statusClass} ${isMe ? 'ring-2 ring-indigo-400' : ''} ${isDragging ? 'shadow-2xl scale-105 opacity-90' : ''}`}>
      
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-md ${isMe ? 'bg-indigo-600' : 'bg-slate-400'}`}>
        {player.nickname[0].toUpperCase()}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-2">
            {player.nickname}
            {isMe && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 rounded-full">VOCÊ</span>}
        </div>
        {player.clue ? (
            <div className="text-sm text-slate-600 font-medium break-words leading-tight bg-slate-100 p-2 rounded-lg mt-1 border border-slate-200">
                "{player.clue}"
            </div>
        ) : (
            <div className="text-xs text-slate-400 italic mt-1">Sem dica...</div>
        )}
      </div>
      
      {numberDisplay}
    </div>
  );
}

export default function GameTable({ players, isHost, mySecretNumber, roomId, theme, phase, gameResult }) {
  const { myUserId } = useGame();
  const [items, setItems] = useState(players);
  const [myClueInput, setMyClueInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  // Sensores configurados para evitar drag acidental no scroll
  const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), 
      useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  useEffect(() => { 
      setItems(players);
      const me = players.find(p => p.userId === myUserId);
      if (me && me.hasSubmitted) setSubmitted(true);
      else if (phase === 'CLUE_PHASE') setSubmitted(false);
  }, [players, phase, myUserId]);

  function handleDragEnd(event) {
    if (phase === 'REVEAL') return; 
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newOrder);
      socket.emit('update_order', { roomId, newOrderIds: newOrder.map(p => p.userId) });
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-32 font-sans text-slate-800 overflow-x-hidden relative">
      
      {/* HEADER TEMA */}
      <div className="bg-slate-800 p-6 pt-8 rounded-b-[2rem] shadow-2xl border-b border-slate-700 mb-8 relative z-20">
        <div className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em] mb-2 text-center">Tema da Rodada</div>
        <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mb-4 text-center">
          {theme?.title || "Carregando..."}
        </h1>
        <div className="flex justify-between items-center text-xs font-bold text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-700">
          <span className="text-red-400 flex items-center gap-1">⬇️ Mínimo ({theme?.min})</span>
          <span className="text-green-400 flex items-center gap-1">Máximo ({theme?.max}) ⬆️</span>
        </div>
      </div>

      {/* CARTA DO JOGADOR */}
      <div className="flex justify-center mb-8 relative z-10 animate-in fade-in zoom-in duration-500">
        <SecretCard number={mySecretNumber || "?"} />
      </div>

      {/* INPUT DICA */}
      {phase === 'CLUE_PHASE' && (
        <div className="px-4 max-w-md mx-auto mb-8 animate-in slide-in-from-bottom-4 duration-500">
          {!submitted ? (
            <div className="bg-white p-5 rounded-2xl shadow-xl">
              <label className="block text-slate-700 font-bold mb-2 text-sm uppercase tracking-wide">Sua dica para o número {mySecretNumber}:</label>
              <div className="flex gap-2">
                <input 
                  className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-lg focus:border-indigo-500 outline-none transition"
                  placeholder="Ex: Muito quente..."
                  value={myClueInput}
                  onChange={e => setMyClueInput(e.target.value)}
                  maxLength={40}
                />
                <button 
                  onClick={() => { if(myClueInput.trim()){ socket.emit('submit_clue', { roomId, clue: myClueInput }); setSubmitted(true); }}}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 rounded-xl shadow-lg active:scale-95 transition"
                >
                  OK
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 bg-slate-800/80 rounded-2xl border border-slate-700 backdrop-blur">
              <p className="text-indigo-300 font-bold mb-4 text-sm uppercase tracking-widest">Aguardando outros jogadores...</p>
              <div className="flex flex-wrap justify-center gap-3">
                {players.map(p => (
                  <div key={p.userId} className="flex flex-col items-center gap-1">
                      <div className={`w-3 h-3 rounded-full transition-all duration-300 ${p.hasSubmitted ? 'bg-green-500 scale-125 shadow-[0_0_10px_#22c55e]' : 'bg-slate-600'}`} />
                      <span className="text-[9px] text-slate-500">{p.nickname.slice(0,3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LISTA ORDENÁVEL */}
      {(phase === 'ORDERING' || phase === 'REVEAL') && (
        <div className="px-4 max-w-md mx-auto flex gap-4 items-stretch relative z-0">
          {/* Régua Lateral */}
          <div className="w-10 flex flex-col justify-between items-center py-6 bg-slate-800/80 rounded-full border border-slate-700 backdrop-blur sticky top-20 h-[60vh]">
            <div className="text-[10px] font-black text-red-400 uppercase rotate-180" style={{writingMode: 'vertical-rl'}}>MENOR</div>
            <div className="flex-1 w-1.5 bg-gradient-to-b from-red-500 via-yellow-500 to-green-500 my-4 rounded-full opacity-60"></div>
            <div className="text-[10px] font-black text-green-400 uppercase rotate-180" style={{writingMode: 'vertical-rl'}}>MAIOR</div>
          </div>

          <div className="flex-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items} strategy={verticalListSortingStrategy}>
                {items.map((p) => <SortableItem key={p.id} id={p.id} player={p} phase={phase} myUserId={myUserId} />)}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {/* BOTÃO DO HOST */}
      {isHost && phase === 'ORDERING' && (
        <div className="fixed bottom-6 left-0 w-full px-4 flex justify-center z-50">
          <button 
            onClick={() => socket.emit('reveal_cards', { roomId })} 
            className="w-full max-w-md bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 rounded-2xl shadow-2xl text-xl transition transform hover:scale-105 border-4 border-green-400/30"
          >
            REVELAR RESULTADO!
          </button>
        </div>
      )}

      {/* MODAL DE RESULTADO */}
      {phase === 'REVEAL' && gameResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden transform scale-100">
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-green-400 via-yellow-400 to-red-400"></div>
            
            <h2 className="text-slate-400 font-bold uppercase text-xs tracking-[0.3em] mt-2">PONTUAÇÃO</h2>
            <div className="text-8xl font-black text-indigo-600 my-4 tracking-tighter leading-none">
                {gameResult.totalScore}
                <span className="text-3xl text-slate-300 font-bold">/{gameResult.maxScore}</span>
            </div>
            
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                Cartas posicionadas corretamente.<br/>
                {gameResult.totalScore === gameResult.maxScore ? <span className="text-green-500 font-bold">PERFEITO! 🎉</span> : "Quase lá!"}
            </p>
            
            {isHost ? (
              <button 
                onClick={() => socket.emit('ito_restart', { roomId })}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition transform hover:scale-105"
              >
                JOGAR NOVAMENTE 🔄
              </button>
            ) : (
              <p className="text-indigo-500 animate-pulse font-bold text-sm">O Host está decidindo...</p>
            )}
          </div>
        </div>
      )}
      <style>{`.perspective-1000 { perspective: 1000px; } .transform-style-3d { transform-style: preserve-3d; } .backface-hidden { backface-visibility: hidden; } .rotate-y-180 { transform: rotateY(180deg); }`}</style>
    </div>
  );
}