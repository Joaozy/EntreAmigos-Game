import React, { useEffect, useState } from 'react';
import { socket } from './socket';

// Importação dos Componentes dos Jogos
import GameTable from './GameTable';         
import GameChaCafe from './GameChaCafe';     
import GameCodenames from './GameCodenames'; 
import GameStop from './GameStop';           
import GameTermo from './GameTermo'; 
import GameSpy from './GameSpy'; // <--- IMPORTANTE: O novo jogo

import Chat from './Chat';

// Ícones
import { Trash2, Gamepad2, Coffee, Loader2, LogOut, Eye, Hand, LayoutGrid, UserSecret, User, Users, Users2 } from 'lucide-react';

// --- CONFIGURAÇÃO DOS JOGOS ---
const GAMES_CONFIG = [
  { 
    id: 'TERMO', 
    name: 'Termo', 
    minPlayers: 1, 
    category: 'SOLO / VERSUS (1+)', 
    desc: 'Acerte a palavra de 5 letras.', 
    icon: LayoutGrid, 
    color: 'emerald',
    iconColor: 'bg-emerald-600'
  },
  { 
    id: 'STOP', 
    name: 'Stop!', 
    minPlayers: 2, 
    category: 'PEQUENOS GRUPOS (2+)', 
    desc: 'Adedonha clássica rápida.', 
    icon: Hand, 
    color: 'purple',
    iconColor: 'bg-purple-600'
  },
  { 
    id: 'ITO', 
    name: 'ITO', 
    minPlayers: 2, 
    category: 'PEQUENOS GRUPOS (2+)', 
    desc: 'Sincronia e cooperação.', 
    icon: Gamepad2, 
    color: 'indigo',
    iconColor: 'bg-indigo-600'
  },
  { 
    id: 'CHA_CAFE', 
    name: 'Chá ou Café', 
    minPlayers: 2, 
    category: 'PEQUENOS GRUPOS (2+)', 
    desc: 'Adivinhação por contexto.', 
    icon: Coffee, 
    color: 'pink',
    iconColor: 'bg-pink-600'
  },
  { 
    id: 'SPY', 
    name: 'O Espião', 
    minPlayers: 3, 
    category: 'GALERA E TIMES (4+)', 
    desc: 'Descubra o intruso.', 
    icon: UserSecret, 
    color: 'red',
    iconColor: 'bg-red-600'
  },
  { 
    id: 'CODENAMES', 
    name: 'Código Secreto', 
    minPlayers: 4, 
    category: 'GALERA E TIMES (4+)', 
    desc: 'Espiões, dicas e times.', 
    icon: Eye, 
    color: 'teal',
    iconColor: 'bg-teal-600'
  }
];

