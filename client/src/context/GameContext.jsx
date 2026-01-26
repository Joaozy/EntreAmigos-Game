import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';

const GameContext = createContext();
export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // --- ESTADOS ---
    const [view, setView] = useState('HOME'); // HOME (Login) -> LOBBY -> GAME
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [currentUser, setCurrentUser] = useState(null); // Objeto User Completo (do DB)
    
    // Dados da Sala/Jogo
    const [roomId, setRoomId] = useState('');
    const [isHost, setIsHost] = useState(false);
    const [players, setPlayers] = useState([]);
    const [selectedGame, setSelectedGame] = useState('ITO');
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);
    const [isJoining, setIsJoining] = useState(false);

    // --- 1. INICIALIZAÇÃO (AUTO-LOGIN) ---
    useEffect(() => {
        // Verifica se tem ID salvo no localStorage para auto-login
        const savedUserId = localStorage.getItem('entreamigos_uid');
        if (savedUserId && socket.connected) {
            socket.emit('auth_reconnect', { userId: savedUserId });
        }

        const onConnect = () => {
            setIsConnected(true);
            const uid = localStorage.getItem('entreamigos_uid');
            if (uid) socket.emit('auth_reconnect', { userId: uid });
        };

        const onDisconnect = () => setIsConnected(false);

        // RESPOSTAS DE AUTENTICAÇÃO
        const onAuthSuccess = (user) => {
            console.log("✅ Autenticado:", user.name);
            setCurrentUser(user);
            localStorage.setItem('entreamigos_uid', user.id);
            
            // Verifica se estava em uma sala
            const savedRoom = localStorage.getItem('saved_roomId');
            if (savedRoom) {
                socket.emit('rejoin_game', { roomId: savedRoom, userId: user.id });
            } else {
                setView('LOBBY'); // Vai pro Dashboard
            }
        };

        const onAuthError = (msg) => {
            alert(msg);
            localStorage.removeItem('entreamigos_uid');
            setView('HOME');
        };

        // RESPOSTAS DE SALA
        const onJoinedRoom = (data) => {
            setRoomId(data.roomId);
            setGameType(data.gameType);
            setPlayers(data.players);
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Verifica Host
            if(currentUser && data.players) {
                const me = data.players.find(p => p.userId === currentUser.id);
                setIsHost(me?.isHost || false);
            }

            localStorage.setItem('saved_roomId', data.roomId);

            if (data.phase !== 'LOBBY') {
                setCurrentPhase(data.phase);
                setView('GAME');
            } else {
                setView('LOBBY'); // Aqui é a Sala de Espera (dentro do jogo), não o Dashboard
            }
            setIsJoining(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('auth_success', onAuthSuccess);
        socket.on('auth_error', onAuthError);
        socket.on('joined_room', onJoinedRoom);
        
        socket.on('update_players', (list) => {
            setPlayers(list);
            if(currentUser) {
                const me = list.find(p => p.userId === currentUser.id);
                if(me) setIsHost(me.isHost);
            }
        });

        socket.on('game_started', (data) => {
            setGameType(data.gameType);
            setGameData(data.gameData);
            setCurrentPhase(data.phase);
            setView('GAME');
        });

        socket.on('update_game_data', ({gameData, phase}) => {
            setGameData(gameData);
            if(phase) setCurrentPhase(phase);
        });

        socket.on('game_over', (data) => {
             if (data.results) { setGameResult(data); setPlayers(data.results); setCurrentPhase('REVEAL'); }
             else { setCurrentPhase(data.phase || 'VICTORY'); setGameData(prev => ({...prev, ...data.gameData})); }
        });

        socket.on('your_secret_number', setMySecret);
        
        socket.on('returned_to_lobby', () => {
            setCurrentPhase('LOBBY');
            setView('LOBBY'); // Sala de espera
            setGameData({});
        });

        socket.on('room_created', (id) => setRoomId(id));
        socket.on('error_msg', (msg) => { alert(msg); setIsJoining(false); });
        socket.on('kicked', () => { sairDoJogo(); alert("Você foi removido."); });

        return () => { 
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('auth_success');
            socket.off('auth_error');
            socket.off('joined_room');
            socket.off('update_players');
            socket.off('game_started');
            socket.off('update_game_data');
            socket.off('game_over');
            socket.off('returned_to_lobby');
        };
    }, [currentUser]); // Dependência do currentUser

    // --- AÇÕES DO USUÁRIO ---

    const handleLogin = (email, password) => {
        socket.emit('auth_login', { email, password });
    };

    const handleRegister = (name, email, password) => {
        socket.emit('auth_register', { name, email, password });
    };

    const criarSala = () => {
        if(!currentUser) return;
        setIsJoining(true);
        socket.emit('create_room', { nickname: currentUser.name, gameType: selectedGame, userId: currentUser.id });
    };

    const entrarSala = () => {
        if(!currentUser || !roomId) return;
        setIsJoining(true);
        socket.emit('join_room', { roomId, nickname: currentUser.name, userId: currentUser.id });
    };

    const sairDoJogo = () => {
        localStorage.removeItem('saved_roomId');
        setRoomId('');
        setPlayers([]);
        setView('DASHBOARD'); // Volta para o menu de escolha de jogo (Lobby.jsx precisa tratar isso)
    };

    return (
        <GameContext.Provider value={{
            view, setView, isConnected, currentUser,
            players, isHost, roomId, setRoomId, selectedGame, setSelectedGame,
            gameType, gameData, currentPhase, mySecret, gameResult, isJoining,
            handleLogin, handleRegister, criarSala, entrarSala, sairDoJogo, 
            myUserId: currentUser?.id, // Alias para compatibilidade
            nickname: currentUser?.name, // Alias para compatibilidade
            myStats: currentUser?.stats,
            socket
        }}>
            {children}
        </GameContext.Provider>
    );
};