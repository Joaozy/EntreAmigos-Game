import React from 'react';
import { useGame } from './context/GameContext';

// Telas Gerais
import Login from './components/Login';
import Lobby from './components/Lobby'; 
import WaitingRoom from './components/WaitingRoom';

// Jogos
import GameTermo from './GameTermo';
import GameMegaQuiz from './GameMegaQuiz';
import GameDixit from './GameDixit';
import GameStop from './GameStop';
import GameCodenames from './GameCodenames';
import GameWhoAmI from './GameWhoAmI';
import GameCinemoji from './GameCinemoji';
import GameChaCafe from './GameChaCafe';
import GameSpy from './GameSpy';
import GameEnigma from './GameEnigma';
import GameTable from './GameTable'; // ITO
import GameCamaleao from './GameCamaleao';
import GameQualEANota from './GameQualEANota'; // <--- ADICIONADO AQUI

export default function App() {
    const { 
        user, 
        nickname,
        currentPhase, 
        gameType, 
        roomId, 
        isLoading, 
        error,
        criarSala,
        entrarSala,
        sairDoJogo,
        deslogar 
    } = useGame();

    // 1. CARREGAMENTO
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-500 mb-4"></div>
                <p className="text-slate-400 font-bold animate-pulse">Carregando...</p>
            </div>
        );
    }

    // 2. ERRO
    if (error) {
        return (
            <div className="min-h-screen bg-red-900 flex flex-col items-center justify-center text-white p-6">
                <h1 className="text-3xl font-bold mb-2">Ops!</h1>
                <p className="bg-black/30 p-4 rounded mb-6 text-xl border border-red-500">{error}</p>
                <button onClick={() => window.location.reload()} className="bg-white text-red-900 px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition">
                    Tentar Novamente
                </button>
            </div>
        );
    }

    // 3. LOGIN
    if (!user) {
        return <Login />;
    }

    // 4. LOBBY (Sem Sala)
    if (!roomId) {
        return (
            <Lobby 
                nickname={nickname} 
                onCreate={criarSala} 
                onJoin={entrarSala} 
                onLogout={deslogar} 
            />
        );
    }

    // 5. SALA DE ESPERA
    if (currentPhase === 'LOBBY') {
        return <WaitingRoom />;
    }

    // 6. JOGOS
    switch (gameType) {
        case 'TERMO':       return <GameTermo />;
        case 'MEGAQUIZ':    return <GameMegaQuiz />;
        case 'DIXIT':       return <GameDixit />;
        case 'STOP':        return <GameStop />;
        case 'CODENAMES':   return <GameCodenames />;
        case 'WHOAMI':      return <GameWhoAmI />;
        case 'CINEMOJI':    return <GameCinemoji />;
        case 'CHACAFE':     return <GameChaCafe />;
        case 'SPY':         return <GameSpy />;
        case 'ENIGMA':      return <GameEnigma />;
        case 'ITO':         return <GameTable />; 
        case 'TABLE':       return <GameTable />;
        case 'CAMALEAO':    return <GameCamaleao />;
        case 'QUALEANOTA':  return <GameQualEANota />; // <--- ADICIONADO AQUI
        
        default:
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-slate-800 text-white">
                    <h1 className="text-3xl font-bold mb-2 text-yellow-400">Em Desenvolvimento</h1>
                    <p className="mb-6 text-slate-400">O jogo <b>{gameType}</b> ainda não está pronto.</p>
                    <button onClick={sairDoJogo} className="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg font-bold transition">
                        Voltar para o Lobby
                    </button>
                </div>
            );
    }
}