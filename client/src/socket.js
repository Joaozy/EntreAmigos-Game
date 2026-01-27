import { io } from 'socket.io-client';

// Lógica Inteligente:
// Se estiver rodando o comando de 'build' (Produção), usa o seu site.
// Se estiver rodando 'npm run dev' (Local), usa o localhost:3001.
const URL = import.meta.env.PROD 
    ? 'https://entreamigos.app.br' 
    : 'http://localhost:3001';

export const socket = io(URL, {
    path: '/socket.io/', // Importante manter isso
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
});