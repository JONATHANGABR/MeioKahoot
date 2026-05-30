const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7,
    pingInterval: 10000,
    pingTimeout: 20000,
    connectionStateRecovery: {
        maxDisconnectionDuration: 60 * 1000,
        skipMiddlewares: true
    }
});

const USERS_FILE = path.join(__dirname, '../Data/Config/users.json');
const QUESTIONS_FILE = path.join(__dirname, '../Data/Questoes/master.json');
const LEADERBOARD_FILE = path.join(__dirname, '../Data/Config/ranking.json');
const rooms = new Map();
const connectedSockets = new Set();
const serverStartedAt = Date.now();
const serverEvents = [];
let totalRoomsCreated = 0;
let totalMatchesStarted = 0;
let totalMatchesFinished = 0;

const ROOM_PHASE = {
    LOBBY: 'lobby',
    STARTING: 'starting',
    QUESTION: 'question',
    REVEAL: 'reveal',
    RANKING: 'ranking'
};

const RECONNECT_GRACE_MS = 60 * 1000;
const REVEAL_MS = 4000;
const RANKING_CLEANUP_MS = 30 * 1000;

if (!fs.existsSync(path.dirname(USERS_FILE))) fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(LEADERBOARD_FILE)) fs.writeFileSync(LEADERBOARD_FILE, '[]');

const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const getQuestions = () => JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
const getLeaderboard = () => JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
const saveLeaderboard = (data) => fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const publicPlayers = (room) => Array.from(room.players.values()).map(p => ({
    name: p.name,
    photo: p.photo || '',
    score: p.score || 0,
    isBot: !!p.isBot,
    connected: p.connected !== false,
    device: p.device || null
}));

function formatUptime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getServerStats() {
    let playersInRooms = 0;
    let activeMatches = 0;
    let lobbyRooms = 0;

    rooms.forEach((room) => {
        playersInRooms += room.players.size;
        if (room.status === ROOM_PHASE.QUESTION || room.status === ROOM_PHASE.REVEAL || room.status === ROOM_PHASE.STARTING) activeMatches++;
        if (room.status === ROOM_PHASE.LOBBY) lobbyRooms++;
    });

    return {
        online: true,
        uptime: formatUptime(Date.now() - serverStartedAt),
        uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
        connectedSockets: connectedSockets.size,
        playersInRooms,
        activeRooms: rooms.size,
        lobbyRooms,
        activeMatches,
        totalRoomsCreated,
        totalMatchesStarted,
        totalMatchesFinished,
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    };
}

function pushServerEvent(type, message) {
    const event = {
        time: new Date().toLocaleTimeString('pt-BR'),
        type,
        message
    };
    serverEvents.push(event);
    if (serverEvents.length > 10) serverEvents.shift();
}

function color(text, code) {
    return `\x1b[${code}m${text}\x1b[0m`;
}

function drawServerPanel() {
    if (!process.stdout.isTTY) return;
    const st = getServerStats();
    const line = '─'.repeat(62);
    const status = st.online ? color('ONLINE', '32;1') : color('OFFLINE', '31;1');

    console.clear();
    console.log(color('╭' + line + '╮', '35'));
    console.log(color('│', '35') + color('  MEIOKAHOOT SERVER PANEL', '36;1') + ' '.repeat(36) + color('│', '35'));
    console.log(color('├' + line + '┤', '35'));
    console.log(color('│', '35') + ` Status: ${status}     Uptime: ${color(st.uptime, '33;1')}     Memória: ${st.memoryMB}MB`.padEnd(71) + color('│', '35'));
    console.log(color('│', '35') + ` Conectados: ${color(String(st.connectedSockets), '32;1')}   Jogadores em salas: ${color(String(st.playersInRooms), '32;1')}   Salas ativas: ${color(String(st.activeRooms), '34;1')}`.padEnd(80) + color('│', '35'));
    console.log(color('│', '35') + ` Lobbies: ${st.lobbyRooms}   Partidas ativas: ${st.activeMatches}   Salas criadas: ${st.totalRoomsCreated}`.padEnd(71) + color('│', '35'));
    console.log(color('│', '35') + ` Partidas iniciadas: ${st.totalMatchesStarted}   Finalizadas: ${st.totalMatchesFinished}`.padEnd(71) + color('│', '35'));
    console.log(color('├' + line + '┤', '35'));
    console.log(color('│', '35') + color(' Eventos recentes:', '33;1') + ' '.repeat(44) + color('│', '35'));

    const events = serverEvents.slice(-8);
    if (!events.length) {
        console.log(color('│', '35') + ' Aguardando eventos...'.padEnd(62) + color('│', '35'));
    } else {
        events.forEach(ev => {
            const icon = ev.type === 'connect' ? '🟢' : ev.type === 'disconnect' ? '🔴' : ev.type === 'room' ? '🏠' : ev.type === 'match' ? '🎮' : ev.type === 'error' ? '⚠️' : 'ℹ️';
            const msg = ` ${icon} [${ev.time}] ${ev.message}`;
            console.log(color('│', '35') + msg.slice(0, 62).padEnd(62) + color('│', '35'));
        });
    }

    console.log(color('╰' + line + '╯', '35'));
    console.log(color('Healthcheck:', '36;1') + ' http://localhost:' + (server.address()?.port || 3001) + '/status');
}

