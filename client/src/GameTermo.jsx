import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { RotateCcw, LogOut, Home, Delete, Check } from 'lucide-react';

const KEYBOARD_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M']
];

export default function GameTermo() {
    const { socket, roomId, isHost, gameData, sairDoJogo } = useGame();
    
    const [currentGuess, setCurrentGuess] = useState('');
    const [shakeRow, setShakeRow] = useState(false);

    // --- ESTADOS DO JOGO ---
    const board = gameData?.board || [];
    const currentRow = gameData?.currentRow || 0;
    const phase = gameData?.phase || 'PLAYING';
    const secretWord = gameData?.secretWord;

    // --- AÇÕES ---
    const handleKeyPress = (key) => {
        if (phase !== 'PLAYING') return;
        if (key === 'ENTER') {
            submitGuess();
        } else if (key === 'BACKSPACE') {
            setCurrentGuess(prev => prev.slice(0, -1));
        } else {
            if (currentGuess.length < 5) {
                setCurrentGuess(prev => prev + key);
            }
        }
    };

    const submitGuess = () => {
        if (currentGuess.length !== 5) {
            setShakeRow(true);
            setTimeout(() => setShakeRow(false), 500);
            return;
        }
        socket.emit('termo_guess', { roomId, word: currentGuess });
        setCurrentGuess('');
    };

    // Input físico do teclado
    useEffect(() => {
        const handleKeyDown = (e) => {
            const key = e.key.toUpperCase();
            if (key === 'ENTER') handleKeyPress('ENTER');
            else if (key === 'BACKSPACE') handleKeyPress('BACKSPACE');
            else if (/^[A-Z]$/.test(key)) handleKeyPress(key);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentGuess, phase]);

    // Calcula cores do teclado
    const getKeyStatus = (key) => {
        let status = 'default';
        board.forEach(turn => {
            turn.word.split('').forEach((letter, i) => {
                if (letter === key) {
                    if (turn.result[i] === 'CORRECT') status = 'correct';
                    else if (turn.result[i] === 'ALMOST' && status !== 'correct') status = 'almost';
                    else if (turn.result[i] === 'WRONG' && status === 'default') status = 'wrong';
                }
            });
        });
        return status;
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center font-sans overflow-hidden">
            
            {/* HEADER */}
            <div className="w-full p-4 flex justify-between items-center bg-slate-900/90 backdrop-blur-md border-b border-white/5 z-50">
                <h1 className="text-2xl font-black tracking-widest text-green-500">TERMO</h1>
                <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white"><Home size={24}/></button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-lg">
                
                {/* STATUS FINAL */}
                {phase !== 'PLAYING' && (
                    <div className="mb-6 text-center animate-in zoom-in">
                        {phase === 'VICTORY' ? (
                            <div className="text-green-400 font-black text-2xl mb-2">🎉 ACERTARAM!</div>
                        ) : (
                            <div className="text-red-400 font-black text-2xl mb-2">💀 GAME OVER</div>
                        )}
                        <div className="bg-slate-800 px-6 py-2 rounded-xl text-white text-lg tracking-[0.5em] font-mono border border-slate-600">
                            {secretWord}
                        </div>
                        {isHost && (
                            <button onClick={() => socket.emit('termo_restart', { roomId })} className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold mx-auto shadow-lg transition">
                                <RotateCcw size={18}/> JOGAR NOVAMENTE
                            </button>
                        )}
                    </div>
                )}

                {/* GRID */}
                <div className="grid grid-rows-6 gap-2 mb-8">
                    {[0, 1, 2, 3, 4, 5].map((rowIndex) => {
                        const isCurrent = rowIndex === currentRow && phase === 'PLAYING';
                        const rowData = board[rowIndex];
                        const displayWord = isCurrent ? currentGuess.padEnd(5, ' ') : (rowData ? rowData.word : '     ');
                        
                        return (
                            <div key={rowIndex} className={`grid grid-cols-5 gap-2 ${isCurrent && shakeRow ? 'animate-shake' : ''}`}>
                                {displayWord.split('').map((letter, colIndex) => {
                                    let style = "bg-slate-900 border-slate-700 text-white"; // Padrão (Vazio)
                                    
                                    if (rowData) {
                                        // Linha já jogada
                                        const res = rowData.result[colIndex];
                                        if (res === 'CORRECT') style = "bg-green-600 border-green-600 text-white";
                                        else if (res === 'ALMOST') style = "bg-yellow-600 border-yellow-600 text-white";
                                        else style = "bg-slate-700 border-slate-700 text-slate-400";
                                    } else if (isCurrent && letter.trim()) {
                                        // Linha atual digitando
                                        style = "bg-slate-800 border-slate-500 text-white animate-pop";
                                    }

                                    return (
                                        <div key={colIndex} className={`w-12 h-12 md:w-14 md:h-14 border-2 flex items-center justify-center text-2xl md:text-3xl font-bold rounded uppercase transition-colors duration-500 ${style}`}>
                                            {letter}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* TECLADO */}
                <div className="w-full">
                    {KEYBOARD_ROWS.map((row, i) => (
                        <div key={i} className="flex justify-center gap-1.5 mb-2">
                            {row.map((key) => {
                                const status = getKeyStatus(key);
                                let kStyle = "bg-slate-700 text-white hover:bg-slate-600";
                                if (status === 'correct') kStyle = "bg-green-600 text-white";
                                else if (status === 'almost') kStyle = "bg-yellow-600 text-white";
                                else if (status === 'wrong') kStyle = "bg-slate-800 text-slate-600 opacity-50";

                                return (
                                    <button 
                                        key={key} 
                                        onClick={() => handleKeyPress(key)}
                                        className={`${kStyle} h-12 w-8 md:w-10 rounded font-bold text-sm transition-all active:scale-95`}
                                    >
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    <div className="flex justify-center gap-2 mt-2">
                        <button onClick={() => handleKeyPress('ENTER')} className="bg-slate-700 h-12 px-6 rounded font-bold text-xs uppercase hover:bg-slate-600">ENTER</button>
                        <button onClick={() => handleKeyPress('BACKSPACE')} className="bg-slate-700 h-12 px-6 rounded font-bold hover:bg-slate-600"><Delete size={20}/></button>
                    </div>
                </div>

            </div>

            <style>{`
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
                .animate-pop { animation: pop 0.1s ease-in-out; }
                @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
            `}</style>
        </div>
    );
}