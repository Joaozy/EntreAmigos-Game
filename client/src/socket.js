// client/src/socket.js
import { io } from 'socket.io-client';

// Se estiver em produção (site online), usa a raiz '/' (o Nginx cuida do resto)
// Se estiver no seu PC desenvolvendo, usa localhost:3001
const URL = import.meta.env.PROD ? undefined : 'http://localhost:3001';

export const socket = io(URL, {
    transports: ['websocket', 'polling'], // Força métodos compatíveis
    autoConnect: true,
    reconnection: true,
});