app.use('/Scripts', express.static(path.join(__dirname, '../Scripts')));
app.use('/Data', express.static(path.join(__dirname, '../Data')));
app.use('/Assets', express.static(path.join(__dirname, '../Assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Scripts/Paginas/index.html')));
app.get('/status', (req, res) => res.json(getServerStats()));

function makePin() {
    let pin;
    do {
        pin = String(Math.floor(100000 + Math.random() * 900000));
    } while (rooms.has(pin));
    return pin;
}

function clearRoomTimers(room) {
    if (!room) return;
    clearTimeout(room.questionTimer);
    clearTimeout(room.nextTimer);
    clearTimeout(room.cleanupTimer);
    room.questionTimer = null;
    room.nextTimer = null;
    room.cleanupTimer = null;
}

function resetRoomForNewMatch(room) {
    clearRoomTimers(room);
    room.curIdx = 0;
    room.status = ROOM_PHASE.LOBBY;
    room.answered = new Set();
    room.currentQuestionId = null;
    room.questionStartedAt = 0;
    room.deadlineAt = 0;
    room.players.forEach((p) => {
        p.score = 0;
        p.combo = 0;
        p.lastQuestionId = null;
    });
    const allQ = getQuestions();
    room.questions = shuffle(allQ[room.theme] || allQ.ciencias || []);
}

function createPlayer(data, isBot = false) {
    return {
        name: data.name || data.playerName || 'Jogador',
        photo: data.photo || data.playerPhoto || '',
        device: data.device || null,
        score: 0,
        combo: 0,
        isBot,
        connected: true,
        disconnectedAt: null,
        cleanupTimer: null,
        lastQuestionId: null
    };
}

function findRoomBySocket(socketId) {
    for (const [pin, room] of rooms) {
        if (room.players.has(socketId)) return { pin, room };
    }
    return null;
}

function findDisconnectedPlayerByName(room, name) {
    for (const [oldSocketId, player] of room.players) {
        if (!player.isBot && player.connected === false && player.name === name) {
            return { oldSocketId, player };
        }
    }
    return null;
}

function moveAnsweredId(room, oldId, newId) {
    if (room.answered.has(oldId)) {
        room.answered.delete(oldId);
        room.answered.add(newId);
    }
}

function reconnectPlayer(pin, room, oldSocketId, socket) {
    const player = room.players.get(oldSocketId);
    if (!player) return false;

    clearTimeout(player.cleanupTimer);
    player.cleanupTimer = null;
    player.connected = true;
    player.disconnectedAt = null;
    // Atualiza o tipo de dispositivo caso volte por outro aparelho.
    // O valor vem do joinRoom no cliente.


    room.players.delete(oldSocketId);
    room.players.set(socket.id, player);
    moveAnsweredId(room, oldSocketId, socket.id);

    if (room.host === oldSocketId) room.host = socket.id;

    socket.join(pin);
    socket.emit('joined', { pin });
    socket.emit('scoreSync', { totalScore: player.score, combo: player.combo });
    io.to(pin).emit('pList', publicPlayers(room));

    // Se o jogador voltou no meio da pergunta, manda a pergunta atual com o deadline do servidor.
    if (room.status === ROOM_PHASE.QUESTION && Date.now() < room.deadlineAt) {
        const q = room.questions[room.curIdx];
        socket.emit('q', {
            ...q,
            qid: room.currentQuestionId,
            n: room.curIdx + 1,
            total: room.questions.length,
            serverNow: Date.now(),
            deadlineAt: room.deadlineAt,
            alreadyAnswered: room.answered.has(socket.id)
        });
    }

    return true;
}

