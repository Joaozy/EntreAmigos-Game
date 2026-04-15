import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { ArrowLeft, Save, User, Lock, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function Profile({ onClose }) {
    const { user, nickname, avatarUrl, atualizarPerfil, isLoading } = useGame();
    
    const [nick, setNick] = useState(nickname);
    const [password, setPassword] = useState('');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(avatarUrl);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const handleFileChange = (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const selectedFile = e.target.files[0];
        setFile(selectedFile);
        setPreview(URL.createObjectURL(selectedFile));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMsg({ text: '', type: '' });
        try {
            await atualizarPerfil(nick, password, file);
            setMsg({ text: 'Perfil atualizado com sucesso!', type: 'success' });
            setPassword(''); // Limpa a senha após salvar
        } catch (error) {
            setMsg({ text: error.message || 'Erro ao atualizar perfil.', type: 'error' });
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-white p-6 flex flex-col items-center">
            <div className="w-full max-w-md flex items-center justify-between mb-8">
                <button onClick={onClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-2xl font-black tracking-wider">MEU PERFIL</h1>
                <div className="w-10"></div> {/* Espaçador */}
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-md bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-xl space-y-6">
                
                {msg.text && (
                    <div className={`p-3 rounded-lg text-sm font-bold text-center ${msg.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {msg.text}
                    </div>
                )}

                <div className="flex flex-col items-center gap-4">
                    <div className="w-28 h-28 rounded-full bg-slate-700 border-4 border-indigo-500 overflow-hidden flex items-center justify-center relative group">
                        {preview ? (
                            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <User size={48} className="text-slate-400" />
                        )}
                        <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
                            <ImageIcon size={24} className="text-white" />
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </label>
                    </div>
                    <p className="text-xs text-slate-400 font-bold">Clique na imagem para alterar</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Apelido</label>
                        <div className="flex items-center bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 mt-1">
                            <User size={18} className="text-slate-500 mr-2" />
                            <input value={nick} onChange={e => setNick(e.target.value)} className="bg-transparent w-full outline-none font-bold" required />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Nova Senha (Opcional)</label>
                        <div className="flex items-center bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 mt-1">
                            <Lock size={18} className="text-slate-500 mr-2" />
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Deixe em branco para não alterar" className="bg-transparent w-full outline-none" />
                        </div>
                    </div>
                </div>

                <button disabled={isLoading} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl font-bold transition flex justify-center items-center gap-2 mt-4 disabled:opacity-50">
                    {isLoading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> SALVAR ALTERAÇÕES</>}
                </button>
            </form>
        </div>
    );
}