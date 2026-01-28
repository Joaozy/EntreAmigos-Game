import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { Eye, CheckCircle, MessageSquare, ArrowRight, User, LogOut, ImageOff } from 'lucide-react';

// --- CONFIGURAÇÃO DAS IMAGENS ---
// Verifique se na pasta 'public/dixit_cards' os arquivos são:
// 1.jpg, 2.jpg ... 216.jpg E back.jpg (verso da carta)
const getCardUrl = (id) => {
    if (id === 'BACK') return '/dixit_cards/back.jpg';
    return `/dixit_cards/card_${id}.jpg`; 
};

export default function GameDixit() {
    const { socket, roomId, gameData, players, myUserId, isHost, sairDoJogo } = useGame();
    
    const [phrase, setPhrase] = useState('');
    const [selectedCard, setSelectedCard] = useState(null);

    const phase = gameData?.phase || 'STORY';
    const storytellerId = gameData?.storytellerId;
    const isStoryteller = myUserId === storytellerId;
    const tableCards = gameData?.tableCards || [];
    const myHand = gameData?.myHand || [];
    
    const storytellerName = players.find(p => p.userId === storytellerId)?.nickname || "Narrador";

    // Ações
    const submitStory = () => {
        if (selectedCard && phrase.trim()) {
            socket.emit('dixit_narrate', { roomId, cardId: selectedCard, phrase });
            setSelectedCard(null);
            setPhrase('');
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

    // Componente de Carta com Tratamento de Erro
    const Card = ({ id, onClick, selected, disabled, label, owner }) => {
        const [imgError, setImgError] = useState(false);

        return (
            <div 
                onClick={() => !disabled && onClick && onClick(id)}
                className={`
                    relative aspect-[2/3] rounded-xl overflow-hidden shadow-xl transition-all duration-300 bg-slate-800
                    ${selected ? 'ring-4 ring-green-500 scale-105' : ''}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-102'}
                `}
            >
                {!imgError ? (
                    <img 
                        src={getCardUrl(id)} 
                        alt={`Carta ${id}`} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            console.error(`Erro ao carregar imagem: ${getCardUrl(id)}`);
                            setImgError(true);
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2 text-center border-2 border-slate-600 border-dashed">
                        <ImageOff size={24} className="mb-2"/>
                        <span className="text-[10px] break-all">Img {id}.jpg não encontrada</span>
                    </div>
                )}

                {label && (
                    <div className="absolute bottom-0 w-full bg-black/70 text-white text-center py-1 text-xs font-bold">
                        {label}
                    </div>
                )}
                {owner && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full shadow flex items-center gap-1">
                        <User size={10}/> {owner}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#1a1c29] text-white p-4 flex flex-col">
            
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div>
                    <h1 className="text-2xl font-serif italic text-purple-300">Dixit</h1>
                    <p className="text-xs text-slate-400">Rodada de {storytellerName}</p>
                </div>
                <button onClick={sairDoJogo}><LogOut className="text-slate-500 hover:text-red-400"/></button>
            </div>

            {/* FRASE DA RODADA (Se já definida) */}
            {gameData?.phrase && (
                <div className="text-center mb-8 animate-in zoom-in">
                    <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">O Narrador disse:</p>
                    <q className="text-3xl md:text-4xl font-serif italic text-purple-200">
                        {gameData.phrase}
                    </q>
                </div>
            )}

            {/* --- ÁREA PRINCIPAL --- */}
            <div className="flex-1 flex flex-col items-center">
                
                {/* FASE 1: STORY (Narrador escolhe) */}
                {phase === 'STORY' && isStoryteller && (
                    <div className="w-full max-w-4xl">
                        <div className="bg-purple-900/30 p-6 rounded-2xl border border-purple-500/50 mb-8 flex flex-col md:flex-row gap-4 items-center">
                            <input 
                                className="flex-1 bg-transparent border-b-2 border-purple-400 text-xl p-2 outline-none w-full"
                                placeholder="Digite uma frase enigmática..."
                                value={phrase}
                                onChange={e => setPhrase(e.target.value)}
                            />
                            <button 
                                onClick={submitStory}
                                disabled={!selectedCard || !phrase.trim()}
                                className="bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                CONFIRMAR
                            </button>
                        </div>
                        <p className="text-center mb-4 text-slate-300">Escolha uma carta da sua mão:</p>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                            {myHand.map(id => (
                                <Card key={id} id={id} onClick={setSelectedCard} selected={selectedCard === id} />
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 1: STORY (Outros aguardam) */}
                {phase === 'STORY' && !isStoryteller && (
                    <div className="text-center mt-20 animate-pulse">
                        <MessageSquare size={48} className="mx-auto mb-4 text-purple-400"/>
                        <p className="text-xl">O Narrador está escolhendo uma carta e uma frase...</p>
                    </div>
                )}

                {/* FASE 2: SELECTION (Outros escolhem) */}
                {phase === 'SELECTION' && !isStoryteller && (
                    <div className="w-full max-w-4xl text-center">
                        <p className="text-xl mb-6">Escolha uma carta que combine com a frase!</p>
                        {tableCards.some(tc => tc.ownerId === myUserId) ? (
                            <div className="bg-green-500/20 text-green-300 p-4 rounded-xl inline-block">
                                <CheckCircle className="inline mr-2"/> Carta enviada! Aguardando os outros...
                            </div>
                        ) : (
                            <>
                                <button 
                                    onClick={selectCard}
                                    disabled={!selectedCard}
                                    className="mb-8 bg-green-600 hover:bg-green-500 px-8 py-2 rounded-xl font-bold disabled:opacity-50 transition"
                                >
                                    ENVIAR CARTA
                                </button>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                                    {myHand.map(id => (
                                        <Card key={id} id={id} onClick={setSelectedCard} selected={selectedCard === id} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* FASE 2: SELECTION (Narrador aguarda) */}
                {phase === 'SELECTION' && isStoryteller && (
                    <div className="text-center">
                        <p className="text-xl mb-4">Aguardando os jogadores escolherem...</p>
                        <div className="flex gap-2 justify-center">
                            {tableCards.map((_, i) => (
                                <div key={i} className="w-8 h-10 bg-purple-500/50 rounded animate-pulse"/>
                            ))}
                        </div>
                    </div>
                )}

                {/* FASE 3: VOTING (Todos votam) */}
                {phase === 'VOTING' && (
                    <div className="w-full max-w-5xl">
                        <p className="text-center text-xl mb-8">
                            {isStoryteller ? "Votação em andamento..." : "Qual é a carta do Narrador?"}
                        </p>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 justify-center">
                            {tableCards.map((tc) => {
                                return (
                                    <Card 
                                        key={tc.cardId} 
                                        id={tc.cardId} 
                                        onClick={!isStoryteller ? voteCard : undefined}
                                        disabled={isStoryteller} 
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* FASE 4: SCORING (Resultado) */}
                {phase === 'SCORING' && (
                    <div className="w-full max-w-5xl animate-in fade-in">
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-12">
                            {tableCards.map((tc) => {
                                const owner = players.find(p => p.userId === tc.ownerId);
                                const isNarratorCard = tc.ownerId === storytellerId;
                                const votes = Object.values(gameData.votes || {}).filter(v => v === tc.cardId).length;
                                
                                return (
                                    <div key={tc.cardId} className={`relative rounded-xl p-1 ${isNarratorCard ? 'bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.5)]' : 'bg-slate-700'}`}>
                                        <Card id={tc.cardId} disabled={true} />
                                        <div className="absolute -top-3 -right-3 bg-white text-black font-bold w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-900 shadow">
                                            {votes}
                                        </div>
                                        <div className="text-center mt-2 text-xs font-bold truncate px-1">
                                            {owner?.nickname} {isNarratorCard && "⭐"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* PLACAR GERAL */}
                        <div className="bg-slate-800 p-6 rounded-2xl max-w-2xl mx-auto">
                            <h3 className="text-center font-bold mb-4 uppercase tracking-widest text-slate-400">Placar</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                                    <div key={p.userId} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-lg">
                                        <span className="font-bold flex items-center gap-2">
                                            {i===0 && "👑"} {p.nickname}
                                        </span>
                                        <span className="font-mono font-black text-green-400">{p.score}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isHost && (
                            <div className="text-center mt-8 pb-10">
                                <button onClick={() => socket.emit('dixit_next', { roomId })} className="bg-yellow-500 text-black px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition flex items-center gap-2 mx-auto">
                                    PRÓXIMA RODADA <ArrowRight/>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}