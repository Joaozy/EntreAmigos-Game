import { io } from 'socket.io-client';

const isProd = import.meta.env.PROD;
const protocol = window.location.protocol;
const hostname = window.location.hostname; 
const port = 3001;

// Se for produção, usa o domínio fixo.
// Se for dev (localhost ou IP de rede), monta a URL dinâmica.
const URL = isProd 
    ? 'https://entreamigos.app.br' 
    : `${protocol}//${hostname}:${port}`;

console.log(`🔌 Conectando ao Socket em: ${URL}`);

export const socket = io(URL, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'], // Tenta WebSocket primeiro
    autoConnect: true,
    reconnection: true,
});