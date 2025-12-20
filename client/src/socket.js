import { io } from 'socket.io-client';

// URL de Produção (Use a que você copiou do Render)
// Dica: Use ternário para funcionar no seu PC e na Vercel automaticamente
const URL = import.meta.env.MODE === 'production' 
  ? 'https://entreamigos-game.onrender.com' // <--- COLE SUA URL DO RENDER AQUI (sem a barra final /)
  : 'http://localhost:3001';

export const socket = io(URL, {
  autoConnect: false
});