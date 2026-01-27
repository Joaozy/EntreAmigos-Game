import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Film, Send, Clock, Trophy, Lightbulb, AlertTriangle } from 'lucide-react';

export default function GameCinemoji({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [timer, setTimer] = useState(60);
  const [hint, setHint] = useState(null);
  
  const [shake, setShake] = useState(false); 
  const [closeShake, setCloseShake] = useState(false); 
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
      setHint(null);
      setFeedbackMsg('');
      setShake(false);
      setCloseShake(false);
      setGuess('');
      setTimer(60); 
  }, [gameData?.round]); 

  useEffect(() => {
    const handleTimer = (t) => setTimer(t);
    const handleHint = (h) => setHint(h);
    
    const handleWrong = () => {
        setShake(true);
        setFeedbackMsg('');
        setTimeout(() => setShake(false), 500);
    };

    const handleClose = (msg) => {
        setCloseShake(true);
        setFeedbackMsg(msg);
        setTimeout(() => {
            setCloseShake(false);
            setFeedbackMsg('');
        }, 2000);
    };

    socket.on('cinemoji_timer', handleTimer);
    socket.on('cinemoji_hint', handleHint); 
    socket.on('cinemoji_wrong', handleWrong);
    socket.on('cinemoji_close', handleClose);

    if (gameData?.hint) setHint(gameData.hint);

    return () => {
        socket.off('cinemoji_timer', handleTimer);
        socket.off('cinemoji_hint', handleHint);
        socket.off('cinemoji_wrong', handleWrong);
        socket.off('cinemoji_close', handleClose);
    };
  }, []); 

  const sendGuess = (e) => {
      e.preventDefault();
      if(guess.trim()) {
          socket.emit('cinemoji_guess', { roomId, guess });
          setGuess('');
      }
  };

  if (!gameData || (!gameData.emojis && !gameData.round)) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="font-bold text-lg">Preparando Rolo de Filme...</p>
          </div>
      );
  }

  const winners = gameData.winners || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4 pt-6">
        {/* CABEÇALHO */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
            <h1 className="text-xl md:text-2xl font-black text-yellow-400 flex items-center gap-2 tracking-tighter">
                <Film className="hidden sm:block"/> CINEMOJI
            </h1>
            <div className="flex items-center gap-6">
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">RODADA</p>
                    <p className="font-mono text-xl leading-none">{gameData.round || 1}</p>
                </div>
                <div className="flex flex-col items-center">
                    <Clock size={18} className={`${timer < 10 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`font-mono font-bold text-lg leading-none ${timer < 10 ? 'text-red-500' : 'text-white'}`}>{timer}s</span>
                </div>
            </div>
        </div>

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center animate-in zoom-in duration-300">
            
            {/* CARD DE EMOJIS */}
            <div className="bg-white text-slate-900 p-6 md:p-10 rounded-3xl shadow-2xl mb-8 w-full text-center relative overflow-hidden min-h-[250px] flex flex-col justify-center items-center">
                {/* Barra de Progresso */}
                <div className="absolute top-0 left-0 h-2 bg-slate-100 w-full">
                    <div 
                        className={`h-full transition-all duration-1000 linear ${timer < 10 ? 'bg-red-500' : 'bg-yellow-400'}`} 
                        style={{width: `${(timer / 60) * 100}%`}}
                    ></div>
                </div>

                <div className="text-6xl md:text-8xl tracking-[0.2em] mb-4 animate-bounce-slow font-emoji leading-relaxed">
                    {gameData.emojis || "❓"}
                </div>
                
                {/* DICA */}
                {hint && phase !== 'REVEAL' && (
                    <div className="mt-4 bg-slate-100 p-3 rounded-xl animate-in slide-in-from-bottom w-full max-w-sm">
                        <div className="flex justify-center items-center gap-2 text-yellow-600 font-bold text-[10px] uppercase mb-1">
                            <Lightbulb size={14}/> Dica Disponível
                        </div>
                        <p className="text-xl md:text-2xl font-mono tracking-widest text-slate-800 font-bold uppercase">{hint}</p>
                    </div>
                )}

                {/* RESPOSTA REVELADA */}
                {phase === 'REVEAL' && (
                    <div className="animate-in slide-in-from-bottom fade-in duration-500 mt-6 border-t-2 border-slate-100 pt-6 w-full">
                        <p className="text-slate-400 text-xs font-bold uppercase mb-2 tracking-widest">O FILME ERA</p>
                        <h2 className="text-2xl md:text-4xl font-black text-indigo-600 uppercase leading-tight">{gameData.title || "?"}</h2>
                    </div>
                )}
            </div>

            {/* VENCEDORES DA RODADA */}
            {winners.length > 0 && (
                <div className="mb-6 flex gap-2 flex-wrap justify-center min-h-[30px]">
                    {winners.map(winner => (
                        <span key={winner} className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-in zoom-in shadow-lg border border-emerald-400">
                            <Trophy size={12} className="text-yellow-200"/> {winner}
                        </span>
                    ))}
                </div>
            )}

            {/* INPUT DE RESPOSTA */}
            {phase === 'GUESSING' && (
                <form onSubmit={sendGuess} className={`w-full relative transition-transform ${shake ? 'animate-shake' : ''} ${closeShake ? 'animate-pulse' : ''}`}>
                    
                    {feedbackMsg && (
                        <div className="absolute -top-14 left-0 w-full flex justify-center animate-in slide-in-from-bottom-2 fade-in z-10">
                            <div className="bg-orange-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 border-2 border-orange-400">
                                <AlertTriangle size={16}/> {feedbackMsg}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input 
                            className={`flex-1 bg-slate-800 border-2 rounded-xl px-4 py-4 text-lg outline-none transition text-white placeholder:text-slate-500 shadow-inner
                            ${shake ? 'border-red-500 text-red-200' : ''}
                            ${closeShake ? 'border-orange-500 text-orange-200' : ''}
                            ${!shake && !closeShake ? 'border-slate-700 focus:border-yellow-400' : ''}`}
                            placeholder={shake ? "Errado..." : (closeShake ? "Quase lá..." : "Nome do filme...")}
                            value={guess} 
                            onChange={e => { setGuess(e.target.value); if(shake) setShake(false); }} 
                            autoFocus
                        />
                        <button className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-6 rounded-xl font-black transition transform hover:scale-105 shadow-lg active:scale-95">
                            <Send />
                        </button>
                    </div>
                </form>
            )}
        </div>
    </div>
  );
}