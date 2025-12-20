import { io } from 'socket.io-client';

// URL de Produção (Use a que você copiou do Render)
// Dica: Use ternário para funcionar no seu PC e na Vercel automaticamente
const URL = import.meta.env.MODE === 'production' 
  ? 'https://entreamigos-game.onrender.com' // <--- COLE SUA URL DO RENDER AQUI (sem a barra final /)
  : 'http://192.168.1.61:3001';

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,             // Tenta reconectar sozinho
  reconnectionAttempts: 10,       // Tenta 10 vezes antes de desistir
  reconnectionDelay: 1000,        // Espera 1s entre tentativas
  timeout: 20000                  // Aumenta o tempo antes de considerar "caiu"
});
