import React, { useState, useEffect } from 'react';
import { socket } from './socket';

export default function GameMegaQuiz({ players, isHost, roomId, gameData, currentPhase }) {
    const [timer, setTimer] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [lastRoundResult, setLastRoundResult] = useState(null);

    useEffect(() => {
        const onTimer = (t) => setTimer(t);
        const onRoundEnd = (data) => setLastRoundResult(data);
        
        socket.on('megaquiz_timer', onTimer);
        socket.on('megaquiz_round_end', onRoundEnd);

        return () => {
            socket.off('megaquiz_timer', onTimer);
            socket.off('megaquiz_round_end', onRoundEnd);
        };
    }, []);

    // Limpa seleção na troca de pergunta
    useEffect(() => {
        if (currentPhase === 'QUESTION') {
            setSelectedOption(null);
            setLastRoundResult(null);
        }
    }, [currentPhase]);

    const handleAnswer = (index) => {
        if (selectedOption !== null) return;
        setSelectedOption(index);
        socket.emit('megaquiz_answer', { roomId, answerIdx: index });
    };

    // --- RENDERIZAÇÃO DA VITÓRIA (CORREÇÃO PEDIDA) ---
    if (currentPhase === 'VICTORY' || (gameData && gameData.winner)) {
        const winner = gameData.winner || players[0];
        
        return (
            <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl animate-in fade-in zoom-in duration-500">
                    <div className="text-6xl mb-4">🏆</div>
                    <h1 className="text-3xl font-black text-indigo-800 mb-2">FIM DE JOGO!</h1>
                    
                    <div className="bg-yellow-100 border-4 border-yellow-300 rounded-2xl p-6 my-6">
                        <p className="text-yellow-700 font-bold uppercase tracking-widest text-xs">Vencedor</p>
                        <p className="text-4xl font-black text-yellow-800 mt-2">{winner.nickname}</p>
                        <p className="text-yellow-600 font-bold mt-2">
                            {gameData.mode === 'SURVIVAL' ? `${winner.lives} Vidas Restantes` : `${winner.score} Pontos`}
                        </p>
                    </div>

                    {/* LISTA DE PLACARES */}
                    <div className="space-y-2 mb-8 text-left max-h-40 overflow-y-auto">
                        {players.sort((a,b) => b.score - a.score).map((p, i) => (
                            <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                <span className="font-bold text-slate-700">#{i+1} {p.nickname}</span>
                                <span className="font-mono text-slate-500">{p.score}pts</span>
                            </div>
                        ))}
                    </div>

                    {/* BOTÕES DE AÇÃO (HOST) */}
                    {isHost ? (
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => socket.emit('request_restart', { roomId })}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95"
                            >
                                JOGAR NOVAMENTE 🔄
                            </button>
                            <button 
                                onClick={() => socket.emit('return_to_lobby', { roomId })}
                                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition"
                            >
                                VOLTAR AO LOBBY 🏠
                            </button>
                        </div>
                    ) : (
                        <p className="text-indigo-400 animate-pulse font-bold">Aguardando o Host...</p>
                    )}
                </div>
            </div>
        );
    }

    // --- RENDERIZAÇÃO DO JOGO (PERGUNTAS) ---
    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
            {/* CABEÇALHO */}
            <div className="w-full max-w-4xl flex justify-between items-center bg-slate-800 p-4 rounded-2xl mb-6 shadow-lg">
                <div className="flex items-center gap-3">
                    <span className="bg-indigo-600 px-3 py-1 rounded-lg text-xs font-bold uppercase">
                        {gameData?.mode === 'SURVIVAL' ? 'Sobrevivência' : 'Batalha'}
                    </span>
                    <span className="text-slate-400 font-mono text-sm">Rodada {gameData?.round}</span>
                </div>
                {currentPhase === 'QUESTION' && (
                    <div className={`text-2xl font-black ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        ⏱ {timer}s
                    </div>
                )}
            </div>

            {/* ÁREA DA PERGUNTA */}
            <div className="w-full max-w-2xl text-center mb-8">
                {currentPhase === 'PRE_ROUND' && (
                    <div className="text-4xl font-black text-yellow-400 animate-bounce mt-20">
                        Próxima Pergunta...
                    </div>
                )}

                {(currentPhase === 'QUESTION' || currentPhase === 'RESULT') && gameData?.currentQuestion && (
                    <>
                        <div className="bg-white text-slate-900 p-6 rounded-2xl shadow-2xl mb-6 min-h-[120px] flex items-center justify-center">
                            <h2 className="text-2xl md:text-3xl font-bold">{gameData.currentQuestion.question}</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {gameData.currentQuestion.options.map((opt, idx) => {
                                // Lógica de cores para o Resultado
                                let btnColor = "bg-slate-700 hover:bg-slate-600";
                                if (currentPhase === 'RESULT' && lastRoundResult) {
                                    if (idx === lastRoundResult.correctAnswer) btnColor = "bg-green-500 ring-4 ring-green-300";
                                    else if (idx === selectedOption) btnColor = "bg-red-500 opacity-50";
                                    else btnColor = "bg-slate-800 opacity-30";
                                } else if (selectedOption === idx) {
                                    btnColor = "bg-indigo-600 ring-2 ring-indigo-400";
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleAnswer(idx)}
                                        disabled={currentPhase !== 'QUESTION' || selectedOption !== null}
                                        className={`p-6 rounded-xl text-lg font-bold transition-all transform duration-200 ${btnColor} ${selectedOption === null ? 'hover:scale-105' : ''}`}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                
                {/* FEEDBACK DO RESULTADO */}
                {currentPhase === 'RESULT' && lastRoundResult && (
                    <div className="mt-8 p-4 bg-black/30 rounded-xl backdrop-blur-sm border border-white/10">
                        <h3 className="text-xl font-bold mb-2 text-indigo-300">Resumo da Rodada</h3>
                        {lastRoundResult.logs && lastRoundResult.logs.map((log, i) => (
                            <p key={i} className="text-sm text-slate-300">{log}</p>
                        ))}
                    </div>
                )}
            </div>

            {/* RODAPÉ: JOGADORES */}
            <div className="fixed bottom-0 left-0 w-full bg-slate-800 p-4 flex gap-4 overflow-x-auto justify-center">
                {players.map(p => (
                    <div key={p.id} className={`flex flex-col items-center min-w-[60px] ${p.lives === 0 ? 'opacity-40 grayscale' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center font-bold mb-1 border-2 border-slate-500 relative">
                            {p.nickname[0]}
                            {/* Indicador se respondeu */}
                            {currentPhase === 'QUESTION' && gameData.answers && gameData.answers[p.id] !== undefined && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white"></div>
                            )}
                        </div>
                        <span className="text-xs font-bold truncate max-w-[80px]">{p.nickname}</span>
                        <div className="text-[10px] text-yellow-400 font-mono">
                            {gameData?.mode === 'SURVIVAL' 
                                ? '❤️'.repeat(Math.max(0, p.lives)) 
                                : `${p.score}pts`
                            }
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}