function removePlayerFromRoom(pin, socketId) {
    const room = rooms.get(pin);
    if (!room) return;

    const player = room.players.get(socketId);
    if (!player) return;

    clearTimeout(player.cleanupTimer);
    room.players.delete(socketId);
    room.answered.delete(socketId);

    if (room.host === socketId) {
        const nextHost = Array.from(room.players.entries()).find(([, p]) => !p.isBot && p.connected !== false);
        room.host = nextHost ? nextHost[0] : null;
        if (room.host) io.to(room.host).emit('hostChanged', { pin });
    }

    io.to(pin).emit('pList', publicPlayers(room));

    const humansLeft = Array.from(room.players.values()).some(p => !p.isBot);
    if (!humansLeft) {
        clearRoomTimers(room);
        rooms.delete(pin);
        pushServerEvent('room', `Sala ${pin} removida: sem jogadores humanos`);
        return;
    }

    checkAllAnswered(pin);
}

function markDisconnected(socket) {
    const found = findRoomBySocket(socket.id);
    if (!found) return;

    const { pin, room } = found;
    const player = room.players.get(socket.id);
    if (!player || player.isBot) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    io.to(pin).emit('pList', publicPlayers(room));

    player.cleanupTimer = setTimeout(() => {
        removePlayerFromRoom(pin, socket.id);
    }, RECONNECT_GRACE_MS);
}

function nextQ(pin) {
    const room = rooms.get(pin);
    if (!room) return;

    clearTimeout(room.questionTimer);
    clearTimeout(room.nextTimer);
    room.questionTimer = null;
    room.nextTimer = null;

    if (room.curIdx >= room.questions.length) {
        finishGame(pin);
        return;
    }

    room.status = ROOM_PHASE.QUESTION;
    room.answered.clear();

    const q = room.questions[room.curIdx];
    const questionTime = Number(q.time) || 15;
    room.currentQuestionId = `${room.curIdx}-${Date.now()}`;
    room.questionStartedAt = Date.now();
    room.deadlineAt = room.questionStartedAt + questionTime * 1000;

    io.to(pin).emit('q', {
        ...q,
        qid: room.currentQuestionId,
        n: room.curIdx + 1,
        total: room.questions.length,
        time: questionTime,
        serverNow: room.questionStartedAt,
        deadlineAt: room.deadlineAt
    });

    

    room.questionTimer = setTimeout(() => doReveal(pin), questionTime * 1000);
}

function doReveal(pin) {
    const room = rooms.get(pin);
    if (!room || room.status !== ROOM_PHASE.QUESTION) return;

    clearTimeout(room.questionTimer);
    room.questionTimer = null;
    room.status = ROOM_PHASE.REVEAL;

    const q = room.questions[room.curIdx];

    // Bots que ainda não responderam ganham/erram pelo servidor, dentro do fechamento da questão.
    room.players.forEach((p, id) => {
        if (p.isBot && !room.answered.has(id)) {
            room.answered.add(id);
            if (Math.random() > 0.4) {
                p.combo = (p.combo || 0) + 1;
                p.score += Math.floor(Math.random() * 400 + 200);
            } else {
                p.combo = 0;
            }
        }
    });

    io.to(pin).emit('reveal', {
        qid: room.currentQuestionId,
        correct: q.answer
    });

    room.curIdx++;
    room.nextTimer = setTimeout(() => nextQ(pin), REVEAL_MS);
}

function finishGame(pin) {
    const room = rooms.get(pin);
    if (!room) return;

    clearRoomTimers(room);
    totalMatchesFinished++;
    pushServerEvent('match', `Partida finalizada na sala ${pin}`);
    room.status = ROOM_PHASE.RANKING;

    const rank = publicPlayers(room).sort((a, b) => b.score - a.score);
    saveMatchToLeaderboard(room, rank);
    io.to(pin).emit('gameOver', rank);
    

    // A sala fica viva por alguns segundos para todo mundo receber/ver o ranking e depois limpa tudo.
    room.cleanupTimer = setTimeout(() => {
        clearRoomTimers(room);
        rooms.delete(pin);
        pushServerEvent('room', `Sala ${pin} limpa após ranking`);
    }, RANKING_CLEANUP_MS);
}

