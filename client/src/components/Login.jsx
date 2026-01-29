import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Login() {
    const { loginSupabase, cadastroSupabase, isLoading, error } = useGame();
    
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nick, setNick] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLogin) {
            await loginSupabase(email, password);
        } else {
            if (!nick) return alert("Por favor, escolha um apelido!");
            await cadastroSupabase(email, password, nick);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">
            <div className="bg-slate-800 p-8 md:p-10 rounded-3xl w-full max-w-md shadow-2xl border border-slate-700/50 backdrop-blur-sm">
                
                {/* Cabeçalho */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2 drop-shadow-lg">
                        Entre<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Amigos</span>
                    </h1>
                    <p className="text-slate-400 text-sm font-medium">
                        {isLogin ? 'Bem-vindo de volta! 👋' : 'Crie sua conta e comece a jogar 🚀'}
                    </p>
                </div>

                {/* Erro */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl mb-6 text-sm text-center font-medium animate-in fade-in slide-in-from-top-2">
                        ⚠️ {error}
                    </div>
                )}

                {/* Formulário */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    {!isLogin && (
                        <div className="space-y-1">
                            <label className="text-slate-400 text-xs font-bold ml-1 uppercase tracking-wider">Apelido</label>
                            <input 
                                type="text"
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                                placeholder="Como quer ser chamado?"
                                value={nick}
                                onChange={e => setNick(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-slate-400 text-xs font-bold ml-1 uppercase tracking-wider">Email</label>
                        <input 
                            type="email"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-400 text-xs font-bold ml-1 uppercase tracking-wider">Senha</label>
                        <input 
                            type="password"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center mt-2"
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            isLogin ? 'ENTRAR' : 'CADASTRAR'
                        )}
                    </button>
                </form>

                {/* Rodapé Alternar */}
                <div className="mt-8 text-center pt-6 border-t border-slate-700/50">
                    <p className="text-slate-500 text-sm mb-2">
                        {isLogin ? 'Ainda não tem uma conta?' : 'Já possui cadastro?'}
                    </p>
                    <button 
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-blue-400 hover:text-blue-300 text-sm font-bold hover:underline transition"
                    >
                        {isLogin ? 'Criar nova conta' : 'Fazer login'}
                    </button>
                </div>
            </div>
        </div>
    );
}