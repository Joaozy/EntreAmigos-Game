import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { ArrowLeft, ArrowRight, CheckCircle, RotateCcw, LogOut, Home, Play, Edit3, Shuffle, Crown } from 'lucide-react';

const PlayingCard = ({ number, clue, nickname, isFaceUp, isHighlight, onClick, showActions, onMoveLeft, onMoveRight, size = 'normal' }) => {
    const sizes = {
        mini: 'w-14 h-20 text-xl',        
        normal: 'w-32 h-48 md:w-40 md:h-56 text-6xl', 
        large: 'w-56 h-80 md:w-64 md:h-96 text-8xl'   
    };
    const currentSize = sizes[size] || sizes.normal;

    return (
        <div onClick={onClick} className={`relative ${currentSize} rounded-xl shadow-xl transition-all duration-500 transform ${isHighlight ? 'scale-105 -translate-y-2 ring-4 ring-yellow-400' : ''} flex flex-col select-none bg-white group`}>
            <div className={`absolute inset-0 w-full h-full rounded-lg md:rounded-xl border-[3px] border-white overflow-hidden ${isFaceUp ? 'bg-slate-100' : 'bg-red-900'}`}>
                {isFaceUp ? (
                    <div className="flex flex-col items-center justify-center h-full relative">
                        {size !== 'mini' && (
                            <>
                                <span className="absolute top-2 left-2 text-sm font-bold text-slate-400">{number}</span>
                                <span className="absolute bottom-2 right-2 text-sm font-bold text-slate-400 rotate-180">{number}</span>
                            </>
                        )}
                        <span className={`font-black text-slate-800 tracking-tighter ${size === 'mini' ? 'text-2xl' : ''}`}>{number}</span>
                        {size === 'large' && <span className="absolute text-[120px] font-black text-slate-200/50 pointer-events-none rotate-45">ITO</span>}
                    </div>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-800 relative">
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                        <div className={`rounded-full border-2 border-white/20 flex items-center justify-center ${size === 'mini' ? 'w-8 h-8' : 'w-20 h-20 border-4'}`}>
                            <span className={`${size === 'mini' ? 'text-[8px]' : 'text-2xl'} font-black text-white/20`}>ITO</span>
                        </div>
                    </div>
                )}
            </div>
            {size !== 'large' && (
                <div className={`absolute left-1/2 -translate-x-1/2 w-full text-center flex flex-col items-center z-10 ${size === 'mini' ? '-bottom-8' : '-bottom-12'}`}>
                    {clue && size !== 'mini' && (
                        <div className="bg-white text-slate-900 text-xs md:text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg mb-1 max-w-[150%] leading-tight break-words relative animate-in slide-in-from-bottom-2 border border-slate-200">
                            "{clue}"
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
                        </div>
                    )}
                    <div className="bg-black/60 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10 whitespace-nowrap">
                        {nickname}
                    </div>
                </div>
            )}
            {showActions && size === 'normal' && (
                <div className="absolute -top-10 left-0 w-full flex justify-center gap-2 z-20">
                    <button onClick={(e) => { e.stopPropagation(); onMoveLeft(); }} className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg"><ArrowLeft size={16}/></button>
                    <button onClick={(e) => { e.stopPropagation(); onMoveRight(); }} className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg"><ArrowRight size={16}/></button>
                </div>
            )}
        </div>
    );
};

