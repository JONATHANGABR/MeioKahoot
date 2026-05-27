const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const USERS_FILE = path.join(__dirname, '../Data/Config/users.json');
const QUESTIONS_FILE = path.join(__dirname, '../Data/Questoes/master.json');
const rooms = new Map();

if (!fs.existsSync(path.dirname(USERS_FILE))) fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

app.use('/Scripts', express.static(path.join(__dirname, '../Scripts')));
app.use('/Data', express.static(path.join(__dirname, '../Data')));
app.use('/Assets', express.static(path.join(__dirname, '../Assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Scripts/Paginas/index.html')));

io.on('connection', (socket) => {
    console.log('connect:', socket.id);

    socket.on('register', (d) => {
        const users = getUsers();
        if (users.find(u => u.user === d.user)) return socket.emit('authErr', 'Nome indisponível');
        users.push({ ...d, xp: 0 });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        socket.emit('authOk', d);
    });

    socket.on('login', (d) => {
        const u = getUsers().find(u => u.user === d.user && u.pass === d.pass);
        if (u) socket.emit('authOk', u);
        else socket.emit('authErr', 'Login inválido');
    });

    socket.on('createRoom', (d) => {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const allQ = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
        const questions = [...(allQ[d.theme] || allQ['ciencias'])].sort(() => Math.random() - 0.5);

        const room = {
            host: socket.id,
            players: new Map(),
            questions,
            curIdx: 0,
            status: 'lobby',
            answered: new Set(),
            timer: null
        };

        // HOST É JOGADOR
        room.players.set(socket.id, { name: d.playerName, photo: d.playerPhoto || '', score: 0, isBot: false });

        rooms.set(pin, room);
        socket.join(pin);
        socket.emit('roomCreated', pin);
        io.to(pin).emit('pList', Array.from(room.players.values()));
        console.log('Room created:', pin, 'Player:', d.playerName, 'socket:', socket.id);
    });

    socket.on('joinRoom', (d) => {
        const r = rooms.get(d.pin);
        if (r && r.status === 'lobby') {
            r.players.set(socket.id, { name: d.name, photo: d.photo || '', score: 0, isBot: false });
            socket.join(d.pin);
            socket.emit('joined', d);
            io.to(d.pin).emit('pList', Array.from(r.players.values()));
        } else {
            socket.emit('err', 'Sala não encontrada. verifique se tem algum erro de digitação');
        }
    });

    socket.on('addBots', (pin) => {
        const r = rooms.get(pin);
        if (!r) return;
        ['BOT_j9se 🤖', 'BOT_ky/OO 🤖', 'BOT_Vida 🤖'].forEach((name, i) => {
            r.players.set('bot-' + i, { name, photo: '', score: 0, isBot: true });
        });
        io.to(pin).emit('pList', Array.from(r.players.values()));
    });

    socket.on('startGame', (pin) => {
        const r = rooms.get(pin);
        if (r) { r.status = 'playing'; nextQ(pin); }
    });

    function nextQ(pin) {
        const r = rooms.get(pin);
        if (!r) return;
        if (r.curIdx >= r.questions.length) {
            const rank = Array.from(r.players.values()).sort((a, b) => b.score - a.score);
            io.to(pin).emit('gameOver', rank);
            rooms.delete(pin);
            return;
        }
        r.answered.clear();
        const q = r.questions[r.curIdx];
        io.to(pin).emit('q', { ...q, n: r.curIdx + 1, total: r.questions.length });
        clearTimeout(r.timer);
        r.timer = setTimeout(() => doReveal(pin), (q.time + 1) * 1000);
    }

    function doReveal(pin) {
        const r = rooms.get(pin);
        if (!r) return;
        // Dar pontos pros bots
        r.players.forEach((p, id) => {
            if (p.isBot && !r.answered.has(id)) {
                if (Math.random() > 0.4) p.score += Math.floor(Math.random() * 400 + 200);
            }
        });
        io.to(pin).emit('reveal', { correct: r.questions[r.curIdx].answer });
        r.curIdx++;
        setTimeout(() => nextQ(pin), 4000);
    }

    // ==================== RESPOSTA ====================
    socket.on('answer', (data) => {
        console.log('answer received:', JSON.stringify(data), 'socket:', socket.id);

        const r = rooms.get(data.pin);
        if (!r) { console.log('ERROR: room not found'); socket.emit('err', 'Sala não existe'); return; }
        if (r.status !== 'playing') { console.log('ERROR: not playing'); return; }
        if (r.answered.has(socket.id)) { console.log('ERROR: already answered'); return; }

        const player = r.players.get(socket.id);
        if (!player) {
            console.log('ERROR: player not found. Players in room:', [...r.players.keys()]);
            socket.emit('err', 'Jogador não encontrado');
            return;
        }

        r.answered.add(socket.id);
        const q = r.questions[r.curIdx];
        const isCorrect = q.answer === data.idx;
        let earned = 0;

        if (isCorrect) {
            let base = q.difficulty === 'facil' ? 400 : (q.difficulty === 'medio' ? 700 : 1000);
            let timeBonus = Math.floor((data.time / q.time) * 300);
            let comboMult = 1 + (data.combo * 0.15);
            earned = Math.floor((base + timeBonus) * comboMult);
            player.score += earned;
        }

        console.log(player.name, isCorrect ? 'CORRECT' : 'WRONG', '+', earned, 'Total:', player.score);

        socket.emit('result', {
            correct: isCorrect,
            earned: earned,
            totalScore: player.score,
            correctIdx: q.answer
        });

        // Bots respondem
        r.players.forEach((p, id) => {
            if (p.isBot && !r.answered.has(id)) {
                r.answered.add(id);
                if (Math.random() > 0.3) p.score += Math.floor(Math.random() * 500 + 200);
            }
        });

        if (r.answered.size >= r.players.size) {
            clearTimeout(r.timer);
            doReveal(data.pin);
        }
    });
});

function start(p) {
    server.listen(p, '192.168.1.10').on('error', () => start(p + 1)).on('listening', () => console.log('MeioKahoot: http://localhost:' + server.address().port));
}
start(3001);
