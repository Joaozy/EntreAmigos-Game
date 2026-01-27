import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Login from './components/Login';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom'; // <--- IMPORT NOVO

// IMPORTE TODOS OS JOGOS
import GameTable from './GameTable'; // (ITO)
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
  const { view, selectedGame, currentPhase } = useGame();

  // 1. TELA DE LOGIN
  if (view === 'HOME') return <Login />;

  // 2. DASHBOARD (Menu)
  if (view === 'LOBBY' || view === 'DASHBOARD') return <Lobby />;

  // 3. DENTRO DA SALA (JOGO)
  if (view === 'GAME') {
    // Se a fase for LOBBY, mostra a Sala de Espera Unificada
    if (currentPhase === 'LOBBY') {
        return <WaitingRoom />;
    }

    // Se o jogo já começou, carrega o componente específico
    switch (selectedGame) {
      case 'ITO': return <GameTable {...useGame()} />;
      case 'CHA_CAFE': return <GameChaCafe {...useGame()} />;
      case 'MEGAQUIZ': return <GameMegaQuiz {...useGame()} />;
      case 'WHOAMI': return <GameWhoAmI {...useGame()} />;
      case 'CODENAMES': return <GameCodenames {...useGame()} />;
      case 'STOP': return <GameStop {...useGame()} />;
      case 'TERMO': return <GameTermo {...useGame()} />;
      case 'CINEMOJI': return <GameCinemoji {...useGame()} />;
      case 'DIXIT': return <GameDixit {...useGame()} />;
      case 'SPY': return <GameSpy {...useGame()} />;
      case 'ENIGMA': return <GameEnigma {...useGame()} />;
      default: 
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Erro de Roteamento</h1>
                    <p>O jogo "{selectedGame}" não foi encontrado no App.jsx.</p>
                </div>
            </div>
        );
    }
  }

  return null;
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}