function activePlayersCount(room) {
    let count = 0;
    room.players.forEach((p) => {
        if (p.isBot || p.connected !== false) count++;
    });
    return count;
}

function saveMatchToLeaderboard(room, rank) {
    const now = new Date().toISOString();
    const current = getLeaderboard();

    rank.filter(p => !p.isBot).forEach((p, index) => {
        current.push({
            name: p.name,
            photo: p.photo || '',
            score: p.score || 0,
            position: index + 1,
            theme: room.theme || 'ciencias',
            date: now
        });
    });

    // Mantém histórico enxuto e ordenado pelos melhores resultados.
    current.sort((a, b) => (b.score || 0) - (a.score || 0));
    saveLeaderboard(current.slice(0, 100));
}

function buildLeaderboardPayload() {
    const data = getLeaderboard();
    const bestByPlayer = new Map();

    data.forEach(item => {
        const key = String(item.name || '').toLowerCase();
        if (!key) return;
        const old = bestByPlayer.get(key);
        if (!old || (item.score || 0) > (old.score || 0)) bestByPlayer.set(key, item);
    });

    const best = Array.from(bestByPlayer.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 20);

    return {
        best,
        recent: data.slice(-20).reverse(),
        stats: {
            records: data.length,
            players: bestByPlayer.size,
            bestScore: best[0]?.score || 0,
            bestPlayer: best[0]?.name || '---'
        }
    };
}

function checkAllAnswered(pin) {
    const room = rooms.get(pin);
    if (!room || room.status !== ROOM_PHASE.QUESTION) return;

    if (activePlayersCount(room) > 0 && room.answered.size >= activePlayersCount(room)) {
        doReveal(pin);
    }
}

