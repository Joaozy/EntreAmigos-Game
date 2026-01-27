import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { MessageCircle, X, Send } from 'lucide-react';

export default function Chat({ roomId, nickname }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const handleNewMessage = (data) => {
        setMessages((prev) => [...prev, data]);
    };

    socket.on('receive_message', handleNewMessage);

    return () => {
      socket.off('receive_message', handleNewMessage);
    };
  }, []);

  // Auto-scroll
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
        text: currentMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      socket.emit('send_message', messageData);
      setMessages(prev => [...prev, messageData]); // Otimismo (adiciona localmente logo)
      setCurrentMessage("");
    }
  };

  if (!roomId) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
      
      {/* JANELA DO CHAT (pointer-events-auto para permitir clique) */}
      {isOpen && (
        <div className="bg-slate-800/95 backdrop-blur border border-slate-700 w-72 sm:w-80 h-96 rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5 pointer-events-auto">
          {/* Header */}
          <div className="bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <MessageCircle size={16} className="text-indigo-500"/> Chat
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition">
                <X size={18} />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-800/50 scrollbar-thin scrollbar-thumb-slate-600">
             {messages.length === 0 && (
                 <p className="text-center text-slate-500 text-[10px] mt-4 opacity-50">Nenhuma mensagem ainda.</p>
             )}
             
             {messages.map((msg, index) => {
                 const isMe = msg.nickname === nickname;
                 return (
                    <div key={index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[9px] text-slate-400 font-bold mb-0.5 px-1">
                            {isMe ? 'Você' : msg.nickname}
                        </span>
                        <div className={`
                            px-3 py-2 rounded-xl text-sm max-w-[85%] break-words shadow-sm
                            ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'}
                        `}>
                            {msg.text} 
                        </div>
                    </div>
                 );
             })}
             <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-2 bg-slate-900 border-t border-slate-700 flex gap-2">
             <input 
                className="flex-1 bg-slate-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                placeholder="Mensagem..."
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
             />
             <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-500 transition disabled:opacity-50" disabled={!currentMessage.trim()}>
                 <Send size={16} />
             </button>
          </form>
        </div>
      )}

      {/* BOTÃO FLUTUANTE (pointer-events-auto) */}
      {!isOpen && (
        <button 
            onClick={() => setIsOpen(true)}
            className="pointer-events-auto bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full shadow-lg shadow-indigo-500/20 transition-transform hover:scale-110 active:scale-95 flex items-center justify-center relative"
        >
            <MessageCircle size={24} />
            {/* Badge de notificação (simples por enquanto) */}
            {messages.length > 0 && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border border-slate-900"></div>}
        </button>
      )}
    </div>
  );
}