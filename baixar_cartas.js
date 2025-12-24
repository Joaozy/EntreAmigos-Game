// Arquivo: baixar_cartas.js
const fs = require('fs');
const https = require('https');
const path = require('path');

// Configurações
const TOTAL_CARDS = 100; // Quantidade de cartas para baixar
const OUTPUT_DIR = path.join(__dirname, 'client', 'public', 'dixit_cards');

// Garante que a pasta existe
if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`🚀 Iniciando download de ${TOTAL_CARDS} cartas para: ${OUTPUT_DIR}`);
console.log('Isso pode levar alguns minutos. Aguarde...');

const downloadImage = (id) => {
    return new Promise((resolve, reject) => {
        // Prompt surrealista otimizado
        const prompt = `surreal dreamscape art abstract painting mystical strange card_${id}`;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=300&height=450&nologo=true&seed=${id}`;
        const filePath = path.join(OUTPUT_DIR, `card_${id}.jpg`);

        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ Carta ${id} baixada.`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {}); // Deleta arquivo corrompido
            console.error(`❌ Erro na carta ${id}: ${err.message}`);
            reject(err);
        });
    });
};

// Baixa em sequência para não travar a API ou sua rede
const startDownload = async () => {
    for (let i = 1; i <= TOTAL_CARDS; i++) {
        try {
            await downloadImage(i);
        } catch (error) {
            console.log(`Tentando novamente carta ${i}...`);
            await downloadImage(i); // Uma tentativa extra
        }
    }
    console.log('🎉 TODAS AS CARTAS FORAM BAIXADAS COM SUCESSO!');
};

startDownload();