io.on('connection', (socket) => {
    connectedSockets.add(socket.id);
    pushServerEvent('connect', `Socket conectado: ${socket.id.slice(0, 6)}`);

    socket.on('register', (d) => {
        const users = getUsers();
        if (users.find(u => u.user === d.user)) return socket.emit('authErr', 'Nome indisponível');
        users.push({ ...d, xp: 0 });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        socket.emit('authOk', { ...d, xp: 0 });
    });

    socket.on('login', (d) => {
        const u = getUsers().find(u => u.user === d.user && u.pass === d.pass);
        if (u) socket.emit('authOk', u);
        else socket.emit('authErr', 'Login inválido');
    });

    socket.on('createRoom', (d) => {
        if (!d || !d.playerName) return socket.emit('err', 'Jogador inválido');

        const pin = makePin();
        const allQ = getQuestions();
        const theme = d.theme || 'ciencias';
        const room = {
            pin,
            theme,
            host: socket.id,
            players: new Map(),
            questions: shuffle(allQ[theme] || allQ.ciencias || []),
            curIdx: 0,
            status: ROOM_PHASE.LOBBY,
            answered: new Set(),
            currentQuestionId: null,
            questionStartedAt: 0,
            deadlineAt: 0,
            questionTimer: null,
            nextTimer: null,
            cleanupTimer: null
        };

        room.players.set(socket.id, createPlayer({ playerName: d.playerName, playerPhoto: d.playerPhoto, device: d.device }));
        rooms.set(pin, room);
        totalRoomsCreated++;
        pushServerEvent('room', `Sala ${pin} criada por ${d.playerName} (${theme})`);

        socket.join(pin);
        socket.emit('roomCreated', pin);
        io.to(pin).emit('pList', publicPlayers(room));
        
    });

    socket.on('joinRoom', (d = {}) => {
        const room = rooms.get(d.pin);
        if (!room) return socket.emit('err', 'Sala não encontrada. verifique se tem algum erro de digitação');

        const reconnect = findDisconnectedPlayerByName(room, d.name);
        if (reconnect) {
            if (d.device) reconnect.player.device = d.device;
            reconnectPlayer(d.pin, room, reconnect.oldSocketId, socket);
            return;
        }

        if (room.status !== ROOM_PHASE.LOBBY) {
            return socket.emit('err', 'Essa partida já começou. Aguarde a próxima sala.');
        }

        if (Array.from(room.players.values()).some(p => !p.isBot && p.name === d.name)) {
            return socket.emit('err', 'Esse jogador já está na sala.');
        }

        room.players.set(socket.id, createPlayer({ name: d.name, photo: d.photo, device: d.device }));
        socket.join(d.pin);
        socket.emit('joined', d);
        io.to(d.pin).emit('pList', publicPlayers(room));
        pushServerEvent('room', `${d.name} entrou na sala ${d.pin}`);
    });

    socket.on('addBots', (pin) => {
        if (!pin) return;
        const room = rooms.get(pin);
        if (!room || room.status !== ROOM_PHASE.LOBBY) return;
        if (room.host !== socket.id) return socket.emit('err', 'Apenas o host pode adicionar bots.');

        ['BOT_j9se 🤖', 'BOT_ky/OO 🤖', 'BOT_Vida 🤖'].forEach((name, i) => {
            const id = 'bot-' + i;
            if (!room.players.has(id)) room.players.set(id, createPlayer({ name }, true));
        });
        io.to(pin).emit('pList', publicPlayers(room));
        pushServerEvent('room', `Bots adicionados na sala ${pin}`);
    });

    socket.on('startGame', (pin) => {
        if (!pin) return;
        const room = rooms.get(pin);
        if (!room) return socket.emit('err', 'Sala não existe.');
        if (room.host !== socket.id) return socket.emit('err', 'Apenas o host pode começar a partida.');
        if (room.status !== ROOM_PHASE.LOBBY && room.status !== ROOM_PHASE.RANKING) return;
        if (!room.questions.length) return socket.emit('err', 'Não existem perguntas para esse tema.');

        resetRoomForNewMatch(room);
        totalMatchesStarted++;
        pushServerEvent('match', `Partida iniciada na sala ${pin}`);
        room.status = ROOM_PHASE.STARTING;
        io.to(pin).emit('matchStarting', { pin });
        setTimeout(() => nextQ(pin), 800);
    });

    // ==================== RESPOSTA ====================
    socket.on('answer', (data = {}) => {
        const room = rooms.get(data.pin);
        if (!room) return socket.emit('err', 'Sala não existe');

        const player = room.players.get(socket.id);
        if (!player) return socket.emit('err', 'Jogador não encontrado');

        const now = Date.now();
        const q = room.questions[room.curIdx];

        // Regras anti-bug/anti-atraso: fase certa, pergunta certa, dentro do prazo e uma resposta só.
        if (room.status !== ROOM_PHASE.QUESTION) return;
        if (!q || data.qid !== room.currentQuestionId) return;
        if (now > room.deadlineAt) return;
        if (room.answered.has(socket.id)) return;

        const idx = Number(data.idx);
        if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return;

        room.answered.add(socket.id);
        player.lastQuestionId = room.currentQuestionId;

        const isCorrect = q.answer === idx;
        let earned = 0;

        if (isCorrect) {
            const base = q.difficulty === 'facil' ? 400 : (q.difficulty === 'medio' ? 700 : 1000);
            const remainingMs = Math.max(0, room.deadlineAt - now);
            const timeBonus = Math.floor((remainingMs / ((Number(q.time) || 15) * 1000)) * 300);
            const comboToUse = (player.combo || 0) + 1;
            const comboMult = 1 + (comboToUse * 0.15);
            earned = Math.floor((base + timeBonus) * comboMult);
            player.score += earned;
            player.combo = comboToUse;
        } else {
            player.combo = 0;
        }

        socket.emit('result', {
            qid: room.currentQuestionId,
            correct: isCorrect,
            earned,
            totalScore: player.score,
            correctIdx: q.answer,
            combo: player.combo
        });

        // Bots respondem pelo servidor, sem depender de cliente.
        room.players.forEach((p, id) => {
            if (p.isBot && !room.answered.has(id)) {
                room.answered.add(id);
                if (Math.random() > 0.3) {
                    p.combo = (p.combo || 0) + 1;
                    p.score += Math.floor(Math.random() * 500 + 200);
                } else {
                    p.combo = 0;
                }
            }
        });

        checkAllAnswered(data.pin);
    });

    socket.on('getLeaderboard', () => {
        socket.emit('leaderboardData', buildLeaderboardPayload());
    });

    socket.on('disconnect', () => {
        connectedSockets.delete(socket.id);
        pushServerEvent('disconnect', `Socket desconectado: ${socket.id.slice(0, 6)}`);
        markDisconnected(socket);
    });
});

function start(p) {
    server.listen(p, '0.0.0.0')
        .on('error', () => start(p + 1))
        .on('listening', () => {
            pushServerEvent('info', 'Servidor iniciado na porta ' + server.address().port);
            drawServerPanel();
            setInterval(drawServerPanel, 1000);
        });
}
start(3001);
