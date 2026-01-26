import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Login from './components/Login';
import Lobby from './components/Lobby';
import GameTable from './GameTable';
import GameChaCafe from './GameChaCafe';
import GameMegaQuiz from './GameMegaQuiz';
// ... imports

function AppContent() {
  const { view, selectedGame } = useGame();

  // 1. TELA DE LOGIN (Inicial)
  if (view === 'HOME') return <Login />;

  // 2. DASHBOARD (Menu de escolha)
  // Nota: GameContext usa 'LOBBY' para a sala de espera do jogo e 'DASHBOARD' (ou LOBBY dependendo da implementação) para o menu.
  // Vamos unificar: se estiver autenticado e sem sala, é LOBBY (Dashboard).
  // Se estiver em sala mas fase LOBBY, é GAME (com visual de espera).
  // Simplificando com base no código do GameContext:
  
  // Se view for LOBBY no contexto novo, é o DASHBOARD.
  // Dentro do jogo, a view vira GAME.
  if (view === 'LOBBY' || view === 'DASHBOARD') return <Lobby />;

  // 3. JOGO (Inclui a fase de espera "Lobby" dentro da sala)
  if (view === 'GAME') {
    switch (selectedGame) {
      case 'ITO': return <GameTable {...useGame()} />;
      case 'CHA_CAFE': return <GameChaCafe {...useGame()} />;
      case 'MEGAQUIZ': return <GameMegaQuiz {...useGame()} />;
      default: return <div className="text-white text-center mt-20">Jogo em breve...</div>;
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