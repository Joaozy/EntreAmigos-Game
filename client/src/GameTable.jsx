import React, { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { socket } from './socket';

// --- COMPONENTES AUXILIARES ---

function SecretCard({ number }) {
  const [isFlipped, setIsFlipped] = useState(false);
  return (
    <div className="perspective-1000 w-32 h-44 cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
      <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-2xl border-2 border-indigo-400 flex flex-col items-center justify-center p-2">
          <div className="w-20 h-20 rounded-full border-4 border-indigo-300 opacity-30"></div>
          <span className="mt-2 text-indigo-200 text-xs font-bold uppercase tracking-widest">Toque</span>
        </div>
        <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white rounded-xl shadow-xl border-4 border-indigo-600 flex items-center justify-center">
          <span className="text-6xl font-black text-indigo-600">{number}</span>
        </div>
      </div>
    </div>
  );
}

function SortableItem({ id, player, phase }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    zIndex: isDragging ? 50 : 'auto', 
    touchAction: 'none' 
  };
  
  let statusColor = "border-transparent";
  if (phase === 'REVEAL' && player.isCorrect !== undefined) {
    statusColor = player.isCorrect ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50";
  } else if (isDragging) {
    statusColor = "border-indigo-500 shadow-xl scale-105 z-50";
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} 
      className={`relative p-3 mb-2 rounded-xl border-2 bg-white flex items-center gap-3 transition-all ${statusColor} shadow-sm`}>
      <div className="w-8 h-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
        {player.nickname[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 text-sm truncate">{player.nickname}</div>
        {player.clue && <div className="text-xs text-slate-600 italic break-words leading-tight">"{player.clue}"</div>}
      </div>
      {phase === 'REVEAL' && (
        <div className={`text-xl font-black ${player.isCorrect ? 'text-green-600' : 'text-red-500'}`}>
          {player.secretNumber}
        </div>
      )}
    </div>
  );
}

// --- MESA PRINCIPAL ---
export default function GameTable({ players, isHost, mySecretNumber, roomId, theme, phase, gameResult }) {
  const [items, setItems] = useState(players);
  const [myClueInput, setMyClueInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor));

  useEffect(() => { setItems(players); }, [players]);
  useEffect(() => { 
    if (phase === 'CLUE_PHASE') {
      setSubmitted(false); 
      setMyClueInput('');
    }
  }, [phase]);

  function handleDragEnd(event) {
    if (phase === 'REVEAL') return; 
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newOrder);
      socket.emit('update_order', { roomId, newOrderIds: newOrder.map(p => p.id) });
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-20 font-sans text-slate-800 overflow-hidden relative">
      
      {/* 1. HEADER DO TEMA */}
      <div className="bg-slate-800 p-4 pt-6 rounded-b-3xl shadow-lg border-b border-slate-700 mb-6">
        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 text-center">Tema</div>
        <h1 className="text-xl md:text-2xl font-black text-white leading-tight mb-3 text-center">
          {theme?.title || "Carregando..."}
        </h1>
        <div className="flex justify-between text-[10px] font-bold text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700">
          <span className="text-red-400">⬇️ {theme?.min} (1)</span>
          <span className="text-green-400">{theme?.max} (100) ⬆️</span>
        </div>
      </div>

      {/* 2. ÁREA DA CARTA SECRETA */}
      <div className="flex justify-center mb-6 relative z-10">
        <SecretCard number={mySecretNumber || "?"} />
      </div>

      {/* 3. INPUT DICAS */}
      {phase === 'CLUE_PHASE' && (
        <div className="px-4 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {!submitted ? (
            <div className="bg-white p-4 rounded-2xl shadow-xl">
              <label className="block text-slate-700 font-bold mb-2 text-sm">Sua dica para o número {mySecretNumber}:</label>
              <div className="flex gap-2">
                <input 
                  className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-lg focus:border-indigo-500 outline-none transition"
                  placeholder="Escreva algo..."
                  value={myClueInput}
                  onChange={e => setMyClueInput(e.target.value)}
                />
                <button 
                  onClick={() => { if(myClueInput.trim()){ socket.emit('submit_clue', { roomId, clue: myClueInput }); setSubmitted(true); }}}
                  className="bg-indigo-600 text-white font-bold px-4 rounded-xl shadow-lg active:scale-95 transition"
                >
                  OK
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <p className="text-indigo-300 font-bold mb-3 text-sm">Aguardando amigos...</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players.map(p => (
                  <div key={p.id} className={`w-2 h-2 rounded-full transition-all ${p.hasSubmitted ? 'bg-green-500 scale-125 shadow-[0_0_8px_#22c55e]' : 'bg-slate-600'}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. ÁREA DE ORDENAÇÃO (COM ESCALA VISUAL) */}
      {(phase === 'ORDERING' || phase === 'REVEAL') && (
        <div className="px-4 max-w-md mx-auto pb-32 flex gap-3 items-stretch">
          
          {/* NOVA ESCALA VISUAL (Solução Visual) */}
          <div className="w-8 flex flex-col justify-between items-center py-4 bg-slate-800/50 rounded-full border border-slate-700">
            <div className="text-xs font-bold text-red-400 rotate-180" style={{writingMode: 'vertical-rl'}}>MENOR (1)</div>
            <div className="flex-1 w-1 bg-gradient-to-b from-red-500 via-yellow-500 to-green-500 my-2 rounded-full opacity-50"></div>
            <div className="text-xs font-bold text-green-400 rotate-180" style={{writingMode: 'vertical-rl'}}>MAIOR (100)</div>
          </div>

          <div className="flex-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items} strategy={verticalListSortingStrategy}>
                {items.map((p) => <SortableItem key={p.id} id={p.id} player={p} phase={phase} />)}
              </SortableContext>
            </DndContext>
          </div>

          {isHost && phase === 'ORDERING' && (
            <div className="fixed bottom-6 left-0 w-full px-4 flex justify-center z-50">
              <button 
                onClick={() => socket.emit('reveal_cards', { roomId })} 
                className="w-full max-w-md bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-2xl shadow-2xl text-xl transition transform hover:scale-105"
              >
                REVELAR!
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL RESULTADO */}
      {phase === 'REVEAL' && gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-green-400 via-yellow-400 to-red-400"></div>
            <h2 className="text-gray-400 font-bold uppercase text-xs tracking-widest mt-2">Resultado Final</h2>
            <div className="text-6xl font-black text-indigo-600 my-4">{gameResult.totalScore} <span className="text-2xl text-gray-300">/ {gameResult.maxScore}</span></div>
            <p className="text-slate-600 font-medium mb-8">Cartas colocadas na ordem correta.</p>
            {isHost ? (
              <button 
                /* CORREÇÃO: Chama reinício imediato do ITO */
                onClick={() => socket.emit('ito_restart', { roomId })}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition"
              >
                JOGAR NOVAMENTE 🔄
              </button>
            ) : (
              <p className="text-indigo-500 animate-pulse font-bold">O Host está decidindo...</p>
            )}
          </div>
        </div>
      )}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}