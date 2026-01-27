import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
];

export default function GameTermo() {
  const { socket, roomId, players } = useGame();
  
  // Estado Local
  const [currentGuess, setCurrentGuess] = useState('');
  const [history, setHistory] = useState([]); 
  const [gameStatus, setGameStatus] = useState('PLAYING');
  const [secretWord, setSecretWord] = useState('');
  const [shakeRow, setShakeRow] = useState(false);
  const [scoreboard, setScoreboard] = useState([]);

  useEffect(() => {
    // 1. Receber atualizações do meu próprio jogo
    socket.on('game_termo_update_private', (data) => {
        setHistory(data.history);
        setGameStatus(data.status);
        if(data.secretWord) setSecretWord(data.secretWord);
    });

    // 2. Receber erro (palavra invalida)
    socket.on('game_termo_error', () => {
        setShakeRow(true);
        setTimeout(() => setShakeRow(false), 500);
    });

    // 3. Receber placar geral (quem já terminou)
    socket.on('game_termo_scoreboard', (data) => {
        setScoreboard(data);
    });

    return () => {
        socket.off('game_termo_update_private');
        socket.off('game_termo_error');
        socket.off('game_termo_scoreboard');
    };
  }, [socket]);

  // Input Handler
  const handleInput = (key) => {
    if (gameStatus !== 'PLAYING') return;

    if (key === 'ENTER') {
        if (currentGuess.length === 5) {
            socket.emit('game_termo_guess', { guess: currentGuess });
            setCurrentGuess('');
        } else {
            setShakeRow(true);
            setTimeout(() => setShakeRow(false), 500);
        }
        return;
    }

    if (key === '⌫' || key === 'BACKSPACE') {
        setCurrentGuess(prev => prev.slice(0, -1));
        return;
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < 5) {
        setCurrentGuess(prev => prev + key);
    }
  };

  // Teclado Físico
  useEffect(() => {
    const handleKeyDown = (e) => {
        let key = e.key.toUpperCase();
        if (key === 'BACKSPACE') key = '⌫';
        if (key === 'ENTER' || key === '⌫' || /^[A-Z]$/.test(key)) {
            handleInput(key);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGuess, gameStatus]);

  // Função Auxiliar para renderizar a Grid
  const renderGrid = () => {
    const rows = [];
    // 6 tentativas fixas
    for (let i = 0; i < 6; i++) {
        let content = null;
        let animate = false;

        // Linha Passada (Validada)
        if (i < history.length) {
            content = history[i].map((cell, idx) => {
                let color = 'bg-slate-700 border-slate-700';
                if (cell.status === 'correct') color = 'bg-green-600 border-green-600';
                if (cell.status === 'present') color = 'bg-yellow-500 border-yellow-500';
                return (
                    <div key={idx} className={`w-10 h-10 sm:w-14 sm:h-14 border-2 text-white font-bold text-2xl flex items-center justify-center rounded ${color} transform transition-all duration-500 flip-in`}>
                        {cell.letter}
                    </div>
                );
            });
        } 
        // Linha Atual (Digitando)
        else if (i === history.length) {
            animate = shakeRow;
            const letters = currentGuess.split('');
            content = [0,1,2,3,4].map(idx => (
                <div key={idx} className="w-10 h-10 sm:w-14 sm:h-14 border-2 border-slate-500 bg-slate-800/50 text-white font-bold text-2xl flex items-center justify-center rounded">
                    {letters[idx] || ''}
                </div>
            ));
        } 
        // Linhas Futuras (Vazias)
        else {
            content = [0,1,2,3,4].map(idx => (
                <div key={idx} className="w-10 h-10 sm:w-14 sm:h-14 border-2 border-slate-800 bg-transparent rounded opacity-50"></div>
            ));
        }

        rows.push(
            <div key={i} className={`flex gap-1 sm:gap-2 mb-1 sm:mb-2 justify-center ${animate ? 'animate-shake' : ''}`}>
                {content}
            </div>
        );
    }
    return rows;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col lg:flex-row">
      
      {/* AREA DE JOGO (Esquerda) */}
      <div className="flex-1 flex flex-col items-center justify-center p-2">
        <div className="text-center mb-4">
            <h1 className="text-3xl font-black text-white tracking-widest">TERMO</h1>
            {gameStatus !== 'PLAYING' && (
                <div className="mt-2 bg-slate-800 p-2 rounded-lg animate-bounce">
                    {gameStatus === 'WON' 
                        ? <span className="text-green-400 font-bold">PARABÉNS! ACERTOU! 🏆</span> 
                        : <span className="text-red-400 font-bold">ERA: {secretWord} 💀</span>}
                </div>
            )}
        </div>

        <div className="mb-4">
            {renderGrid()}
        </div>

        {/* Teclado Virtual */}
        <div className="w-full max-w-lg px-2">
            {KEYBOARD_ROWS.map((row, i) => (
                <div key={i} className="flex justify-center gap-1 mb-1">
                    {row.map(key => (
                        <button
                            key={key}
                            onClick={() => handleInput(key)}
                            className={`font-bold rounded h-10 sm:h-12 flex items-center justify-center transition active:scale-95 text-white
                                ${key === 'ENTER' || key === '⌫' ? 'flex-[1.5] text-[10px] sm:text-xs bg-slate-600' : 'flex-1 bg-slate-500 hover:bg-slate-400'}`}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            ))}
        </div>
      </div>

      {/* PLACAR (Direita / Abaixo em mobile) */}
      <div className="bg-slate-800 w-full lg:w-64 p-4 border-l border-slate-700 overflow-y-auto max-h-[30vh] lg:max-h-screen">
        <h3 className="text-slate-400 font-bold text-xs uppercase mb-3 text-center">Progresso da Sala</h3>
        <div className="space-y-2">
            {scoreboard.length === 0 ? <p className="text-slate-500 text-center text-xs">Aguardando jogadas...</p> : null}
            
            {scoreboard.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-700/50 p-2 rounded">
                    <span className="text-white text-sm font-bold truncate max-w-[100px]">{p.nickname}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{p.attempts}/6</span>
                        {p.status === 'WON' && <span className="text-green-500 text-xs">✔</span>}
                        {p.status === 'LOST' && <span className="text-red-500 text-xs">✘</span>}
                        {p.status === 'PLAYING' && <span className="text-yellow-500 text-xs animate-pulse">...</span>}
                    </div>
                </div>
            ))}
        </div>
      </div>

    </div>
  );
}