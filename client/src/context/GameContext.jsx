import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { socket } from '../socket';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // Estados Globais
    const [view, setView] = useState('HOME'); 
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [roomId, setRoomId] = useState('');
    const [nickname, setNickname] = useState('');
    const [isHost, setIsHost] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    
    const [players, setPlayers] = useState([]);
    const [selectedGame, setSelectedGame] = useState('ITO');
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);

    const wakeLockRef = useRef(null);

    // Wake Lock (Manter tela ligada)
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator && (view === 'GAME' || view === 'LOBBY')) {
                    wakeLockRef.current = await navigator.wakeLock.request('screen');
                }
            } catch (err) { console.warn('WakeLock err:', err); }
        };
        requestWakeLock();
        return () => { if (wakeLockRef.current) wakeLockRef.current.release(); };
    }, [view]);

    // Socket Listeners
    useEffect(() => {
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');
        const savedGameType = localStorage.getItem('saved_gameType');

        const onConnect = () => {
            setIsConnected(true);
            if (savedRoom && savedNick) {
                // Recupera estado anterior
                if (savedGameType) setGameType(savedGameType);
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        const onDisconnect = () => setIsConnected(false);

        const onJoinedRoom = (data) => {
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            
            // Salva sessão
            localStorage.setItem('saved_roomId', data.roomId);
            localStorage.setItem('saved_nickname', data.players.find(p => p.id === socket.id)?.nickname || nickname);
            if (data.gameType) localStorage.setItem('saved_gameType', data.gameType);

            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);

            // Roteamento
            if (data.phase !== 'LOBBY') {
                setCurrentPhase(data.phase);
                setView('GAME');
            } else {
                setView('LOBBY');
            }
            setIsJoining(false);
        };

        const onReturnedToLobby = (data) => {
            console.log("Voltando ao Lobby...");
            setCurrentPhase('LOBBY');
            setView('LOBBY');
            setGameData({});
            setGameType(null);
            setGameResult(null);
            if (data.players) setPlayers(data.players);
            // Limpa tipo de jogo salvo para evitar glitch
            localStorage.removeItem('saved_gameType');
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('joined_room', onJoinedRoom);
        socket.on('returned_to_lobby', onReturnedToLobby); // CORREÇÃO AQUI
        
        socket.on('room_created', (id) => setRoomId(id));
        socket.on('update_players', setPlayers);
        socket.on('error_msg', (msg) => { alert(msg); setIsJoining(false); });
        
        socket.on('game_started', (data) => {
            setPlayers(data.players);
            setGameType(data.gameType);
            localStorage.setItem('saved_gameType', data.gameType);
            setGameData(data.gameData);
            setCurrentPhase(data.phase);
            setGameResult(null);
            setView('GAME');
        });

        socket.on('update_game_data', ({ gameData, phase }) => { 
            setGameData(gameData); 
            setCurrentPhase(phase); 
        });
        
        socket.on('game_over', (data) => {
             if (data.results) { 
                setGameResult(data); 
                setPlayers(data.results); 
                setCurrentPhase('REVEAL'); 
            } else {
                setCurrentPhase(data.phase || 'VICTORY'); 
                setGameData(prev => ({ ...prev, ...(data.gameData || {}), winner: data.winner }));
            }
        });
        
        socket.on('your_secret_number', setMySecret);
        socket.on('your_character', (char) => {
            // Atualiza apenas meu personagem localmente
            setPlayers(prev => prev.map(p => p.id === socket.id ? {...p, character: char} : p));
        });
        
        socket.on('phase_change', (data) => { setCurrentPhase(data.phase); if(data.players) setPlayers(data.players); });
        socket.on('kicked', () => { alert("Você foi removido."); sairDoJogo(); });

        // Auto-connect init
        if (savedRoom && !socket.connected) socket.connect();

        return () => { 
            socket.off('connect'); socket.off('disconnect'); socket.off('joined_room');
            socket.off('returned_to_lobby'); socket.off('game_started');
            // ... cleanups
        };
    }, []);

    const limparSessaoLocal = () => {
        localStorage.removeItem('saved_roomId');
        localStorage.removeItem('saved_nickname');
        localStorage.removeItem('saved_gameType');
        setRoomId(''); 
        setPlayers([]); 
        setIsHost(false); 
        setGameData({}); 
        setGameType(null);
    };

    const sairDoJogo = () => {
        limparSessaoLocal();
        setView('HOME'); 
        socket.disconnect();
    };

    const criarSala = () => {
        if(!nickname) return;
        setIsJoining(true);
        const enviar = () => socket.emit('create_room', { nickname, gameType: selectedGame });
        if (!socket.connected) { socket.connect(); socket.once('connect', enviar); } else enviar();
    };

    const entrarSala = () => {
        if(!nickname || !roomId) return;
        setIsJoining(true);
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
            {!isConnected && view !== 'HOME' && (
                <div className="fixed top-0 w-full bg-red-500 text-white text-xs text-center py-1 z-50">
                    Sem conexão... Tentando reconectar.
                </div>
            )}
        </GameContext.Provider>
    );
};