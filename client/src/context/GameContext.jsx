import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // Estados de Navegação e Usuário
    const [view, setView] = useState('HOME'); // HOME, LOGIN, LOBBY, GAME, LOADING
    const [roomId, setRoomId] = useState('');
    const [nickname, setNickname] = useState('');
    const [isHost, setIsHost] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    
    // Estados do Jogo (Dados)
    const [players, setPlayers] = useState([]);
    const [selectedGame, setSelectedGame] = useState('ITO'); // Jogo escolhido na Home
    const [gameType, setGameType] = useState(null);          // Jogo ativo na sala
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);

    useEffect(() => {
        // 1. Ler dados salvos ao montar o componente
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');

        // 2. Definir o que fazer quando conectar
        const onConnect = () => {
            console.log("Socket conectado!", socket.id);
            // Tenta reconectar automaticamente se houver dados salvos
            if (savedRoom && savedNick) {
                console.log("Tentando rejoin automático para:", savedRoom);
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        // 3. Listeners do Socket
        socket.on('connect', onConnect);
        
        socket.on('connect_error', (err) => {
            console.error("Erro de conexão:", err);
            if (view === 'LOADING' || isJoining) {
                alert("Erro ao conectar com o servidor. Tente novamente.");
                sairDoJogo();
            }
        });

        socket.on('joined_room', (data) => {
            console.log("Entrou na sala:", data);
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Salva sessão atual
            localStorage.setItem('saved_roomId', data.roomId);
            // Garante que salvamos o nick, caso tenha entrado por link ou código direto
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

        socket.on('room_created', (id) => {
             setRoomId(id);
             // O evento joined_room vem logo em seguida
        });
        
        socket.on('update_players', setPlayers);
        
        socket.on('game_started', (data) => {
            setPlayers(data.players);
            setGameType(data.gameType);
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
            // Lógica unificada de fim de jogo
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

        socket.on('kicked', () => { 
            alert("Você foi expulso da sala."); 
            sairDoJogo(); 
        });
        
        socket.on('error_msg', (msg) => { 
            console.warn("Erro recebido do server:", msg);
            if (view === 'LOADING') {
                alert("Não foi possível voltar à sala: " + msg);
                sairDoJogo(); 
            } else {
                alert(msg);
            }
            setIsJoining(false);
        });

        // 4. Lógica de Inicialização (Auto-Rejoin)
        if (savedRoom && savedNick) {
            console.log("Restaurando sessão...");
            setView('LOADING');
            setRoomId(savedRoom);
            setNickname(savedNick);
            
            if (!socket.connected) {
                socket.connect();
            } else {
                // Se já estiver conectado (ex: hot reload), emite direto
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        }

        return () => { 
            socket.off('connect', onConnect);
            socket.off('connect_error');
            // Nota: Em um app maior, removeríamos todos os listeners aqui
        };
    }, []); // Array vazio = roda apenas uma vez no mount

    // --- AÇÕES DO USUÁRIO ---

    const sairDoJogo = () => {
        localStorage.removeItem('saved_roomId');
        localStorage.removeItem('saved_nickname');
        
        setRoomId(''); 
        setPlayers([]); 
        setIsHost(false); 
        setView('HOME'); 
        setIsJoining(false);
        setGameData({}); 
        setGameType(null);
        
        socket.disconnect();
    };

    const criarSala = () => {
        if(!nickname) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);

        const enviar = () => {
            console.log("Enviando create_room...");
            socket.emit('create_room', { nickname, gameType: selectedGame });
        };

        if (!socket.connected) {
            console.log("Conectando socket antes de criar...");
            socket.connect();
            socket.once('connect', enviar);
        } else {
            enviar();
        }
    };

    const entrarSala = () => {
        if(!nickname || !roomId) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);

        const enviar = () => {
            console.log("Enviando join_room para:", roomId);
            socket.emit('join_room', { roomId, nickname });
        };

        if (!socket.connected) {
            console.log("Conectando socket antes de entrar...");
            socket.connect();
            socket.once('connect', enviar);
        } else {
            enviar();
        }
    };

    return (
        <GameContext.Provider value={{
            // Estados
            view, setView,
            players, isHost,
            roomId, setRoomId,
            nickname, setNickname,
            selectedGame, setSelectedGame,
            gameType, gameData,
            currentPhase, mySecret,
            gameResult, isJoining,
            socket,
            
            // Ações
            criarSala,
            entrarSala,
            sairDoJogo
        }}>
            {children}
        </GameContext.Provider>
    );
};