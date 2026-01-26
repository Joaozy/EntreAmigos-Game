import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { socket } from '../socket';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // --- ESTADOS ---
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

    // Ref para o WakeLock (Bloqueio de tela - Celular não apagar)
    const wakeLockRef = useRef(null);

    // --- SCREEN WAKE LOCK ---
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.warn('⚠️ Erro ao ativar Wake Lock:', err);
        }
    };

    useEffect(() => {
        if (view === 'GAME' || view === 'LOBBY') requestWakeLock();
        return () => { if (wakeLockRef.current) wakeLockRef.current.release(); };
    }, [view]);

    // --- LÓGICA DE CONEXÃO E RECOVERY ---
    useEffect(() => {
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');
        const savedGameType = localStorage.getItem('saved_gameType'); // NOVO

        const onConnect = () => {
            console.log("🟢 Conectado:", socket.id);
            setIsConnected(true);
            if (savedRoom && savedNick) {
                console.log("🔄 Recuperando sessão...", savedRoom);
                // Se já sabemos o jogo, seta antes do join para evitar flash de tela
                if (savedGameType) setGameType(savedGameType);
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        const onDisconnect = () => {
            console.log("🔴 Desconectado.");
            setIsConnected(false);
        };

        const onErrorMsg = (msg) => {
            console.warn("⚠️ Server msg:", msg);
            if (msg.includes("não encontrada") || msg.includes("expirou")) {
                alert("Sessão expirada ou sala encerrada.");
                limparSessaoLocal();
                setView('HOME');
            } else {
                // Erros não fatais (ex: nome em uso) não devem resetar tudo
                console.log(msg);
            }
            setIsJoining(false);
        };

        const onJoinedRoom = (data) => {
            console.log("✅ Joined/Rejoined:", data);
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            
            // Persistência robusta
            localStorage.setItem('saved_roomId', data.roomId);
            const myNick = data.players.find(p => p.id === socket.id)?.nickname || savedNick || nickname;
            localStorage.setItem('saved_nickname', myNick);
            if (myNick) setNickname(myNick);
            if (data.gameType) localStorage.setItem('saved_gameType', data.gameType);

            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);

            // Redirecionamento inteligente
            if (data.phase !== 'LOBBY') {
                setCurrentPhase(data.phase);
                setView('GAME');
            } else {
                setView('LOBBY');
            }
            setIsJoining(false);
        };

        // Listeners
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('error_msg', onErrorMsg);
        socket.on('joined_room', onJoinedRoom);
        
        socket.on('room_created', (id) => setRoomId(id));
        socket.on('update_players', setPlayers);
        
        // Handshake de início
        socket.on('prepare_game', (data) => {
            setGameType(data.gameType);
            if (data.gameType) localStorage.setItem('saved_gameType', data.gameType);
            setGameData(data.gameData || {});
            setPlayers(data.players);
            setView('GAME');
            // Responde que está pronto (evita lag)
            setTimeout(() => socket.emit('player_ready', { roomId: data.roomId }), 500);
        });

        socket.on('game_started', (data) => {
            setPlayers(data.players);
            setGameType(data.gameType);
            if(data.gameType) localStorage.setItem('saved_gameType', data.gameType);
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
             if(data.winnerWord || data.winner || data.secretWord) { 
                setCurrentPhase(data.phase || 'VICTORY'); 
                setGameData(prev => ({ ...prev, ...(data.gameData || {}), winner: data.winner, secretWord: data.secretWord, targetWord: data.targetWord }));
            } else if (data.results) { 
                setGameResult(data); 
                setPlayers(data.results); 
                setCurrentPhase('REVEAL'); 
            }
        });
        
        socket.on('your_secret_number', setMySecret);
        socket.on('phase_change', (data) => { 
            setCurrentPhase(data.phase); 
            if(data.players) setPlayers(data.players); 
        });
        socket.on('player_submitted', ({ playerId }) => { 
            setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p)); 
        });
        socket.on('order_updated', setPlayers);
        socket.on('kicked', () => { alert("Você foi removido da sala."); sairDoJogo(); });
        
        // Handler para reset (Voltar ao Lobby)
        socket.on('returned_to_lobby', (data) => {
            setCurrentPhase('LOBBY');
            setView('LOBBY');
            setGameData({});
            if (data.players) setPlayers(data.players);
        });

        // Inicialização manual se não conectar auto
        if (savedRoom && savedNick && !socket.connected) {
            setView('LOADING'); // Feedback visual
            socket.connect();
        }

        return () => { 
            socket.off('connect');
            socket.off('disconnect');
            socket.off('error_msg');
            socket.off('joined_room');
            socket.off('prepare_game');
            socket.off('game_started');
            socket.off('returned_to_lobby');
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
            {!isConnected && view !== 'HOME' && view !== 'LOGIN' && (
                <div className="fixed top-0 left-0 w-full bg-amber-600 text-white text-xs font-bold text-center py-2 z-[9999] shadow-lg flex items-center justify-center gap-2">
                    <span className="animate-spin">↻</span> Reconectando...
                </div>
            )}
        </GameContext.Provider>
    );
};