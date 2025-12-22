import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Delete, Check, Trophy, ArrowRight } from 'lucide-react';

export default function GameTermo({ players, isHost, roomId, gameData, phase }) {
  const [currentGuess, setCurrentGuess] = useState('');
  
  const myState = gameData?.playersState?.[socket.id] || { board: [], status: 'PLAYING' };
  const attempts = myState.board || [];
  const status = myState.status;
  const secretWord = gameData?.secretWord;
  const totalScores = gameData?.totalScores || {};
  const currentRound = gameData?.round || 1;

  // TECLADO
  const keys = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M']
  ];

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (phase !== 'PLAYING' || status !== 'PLAYING') return;
        const key = e.key.toUpperCase();
        if (key === 'ENTER') submitGuess();
        else if (key === 'BACKSPACE') setCurrentGuess(prev => prev.slice(0, -1));
        else if (/^[A-Z]$/.test(key) && currentGuess.length < 5) setCurrentGuess(prev => prev + key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGuess, phase, status]);

  const onKeyClick = (key) => { if (currentGuess.length < 5) setCurrentGuess(prev => prev + key); };

  const submitGuess = () => {
      if (currentGuess.length !== 5) return;
      socket.emit('termo_guess', { roomId, word: currentGuess });
      setCurrentGuess('');
  };

  const getKeyColor = (key) => {
      let color = 'bg-slate-700';
      attempts.forEach(attempt => {
          const idx = attempt.word.indexOf(key);
          if (idx !== -1) {
              const res = attempt.results[idx];
              if (res === 'G') color = 'bg-emerald-600';
              else if (res === 'Y' && color !== 'bg-emerald-600') color = 'bg-yellow-600';
              else if (res === 'X' && color !== 'bg-emerald-600' && color !== 'bg-yellow-600') color = 'bg-slate-900 opacity-50';
          }
      });
      return color;
  };

  const getCellColor = (resultChar) => {
      if (resultChar === 'G') return 'bg-emerald-600 border-emerald-600';
      if (resultChar === 'Y') return 'bg-yellow-600 border-yellow-600';
      if (resultChar === 'X') return 'bg-slate-700 border-slate-700';
      return 'bg-transparent border-slate-600';
  };

  return (
    // CORREÇÃO 1: 'items-center' para centralizar tudo e 'flex-col-reverse' para o placar ficar embaixo no celular
    <div className="min-h-screen bg-slate-900 text-white p-2 flex flex-col-reverse md:flex-row gap-4 justify-center items-center md:items-start">
        
        {/* PLACAR LATERAL */}
        {/* CORREÇÃO 2: Removido 'hidden', adicionado 'w-full max-w-sm' para mobile */}
        <div className="w-full max-w-sm md:w-64 bg-slate-800 p-4 rounded-xl shadow-lg md:mt-4 mb-8 md:mb-0">
            <h3 className="font-bold text-slate-400 mb-4 text-xs uppercase text-center md:text-left">Placar Geral</h3>
            <div className="space-y-3">
                {players.sort((a,b) => (totalScores[b.id]||0) - (totalScores[a.id]||0)).map(p => {
                    const st = gameData?.playersState?.[p.id];
                    return (
                        <div key={p.id} className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                            <div>
                                <div className={p.id === socket.id ? "text-emerald-400 font-bold" : "text-white"}>{p.nickname}</div>
                                <div className="text-[10px] text-slate-500">
                                    {st?.status === 'WON' ? `Acertou em ${st.board.length}` : (st?.status === 'LOST' ? 'Falhou' : 'Jogando...')}
                                </div>
                            </div>
                            <div className="font-mono font-bold text-lg">{totalScores[p.id] || 0}</div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* CENTRO (JOGO) */}
        <div className="flex-1 max-w-md flex flex-col items-center w-full">
            <div className="flex items-center justify-between w-full px-2 mb-2 md:mb-4 mt-2">
                <h1 className="text-2xl md:text-3xl font-black text-emerald-500 tracking-widest">TERMO</h1>
                <div className="text-[10px] md:text-xs font-bold bg-slate-800 px-3 py-1 rounded text-slate-400">RODADA {currentRound}/5</div>
            </div>

            {/* MENSAGEM DE FIM DA RODADA */}
            {(phase === 'ROUND_OVER' || phase === 'VICTORY') && (
                <div className="mb-6 bg-slate-800 p-6 rounded-2xl text-center shadow-xl animate-in zoom-in w-full">
                    {phase === 'VICTORY' ? (
                        <>
                             <Trophy size={60} className="text-yellow-400 mx-auto mb-4" />
                             <h2 className="text-3xl font-black text-white mb-2">VENCEDOR</h2>
                             <p className="text-2xl text-emerald-400 font-bold">{gameData.winner?.nickname}</p>
                             <p className="text-slate-400 mb-6">{totalScores[gameData.winner?.id]} pontos</p>
                        </>
                    ) : (
                        <>
                            <p className="text-slate-400 text-sm uppercase">A palavra era</p>
                            <h2 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-widest">{secretWord}</h2>
                            <div className="text-sm text-slate-300 mb-4">
                                {status === 'WON' ? <span className="text-emerald-400">Você acertou! (+{(() => {
                                    const len = attempts.length;
                                    if(len===1)return 10; if(len===2)return 8; if(len===3)return 6; if(len===4)return 4; if(len===5)return 2; return 1;
                                })()} pts)</span> : <span className="text-red-400">Você não conseguiu.</span>}
                            </div>
                        </>
                    )}

                    {isHost && (
                        <button 
                            onClick={() => phase === 'VICTORY' ? socket.emit('restart_game', { roomId }) : socket.emit('termo_next_round', { roomId })} 
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-full transition w-full flex items-center justify-center gap-2"
                        >
                            {phase === 'VICTORY' ? 'Voltar ao Lobby' : <>Próxima Rodada <ArrowRight size={18}/></>}
                        </button>
                    )}
                </div>
            )}

            {/* GRID */}
            <div className="grid grid-rows-6 gap-2 mb-4 md:mb-8">
                {[...Array(6)].map((_, rowIndex) => {
                    const attempt = attempts[rowIndex];
                    const word = attempt ? attempt.word : (rowIndex === attempts.length ? currentGuess : '');
                    const results = attempt ? attempt.results : [];
                    return (
                        <div key={rowIndex} className="grid grid-cols-5 gap-2">
                            {[...Array(5)].map((_, colIndex) => {
                                const char = word[colIndex] || '';
                                const res = results[colIndex]; 
                                return (
                                    <div key={colIndex} className={`w-12 h-12 md:w-14 md:h-14 border-2 flex items-center justify-center text-2xl font-bold uppercase rounded transition-colors duration-500 ${getCellColor(res)}`}>
                                        {char}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* TECLADO */}
            {phase === 'PLAYING' && status === 'PLAYING' && (
                <div className="w-full select-none px-1">
                    {keys.map((row, i) => (
                        <div key={i} className="flex justify-center gap-1 mb-2">
                            {row.map(key => (
                                // CORREÇÃO 3: 'w-7' no mobile para caber em telas pequenas
                                <button key={key} onClick={() => onKeyClick(key)} className={`w-7 h-10 md:w-10 md:h-12 rounded font-bold text-sm transition active:scale-95 ${getKeyColor(key)}`}>{key}</button>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-2 mt-2">
                        <button onClick={() => setCurrentGuess(prev => prev.slice(0, -1))} className="bg-red-900/50 text-red-200 px-6 py-3 rounded-lg font-bold flex items-center gap-2 active:scale-95"><Delete size={20}/></button>
                        <button onClick={submitGuess} className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 active:scale-95"><Check size={20}/></button>
                    </div>
                </div>
            )}
            
            {status !== 'PLAYING' && phase === 'PLAYING' && (
                <div className="text-center animate-pulse text-slate-400 mt-4 bg-slate-800 px-4 py-2 rounded-full text-xs md:text-sm">
                    Aguardando outros jogadores terminarem...
                </div>
            )}
        </div>
    </div>
  );
}