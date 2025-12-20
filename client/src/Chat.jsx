import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { MessageCircle, X, Send } from 'lucide-react';

export default function Chat({ roomId, nickname }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [messages, setMessages] = useState([]);
  
  // Referência para rolar o chat para baixo automaticamente
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Escuta novas mensagens
    const handleNewMessage = (data) => {
        setMessages((prev) => [...prev, data]);
        // Se o chat estiver fechado e chegar mensagem, pode adicionar um alerta visual aqui (opcional)
    };

    socket.on('receive_message', handleNewMessage);

    // Limpa ouvintes ao desmontar
    return () => {
      socket.off('receive_message', handleNewMessage);
    };
  }, []);

  // Rola para baixo sempre que chega mensagem nova e o chat está aberto
  useEffect(() => {
      if(isOpen) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
  }, [messages, isOpen]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (currentMessage.trim() !== "") {
      const messageData = {
        roomId,
        nickname,
        text: currentMessage, // Padronizamos como 'text'
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      socket.emit('send_message', messageData);
      setCurrentMessage("");
    }
  };

  // Se não estiver em uma sala, não mostra o chat
  if (!roomId) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      
      {/* JANELA DO CHAT */}
      {isOpen && (
        <div className="bg-slate-800 border border-slate-700 w-80 h-96 rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
                <MessageCircle size={18} className="text-indigo-500"/> Chat da Sala
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-800/50">
             {messages.length === 0 && (
                 <p className="text-center text-slate-500 text-xs mt-4">Nenhuma mensagem ainda.</p>
             )}
             
             {messages.map((msg, index) => {
                 const isMe = msg.nickname === nickname;
                 return (
                    <div key={index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-slate-400 font-bold mb-0.5 px-1">
                            {isMe ? 'Você' : msg.nickname}
                        </span>
                        <div className={`
                            px-3 py-2 rounded-xl text-sm max-w-[85%] break-words
                            ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'}
                        `}>
                            {/* AQUI ESTAVA O ERRO PROVÁVEL: Usando msg.text */}
                            {msg.text} 
                        </div>
                        <span className="text-[9px] text-slate-500 mt-0.5 px-1">{msg.time}</span>
                    </div>
                 );
             })}
             <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-2 bg-slate-900 border-t border-slate-700 flex gap-2">
             <input 
                className="flex-1 bg-slate-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Digite algo..."
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
             />
             <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-500 transition">
                 <Send size={16} />
             </button>
          </form>
        </div>
      )}

      {/* BOTÃO FLUTUANTE (ABRIR) */}
      {!isOpen && (
        <button 
            onClick={() => setIsOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
        >
            <MessageCircle size={24} />
            {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-900">
                    {messages.length}
                </span>
            )}
        </button>
      )}
    </div>
  );
}