import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function Login() {
  const { handleLogin, handleRegister, isConnected } = useGame();
  
  const [isRegister, setIsRegister] = useState(false); // Toggle entre Login/Cadastro
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.email || !formData.password) {
        setError("Preencha todos os campos."); return;
    }
    if (isRegister && !formData.name) {
        setError("Nome é obrigatório."); return;
    }

    if (isRegister) {
        handleRegister(formData.name, formData.email, formData.password);
    } else {
        handleLogin(formData.email, formData.password);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Cabeçalho */}
        <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-indigo-600 mb-2 tracking-tighter">EntreAmigos</h1>
            <p className="text-slate-500 font-medium">A sua plataforma de diversão</p>
        </div>

        {/* Abas */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button 
                onClick={() => { setIsRegister(false); setError(''); }}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${!isRegister ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
                ENTRAR
            </button>
            <button 
                onClick={() => { setIsRegister(true); setError(''); }}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${isRegister ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
                CRIAR CONTA
            </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
            
            {isRegister && (
                <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Seu Nome / Apelido</label>
                    <input 
                        name="name"
                        type="text"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500 text-slate-800 transition"
                        placeholder="Ex: Joãozinho"
                        value={formData.name}
                        onChange={handleChange}
                    />
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">E-mail</label>
                <input 
                    name="email"
                    type="email"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500 text-slate-800 transition"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={handleChange}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Senha</label>
                <input 
                    name="password"
                    type="password"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-indigo-500 text-slate-800 transition"
                    placeholder="******"
                    value={formData.password}
                    onChange={handleChange}
                />
            </div>

            {error && (
                <div className="bg-red-100 text-red-600 text-sm font-bold p-3 rounded-lg text-center animate-pulse">
                    {error}
                </div>
            )}

            <button 
                type="submit"
                disabled={!isConnected}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
                {isConnected ? (isRegister ? "CADASTRAR E ENTRAR" : "ENTRAR") : "CONECTANDO..."}
            </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
            Ao entrar, você concorda em se divertir muito.
        </p>
      </div>
    </div>
  );
}