import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // Estados
    const [view, setView] = useState('HOME'); 
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [roomId, setRoomId] = useState('');
    const [nickname, setNickname] = useState('');
    const [isHost, setIsHost] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    
    // Dados do Jogo
    const [players, setPlayers] = useState([]);
    const [selectedGame, setSelectedGame] = useState('ITO');
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);

    useEffect(() => {
        // Recuperação de sessão
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');

        const onConnect = () => {
            console.log("Socket conectado!", socket.id);
            setIsConnected(true);
            if (savedRoom && savedNick) {
                console.log("Tentando rejoin automático...", savedRoom);
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        const onDisconnect = () => {
            console.log("Socket desconectado.");
            setIsConnected(false);
        };

        const onErrorMsg = (msg) => {
            console.warn("Erro do servidor:", msg);
            // CRÍTICO: Se a sala expirou, limpa tudo para evitar loop
            if (msg.includes("expirou") || msg.includes("Sala não encontrada")) {
                alert("Sua sessão expirou. Você será redirecionado para o início.");
                limparSessaoLocal();
                setView('HOME');
            } else {
                alert(msg);
            }
            setIsJoining(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('error_msg', onErrorMsg);
        
        socket.on('joined_room', (data) => {
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Atualiza sessão
            localStorage.setItem('saved_roomId', data.roomId);
            const myNick = data.players.find(p => p.id === socket.id)?.nickname || savedNick || nickname;
            localStorage.setItem('saved_nickname', myNick);
            if(myNick) setNickname(myNick);

            if (data.phase !== 'LOBBY') {
                setCurrentPhase(data.phase);
                setView('GAME');
            } else {
                setView('LOBBY');
            }
            setIsJoining(false);
        });

        // Listeners gerais do jogo (mantidos iguais)
        socket.on('room_created', (id) => setRoomId(id));
        socket.on('update_players', setPlayers);
        socket.on('game_started', (data) => {
            setPlayers(data.players);
            setGameType(data.gameType);
            setGameData(data.gameData);
            setCurrentPhase(data.phase);
            setGameResult(null);
            setView('GAME');
        });
        socket.on('update_game_data', ({ gameData, phase }) => { setGameData(gameData); setCurrentPhase(phase); });
        socket.on('game_over', (data) => {
             if(data.winnerWord || data.winner || data.secretWord) { 
                setCurrentPhase(data.phase || 'VICTORY'); 
                setGameData(prev => ({ ...prev, ...(data.gameData || {}), winner: data.winner, secretWord: data.secretWord, targetWord: data.targetWord }));
            } else if (data.results) { 
                setGameResult(data); setPlayers(data.results); setCurrentPhase('REVEAL'); 
            }
        });
        socket.on('your_secret_number', setMySecret);
        socket.on('phase_change', (data) => { setCurrentPhase(data.phase); if(data.players) setPlayers(data.players); });
        socket.on('player_submitted', ({ playerId }) => { setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p)); });
        socket.on('order_updated', setPlayers);
        socket.on('kicked', () => { alert("Você foi expulso."); sairDoJogo(); });

        // Inicialização
        if (savedRoom && savedNick) {
            setView('LOADING');
            setRoomId(savedRoom);
            setNickname(savedNick);
            if (!socket.connected) socket.connect();
            else socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
        }

        return () => { 
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('error_msg', onErrorMsg);
        };
    }, []);

    const limparSessaoLocal = () => {
        localStorage.removeItem('saved_roomId');
        localStorage.removeItem('saved_nickname');
        setRoomId(''); 
        setPlayers([]); 
        setIsHost(false); 
        setGameData({}); 
        setGameType(null);
        setIsJoining(false);
    };

    const sairDoJogo = () => {
        limparSessaoLocal();
        setView('HOME'); 
        socket.disconnect();
    };

    const criarSala = () => {
        if(!nickname) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);
        const enviar = () => socket.emit('create_room', { nickname, gameType: selectedGame });
        if (!socket.connected) { socket.connect(); socket.once('connect', enviar); } else enviar();
    };

    const entrarSala = () => {
        if(!nickname || !roomId) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);
        const enviar = () => socket.emit('join_room', { roomId, nickname });
        if (!socket.connected) { socket.connect(); socket.once('connect', enviar); } else enviar();
    };

    return (
        <GameContext.Provider value={{
            view, setView, isConnected,
            players, isHost, roomId, setRoomId, nickname, setNickname,
            selectedGame, setSelectedGame, gameType, gameData, currentPhase, mySecret,
            gameResult, isJoining, socket,
            criarSala, entrarSala, sairDoJogo
        }}>
            {children}
            {/* Banner de Reconexão Global */}
            {!isConnected && view !== 'HOME' && view !== 'LOGIN' && (
                <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-xs font-bold text-center py-1 z-[9999] animate-pulse">
                    Conexão perdida. Tentando reconectar...
                </div>
            )}
        </GameContext.Provider>
    );
};