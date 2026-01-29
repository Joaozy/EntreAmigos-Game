import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket';
import { ThumbsUp, ThumbsDown, HelpCircle, AlertCircle, LogOut, CheckCircle, XCircle, Send, MessageCircle, Crown, Users } from 'lucide-react';

export default function GameWhoAmI() {
    const { roomId, gameData, players, user, sairDoJogo } = useGame();
    const myUserId = user?.id;

    const [inputText, setInputText] = useState("");
    const [actionTab, setActionTab] = useState('ASK'); 

    if (!gameData || !players || !user) return <div className="text-white text-center p-10">Carregando...</div>;

    const { currentPlayerId, currentAction, assignments, surrendered, finished, questionLog, phase, currentVotes } = gameData;
    
    const isMyTurn = myUserId === currentPlayerId;
    const iAmFinished = finished.includes(myUserId);
    const iSurrendered = surrendered.includes(myUserId);
    const iHaveVoted = currentVotes && currentVotes[myUserId] !== undefined;
    const currentPlayerName = players.find(p => p.userId === currentPlayerId)?.nickname || "Alguém";

    // Contagem de votos para feedback visual
    const activeVotersCount = players.filter(p => 
        p.userId !== currentPlayerId && 
        !finished.includes(p.userId) && 
        !surrendered.includes(p.userId)
    ).length;
    const currentVotesCount = Object.keys(currentVotes || {}).length;

    // --- AÇÕES ---
    const sendAction = () => {
        if (!inputText.trim()) return;
        if (actionTab === 'ASK') {
            socket.emit('whoami_ask', { roomId, question: inputText });
        } else {
            if (confirm(`Tem certeza que você é "${inputText}"? Se errar, perde a vez!`)) {
                socket.emit('whoami_guess_attempt', { roomId, guess: inputText });
            }
        }
        setInputText("");
    };

    const handleAnswer = (answer) => { 
        socket.emit('whoami_answer', { roomId, answer });
    };

    const handleValidation = (isCorrect) => {
        socket.emit('whoami_validate_guess', { roomId, isCorrect });
    };

    const handleGiveUp = () => {
        if (confirm("Desistir revela sua carta e te remove do jogo. Confirmar?")) {
            socket.emit('whoami_give_up', { roomId });
        }
    };

    // --- FIM DE JOGO ---
    if (phase === 'GAME_OVER') {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 text-center">
                <Crown size={64} className="text-yellow-400 mb-4 animate-bounce"/>
                <h1 className="text-4xl font-black mb-2">FIM DE JOGO!</h1>
                <div className="grid gap-2 w-full max-w-md mt-8">
                    {players.map(p => (
                        <div key={p.userId} className="bg-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="font-bold">{p.nickname}</span>
                            <span className="text-yellow-400 font-mono font-bold">{assignments[p.userId]}</span>
                        </div>
                    ))}
                </div>
                <button onClick={sairDoJogo} className="mt-8 bg-slate-700 px-6 py-3 rounded-xl font-bold">Voltar ao Lobby</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center font-sans">
            
            {/* HEADER */}
            <div className="w-full max-w-lg flex justify-between items-center bg-slate-800 p-4 rounded-2xl mb-6 shadow-lg border border-slate-700 sticky top-0 z-50">
                <div>
                    <h1 className="text-xl font-black text-pink-500 uppercase tracking-widest">Quem Sou Eu?</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">
                        Vez de: <span className="text-white">{currentPlayerName}</span>
                    </p>
                </div>
                <button onClick={sairDoJogo}><LogOut className="text-slate-500 hover:text-red-400"/></button>
            </div>

            <div className="w-full max-w-md space-y-4 pb-20">
                
                {/* --- ÁREA DE INTERAÇÃO --- */}
                
                {/* ESPECTADOR */}
                {(iAmFinished || iSurrendered) && (
                    <div className="p-6 rounded-2xl text-center bg-slate-800/50 border border-slate-700">
                        {iAmFinished ? <span className="font-bold text-green-400">VOCÊ VENCEU!</span> : <span className="font-bold text-red-400">VOCÊ DESISTIU</span>}
                        <p className="text-slate-500 text-sm mt-2">Ajude a responder (se permitido) ou apenas assista.</p>
                    </div>
                )}

                {/* MINHA VEZ (DECIDINDO) */}
                {isMyTurn && currentAction === 'DECIDING' && (
                    <div className="bg-pink-600 p-6 rounded-2xl shadow-xl ring-4 ring-pink-400/30">
                        <div className="flex justify-center gap-4 mb-4 border-b border-pink-500/50 pb-2">
                            <button onClick={() => setActionTab('ASK')} className={`font-bold pb-2 ${actionTab === 'ASK' ? 'text-white border-b-2 border-white' : 'text-pink-300'}`}>PERGUNTAR</button>
                            <button onClick={() => setActionTab('GUESS')} className={`font-bold pb-2 ${actionTab === 'GUESS' ? 'text-white border-b-2 border-white' : 'text-pink-300'}`}>CHUTAR</button>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                className="flex-1 bg-pink-800 text-white placeholder:text-pink-300 px-4 py-2 rounded-lg outline-none border border-pink-500 focus:border-white"
                                placeholder={actionTab === 'ASK' ? "Ex: Sou real?" : "Ex: Sou o Batman?"}
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendAction()}
                            />
                            <button onClick={sendAction} className="bg-white text-pink-600 p-2 rounded-lg font-bold hover:bg-pink-100 transition shadow-lg">
                                <Send size={20}/>
                            </button>
                        </div>
                    </div>
                )}

                {/* AGUARDANDO (PARA JOGADOR DA VEZ) */}
                {isMyTurn && (currentAction === 'WAITING_ANSWER' || currentAction === 'WAITING_VALIDATION') && (
                    <div className="p-6 rounded-2xl text-center bg-slate-800 border border-slate-700 animate-pulse">
                        <p className="text-slate-300 font-bold mb-2">Aguardando respostas...</p>
                        <div className="flex justify-center items-center gap-2 text-sm text-slate-500">
                            <Users size={16}/> {currentVotesCount} / {activeVotersCount} Votaram
                        </div>
                    </div>
                )}

                {/* VEZ DO OUTRO (PERGUNTOU - RESPONDA) */}
                {!isMyTurn && currentAction === 'WAITING_ANSWER' && (
                    <div className="p-6 rounded-2xl text-center bg-slate-800 border border-slate-700 shadow-lg">
                        <h2 className="text-lg font-bold text-white mb-1">{currentPlayerName} perguntou:</h2>
                        <div className="bg-black/30 p-2 rounded-lg mb-4 text-pink-300 italic">"{questionLog[0]?.text}"</div>
                        
                        {!iHaveVoted ? (
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => handleAnswer('YES')} className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-xl font-bold flex flex-col items-center">
                                    <ThumbsUp size={20}/><span className="text-[10px]">SIM</span>
                                </button>
                                <button onClick={() => handleAnswer('NO')} className="bg-red-600 hover:bg-red-500 text-white p-3 rounded-xl font-bold flex flex-col items-center">
                                    <ThumbsDown size={20}/><span className="text-[10px]">NÃO</span>
                                </button>
                                <button onClick={() => handleAnswer('MAYBE')} className="bg-slate-600 hover:bg-slate-500 text-white p-3 rounded-xl font-bold flex flex-col items-center">
                                    <HelpCircle size={20}/><span className="text-[10px]">TALVEZ</span>
                                </button>
                            </div>
                        ) : (
                            <div className="text-slate-400 bg-slate-900/50 p-4 rounded-xl">
                                <p className="font-bold mb-1 text-white">Voto Registrado!</p>
                                <p className="text-xs">Aguardando os outros ({currentVotesCount}/{activeVotersCount})...</p>
                            </div>
                        )}
                    </div>
                )}

                {/* VEZ DO OUTRO (CHUTOU - VALIDE) */}
                {!isMyTurn && currentAction === 'WAITING_VALIDATION' && (
                    <div className="p-6 rounded-2xl text-center bg-yellow-900/40 border border-yellow-600 shadow-lg">
                        <h2 className="text-lg font-bold text-yellow-200 mb-1">{currentPlayerName} CHUTOU:</h2>
                        <div className="bg-black/30 p-3 rounded-lg mb-4 text-white text-xl font-black">"{questionLog[0]?.text.replace('CHUTOU: ', '')}"</div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleValidation(true)} className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-xl font-bold flex flex-col items-center">
                                <CheckCircle size={24}/> ACERTOU!
                            </button>
                            <button onClick={() => handleValidation(false)} className="bg-red-600 hover:bg-red-500 text-white p-3 rounded-xl font-bold flex flex-col items-center">
                                <XCircle size={24}/> ERROU
                            </button>
                        </div>
                    </div>
                )}

                {/* VEZ DO OUTRO (DECIDINDO) */}
                {!isMyTurn && currentAction === 'DECIDING' && (
                    <div className="p-6 rounded-2xl text-center bg-slate-800 border border-slate-700 opacity-70">
                        <p className="text-slate-400">{currentPlayerName} está pensando...</p>
                    </div>
                )}

                {/* --- MINHA CARTA --- */}
                <div className={`p-4 rounded-xl border-2 border-dashed text-center relative transition-colors ${iSurrendered ? 'bg-slate-800 border-red-500' : 'bg-slate-800/50 border-slate-600'}`}>
                    <p className="text-xs text-slate-400 uppercase font-bold mb-2">Você é:</p>
                    <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 py-2">
                        {assignments[myUserId] === "???" ? "???" : assignments[myUserId]}
                    </div>
                    {!iSurrendered && !iAmFinished && (
                        <button onClick={handleGiveUp} className="text-[10px] text-red-400 hover:text-red-300 underline mt-2 uppercase font-bold">
                            Desistir desta partida
                        </button>
                    )}
                </div>

                {/* --- HISTÓRICO --- */}
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 max-h-48 overflow-y-auto custom-scrollbar flex flex-col-reverse">
                    <div className="space-y-2">
                        {questionLog.map((log, i) => (
                            <div key={i} className={`text-sm p-2 rounded-lg border flex items-start gap-2 ${log.type === 'ANSWER_SUMMARY' ? 'bg-slate-700 border-slate-500' : log.type === 'SYSTEM' ? 'bg-yellow-900/20 border-yellow-700/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
                                <div className={`min-w-[20px] h-5 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${log.variant === 'YES' ? 'bg-green-500' : log.variant === 'NO' ? 'bg-red-500' : 'bg-slate-600'}`}>
                                    {log.type === 'QUESTION' ? 'Q' : log.type === 'ANSWER_SUMMARY' ? 'R' : ''}
                                </div>
                                <div>
                                    <p className="font-bold text-[10px] text-pink-400">{log.nickname}</p>
                                    <p className={`leading-tight ${log.variant === 'NO' ? 'text-red-300' : log.variant === 'YES' ? 'text-green-300' : 'text-slate-300'}`}>{log.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <h3 className="text-xs text-slate-400 uppercase font-bold mb-3 flex items-center gap-2 sticky top-0 bg-slate-800 pb-2 z-10 border-b border-slate-700"><MessageCircle size={14}/> Log</h3>
                </div>

                {/* --- JOGADORES --- */}
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                    <div className="space-y-2">
                        {players.map(p => (
                            <div key={p.userId} className={`flex justify-between items-center p-2 rounded-lg ${p.userId === currentPlayerId ? 'bg-pink-900/20 border border-pink-500/30' : ''}`}>
                                <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${p.userId === currentPlayerId ? 'bg-pink-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{p.nickname[0]}</div>
                                    <span className={`text-sm ${p.userId === currentPlayerId ? 'text-pink-400 font-bold' : 'text-slate-300'}`}>{p.nickname}</span>
                                </div>
                                <span className="font-mono font-bold text-yellow-400 text-xs">{assignments[p.userId] || "..."}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}