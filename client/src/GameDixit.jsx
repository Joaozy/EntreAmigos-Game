import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { CheckCircle, MessageSquare, ArrowRight, User, LogOut, ImageOff, Maximize2, X } from 'lucide-react';

// --- CONFIGURAÇÃO DAS IMAGENS ---
const getCardUrl = (id) => {
    if (!id) return '';
    const cleanId = String(id).replace('card_', '').replace('.jpg', '');
    if (cleanId === 'BACK') return '/dixit_cards/back.jpg';
    return `/dixit_cards/card_${cleanId}.jpg`; 
};

export default function GameDixit() {
    const { socket, roomId, gameData, players, user, isHost, sairDoJogo } = useGame();
    
    const [phrase, setPhrase] = useState('');
    const [selectedCard, setSelectedCard] = useState(null);
    const [zoomedCard, setZoomedCard] = useState(null); // Estado para o Zoom

    // Proteção contra dados nulos
    if (!gameData || !players || !user) return <div className="text-white text-center p-10">Carregando Dixit...</div>;

    const myUserId = user.id;
    const phase = gameData.phase || 'STORY';
    const storytellerId = gameData.storytellerId;
    const isStoryteller = myUserId === storytellerId;
    const tableCards = gameData.tableCards || [];
    const myHand = gameData.myHand || [];
    
    const storytellerName = players.find(p => p.userId === storytellerId)?.nickname || "Narrador";

    // Ações
    const submitStory = () => {
        if (selectedCard && phrase.trim()) {
            if (socket) {
                socket.emit('dixit_narrate', { roomId, cardId: selectedCard, phrase });
                setSelectedCard(null);
                setPhrase('');
            }
        }
    };

    const selectCard = () => {
        if (selectedCard) {
            socket.emit('dixit_select_card', { roomId, cardId: selectedCard });
            setSelectedCard(null);
        }
    };

    const voteCard = (cardId) => {
        socket.emit('dixit_vote', { roomId, cardId });
    };

    // Componente de Carta
    const Card = ({ id, onClick, selected, disabled, label, owner }) => {
        const [imgError, setImgError] = useState(false);
        const url = getCardUrl(id);

        return (
            <div 
                onClick={() => !disabled && onClick && onClick(id)}
                className={`
                    relative aspect-[2/3] rounded-xl overflow-hidden shadow-xl transition-all duration-300 bg-slate-800 group
                    ${selected ? 'ring-4 ring-green-500 scale-105 z-10' : ''}
                    ${disabled ? 'cursor-default' : 'cursor-pointer hover:scale-102'}
                `}
            >
                {!imgError ? (
                    <img 
                        src={url} 
                        alt={`Carta ${id}`} 
                        className={`w-full h-full object-cover ${disabled ? 'opacity-90' : 'opacity-100'}`}
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2 text-center border-2 border-red-900/50 border-dashed bg-red-900/10">
                        <ImageOff size={24} className="mb-2 text-red-400"/>
                        <span className="text-[10px] text-red-300 font-mono break-all">Erro 404</span>
                    </div>
                )}

                {/* BOTÃO DE ZOOM (NOVO) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Impede que selecione a carta ao clicar no zoom
                        setZoomedCard(id);
                    }}
                    className="absolute top-2 left-2 bg-black/40 hover:bg-black/80 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm"
                    title="Ampliar Carta"
                >
                    <Maximize2 size={16} />
                </button>

                {label && <div className="absolute bottom-0 w-full bg-black/70 text-white text-center py-1 text-xs font-bold">{label}</div>}
                {owner && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full shadow flex items-center gap-1">
                        <User size={10}/> {owner}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#1a1c29] text-white p-4 flex flex-col font-sans">
            
            {/* MODAL DE ZOOM (Overlay) */}
            {zoomedCard && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
                    onClick={() => setZoomedCard(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
                        <button 
                            className="absolute -top-12 right-0 md:-right-12 text-white/70 hover:text-white p-2 transition"
                            onClick={() => setZoomedCard(null)}
                        >
                            <X size={32} />
                        </button>
                        <img 
                            src={getCardUrl(zoomedCard)} 
                            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-white/10 object-contain"
                            onClick={(e) => e.stopPropagation()} // Clicar na imagem não fecha
                        />
                        <p className="mt-4 text-slate-400 text-sm font-mono bg-black/50 px-3 py-1 rounded-full">
                            Carta #{zoomedCard}
                        </p>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 bg-white/5 p-4 rounded-2xl border border-white/10 shadow-lg">
                <div>
                    <h1 className="text-2xl font-serif italic text-purple-300 tracking-wider">Dixit</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        Vez de: <span className="text-white">{storytellerName}</span>
                    </p>
                </div>
                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition"><LogOut size={20} className="text-slate-400 hover:text-red-400"/></button>
            </div>

            {/* FRASE DA RODADA */}
            {gameData.phrase && (
                <div className="text-center mb-8 animate-in zoom-in duration-500">
                    <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] mb-3">O tema é</p>
                    <q className="text-3xl md:text-5xl font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-indigo-200 drop-shadow-sm px-4">
                        {gameData.phrase}
                    </q>
                </div>
            )}

            <div className="flex-1 flex flex-col items-center w-full max-w-6xl mx-auto">
                
                {/* FASE 1: NARRADOR ESCOLHE */}
                {phase === 'STORY' && isStoryteller && (
                    <div className="w-full animate-in slide-in-from-bottom">
                        <div className="bg-purple-900/20 p-6 rounded-2xl border border-purple-500/30 mb-8 flex flex-col md:flex-row gap-4 items-center shadow-2xl">
                            <input 
                                className="flex-1 bg-transparent border-b-2 border-purple-400/50 focus:border-purple-400 text-xl p-3 outline-none w-full text-white placeholder:text-purple-300/30 transition-colors"
                                placeholder="Escreva uma frase misteriosa..."
                                value={phrase}
                                onChange={e => setPhrase(e.target.value)}
                            />
                            <button 
                                onClick={submitStory}
                                disabled={!selectedCard || !phrase.trim()}
                                className="bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-purple-900/50 w-full md:w-auto"
                            >
                                CONFIRMAR
                            </button>
                        </div>
                        <p className="text-center mb-6 text-slate-400 text-sm uppercase tracking-widest">Escolha a carta que inspirou sua frase</p>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 lg:gap-6">
                            {myHand.map(id => (
                                <Card key={id} id={id} onClick={setSelectedCard} selected={selectedCard === id} />
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 1: OUTROS AGUARDAM (COM VISUALIZAÇÃO) */}
                {phase === 'STORY' && !isStoryteller && (
                    <div className="w-full text-center mt-8 animate-in fade-in">
                        <div className="mb-10 flex flex-col items-center animate-pulse">
                            <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mb-4">
                                <MessageSquare size={32} className="text-purple-400"/>
                            </div>
                            <p className="text-2xl font-light text-slate-300">O Narrador está criando uma história...</p>
                            <p className="text-sm text-slate-500 mt-2 uppercase tracking-widest">Analise suas cartas enquanto isso</p>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 lg:gap-6 opacity-75 hover:opacity-100 transition-opacity duration-500">
                            {myHand.map(id => (
                                <div key={id} className="relative transition-all duration-300 hover:scale-105">
                                    <Card id={id} disabled={true} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 2: OUTROS ESCOLHEM CARTA */}
                {phase === 'SELECTION' && !isStoryteller && (
                    <div className="w-full text-center animate-in slide-in-from-bottom">
                        <p className="text-xl mb-8 text-slate-200 font-light">Escolha uma carta da sua mão que combine com a frase!</p>
                        
                        {tableCards.some(tc => tc.ownerId === myUserId) ? (
                            <div className="bg-green-500/10 text-green-400 border border-green-500/20 px-8 py-4 rounded-xl inline-flex items-center gap-3 text-lg">
                                <CheckCircle size={24}/> Carta enviada! Aguardando os outros...
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 lg:gap-6 mb-8">
                                    {myHand.map(id => (
                                        <Card key={id} id={id} onClick={setSelectedCard} selected={selectedCard === id} />
                                    ))}
                                </div>
                                <button 
                                    onClick={selectCard}
                                    disabled={!selectedCard}
                                    className="bg-green-600 hover:bg-green-500 px-10 py-4 rounded-xl font-bold disabled:opacity-50 transition shadow-lg shadow-green-900/50 text-lg tracking-wide"
                                >
                                    ENVIAR CARTA SELECIONADA
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* FASE 2: NARRADOR AGUARDA */}
                {phase === 'SELECTION' && isStoryteller && (
                    <div className="text-center mt-10">
                        <p className="text-xl mb-8 text-slate-300">Aguardando os jogadores escolherem suas cartas falsas...</p>
                        <div className="flex gap-4 justify-center">
                            {tableCards.map((_, i) => (
                                <div key={i} className="w-16 h-24 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg animate-pulse shadow-lg border border-white/10"/>
                            ))}
                            {Array.from({length: Math.max(0, players.length - tableCards.length)}).map((_, i) => (
                                <div key={`placeholder-${i}`} className="w-16 h-24 bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-700"/>
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 3: VOTAÇÃO */}
                {phase === 'VOTING' && (
                    <div className="w-full animate-in fade-in">
                        <p className="text-center text-xl mb-8 text-slate-200">
                            {isStoryteller ? "Os jogadores estão tentando adivinhar sua carta..." : "Qual destas cartas pertence ao Narrador?"}
                        </p>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 lg:gap-6 justify-center">
                            {tableCards.map((tc) => (
                                <div key={tc.cardId} className="flex flex-col gap-2">
                                    <Card 
                                        id={tc.cardId} 
                                        onClick={!isStoryteller ? voteCard : undefined}
                                        disabled={isStoryteller} 
                                        selected={gameData.votes?.[myUserId] === tc.cardId}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 4: RESULTADO (SCORING) */}
                {phase === 'SCORING' && (
                    <div className="w-full animate-in zoom-in duration-500">
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 lg:gap-6 mb-12">
                            {tableCards.map((tc) => {
                                const owner = players.find(p => p.userId === tc.ownerId);
                                const isNarratorCard = tc.ownerId === storytellerId;
                                const votes = Object.values(gameData.votes || {}).filter(v => v === tc.cardId).length;
                                
                                return (
                                    <div key={tc.cardId} className={`relative rounded-xl p-1.5 transition-transform hover:scale-105 ${isNarratorCard ? 'bg-gradient-to-br from-yellow-400 to-orange-500 shadow-[0_0_30px_rgba(234,179,8,0.4)]' : 'bg-slate-700'}`}>
                                        <Card id={tc.cardId} disabled={true} />
                                        {votes > 0 && (
                                            <div className="absolute -top-3 -right-3 bg-white text-black font-black w-8 h-8 rounded-full flex items-center justify-center border-4 border-slate-900 shadow-xl z-20 text-sm">
                                                {votes}
                                            </div>
                                        )}
                                        <div className="text-center mt-3 text-xs font-bold truncate px-1 flex flex-col items-center gap-1">
                                            <span className="text-slate-300">{owner?.nickname}</span>
                                            {isNarratorCard && <span className="bg-yellow-500 text-black px-2 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">Narrador</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="bg-slate-800/80 backdrop-blur border border-white/5 p-8 rounded-3xl max-w-3xl mx-auto shadow-2xl">
                            <h3 className="text-center font-bold mb-6 uppercase tracking-[0.3em] text-slate-500 text-sm">Placar da Rodada</h3>
                            <div className="mb-6 text-center space-y-1">
                                {gameData.roundLog?.map((log, i) => (
                                    <p key={i} className="text-indigo-300 text-sm">{log}</p>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                                    <div key={p.userId} className="flex justify-between items-center bg-slate-700/50 p-4 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : "👾"}</span>
                                            <span className={`font-bold ${p.userId === myUserId ? 'text-yellow-400' : 'text-slate-200'}`}>{p.nickname}</span>
                                        </div>
                                        <span className="font-mono font-black text-2xl text-green-400">{p.score}</span>
                                    </div>
                                ))}
                            </div>

                            {isHost && (
                                <div className="text-center">
                                    <button 
                                        onClick={() => socket.emit('dixit_next', { roomId })} 
                                        className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black px-10 py-4 rounded-full font-black shadow-lg hover:scale-105 transition flex items-center gap-3 mx-auto text-lg tracking-wide"
                                    >
                                        PRÓXIMA RODADA <ArrowRight className="w-6 h-6"/>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}