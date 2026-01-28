import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { Clock, Film, Trophy, Home, SkipForward, LogOut } from 'lucide-react';

export default function GameCinemoji() {
    const { socket, roomId, isHost, sairDoJogo, gameData, players, currentPhase } = useGame();

    const [guess, setGuess] = useState('');
    const [timer, setTimer] = useState(60);
    const [feedback, setFeedback] = useState('');
    const [localPhase, setLocalPhase] = useState('LOBBY');

    // Estados do Jogo
    const [emojis, setEmojis] = useState('');
    const [hint, setHint] = useState(null);
    const [round, setRound] = useState(0);
    const [roundWinners, setRoundWinners] = useState([]);
    const [revealTitle, setRevealTitle] = useState('');

    // --- 1. ESCUTAR DADOS DO SERVIDOR ---
    useEffect(() => {
        if (gameData) {
            if (gameData.emojis) setEmojis(gameData.emojis);
            
            // --- CORREÇÃO AQUI ---
            // Removemos o "if (gameData.hint)" para forçar a atualização mesmo se for null
            setHint(gameData.hint || null); 

            if (gameData.round) setRound(gameData.round);
            if (gameData.winners) setRoundWinners(gameData.winners);
            
            if (gameData.title) setRevealTitle(gameData.title);
            else setRevealTitle('');
        }
        
        if (currentPhase) setLocalPhase(currentPhase);

    }, [gameData, currentPhase]);

    // --- 2. ESCUTAR EVENTOS DE TEMPO REAL ---
    useEffect(() => {
        socket.on('cinemoji_timer', (t) => setTimer(t));
        
        socket.on('cinemoji_hint', (h) => {
            setHint(h);
            setFeedback('💡 DICA LIBERADA!');
            setTimeout(() => setFeedback(''), 2000);
        });

        socket.on('cinemoji_close', (msg) => {
            setFeedback(`🔥 ${msg}`);
            setTimeout(() => setFeedback(''), 1500);
        });

        socket.on('cinemoji_wrong', () => {
            const el = document.getElementById('guess-input');
            if(el) {
                el.classList.add('animate-shake');
                setTimeout(() => el.classList.remove('animate-shake'), 500);
            }
        });

        socket.on('receive_message', (msg) => {
            if (msg.nickname === 'SISTEMA') {
                setFeedback(msg.text);
                setTimeout(() => setFeedback(''), 3000);
            }
        });

        return () => {
            socket.off('cinemoji_timer');
            socket.off('cinemoji_hint');
            socket.off('cinemoji_close');
            socket.off('cinemoji_wrong');
            socket.off('receive_message');
        };
    }, [socket]);

    const handleGuess = (e) => {
        e.preventDefault();
        if (!guess.trim()) return;
        socket.emit('cinemoji_guess', { roomId, guess });
        setGuess('');
    };

    // --- RENDERIZAÇÃO ---

    // 1. TELA DE GAME OVER GLOBAL
    if (localPhase === 'GAME_OVER') {
        return (
            <div className="min-h-screen bg-indigo-950 flex flex-col items-center justify-center p-4 text-white">
                <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
                <h1 className="text-4xl font-bold mb-8">FIM DE JOGO!</h1>
                <div className="bg-indigo-900/50 p-6 rounded-2xl w-full max-w-md border border-indigo-700">
                    {players.sort((a,b) => b.score - a.score).map((p, i) => (
                        <div key={i} className="flex justify-between items-center p-3 border-b border-indigo-800 last:border-0">
                            <span className="font-bold text-lg flex items-center gap-2">
                                {i===0 && '🥇'} {p.nickname}
                            </span>
                            <span className="font-mono text-yellow-300 text-xl">{p.score} pts</span>
                        </div>
                    ))}
                </div>
                <div className="mt-8 flex gap-4">
                    {isHost && (
                         <button onClick={() => socket.emit('start_game')} className="bg-green-600 px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-500 transition">
                            JOGAR NOVAMENTE
                        </button>
                    )}
                    <button onClick={sairDoJogo} className="bg-red-600 px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-red-500 transition flex items-center gap-2">
                        <Home size={20}/> SAIR
                    </button>
                </div>
            </div>
        );
    }

    // 2. TELA DE REVELAÇÃO (ENTRE RODADAS)
    if (localPhase === 'REVEAL') {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center animate-in zoom-in">
                <h2 className="text-2xl text-indigo-300 mb-4 font-bold uppercase tracking-widest">A resposta era:</h2>
                <div className="bg-white text-indigo-900 text-4xl md:text-6xl font-black p-8 rounded-3xl shadow-2xl mb-8 transform rotate-1">
                    {revealTitle}
                </div>
                <div className="flex items-center gap-2 text-indigo-300">
                    <Clock size={20} className="animate-spin"/>
                    <span>Próxima rodada em instantes...</span>
                </div>
            </div>
        );
    }

    // 3. TELA DE JOGO (GUESSING)
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 text-white flex flex-col">
            {/* Header */}
            <div className="p-4 flex justify-between items-center bg-black/20 backdrop-blur-sm border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg"><Film size={24}/></div>
                    <div>
                        <h1 className="font-bold leading-none">CINEMOJI</h1>
                        <p className="text-xs text-indigo-300 font-mono">RODADA {round}</p>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold text-xl ${timer < 10 ? 'bg-red-500/80 animate-pulse' : 'bg-black/40'}`}>
                    <Clock size={20}/> {timer}s
                </div>
                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition"><LogOut size={20}/></button>
            </div>

            {/* Área Principal */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-4xl mx-auto">
                
                {/* Feedback Flutuante */}
                {feedback && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-6 py-2 rounded-full font-bold shadow-xl animate-bounce z-50">
                        {feedback}
                    </div>
                )}

                {/* Emojis Gigantes */}
                <div className="bg-white/10 backdrop-blur-md w-full p-8 md:p-12 rounded-3xl shadow-2xl border border-white/20 text-center mb-8 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:animate-shine"/>
                    <div className="text-5xl md:text-7xl lg:text-8xl tracking-widest leading-relaxed select-none filter drop-shadow-lg animate-in zoom-in duration-500">
                        {emojis || "🎬🍿"}
                    </div>
                </div>

                {/* Dica */}
                <div className="h-12 mb-8">
                    {hint ? (
                        <div className="bg-indigo-800/80 px-6 py-2 rounded-xl text-indigo-200 font-mono text-lg md:text-2xl tracking-[0.3em] shadow-inner border border-white/5 animate-in fade-in slide-in-from-bottom-4">
                            {hint}
                        </div>
                    ) : (
                        <div className="text-indigo-400/50 text-sm flex items-center gap-2 animate-pulse">
                            <Clock size={14}/> Dica em {Math.max(0, timer - 30)}s
                        </div>
                    )}
                </div>

                {/* Input */}
                <form onSubmit={handleGuess} className="w-full max-w-xl relative group">
                    <input
                        id="guess-input"
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        placeholder="Qual é o nome do filme?"
                        className="w-full bg-indigo-950/80 border-2 border-indigo-500/50 focus:border-yellow-400 text-white placeholder-indigo-400/50 rounded-2xl py-4 pl-6 pr-16 text-xl font-bold shadow-xl focus:outline-none focus:ring-4 focus:ring-yellow-400/20 transition-all"
                        autoComplete="off"
                        autoFocus
                    />
                    <button 
                        type="submit"
                        className="absolute right-2 top-2 bottom-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-900 p-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <SkipForward size={24}/>
                    </button>
                </form>
            </div>

            {/* Placar Rápido */}
            <div className="bg-black/40 backdrop-blur-md p-4 border-t border-white/10">
                <div className="max-w-4xl mx-auto flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {players.sort((a,b) => b.score - a.score).map((p) => {
                        const acertou = roundWinners.includes(p.nickname);
                        return (
                            <div key={p.socketId} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border ${acertou ? 'bg-green-600/20 border-green-500 text-green-200' : 'bg-white/5 border-white/10 text-indigo-200'}`}>
                                <div className={`w-2 h-2 rounded-full ${p.isOnline ? 'bg-green-400' : 'bg-red-400'}`}/>
                                <span className="font-bold text-sm">{p.nickname}</span>
                                <span className="font-mono font-black">{p.score}</span>
                                {acertou && <span className="animate-bounce">✅</span>}
                            </div>
                        )
                    })}
                </div>
            </div>

            <style>{`
                @keyframes shine { 100% { transform: translateX(100%); } }
                .animate-shine { animation: shine 1.5s infinite; }
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
            `}</style>
        </div>
    );
}