import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { socket } from './socket';

export default function Chat({ roomId, nickname }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    return () => socket.off('receive_message');
  }, [isOpen]);

  // Auto-scroll para o fim quando chega mensagem
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0); // Zera contador ao abrir
    }
  }, [messages, isOpen]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      socket.emit('send_message', { roomId, message: newMessage, nickname });
      setNewMessage('');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      
      {/* JANELA DO CHAT */}
      {isOpen && (
        <div className="bg-white w-80 h-96 rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-5 fade-in duration-300">
          {/* Topo */}
          <div className="bg-indigo-600 p-3 flex justify-between items-center text-white">
            <h3 className="font-bold text-sm">Chat da Sala</h3>
            <button onClick={() => setIsOpen(false)} className="hover:bg-indigo-700 p-1 rounded">
              <X size={18} />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <p className="text-center text-slate-400 text-xs mt-10">Nenhuma mensagem ainda.<br/>Quebre o gelo!</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.nickname === nickname;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-2 rounded-lg text-sm ${isMe ? 'bg-indigo-500 text-white rounded-tr-none' : 'bg-slate-200 text-slate-800 rounded-tl-none'}`}>
                    {!isMe && <span className="block text-[10px] font-bold opacity-70 mb-1">{msg.nickname}</span>}
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 mx-1">{msg.timestamp}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-2 bg-white border-t flex gap-2">
            <input
              className="flex-1 bg-slate-100 rounded-full px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Digite aqui..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* BOTÃO FLUTUANTE (FAB) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-xl transition transform hover:scale-110 relative"
        >
          <MessageCircle size={28} />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-slate-900 animate-bounce">
              {unreadCount}
            </div>
          )}
        </button>
      )}
    </div>
  );
}