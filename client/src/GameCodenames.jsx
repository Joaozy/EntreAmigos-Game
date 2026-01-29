import React, { useState } from 'react';
import { useGame } from './context/GameContext'; 
import { Crown, Eye, Skull, Flag, User, Shield, RotateCcw, LogOut, Users, Home, XCircle } from 'lucide-react';

export default function GameCodenames() {
  const { socket, roomId, isHost, gameData, players, user, sairDoJogo } = useGame();
  const myUserId = user?.id;
  
  const [hintWord, setHintWord] = useState('');
  const [hintCount, setHintCount] = useState(1);

  if (!gameData) return <div className="text-white text-center mt-20">Carregando Codenames...</div>;

  const teams = gameData?.teams || { red: { members: [] }, blue: { members: [] }, white: { members: [] } };
  const grid = gameData?.grid || [];
  const currentTurn = gameData?.turn; 
  const currentPhase = gameData?.phase || 'SETUP';

  // Verifica time
  let myTeam = null;
  if (teams.red?.members.includes(myUserId)) myTeam = 'red';
  else if (teams.blue?.members.includes(myUserId)) myTeam = 'blue';
  else if (teams.white?.members.includes(myUserId)) myTeam = 'white';
  
  const isSpymaster = [teams.red?.spymaster, teams.blue?.spymaster, teams.white?.spymaster].includes(myUserId);
  const isTeamTurn = currentTurn === myTeam;

  const joinTeam = (team) => socket.emit('cn_join_team', { roomId, team });
  const becomeSpymaster = (team) => socket.emit('cn_become_spymaster', { roomId, team });
  const demoteSpymaster = (team) => socket.emit('cn_demote_spymaster', { roomId, team }); // NOVO
  const startMatch = () => socket.emit('cn_start_match', { roomId });

  const sendHint = (e) => {
    e.preventDefault();
    if(hintWord.trim()) {
        socket.emit('cn_give_hint', { roomId, word: hintWord, count: parseInt(hintCount) });
        setHintWord('');
    }
  };

  const clickCard = (cardId) => {
    if (currentPhase === 'GUESSING' && isTeamTurn && !isSpymaster && !grid[cardId].revealed) {
        socket.emit('cn_click_card', { roomId, cardId });
    }
  };

  const passTurn = () => socket.emit('cn_pass_turn', { roomId });

  // Sidebar Genérica
  const TeamSidebar = ({ color, teamData }) => {
      if (!teamData) return null; // Proteção
      
      let colors = {
          red: { bg: 'bg-red-950/80 border-red-900', text: 'text-red-500', sub: 'text-red-100', dot: 'bg-red-500' },
          blue: { bg: 'bg-blue-950/80 border-blue-900', text: 'text-blue-500', sub: 'text-blue-100', dot: 'bg-blue-500' },
          white: { bg: 'bg-slate-300/10 border-slate-400', text: 'text-slate-200', sub: 'text-white', dot: 'bg-white' }
      };
      const theme = colors[color];
      
      const spymaster = players.find(p => p.userId === teamData.spymaster);
      const members = teamData.members.filter(id => id !== teamData.spymaster).map(id => players.find(p => p.userId === id));

      return (
          <div className={`flex-1 min-w-[200px] p-4 rounded-xl border-2 flex flex-col gap-4 ${theme.bg} transition-all duration-500`}>
              <div className="text-center border-b border-white/10 pb-2">
                  <h2 className={`text-2xl font-black uppercase tracking-widest ${theme.text}`}>
                      {color === 'red' ? 'Vermelho' : color === 'blue' ? 'Azul' : 'Branco'}
                  </h2>
                  <div className="text-4xl font-black text-white">{gameData?.score?.[color] || 0}</div>
              </div>
              <div className="bg-black/30 p-3 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1"><Crown size={12} /> Espião Mestre</p>
                  {spymaster ? (
                      <div className={`font-bold text-sm ${theme.sub} flex items-center gap-2`}><div className={`w-2 h-2 rounded-full ${theme.dot}`}></div>{spymaster.nickname}</div>
                  ) : <span className="text-slate-600 italic text-xs">Vazio</span>}
              </div>
              <div className="flex-1 overflow-y-auto">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1"><Shield size={12} /> Operadores</p>
                  <div className="space-y-1">
                      {members.length > 0 ? members.map(p => p && (
                          <div key={p.userId} className={`flex items-center gap-2 p-1.5 rounded bg-black/20 text-xs ${theme.sub}`}><User size={12} /><span className="font-medium truncate">{p.nickname}</span></div>
                      )) : <span className="text-slate-600 italic text-xs px-2">Nenhum</span>}
                  </div>
              </div>
          </div>
      );
  };

  // --- TELA 1: SETUP ---
  if (currentPhase === 'SETUP') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center pt-10 font-sans">
        <div className="absolute top-4 right-4 z-50">
            <button onClick={sairDoJogo} className="flex items-center gap-2 bg-white/10 hover:bg-red-900/80 px-4 py-2 rounded-full transition text-slate-300 hover:text-white">
                <LogOut size={18}/> <span className="text-xs font-bold uppercase hidden md:inline">Sair</span>
            </button>
        </div>

        <h1 className="text-3xl md:text-4xl font-black mb-8 tracking-widest uppercase text-slate-300">Recrutamento</h1>
        
        {/* GRID DE TIMES (Adaptável para 3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-7xl">
            {['red', 'blue', 'white'].map(color => {
                const theme = {
                    red: 'border-red-800 bg-red-950/40 text-red-500',
                    blue: 'border-blue-800 bg-blue-950/40 text-blue-500',
                    white: 'border-slate-500 bg-slate-800/40 text-slate-200'
                }[color];
                
                const btnTheme = {
                    red: 'bg-red-600 hover:bg-red-500',
                    blue: 'bg-blue-600 hover:bg-blue-500',
                    white: 'bg-slate-600 hover:bg-slate-500'
                }[color];

                return (
                    <div key={color} className={`flex-1 border-2 rounded-2xl p-4 relative ${theme}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-black uppercase">{color === 'white' ? 'BRANCO' : color === 'red' ? 'VERMELHO' : 'AZUL'}</h2>
                            {myTeam !== color && <button onClick={() => joinTeam(color)} className={`${btnTheme} text-white font-bold text-[10px] px-3 py-1.5 rounded-full shadow-lg hover:scale-105 transition`}>ENTRAR</button>}
                        </div>
                        
                        {/* CARD ESPIÃO */}
                        <div className="mb-4 p-3 bg-black/40 rounded-xl border border-white/5 flex justify-between items-center h-16">
                            <div className="flex items-center gap-2">
                                <Crown size={16} />
                                <div>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase">Espião Mestre</p>
                                    <p className="font-bold text-white text-sm">{players.find(p=>p.userId === teams[color]?.spymaster)?.nickname || '---'}</p>
                                </div>
                            </div>
                            
                            {/* Lógica dos Botões de Espião */}
                            {myTeam === color && !teams[color]?.spymaster && (
                                 <button onClick={() => becomeSpymaster(color)} className="text-[9px] border border-white/30 text-white/70 px-2 py-1 rounded hover:bg-white/10">ASSUMIR</button>
                            )}
                            {/* BOTÃO NOVO: DEIXAR O CARGO */}
                            {teams[color]?.spymaster === myUserId && (
                                 <button onClick={() => demoteSpymaster(color)} className="text-[9px] bg-red-900/80 text-red-200 px-2 py-1 rounded hover:bg-red-800 border border-red-700 flex items-center gap-1">
                                    <XCircle size={10}/> SAIR
                                 </button>
                            )}
                        </div>

                        <div className="space-y-1">
                            {teams[color]?.members.filter(id => id !== teams[color]?.spymaster).map(id => (
                                <div key={id} className="flex items-center gap-2 text-white/70 bg-black/20 p-2 rounded text-xs"><User size={12} /> {players.find(p=>p.userId === id)?.nickname}</div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
        
        {isHost && (
            <div className="mt-8 text-center pb-8">
                <button onClick={startMatch} disabled={!teams.red.spymaster || !teams.blue.spymaster} className="bg-emerald-500 text-white font-black px-12 py-4 rounded-full text-lg shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition hover:bg-emerald-400 w-full md:w-auto">INICIAR MISSÃO</button>
                {(!teams.red.spymaster || !teams.blue.spymaster) && <p className="text-slate-500 text-xs mt-2 uppercase">Precisa de Vermelho e Azul (Branco é opcional)</p>}
            </div>
        )}
      </div>
    );
  }

  // --- TELA 2: JOGO ---
  const getCardStyle = (card) => {
      if (!card.type) return "bg-[#eaddcf] text-slate-800 shadow-[0_3px_0_#c4a488] hover:-translate-y-0.5 cursor-pointer";
      
      const type = card.type; 
      const isRev = card.revealed;

      if (type === 'red') return isRev ? "bg-red-600 text-red-950 border-2 md:border-4 border-red-900 opacity-60 grayscale-[0.3]" : "bg-red-100 text-red-900 border-2 border-red-400";
      if (type === 'blue') return isRev ? "bg-blue-600 text-blue-950 border-2 md:border-4 border-blue-900 opacity-60 grayscale-[0.3]" : "bg-blue-100 text-blue-900 border-2 border-blue-400";
      if (type === 'white') return isRev ? "bg-white text-slate-900 border-2 md:border-4 border-slate-400 opacity-80" : "bg-slate-200 text-slate-800 border-2 border-slate-400"; // Novo Estilo Branco
      
      if (type === 'neutral') return isRev ? "bg-[#d6c0ad] text-slate-500 opacity-40 scale-95" : "bg-[#fdf3e8] text-slate-500 border border-[#eaddcf]";
      if (type === 'assassin') return isRev ? "bg-slate-950 text-white border-2 border-red-500" : "bg-slate-800 text-white border border-slate-600";
  };

  const getStatusMessage = () => {
    if (currentPhase === 'GAME_OVER') return <span className="text-yellow-400 animate-pulse">FIM DE JOGO</span>;
    
    const colors = { red: 'text-red-400', blue: 'text-blue-400', white: 'text-white' };
    const names = { red: 'VERMELHO', blue: 'AZUL', white: 'BRANCO' };
    
    return currentPhase === 'HINT' 
        ? <span className="text-sm md:text-xl">ESPIÃO <span className={colors[currentTurn]}>{names[currentTurn]}</span> PENSANDO...</span> 
        : <span className="text-sm md:text-xl">AGENTE <span className={colors[currentTurn]}>{names[currentTurn]}</span> JOGANDO...</span>;
  };

  return (
    <div className="h-[100dvh] bg-slate-900 flex flex-col font-sans">
        {/* TOP BAR / HEADER */}
        <div className="shrink-0 bg-slate-950 border-b border-white/10 p-2 md:p-4 shadow-xl z-20 flex justify-between items-center relative">
            <div className="w-10"></div>
            <div className="flex flex-col items-center">
                <div className="font-black text-white tracking-wide text-center">{getStatusMessage()}</div>
                {gameData.hint?.word && currentPhase === 'GUESSING' && (
                    <div className="flex items-center gap-2 mt-1 animate-in slide-in-from-top bg-white/5 px-3 py-0.5 rounded-full border border-white/10">
                        <Eye size={14} className="text-indigo-400" />
                        <span className="text-md font-black uppercase text-white tracking-wider">{gameData.hint.word}</span>
                        <span className="bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs">{gameData.hint.count}</span>
                    </div>
                )}
                {currentPhase === 'GAME_OVER' && <div className="mt-1 bg-yellow-500 text-black px-4 py-0.5 rounded-lg font-black text-sm shadow-lg">VITÓRIA {gameData.winner?.toUpperCase()} 🏆</div>}
            </div>
            <button onClick={sairDoJogo} className="p-2 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white" title="Sair do Jogo"><Home size={24}/></button>
        </div>

        {/* ÁREA PRINCIPAL (SIDEBARS + GRID) */}
        <div className="flex-1 flex overflow-hidden">
            {/* SIDEBAR ESQUERDA (VERMELHO) */}
            <div className="hidden md:block w-48 bg-red-950/20 border-r border-red-900/30 overflow-y-auto">
                <TeamSidebar color="red" teamData={teams.red} />
            </div>

            {/* MEIO (TABULEIRO) */}
            <div className="flex-1 overflow-y-auto p-2 md:p-8 flex flex-col items-center pb-32 scrollbar-hide relative bg-slate-900">
                {currentPhase === 'HINT' && isSpymaster && isTeamTurn && (
                    <form onSubmit={sendHint} className="sticky top-2 mb-4 flex gap-1 bg-slate-800 p-2 rounded-xl shadow-2xl border border-white/20 z-10 w-full max-w-md animate-in fade-in slide-in-from-top-4">
                        <input className="flex-1 bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 outline-none font-bold uppercase text-sm" placeholder="DICA" value={hintWord} onChange={e=>setHintWord(e.target.value)} maxLength={15}/>
                        <input className="w-12 bg-slate-900 text-white border border-slate-600 rounded-lg px-1 py-2 outline-none text-center font-bold text-sm" type="number" min="0" max="9" value={hintCount} onChange={e=>setHintCount(e.target.value)}/>
                        <button type="submit" className="bg-emerald-600 text-white px-3 rounded-lg hover:bg-emerald-500 shadow-md"><Flag size={16}/></button>
                    </form>
                )}
                <div className="grid grid-cols-5 gap-1.5 md:gap-3 w-full max-w-4xl mx-auto">
                    {grid.map((card) => (
                        <div key={card.id} onClick={() => clickCard(card.id)} className={`aspect-[4/3] md:aspect-[3/2] rounded-md md:rounded-lg flex flex-col items-center justify-center text-center p-0.5 md:p-1 transition-all duration-200 select-none font-black text-[10px] md:text-sm uppercase leading-tight relative overflow-hidden ${getCardStyle(card)}`}>
                            {card.revealed && card.type === 'assassin' && <Skull size={24} className="opacity-80"/>}
                            {!card.revealed && isSpymaster && card.type === 'assassin' && <Skull size={12} className="absolute top-0.5 right-0.5 opacity-40"/>}
                            <span className="z-10 relative break-all px-0.5">{card.word}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* SIDEBAR DIREITA (AZUL) */}
            <div className="hidden md:block w-48 bg-blue-950/20 border-l border-blue-900/30 overflow-y-auto">
                <TeamSidebar color="blue" teamData={teams.blue} />
            </div>
        </div>

        {/* BOTTOM BAR / STATS (BRANCO + MOBILE) */}
        <div className="shrink-0 bg-slate-950 border-t border-white/10 flex h-16 md:h-20 relative z-30">
            {/* Lado a lado stats para mobile, ou Time Branco para Desktop */}
            <div className={`flex-1 flex items-center justify-around px-4 ${teams.white?.members.length > 0 ? 'bg-slate-800/30' : ''}`}>
                <div className="flex flex-col items-center md:hidden text-red-500"><span className="text-[10px] font-black">RED</span><span className="text-xl font-bold">{gameData?.score?.red}</span></div>
                
                {/* TIME BRANCO (SE EXISTIR) */}
                {teams.white?.members.length > 0 && (
                    <div className="flex flex-col items-center text-white border-x border-white/10 px-8">
                        <span className="text-[10px] font-black">BRANCO</span>
                        <span className="text-2xl font-bold">{gameData?.score?.white}</span>
                        <div className="flex gap-1 text-[9px] text-slate-400">
                            {teams.white.spymaster ? <Crown size={10} className="text-yellow-400"/> : null}
                            <span>{teams.white.members.length - (teams.white.spymaster ? 1 : 0)} Agentes</span>
                        </div>
                    </div>
                )}

                <div className="flex flex-col items-center md:hidden text-blue-500"><span className="text-[10px] font-black">BLUE</span><span className="text-xl font-bold">{gameData?.score?.blue}</span></div>
            </div>

            {/* BOTÕES DE AÇÃO (CENTRALIZADOS) */}
            <div className="absolute top-[-4rem] left-0 w-full flex justify-center pointer-events-none">
                <div className="pointer-events-auto flex gap-2">
                    {currentPhase === 'GUESSING' && isTeamTurn && !isSpymaster && (
                        <button onClick={passTurn} className="bg-slate-800/90 backdrop-blur text-white font-bold px-6 py-3 rounded-full shadow-xl border border-slate-600 flex items-center gap-2 hover:bg-slate-700 active:scale-95">
                            PASSAR VEZ <Flag size={20} className="text-yellow-400" />
                        </button>
                    )}
                    {currentPhase === 'GAME_OVER' && isHost && (
                        <>
                            <button onClick={() => socket.emit('cn_back_to_setup', { roomId })} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-full shadow-xl flex items-center justify-center gap-2 border-2 border-slate-500">
                                <Users size={20}/> TIMES
                            </button>
                            <button onClick={() => socket.emit('restart_game', { roomId })} className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-full shadow-xl flex items-center justify-center gap-2 border-2 border-green-400">
                                <RotateCcw size={20}/> REINICIAR
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}