export default function App() {
  let savedRoom = localStorage.getItem('saved_roomId');
  let savedNick = localStorage.getItem('saved_nickname');

  if (savedRoom && !savedNick) {
      localStorage.removeItem('saved_roomId');
      savedRoom = null;
  }
  
  const [view, setView] = useState((savedRoom && savedNick) ? 'LOADING' : 'HOME');
  const [currentPhase, setCurrentPhase] = useState('LOBBY');
  
  const [nickname, setNickname] = useState(savedNick || '');
  const [roomId, setRoomId] = useState(savedRoom || '');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  
  const [selectedGame, setSelectedGame] = useState('ITO'); 
  const [gameType, setGameType] = useState(null);          
  const [gameData, setGameData] = useState({});            
  const [mySecret, setMySecret] = useState(null);          
  const [gameResult, setGameResult] = useState(null);

  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const tentarReconectar = () => {
        const sRoom = localStorage.getItem('saved_roomId');
        const sNick = localStorage.getItem('saved_nickname');
        if (sRoom && sNick) {
            socket.emit('rejoin_room', { roomId: sRoom, nickname: sNick });
        }
    };

    if (!socket.connected) socket.connect();
    else tentarReconectar(); 

    const onConnect = () => tentarReconectar();
    socket.on('connect', onConnect);
    
    socket.on('joined_room', (data) => { 
      handleJoinSuccess(data.roomId, data.isHost);
      setPlayers(data.players); 
      setGameType(data.gameType);
      if(data.gameData) setGameData(data.gameData);
      if (data.mySecretNumber) setMySecret(data.mySecretNumber);

      if (data.phase !== 'LOBBY') {
        setCurrentPhase(data.phase);
        setView('GAME');
      } else {
        setView('LOBBY');
      }
    });

    socket.on('room_created', (id) => handleJoinSuccess(id, true));
    socket.on('update_players', (p) => setPlayers(p));
    
    socket.on('game_started', (data) => { 
      setPlayers(data.players); 
      setGameType(data.gameType); 
      setGameData(data.gameData);
      setCurrentPhase(data.phase);
      setGameResult(null); 
      setView('GAME'); 
    });

    socket.on('update_game_data', ({ gameData, phase }) => {
        setGameData(gameData);
        setCurrentPhase(phase);
    });

    socket.on('your_secret_number', (n) => setMySecret(n));
    socket.on('phase_change', (data) => { setCurrentPhase(data.phase); setPlayers(data.players); });
    socket.on('player_submitted', ({ playerId }) => {
      setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p));
    });
    socket.on('order_updated', (p) => setPlayers(p));
    
    socket.on('game_over', (data) => {
      if(data.winnerWord || data.winner || data.secretWord) { 
          setCurrentPhase(data.phase || 'VICTORY'); 
          setGameData(prev => ({
              ...prev,
              ...(data.gameData || {}),
              targetWord: data.targetWord || prev.targetWord,
              secretWord: data.secretWord || prev.secretWord, 
              winner: data.winner || prev.winner
          }));
      } else if (data.results) { 
          setGameResult(data);
          setPlayers(data.results); 
          setCurrentPhase('REVEAL'); 
      } else if (data.gameData && data.phase === 'REVEAL') {
          setGameData(data.gameData);
          setCurrentPhase('REVEAL');
      }
    });

    socket.on('kicked', () => { alert("Você foi expulso da sala."); sairDoJogo(); });
    socket.on('error_msg', (msg) => {
        if (view === 'LOADING') { alert("Não foi possível voltar: " + msg); sairDoJogo(); } else { alert(msg); }
        setIsJoining(false);
    });

    return () => { socket.off('connect', onConnect); socket.disconnect(); };
  }, []);

  const limparDadosLocais = () => { localStorage.removeItem('saved_roomId'); localStorage.removeItem('saved_nickname'); };
  const sairDoJogo = () => { limparDadosLocais(); setRoomId(''); setPlayers([]); setIsHost(false); setView('HOME'); setIsJoining(false); socket.disconnect(); window.location.href = "/"; };
  const handleJoinSuccess = (id, hostStatus) => { setRoomId(id); setIsHost(hostStatus); setIsJoining(false); localStorage.setItem('saved_roomId', id); };
  const entrar = () => { if(nickname && roomId && !isJoining) { setIsJoining(true); localStorage.setItem('saved_nickname', nickname); if (!socket.connected) socket.connect(); socket.emit('join_room', { roomId, nickname }); } };
  const criar = () => { if(nickname && !isJoining) { setIsJoining(true); localStorage.setItem('saved_nickname', nickname); if (!socket.connected) socket.connect(); socket.emit('create_room', { nickname, gameType: selectedGame }); } };
  const iniciar = () => socket.emit('start_game', { roomId });
  const expulsar = (targetId) => { if(confirm("Expulsar este jogador?")) socket.emit('kick_player', { roomId, targetId }); }

  const selectedGameObj = GAMES_CONFIG.find(g => g.id === selectedGame) || GAMES_CONFIG[0];
  const activeGameId = gameType || 'ITO'; 
  const activeGameObj = GAMES_CONFIG.find(g => g.id === activeGameId) || GAMES_CONFIG[0];
  
  const canStart = players.length >= activeGameObj.minPlayers;

  if (view === 'LOADING') return (<div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 text-center"><Loader2 className="w-16 h-16 animate-spin text-indigo-500 mb-4" /><h2 className="text-xl font-bold">Reconectando...</h2><button onClick={sairDoJogo} className="mt-8 text-red-400 text-sm border border-red-900/50 p-2 rounded bg-red-900/20">Cancelar</button></div>);

  if (view === 'HOME') {
    const categories = ['SOLO / VERSUS (1+)', 'PEQUENOS GRUPOS (2+)', 'GALERA E TIMES (4+)'];
    
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center p-6 font-sans">
        <div className="text-center mb-10 mt-8">
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">ENTREAMIGOS</h1>
          <p className="text-slate-400 text-lg">Escolha o jogo ideal para seu grupo</p>
        </div>

        <div className="w-full max-w-6xl space-y-10 mb-10">
          {categories.map(cat => {
             const gamesInCat = GAMES_CONFIG.filter(g => g.category === cat);
             if (gamesInCat.length === 0) return null;

             return (
               <div key={cat} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <h3 className="text-slate-500 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                    {cat.includes('1+') && <User size={16}/>}
                    {cat.includes('2+') && <Users2 size={16}/>}
                    {cat.includes('4+') && <Users size={16}/>}
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {gamesInCat.map(game => (
                      <div 
                        key={game.id} 
                        onClick={() => { setSelectedGame(game.id); setView('LOGIN'); }} 
                        className={`group bg-slate-800/50 hover:bg-slate-800 rounded-2xl p-5 cursor-pointer border-2 border-slate-700 hover:border-${game.color}-500 transition-all hover:-translate-y-1 relative overflow-hidden`}
                      >
                         <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition`}>
                            <game.icon size={80} />
                         </div>
                         <div className={`w-12 h-12 ${game.iconColor} rounded-xl flex items-center justify-center mb-3 text-white shadow-lg`}>
                            <game.icon size={24} />
                         </div>
                         <h2 className="text-lg font-bold text-white">{game.name}</h2>
                         <p className="text-slate-400 text-xs mt-1">{game.desc}</p>
                         <div className="mt-3 inline-block bg-slate-900/50 px-2 py-1 rounded text-[10px] font-bold text-slate-500">
                            Mín. {game.minPlayers} jogadores
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             );
          })}
        </div>
      </div>
    );
  }

  if (view === 'LOGIN') {
      const theme = GAMES_CONFIG.find(g => g.id === selectedGame) || GAMES_CONFIG[0];
      let btnClass = "bg-slate-600";
      if(theme.color === 'indigo') btnClass = "bg-indigo-600 hover:bg-indigo-700";
      if(theme.color === 'pink') btnClass = "bg-pink-600 hover:bg-pink-700";
      if(theme.color === 'teal') btnClass = "bg-teal-600 hover:bg-teal-700";
      if(theme.color === 'purple') btnClass = "bg-purple-600 hover:bg-purple-700";
      if(theme.color === 'emerald') btnClass = "bg-emerald-600 hover:bg-emerald-700";
      if(theme.color === 'red') btnClass = "bg-red-600 hover:bg-red-700";

      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 relative animate-in zoom-in-95">
            <button onClick={() => setView('HOME')} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">← Voltar</button>
            <div className="text-center pt-4">
              <h1 className="text-3xl font-black text-slate-800">Preparar Jogo</h1>
              <div className="flex items-center justify-center gap-2 mt-2">
                 <theme.icon size={20} className={`text-${theme.color}-600`} />
                 <p className={`text-${theme.color}-600 text-sm font-bold uppercase tracking-wider`}>{theme.name}</p>
              </div>
            </div>
            <input className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold outline-none" placeholder="Seu Apelido" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12}/>
            <button className={`w-full text-white p-4 rounded-xl font-bold shadow-lg transition ${btnClass}`} onClick={criar} disabled={isJoining || !nickname}>{isJoining ? 'Criando...' : 'Criar Nova Sala'}</button>
            <div className="flex gap-2"><input className="flex-1 bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-center outline-none uppercase" placeholder="CÓDIGO" value={roomId} onChange={e => setRoomId(e.target.value)} maxLength={4}/><button className="bg-slate-800 text-white px-6 rounded-xl font-bold" onClick={entrar} disabled={isJoining || !nickname || !roomId}>Entrar</button></div>
          </div>
        </div>
      );
  }

  if (view === 'LOBBY') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative animate-in zoom-in-95">
        <div className="flex justify-between items-start mb-6"><button onClick={sairDoJogo} className="text-xs font-bold text-red-400 hover:text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1"><LogOut size={12}/> SAIR</button><h1 className="text-4xl font-black text-slate-800 cursor-pointer" onClick={() => navigator.clipboard.writeText(roomId)}>{roomId}</h1><div className="w-8"></div></div>
        
        <div className="mb-4 text-left">
           <span className="text-[10px] font-bold uppercase text-slate-400">JOGO SELECIONADO</span>
           <div className="flex items-center gap-2 text-slate-800 font-bold">
              {activeGameObj.name}
              <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Mín: {activeGameObj.minPlayers}</span>
           </div>
        </div>

        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl"><h3 className="font-bold text-slate-500 text-sm uppercase mb-4">Jogadores ({players.length})</h3><ul className="space-y-3">{players.map(p => (<li key={p.id} className="flex items-center gap-3 group"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${p.isHost ? 'bg-slate-800' : 'bg-slate-400'}`}>{p.nickname[0].toUpperCase()}</div><span className="font-bold text-slate-700 flex-1">{p.nickname}</span>{isHost && !p.isHost && <button onClick={() => expulsar(p.id)} className="text-red-300 hover:text-red-500"><Trash2 size={16} /></button>}</li>))}</ul></div>
        
        {isHost ? (
          <div className="space-y-2">
            <button className="w-full text-white bg-slate-800 p-4 rounded-xl font-bold text-lg shadow-xl hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed" onClick={iniciar} disabled={!canStart}>INICIAR JOGO 🚀</button>
            {!canStart && <p className="text-xs text-red-400 font-bold">Precisa de pelo menos {activeGameObj.minPlayers} jogadores.</p>}
          </div>
        ) : (<div className="text-slate-400 font-medium animate-pulse py-3 text-sm">Aguardando Host...</div>)}
      </div>
      <Chat roomId={roomId} nickname={nickname} />
    </div>
  );

  return (
    <>
      <div className="fixed top-4 left-4 z-50"><button onClick={sairDoJogo} className="bg-slate-800/50 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition backdrop-blur-sm"><LogOut size={20} /></button></div>
      {gameType === 'ITO' && <GameTable players={players} isHost={isHost} mySecretNumber={mySecret} roomId={roomId} theme={gameData.theme} phase={currentPhase} gameResult={gameResult} />}
      {gameType === 'CHA_CAFE' && <GameChaCafe players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'CODENAMES' && <GameCodenames players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'STOP' && <GameStop players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'TERMO' && <GameTermo players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'SPY' && <GameSpy players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}

