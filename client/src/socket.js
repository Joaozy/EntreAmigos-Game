import { io } from 'socket.io-client';

// Detecta automaticamente se está em dev ou prod
const URL = import.meta.env.PROD 
  ? 'https://entreamigos-game.onrender.com' // Sua URL de prod
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000
});