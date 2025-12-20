import React, { useEffect, useState } from 'react';
import { socket } from './socket';

// Importação dos Componentes dos Jogos
import GameTable from './GameTable';         // ITO
import GameChaCafe from './GameChaCafe';     // Chá ou Café
import GameCodenames from './GameCodenames'; // Código Secreto (Novo)
import Chat from './Chat';

// Ícones
import { Trash2, ArrowRight, Gamepad2, Info, Coffee, Loader2, LogOut, Eye } from 'lucide-react';

export default function App() {
  // --- 1. VERIFICAÇÃO INICIAL E LIMPEZA ---
  let savedRoom = localStorage.getItem('saved_roomId');
  let savedNick = localStorage.getItem('saved_nickname');

  // Proteção contra dados corrompidos (Sala sem nome)
  if (savedRoom && !savedNick) {
      console.log("Dados locais inválidos detectados. Limpando...");
      localStorage.removeItem('saved_roomId');
      savedRoom = null;
  }
  
  // Se existirem dados válidos, começa na tela de LOADING para tentar reconectar
  const [view, setView] = useState((savedRoom && savedNick) ? 'LOADING' : 'HOME');
  const [currentPhase, setCurrentPhase] = useState('LOBBY');
  
  // --- ESTADOS GERAIS ---
  const [nickname, setNickname] = useState(savedNick || '');
  const [roomId, setRoomId] = useState(savedRoom || '');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  
  // --- ESTADOS DE JOGO ---
  const [selectedGame, setSelectedGame] = useState('ITO'); // Qual card cliquei na Home?
  const [gameType, setGameType] = useState(null);          // Qual jogo está rodando na sala?
  const [gameData, setGameData] = useState({});            // Dados vivos (Tabuleiro, Perguntas, etc)
  const [mySecret, setMySecret] = useState(null);          // Específico do ITO
  const [gameResult, setGameResult] = useState(null);

  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    console.log("--- APP INICIADO ---");

    // Função interna para tentar voltar pra sala
    const tentarReconectar = () => {
        const sRoom = localStorage.getItem('saved_roomId');
        const sNick = localStorage.getItem('saved_nickname');
        
        if (sRoom && sNick) {
            console.log(`>> Tentando reconectar à sala ${sRoom} como ${sNick}...`);
            socket.emit('rejoin_room', { roomId: sRoom, nickname: sNick });
        }
    };

    // Lógica de Conexão Inicial
    if (!socket.connected) {
        socket.connect();
    } else {
        tentarReconectar(); 
    }

    // Ouvinte: Conectou ao servidor
    const onConnect = () => {
        console.log("Socket conectado!");
        tentarReconectar();
    };
    socket.on('connect', onConnect);

    // --- OUVINTES DE EVENTOS DO JOGO ---
    
    // 1. Entrou na Sala (Novo ou Reconexão)
    socket.on('joined_room', (data) => { 
      console.log("<< Entrada confirmada:", data);
      handleJoinSuccess(data.roomId, data.isHost);
      setPlayers(data.players); 
      setGameType(data.gameType); // Importante: Servidor diz qual é o jogo da sala
      if(data.gameData) setGameData(data.gameData);
      if (data.mySecretNumber) setMySecret(data.mySecretNumber);

      // Decide para onde levar o usuário
      if (data.phase !== 'LOBBY') {
        setCurrentPhase(data.phase);
        setView('GAME');
      } else {
        setView('LOBBY');
      }
    });

    socket.on('room_created', (id) => handleJoinSuccess(id, true));
    socket.on('update_players', (p) => setPlayers(p));
    
    // 2. Início de Jogo
    socket.on('game_started', (data) => { 
      console.log("JOGO INICIOU:", data.gameType);
      setPlayers(data.players); 
      setGameType(data.gameType); 
      setGameData(data.gameData);
      setCurrentPhase(data.phase);
      setGameResult(null); 
      setView('GAME'); 
    });

    // 3. Atualizações em Tempo Real
    socket.on('update_game_data', ({ gameData, phase }) => {
        setGameData(gameData);
        setCurrentPhase(phase);
    });

    // Eventos Específicos do ITO
    socket.on('your_secret_number', (n) => setMySecret(n));
    socket.on('phase_change', (data) => { setCurrentPhase(data.phase); setPlayers(data.players); });
    socket.on('player_submitted', ({ playerId }) => {
      setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p));
    });
    socket.on('order_updated', (p) => setPlayers(p));
    
    // 4. Fim de Jogo
    socket.on('game_over', (data) => {
      // Diferencia visualmente baseado no tipo de vitória/jogo
      if(data.winnerWord || data.winner) { // Chá ou Café OR Codenames
          setCurrentPhase(data.phase || 'VICTORY'); // Codenames usa GAME_OVER, Cha usa VICTORY
          // Atualiza dados finais se necessário
          if(data.targetWord) setGameData(prev => ({ ...prev, targetWord: data.targetWord }));
          if(data.gameData) setGameData(data.gameData); // Codenames manda grid revelado
      } else {
          // ITO
          setGameResult(data);
          setPlayers(data.results); 
          setCurrentPhase('REVEAL'); 
      }
    });

    socket.on('kicked', () => { alert("Você foi expulso da sala."); sairDoJogo(); });

    // 5. Tratamento de Erros
    socket.on('error_msg', (msg) => {
        console.error("Erro do servidor:", msg);
        // Se der erro enquanto carrega (ex: sala fechou), volta pra home
        if (view === 'LOADING') {
            alert("Não foi possível voltar: " + msg);
            sairDoJogo(); 
        } else {
            alert(msg);
        }
        setIsJoining(false);
    });

    return () => {
        socket.off('connect', onConnect);
        socket.disconnect();
    };
  }, []); // Roda uma vez na montagem

  // --- FUNÇÕES AUXILIARES ---
  const limparDadosLocais = () => {
      localStorage.removeItem('saved_roomId');
      localStorage.removeItem('saved_nickname');
  };

  const sairDoJogo = () => {
      limparDadosLocais();
      setRoomId('');
      setPlayers([]);
      setIsHost(false);
      setView('HOME');
      setIsJoining(false);
      socket.disconnect();
      // Reload para limpar memória e garantir desconexão limpa
      window.location.href = "/"; 
  };

  const handleJoinSuccess = (id, hostStatus) => {
      setRoomId(id);
      setIsHost(hostStatus);
      setIsJoining(false);
      // Salva apenas o ID aqui. O Nick já foi salvo no input.
      localStorage.setItem('saved_roomId', id);
  };

  const entrar = () => { 
      if(nickname && roomId && !isJoining) { 
          setIsJoining(true);
          localStorage.setItem('saved_nickname', nickname); // Salva Nick
          if (!socket.connected) socket.connect();
          socket.emit('join_room', { roomId, nickname }); 
      }
  };
  
  const criar = () => { 
      if(nickname && !isJoining) { 
          setIsJoining(true);
          localStorage.setItem('saved_nickname', nickname); // Salva Nick
          if (!socket.connected) socket.connect();
          socket.emit('create_room', { nickname, gameType: selectedGame }); 
      }
  };
  
  const iniciar = () => socket.emit('start_game', { roomId });
  
  const expulsar = (targetId) => {
      if(confirm("Expulsar este jogador?")) socket.emit('kick_player', { roomId, targetId });
  }

  // --- TELA 0: LOADING (RECONEXÃO) ---
  if (view === 'LOADING') return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 text-center">
          <Loader2 className="w-16 h-16 animate-spin text-indigo-500 mb-4" />
          <h2 className="text-xl font-bold">Reconectando...</h2>
          <p className="text-slate-400 text-sm mt-2">Estamos recuperando seu lugar na mesa.</p>
          <button onClick={sairDoJogo} className="mt-8 text-red-400 text-sm hover:text-red-300 font-bold border border-red-900/50 p-2 rounded bg-red-900/20">
              Cancelar (Sala pode ter fechado)
          </button>
      </div>
  );

  // --- TELA 1: HOME (HUB DE JOGOS) ---
  if (view === 'HOME') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-10 animate-in fade-in slide-in-from-top-10 duration-700">
        <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">ENTREAMIGOS</h1>
        <p className="text-slate-400 text-lg">Escolha seu jogo e divirta-se</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
        
        {/* CARD 1: ITO */}
        <div 
            onClick={() => { setSelectedGame('ITO'); setView('LOGIN'); }}
            className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-indigo-500 transition hover:-translate-y-2 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
        >
            <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition">
                <span className="text-3xl font-black">?</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">ITO</h2>
            <p className="text-slate-400 text-sm">Trabalhem juntos para ordenar números secretos usando dicas criativas.</p>
        </div>

        {/* CARD 2: CHÁ OU CAFÉ */}
        <div 
            onClick={() => { setSelectedGame('CHA_CAFE'); setView('LOGIN'); }}
            className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-pink-500 transition hover:-translate-y-2 hover:shadow-[0_0_20px_rgba(236,72,153,0.3)]"
        >
            <div className="w-16 h-16 bg-pink-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition">
                <Coffee size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Chá ou Café?</h2>
            <p className="text-slate-400 text-sm">Jogo de adivinhação e aproximação. Descubra a palavra secreta do narrador.</p>
        </div>

        {/* CARD 3: CÓDIGO SECRETO (Novo) */}
        <div 
            onClick={() => { setSelectedGame('CODENAMES'); setView('LOGIN'); }}
            className="group bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-emerald-500 transition hover:-translate-y-2 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        >
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition">
                <Eye size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Código Secreto</h2>
            <p className="text-slate-400 text-sm">Dois times, dois espiões. Encontre seus agentes através de uma única palavra.</p>
        </div>

      </div>
    </div>
  );

  // --- TELA 2: LOGIN ---
  if (view === 'LOGIN') {
      const getThemeColor = () => {
          if (selectedGame === 'ITO') return 'indigo';
          if (selectedGame === 'CHA_CAFE') return 'pink';
          return 'emerald'; // Codenames
      };
      const color = getThemeColor();
      
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 relative animate-in zoom-in-95">
            <button onClick={() => setView('HOME')} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">← Voltar</button>
            <div className="text-center pt-4">
              <h1 className="text-3xl font-black text-slate-800">Preparar Jogo</h1>
              <p className={`text-${color}-500 text-sm font-bold uppercase tracking-wider`}>
                  {selectedGame === 'ITO' ? 'Sincronia' : selectedGame === 'CHA_CAFE' ? 'Contexto' : 'Estratégia'}
              </p>
            </div>
            
            <input 
                className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold outline-none focus:border-slate-400" 
                placeholder="Seu Apelido" 
                value={nickname} 
                onChange={e => setNickname(e.target.value)} 
                maxLength={12}
            />
            
            <button 
                className={`w-full text-white p-4 rounded-xl font-bold shadow-lg transition active:scale-95 disabled:opacity-50
                    ${selectedGame === 'ITO' ? 'bg-indigo-600 hover:bg-indigo-700' : 
                      selectedGame === 'CHA_CAFE' ? 'bg-pink-600 hover:bg-pink-700' : 
                      'bg-emerald-600 hover:bg-emerald-700'}`} 
                onClick={criar} 
                disabled={isJoining || !nickname}
            >
                {isJoining ? 'Criando...' : 'Criar Nova Sala'}
            </button>
            
            <div className="flex gap-2">
                <input 
                    className="flex-1 bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-center outline-none uppercase tracking-widest focus:border-slate-400" 
                    placeholder="CÓDIGO" 
                    value={roomId} 
                    onChange={e => setRoomId(e.target.value)} 
                    maxLength={4}
                />
                <button 
                    className="bg-slate-800 text-white px-6 rounded-xl font-bold hover:bg-slate-700 transition active:scale-95 disabled:opacity-50" 
                    onClick={entrar} 
                    disabled={isJoining || !nickname || !roomId}
                >
                    Entrar
                </button>
            </div>
          </div>
        </div>
      );
  }

  // --- TELA 3: LOBBY ---
  if (view === 'LOBBY') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative animate-in zoom-in-95">
        <div className="flex justify-between items-start mb-6">
            <button onClick={sairDoJogo} className="text-xs font-bold text-red-400 hover:text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1"><LogOut size={12}/> SAIR</button>
            <div>
                <h2 className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">CÓDIGO DA SALA</h2>
                <h1 className="text-4xl font-black text-slate-800 cursor-pointer hover:text-indigo-600 transition" onClick={() => navigator.clipboard.writeText(roomId)} title="Copiar">{roomId}</h1>
            </div>
            <div className="w-8"></div>
        </div>
        
        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div className="flex justify-between items-end mb-4">
            <h3 className="font-bold text-slate-500 text-sm uppercase">Jogadores ({players.length})</h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold uppercase">
                {gameType === 'ITO' ? 'ITO' : gameType === 'CHA_CAFE' ? 'Chá/Café' : 'Codenames'}
            </span>
          </div>
          <ul className="space-y-3">
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-3 group">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow ${p.isHost ? 'bg-slate-800' : 'bg-slate-400'}`}>{p.nickname[0].toUpperCase()}</div>
                <span className="font-bold text-slate-700 flex-1">{p.nickname}</span>
                {isHost && !p.isHost && <button onClick={() => expulsar(p.id)} className="text-red-300 hover:text-red-500 transition"><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <button 
            className={`w-full text-white p-4 rounded-xl font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-100 transition disabled:opacity-50 disabled:cursor-not-allowed
                ${gameType === 'ITO' ? 'bg-indigo-600' : 
                  gameType === 'CHA_CAFE' ? 'bg-gradient-to-r from-pink-500 to-yellow-500' : 
                  'bg-emerald-600'}`} 
            onClick={iniciar} 
            disabled={players.length < 2}
          >
            INICIAR JOGO 🚀
          </button>
        ) : (
          <div className="text-slate-400 font-medium animate-pulse py-3 text-sm">Aguardando o Host iniciar a partida...</div>
        )}
      </div>
      <Chat roomId={roomId} nickname={nickname} />
    </div>
  );

  // --- TELA 4: JOGO ---
  return (
    <>
      <div className="fixed top-4 left-4 z-50">
          <button onClick={sairDoJogo} className="bg-slate-800/50 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition backdrop-blur-sm" title="Sair do Jogo">
              <LogOut size={20} />
          </button>
      </div>

      {gameType === 'ITO' && (
        <GameTable players={players} isHost={isHost} mySecretNumber={mySecret} roomId={roomId} theme={gameData.theme} phase={currentPhase} gameResult={gameResult} />
      )}
      
      {gameType === 'CHA_CAFE' && (
        <GameChaCafe players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />
      )}
      
      {gameType === 'CODENAMES' && (
        <GameCodenames players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />
      )}

      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}