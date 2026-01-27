import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';
import { supabase } from '../supabase';

const GameContext = createContext();
export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    // --- ESTADOS ---
    const [view, setView] = useState('HOME');
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [user, setUser] = useState(null); 
    
    // Game States
    const [roomId, setRoomId] = useState('');
    const [isHost, setIsHost] = useState(false);
    const [players, setPlayers] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setCurrentPhase] = useState('LOBBY');
    const [mySecret, setMySecret] = useState(null);
    const [gameResult, setGameResult] = useState(null);
    const [isJoining, setIsJoining] = useState(false);

    // --- 1. MONITORAMENTO DE SESSÃO (SUPABASE) ---
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) fetchProfile(session.user.id, session.user.email);
        };
        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                await fetchProfile(session.user.id, session.user.email);
            } else {
                setUser(null);
                setView('HOME');
                localStorage.clear();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId, userEmail) => {
        try {
            // 1. Tenta buscar o perfil existente
            let { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle(); // Use maybeSingle para não dar erro 406 se não achar
            
            // 2. CORREÇÃO: Se não existir perfil, cria um automaticamente (Auto-Healing)
            if (!data) {
                console.log("Perfil não encontrado. Criando automaticamente...");
                const randomNick = "Jogador" + Math.floor(Math.random() * 1000);
                const { data: newData, error: insertError } = await supabase
                    .from('profiles')
                    .insert([{ id: userId, nickname: randomNick }])
                    .select()
                    .single();
                
                if (insertError) {
                    console.error("Erro ao criar perfil automático:", insertError);
                    return;
                }
                data = newData;
            }
            
            if (data) {
                const completeUser = { ...data, email: userEmail };
                setUser(completeUser);
                setView('LOBBY'); // <--- ISSO TIRA VOCÊ DA TELA DE LOGIN
                
                if(socket.connected) socket.emit('identify', { userId: completeUser.id, nickname: completeUser.nickname });
            }
        } catch (error) { 
            console.error("Erro crítico no perfil:", error); 
        }
    };

    // --- 2. SOCKET LISTENERS ---
    useEffect(() => {
        const onConnect = () => {
            setIsConnected(true);
            if (user) {
                socket.emit('identify', { userId: user.id, nickname: user.nickname });
                
                // Tenta reconectar se caiu
                const savedRoom = localStorage.getItem('saved_roomId');
                if (savedRoom) socket.emit('rejoin_room', { roomId: savedRoom, userId: user.id });
            }
        };

        const onDisconnect = () => setIsConnected(false);

        const onJoinedRoom = (data) => {
            console.log("Joined Room:", data);
            setRoomId(data.roomId);
            setPlayers(data.players || []);
            
            if (data.gameType) setSelectedGame(data.gameType);
            if (data.gameData) setGameData(data.gameData);
            
            if(user && data.players) {
                const me = data.players.find(p => p.userId === user.id);
                setIsHost(me?.isHost || false);
            }

            localStorage.setItem('saved_roomId', data.roomId);
            setCurrentPhase(data.phase);
            setView('GAME'); 
            setIsJoining(false);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('joined_room', onJoinedRoom);
        
        socket.on('update_players', (list) => {
            setPlayers(list);
            const me = list.find(p => p.userId === user?.id);
            if(me) setIsHost(me.isHost);
        });

        socket.on('update_game_data', ({gameData, phase}) => {
            setGameData(prev => ({...prev, ...gameData}));
            if(phase) setCurrentPhase(phase);
        });

        socket.on('game_over', (data) => {
             if (data.results) setGameResult(data);
             if (data.phase) setCurrentPhase(data.phase);
             if (data.gameData) setGameData(prev => ({...prev, ...data.gameData}));
        });

        socket.on('your_secret_number', setMySecret);
        
        socket.on('error_msg', (msg) => { 
            alert(msg); 
            setIsJoining(false); 
        });

        return () => { 
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('joined_room', onJoinedRoom);
            socket.off('update_players');
            socket.off('update_game_data');
            socket.off('game_over');
            socket.off('your_secret_number');
            socket.off('error_msg');
        };
    }, [user]);

    // --- AÇÕES ---
    const criarSala = () => {
        if(!user || !selectedGame) return;
        setIsJoining(true);
        socket.emit('create_room', { nickname: user.nickname, gameId: selectedGame, userId: user.id });
    };

    const entrarSala = () => {
        if(!user || !roomId) return;
        setIsJoining(true);
        socket.emit('join_room', { roomId, userId: user.id, nickname: user.nickname });
    };

    const sairDoJogo = () => {
        localStorage.removeItem('saved_roomId');
        setRoomId(''); 
        setPlayers([]); 
        setGameData({});
        setView('LOBBY'); 
        socket.emit('leave_room'); 
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setView('HOME');
        setUser(null);
    };

    return (
        <GameContext.Provider value={{
            view, setView, isConnected, user,
            players, isHost, roomId, setRoomId, selectedGame, setSelectedGame,
            gameData, currentPhase, mySecret, gameResult, isJoining,
            criarSala, entrarSala, sairDoJogo, logout,
            myUserId: user?.id, nickname: user?.nickname,
            socket
        }}>
            {children}
        </GameContext.Provider>
    );
};