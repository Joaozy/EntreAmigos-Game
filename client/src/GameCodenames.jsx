import React, { useState } from 'react';
import { socket } from './socket';
import { Crown, Eye, Skull, Flag, User, Shield } from 'lucide-react';

export default function GameCodenames({ players, isHost, roomId, gameData, phase }) {
  const [hintWord, setHintWord] = useState('');
  const [hintCount, setHintCount] = useState(1);

  const teams = gameData?.teams || { red: { members: [] }, blue: { members: [] } };
  const grid = gameData?.grid || [];
  const currentTurn = gameData?.turn; // 'red' ou 'blue'
  const currentPhase = gameData?.phase; // 'SETUP', 'HINT', 'GUESSING', 'GAME_OVER'

  const myId = socket.id;
  const myTeam = teams.red.members.includes(myId) ? 'red' : teams.blue.members.includes(myId) ? 'blue' : null;
  const isSpymaster = teams.red.spymaster === myId || teams.blue.spymaster === myId;
  const isTeamTurn = currentTurn === myTeam;

  // SETUP
  const joinTeam = (team) => socket.emit('cn_join_team', { roomId, team });
  const becomeSpymaster = (team) => socket.emit('cn_become_spymaster', { roomId, team });
  const startMatch = () => socket.emit('cn_start_match', { roomId });

  // AÇÕES DE JOGO
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

  // Componente: Lista de Jogadores na Lateral
  const TeamSidebar = ({ color, teamData }) => {
      const isRed = color === 'red';
      const bgColor = isRed ? 'bg-red-950/80 border-red-900' : 'bg-blue-950/80 border-blue-900';
      const textColor = isRed ? 'text-red-100' : 'text-blue-100';
      const titleColor = isRed ? 'text-red-500' : 'text-blue-500';
      
      const spymaster = players.find(p => p.id === teamData.spymaster);
      const members = teamData.members.filter(id => id !== teamData.spymaster).map(id => players.find(p => p.id === id));

      return (
          <div className={`flex-1 min-w-[200px] p-4 rounded-xl border-2 flex flex-col gap-4 ${bgColor} transition-all duration-500`}>
              {/* Cabeçalho do Time */}
              <div className="text-center border-b border-white/10 pb-2">
                  <h2 className={`text-3xl font-black uppercase tracking-widest ${titleColor}`}>
                      {isRed ? 'Vermelho' : 'Azul'}
                  </h2>
                  <div className={`text-4xl font-black ${isRed ? 'text-white' : 'text-white'}`}>
                      {gameData?.score?.[color] || 0}
                  </div>
                  <span className="text-[10px] uppercase text-slate-400">Agentes Restantes</span>
              </div>

              {/* Espião Mestre */}
              <div className="bg-black/30 p-3 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                      <Crown size={12} /> Espião Mestre
                  </p>
                  {spymaster ? (
                      <div className={`font-bold text-lg ${textColor} flex items-center gap-2`}>
                          <div className={`w-2 h-2 rounded-full ${isRed ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                          {spymaster.nickname}
                      </div>
                  ) : (
                      <span className="text-slate-600 italic text-sm">Vazio</span>
                  )}
              </div>

              {/* Operadores */}
              <div className="flex-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1">
                      <Shield size={12} /> Operadores
                  </p>
                  <div className="space-y-2">
                      {members.length > 0 ? members.map(p => p && (
                          <div key={p.id} className={`flex items-center gap-2 p-2 rounded bg-black/20 ${textColor}`}>
                              <User size={14} />
                              <span className="font-medium">{p.nickname}</span>
                          </div>
                      )) : (
                          <span className="text-slate-600 italic text-sm px-2">Nenhum operador</span>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  // --- TELA 1: SETUP (ESCOLHA DE TIMES) ---
  if (currentPhase === 'SETUP') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center pt-10">
        <h1 className="text-4xl font-black mb-8 tracking-widest uppercase">Recrutamento</h1>
        
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl">
            {/* SETUP VERMELHO */}
            <div className="flex-1 bg-red-950/40 border-2 border-red-800 rounded-2xl p-6 relative">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black text-red-500">VERMELHO</h2>
                    {!myTeam && <button onClick={() => joinTeam('red')} className="bg-red-600 text-white font-bold px-6 py-2 rounded-full hover:bg-red-500 shadow-lg">ENTRAR</button>}
                </div>
                
                {/* Slot Espião */}
                <div className="mb-6 p-4 bg-black/40 rounded-xl border border-red-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Crown className={teams.red.spymaster ? "text-red-400" : "text-slate-700"} />
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase">Espião Mestre</p>
                            <p className="font-bold text-red-100">{players.find(p=>p.id === teams.red.spymaster)?.nickname || '---'}</p>
                        </div>
                    </div>
                    {myTeam === 'red' && !teams.red.spymaster && (
                         <button onClick={() => becomeSpymaster('red')} className="text-xs border border-red-500 text-red-400 px-3 py-1 rounded hover:bg-red-900/30">ASSUMIR LIDERANÇA</button>
                    )}
                </div>

                <div className="space-y-1">
                    <p className="text-xs text-slate-500 uppercase font-bold mb-2">Operadores de Campo</p>
                    {teams.red.members.filter(id => id !== teams.red.spymaster).map(id => (
                        <div key={id} className="flex items-center gap-2 text-red-200 bg-red-900/20 p-2 rounded">
                             <User size={14} /> {players.find(p=>p.id === id)?.nickname}
                        </div>
                    ))}
                </div>
            </div>

            {/* SETUP AZUL */}
            <div className="flex-1 bg-blue-950/40 border-2 border-blue-800 rounded-2xl p-6 relative">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black text-blue-500">AZUL</h2>
                    {!myTeam && <button onClick={() => joinTeam('blue')} className="bg-blue-600 text-white font-bold px-6 py-2 rounded-full hover:bg-blue-500 shadow-lg">ENTRAR</button>}
                </div>
                
                {/* Slot Espião */}
                <div className="mb-6 p-4 bg-black/40 rounded-xl border border-blue-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Crown className={teams.blue.spymaster ? "text-blue-400" : "text-slate-700"} />
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase">Espião Mestre</p>
                            <p className="font-bold text-blue-100">{players.find(p=>p.id === teams.blue.spymaster)?.nickname || '---'}</p>
                        </div>
                    </div>
                    {myTeam === 'blue' && !teams.blue.spymaster && (
                         <button onClick={() => becomeSpymaster('blue')} className="text-xs border border-blue-500 text-blue-400 px-3 py-1 rounded hover:bg-blue-900/30">ASSUMIR LIDERANÇA</button>
                    )}
                </div>

                <div className="space-y-1">
                    <p className="text-xs text-slate-500 uppercase font-bold mb-2">Operadores de Campo</p>
                    {teams.blue.members.filter(id => id !== teams.blue.spymaster).map(id => (
                        <div key={id} className="flex items-center gap-2 text-blue-200 bg-blue-900/20 p-2 rounded">
                             <User size={14} /> {players.find(p=>p.id === id)?.nickname}
                        </div>
                    ))}
                </div>
            </div>
        </div>
        
        {isHost && (
            <div className="mt-12 text-center">
                <button 
                    onClick={startMatch}
                    disabled={!teams.red.spymaster || !teams.blue.spymaster}
                    className="bg-emerald-500 text-white font-black px-16 py-4 rounded-full text-xl shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition hover:bg-emerald-400"
                >
                    INICIAR MISSÃO
                </button>
                {(!teams.red.spymaster || !teams.blue.spymaster) && (
                    <p className="text-red-400 text-xs mt-3 font-bold animate-pulse">Aguardando Espiões Mestres...</p>
                )}
            </div>
        )}
      </div>
    );
  }

  // --- TELA 2: JOGO (TABULEIRO COM SIDEBARS) ---
  const getCardStyle = (card) => {
      const showColor = card.revealed || isSpymaster || currentPhase === 'GAME_OVER';
      if (!showColor) return "bg-[#eaddcf] text-slate-700 shadow-[0_4px_0_#d6c0ad] hover:-translate-y-1 cursor-pointer";
      
      if (card.type === 'red') return card.revealed ? "bg-red-600 text-red-950 border-4 border-red-900 opacity-60" : "bg-red-100 text-red-900 border-2 border-red-400";
      if (card.type === 'blue') return card.revealed ? "bg-blue-600 text-blue-950 border-4 border-blue-900 opacity-60" : "bg-blue-100 text-blue-900 border-2 border-blue-400";
      if (card.type === 'neutral') return card.revealed ? "bg-[#d6c0ad] text-slate-500 opacity-40" : "bg-[#fdf3e8] text-slate-500 border-2 border-[#eaddcf]";
      if (card.type === 'assassin') return card.revealed ? "bg-slate-900 text-white border-4 border-black" : "bg-slate-800 text-white border-2 border-slate-600";
  };

  const getStatusMessage = () => {
    if (currentPhase === 'GAME_OVER') return <span className="text-yellow-400">JOGO ENCERRADO</span>;
    const teamName = currentTurn === 'red' ? 'VERMELHO' : 'AZUL';
    const textColor = currentTurn === 'red' ? 'text-red-400' : 'text-blue-400';
    
    if (currentPhase === 'HINT') return <span>VEZ DO ESPIÃO <span className={textColor}>{teamName}</span></span>;
    if (currentPhase === 'GUESSING') return <span>VEZ DOS OPERADORES <span className={textColor}>{teamName}</span></span>;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col md:flex-row h-screen overflow-hidden">
        
        {/* SIDEBAR VERMELHO (Esquerda) */}
        <div className="hidden md:flex w-64 p-4 h-full bg-slate-950 border-r border-white/5">
            <TeamSidebar color="red" teamData={teams.red} />
        </div>

        {/* ÁREA CENTRAL (Tabuleiro) */}
        <div className="flex-1 flex flex-col relative bg-slate-900 h-full overflow-y-auto">
            
            {/* STATUS BAR SUPERIOR */}
            <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-white/10 p-4 shadow-xl flex flex-col items-center">
                <div className="flex items-center gap-4 mb-2">
                    <div className="text-xs font-bold bg-slate-800 px-3 py-1 rounded-full text-slate-400 uppercase tracking-widest">
                        Status da Missão
                    </div>
                </div>
                <div className="text-xl md:text-2xl font-black text-white uppercase tracking-wide">
                    {getStatusMessage()}
                </div>
                
                {/* DICA ATIVA (PARA OPERADORES) */}
                {gameData.hint?.word && currentPhase === 'GUESSING' && (
                    <div className="mb-6 flex flex-col items-center animate-in slide-in-from-top">
                        <div className="bg-white text-slate-900 px-10 py-3 rounded-full font-black shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center gap-3">
                            <Eye className="text-indigo-600" />
                            <span className="text-2xl uppercase tracking-wider">{gameData.hint.word}</span>
                            <span className="bg-slate-900 text-white px-3 py-0.5 rounded-full text-lg">{gameData.hint.count}</span>
                        </div>
                        
                        {/* Contador de Palpites Restantes */}
                        <div className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400 bg-black/40 px-3 py-1 rounded-full">
                            Palpites Usados: <span className="text-white">{gameData.guessesCount || 0}</span> / <span className="text-yellow-400">{gameData.hint.count + 1}</span>
                        </div>
                    </div>
                )}

                {/* GAME OVER BANNER */}
                {currentPhase === 'GAME_OVER' && (
                    <div className="mt-4 bg-yellow-500 text-slate-900 px-10 py-3 rounded-xl font-black text-2xl animate-bounce shadow-xl">
                        VITÓRIA DO TIME {gameData.winner === 'red' ? 'VERMELHO' : 'AZUL'}!
                    </div>
                )}
            </div>

            {/* TABULEIRO SCROLLÁVEL */}
            <div className="flex-1 p-4 md:p-8 flex flex-col items-center">
                {/* INPUT DO ESPIÃO (Fixo no topo da área se for a vez) */}
                {currentPhase === 'HINT' && isSpymaster && isTeamTurn && (
                    <form onSubmit={sendHint} className="mb-8 flex gap-2 bg-slate-800 p-4 rounded-2xl shadow-2xl border border-white/10 animate-in zoom-in">
                        <input className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-3 outline-none w-48 font-bold uppercase" placeholder="PALAVRA" value={hintWord} onChange={e=>setHintWord(e.target.value)} autoFocus maxLength={20}/>
                        <input className="bg-slate-900 text-white border border-slate-700 rounded-lg px-2 py-3 outline-none w-16 text-center font-bold" type="number" min="0" max="9" value={hintCount} onChange={e=>setHintCount(e.target.value)}/>
                        <button type="submit" className="bg-emerald-500 text-white font-bold px-6 rounded-lg hover:bg-emerald-400 shadow-lg">TRANSMITIR</button>
                    </form>
                )}

                <div className="grid grid-cols-5 gap-2 md:gap-4 w-full max-w-4xl pb-24">
                    {grid.map((card) => (
                        <div 
                            key={card.id}
                            onClick={() => clickCard(card.id)}
                            className={`
                                h-16 md:h-24 rounded-lg flex flex-col items-center justify-center text-center p-1 transition-all duration-200 select-none font-black text-[9px] md:text-sm uppercase leading-tight relative overflow-hidden
                                ${getCardStyle(card)}
                            `}
                        >
                            {card.revealed && card.type === 'assassin' && <Skull size={32} className="opacity-80"/>}
                            {!card.revealed && isSpymaster && card.type === 'assassin' && <Skull size={16} className="absolute top-1 right-1 opacity-50"/>}
                            <span className="z-10 relative drop-shadow-sm">{card.word}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTÕES FLUTUANTES INFERIORES */}
            <div className="fixed bottom-6 right-6 md:right-[22%] z-50">
                {currentPhase === 'GUESSING' && isTeamTurn && !isSpymaster && (
                    <button onClick={passTurn} className="bg-slate-800 text-white font-bold px-6 py-3 rounded-full shadow-2xl hover:bg-slate-700 flex items-center gap-2 border border-slate-600 animate-bounce">
                        PASSAR A VEZ <Flag size={18} />
                    </button>
                )}
                {currentPhase === 'GAME_OVER' && isHost && (
                    <button onClick={() => socket.emit('restart_game', { roomId })} className="bg-yellow-400 text-black font-black px-8 py-3 rounded-full shadow-2xl hover:scale-105 border-4 border-yellow-200">
                        REINICIAR JOGO 🔄
                    </button>
                )}
            </div>
        </div>

        {/* SIDEBAR AZUL (Direita) - Mostra embaixo no Mobile se quiser, mas aqui vou esconder no mobile pra simplificar e manter foco no grid */}
        <div className="hidden md:flex w-64 p-4 h-full bg-slate-950 border-l border-white/5">
            <TeamSidebar color="blue" teamData={teams.blue} />
        </div>

        {/* MOBILE TEAM INDICATORS (Barra inferior apenas no celular) */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-950 border-t border-white/10 flex text-xs">
            <div className={`flex-1 p-2 text-center ${currentTurn === 'red' ? 'bg-red-900/30 text-white' : 'text-slate-500'}`}>
                <div className="font-bold text-red-500">VERMELHO ({gameData?.score?.red})</div>
                <div className="truncate text-[10px]">{teams.red.members.length} Agentes</div>
            </div>
            <div className={`flex-1 p-2 text-center ${currentTurn === 'blue' ? 'bg-blue-900/30 text-white' : 'text-slate-500'}`}>
                <div className="font-bold text-blue-500">AZUL ({gameData?.score?.blue})</div>
                <div className="truncate text-[10px]">{teams.blue.members.length} Agentes</div>
            </div>
        </div>

    </div>
  );
}