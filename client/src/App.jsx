import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Login from './components/Login';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom'; 
import Chat from './Chat'; // <--- IMPORTANTE

// IMPORTE TODOS OS JOGOS
import GameTable from './GameTable'; // ITO
import GameChaCafe from './GameChaCafe';
import GameMegaQuiz from './GameMegaQuiz';
import GameWhoAmI from './GameWhoAmI';
import GameCodenames from './GameCodenames';
import GameStop from './GameStop';
import GameTermo from './GameTermo';
import GameCinemoji from './GameCinemoji';
import GameDixit from './GameDixit';
import GameSpy from './GameSpy';
import GameEnigma from './GameEnigma';

function AppContent() {
  const { view, selectedGame, currentPhase, roomId, nickname } = useGame();

  // 1. TELA DE LOGIN
  if (view === 'HOME') return <Login />;

  // 2. DASHBOARD (Menu)
  if (view === 'LOBBY' || view === 'DASHBOARD') return <Lobby />;

  // 3. DENTRO DA SALA (JOGO)
  if (view === 'GAME') {
    return (
        <>
            {/* O Jogo em si */}
            <GameComponent selectedGame={selectedGame} currentPhase={currentPhase} />
            
            {/* Chat Flutuante (Só aparece se tiver roomId) */}
            {roomId && <Chat roomId={roomId} nickname={nickname} />}
        </>
    );
  }

  return null;
}

// Componente auxiliar para limpar o switch/case
function GameComponent({ selectedGame, currentPhase }) {
    // Se a fase for LOBBY, mostra a Sala de Espera Unificada
    if (currentPhase === 'LOBBY') {
        return <WaitingRoom />;
    }

    switch (selectedGame) {
      case 'ITO': return <GameTable />;
      case 'CHA_CAFE': return <GameChaCafe />;
      case 'MEGAQUIZ': return <GameMegaQuiz />;
      case 'WHOAMI': return <GameWhoAmI />;
      case 'CODENAMES': return <GameCodenames />;
      case 'STOP': return <GameStop />;
      case 'TERMO': return <GameTermo />;
      case 'CINEMOJI': return <GameCinemoji />;
      case 'DIXIT': return <GameDixit />;
      case 'SPY': return <GameSpy />;
      case 'ENIGMA': return <GameEnigma />;
      default: 
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Erro 404</h1>
                    <p>Jogo "{selectedGame}" não encontrado.</p>
                </div>
            </div>
        );
    }
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}