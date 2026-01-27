import { io } from 'socket.io-client';

// Força o endereço HTTPS correto (Versão Blindada)
const URL = 'https://entreamigos.app.br';

export const socket = io(URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
});