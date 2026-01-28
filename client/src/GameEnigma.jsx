import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { socket } from './socket';
import { HelpCircle, Key, ArrowRight, Trophy, LogOut } from 'lucide-react';

export default function GameEnigma() {
    const { roomId, isHost, gameData, players, currentPhase, sairDoJogo } = useGame();
    const [guess, setGuess] = useState('');
    const [shake, setShake] = useState(false);

    // Feedback de erro vindo do servidor
    React.useEffect(() => {
        socket.on('enigma_wrong', () => {
            setShake(true);
            setTimeout(() => setShake(false), 500);
        });
        return () => socket.off('enigma_wrong');
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if(guess.trim()) {
            socket.emit('enigma_guess', { roomId, guess });
            setGuess('');
        }
    };

    if (currentPhase === 'GAME_OVER') {
        const winner = players.sort((a,b) => b.score - a.score)[0];
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
                <Trophy size={64} className="text-yellow-400 mb-4 animate-bounce"/>
                <h1 className="text-3xl font-bold mb-2">FIM DOS ENIGMAS</h1>
                <p className="text-xl">Vencedor: <span className="text-green-400 font-bold">{winner?.nickname}</span></p>
                <button onClick={sairDoJogo} className="mt-8 bg-slate-700 px-6 py-3 rounded-xl font-bold">Voltar ao Lobby</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-10 left-10 text-6xl rotate-12">?</div>
                <div className="absolute bottom-20 right-20 text-8xl -rotate-12">?</div>
            </div>

            {/* Header */}
            <div className="w-full max-w-2xl flex justify-between items-center mb-12 z-10">
                <div className="flex items-center gap-2">
                    <Key className="text-yellow-500"/>
                    <h1 className="font-bold text-xl tracking-widest">ENIGMA</h1>
                </div>
                <div className="bg-slate-800 px-4 py-1 rounded-full text-xs font-bold border border-slate-700">
                    RODADA {gameData?.round}
                </div>
                <button onClick={sairDoJogo}><LogOut className="text-slate-500 hover:text-red-400"/></button>
            </div>

            {/* Card Principal */}
            <div className="w-full max-w-2xl bg-slate-800/50 backdrop-blur-md border border-slate-700 p-8 rounded-3xl shadow-2xl z-10 animate-in zoom-in">
                
                <div className="flex justify-center mb-6">
                    <div className="bg-yellow-500/20 p-4 rounded-full">
                        <HelpCircle size={48} className="text-yellow-500"/>
                    </div>
                </div>

                {/* Pergunta */}
                <h2 className="text-2xl md:text-3xl font-serif text-center font-bold leading-relaxed mb-8">
                    "{gameData?.currentRiddle?.question}"
                </h2>

                {/* Área de Resposta ou Revelação */}
                {currentPhase === 'PLAYING' ? (
                    <form onSubmit={handleSubmit} className={`relative ${shake ? 'animate-shake' : ''}`}>
                        <input 
                            className="w-full bg-slate-900 border-2 border-slate-600 focus:border-yellow-500 rounded-xl py-4 px-6 text-xl text-center font-bold outline-none transition-all shadow-inner"
                            placeholder="Qual é a resposta?"
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="absolute right-2 top-2 bottom-2 bg-yellow-500 hover:bg-yellow-400 text-black p-3 rounded-lg font-bold transition">
                            <ArrowRight/>
                        </button>
                    </form>
                ) : (
                    <div className="text-center animate-in slide-in-from-bottom">
                        <div className="text-sm text-slate-400 uppercase font-bold mb-2">Resposta</div>
                        <div className="text-3xl font-black text-green-400 mb-6 uppercase tracking-wider">
                            {gameData?.currentRiddle?.answer}
                        </div>
                        
                        <div className="bg-green-900/30 text-green-200 px-4 py-2 rounded-lg inline-block mb-8">
                            🎉 <b>{gameData?.winner}</b> acertou!
                        </div>

                        {isHost && (
                            <button 
                                onClick={() => socket.emit('enigma_next', { roomId })}
                                className="w-full bg-slate-200 hover:bg-white text-slate-900 font-bold py-4 rounded-xl shadow-lg transition"
                            >
                                PRÓXIMO ENIGMA
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Placar Rápido */}
            <div className="mt-8 flex gap-4 overflow-x-auto max-w-2xl w-full pb-4 scrollbar-hide">
                {players.sort((a,b) => b.score - a.score).map((p, i) => (
                    <div key={p.userId} className="flex flex-col items-center min-w-[60px]">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 ${gameData?.winner === p.nickname ? 'bg-green-500 border-green-300 text-black' : 'bg-slate-800 border-slate-600'}`}>
                            {p.nickname[0]}
                        </div>
                        <span className="text-[10px] mt-1 text-slate-400">{p.nickname}</span>
                        <span className="text-xs font-bold text-yellow-500">{p.score}pts</span>
                    </div>
                ))}
            </div>

            <style>{`
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
            `}</style>
        </div>
    );
}