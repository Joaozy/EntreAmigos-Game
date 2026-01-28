import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { Crown, Eye, Skull, Flag, User, Shield, RotateCcw, LogOut } from 'lucide-react';

export default function GameCodenames() {
  const { socket, roomId, isHost, gameData, players, myUserId, sairDoJogo } = useGame();
  
  const [hintWord, setHintWord] = useState('');
  const [hintCount, setHintCount] = useState(1);

  // Estados Seguros
  const teams = gameData?.teams || { red: { members: [] }, blue: { members: [] } };
  const grid = gameData?.grid || [];
  const currentTurn = gameData?.turn; 
  const currentPhase = gameData?.phase || 'SETUP';

  const myTeam = teams.red?.members.includes(myUserId) ? 'red' : teams.blue?.members.includes(myUserId) ? 'blue' : null;
  const isSpymaster = teams.red?.spymaster === myUserId || teams.blue?.spymaster === myUserId;
  const isTeamTurn = currentTurn === myTeam;

  const joinTeam = (team) => socket.emit('cn_join_team', { roomId, team });
  const becomeSpymaster = (team) => socket.emit('cn_become_spymaster', { roomId, team });
  const startMatch = () => socket.emit('cn_start_match', { roomId });

  const sendHint = (e) => {
    e.preventDefault();
    if(hintWord.trim()) {
        socket.emit('cn_give_hint', { roomId, word: hintWord, count: parseInt(hintCount) });
        setHintWord('');
    }
  };

  const clickCard = (cardId) => {
    // Só clica se for fase de chute, meu turno, NÃO sou espião e carta fechada
    if (currentPhase === 'GUESSING' && isTeamTurn && !isSpymaster && !grid[cardId].revealed) {
        socket.emit('cn_click_card', { roomId, cardId });
    }
  };

  const passTurn = () => socket.emit('cn_pass_turn', { roomId });

  // Sidebar Component
  const TeamSidebar = ({ color, teamData }) => {
      const isRed = color === 'red';
      const bgColor = isRed ? 'bg-red-950/80 border-red-900' : 'bg-blue-950/80 border-blue-900';
      const textColor = isRed ? 'text-red-100' : 'text-blue-100';
      
      const spymaster = players.find(p => p.userId === teamData.spymaster);
      const members = teamData.members.filter(id => id !== teamData.spymaster).map(id => players.find(p => p.userId === id));

      return (
          <div className={`flex-1 min-w-[200px] p-4 rounded-xl border-2 flex flex-col gap-4 ${bgColor} transition-all duration-500`}>
              <div className="text-center border-b border-white/10 pb-2">
                  <h2 className={`text-2xl font-black uppercase tracking-widest ${isRed ? 'text-red-500' : 'text-blue-500'}`}>
                      {isRed ? 'Vermelho' : 'Azul'}
                  </h2>
                  <div className="text-4xl font-black text-white">{gameData?.score?.[color] || 0}</div>
                  <span className="text-[10px] uppercase text-slate-400">Agentes Restantes</span>
              </div>

              <div className="bg-black/30 p-3 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                      <Crown size={12} /> Espião Mestre
                  </p>
                  {spymaster ? (
                      <div className={`font-bold text-sm ${textColor} flex items-center gap-2`}>
                          <div className={`w-2 h-2 rounded-full ${isRed ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                          {spymaster.nickname}
                      </div>
                  ) : (
                      <span className="text-slate-600 italic text-xs">Vazio</span>
                  )}
              </div>

              <div className="flex-1 overflow-y-auto">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1">
                      <Shield size={12} /> Operadores
                  </p>
                  <div className="space-y-1">
                      {members.length > 0 ? members.map(p => p && (
                          <div key={p.userId} className={`flex items-center gap-2 p-1.5 rounded bg-black/20 text-xs ${textColor}`}>
                              <User size={12} />
                              <span className="font-medium truncate">{p.nickname}</span>
                          </div>
                      )) : <span className="text-slate-600 italic text-xs px-2">Nenhum</span>}
                  </div>
              </div>
          </div>
      );
  };

  // --- TELA 1: SETUP ---
  if (currentPhase === 'SETUP') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center pt-10">
        <div className="absolute top-4 right-4">
            <button onClick={sairDoJogo}><LogOut className="text-red-400"/></button>
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-8 tracking-widest uppercase text-slate-300">Recrutamento</h1>
        
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 w-full max-w-6xl">
            {/* TIME VERMELHO */}
            <div className="flex-1 bg-red-950/40 border-2 border-red-800 rounded-2xl p-4 md:p-6 relative">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-black text-red-500">VERMELHO</h2>
                    {myTeam !== 'red' && <button onClick={() => joinTeam('red')} className="bg-red-600 text-white font-bold text-xs px-4 py-2 rounded-full hover:bg-red-500 shadow-lg">ENTRAR</button>}
                </div>
                <div className="mb-4 p-3 bg-black/40 rounded-xl border border-red-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Crown size={16} className={teams.red.spymaster ? "text-red-400" : "text-slate-700"} />
                        <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Espião Mestre</p>
                            <p className="font-bold text-red-100 text-sm">{players.find(p=>p.userId === teams.red.spymaster)?.nickname || '---'}</p>
                        </div>
                    </div>
                    {myTeam === 'red' && !teams.red.spymaster && (
                         <button onClick={() => becomeSpymaster('red')} className="text-[10px] border border-red-500 text-red-400 px-2 py-1 rounded hover:bg-red-900/30">ASSUMIR</button>
                    )}
                </div>
                <div className="space-y-1">
                    {teams.red.members.filter(id => id !== teams.red.spymaster).map(id => (
                        <div key={id} className="flex items-center gap-2 text-red-200 bg-red-900/20 p-2 rounded text-xs">
                             <User size={12} /> {players.find(p=>p.userId === id)?.nickname}
                        </div>
                    ))}
                </div>
            </div>

            {/* TIME AZUL */}
            <div className="flex-1 bg-blue-950/40 border-2 border-blue-800 rounded-2xl p-4 md:p-6 relative">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-black text-blue-500">AZUL</h2>
                    {myTeam !== 'blue' && <button onClick={() => joinTeam('blue')} className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-full hover:bg-blue-500 shadow-lg">ENTRAR</button>}
                </div>
                <div className="mb-4 p-3 bg-black/40 rounded-xl border border-blue-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Crown size={16} className={teams.blue.spymaster ? "text-blue-400" : "text-slate-700"} />
                        <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Espião Mestre</p>
                            <p className="font-bold text-blue-100 text-sm">{players.find(p=>p.userId === teams.blue.spymaster)?.nickname || '---'}</p>
                        </div>
                    </div>
                    {myTeam === 'blue' && !teams.blue.spymaster && (
                         <button onClick={() => becomeSpymaster('blue')} className="text-[10px] border border-blue-500 text-blue-400 px-2 py-1 rounded hover:bg-blue-900/30">ASSUMIR</button>
                    )}
                </div>
                <div className="space-y-1">
                    {teams.blue.members.filter(id => id !== teams.blue.spymaster).map(id => (
                        <div key={id} className="flex items-center gap-2 text-blue-200 bg-blue-900/20 p-2 rounded text-xs">
                             <User size={12} /> {players.find(p=>p.userId === id)?.nickname}
                        </div>
                    ))}
                </div>
            </div>
        </div>
        
        {isHost && (
            <div className="mt-8 text-center pb-8">
                <button 
                    onClick={startMatch}
                    disabled={!teams.red.spymaster || !teams.blue.spymaster}
                    className="bg-emerald-500 text-white font-black px-12 py-4 rounded-full text-lg shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition hover:bg-emerald-400 w-full md:w-auto"
                >
                    INICIAR MISSÃO
                </button>
            </div>
        )}
      </div>
    );
  }

  // --- TELA 2: JOGO ---
  
  const getCardStyle = (card) => {
      // Se tiver cor (foi revelado OU sou espião), mostra. Se não, mostra bege.
      if (!card.type) return "bg-[#eaddcf] text-slate-800 shadow-[0_3px_0_#c4a488] hover:-translate-y-0.5 cursor-pointer";
      
      const type = card.type; // red, blue, neutral, assassin
      const isRev = card.revealed;

      if (type === 'red') return isRev ? "bg-red-600 text-red-950 border-2 md:border-4 border-red-900 opacity-60 grayscale-[0.3]" : "bg-red-100 text-red-900 border-2 border-red-400";
      if (type === 'blue') return isRev ? "bg-blue-600 text-blue-950 border-2 md:border-4 border-blue-900 opacity-60 grayscale-[0.3]" : "bg-blue-100 text-blue-900 border-2 border-blue-400";
      if (type === 'neutral') return isRev ? "bg-[#d6c0ad] text-slate-500 opacity-40 scale-95" : "bg-[#fdf3e8] text-slate-500 border border-[#eaddcf]";
      if (type === 'assassin') return isRev ? "bg-slate-950 text-white border-2 border-red-500" : "bg-slate-800 text-white border border-slate-600";
  };

  const getStatusMessage = () => {
    if (currentPhase === 'GAME_OVER') return <span className="text-yellow-400 animate-pulse">FIM DE JOGO</span>;
    const teamName = currentTurn === 'red' ? 'VERMELHO' : 'AZUL';
    const textColor = currentTurn === 'red' ? 'text-red-400' : 'text-blue-400';
    return currentPhase === 'HINT' 
        ? <span className="text-sm md:text-xl">ESPIÃO <span className={textColor}>{teamName}</span> PENSANDO...</span>
        : <span className="text-sm md:text-xl">AGENTE <span className={textColor}>{teamName}</span> JOGANDO...</span>;
  };

  return (
    <div className="h-[100dvh] bg-slate-900 flex flex-col md:flex-row overflow-hidden">
        
        {/* SIDEBARS */}
        <div className="hidden md:flex w-64 h-full bg-slate-950 border-r border-white/5">
            <TeamSidebar color="red" teamData={teams.red} />
        </div>

        {/* ÁREA CENTRAL */}
        <div className="flex-1 flex flex-col relative h-full">
            
            {/* TOP BAR */}
            <div className="shrink-0 bg-slate-900/95 backdrop-blur border-b border-white/10 p-2 md:p-4 shadow-xl z-20 flex flex-col items-center">
                <div className="font-black text-white tracking-wide mb-2 text-center">
                    {getStatusMessage()}
                </div>
                
                {/* DICA ATIVA */}
                {gameData.hint?.word && currentPhase === 'GUESSING' && (
                    <div className="flex items-center gap-2 md:gap-4 animate-in slide-in-from-top bg-white/5 p-1 px-4 rounded-full border border-white/10">
                        <Eye size={16} className="text-indigo-400" />
                        <span className="text-lg md:text-2xl font-black uppercase text-white tracking-wider">{gameData.hint.word}</span>
                        <div className="bg-indigo-600 text-white w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-sm md:text-lg shadow-lg">
                            {gameData.hint.count}
                        </div>
                    </div>
                )}

                {currentPhase === 'GAME_OVER' && (
                    <div className="mt-2 bg-yellow-500 text-black px-6 py-1 rounded-lg font-black text-sm md:text-xl shadow-lg">
                        VITÓRIA {gameData.winner === 'red' ? 'VERMELHA' : 'AZUL'} 🏆
                    </div>
                )}
            </div>

            {/* TABULEIRO */}
            <div className="flex-1 overflow-y-auto p-2 md:p-8 flex flex-col items-center pb-24 scrollbar-hide">
                
                {/* FORM DO ESPIÃO */}
                {currentPhase === 'HINT' && isSpymaster && isTeamTurn && (
                    <form onSubmit={sendHint} className="sticky top-2 mb-4 flex gap-1 bg-slate-800 p-2 rounded-xl shadow-2xl border border-white/20 z-10 w-full max-w-md animate-in fade-in slide-in-from-top-4">
                        <input className="flex-1 bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 outline-none font-bold uppercase text-sm" placeholder="DICA" value={hintWord} onChange={e=>setHintWord(e.target.value)} maxLength={15}/>
                        <input className="w-12 bg-slate-900 text-white border border-slate-600 rounded-lg px-1 py-2 outline-none text-center font-bold text-sm" type="number" min="0" max="9" value={hintCount} onChange={e=>setHintCount(e.target.value)}/>
                        <button type="submit" className="bg-emerald-600 text-white px-3 rounded-lg hover:bg-emerald-500 shadow-md"><Flag size={16}/></button>
                    </form>
                )}

                {/* GRID */}
                <div className="grid grid-cols-5 gap-1.5 md:gap-3 w-full max-w-4xl mx-auto">
                    {grid.map((card) => (
                        <div 
                            key={card.id}
                            onClick={() => clickCard(card.id)}
                            className={`
                                aspect-[4/3] md:aspect-[3/2] rounded-md md:rounded-lg flex flex-col items-center justify-center text-center p-0.5 md:p-1 transition-all duration-200 select-none font-black text-[10px] md:text-sm uppercase leading-tight relative overflow-hidden
                                ${getCardStyle(card)}
                            `}
                        >
                            {card.revealed && card.type === 'assassin' && <Skull size={24} className="opacity-80"/>}
                            {!card.revealed && isSpymaster && card.type === 'assassin' && <Skull size={12} className="absolute top-0.5 right-0.5 opacity-40"/>}
                            <span className="z-10 relative break-all px-0.5">{card.word}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTÕES FLUTUANTES */}
            <div className="absolute bottom-16 md:bottom-8 right-4 md:right-8 z-50 flex flex-col gap-2">
                {currentPhase === 'GUESSING' && isTeamTurn && !isSpymaster && (
                    <button onClick={passTurn} className="bg-slate-800/90 backdrop-blur text-white font-bold px-4 py-3 rounded-full shadow-xl border border-slate-600 flex items-center gap-2 hover:bg-slate-700 active:scale-95">
                        <span className="hidden md:inline">PASSAR</span> <Flag size={20} className="text-yellow-400" />
                    </button>
                )}
                {/* BOTÃO DE SAIR SEMPRE VISÍVEL NO JOGO */}
                <button onClick={sairDoJogo} className="bg-red-900/80 text-white p-3 rounded-full shadow-xl border border-red-700 hover:bg-red-800" title="Sair">
                    <LogOut size={24}/>
                </button>
                
                {currentPhase === 'GAME_OVER' && isHost && (
                    <button onClick={() => socket.emit('restart_game', { roomId })} className="bg-yellow-400 text-black font-black p-3 md:px-6 rounded-full shadow-xl hover:scale-110 active:scale-95 border-2 border-white">
                        <RotateCcw size={24} />
                    </button>
                )}
            </div>

            {/* MOBILE BOTTOM BAR */}
            <div className="md:hidden shrink-0 bg-slate-950 border-t border-white/10 flex h-14">
                <div className={`flex-1 flex flex-col items-center justify-center ${currentTurn === 'red' ? 'bg-red-900/20' : ''}`}>
                    <span className="text-xs text-red-500 font-black">RED</span>
                    <span className="text-xl font-bold text-white leading-none">{gameData?.score?.red}</span>
                </div>
                <div className={`flex-1 flex flex-col items-center justify-center ${currentTurn === 'blue' ? 'bg-blue-900/20' : ''}`}>
                    <span className="text-xs text-blue-500 font-black">BLUE</span>
                    <span className="text-xl font-bold text-white leading-none">{gameData?.score?.blue}</span>
                </div>
            </div>
        </div>

        <div className="hidden md:flex w-64 h-full bg-slate-950 border-l border-white/5">
            <TeamSidebar color="blue" teamData={teams.blue} />
        </div>
    </div>
  );
}