import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useGame } from '../context/GameContext';

export default function Login() {
  const { isConnected } = useGame();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
        if (isRegister) {
            // 1. Criar Conta Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
            });

            if (authError) throw authError;

            // 2. Criar Perfil Público
            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{ id: authData.user.id, nickname: formData.name }]);
                
                if (profileError) throw profileError;
                alert("Cadastro realizado! Você já pode entrar.");
                setIsRegister(false); // Volta para tela de login
            }

        } else {
            // Login
            const { error } = await supabase.auth.signInWithPassword({
                email: formData.email,
                password: formData.password,
            });
            if (error) throw error;
            // O GameContext vai detectar a mudança de sessão automaticamente
        }
    } catch (err) {
        setError(err.message || "Erro na autenticação.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
        <h1 className="text-4xl font-black text-indigo-600 mb-2 text-center">EntreAmigos</h1>
        <p className="text-slate-500 font-medium text-center mb-6">Acesse sua conta para jogar</p>

        {/* Toggle Login/Register */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button onClick={() => setIsRegister(false)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${!isRegister ? 'bg-white text-indigo-600 shadow' : 'text-slate-400'}`}>LOGIN</button>
            <button onClick={() => setIsRegister(true)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${isRegister ? 'bg-white text-indigo-600 shadow' : 'text-slate-400'}`}>CADASTRO</button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
            {isRegister && (
                <div>
                    <label className="text-xs font-bold text-slate-500 ml-1">APELIDO</label>
                    <input name="name" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500" placeholder="Ex: Mestre dos Jogos" onChange={handleChange} />
                </div>
            )}
            <div>
                <label className="text-xs font-bold text-slate-500 ml-1">E-MAIL</label>
                <input name="email" type="email" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500" placeholder="seu@email.com" onChange={handleChange} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 ml-1">SENHA</label>
                <input name="password" type="password" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500" placeholder="******" onChange={handleChange} />
            </div>

            {error && <div className="bg-red-100 text-red-600 text-sm font-bold p-3 rounded-lg text-center">{error}</div>}

            <button type="submit" disabled={loading || !isConnected} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition disabled:opacity-50 mt-4">
                {loading ? "PROCESSANDO..." : (isRegister ? "CRIAR CONTA" : "ENTRAR")}
            </button>
        </form>
        {!isConnected && <p className="text-center text-red-500 text-xs mt-4 font-bold animate-pulse">Servidor Offline</p>}
      </div>
    </div>
  );
}