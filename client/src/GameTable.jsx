import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { ArrowUp, ArrowDown, CheckCircle, RotateCcw, LogOut, Home } from 'lucide-react';

export default function GameTable() {
    const { socket, roomId, isHost, gameData, players, myUserId, sairDoJogo } = useGame();
    
    const [clue, setClue] = useState('');
    const [mySecret, setMySecret] = useState(null);
    const [orderedPlayers, setOrderedPlayers] = useState([]);

    // --- SINCRONIA ---
    useEffect(() => {
        if (gameData && players.length > 0) {
            // 1. Meu Segredo
            if (gameData.playersData && gameData.playersData[myUserId]) {
                setMySecret(gameData.playersData[myUserId].secretNumber);
            }

            // 2. Ordem dos Jogadores
            if (gameData.currentOrder) {
                const ordered = gameData.currentOrder.map(uid => {
                    const pInfo = players.find(p => p.userId === uid);
                    const pData = gameData.playersData ? gameData.playersData[uid] : {};
                    return { ...pInfo, ...pData, userId: uid };
                }).filter(p => p && p.nickname); 
                setOrderedPlayers(ordered);
            } else {
                setOrderedPlayers(players);
            }
        }
    }, [gameData, players, myUserId]);

    // --- AÇÕES ---
    const submitClue = () => {
        if (!clue.trim()) return;
        socket.emit('submit_clue', { roomId, clue });
    };

    const movePlayer = (index, direction) => {
        if (!isHost || gameData.phase !== 'ORDERING') return;
        
        const newOrder = [...orderedPlayers];
        const targetIndex = index + direction;
        
        if (targetIndex >= 0 && targetIndex < newOrder.length) {
            [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
            setOrderedPlayers(newOrder); 
            socket.emit('update_order', { roomId, newOrderIds: newOrder.map(p => p.userId) });
        }
    };

    // --- RENDERIZAÇÃO ---
    return (
        <div className="min-h-screen bg-cyan-900 text-white p-4 flex flex-col items-center">
            
            {/* --- NOVO: HEADER FIXO COM BOTÃO DE SAIR --- */}
            <div className="fixed top-0 left-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none">
                <div className="bg-cyan-950/80 backdrop-blur-md px-4 py-2 rounded-full border border-cyan-700 shadow-lg pointer-events-auto">
                    <span className="text-xs font-bold text-cyan-400 tracking-widest">SALA: {roomId}</span>
                </div>
                <button 
                    onClick={sairDoJogo} 
                    className="pointer-events-auto bg-red-900/80 hover:bg-red-800 text-white p-2 rounded-full shadow-lg backdrop-blur-md transition border border-red-700"
                    title="Sair do Jogo"
                >
                    <LogOut size={20}/>
                </button>
            </div>

            {/* ESPAÇAMENTO PARA O HEADER */}
            <div className="h-16"></div>

            {/* CABEÇALHO DO JOGO */}
            <div className="w-full max-w-2xl bg-cyan-800 p-6 rounded-2xl shadow-xl mb-8 border border-cyan-600 text-center relative z-10">
                <h1 className="text-3xl font-black mb-2 tracking-widest text-cyan-200">ITO</h1>
                {gameData?.theme && (
                    <div className="bg-cyan-950 p-4 rounded-xl flex justify-between items-center">
                        <span className="text-red-400 font-bold">{gameData.theme.min}</span>
                        <span className="text-xl font-bold text-white uppercase px-2">{gameData.theme.title}</span>
                        <span className="text-green-400 font-bold">{gameData.theme.max}</span>
                    </div>
                )}
            </div>

            {/* MEU SEGREDO (FIXO NO CANTO) */}
            <div className="fixed bottom-6 right-6 z-50">
                <div className="bg-yellow-500 text-black w-20 h-20 rounded-full shadow-2xl border-4 border-white flex items-center justify-center animate-bounce-slow transform hover:scale-110 transition">
                    <span className="text-3xl font-black">{mySecret || "?"}</span>
                </div>
            </div>

            {/* FASE 1: ENVIAR PISTAS */}
            {gameData?.phase === 'CLUE_PHASE' && (
                <div className="w-full max-w-md text-center animate-in fade-in">
                    <p className="mb-4 text-cyan-200 text-lg">Seu número é <b>{mySecret}</b>. Dê uma dica!</p>
                    
                    {!gameData.playersData?.[myUserId]?.hasSubmitted ? (
                        <div className="flex gap-2 mb-8">
                            <input 
                                className="flex-1 p-4 rounded-xl text-black font-bold outline-none shadow-lg"
                                placeholder="Sua pista..."
                                value={clue}
                                onChange={e => setClue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitClue()}
                            />
                            <button onClick={submitClue} className="bg-green-500 px-6 rounded-xl font-bold shadow-lg hover:bg-green-400 transition">ENVIAR</button>
                        </div>
                    ) : (
                        <div className="bg-green-600/20 border border-green-500 p-4 rounded-xl text-green-300 font-bold flex items-center justify-center gap-2 mb-8">
                            <CheckCircle/> Pista enviada! Aguardando...
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {orderedPlayers.map(p => (
                            <div key={p.userId} className={`p-3 rounded-lg text-sm font-bold flex items-center justify-between ${p.hasSubmitted ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-500'}`}>
                                <span>{p.nickname}</span>
                                {p.hasSubmitted && <CheckCircle size={16}/>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FASE 2: ORDENAÇÃO */}
            {gameData?.phase === 'ORDERING' && (
                <div className="w-full max-w-2xl animate-in slide-in-from-bottom">
                    <div className="text-center mb-6">
                        <p className="text-cyan-200 mb-4 text-lg">Ordenem as cartas do <b className="text-red-400">MENOR</b> para o <b className="text-green-400">MAIOR</b>!</p>
                        {isHost ? (
                            <button onClick={() => socket.emit('reveal_cards', { roomId })} className="bg-yellow-500 text-black px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-yellow-400 transition hover:scale-105">
                                REVELAR CARTAS 🃏
                            </button>
                        ) : (
                            <p className="text-sm text-cyan-400 bg-cyan-950/50 py-2 rounded-lg">Apenas o Host pode mover as cartas.</p>
                        )}
                    </div>

                    <div className="space-y-3 pb-24">
                        {orderedPlayers.map((p, index) => (
                            <div key={p.userId} className="bg-cyan-800 p-4 rounded-xl flex items-center gap-4 border border-cyan-700 shadow-lg transition-all hover:bg-cyan-750">
                                <div className="w-10 h-10 bg-cyan-950 rounded-full flex items-center justify-center font-bold text-cyan-500 border border-cyan-800 shrink-0">
                                    #{index + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-xl text-white">"{p.clue || "..."}"</div>
                                    <div className="text-xs text-cyan-300 uppercase font-bold">{p.nickname}</div>
                                </div>
                                
                                {isHost && (
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => movePlayer(index, -1)} className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow"><ArrowUp size={16}/></button>
                                        <button onClick={() => movePlayer(index, 1)} className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow"><ArrowDown size={16}/></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FASE 3: REVELAÇÃO */}
            {gameData?.phase === 'REVEAL' && (
                <div className="w-full max-w-2xl animate-in zoom-in">
                    <div className="text-center mb-8 flex flex-col gap-4">
                        <h2 className="text-3xl font-bold text-white">RESULTADO</h2>
                        
                        {/* --- NOVO: BOTÕES DE AÇÃO --- */}
                        <div className="flex gap-4 justify-center">
                            {isHost && (
                                <button onClick={() => socket.emit('ito_restart', { roomId })} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 px-6 py-3 rounded-xl font-bold transition shadow-lg">
                                    <RotateCcw size={20}/> NOVA RODADA
                                </button>
                            )}
                            <button onClick={sairDoJogo} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-xl font-bold transition shadow-lg">
                                <Home size={20}/> SAIR
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3 pb-24">
                        {orderedPlayers.map((p, index) => {
                            const prev = orderedPlayers[index - 1];
                            const isOrderCorrect = !prev || prev.secretNumber <= p.secretNumber;
                            
                            return (
                                <div key={p.userId} className={`p-4 rounded-xl flex items-center gap-4 border-l-8 shadow-lg ${isOrderCorrect ? 'bg-cyan-800 border-green-500' : 'bg-red-900/40 border-red-500'}`}>
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl shadow-inner shrink-0 ${isOrderCorrect ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>
                                        {p.secretNumber}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-lg text-white">"{p.clue}"</div>
                                        <div className="text-xs text-cyan-300">{p.nickname}</div>
                                    </div>
                                    {!isOrderCorrect && <div className="text-red-400 font-bold text-xs uppercase bg-red-900/50 px-2 py-1 rounded">Fora de Ordem</div>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}