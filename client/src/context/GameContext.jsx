import React, { createContext, useContext, useState, useEffect } from 'react';
import { socket } from '../socket';
import { supabase } from '../supabase';

const GameContext = createContext({});

export function useGame() {
    return useContext(GameContext);
}

export function GameProvider({ children }) {
    const [user, setUser] = useState(null);
    const [nickname, setNickname] = useState(localStorage.getItem('nickname') || '');
    const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem('avatarUrl') || null); // NOVO
    const [roomId, setRoomId] = useState(localStorage.getItem('roomId') || null);
    const [players, setPlayers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [gameType, setGameType] = useState(null);
    const [gameData, setGameData] = useState({});
    const [currentPhase, setPhase] = useState('LOBBY'); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(socket.connected);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
            setUser(currentUser);
            await carregarPerfil(currentUser);
        } else {
            setUser(null);
            setIsLoading(false);
            limparDadosLocais();
        }
    };

    const carregarPerfil = async (currentUser) => {
        try {
            let { data } = await supabase
                .from('profiles')
                .select('nickname, avatar_url')
                .eq('id', currentUser.id)
                .single();

            const nick = data?.nickname || currentUser.email.split('@')[0] || "Jogador";
            const avatar = data?.avatar_url || null;
            
            setNickname(nick);
            setAvatarUrl(avatar);
            localStorage.setItem('nickname', nick);
            if(avatar) localStorage.setItem('avatarUrl', avatar);
            
            conectarSocket(currentUser.id, nick, avatar);
        } catch (err) {
            console.error("❌ Erro perfil:", err);
            setIsLoading(false);
        }
    };

    const conectarSocket = (uid, nick, avatar) => {
        if (!socket.connected) socket.connect();
        socket.emit('identify', { userId: uid, nickname: nick, avatarUrl: avatar });
        
        const savedRoom = localStorage.getItem('roomId');
        if (savedRoom) socket.emit('rejoin_room', { roomId: savedRoom, userId: uid });
        
        setIsLoading(false);
    };

    useEffect(() => {
        const onJoined = (data) => {
            setRoomId(data.roomId);
            setPlayers(data.players || []);
            setGameType(data.gameType);
            setPhase(data.phase);
            setGameData(data.gameData || {});
            localStorage.setItem('roomId', data.roomId);
            const me = data.players.find(p => p.userId === user?.id);
            if (me) setIsHost(me.isHost);
        };

        const onForceDisconnect = async ({ reason }) => {
            alert(`DESCONECTADO: ${reason}`); 
            if (socket.connected) socket.disconnect();
            localStorage.clear(); 
            await supabase.auth.signOut();
            setUser(null);
            setNickname('');
            limparDadosLocais();
        };

        socket.on('connect', () => setIsConnected(true));
        socket.on('disconnect', () => setIsConnected(false));
        socket.on('joined_room', onJoined);
        socket.on('update_players', (list) => {
            setPlayers(list);
            const me = list.find(p => p.userId === user?.id);
            if (me) setIsHost(me.isHost);
        });
        socket.on('update_game_data', (data) => {
             if (data.gameData) setGameData(prev => ({ ...prev, ...data.gameData }));
             if (data.phase) setPhase(data.phase);
        });
        socket.on('force_disconnect', onForceDisconnect);
        socket.on('error_msg', (msg) => alert(msg));
        socket.on('rejoin_failed', () => limparDadosLocais());

        return () => socket.off();
    }, [user]);

    // --- AUTH & PERFIL ---
    const loginSupabase = async (email, password) => {
        setIsLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setIsLoading(false); }
    };

    const cadastroSupabase = async (email, password, nick) => {
        setIsLoading(true);
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setError(error.message); setIsLoading(false); return; }
        if (data?.user) {
            await supabase.from('profiles').insert([{ id: data.user.id, nickname: nick }]);
        }
    };

    // NOVA FUNÇÃO: Esqueci a Senha
    const recuperarSenha = async (email) => {
        setIsLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        setIsLoading(false);
        if (error) throw error;
    };

    // NOVA FUNÇÃO: Atualizar Perfil
    const atualizarPerfil = async (newNick, newPassword, file) => {
        setIsLoading(true);
        try {
            let newAvatarUrl = avatarUrl;

            // 1. Upload da foto se existir
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${user.id}-${Math.random()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, file, { upsert: true });

                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
                newAvatarUrl = data.publicUrl;
            }

            // 2. Atualizar tabela profiles
            if (newNick !== nickname || newAvatarUrl !== avatarUrl) {
                await supabase.from('profiles').update({ 
                    nickname: newNick, 
                    avatar_url: newAvatarUrl 
                }).eq('id', user.id);
                
                setNickname(newNick);
                setAvatarUrl(newAvatarUrl);
                localStorage.setItem('nickname', newNick);
                if(newAvatarUrl) localStorage.setItem('avatarUrl', newAvatarUrl);
            }

            // 3. Atualizar senha se fornecida
            if (newPassword) {
                const { error: passError } = await supabase.auth.updateUser({ password: newPassword });
                if (passError) throw passError;
            }

        } catch (err) {
            console.error(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const deslogar = async () => {
        if (socket.connected) socket.disconnect();
        limparDadosLocais();
        await supabase.auth.signOut();
        setUser(null);
    };

    const sairDoJogo = async () => {
        if (roomId && isConnected) socket.emit('leave_room');
        limparDadosLocais();
    };

    const limparDadosLocais = () => {
        localStorage.removeItem('roomId');
        setRoomId(null);
        setPlayers([]);
        setGameData({}); 
        setGameType(null);
        setPhase('LOBBY');
        setIsHost(false);
    };

    const criarSala = (gId) => user && socket.emit('create_room', { nickname, avatarUrl, gameId: gId, userId: user.id });
    const entrarSala = (rId) => user && socket.emit('join_room', { roomId: rId.toUpperCase(), nickname, avatarUrl, userId: user.id });
    const iniciarJogo = () => socket.emit('start_game');

    return (
        <GameContext.Provider value={{
            socket, user, nickname, avatarUrl, roomId, isHost, players, gameType, gameData, 
            currentPhase, isLoading, error, isConnected,
            loginSupabase, cadastroSupabase, recuperarSenha, atualizarPerfil,
            sairDoJogo, deslogar, criarSala, entrarSala, iniciarJogo, setError
        }}>
            {children}
        </GameContext.Provider>
    );
}