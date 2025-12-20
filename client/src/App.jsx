import React, { useEffect, useState } from 'react';
import { socket } from './socket';
import GameTable from './GameTable';
import Chat from './Chat';
import { Trash2, Lock, ArrowRight, Gamepad2, Info } from 'lucide-react'; // Instale lucide-react se faltar ícones

export default function App() {
  const [view, setView] = useState('HOME'); // HOME, LOGIN, LOBBY, GAME
  const [currentPhase, setCurrentPhase] = useState('LOBBY');
  
  const [nickname, setNickname] = useState(localStorage.getItem('saved_nickname') || '');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [mySecret, setMySecret] = useState(null);
  const [theme, setTheme] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isJoining, setIsJoining] = useState(false); // Trava botão de entrar

  // --- EFEITOS E SOCKETS ---
  useEffect(() => {
    // Tenta reconectar se tiver dados salvos (Mobile fix)
    const savedRoom = localStorage.getItem('saved_roomId');
    const savedNick = localStorage.getItem('saved_nickname');
    
    if (savedRoom && savedNick && view === 'HOME') {
       // Opcional: Perguntar se quer voltar, ou voltar direto. Vamos tentar voltar direto.
       // Precisamos conectar primeiro
       socket.connect();
       // Pequeno delay para garantir conexão
       setTimeout(() => {
         socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
       }, 500);
    }

    socket.on('connect', () => {
        console.log("Conectado ao servidor");
    });

    socket.on('room_created', (id) => { 
      handleJoinSuccess(id, true);
    });
    
    socket.on('joined_room', (data) => { 
      handleJoinSuccess(data.roomId, data.isHost);
      setPlayers(data.players); 
      setTheme(data.theme);
      
      // Se recuperar reconexão e tiver numero secreto
      if (data.mySecretNumber) setMySecret(data.mySecretNumber);

      if (data.phase === 'CLUE_PHASE' || data.phase === 'ORDERING' || data.phase === 'REVEAL') {
        setCurrentPhase(data.phase);
        setView('GAME');
      } else {
        setView('LOBBY');
      }
    });

    socket.on('update_players', (p) => setPlayers(p));
    
    socket.on('game_started', (data) => { 
      setPlayers(data.players); 
      setTheme(data.theme);
      setCurrentPhase(data.phase);
      setGameResult(null); 
      setView('GAME'); 
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
    socket.on('game_over', (res) => {
      setGameResult(res);
      setPlayers(res.results); 
      setCurrentPhase('REVEAL'); 
    });

    socket.on('kicked', () => {
        alert("Você foi removido da sala.");
        limparDadosLocais();
        window.location.reload();
    });

    socket.on('error_msg', (msg) => {
        alert(msg);
        setIsJoining(false); // Destrava botão
    });

    return () => socket.disconnect();
  }, []);

  // --- FUNÇÕES AUXILIARES ---
  const limparDadosLocais = () => {
      localStorage.removeItem('saved_roomId');
      localStorage.removeItem('saved_nickname');
      setRoomId('');
      setView('HOME');
      setIsJoining(false);
  };

  const handleJoinSuccess = (id, hostStatus) => {
      setRoomId(id);
      setIsHost(hostStatus);
      setIsJoining(false);
      // Salva para reconexão mobile
      localStorage.setItem('saved_roomId', id);
      localStorage.setItem('saved_nickname', nickname);
  };

  const entrar = () => { 
      if(nickname && roomId && !isJoining) { 
          setIsJoining(true);
          socket.connect(); 
          socket.emit('join_room', { roomId, nickname }); 
      }
  };
  
  const criar = () => { 
      if(nickname && !isJoining) { 
          setIsJoining(true);
          socket.connect(); 
          socket.emit('create_room', { nickname, gameType: 'ITO' }); 
      }
  };
  
  const iniciar = () => socket.emit('start_game', { roomId });
  
  const expulsar = (targetId) => {
      if(confirm("Expulsar este jogador?")) {
          socket.emit('kick_player', { roomId, targetId });
      }
  }

  // --- TELA 1: HOME (HUB DE JOGOS) ---
  if (view === 'HOME') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-10 animate-in fade-in slide-in-from-top-10 duration-700">
        <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">
            ENTREAMIGOS
        </h1>
        <p className="text-slate-400 text-lg">Escolha seu jogo e divirta-se</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* CARD DO JOGO ITO */}
        <div 
            onClick={() => setView('LOGIN')}
            className="group relative bg-slate-800 rounded-3xl p-6 cursor-pointer border-2 border-slate-700 hover:border-indigo-500 transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:-translate-y-2"
        >
            <div className="absolute top-4 right-4 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded">POPULAR</div>
            <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition">
                <span className="text-3xl font-black">?</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">ITO (Sincronia)</h2>
            <p className="text-slate-400 text-sm mb-4">
                Todos recebem um número secreto. Trabalhem juntos para colocá-los em ordem crescente conversando sobre um tema absurdo!
            </p>
            <div className="flex items-center text-indigo-400 font-bold text-sm">
                JOGAR AGORA <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition" />
            </div>
        </div>

        {/* CARD DE "EM BREVE" */}
        <div className="bg-slate-800/50 rounded-3xl p-6 border-2 border-slate-800 border-dashed flex flex-col items-center justify-center text-center opacity-70">
            <Gamepad2 className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-slate-500">Mais Jogos em Breve</h3>
            <p className="text-slate-600 text-sm mt-2">Estamos criando novas experiências...</p>
        </div>
      </div>
    </div>
  );

  // --- TELA 2: LOGIN (CRIAR/ENTRAR) ---
  if (view === 'LOGIN') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 relative overflow-hidden">
        <button onClick={() => setView('HOME')} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase">← Voltar</button>
        
        <div className="text-center pt-4">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl mx-auto flex items-center justify-center font-bold text-xl mb-4">?</div>
          <h1 className="text-3xl font-black text-slate-800">Preparar Jogo</h1>
          <p className="text-slate-500 text-sm">ITO - Sincronia</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 ml-1">Seu Nome</label>
            <input 
              className="w-full bg-slate-100 border-2 border-slate-200 p-4 rounded-xl font-bold text-slate-700 focus:border-indigo-500 outline-none transition" 
              placeholder="Ex: Mestre dos Magos" 
              value={nickname} 
              onChange={e => setNickname(e.target.value)} 
            />
          </div>

          <button 
            className={`w-full bg-indigo-600 text-white p-4 rounded-xl font-bold shadow-lg transition transform active:scale-95 flex items-center justify-center ${isJoining ? 'opacity-70 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
            onClick={criar}
            disabled={isJoining}
          >
            {isJoining ? 'Carregando...' : 'Criar Nova Sala'}
          </button>
          
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-slate-300 text-xs font-bold uppercase">Ou</span>
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
              className={`bg-emerald-500 text-white px-6 rounded-xl font-bold shadow-lg transition active:scale-95 ${isJoining ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-600'}`}
              onClick={entrar}
              disabled={isJoining}
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // --- TELA 3: LOBBY ---
  if (view === 'LOBBY') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center pt-10 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center relative overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
        
        <div className="flex justify-between items-start mb-6">
            <button onClick={limparDadosLocais} className="text-xs font-bold text-red-400 hover:text-red-600 bg-red-50 px-2 py-1 rounded">SAIR</button>
            <div>
                <h2 className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">Código da Sala</h2>
                <h1 className="text-4xl font-black text-slate-800 tracking-wider cursor-pointer" onClick={() => navigator.clipboard.writeText(roomId)} title="Clique para copiar">{roomId}</h1>
            </div>
            <div className="w-8"></div> {/* Espaço para balancear */}
        </div>
        
        <div className="text-left mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-500 text-sm uppercase">Jogadores ({players.length})</h3>
            {isHost && <span className="text-[10px] text-slate-400 bg-slate-200 px-2 py-1 rounded">Você é o Host</span>}
          </div>
          
          <ul className="space-y-3">
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-3 group">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-md ${p.isHost ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                  {p.nickname[0].toUpperCase()}
                </div>
                <div className="flex-1">
                    <span className="font-bold text-slate-700 text-lg block leading-tight">{p.nickname}</span>
                    {p.isHost && <span className="text-[10px] font-bold text-indigo-500 uppercase">Líder da Sala</span>}
                </div>
                
                {/* BOTÃO DE EXPULSAR (SÓ PRO HOST E NÃO PODE SE EXPULSAR) */}
                {isHost && !p.isHost && (
                    <button 
                        onClick={() => expulsar(p.id)}
                        className="opacity-100 md:opacity-0 group-hover:opacity-100 p-2 bg-red-100 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                        title="Expulsar jogador"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
              </li>
            ))}
          </ul>
          {players.length < 2 && (
             <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-xs rounded-lg flex items-center gap-2">
                 <Info size={16} />
                 <span>Precisa de pelo menos 2 jogadores.</span>
             </div>
          )}
        </div>

        {isHost ? (
          <button 
            className={`w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed`}
            onClick={iniciar}
            disabled={players.length < 2}
          >
            INICIAR JOGO 🚀
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-indigo-500 font-medium animate-pulse py-3">
            <span>Aguardando o Host iniciar...</span>
          </div>
        )}
      </div>
      <Chat roomId={roomId} nickname={nickname} />
    </div>
  );

  // --- TELA 4: JOGO ---
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
      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}