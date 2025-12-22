import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    const [view, setView] = useState('HOME'); // HOME, LOGIN, LOBBY, GAME
    const [players, setPlayers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [roomId, setRoomId] = useState('');
    const [nickname, setNickname] = useState('');
    
    // Estados do Jogo
    const [selectedGame, setSelectedGame] = useState('ITO');
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);
    const [isJoining, setIsJoining] = useState(false);

    useEffect(() => {
        // 1. Ler do LocalStorage
        const savedRoom = localStorage.getItem('saved_roomId');
        const savedNick = localStorage.getItem('saved_nickname');

        // 2. Definir função de conexão ANTES de conectar
        const onConnect = () => {
            console.log("Socket conectado!", socket.id);
            // CORREÇÃO CRÍTICA: Usamos as variáveis locais 'savedRoom' e 'savedNick'
            // em vez do estado 'roomId'/'nickname' que pode estar vazio no closure.
            if (savedRoom && savedNick) {
                console.log("Tentando rejoin automático para:", savedRoom);
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        };

        // 3. Configurar Listeners
        socket.on('connect', onConnect);

        socket.on('joined_room', (data) => {
            console.log("Entrou na sala:", data);
            setRoomId(data.roomId);
            setIsHost(data.isHost);
            setPlayers(data.players);
            setGameType(data.gameType);
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Salva novamente para garantir
            localStorage.setItem('saved_roomId', data.roomId);
            localStorage.setItem('saved_nickname', data.players.find(p => p.id === socket.id)?.nickname || savedNick || nickname);
            
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
             if(data.winnerWord || data.winner || data.secretWord) { 
                setCurrentPhase(data.phase || 'VICTORY'); 
                setGameData(prev => ({ ...prev, ...(data.gameData || {}), winner: data.winner }));
            } else if (data.results) { 
                setGameResult(data);
                setPlayers(data.results); 
                setCurrentPhase('REVEAL'); 
            }
        });

        socket.on('your_secret_number', setMySecret);
        socket.on('phase_change', (data) => { setCurrentPhase(data.phase); if(data.players) setPlayers(data.players); });
        socket.on('player_submitted', ({ playerId }) => {
            setPlayers(prev => prev.map(p => p.id === playerId ? {...p, hasSubmitted: true} : p));
        });
        socket.on('order_updated', setPlayers);

        socket.on('kicked', () => { alert("Você foi expulso."); sairDoJogo(); });
        socket.on('error_msg', (msg) => { 
            console.warn("Erro recebido:", msg);
            if (view === 'LOADING') {
                alert("Erro ao reconectar: " + msg);
                sairDoJogo(); 
            } else {
                alert(msg);
            }
            setIsJoining(false);
        });

        // 4. Lógica de Inicialização (Rejoin ou Home)
        if (savedRoom && savedNick) {
            console.log("Dados salvos encontrados. Iniciando modo LOADING...");
            setView('LOADING');
            setRoomId(savedRoom);
            setNickname(savedNick);
            
            if (!socket.connected) {
                console.log("Socket desconectado. Iniciando conexão...");
                socket.connect();
            } else {
                console.log("Socket já conectado. Emitindo rejoin direto.");
                socket.emit('rejoin_room', { roomId: savedRoom, nickname: savedNick });
            }
        }

        return () => { 
            socket.off('connect', onConnect);
            // Não desligamos outros listeners globais aqui para evitar problemas de montagem/desmontagem rápida,
            // mas em um app maior seria ideal limpar tudo.
        };
    }, []); // Executa apenas uma vez no mount

    const sairDoJogo = () => {
        localStorage.removeItem('saved_roomId');
        localStorage.removeItem('saved_nickname');
        setRoomId(''); setPlayers([]); setIsHost(false); setView('HOME'); setIsJoining(false);
        setGameData({}); setGameType(null);
        socket.disconnect();
    };

    const criarSala = () => {
        if(!nickname) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);
        if (!socket.connected) socket.connect();
        // Pequeno delay para garantir que 'connect' disparou se estava desconectado
        setTimeout(() => {
            if (socket.connected) socket.emit('create_room', { nickname, gameType: selectedGame });
        }, 100);
    };

    const entrarSala = () => {
        if(!nickname || !roomId) return;
        setIsJoining(true);
        localStorage.setItem('saved_nickname', nickname);
        if (!socket.connected) socket.connect();
        
        // Se já estiver conectado, envia. Se não, o listener 'connect' (definido no useEffect)
        // NÃO vai pegar este caso específico de login manual, então precisamos garantir o envio aqui
        // ou adicionar um listener temporário. Como o socket.js tem autoConnect:false,
        // o fluxo mais seguro é:
        if (socket.connected) {
             socket.emit('join_room', { roomId, nickname });
        } else {
             // Listener one-time para conectar e enviar
             socket.once('connect', () => {
                 socket.emit('join_room', { roomId, nickname });
             });
             socket.connect();
        }
    };

    return (
        <GameContext.Provider value={{
            view, setView, players, isHost, roomId, setRoomId, nickname, setNickname,
            selectedGame, setSelectedGame, gameType, gameData, currentPhase, mySecret,
            gameResult, isJoining, criarSala, entrarSala, sairDoJogo, socket
        }}>
            {children}
        </GameContext.Provider>
    );
};