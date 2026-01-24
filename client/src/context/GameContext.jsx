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

    // Ref para o WakeLock (Bloqueio de tela)
    const wakeLockRef = useRef(null);

    // --- 1. SCREEN WAKE LOCK (MANTÉM TELA LIGADA) ---
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                console.log('📱 Screen Wake Lock ativo!');
                
                // Se o usuário minimizar e voltar, reativar
                document.addEventListener('visibilitychange', handleVisibilityChange);
            }
        } catch (err) {
            console.warn('⚠️ Erro ao ativar Wake Lock:', err);
        }
    };

    const handleVisibilityChange = async () => {
        if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    };

    useEffect(() => {
        // Ativa apenas quando estiver em jogo
        if (view === 'GAME' || view === 'LOBBY') {
            requestWakeLock();
        }
        return () => {
            if (wakeLockRef.current) wakeLockRef.current.release();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [view]);

    // --- 2. LÓGICA DE SOCKET ---
    useEffect(() => {
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');

        const onConnect = () => {
            console.log("🟢 Conectado:", socket.id);
            setIsConnected(true);
            if (savedRoom && savedNick) {
                // Tenta reconexão automática
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        const onDisconnect = () => {
            console.log("🔴 Desconectado.");
            setIsConnected(false);
        };

        const onErrorMsg = (msg) => {
            console.warn("⚠️ Server msg:", msg);
            // Só reseta se for erro crítico de sala inexistente
            if (msg.includes("não encontrada") || msg.includes("expirou")) {
                alert(msg);
                limparSessaoLocal();
                setView('HOME');
            } else {
                // Erros menores não devem resetar a view
                console.log("Erro não crítico:", msg);
            }
            setIsJoining(false);
        };

        // Handlers de Sala
        const onJoinedRoom = (data) => {
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Salva sessão
            localStorage.setItem('saved_roomId', data.roomId);
            const myNick = data.players.find(p => p.id === socket.id)?.nickname || savedNick || nickname;
            localStorage.setItem('saved_nickname', myNick);
            if(myNick) setNickname(myNick);

            if (data.phase !== 'LOBBY') {
                setCurrentPhase(data.phase);
                setView('GAME');
                // Se reconectou no meio de um jogo, avisa que está pronto
                socket.emit('player_ready', { roomId: data.roomId });
            } else {
                setView('LOBBY');
            }
            setIsJoining(false);
        };

        // --- 3. HANDSHAKE (PREPARE GAME) ---
        // O servidor manda isso ANTES de 'game_started'
        socket.on('prepare_game', (data) => {
            console.log("📥 Preparando jogo...", data);
            setGameType(data.gameType);
            setGameData(data.gameData || {});
            setPlayers(data.players);
            setCurrentPhase('LOADING'); // Mostra tela de carregamento se tiver
            setView('GAME');

            // Importante: Dá um pequeno delay para garantir que o React montou o componente
            setTimeout(() => {
                console.log("📤 Enviando: Estou Pronto!");
                socket.emit('player_ready', { roomId: data.roomId });
            }, 500);
        });

        socket.on('game_started', (data) => {
            console.log("🚀 Jogo Iniciado Realmente!");
            setPlayers(data.players);
            setCurrentPhase(data.phase);
            setGameData(data.gameData);
        });

        // Listeners Padrão
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('error_msg', onErrorMsg);
        socket.on('joined_room', onJoinedRoom);
        socket.on('room_created', (id) => setRoomId(id));
        socket.on('update_players', setPlayers);
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

        // Auto-join ao carregar página
        if (savedRoom && savedNick && !socket.connected) {
            setView('LOADING');
            setRoomId(savedRoom);
            setNickname(savedNick);
            socket.connect();
        }

        return () => { 
            socket.off('connect');
            socket.off('disconnect');
            socket.off('error_msg');
            socket.off('joined_room');
            socket.off('prepare_game'); // Limpeza nova
            socket.off('game_started');
            // ... limpar outros listeners se necessário
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
            {/* Banner de Reconexão Melhorado */}
            {!isConnected && view !== 'HOME' && view !== 'LOGIN' && (
                <div className="fixed top-0 left-0 w-full bg-amber-500 text-white text-xs font-bold text-center py-2 z-[9999] shadow-lg flex items-center justify-center gap-2">
                    <span className="animate-spin">↻</span> Conexão instável... tentando reconectar.
                </div>
            )}
        </GameContext.Provider>
    );
};