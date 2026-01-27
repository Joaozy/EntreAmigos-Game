import { io } from 'socket.io-client';

// Forçamos o endereço seguro do seu site
const URL = 'https://entreamigos.app.br';

export const socket = io(URL, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'], // Tenta HTTP primeiro, depois WS
    autoConnect: true,
    reconnection: true,
});