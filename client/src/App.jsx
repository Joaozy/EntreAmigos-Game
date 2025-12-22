import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { Loader2, LogOut } from 'lucide-react';

// Componentes
import Home from './components/Home';
import Login from './components/Login';
import Lobby from './components/Lobby';
import Chat from './Chat';

// Jogos
import GameTable from './GameTable';
import GameChaCafe from './GameChaCafe';
import GameCodenames from './GameCodenames';
import GameStop from './GameStop';
import GameTermo from './GameTermo';

function AppContent() {
  const { view, gameType, players, isHost, roomId, gameData, currentPhase, mySecret, gameResult, sairDoJogo, nickname } = useGame();

  if (view === 'LOADING') return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin w-10 h-10"/></div>;
  if (view === 'HOME') return <Home />;
  if (view === 'LOGIN') return <Login />;
  if (view === 'LOBBY') return <Lobby />;

  // VIEW === 'GAME'
  return (
    <>
      <div className="fixed top-4 left-4 z-50"><button onClick={sairDoJogo} className="bg-slate-800/50 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition backdrop-blur-sm"><LogOut size={20} /></button></div>
      
      {/* Aqui você passa as props como fazia antes, mas agora vindo do Context limpo */}
      {gameType === 'ITO' && <GameTable players={players} isHost={isHost} mySecretNumber={mySecret} roomId={roomId} theme={gameData.theme} phase={currentPhase} gameResult={gameResult} />}
      {gameType === 'CHA_CAFE' && <GameChaCafe players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'CODENAMES' && <GameCodenames players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'STOP' && <GameStop players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      {gameType === 'TERMO' && <GameTermo players={players} isHost={isHost} roomId={roomId} gameData={gameData} phase={currentPhase} />}
      
      <Chat roomId={roomId} nickname={nickname} />
    </>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}