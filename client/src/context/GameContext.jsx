import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { supabase } from '../supabase';

// Contexto com valores padrão
const GameContext = createContext({
    user: null,
    nickname: '',
    isLoading: false,
    error: null,
    loginSupabase: () => {},
    cadastroSupabase: () => {},
    sairDoJogo: () => {},
    deslogar: () => {}, // ADICIONADO
    criarSala: () => {},
    entrarSala: () => {},
    iniciarJogo: () => {}
});

export function useGame() {
    return useContext(GameContext);
}

export function GameProvider({ children }) {
    // --- ESTADOS ---
    const [user, setUser] = useState(null);
    const [nickname, setNickname] = useState(localStorage.getItem('nickname') || '');
    const [roomId, setRoomId] = useState(localStorage.getItem('roomId') || null);
    const [players, setPlayers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setPhase] = useState('LOBBY'); 
    
    // UI
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(socket.connected);

    // --- 1. SETUP INICIAL ---
    useEffect(() => {
        console.log("🔄 [Context] Iniciando verificação de sessão...");
        
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log(`🔔 [Auth] Evento: ${event}`);
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setIsLoading(false);
                limparDadosLocais();
            } else {
                handleSession(session);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSession = async (session) => {
        const currentUser = session?.user ?? null;
        
        if (currentUser) {
            console.log("👤 [Session] Usuário detectado:", currentUser.email);
            setUser(currentUser);
            await carregarPerfil(currentUser);
        } else {
            console.log("👤 [Session] Nenhum usuário.");
            setUser(null);
            setIsLoading(false);
            limparDadosLocais();
        }
    };

    const carregarPerfil = async (currentUser) => {
        try {
            let { data, error } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', currentUser.id)
                .single();

            const nick = data?.nickname || currentUser.email.split('@')[0] || "Jogador";
            
            setNickname(nick);
            localStorage.setItem('nickname', nick);
            
            conectarSocket(currentUser.id, nick);

        } catch (err) {
            console.error("❌ [Perfil] Erro:", err);
            setIsLoading(false);
        }
    };

    const conectarSocket = (uid, nick) => {
        if (!socket.connected) socket.connect();
        
        socket.emit('identify', { userId: uid, nickname: nick });
        
        const savedRoom = localStorage.getItem('roomId');
        if (savedRoom) {
            console.log("🔄 [Socket] Tentando reconectar na sala:", savedRoom);
            socket.emit('rejoin_room', { roomId: savedRoom, userId: uid });
        }
        
        setIsLoading(false);
    };

    // --- SOCKET LISTENERS ---
    useEffect(() => {
        const onJoined = (data) => {
            console.log("✅ [Socket] Entrou na sala:", data.roomId);
            setRoomId(data.roomId);
            setPlayers(data.players || []);
            setGameType(data.gameType);
            setPhase(data.phase);
            setGameData(data.gameData || {});
            localStorage.setItem('roomId', data.roomId);
            
            const me = data.players.find(p => p.userId === user?.id);
            if (me) setIsHost(me.isHost);
        };

        const onUpdatePlayers = (list) => {
            setPlayers(list);
            const me = list.find(p => p.userId === user?.id);
            if (me) setIsHost(me.isHost);
        };

        const onGameData = (data) => {
             if (data.gameData) setGameData(prev => ({ ...prev, ...data.gameData }));
             if (data.phase) setPhase(data.phase);
        };

        // --- CORREÇÃO DO LOOP E LOGOUT FORÇADO ---
        const onForceDisconnect = async ({ reason }) => {
            console.warn("⛔ Sessão encerrada remotamente:", reason);
            alert(`DESCONECTADO: ${reason}`); 
            
            // 1. Corta o socket para garantir que não receba mais nada
            if (socket.connected) socket.disconnect();

            // 2. Limpa armazenamento local
            localStorage.clear(); 
            
            // 3. Logout do Supabase (sem recarregar página)
            await supabase.auth.signOut();

            // 4. Zera o estado do usuário -> Isso força o App a mostrar a tela de Login
            setUser(null);
            setNickname('');
            limparDadosLocais();
        };

        socket.on('connect', () => setIsConnected(true));
        socket.on('disconnect', () => setIsConnected(false));
        socket.on('joined_room', onJoined);
        socket.on('update_players', onUpdatePlayers);
        socket.on('update_game_data', onGameData);
        socket.on('force_disconnect', onForceDisconnect);
        socket.on('error_msg', (msg) => alert(msg));
        socket.on('rejoin_failed', () => limparDadosLocais());

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('joined_room');
            socket.off('update_players');
            socket.off('update_game_data');
            socket.off('force_disconnect');
            socket.off('error_msg');
            socket.off('rejoin_failed');
        };
    }, [user]);

    // --- AÇÕES ---
    const loginSupabase = async (email, password) => {
        setIsLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setError(error.message);
            setIsLoading(false);
        }
    };

    const cadastroSupabase = async (email, password, nick) => {
        setIsLoading(true);
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            setError(error.message);
            setIsLoading(false);
            return;
        }
        if (data?.user) {
            await supabase.from('profiles').insert([{ id: data.user.id, nickname: nick }]);
        }
    };

    // --- NOVA FUNÇÃO: SAIR DA CONTA (LOGOUT) ---
    const deslogar = async () => {
        try {
            if (socket.connected) socket.disconnect();
            limparDadosLocais();
            await supabase.auth.signOut();
            setUser(null); // Força atualização imediata
        } catch (e) {
            console.error("Erro ao sair", e);
        }
    };

    const sairDoJogo = async () => {
        if (roomId && isConnected) socket.emit('leave_room');
        // Mantemos o login (Supabase), mas matamos a sala
        limparDadosLocais();
    };

    const limparDadosLocais = () => {
        console.log("🧹 [Context] Executando limpeza total de jogo...");
        
        // 1. Limpa LocalStorage
        localStorage.removeItem('roomId');
        
        // 2. Reseta TODOS os estados do React para o padrão
        setRoomId(null);
        setPlayers([]);
        setGameData({}); 
        setGameType(null);
        setPhase('LOBBY');
        setIsHost(false);
        
        // 3. Opcional: Força um refresh na URL para limpar memória do navegador se estiver muito bugado
        window.history.pushState({}, document.title, "/");
    };

    const criarSala = (gId) => user && socket.emit('create_room', { nickname, gameId: gId, userId: user.id });

    const entrarSala = (rId) => user && socket.emit('join_room', { roomId: rId.toUpperCase(), nickname, userId: user.id });
    
    const iniciarJogo = () => socket.emit('start_game');

    return (
        <GameContext.Provider value={{
            socket,
            user, nickname, roomId, isHost, players, gameType, gameData, 
            currentPhase, isLoading, error, isConnected,
            loginSupabase, cadastroSupabase, 
            sairDoJogo, // Sai da sala
            deslogar,   // Sai da conta (NOVO)
            criarSala, entrarSala, iniciarJogo
        }}>
            {children}
        </GameContext.Provider>
    );
}