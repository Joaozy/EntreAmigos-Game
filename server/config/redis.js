// server/config/redis.js
require('dotenv').config();
const { createClient } = require("redis");

// Cria os clientes (Pub e Sub são necessários para o Socket.io, mas para dados usaremos o 'client' principal)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({ url: redisUrl });
const pubClient = client.duplicate();
const subClient = client.duplicate();

// Listeners de erro
client.on('error', err => console.error('[Redis Client] Error:', err));
pubClient.on('error', err => console.error('[Redis Pub] Error:', err));
subClient.on('error', err => console.error('[Redis Sub] Error:', err));

// Função única para conectar tudo
async function connectRedis() {
    await Promise.all([
        client.connect(),
        pubClient.connect(),
        subClient.connect()
    ]);
    console.log(`✅ [Redis] Conectado a ${redisUrl}`);
}

module.exports = {
    connectRedis,
    client,      // Usaremos para GET/SET de dados
    pubClient,   // Usaremos para o Adapter do Socket
    subClient    // Usaremos para o Adapter do Socket
};