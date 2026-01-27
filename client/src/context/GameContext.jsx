import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';
import { supabase } from '../supabase';

const GameContext = createContext();
export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // --- ESTADOS ---
    const [view, setView] = useState('HOME');
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [user, setUser] = useState(null); // Usuário Supabase + Profile
    
    // Game States
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

    // --- 1. MONITORAMENTO DE SESSÃO (SUPABASE) ---
    useEffect(() => {
        // Verifica sessão atual
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) fetchProfile(session.user.id);
        };
        checkSession();

        // Escuta mudanças (Login/Logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                await fetchProfile(session.user.id);
            } else {
                setUser(null);
                setView('HOME');
                localStorage.clear();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (data) {
                const completeUser = { ...data, email: 'user@app.com' }; // Email vem da session, mas aqui simplificamos
                setUser(completeUser);
                setView('LOBBY');
                
                // Conecta no Socket com o ID real
                if(socket.connected) socket.emit('identify', { userId: completeUser.id, nickname: completeUser.nickname });
            }
        } catch (error) { console.error("Erro perfil:", error); }
    };

    // --- 2. SOCKET LISTENERS ---
    useEffect(() => {
        const onConnect = () => {
            setIsConnected(true);
            if (user) socket.emit('identify', { userId: user.id, nickname: user.nickname });
            
            // Tenta rejoin
            const savedRoom = localStorage.getItem('saved_roomId');
            if (savedRoom && user) {
                socket.emit('rejoin_room', { roomId: savedRoom, userId: user.id });
            }
        };

        const onJoinedRoom = (data) => {
            setRoomId(data.roomId);
            setPlayers(data.players);
            
            // ATENÇÃO: Se o servidor mandar o gameType, usamos ele (quem entra).
            // Se não mandar (quem cria), usamos o selectedGame local.
            if (data.gameType) setSelectedGame(data.gameType);
            
            if(data.gameData) setGameData(data.gameData);
            if(data.mySecretNumber) setMySecret(data.mySecretNumber);
            
            // Verifica Host
            if(user && data.players) {
                const me = data.players.find(p => p.userId === user.id);
                setIsHost(me?.isHost || false);
            }

            localStorage.setItem('saved_roomId', data.roomId);

            // CORREÇÃO CRÍTICA: Sempre vai para a view 'GAME' se entrou na sala.
            // A WaitingRoom vai lidar com a fase 'LOBBY'.
            setCurrentPhase(data.phase);
            setView('GAME'); 
            
            setIsJoining(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', () => setIsConnected(false));
        socket.on('joined_room', onJoinedRoom);
        
        socket.on('update_players', (list) => {
            setPlayers(list);
            const me = list.find(p => p.userId === user?.id);
            if(me) setIsHost(me.isHost);
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
        socket.on('your_character', (c) => setPlayers(prev => prev.map(p => p.userId === user?.id ? {...p, character:c}:p)));
        
        socket.on('returned_to_lobby', () => {
            setCurrentPhase('LOBBY');
            setView('LOBBY');
            setGameData({});
        });

        socket.on('error_msg', (msg) => { alert(msg); setIsJoining(false); });
        socket.on('kicked', () => { sairDoJogo(); alert("Removido."); });

        return () => { 
            socket.off('connect', onConnect);
            socket.off('joined_room', onJoinedRoom);
            socket.off('update_players');
            socket.off('game_started');
            socket.off('update_game_data');
            socket.off('game_over');
            socket.off('returned_to_lobby');
        };
    }, [user]);

    // --- AÇÕES ---
    const criarSala = () => {
        if(!user) return;
        setIsJoining(true);
        socket.emit('create_room', { nickname: user.nickname, gameType: selectedGame, userId: user.id });
    };

    const entrarSala = () => {
        if(!user || !roomId) return;
        setIsJoining(true);
        socket.emit('join_room', { roomId, userId: user.id, nickname: user.nickname });
    };

    const sairDoJogo = () => {
        localStorage.removeItem('saved_roomId');
        setRoomId(''); setPlayers([]); setGameData({});
        setView('DASHBOARD'); // Volta para o Menu Principal
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setView('HOME');
    };

    return (
        <GameContext.Provider value={{
            view, setView, isConnected, user,
            players, isHost, roomId, setRoomId, selectedGame, setSelectedGame,
            gameType, gameData, currentPhase, mySecret, gameResult, isJoining,
            criarSala, entrarSala, sairDoJogo, logout,
            myUserId: user?.id, nickname: user?.nickname, myStats: { wins: user?.wins || 0 },
            socket
        }}>
            {children}
        </GameContext.Provider>
    );
};