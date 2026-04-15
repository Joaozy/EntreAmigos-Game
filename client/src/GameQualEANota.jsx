import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { Home, LogOut, Loader2, Star, Target, Send, ChevronRight, Trophy } from 'lucide-react';

export default function GameQualEANota() {
    const { socket, user, players, isHost, roomId, gameData, currentPhase: phase, sairDoJogo } = useGame();
    
    // Estados Locais
    const [mySecretRating, setMySecretRating] = useState(null);
    const [qInputs, setQInputs] = useState(['', '']);
    const [aInputs, setAInputs] = useState(['', '']);
    
    useEffect(() => {
        if (phase) socket.emit('quale_load_state');
    }, [phase, socket]);

    useEffect(() => {
        // Se eu sou o narrador, descubro minha nota através de um event oculto se quisessemos,
        // MAS como getPublicData não envia, precisamos pegar do server de forma segura.
        // Na verdade, adicionei a nota secreta no publicData SOMENTE para o narrator na função segura? Não, esqueci!
        // Correção rápida: vamos mandar o servidor nos dar a nossa nota.
        socket.on('quale_my_secret', (rating) => setMySecretRating(rating));
        
        // Pede a nota toda vez que muda de rodada
        if (gameData?.narratorId === user?.id && phase === 'ASKING') {
            socket.emit('quale_request_secret'); 
        }

        return () => socket.off('quale_my_secret');
    }, [gameData?.round, phase, gameData?.narratorId, user?.id, socket]);

    if (!gameData || !gameData.round) {
        return <LoadingScreen sairDoJogo={sairDoJogo} isHost={isHost} roomId={roomId} socket={socket} />;
    }

    const isNarrator = gameData.narratorId === user?.id;
    const getNick = (uid) => players.find(p => p.userId === uid)?.nickname || 'Alguém';

    // AÇÕES
    const submitQuestion = (index) => {
        if (qInputs[index].trim()) {
            socket.emit('quale_submit_question', { questionIndex: index, questionText: qInputs[index] });
        }
    };

    const submitAnswers = (e) => {
        e.preventDefault();
        if (aInputs[0].trim() && aInputs[1].trim()) {
            socket.emit('quale_submit_answer', { answers: aInputs });
            setAInputs(['', '']); // Limpa
        }
    };

    const submitGuess = (nota) => {
        socket.emit('quale_submit_guess', { guess: nota });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4 relative">
            {/* Nav Fixa */}
            <div className="fixed top-4 right-4 z-50 flex gap-2">
                {isHost && (
                    <button onClick={() => socket.emit('return_to_lobby', { roomId })} className="bg-slate-800/80 p-2 rounded-full hover:bg-slate-700 border border-slate-600">
                        <Home size={20} />
                    </button>
                )}
                <button onClick={sairDoJogo} className="bg-red-900/80 p-2 rounded-full hover:bg-red-800 border border-red-700">
                    <LogOut size={20} />
                </button>
            </div>

            {/* Cabeçalho */}
            <div className="w-full max-w-3xl flex justify-between items-center mt-12 mb-6 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
                <div className="flex items-center gap-2">
                    <Star className="text-yellow-400" size={28} />
                    <h1 className="text-2xl font-black tracking-widest text-yellow-400 uppercase">Qual é a Nota?</h1>
                </div>
                <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Rodada</span>
                    <p className="text-xl font-mono font-bold">{gameData.round}</p>
                </div>
            </div>

            <div className="w-full max-w-3xl flex-1 flex flex-col items-center">
                
                {/* AVISO DE QUEM É O NARRADOR */}
                {phase !== 'END' && (
                    <div className="mb-6 px-6 py-2 bg-slate-800 rounded-full border border-slate-600">
                        <p className="text-sm text-slate-300 font-bold">
                            O avaliador da vez é: <span className="text-yellow-400 uppercase">{getNick(gameData.narratorId)}</span>
                        </p>
                    </div>
                )}

                {/* NOTA SECRETA (SÓ PRO NARRADOR) */}
                {isNarrator && phase !== 'REVEAL' && phase !== 'END' && mySecretRating && (
                    <div className="mb-8 p-6 bg-yellow-900/30 border-2 border-yellow-500/50 rounded-2xl text-center animate-in zoom-in">
                        <p className="text-xs uppercase font-bold text-yellow-500 mb-1">SUA NOTA SECRETA É</p>
                        <h2 className="text-6xl font-black text-yellow-400">{mySecretRating}</h2>
                    </div>
                )}

                {/* FASE 1: PERGUNTAS */}
                {phase === 'ASKING' && (
                    <div className="w-full space-y-4 animate-in slide-in-from-bottom-4">
                        <h2 className="text-center text-xl font-bold mb-6">Fase de Perguntas</h2>
                        
                        {gameData.questions.map((q, idx) => {
                            const amIAsker = q.askerId === user?.id;
                            const isAnswered = q.question !== null;

                            return (
                                <div key={idx} className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-2">
                                        Pergunta {idx + 1} (por {getNick(q.askerId)})
                                    </p>
                                    
                                    {isAnswered ? (
                                        <p className="text-lg font-bold text-emerald-400">"{q.question}"</p>
                                    ) : amIAsker ? (
                                        <div className="flex gap-2">
                                            <input 
                                                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 outline-none focus:border-yellow-500"
                                                placeholder="Ex: Que estilo musical é essa nota?"
                                                value={qInputs[idx]}
                                                onChange={e => {
                                                    const newInp = [...qInputs];
                                                    newInp[idx] = e.target.value;
                                                    setQInputs(newInp);
                                                }}
                                            />
                                            <button onClick={() => submitQuestion(idx)} className="bg-yellow-600 p-3 rounded-xl hover:bg-yellow-500 font-bold"><Send size={20}/></button>
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 italic flex items-center gap-2"><Loader2 size={16} className="animate-spin"/> Aguardando a pergunta...</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* FASE 2: RESPOSTAS DO NARRADOR */}
                {phase === 'ANSWERING' && (
                    <div className="w-full animate-in slide-in-from-bottom-4">
                        <h2 className="text-center text-xl font-bold mb-6 text-yellow-400">Hora de Responder</h2>
                        
                        {isNarrator ? (
                            <form onSubmit={submitAnswers} className="space-y-4">
                                {gameData.questions.map((q, idx) => (
                                    <div key={idx} className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                                        <p className="text-slate-300 font-bold mb-3">"{q.question}"</p>
                                        <input 
                                            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 outline-none focus:border-yellow-500"
                                            placeholder="Sua resposta baseada na nota..."
                                            value={aInputs[idx]}
                                            onChange={e => {
                                                const newA = [...aInputs];
                                                newA[idx] = e.target.value;
                                                setAInputs(newA);
                                            }}
                                            required
                                        />
                                    </div>
                                ))}
                                <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 py-4 rounded-xl font-black text-lg mt-4 shadow-lg">
                                    ENVIAR RESPOSTAS
                                </button>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                {gameData.questions.map((q, idx) => (
                                    <div key={idx} className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                                        <p className="text-slate-300 font-bold">"{q.question}"</p>
                                    </div>
                                ))}
                                <div className="text-center mt-8 text-slate-400">
                                    <Loader2 size={32} className="animate-spin mx-auto mb-2"/>
                                    <p className="font-bold">Aguardando {getNick(gameData.narratorId)} avaliar e responder...</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 3: CHUTES */}
                {phase === 'GUESSING' && (
                    <div className="w-full animate-in zoom-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {gameData.questions.map((q, idx) => (
                                <div key={idx} className="bg-slate-800 p-5 rounded-2xl border border-slate-600">
                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">Pergunta:</p>
                                    <p className="text-sm font-bold mb-3 text-slate-200">"{q.question}"</p>
                                    <p className="text-xs text-yellow-500 uppercase font-bold mb-1">Resposta ({getNick(gameData.narratorId)}):</p>
                                    <p className="text-xl font-black text-white">"{q.answer}"</p>
                                </div>
                            ))}
                        </div>

                        {isNarrator ? (
                            <div className="text-center text-slate-400 p-6 bg-slate-800 rounded-2xl">
                                <Loader2 size={32} className="animate-spin mx-auto mb-2"/>
                                <p className="font-bold">Sua nota é {mySecretRating}. Aguardando os palpites da galera...</p>
                            </div>
                        ) : gameData.guesses?.[user?.id] ? (
                            <div className="text-center text-emerald-400 p-6 bg-slate-800 rounded-2xl border border-emerald-500/30">
                                <Target size={32} className="mx-auto mb-2"/>
                                <p className="font-bold text-lg">Palpite Registrado!</p>
                                <p className="text-sm text-slate-400">Aguardando os outros...</p>
                            </div>
                        ) : (
                            <div className="bg-slate-800 p-6 rounded-3xl border border-yellow-500/30 shadow-xl text-center">
                                <h3 className="text-xl font-black mb-4">Qual é a Nota Secreta?</h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {[1,2,3,4,5,6,7,8,9,10].map(nota => (
                                        <button 
                                            key={nota}
                                            onClick={() => submitGuess(nota)}
                                            className="w-14 h-14 bg-slate-700 hover:bg-yellow-500 hover:text-slate-900 border-2 border-slate-600 hover:border-yellow-400 text-xl font-black rounded-xl transition-all"
                                        >
                                            {nota}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* FASE 4: RESULTADO */}
                {phase === 'REVEAL' && (
                    <div className="w-full flex flex-col items-center animate-in zoom-in duration-500">
                        <p className="text-slate-400 font-bold uppercase tracking-widest mb-2">A nota de {getNick(gameData.narratorId)} era...</p>
                        <h1 className="text-8xl font-black text-yellow-400 mb-8 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">
                            {gameData.secretRating}
                        </h1>

                        <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border border-slate-700 mb-8">
                            <h3 className="font-bold text-center mb-4">Palpites da Galera</h3>
                            <div className="space-y-2">
                                {Object.entries(gameData.guesses || {}).map(([uid, guess]) => {
                                    const acertou = parseInt(guess) === gameData.secretRating;
                                    return (
                                        <div key={uid} className={`flex justify-between p-3 rounded-xl border ${acertou ? 'bg-emerald-900/40 border-emerald-500' : 'bg-slate-900 border-slate-700'}`}>
                                            <span className="font-bold">{getNick(uid)}</span>
                                            <div className="flex gap-4">
                                                <span className="text-slate-400">chutou</span>
                                                <span className={`font-black text-xl leading-none ${acertou ? 'text-emerald-400' : 'text-white'}`}>{guess}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {isHost && (
                            <button onClick={() => socket.emit('quale_next_round')} className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 font-black py-4 px-10 rounded-full shadow-lg transition flex items-center gap-2">
                                PRÓXIMA RODADA <ChevronRight size={20} />
                            </button>
                        )}
                    </div>
                )}

                {/* FASE 5: FIM DE JOGO */}
                {phase === 'END' && (
                    <div className="w-full flex flex-col items-center text-center animate-in slide-in-from-bottom-8">
                        <Trophy size={64} className="text-yellow-400 mb-4" />
                        <h1 className="text-4xl font-black text-white mb-2">FIM DE JOGO</h1>
                        <p className="text-slate-400 mb-8">Todos já foram os avaliadores!</p>

                        <div className="w-full max-w-sm bg-slate-800 p-6 rounded-3xl border border-yellow-500/30 shadow-xl">
                            <h2 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2">Placar Final</h2>
                            <div className="space-y-3">
                                {players.sort((a,b) => (gameData.scores[b.userId] || 0) - (gameData.scores[a.userId] || 0)).map((p, idx) => (
                                    <div key={p.userId} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl">
                                        <span className="font-bold text-lg">{idx + 1}. {p.nickname}</span>
                                        <span className="font-black text-yellow-400 text-xl">{gameData.scores[p.userId] || 0} pts</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isHost && (
                            <button onClick={() => socket.emit('return_to_lobby', { roomId })} className="mt-8 bg-slate-700 hover:bg-slate-600 py-3 px-8 rounded-full font-bold transition">
                                Voltar ao Saguão
                            </button>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

// Subcomponente de Tela de Carregamento
function LoadingScreen({ sairDoJogo, isHost, roomId, socket }) {
    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white relative">
            <div className="fixed top-4 right-4 z-50 flex gap-2">
                {isHost && <button onClick={() => socket.emit('return_to_lobby', { roomId })} className="bg-slate-800 p-2 rounded-full"><Home size={20}/></button>}
                <button onClick={sairDoJogo} className="bg-red-900 p-2 rounded-full"><LogOut size={20}/></button>
            </div>
            <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
            <p className="font-bold text-lg">Preparando as pranchetas...</p>
        </div>
    );
}