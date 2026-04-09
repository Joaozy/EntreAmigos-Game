// server/config/redis.js
require('dotenv').config();
const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// 1. CONFIGURAÇÃO CIRÚRGICA: Suporte para Redis externo (Render/Upstash) com TLS
const clientOptions = { url: redisUrl };
if (redisUrl.startsWith('rediss://')) {
    clientOptions.socket = {
        tls: true,
        rejectUnauthorized: false
    };
}

const client = createClient(clientOptions);
const pubClient = client.duplicate();
const subClient = client.duplicate();

// Listeners de erro
client.on('error', err => console.error('[Redis Client] Error:', err.message));
pubClient.on('error', err => console.error('[Redis Pub] Error:', err.message));
subClient.on('error', err => console.error('[Redis Sub] Error:', err.message));

// Função única para conectar tudo
async function connectRedis() {
    try {
        await Promise.all([
            client.connect(),
            pubClient.connect(),
            subClient.connect()
        ]);
        console.log(`✅ [Redis] Conectado a ${redisUrl}`);
    } catch (error) {
        console.error(`❌ [Redis] Falha ao conectar:`, error.message);
    }
}

module.exports = {
    connectRedis,
    client,      
    pubClient,   
    subClient    
};