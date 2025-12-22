import React, { useEffect, useState } from 'react';
import { socket } from './socket';

// Importação dos Componentes dos Jogos
import GameTable from './GameTable';         
import GameChaCafe from './GameChaCafe';     
import GameCodenames from './GameCodenames'; 
import GameStop from './GameStop';           
import GameTermo from './GameTermo'; // Importe o componente

import Chat from './Chat';

// Ícones
import { Trash2, ArrowRight, Gamepad2, Info, Coffee, Loader2, LogOut, Eye, Hand, LayoutGrid } from 'lucide-react';

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
      // TRATAMENTO UNIFICADO DE FIM DE JOGO
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

  // --- REGRAS DE INÍCIO ---
  // AQUI ESTAVA O PROBLEMA: Termo e Stop podem ser jogados com 1 pessoa
  const minPlayers = (selectedGame === 'TERMO' || selectedGame === 'STOP') ? 1 : 2;
  const canStart = players.length >= minPlayers;

  if (view === 'LOADING') return (<div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 text-center"><Loader2 className="w-16 h-16 animate-spin text-indigo-500 mb-4" /><h2 className="text-xl font-bold">Reconectando...</h2><button onClick={sairDoJogo} className="mt-8 text-red-400 text-sm border border-red-900/50 p-2 rounded bg-red-900/20">Cancelar</button></div>);

  if (view === 'HOME') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-10">
        <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">ENTREAMIGOS</h1>
        <p className="text-slate-400 text-lg">Escolha seu jogo</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-7xl">
        <div onClick={() => { setSelectedGame('ITO'); setView('LOGIN'); }} className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-indigo-500 transition hover:-translate-y-2"><div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg"><span className="text-3xl font-black">?</span></div><h2 className="text-xl font-bold text-white">ITO</h2><p className="text-slate-400 text-xs mt-2">Sincronia e cooperação.</p></div>
        <div onClick={() => { setSelectedGame('CHA_CAFE'); setView('LOGIN'); }} className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-pink-500 transition hover:-translate-y-2"><div className="w-16 h-16 bg-pink-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg"><Coffee size={32} /></div><h2 className="text-xl font-bold text-white">Chá ou Café?</h2><p className="text-slate-400 text-xs mt-2">Adivinhação por contexto.</p></div>
        <div onClick={() => { setSelectedGame('CODENAMES'); setView('LOGIN'); }} className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-emerald-500 transition hover:-translate-y-2"><div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg"><Eye size={32} /></div><h2 className="text-xl font-bold text-white">Código Secreto</h2><p className="text-slate-400 text-xs mt-2">Times, espiões e palavras.</p></div>
        <div onClick={() => { setSelectedGame('STOP'); setView('LOGIN'); }} className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-purple-500 transition hover:-translate-y-2"><div className="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg"><Hand size={32} /></div><h2 className="text-xl font-bold text-white">Stop!</h2><p className="text-slate-400 text-xs mt-2">Adedonha clássica rápida.</p></div>
        
        {/* NOVO CARD TERMO */}
        <div onClick={() => { setSelectedGame('TERMO'); setView('LOGIN'); }} className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-emerald-600 transition hover:-translate-y-2"><div className="w-16 h-16 bg-emerald-700 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg"><LayoutGrid size={32} /></div><h2 className="text-xl font-bold text-white">Termo</h2><p className="text-slate-400 text-xs mt-2">Acerte a palavra de 5 letras.</p></div>
      </div>
    </div>
  );

  if (view === 'LOGIN') {
      const getThemeData = () => {
          if (selectedGame === 'ITO') return { colorName: 'indigo', btnClass: 'bg-indigo-600 hover:bg-indigo-700' };
          if (selectedGame === 'CHA_CAFE') return { colorName: 'pink', btnClass: 'bg-pink-600 hover:bg-pink-700' };
          if (selectedGame === 'CODENAMES') return { colorName: 'emerald', btnClass: 'bg-emerald-600 hover:bg-emerald-700' };
          if (selectedGame === 'STOP') return { colorName: 'purple', btnClass: 'bg-purple-600 hover:bg-purple-700' };
          if (selectedGame === 'TERMO') return { colorName: 'emerald', btnClass: 'bg-emerald-700 hover:bg-emerald-800' };
          return { colorName: 'slate', btnClass: 'bg-slate-600' };
      };
      const theme = getThemeData();
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 relative animate-in zoom-in-95">
            <button onClick={() => setView('HOME')} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">← Voltar</button>
            <div className="text-center pt-4">
              <h1 className="text-3xl font-black text-slate-800">Preparar Jogo</h1>
              <p className={`text-${theme.colorName}-500 text-sm font-bold uppercase tracking-wider`}>{selectedGame}</p>
            </div>
            <input className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold outline-none" placeholder="Seu Apelido" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12}/>
            <button className={`w-full text-white p-4 rounded-xl font-bold shadow-lg transition ${theme.btnClass}`} onClick={criar} disabled={isJoining || !nickname}>{isJoining ? 'Criando...' : 'Criar Nova Sala'}</button>
            <div className="flex gap-2"><input className="flex-1 bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-center outline-none uppercase" placeholder="CÓDIGO" value={roomId} onChange={e => setRoomId(e.target.value)} maxLength={4}/><button className="bg-slate-800 text-white px-6 rounded-xl font-bold" onClick={entrar} disabled={isJoining || !nickname || !roomId}>Entrar</button></div>
          </div>
        </div>
      );
  }

  if (view === 'LOBBY') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative animate-in zoom-in-95">
        <div className="flex justify-between items-start mb-6"><button onClick={sairDoJogo} className="text-xs font-bold text-red-400 hover:text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1"><LogOut size={12}/> SAIR</button><h1 className="text-4xl font-black text-slate-800 cursor-pointer" onClick={() => navigator.clipboard.writeText(roomId)}>{roomId}</h1><div className="w-8"></div></div>
        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl"><h3 className="font-bold text-slate-500 text-sm uppercase mb-4">Jogadores ({players.length})</h3><ul className="space-y-3">{players.map(p => (<li key={p.id} className="flex items-center gap-3 group"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${p.isHost ? 'bg-slate-800' : 'bg-slate-400'}`}>{p.nickname[0].toUpperCase()}</div><span className="font-bold text-slate-700 flex-1">{p.nickname}</span>{isHost && !p.isHost && <button onClick={() => expulsar(p.id)} className="text-red-300 hover:text-red-500"><Trash2 size={16} /></button>}</li>))}</ul></div>
        {isHost ? (
          // CORREÇÃO: Botão habilita com 1 jogador se for Termo ou Stop
          <button className="w-full text-white bg-slate-800 p-4 rounded-xl font-bold text-lg shadow-xl hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed" onClick={iniciar} disabled={!canStart}>INICIAR JOGO 🚀</button>
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
      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}