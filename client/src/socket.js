import { io } from 'socket.io-client';

const isProd = import.meta.env.PROD; // Vite define isso automaticamente

// URL Dinâmica:
// - Em Produção: undefined (conecta na mesma origem, ex: https://site.com)
// - Em Dev: http://localhost:3001
const URL = isProd ? undefined : 'http://localhost:3001';

console.log(`🔌 Conectando ao Socket.io em: ${URL || 'Mesma Origem'}`);

export const socket = io(URL, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'], // Tenta WebSocket primeiro para performance
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});