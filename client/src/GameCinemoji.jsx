import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { Film, Send, Clock, Trophy, Lightbulb, Loader2, AlertTriangle } from 'lucide-react';

export default function GameCinemoji({ players, isHost, roomId, gameData, phase }) {
  const [guess, setGuess] = useState('');
  const [timer, setTimer] = useState(60);
  const [hint, setHint] = useState(null);
  
  // Estados de Feedback Visual
  const [shake, setShake] = useState(false); 
  const [closeShake, setCloseShake] = useState(false); 
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // 1. MONITOR DE MUDANÇA DE RODADA (RESET FORÇADO)
  // Toda vez que gameData.round mudar, limpamos a dica e os feedbacks
  useEffect(() => {
      setHint(null);
      setFeedbackMsg('');
      setShake(false);
      setCloseShake(false);
      setGuess('');
      // Se a rodada mudou, o timer reseta visualmente para 60 até o servidor atualizar
      setTimer(60); 
  }, [gameData?.round]); 

  // 2. LISTENERS DO SOCKET
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
    socket.on('cinemoji_hint', handleHint); // Recebe a dica dos 30s
    socket.on('cinemoji_wrong', handleWrong);
    socket.on('cinemoji_close', handleClose);

    // Sincronia inicial/reconect (Se já tiver dica no servidor, mostra)
    if (gameData?.hint) {
        setHint(gameData.hint);
    }

    return () => {
        socket.off('cinemoji_timer', handleTimer);
        socket.off('cinemoji_hint', handleHint);
        socket.off('cinemoji_wrong', handleWrong);
        socket.off('cinemoji_close', handleClose);
    };
  }, []); // Dependências vazias aqui pois controlamos o reset no useEffect acima

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
              <Loader2 size={40} className="animate-spin text-yellow-400" />
              <p className="font-bold text-lg">Carregando Filme...</p>
          </div>
      );
  }

  const winners = gameData.winners || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
        {/* CABEÇALHO */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl shadow-lg">
            <h1 className="text-2xl font-black text-yellow-400 flex items-center gap-2"><Film /> CINEMOJI</h1>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <p className="text-xs text-slate-400 font-bold uppercase">RODADA</p>
                    <p className="font-mono text-xl">{gameData.round || 1}</p>
                </div>
                <div className="flex flex-col items-center">
                    <Clock size={20} className={`${timer < 10 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`font-mono font-bold text-lg ${timer < 10 ? 'text-red-500' : 'text-white'}`}>{timer}s</span>
                </div>
            </div>
        </div>

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center animate-in zoom-in">
            
            {/* CARD DE EMOJIS */}
            <div className="bg-white text-slate-900 p-8 rounded-3xl shadow-2xl mb-8 w-full text-center relative overflow-hidden">
                <div className="absolute bottom-0 left-0 h-2 bg-slate-200 w-full">
                    <div 
                        className={`h-full transition-all duration-1000 linear ${timer < 10 ? 'bg-red-500' : 'bg-yellow-400'}`} 
                        style={{width: `${(timer / 60) * 100}%`}}
                    ></div>
                </div>

                <div className="text-6xl md:text-8xl tracking-widest mb-4 animate-bounce-slow">
                    {gameData.emojis || "..."}
                </div>
                
                {/* DICA: Só mostra se hint existir E não for fase de revelação */}
                {hint && phase !== 'REVEAL' && (
                    <div className="mt-4 bg-slate-100 p-3 rounded-xl animate-in slide-in-from-bottom">
                        <div className="flex justify-center items-center gap-2 text-yellow-600 font-bold text-xs uppercase mb-1">
                            <Lightbulb size={16}/> Dica (Metade dos Pontos)
                        </div>
                        <p className="text-2xl font-mono tracking-widest text-slate-800 font-bold">{hint}</p>
                    </div>
                )}

                {/* RESPOSTA REVELADA */}
                {phase === 'REVEAL' && (
                    <div className="animate-in slide-in-from-bottom fade-in duration-500 mt-4 border-t border-slate-200 pt-4">
                        <p className="text-slate-400 text-xs font-bold uppercase mb-1">O FILME ERA</p>
                        <h2 className="text-3xl font-black text-indigo-600 uppercase">{gameData.title || "?"}</h2>
                    </div>
                )}
            </div>

            {/* VENCEDORES DA RODADA */}
            {winners.length > 0 && (
                <div className="mb-6 flex gap-2 flex-wrap justify-center min-h-[30px]">
                    {winners.map(winner => (
                        <span key={winner} className="bg-emerald-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-in zoom-in shadow-lg">
                            <Trophy size={12} className="text-yellow-300"/> {winner}
                        </span>
                    ))}
                </div>
            )}

            {/* INPUT DE RESPOSTA */}
            {phase === 'GUESSING' && (
                <form onSubmit={sendGuess} className={`w-full relative transition-transform ${shake ? 'animate-shake' : ''} ${closeShake ? 'animate-pulse' : ''}`}>
                    
                    {/* BALÃO DE ALERTA "QUASE LÁ" */}
                    {feedbackMsg && (
                        <div className="absolute -top-12 left-0 w-full flex justify-center animate-in slide-in-from-bottom-2 fade-in">
                            <div className="bg-orange-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
                                <AlertTriangle size={16}/> {feedbackMsg}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input 
                            className={`flex-1 bg-slate-800 border-2 rounded-xl px-4 py-4 text-lg outline-none transition text-white placeholder:text-slate-500
                            ${shake ? 'border-red-500 text-red-200' : ''}
                            ${closeShake ? 'border-orange-500 text-orange-200' : ''}
                            ${!shake && !closeShake ? 'border-slate-700 focus:border-yellow-400' : ''}`}
                            placeholder={shake ? "Errado..." : (closeShake ? "Quase lá..." : "Qual é o nome do filme?")}
                            value={guess} 
                            onChange={e => { setGuess(e.target.value); if(shake) setShake(false); }} 
                            autoFocus
                        />
                        <button className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-6 rounded-xl font-black transition transform hover:scale-105">
                            <Send />
                        </button>
                    </div>
                </form>
            )}
        </div>

        {/* PLACAR */}
        <div className="w-full max-w-4xl mt-8 overflow-x-auto no-scrollbar">
             <div className="flex gap-4 pb-4">
                {(players || []).sort((a,b) => (b.score||0) - (a.score||0)).map((p, i) => (
                    <div key={p.id} className="bg-slate-800 p-3 rounded-xl min-w-[100px] flex flex-col items-center border border-slate-700">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${i===0 ? 'bg-yellow-400 text-black' : 'bg-slate-600'}`}>
                            {i===0 ? '1º' : i+1}
                        </div>
                        <span className="font-bold truncate max-w-[80px]">{p.nickname}</span>
                        <span className="text-yellow-400 font-mono font-bold text-lg">{p.score || 0}</span>
                    </div>
                ))}
             </div>
        </div>
        
        <style>{`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.3s ease-in-out; }
        `}</style>
    </div>
  );
}