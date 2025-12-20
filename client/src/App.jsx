import React, { useEffect, useState } from 'react';
import { socket } from './socket';
import GameTable from './GameTable';
import Chat from './Chat';

export default function App() {
  const [gameState, setGameState] = useState('LOGIN'); // Estados: LOGIN, LOBBY, GAME
  const [currentPhase, setCurrentPhase] = useState('LOBBY'); // Fases do jogo
  
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [mySecret, setMySecret] = useState(null);
  const [theme, setTheme] = useState(null);
  const [gameResult, setGameResult] = useState(null); // Resultado final para o modal

  useEffect(() => {
    // 1. Ouvintes de Conexão e Sala
    socket.on('room_created', (id) => { 
      setRoomId(id); 
      setGameState('LOBBY'); 
      setCurrentPhase('LOBBY'); 
    });
    
    socket.on('joined_room', (data) => { 
      setRoomId(data.roomId); 
      setIsHost(data.isHost); 
      setPlayers(data.players); 
      setTheme(data.theme);
      
      // Se entrar no meio de uma partida, já joga para a tela do jogo
      if (data.phase === 'CLUE_PHASE' || data.phase === 'ORDERING' || data.phase === 'REVEAL') {
        setCurrentPhase(data.phase);
        setGameState('GAME');
      } else {
        setGameState('LOBBY');
      }
    });

    socket.on('update_players', (p) => setPlayers(p));
    
    // 2. Ouvintes do Fluxo de Jogo
    socket.on('game_started', (data) => { 
      setPlayers(data.players); 
      setTheme(data.theme);
      setCurrentPhase(data.phase);
      setGameResult(null); // Limpa resultado anterior se houver
      setGameState('GAME'); 
    });

    socket.on('your_secret_number', (n) => setMySecret(n));

    socket.on('phase_change', (data) => {
      setCurrentPhase(data.phase);
      setPlayers(data.players);
    });
    
    socket.on('player_submitted', ({ playerId }) => {
      setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p));
    });

    socket.on('order_updated', (p) => setPlayers(p));
    
    // 3. Fim de Jogo e Erros
    socket.on('game_over', (res) => {
      setGameResult(res);
      setPlayers(res.results); // Atualiza com os números revelados
      setCurrentPhase('REVEAL'); // Força a mudança de fase para abrir o modal
    });

    socket.on('error_msg', (msg) => alert(msg)); 

    return () => socket.disconnect();
  }, []);

  // Funções de Ação
  const entrar = () => { if(nickname) { socket.connect(); socket.emit('join_room', { roomId, nickname }); }};
  const criar = () => { if(nickname) { socket.connect(); socket.emit('create_room', { nickname }); }};
  const iniciar = () => socket.emit('start_game', { roomId });

  // --- TELA 1: LOGIN ---
  if (gameState === 'LOGIN') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6 animate-in fade-in duration-500">
        <div className="text-center">
          <h1 className="text-4xl font-black text-indigo-600 mb-2 tracking-tight">EntreAmigos</h1>
          <p className="text-slate-400 font-medium">Jogos para quebrar o gelo</p>
        </div>
        <div className="space-y-4">
          <input 
            className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-slate-700 focus:border-indigo-500 outline-none transition" 
            placeholder="Seu Apelido" 
            value={nickname} 
            onChange={e => setNickname(e.target.value)} 
          />
          <button 
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-xl font-bold shadow-lg transition transform active:scale-95" 
            onClick={criar}
          >
            Criar Sala Nova
          </button>
          
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-slate-300 text-xs font-bold uppercase">Ou entre em uma</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <div className="flex gap-2">
            <input 
              className="flex-1 bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold outline-none uppercase text-center tracking-widest" 
              placeholder="CÓDIGO" 
              value={roomId} 
              onChange={e => setRoomId(e.target.value)} 
            />
            <button 
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 rounded-xl font-bold shadow-lg transition active:scale-95" 
              onClick={entrar}
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // --- TELA 2: LOBBY ---
  if (gameState === 'LOBBY') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Barra colorida topo */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
        
        <h2 className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">Sala de Espera</h2>
        <h1 className="text-5xl font-black text-slate-800 tracking-wider mb-8">{roomId}</h1>
        
        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-500 text-sm uppercase">Jogadores</h3>
            <span className="bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-1 rounded-md">{players.length}</span>
          </div>
          
          <ul className="space-y-3">
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-md ${p.isHost ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                  {p.nickname[0].toUpperCase()}
                </div>
                <span className="font-bold text-slate-700 text-lg">{p.nickname}</span>
                {p.isHost && <span className="ml-auto text-[10px] bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold border border-yellow-200">HOST</span>}
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <button 
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition transform hover:-translate-y-1 active:translate-y-0" 
            onClick={iniciar}
          >
            INICIAR JOGO 🚀
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-indigo-500 font-medium animate-pulse py-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            <span>Aguardando o Host iniciar...</span>
          </div>
        )}
      </div>
      
      {/* Chat flutuante disponível no Lobby */}
      <Chat roomId={roomId} nickname={nickname} />
    </div>
  );

  // --- TELA 3: JOGO (MESA) ---
  return (
    <>
      <GameTable 
        players={players} 
        isHost={isHost} 
        mySecretNumber={mySecret} 
        roomId={roomId}
        theme={theme}
        phase={currentPhase}
        gameResult={gameResult} 
      />
      {/* Chat flutuante disponível no Jogo */}
      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}