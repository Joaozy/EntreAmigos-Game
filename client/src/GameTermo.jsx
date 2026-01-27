import React, { useState, useEffect } from 'react';
import { useGame } from './context/GameContext';
import { RotateCcw, ArrowRight, Trophy, Home, LogOut } from 'lucide-react';

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
];

export default function GameTermo() {
  const { socket, roomId, isHost, sairDoJogo, currentPhase, gameResult } = useGame();
  
  // Estado Local
  const [currentGuess, setCurrentGuess] = useState('');
  const [history, setHistory] = useState([]); 
  const [gameStatus, setGameStatus] = useState('PLAYING');
  const [secretWord, setSecretWord] = useState('');
  const [shakeRow, setShakeRow] = useState(false);
  const [scoreboard, setScoreboard] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [myScore, setMyScore] = useState(0);

  // 1. Listeners
  useEffect(() => {
    socket.emit('game_termo_load_state');

    const handleUpdate = (data) => {
        setHistory(data.history);
        setGameStatus(data.status);
        if(data.round) setCurrentRound(data.round);
        if(data.secretWord) setSecretWord(data.secretWord);
        if(data.totalScores && socket.id) setMyScore(data.totalScores[socket.id] || 0);

        // Se resetou (nova rodada), limpa inputs
        if (data.status === 'PLAYING' && data.history.length === 0) {
            setCurrentGuess('');
            setSecretWord('');
            setHistory([]);
        }
    };

    const handleError = () => {
        setShakeRow(true);
        setTimeout(() => setShakeRow(false), 500);
    };

    const handleScoreboard = (data) => setScoreboard(data);

    socket.on('game_termo_my_update', handleUpdate);
    socket.on('game_termo_error', handleError);
    socket.on('game_termo_scoreboard', handleScoreboard);

    return () => {
        socket.off('game_termo_my_update', handleUpdate);
        socket.off('game_termo_error', handleError);
        socket.off('game_termo_scoreboard', handleScoreboard);
    };
  }, [socket]);

  // 2. Input Logic
  const handleInput = (key) => {
    if (gameStatus !== 'PLAYING' || currentPhase === 'GAME_OVER') return;

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

  useEffect(() => {
    const handleKeyDown = (e) => {
        let key = e.key.toUpperCase();
        if (key === 'BACKSPACE') key = '⌫';
        if (key === 'ENTER' || key === '⌫' || /^[A-Z]$/.test(key)) handleInput(key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGuess, gameStatus, currentPhase]);

  const getKeyStatus = (key) => {
      let status = 'default';
      for (let row of history) {
          for (let cell of row) {
              if (cell.letter === key) {
                  if (cell.status === 'correct') return 'correct';
                  if (cell.status === 'present' && status !== 'correct') status = 'present';
                  if (cell.status === 'absent' && status === 'default') status = 'absent';
              }
          }
      }
      return status;
  };

  // --- TELA DE GAME OVER (FIM DE JOGO TOTAL) ---
  if (currentPhase === 'GAME_OVER' && gameResult) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center animate-in zoom-in">
            <Trophy size={80} className="text-yellow-400 mb-6 animate-bounce" />
            <h1 className="text-4xl font-black mb-2">FIM DE JOGO!</h1>
            
            <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl mb-8 w-full max-w-md border border-slate-700">
                <p className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-4">Placar Final</p>
                <div className="space-y-3">
                    {gameResult.results?.sort((a,b) => b.score - a.score).map((p, i) => (
                        <div key={i} className={`flex justify-between items-center p-3 rounded-xl ${i===0 ? 'bg-yellow-900/20 border border-yellow-500/50' : 'bg-slate-700/50'}`}>
                            <div className="flex items-center gap-3">
                                <span className={`font-bold w-6 ${i===0 ? 'text-2xl' : 'text-slate-400'}`}>{i===0 ? '🥇' : `#${i+1}`}</span>
                                <span className="font-bold text-lg">{p.nickname}</span>
                            </div>
                            <span className="text-yellow-400 font-mono font-black text-xl">{p.score} pts</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xs">
                {isHost && (
                    <>
                        <button onClick={() => socket.emit('game_termo_restart', { roomId })} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                            <RotateCcw size={20}/> JOGAR NOVAMENTE
                        </button>
                        <button onClick={() => socket.emit('game_termo_back_to_lobby', { roomId })} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                            <Home size={20}/> VOLTAR AO LOBBY
                        </button>
                    </>
                )}
                <button onClick={sairDoJogo} className="text-red-400 font-bold py-2 hover:text-red-300 transition">
                    Sair da Sala
                </button>
            </div>
        </div>
      );
  }

  // --- TELA DE JOGO (RODADAS) ---
  const renderGrid = () => {
    const rows = [];
    for (let i = 0; i < 6; i++) {
        let content = null;
        let animate = false;
        if (i < history.length) {
            content = history[i].map((cell, idx) => {
                let color = 'bg-slate-700 border-slate-700';
                if (cell.status === 'correct') color = 'bg-green-600 border-green-600';
                if (cell.status === 'present') color = 'bg-yellow-500 border-yellow-500';
                return <div key={idx} className={`w-12 h-12 md:w-14 md:h-14 border-2 text-white font-bold text-2xl flex items-center justify-center rounded ${color} flip-in`}>{cell.letter}</div>;
            });
        } else if (i === history.length) {
            animate = shakeRow;
            const letters = currentGuess.split('');
            content = [0,1,2,3,4].map(idx => (
                <div key={idx} className="w-12 h-12 md:w-14 md:h-14 border-2 border-slate-500 bg-slate-800/50 text-white font-bold text-2xl flex items-center justify-center rounded">{letters[idx] || ''}</div>
            ));
        } else {
            content = [0,1,2,3,4].map(idx => (
                <div key={idx} className="w-12 h-12 md:w-14 md:h-14 border-2 border-slate-800 bg-transparent rounded opacity-30"></div>
            ));
        }
        rows.push(<div key={i} className={`flex gap-1 md:gap-2 mb-1 md:mb-2 justify-center ${animate ? 'animate-shake' : ''}`}>{content}</div>);
    }
    return rows;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col lg:flex-row text-white p-2">
      
      {/* BARRA SUPERIOR FIXA (CONTROLE DE SAÍDA) */}
      <div className="fixed top-0 left-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700 shadow-lg pointer-events-auto flex gap-4 text-xs font-bold text-slate-300 uppercase tracking-widest">
              <span>Rodada <span className="text-white">{currentRound}/5</span></span>
              <span>Pontos: <span className="text-yellow-400">{myScore}</span></span>
          </div>
          <button 
            onClick={sairDoJogo}
            className="pointer-events-auto bg-red-900/80 hover:bg-red-800 text-white p-2 rounded-full shadow-lg backdrop-blur-md transition"
            title="Sair do Jogo"
          >
              <LogOut size={20}/>
          </button>
      </div>

      {/* AREA DE JOGO */}
      <div className="flex-1 flex flex-col items-center justify-center py-12 relative">
        
        <div className="text-center mb-6">
            <h1 className="text-4xl font-black text-emerald-500 tracking-[0.2em] mb-2">TERMO</h1>
            
            {/* Mensagem de Resultado da Rodada */}
            {gameStatus !== 'PLAYING' && (
                <div className={`px-6 py-3 rounded-xl shadow-lg animate-bounce font-bold text-lg mb-4 ${gameStatus === 'WON' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {gameStatus === 'WON' ? '🏆 ACERTOU!' : `☠️ ERA: ${secretWord}`}
                </div>
            )}

            {/* BOTÕES ENTRE RODADAS (HOST) */}
            {gameStatus !== 'PLAYING' && (
                <div className="flex flex-wrap gap-3 justify-center animate-in fade-in zoom-in z-50 relative">
                    {isHost ? (
                        <>
                            <button 
                                onClick={() => socket.emit('game_termo_next_round', { roomId })}
                                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-3 rounded-xl font-bold transition shadow-lg border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1"
                            >
                                {currentRound < 5 ? "PRÓXIMA RODADA" : "VER RESULTADO FINAL"} <ArrowRight size={20}/>
                            </button>
                            <button onClick={() => socket.emit('game_termo_back_to_lobby', { roomId })} className="bg-slate-700 hover:bg-slate-600 text-white font-bold p-3 rounded-xl" title="Voltar ao Lobby"><Home size={20}/></button>
                        </>
                    ) : (
                        <div className="text-sm text-slate-400 font-bold bg-slate-800 px-4 py-2 rounded-lg animate-pulse border border-slate-700">
                            Aguardando o Host...
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="mb-8">{renderGrid()}</div>

        {/* Teclado */}
        <div className={`w-full max-w-lg px-1 select-none transition-opacity duration-500 ${gameStatus !== 'PLAYING' ? 'opacity-30 pointer-events-none' : ''}`}>
            {KEYBOARD_ROWS.map((row, i) => (
                <div key={i} className="flex justify-center gap-1.5 mb-1.5">
                    {row.map(key => {
                        const status = getKeyStatus(key);
                        let bgClass = 'bg-slate-400 text-slate-900';
                        if (key === 'ENTER' || key === '⌫') bgClass = 'bg-slate-600 text-white';
                        else if (status === 'correct') bgClass = 'bg-green-600 text-white border-green-600';
                        else if (status === 'present') bgClass = 'bg-yellow-500 text-white border-yellow-500';
                        else if (status === 'absent') bgClass = 'bg-slate-800 text-slate-500 border-slate-800';

                        return (
                            <button key={key} onClick={() => handleInput(key)} className={`font-bold rounded-lg h-12 md:h-14 flex items-center justify-center active:scale-95 ${key === 'ENTER' || key === '⌫' ? 'flex-[1.5] text-xs' : 'flex-1'} ${bgClass}`}>
                                {key}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
      </div>

      {/* PLACAR LATERAL */}
      <div className="bg-slate-800 w-full lg:w-72 p-6 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none border-t lg:border-l border-slate-700 overflow-y-auto max-h-[30vh] lg:max-h-screen mt-4 lg:mt-0 shadow-2xl">
        <h3 className="text-slate-400 font-bold text-xs uppercase mb-4 text-center tracking-widest">Placar da Rodada</h3>
        <div className="space-y-3">
            {scoreboard.sort((a,b) => b.score - a.score).map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                    <div className="flex gap-3 items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.status === 'WON' ? 'bg-green-600' : 'bg-slate-600'}`}>{p.nickname[0]}</div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold truncate max-w-[90px]">{p.nickname}</span>
                            <span className="text-[10px] text-yellow-400 font-mono">{p.score} pts</span>
                        </div>
                    </div>
                    <div className="flex gap-0.5 items-center">
                        {[1,2,3,4,5,6].map(n => <div key={n} className={`w-1.5 h-3 rounded-full ${n <= p.attempts ? (p.status === 'WON' ? 'bg-green-500' : (p.status==='LOST'?'bg-red-500':'bg-yellow-500')) : 'bg-slate-700'}`}></div>)}
                    </div>
                </div>
            ))}
        </div>
      </div>

      <style>{`.flip-in { animation: flipIn 0.5s ease-in-out; } @keyframes flipIn { 0% { transform: rotateX(0); } 50% { transform: rotateX(90deg); } 100% { transform: rotateX(0); } }`}</style>
    </div>
  );
}