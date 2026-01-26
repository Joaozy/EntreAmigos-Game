const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs'); // Requer: npm install bcryptjs

const DB_PATH = path.join(__dirname, 'data', 'database.json');

// Garante que a pasta existe
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// Inicializa DB
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], history: [] }, null, 2));
}

const readDB = () => {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        return { users: [], history: [] };
    }
};

const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

module.exports = {
    // --- AUTENTICAÇÃO ---
    registerUser: (name, email, password) => {
        const db = readDB();
        
        // Verifica duplicidade
        if (db.users.find(u => u.email === email)) {
            return { error: "Este email já está cadastrado." };
        }

        // Criptografa a senha (Profissionalismo: Segurança)
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        const newUser = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name,
            email,
            password: hashedPassword, // Salva o hash, nunca a senha real
            createdAt: new Date().toISOString(),
            stats: { wins: 0, gamesPlayed: 0 }
        };

        db.users.push(newUser);
        writeDB(db);
        
        // Retorna usuário sem a senha para o front
        const { password: _, ...safeUser } = newUser;
        return { success: true, user: safeUser };
    },

    loginUser: (email, password) => {
        const db = readDB();
        const user = db.users.find(u => u.email === email);

        if (!user) return { error: "Usuário não encontrado." };

        // Compara senha enviada com o hash salvo
        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) return { error: "Senha incorreta." };

        const { password: _, ...safeUser } = user;
        return { success: true, user: safeUser };
    },

    getUser: (userId) => {
        const db = readDB();
        const user = db.users.find(u => u.id === userId);
        if(user) {
            const { password: _, ...safeUser } = user;
            return safeUser;
        }
        return null;
    },

    // --- GAMEPLAY ---
    saveMatch: (gameType, winnerId, players) => {
        const db = readDB();
        
        // Registra Partida
        db.history.push({
            id: Date.now(),
            game: gameType,
            date: new Date().toISOString(),
            winnerId,
            players: players.map(p => ({ id: p.userId, name: p.nickname }))
        });

        // Atualiza Estatísticas
        players.forEach(p => {
            const userIdx = db.users.findIndex(u => u.id === p.userId);
            if (userIdx !== -1) {
                if (!db.users[userIdx].stats) db.users[userIdx].stats = { wins: 0, gamesPlayed: 0 };
                
                db.users[userIdx].stats.gamesPlayed++;
                if (p.userId === winnerId) {
                    db.users[userIdx].stats.wins++;
                }
            }
        });

        writeDB(db);
    }
};