export default function GameTable() {
    const { socket, roomId, isHost, gameData, players, user, sairDoJogo } = useGame();
    const myUserId = user?.id;
    
    const [clue, setClue] = useState('');
    const [mySecret, setMySecret] = useState(null);
    const [orderedPlayers, setOrderedPlayers] = useState([]);
    
    // Setup
    const [setupMode, setSetupMode] = useState('random');
    const [customTitle, setCustomTitle] = useState('');
    const [customMin, setCustomMin] = useState('Péssimo');
    const [customMax, setCustomMax] = useState('Ótimo');

    useEffect(() => {
        if (gameData && players.length > 0) {
            if (gameData.playersData && gameData.playersData[myUserId]) {
                setMySecret(gameData.playersData[myUserId].secretNumber);
            }
            if (gameData.currentOrder) {
                const ordered = gameData.currentOrder.map(uid => {
                    const pInfo = players.find(p => p.userId === uid);
                    const pData = gameData.playersData ? gameData.playersData[uid] : {};
                    if (!pInfo) return null;
                    return { ...pInfo, ...pData, userId: uid };
                }).filter(p => p !== null); 
                setOrderedPlayers(ordered);
            } else {
                setOrderedPlayers(players);
            }
        }
    }, [gameData, players, myUserId]);

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

    const startRound = () => {
        if (setupMode === 'random') {
            socket.emit('ito_start_round', { roomId, themeType: 'random' });
        } else {
            if (!customTitle.trim()) return;
            socket.emit('ito_start_round', { roomId, themeType: 'custom', customTheme: { title: customTitle, min: customMin, max: customMax } });
        }
    };

    if (!gameData) return <div className="text-white text-center mt-20">Carregando ITO...</div>;

    const myPlayerData = gameData.playersData?.[myUserId];
    const iHaveSubmitted = myPlayerData?.hasSubmitted;
    
    // --- LÓGICA DO CHOOSER ---
    const isChooser = myUserId === gameData.chooserId;
    const chooserName = players.find(p => p.userId === gameData.chooserId)?.nickname || "Alguém";

    // --- TELA 1: SETUP (BLINDADA) ---
    if (gameData.phase === 'SETUP') {
        return (
            <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 animate-in fade-in">
                <div className="absolute top-4 right-4">
                    <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white"><Home size={24}/></button>
                </div>

                <h1 className="text-4xl font-black mb-2 text-white tracking-widest">ITO</h1>
                <p className="text-slate-400 mb-8 font-bold uppercase tracking-wide">Configuração da Rodada</p>
                
                {isChooser ? (
                    <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-md border border-slate-700 shadow-2xl relative">
                        <div className="absolute -top-4 -right-4 bg-yellow-500 text-black px-3 py-1 rounded-full font-bold text-xs uppercase shadow-lg flex items-center gap-1">
                            <Crown size={12}/> Sua Vez
                        </div>
                        <div className="flex gap-2 mb-6 bg-slate-900 p-1 rounded-xl">
                            <button 
                                onClick={() => setSetupMode('random')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${setupMode === 'random' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:bg-white/5'}`}
                            >
                                <div className="flex items-center justify-center gap-2"><Shuffle size={16}/> Aleatório</div>
                            </button>
                            <button 
                                onClick={() => setSetupMode('custom')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${setupMode === 'custom' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:bg-white/5'}`}
                            >
                                <div className="flex items-center justify-center gap-2"><Edit3 size={16}/> Criar</div>
                            </button>
                        </div>

                        {setupMode === 'random' ? (
                            <div className="text-center py-8">
                                <div className="text-5xl mb-4">🎲</div>
                                <p className="text-slate-300 font-bold">Tema Surpresa</p>
                                <p className="text-slate-500 text-sm">O sistema escolherá um tema.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs text-slate-400 font-bold uppercase ml-1">Tema Principal</label>
                                    <input className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl focus:border-cyan-500 outline-none text-white font-bold" value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Ex: Animais" autoFocus/>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-400 font-bold uppercase ml-1">Mínimo</label>
                                        <input className="w-full bg-slate-900 border border-red-900/50 p-3 rounded-xl focus:border-red-500 outline-none text-red-200" value={customMin} onChange={e => setCustomMin(e.target.value)} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-400 font-bold uppercase ml-1">Máximo</label>
                                        <input className="w-full bg-slate-900 border border-green-900/50 p-3 rounded-xl focus:border-green-500 outline-none text-green-200" value={customMax} onChange={e => setCustomMax(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <button onClick={startRound} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 mt-4 hover:scale-[1.02]">
                            <Play size={20}/> INICIAR JOGO
                        </button>
                    </div>
                ) : (
                    <div className="text-center text-slate-400 p-8 bg-slate-800 rounded-2xl animate-pulse border border-slate-700">
                        <div className="mb-4 text-3xl">⏳</div>
                        Aguardando <span className="text-white font-bold">{chooserName}</span> escolher o tema...
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col font-sans overflow-hidden">
            {/* HEADER */}
            <div className="p-4 flex justify-between items-center bg-slate-900/90 backdrop-blur-md border-b border-white/5 z-50 shadow-lg">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black tracking-widest text-white">ITO</h1>
                    {gameData?.theme && (
                        <div className="hidden md:flex items-center gap-3 text-sm bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                            <span className="text-red-400 font-bold">{gameData.theme.min}</span>
                            <div className="w-32 h-1 bg-gradient-to-r from-red-500 to-green-500 rounded-full"></div>
                            <span className="text-green-400 font-bold">{gameData.theme.max}</span>
                            <span className="ml-2 font-bold text-white uppercase border-l border-white/20 pl-3">{gameData.theme.title}</span>
                        </div>
                    )}
                </div>
                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white"><Home size={24}/></button>
            </div>

            {/* Tema Mobile */}
            {gameData?.theme && gameData?.phase !== 'SETUP' && (
                <div className="md:hidden bg-slate-800 p-3 text-center border-b border-white/5 shadow-md">
                    <span className="text-lg font-bold uppercase text-white block mb-1">{gameData.theme.title}</span>
                    <div className="flex items-center justify-center gap-2 text-xs font-bold w-full">
                        <span className="text-red-400 w-1/3 text-right truncate">{gameData.theme.min}</span>
                        <div className="w-24 h-1 bg-gradient-to-r from-red-500 to-green-500 rounded-full"></div>
                        <span className="text-green-400 w-1/3 text-left truncate">{gameData.theme.max}</span>
                    </div>
                </div>
            )}

            {/* FASE 1: DICAS */}
            {gameData.phase === 'CLUE_PHASE' && (
                <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                    <div className="w-full bg-slate-900/30 p-4 border-b border-white/5">
                        <div className="flex flex-wrap justify-center gap-4">
                            {players.filter(p => p.userId !== myUserId).map(p => {
                                const hasSent = gameData.playersData?.[p.userId]?.hasSubmitted;
                                return (
                                    <div key={p.userId} className="flex flex-col items-center gap-1 transition-all duration-500">
                                        <div className="relative">
                                            <PlayingCard number="?" nickname={p.nickname} isFaceUp={false} size="mini" />
                                            {hasSent && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg backdrop-blur-sm animate-in zoom-in">
                                                    <CheckCircle className="text-green-400 w-8 h-8 drop-shadow-lg" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                        {!iHaveSubmitted ? (
                            <div className="w-full max-w-md mb-6 animate-in slide-in-from-top fade-in duration-700 z-20">
                                <div className="bg-slate-800 p-1 rounded-2xl shadow-2xl border-2 border-slate-600 flex gap-2 ring-4 ring-black/20">
                                    <input className="flex-1 bg-transparent text-white px-4 py-3 text-lg font-bold outline-none placeholder:text-slate-500" placeholder="Sua dica..." value={clue} onChange={e => setClue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitClue()} autoFocus />
                                    <button onClick={submitClue} className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-xl transition shadow-lg"><ArrowRight size={24}/></button>
                                </div>
                                <p className="text-center text-slate-400 text-sm mt-3 font-bold uppercase tracking-wider">Qual dica define o número abaixo?</p>
                            </div>
                        ) : (
                            <div className="mb-8 bg-green-500/20 text-green-300 px-8 py-3 rounded-full border border-green-500/50 animate-in zoom-in font-bold text-lg shadow-lg backdrop-blur-sm">"{clue}"</div>
                        )}
                        <div className="relative z-10 animate-in zoom-in duration-500">
                            <PlayingCard number={mySecret} nickname="VOCÊ" isFaceUp={true} size="large" isHighlight={false} />
                        </div>
                    </div>
                </div>
            )}

            {/* FASE 2 & 3: MESA */}
            {(gameData.phase === 'ORDERING' || gameData.phase === 'REVEAL') && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 pb-20 animate-in fade-in duration-700">
                    <div className="text-center mb-10">
                        {gameData.phase === 'ORDERING' ? (
                            <p className="text-cyan-200 mb-2 text-xl font-light">Ordenem as cartas do menor para o maior!</p>
                        ) : (
                            <h2 className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">RESULTADO</h2>
                        )}
                    </div>

                    <div className="flex flex-wrap justify-center items-end gap-4 md:gap-6 w-full max-w-7xl">
                        {orderedPlayers.map((p, index) => {
                            const isRevealed = gameData.phase === 'REVEAL';
                            const prev = orderedPlayers[index - 1];
                            const isError = isRevealed && prev && prev.secretNumber > p.secretNumber;
                            return (
                                <div key={p.userId} className="relative group">
                                    {isError && (
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg animate-bounce z-20 whitespace-nowrap border-2 border-red-400">⚠️ ERRO</div>
                                    )}
                                    <PlayingCard number={p.secretNumber} nickname={p.nickname} clue={p.clue} isFaceUp={isRevealed} isHighlight={isError} showActions={isHost && gameData.phase === 'ORDERING'} onMoveLeft={() => movePlayer(index, -1)} onMoveRight={() => movePlayer(index, 1)} size="normal" />
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-16 h-20 flex items-center justify-center">
                        {isHost && gameData.phase === 'ORDERING' && (
                            <button onClick={() => socket.emit('reveal_cards', { roomId })} className="bg-yellow-500 hover:bg-yellow-400 text-black px-12 py-4 rounded-full font-black text-lg shadow-2xl hover:scale-105 transition animate-pulse border-4 border-yellow-300/50">REVELAR TODAS</button>
                        )}
                        {isHost && gameData.phase === 'REVEAL' && (
                            <button onClick={() => socket.emit('ito_back_to_setup', { roomId })} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-bold shadow-2xl hover:scale-105 transition active:scale-95 border-b-4 border-green-800">
                                <RotateCcw size={20}/> NOVA RODADA
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}