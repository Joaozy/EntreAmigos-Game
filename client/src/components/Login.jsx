import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Login() {
    const { loginSupabase, cadastroSupabase, recuperarSenha, isLoading, error, setError } = useGame();
    
    const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nick, setNick] = useState('');
    const [msg, setMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setMsg('');
        
        try {
            if (mode === 'login') {
                await loginSupabase(email, password);
            } else if (mode === 'register') {
                if (!nick) return setError("Por favor, escolha um apelido!");
                await cadastroSupabase(email, password, nick);
            } else if (mode === 'forgot') {
                await recuperarSenha(email);
                setMsg('Link de recuperação enviado para o seu email!');
                setMode('login');
            }
        } catch (err) {
            setError(err.message || "Ocorreu um erro.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">
            <div className="bg-slate-800 p-8 md:p-10 rounded-3xl w-full max-w-md shadow-2xl border border-slate-700/50 backdrop-blur-sm">
                
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2 drop-shadow-lg">
                        Entre<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Amigos</span>
                    </h1>
                    <p className="text-slate-400 text-sm font-medium">
                        {mode === 'login' && 'Bem-vindo de volta! 👋'}
                        {mode === 'register' && 'Crie sua conta e comece a jogar 🚀'}
                        {mode === 'forgot' && 'Recuperação de Senha 🔒'}
                    </p>
                </div>

                {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl mb-6 text-sm text-center font-medium animate-in fade-in">⚠️ {error}</div>}
                {msg && <div className="bg-green-500/10 border border-green-500/20 text-green-300 p-4 rounded-xl mb-6 text-sm text-center font-medium animate-in fade-in">✅ {msg}</div>}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {mode === 'register' && (
                        <div className="space-y-1">
                            <label className="text-slate-400 text-xs font-bold uppercase ml-1">Apelido</label>
                            <input type="text" className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500" value={nick} onChange={e => setNick(e.target.value)} required/>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-slate-400 text-xs font-bold uppercase ml-1">Email</label>
                        <input type="email" className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500" value={email} onChange={e => setEmail(e.target.value)} required/>
                    </div>

                    {mode !== 'forgot' && (
                        <div className="space-y-1">
                            <label className="text-slate-400 text-xs font-bold uppercase ml-1 flex justify-between">
                                Senha
                                {mode === 'login' && (
                                    <span onClick={() => {setMode('forgot'); setError(null); setMsg('');}} className="text-blue-400 cursor-pointer hover:underline normal-case">Esqueci a senha</span>
                                )}
                            </label>
                            <input type="password" className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500" value={password} onChange={e => setPassword(e.target.value)} required/>
                        </div>
                    )}

                    <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition shadow-lg mt-2 disabled:opacity-70 flex justify-center">
                        {isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : (mode === 'login' ? 'ENTRAR' : mode === 'register' ? 'CADASTRAR' : 'ENVIAR LINK')}
                    </button>
                </form>

                <div className="mt-8 text-center pt-6 border-t border-slate-700/50">
                    <button onClick={() => {setMode(mode === 'register' ? 'login' : 'register'); setError(null); setMsg('');}} className="text-blue-400 hover:text-blue-300 text-sm font-bold hover:underline transition">
                        {mode === 'register' ? 'Já possui cadastro? Fazer login' : 'Ainda não tem uma conta? Criar nova'}
                    </button>
                </div>
            </div>
        </div>
    );
}