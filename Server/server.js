/**
 * ╔══════════════════════════════════════════════════════╗
 *   MeioKahoot — server.js  v3.0
 *   Servidor de jogo em tempo real (Socket.IO)
 *   Painel de terminal: sem flickering, render diferencial
 * ╚══════════════════════════════════════════════════════╝
 */

'use strict';

const express        = require('express');
const http           = require('http');
const { Server }     = require('socket.io');
const path           = require('path');
const fs             = require('fs');
const os             = require('os');
const readline       = require('readline');

// ═══════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  maxHttpBufferSize: 1e7,
  pingInterval:      10000,
  pingTimeout:       20000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 60 * 1000,
    skipMiddlewares: true,
  },
});

// ═══════════════════════════════════════════════════════
//  ARQUIVOS
// ═══════════════════════════════════════════════════════
const USERS_FILE       = path.join(__dirname, '../Data/Config/users.json');
const QUESTIONS_FILE   = path.join(__dirname, '../Data/Questoes/master.json');
const LEADERBOARD_FILE = path.join(__dirname, '../Data/Config/ranking.json');

if (!fs.existsSync(path.dirname(USERS_FILE)))
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
if (!fs.existsSync(USERS_FILE))       fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(LEADERBOARD_FILE)) fs.writeFileSync(LEADERBOARD_FILE, '[]');

const getUsers        = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const getQuestions    = () => JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
const getLeaderboard  = () => JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
const saveLeaderboard = (d) => fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(d, null, 2));
const shuffle         = (arr) => [...arr].sort(() => Math.random() - 0.5);


function normalizeUsers(users) {
  let changed = false;
  users.forEach(u => {
    if (!Array.isArray(u.friends)) { u.friends = []; changed = true; }
    if (!Array.isArray(u.friendRequests)) { u.friendRequests = []; changed = true; }
  });
  if (changed) fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  return users;
}
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function findUser(users, username) {
  const key = String(username || '').trim().toLowerCase();
  return users.find(u => String(u.user || u.name || '').toLowerCase() === key);
}
function friendPayload(user) {
  return {
    friends: (user.friends || []).map(f => {
      const item = typeof f === 'string' ? { user: f, since: null } : { ...f };
      item.room = getUserLobbyRoom(item.user);
      return item;
    }),
    requests: (user.friendRequests || []).map(r => typeof r === 'string' ? { from: r, at: null } : r),
  };
}
function isFriend(user, other) {
  const key = String(other || '').toLowerCase();
  return (user.friends || []).some(f => String(f.user || f).toLowerCase() === key);
}
function addFriend(user, other, now = Date.now()) {
  if (!isFriend(user, other)) user.friends.push({ user: other, since: now });
}
function removeRequest(user, from) {
  const key = String(from || '').toLowerCase();
  user.friendRequests = (user.friendRequests || []).filter(r => String(r.from || r).toLowerCase() !== key);
}
function hasRequest(user, from) {
  const key = String(from || '').toLowerCase();
  return (user.friendRequests || []).some(r => String(r.from || r).toLowerCase() === key);
}
function emitFriendsFor(username) {
  const users = normalizeUsers(getUsers());
  const u = findUser(users, username);
  if (!u) return;
  for (const [sid, user] of socketUsers.entries()) {
    if (String(user).toLowerCase() === String(username).toLowerCase()) io.to(sid).emit('friendsData', friendPayload(u));
  }
}
function publicAuthUser(u) {
  return { user: u.user, name: u.name || u.user, photo: u.photo || '', xp: u.xp || 0, friends: u.friends || [], friendRequests: u.friendRequests || [] };
}

function getFriendKeys(user) {
  return new Set((user?.friends || []).map(f => String(f.user || f).toLowerCase()));
}
function getRoomHostName(room) {
  const p = room?.players?.get(room.host);
  return p?.name || room?.hostName || 'Host';
}
function getUserLobbyRoom(username) {
  const key = String(username || '').toLowerCase();
  if (!key || typeof rooms === 'undefined') return null;
  for (const [pin, room] of rooms) {
    if (room.status !== ROOM_PHASE.LOBBY) continue;
    let found = false;
    for (const [sid, p] of room.players) {
      const socketUser = socketUsers.get(sid);
      if (!p.isBot && (String(p.name || '').toLowerCase() === key || String(socketUser || '').toLowerCase() === key)) {
        found = true; break;
      }
    }
    if (found) return {
      pin, theme: room.theme, host: getRoomHostName(room),
      playerCount: [...room.players.values()].filter(p => !p.isBot && p.connected !== false).length,
      createdAt: room.createdAt || null,
    };
  }
  return null;
}
function publicRoomsPayload(username) {
  const users = normalizeUsers(getUsers());
  const me = findUser(users, username);
  const friendKeys = getFriendKeys(me);
  const list = [];
  for (const [pin, room] of rooms) {
    if (room.status !== ROOM_PHASE.LOBBY) continue;
    const humans = [...room.players.entries()].filter(([, p]) => !p.isBot && p.connected !== false);
    const hostName = getRoomHostName(room);
    const friendNames = humans
      .map(([sid, p]) => socketUsers.get(sid) || p.name)
      .filter(name => friendKeys.has(String(name || '').toLowerCase()));
    list.push({
      pin, theme: room.theme, host: hostName, hostUser: room.hostUser || '',
      players: humans.length, bots: [...room.players.values()].filter(p => p.isBot).length,
      friends: [...new Set(friendNames)], isFriendRoom: friendNames.length > 0 || friendKeys.has(String(room.hostUser || hostName).toLowerCase()),
      createdAt: room.createdAt || Date.now(),
    });
  }
  list.sort((a, b) => Number(b.isFriendRoom) - Number(a.isFriendRoom) || (b.createdAt || 0) - (a.createdAt || 0));
  return { rooms: list, total: list.length };
}
function emitRoomsFor(socket) {
  const username = socketUsers.get(socket.id);
  if (username) socket.emit('roomsData', publicRoomsPayload(username));
}
function emitRoomsToAll() {
  for (const sid of connectedSockets) {
    const s = io.sockets.sockets.get(sid);
    if (s) emitRoomsFor(s);
  }
}
function getUserSockets(username) {
  const key = String(username || '').toLowerCase();
  const out = [];
  for (const [sid, user] of socketUsers.entries()) {
    if (String(user || '').toLowerCase() === key) {
      const s = io.sockets.sockets.get(sid);
      if (s) out.push(s);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
const rooms            = new Map();
const connectedSockets = new Set();
const socketUsers      = new Map();
const serverStartedAt  = Date.now();

let totalRoomsCreated    = 0;
let totalMatchesStarted  = 0;
let totalMatchesFinished = 0;
let totalAnswers         = 0;
let totalCorrectAnswers  = 0;
let totalLogins          = 0;
let totalRegistrations   = 0;
let peakConnections      = 0;

const ROOM_PHASE = {
  LOBBY:    'lobby',
  STARTING: 'starting',
  QUESTION: 'question',
  REVEAL:   'reveal',
  RANKING:  'ranking',
};

const RECONNECT_GRACE_MS = 60 * 1000;
const REVEAL_MS          = 4000;
const RANKING_CLEANUP_MS = 30 * 1000;
const QUESTION_LIMITS = { normal: 6, hard: 12 };

// ═══════════════════════════════════════════════════════
//  SISTEMA DE LOGS — ring buffer, categorias
// ═══════════════════════════════════════════════════════
const LOG_MAX = 10;
const CATEGORY = {
  CONNECT:    { label: 'PLAYER', ansi: '92' },
  DISCONNECT: { label: 'PLAYER', ansi: '93' },
  ROOM:       { label: 'ROOM  ', ansi: '94' },
  MATCH:      { label: 'GAME  ', ansi: '95' },
  AUTH:       { label: 'AUTH  ', ansi: '96' },
  ERROR:      { label: 'ERROR ', ansi: '91' },
  INFO:       { label: 'INFO  ', ansi: '37' },
  DEBUG:      { label: 'DEBUG ', ansi: '90' },
};

const logRing = [];   // ring buffer de logs

function log(cat, msg) {
  const def  = CATEGORY[cat] || CATEGORY.INFO;
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  logRing.push({ time, label: def.label, ansi: def.ansi, msg });
  if (logRing.length > LOG_MAX) logRing.shift();
  scheduleRender();   // agenda re-render do painel
}

// ═══════════════════════════════════════════════════════
//  TERMINAL — ANSI helpers
// ═══════════════════════════════════════════════════════

// Sequências de controle
const ESC   = '\x1b[';
const RESET = '\x1b[0m';

// Limpar ANSI para medir comprimento real
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const vLen      = (s) => stripAnsi(s).length;

// Cores rápidas
const fg = (code, s)    => `\x1b[${code}m${s}${RESET}`;
const bold = (s)         => `\x1b[1m${s}${RESET}`;
const dim  = (s)         => `\x1b[2m${s}${RESET}`;
const boldFg = (code, s) => `\x1b[1m\x1b[${code}m${s}${RESET}`;

// Padding por comprimento visível
const rpad   = (s, n) => s + ' '.repeat(Math.max(0, n - vLen(s)));
const center = (s, n) => {
  const d = Math.max(0, n - vLen(s));
  return ' '.repeat(Math.floor(d / 2)) + s + ' '.repeat(d - Math.floor(d / 2));
};

// ── Layout da caixa ─────────────────────────────────────
const W = 74;   // largura interna (chars visíveis entre │ e │)

const B  = (s) => `\x1b[1m\x1b[35m${s}${RESET}`;  // borda magenta bold

const rowRaw = (s) => B('│') + rpad(s, W) + B('│');
const rowC   = (s) => B('│') + center(s, W) + B('│');

const hdivider = (l = '├', r = '┤') => B(l + '─'.repeat(W) + r);

// Seção com label centralizado entre traços coloridos
function section(label) {
  const tag  = boldFg('95', ` ${label} `);
  const rem  = W - vLen(` ${label} `);
  const half = Math.floor(rem / 2);
  const dash = fg('35', '─'.repeat(half));
  const dashR= fg('35', '─'.repeat(rem - half));
  return B('│') + dash + tag + dashR + B('│');
}

// Barra de progresso  ████░░░░
function progressBar(val, max, width = 14) {
  const pct   = Math.min(1, val / Math.max(1, max));
  const ratio = pct;
  const fill  = Math.round(pct * width);
  const empty = width - fill;
  const color = ratio > 0.8 ? '91' : ratio > 0.5 ? '93' : '92';
  return boldFg(color, '█'.repeat(fill)) + fg('90', '░'.repeat(empty));
}

// Coluna stat: label dim + valor bold
function col(label, value, valCode = '97', width = 36) {
  return rpad(dim(label) + ' ' + boldFg(valCode, String(value)), width);
}

// ═══════════════════════════════════════════════════════
//  RENDERER DIFERENCIAL — sem flickering
//  Usa ANSI cursor positioning para reescrever linha a linha
//  só quando o conteúdo mudou
// ═══════════════════════════════════════════════════════

let _panelLines = [];      // última versão renderizada (strings sem ANSI)
let _renderPending = false;
let _panelRow = 0;         // linha do terminal onde o painel começa (sempre 0)

// Move cursor para linha/col 1-indexados
const gotoxy = (row, col) => `${ESC}${row};${col}H`;
// Apaga linha inteira
const eraseLine = () => `${ESC}2K`;

function scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  setImmediate(flushRender);
}

function flushRender() {
  _renderPending = false;
  if (!process.stdout.isTTY) return;
  renderPanel();
}

function renderPanel() {
  const newLines = buildPanel();

  // Primeira renderização: limpa tela inteira e escreve tudo
  if (_panelLines.length === 0) {
    process.stdout.write(`${ESC}2J${ESC}H`);  // clear + home
    process.stdout.write(newLines.join('\n') + '\n');
    _panelLines = newLines.map(stripAnsi);
    return;
  }

  // Renderizações seguintes: reescreve apenas linhas que mudaram
  let buf = '';
  const maxLen = Math.max(newLines.length, _panelLines.length);

  for (let i = 0; i < maxLen; i++) {
    const newRaw = newLines[i] !== undefined ? stripAnsi(newLines[i]) : '';
    const oldRaw = _panelLines[i] !== undefined ? _panelLines[i] : null;

    if (newRaw === oldRaw) continue;  // linha idêntica → não mexe

    // Move cursor para essa linha e reescreve
    buf += gotoxy(i + 1, 1) + eraseLine();
    if (newLines[i] !== undefined) buf += newLines[i];
  }

  // Se painel encolheu, apaga linhas extras
  for (let i = newLines.length; i < _panelLines.length; i++) {
    buf += gotoxy(i + 1, 1) + eraseLine();
  }

  if (buf) process.stdout.write(buf);

  // Garante que o cursor fique abaixo do painel (fora da área)
  process.stdout.write(gotoxy(newLines.length + 1, 1));
  _panelLines = newLines.map(stripAnsi);
}

// ═══════════════════════════════════════════════════════
//  CONSTRUÇÃO DO PAINEL
// ═══════════════════════════════════════════════════════
function getStats() {
  let playersInRooms = 0, activeMatches = 0, lobbyRooms = 0, botsTotal = 0;

  rooms.forEach((room) => {
    room.players.forEach(p => { playersInRooms++; if (p.isBot) botsTotal++; });
    if ([ROOM_PHASE.QUESTION, ROOM_PHASE.REVEAL, ROOM_PHASE.STARTING].includes(room.status)) activeMatches++;
    if (room.status === ROOM_PHASE.LOBBY) lobbyRooms++;
  });

  const mem      = process.memoryUsage();
  const uptimeMs = Date.now() - serverStartedAt;
  const cpus     = os.cpus();

  return {
    uptime:   formatUptime(uptimeMs),
    connectedSockets: connectedSockets.size,
    peakConnections,
    playersInRooms, botsTotal,
    activeRooms: rooms.size, lobbyRooms, activeMatches,
    totalRoomsCreated, totalMatchesStarted, totalMatchesFinished,
    totalAnswers, totalCorrectAnswers, totalLogins, totalRegistrations,
    accuracy: totalAnswers > 0 ? Math.round(totalCorrectAnswers / totalAnswers * 100) : 0,
    heapUsedMB:  Math.round(mem.heapUsed  / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB:       Math.round(mem.rss       / 1024 / 1024),
    cpuModel:    (cpus[0]?.model || 'N/A').trim().slice(0, 30),
    cpuCores:    cpus.length,
    nodeVersion: process.version,
    platform:    process.platform,
    pid:         process.pid,
  };
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function buildPanel() {
  const st   = getStats();
  const port = server.address()?.port || 3001;
  const now  = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const date = new Date().toLocaleDateString('pt-BR');
  const out  = [];

  // ── Cabeçalho ──────────────────────────────────────────
  out.push(B('╭' + '─'.repeat(W) + '╮'));
  out.push(rowC(boldFg('92', '🌿  MEIO') + boldFg('95', 'KAHOOT') + ' ' + boldFg('97', 'SERVER PANEL')));
  out.push(rowC(dim(`${date}  ${now}`) + '   ' + dim(`Node ${st.nodeVersion}  PID ${st.pid}`)));
  out.push(hdivider());

  // Status bar
  const statusPill = boldFg('92', '● ONLINE');
  const uptimeTxt  = boldFg('93', st.uptime);
  const urlTxt     = boldFg('96', `http://localhost:${port}`);
  out.push(rowRaw(`  ${statusPill}   ${dim('uptime')} ${uptimeTxt}   ${dim('addr')} ${urlTxt}`));

  // ── Seção: CONEXÕES ─────────────────────────────────────
  out.push(hdivider());
  out.push(section('CONEXÕES'));
  out.push(rowRaw(`  ${col('Sockets online:',   st.connectedSockets, '92')}${col('Pico simultâneo:', st.peakConnections,  '93')}`));
  out.push(rowRaw(`  ${col('Em salas (humanos):', st.playersInRooms - st.botsTotal, '96')}${col('Bots ativos:', st.botsTotal, '90')}`));
  out.push(rowRaw(`  ${col('Logins hoje:',      st.totalLogins,        '97')}${col('Cadastros:', st.totalRegistrations, '97')}`));

  // ── Seção: SALAS & PARTIDAS ─────────────────────────────
  out.push(hdivider());
  out.push(section('SALAS & PARTIDAS'));
  out.push(rowRaw(`  ${col('Salas abertas:',      st.activeRooms,          '96')}${col('Em lobby:',         st.lobbyRooms,          '96')}`));
  out.push(rowRaw(`  ${col('Partidas ao vivo:',   st.activeMatches,        '92')}${col('Total iniciadas:',  st.totalMatchesStarted, '97')}`));
  out.push(rowRaw(`  ${col('Finalizadas:',        st.totalMatchesFinished, '97')}${col('Salas criadas:',    st.totalRoomsCreated,   '97')}`));

  // ── Seção: GAMEPLAY ─────────────────────────────────────
  out.push(hdivider());
  out.push(section('GAMEPLAY'));

  const accBar  = progressBar(st.totalCorrectAnswers, st.totalAnswers, 18);
  const accPct  = boldFg(st.accuracy > 70 ? '92' : st.accuracy > 40 ? '93' : '91', `${st.accuracy}%`);
  out.push(rowRaw(`  ${col('Respostas enviadas:',  st.totalAnswers,        '97')}${col('Corretas:',    st.totalCorrectAnswers, '92')}`));
  out.push(rowRaw(`  ${dim('Accuracy')} ${accBar} ${accPct}`));

  // ── Seção: SALAS ATIVAS ─────────────────────────────────
  out.push(hdivider());
  out.push(section('SALAS ATIVAS'));
  _buildRoomLines(out);

  // ── Seção: SISTEMA ──────────────────────────────────────
  out.push(hdivider());
  out.push(section('SISTEMA'));

  const heapBar = progressBar(st.heapUsedMB, st.heapTotalMB, 16);
  out.push(rowRaw(`  ${dim('Heap')} ${heapBar} ${boldFg('97', `${st.heapUsedMB}/${st.heapTotalMB} MB`)}   ${dim('RSS')} ${boldFg('93', st.rssMB + ' MB')}`));
  out.push(rowRaw(`  ${dim('CPU')}  ${fg('90', st.cpuModel)}  ${dim(st.cpuCores + ' cores')}   ${dim('OS')} ${fg('90', st.platform)}`));

  // ── Seção: LOGS ─────────────────────────────────────────
  out.push(hdivider());
  out.push(section('LOG DE EVENTOS'));
  _buildLogLines(out);

  // ── Rodapé ───────────────────────────────────────────────
  out.push(B('╰' + '─'.repeat(W) + '╯'));

  return out;
}

// Salas detalhadas com jogadores expandidos
function _buildRoomLines(out) {
  if (rooms.size === 0) {
    out.push(rowRaw('  ' + dim('Nenhuma sala ativa no momento...')));
    return;
  }

  let shown = 0;
  rooms.forEach((room, pin) => {
    if (shown >= 4) return;
    shown++;

    const humans  = [...room.players.values()].filter(p => !p.isBot && p.connected !== false);
    const offline = [...room.players.values()].filter(p => !p.isBot && p.connected === false);
    const bots    = [...room.players.values()].filter(p => p.isBot);

    // Cor da fase
    const phaseColors = {
      lobby:    '96', starting: '93',
      question: '92', reveal:   '95',
      ranking:  '33',
    };
    const phaseAnsi = phaseColors[room.status] || '97';
    const phaseLbl  = room.status.toUpperCase().padEnd(8);

    // Progresso da questão
    const qProgress = room.status === ROOM_PHASE.QUESTION
      ? fg('90', ` Q${room.curIdx + 1}/${room.questions.length}`)
      : '';

    // Tempo restante
    const timeLeft = room.status === ROOM_PHASE.QUESTION && room.deadlineAt > 0
      ? fg('90', ` ${Math.max(0, Math.ceil((room.deadlineAt - Date.now()) / 1000))}s`)
      : '';

    // Linha principal da sala
    out.push(rowRaw(
      `  ${boldFg('93', `[${pin}]`)} ` +
      `${boldFg(phaseAnsi, phaseLbl)} ` +
      `${fg('96', room.theme.slice(0, 16).padEnd(16))} ` +
      `${boldFg('92', humans.length + 'H')}` +
      (bots.length    ? fg('90', `+${bots.length}B`)    : '') +
      (offline.length ? boldFg('91', ` ${offline.length}off`) : '') +
      qProgress + timeLeft
    ));

    // Linha dos jogadores (indent)
    const allPlayers = [...humans, ...offline, ...bots];
    if (allPlayers.length > 0) {
      const playerChunks = [];
      allPlayers.forEach(p => {
        const name   = (p.name || '?').slice(0, 12);
        const score  = p.score ? fg('90', ` ${p.score}pts`) : '';
        const device = p.device === 'mobile' ? fg('90','📱') : fg('90','💻');
        const status = p.isBot
          ? fg('90', '🤖')
          : p.connected === false
            ? boldFg('91', '●')
            : boldFg('92', '●');
        playerChunks.push(`${status}${fg('97', name)}${score}`);
      });

      // Agrupa em grupos de 3 por linha
      for (let i = 0; i < playerChunks.length; i += 3) {
        const chunk = playerChunks.slice(i, i + 3);
        out.push(rowRaw('    ' + chunk.map(c => rpad(c, 23)).join('')));
      }
    }

    // Linha separadora entre salas (se houver mais de uma)
    if (rooms.size > 1 && shown < Math.min(rooms.size, 4)) {
      out.push(rowRaw('  ' + fg('35', '·'.repeat(W - 4))));
    }
  });

  if (rooms.size > 4) {
    out.push(rowRaw('  ' + dim(`... e mais ${rooms.size - 4} sala(s) não exibida(s)`)));
  }
}

// Logs com badge colorido, timestamp e mensagem truncada
function _buildLogLines(out) {
  if (logRing.length === 0) {
    out.push(rowRaw('  ' + dim('Aguardando eventos...')));
    return;
  }

  // Mais recentes por último (ordem cronológica, mais novo embaixo)
  [...logRing].forEach(entry => {
    const badge   = `\x1b[1m\x1b[${entry.ansi}m[${entry.label}]\x1b[0m`;
    const timeTxt = dim(entry.time);
    const prefix  = `  ${badge} ${timeTxt} `;
    const msgMaxLen = W - vLen(`  [${entry.label}] ${entry.time} `);
    const msgTxt  = fg('97', entry.msg.slice(0, msgMaxLen));
    out.push(rowRaw(prefix + msgTxt));
  });
}

// ═══════════════════════════════════════════════════════
//  ROTAS HTTP
// ═══════════════════════════════════════════════════════
app.use('/Scripts', express.static(path.join(__dirname, '../Scripts')));
app.use('/Data',    express.static(path.join(__dirname, '../Data')));
app.use('/Assets',  express.static(path.join(__dirname, '../Assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Scripts/Paginas/index.html')));
app.get('/status',  (req, res) => res.json(getStats()));

// ═══════════════════════════════════════════════════════
//  HELPERS DE SALA
// ═══════════════════════════════════════════════════════
function makePin() {
  let pin;
  do { pin = String(Math.floor(100000 + Math.random() * 900000)); }
  while (rooms.has(pin));
  return pin;
}

function clearRoomTimers(room) {
  if (!room) return;
  clearTimeout(room.questionTimer);
  clearTimeout(room.nextTimer);
  clearTimeout(room.cleanupTimer);
  room.questionTimer = room.nextTimer = room.cleanupTimer = null;
}

function resetRoomForNewMatch(room, difficulty = 'normal') {
  clearRoomTimers(room);
  room.curIdx = room.questionStartedAt = room.deadlineAt = 0;
  room.status            = ROOM_PHASE.LOBBY;
  room.answered          = new Set();
  room.currentQuestionId = null;
  room.players.forEach(p => { p.score = 0; p.combo = 0; p.maxCombo = 0; p.answers = 0; p.correct = 0; p.fastestMs = null; p.totalEarned = 0; p.lastQuestionId = null; });
  const allQ = getQuestions();
  room.difficulty = difficulty === 'hard' ? 'hard' : 'normal';
  const pool = shuffle(allQ[room.theme] || allQ.ciencias || []);
  const limit = QUESTION_LIMITS[room.difficulty] || QUESTION_LIMITS.normal;
  room.questions = pool.slice(0, Math.min(limit, pool.length));
}

function createPlayer(data, isBot = false) {
  return {
    name:           data.name || data.playerName || 'Jogador',
    photo:          data.photo || data.playerPhoto || '',
    device:         data.device || null,
    score: 0, combo: 0, maxCombo: 0, answers: 0, correct: 0, fastestMs: null, totalEarned: 0, isBot,
    connected: true, disconnectedAt: null,
    cleanupTimer: null, lastQuestionId: null,
  };
}

const publicPlayers = (room) => [...room.players.values()].map(p => ({
  name: p.name, photo: p.photo || '', score: p.score || 0,
  answers: p.answers || 0, correct: p.correct || 0, maxCombo: p.maxCombo || 0, fastestMs: p.fastestMs || null,
  isBot: !!p.isBot, connected: p.connected !== false, device: p.device || null,
}));

function findRoomBySocket(sid) {
  for (const [pin, room] of rooms)
    if (room.players.has(sid)) return { pin, room };
  return null;
}

function findDisconnectedByName(room, name) {
  for (const [id, p] of room.players)
    if (!p.isBot && p.connected === false && p.name === name)
      return { oldSocketId: id, player: p };
  return null;
}

function moveAnsweredId(room, oldId, newId) {
  if (room.answered.has(oldId)) { room.answered.delete(oldId); room.answered.add(newId); }
}

function reconnectPlayer(pin, room, oldSocketId, socket) {
  const player = room.players.get(oldSocketId);
  if (!player) return false;

  clearTimeout(player.cleanupTimer);
  player.cleanupTimer = null;
  player.connected    = true;
  player.disconnectedAt = null;

  room.players.delete(oldSocketId);
  room.players.set(socket.id, player);
  moveAnsweredId(room, oldSocketId, socket.id);
  if (room.host === oldSocketId) room.host = socket.id;

  socket.join(pin);
  socket.emit('joined', { pin });
  socket.emit('scoreSync', { totalScore: player.score, combo: player.combo });
  io.to(pin).emit('pList', publicPlayers(room));

  if (room.status === ROOM_PHASE.QUESTION && Date.now() < room.deadlineAt) {
    const q = room.questions[room.curIdx];
    socket.emit('q', {
      ...q, qid: room.currentQuestionId,
      n: room.curIdx + 1, total: room.questions.length,
      serverNow: Date.now(), deadlineAt: room.deadlineAt,
      alreadyAnswered: room.answered.has(socket.id),
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
    const next = [...room.players.entries()].find(([, p]) => !p.isBot && p.connected !== false);
    room.host = next ? next[0] : null;
    if (room.host) io.to(room.host).emit('hostChanged', { pin });
  }

  io.to(pin).emit('pList', publicPlayers(room));
  emitRoomsToAll();
  scheduleRender();

  if (![...room.players.values()].some(p => !p.isBot)) {
    clearRoomTimers(room); rooms.delete(pin); emitRoomsToAll();
    log('ROOM', `Sala ${pin} encerrada (sem humanos)`);
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

  player.connected      = false;
  player.disconnectedAt = Date.now();
  io.to(pin).emit('pList', publicPlayers(room));
  log('DISCONNECT', `${player.name} desconectou da sala ${pin}`);
  player.cleanupTimer = setTimeout(() => removePlayerFromRoom(pin, socket.id), RECONNECT_GRACE_MS);
}

// ═══════════════════════════════════════════════════════
//  FLUXO DE JOGO
// ═══════════════════════════════════════════════════════
function nextQ(pin) {
  const room = rooms.get(pin);
  if (!room) return;

  clearTimeout(room.questionTimer);
  clearTimeout(room.nextTimer);
  room.questionTimer = room.nextTimer = null;

  if (room.curIdx >= room.questions.length) { finishGame(pin); return; }

  room.status   = ROOM_PHASE.QUESTION;
  room.answered.clear();

  const q            = room.questions[room.curIdx];
  const questionTime = Number(q.time) || 15;
  room.currentQuestionId = `${room.curIdx}-${Date.now()}`;
  room.questionStartedAt = Date.now();
  room.deadlineAt        = room.questionStartedAt + questionTime * 1000;

  io.to(pin).emit('q', {
    ...q, qid: room.currentQuestionId,
    n: room.curIdx + 1, total: room.questions.length,
    time: questionTime, serverNow: room.questionStartedAt,
    deadlineAt: room.deadlineAt,
  });

  scheduleRender();
  room.questionTimer = setTimeout(() => doReveal(pin), questionTime * 1000);
}

function doReveal(pin) {
  const room = rooms.get(pin);
  if (!room || room.status !== ROOM_PHASE.QUESTION) return;

  clearTimeout(room.questionTimer);
  room.questionTimer = null;
  room.status = ROOM_PHASE.REVEAL;

  const q = room.questions[room.curIdx];
  room.players.forEach((p, id) => {
    if (p.isBot && !room.answered.has(id)) {
      room.answered.add(id);
      if (Math.random() > 0.4) { p.combo = 0; p.score += Math.floor(Math.random() * 400 + 200); }
      else p.combo = 0;
    }
  });

  io.to(pin).emit('reveal', { qid: room.currentQuestionId, correct: q.answer });
  room.curIdx++;
  scheduleRender();
  room.nextTimer = setTimeout(() => nextQ(pin), REVEAL_MS);
}


function buildRankWithTies(room) {
  const sorted = publicPlayers(room).sort((a, b) => (b.score || 0) - (a.score || 0));
  let lastScore = null, lastPos = 0;
  return sorted.map((p, i) => {
    if (lastScore === null || (p.score || 0) !== lastScore) {
      lastPos = i + 1;
      lastScore = p.score || 0;
    }
    const tie = sorted.some((x, j) => j !== i && (x.score || 0) === (p.score || 0));
    return { ...p, position: lastPos, tie };
  });
}
function buildFinalStats(room, rank) {
  const humans = rank.filter(p => !p.isBot);
  const totalAnswers = humans.reduce((s, p) => s + (p.answers || 0), 0);
  const totalCorrect = humans.reduce((s, p) => s + (p.correct || 0), 0);
  const scoreCounts = new Map();
  rank.forEach(p => scoreCounts.set(p.score || 0, (scoreCounts.get(p.score || 0) || 0) + 1));
  return {
    theme: room.theme || 'ciencias', questions: room.questions.length,
    totalPlayers: rank.length, humanPlayers: humans.length,
    totalAnswers, totalCorrect,
    accuracy: totalAnswers ? Math.round(totalCorrect / totalAnswers * 100) : 0,
    topTie: rank.length > 1 && (rank[0]?.score || 0) === (rank[1]?.score || -1),
    tieGroups: [...scoreCounts.values()].filter(n => n > 1).length,
  };
}

function finishGame(pin) {
  const room = rooms.get(pin);
  if (!room) return;

  clearRoomTimers(room);
  totalMatchesFinished++;
  room.status = ROOM_PHASE.RANKING;

  const rank = buildRankWithTies(room);
  const stats = buildFinalStats(room, rank);
  saveMatchToLeaderboard(room, rank);
  io.to(pin).emit('gameOver', { rank, stats });
  log('MATCH', `Partida finalizada na sala ${pin} · ${rank.length} jogadores`);

  room.cleanupTimer = setTimeout(() => {
    clearRoomTimers(room); rooms.delete(pin); emitRoomsToAll();
    log('ROOM', `Sala ${pin} limpa após ranking`);
  }, RANKING_CLEANUP_MS);
}

function activePlayersCount(room) {
  let n = 0;
  room.players.forEach(p => { if (p.isBot || p.connected !== false) n++; });
  return n;
}

function checkAllAnswered(pin) {
  const room = rooms.get(pin);
  if (!room || room.status !== ROOM_PHASE.QUESTION) return;
  if (activePlayersCount(room) > 0 && room.answered.size >= activePlayersCount(room))
    doReveal(pin);
}

function saveMatchToLeaderboard(room, rank) {
  const now = new Date().toISOString();
  const cur = getLeaderboard();
  rank.filter(p => !p.isBot).forEach((p, i) =>
    cur.push({ name: p.name, photo: p.photo || '', score: p.score || 0, position: p.position || (i + 1), tie: !!p.tie, theme: room.theme || 'ciencias', date: now })
  );
  cur.sort((a, b) => (b.score || 0) - (a.score || 0));
  saveLeaderboard(cur.slice(0, 100));
}

function buildLeaderboardPayload() {
  const data = getLeaderboard();
  const aggregate = new Map();
  const themeStats = new Map();

  data.forEach(item => {
    const k = String(item.name || '').toLowerCase();
    if (!k) return;
    const theme = item.theme || 'geral';
    const score = item.score || 0;
    const pos = item.position || 999;

    const cur = aggregate.get(k) || {
      name: item.name, photo: item.photo || '', score: 0, bestScore: 0,
      games: 0, wins: 0, podiums: 0, ties: 0, totalScore: 0, avgScore: 0,
      bestPosition: 999, favoriteTheme: '', themes: {}, theme: item.theme || '',
      date: item.date || '', lastDate: item.date || '', consistency: 0,
    };

    cur.games++;
    cur.totalScore += score;
    cur.avgScore = Math.round(cur.totalScore / cur.games);
    cur.wins += Number(pos === 1);
    cur.podiums += Number(pos <= 3);
    cur.ties += Number(!!item.tie);
    cur.bestPosition = Math.min(cur.bestPosition, pos);
    cur.themes[theme] = (cur.themes[theme] || 0) + 1;
    cur.favoriteTheme = Object.entries(cur.themes).sort((a, b) => b[1] - a[1])[0]?.[0] || theme;
    cur.consistency = Math.round((cur.podiums / cur.games) * 100);

    if (score > cur.bestScore) {
      cur.bestScore = score;
      cur.score = score;
      cur.photo = item.photo || cur.photo;
      cur.theme = item.theme || cur.theme;
      cur.date = item.date || cur.date;
    }
    if (!cur.lastDate || new Date(item.date || 0) > new Date(cur.lastDate || 0)) cur.lastDate = item.date;
    aggregate.set(k, cur);

    const ts = themeStats.get(theme) || { theme, records: 0, bestScore: 0, bestPlayer: '---', totalScore: 0, avgScore: 0 };
    ts.records++;
    ts.totalScore += score;
    ts.avgScore = Math.round(ts.totalScore / ts.records);
    if (score > ts.bestScore) { ts.bestScore = score; ts.bestPlayer = item.name || '---'; }
    themeStats.set(theme, ts);
  });

  const players = [...aggregate.values()];
  const best = [...players].sort((a, b) => (b.bestScore || b.score || 0) - (a.bestScore || a.score || 0)).slice(0, 50);
  const wins = [...players].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.bestScore || 0) - (a.bestScore || 0)).slice(0, 50);
  const avg = [...players].filter(p => p.games >= 2).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0) || (b.games || 0) - (a.games || 0)).slice(0, 50);
  const podiums = [...players].sort((a, b) => (b.podiums || 0) - (a.podiums || 0) || (b.consistency || 0) - (a.consistency || 0)).slice(0, 50);
  const recent = data.slice(-50).reverse();
  const themes = [...themeStats.values()].sort((a, b) => (b.records || 0) - (a.records || 0));

  return {
    best,
    wins,
    avg,
    podiums,
    recent,
    themes,
    stats: {
      records: data.length, players: players.length,
      bestScore: best[0]?.bestScore || best[0]?.score || 0, bestPlayer: best[0]?.name || '---',
      totalWins: players.reduce((s, p) => s + (p.wins || 0), 0),
      totalPodiums: players.reduce((s, p) => s + (p.podiums || 0), 0),
      avgScore: data.length ? Math.round(data.reduce((s, p) => s + (p.score || 0), 0) / data.length) : 0,
      activeThemes: themes.length,
    },
  };
}

// ═══════════════════════════════════════════════════════
//  SOCKET.IO — HANDLERS
// ═══════════════════════════════════════════════════════
io.on('connection', (socket) => {
  connectedSockets.add(socket.id);
  if (connectedSockets.size > peakConnections) peakConnections = connectedSockets.size;
  log('CONNECT', `Socket conectado: ${socket.id.slice(0, 8)}`);

  socket.on('register', (d) => {
    const users = normalizeUsers(getUsers());
    if (users.find(u => String(u.user || '').toLowerCase() === String(d.user || '').toLowerCase()))
      return socket.emit('authErr', 'Nome já em uso. Tente outro.');
    users.push({ ...d, xp: 0, friends: [], friendRequests: [] });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    totalRegistrations++;
    log('AUTH', `Cadastro: ${d.user}`);
    socketUsers.set(socket.id, d.user);
    socket.emit('authOk', publicAuthUser({ ...d, xp: 0, friends: [], friendRequests: [] }));
    socket.emit('friendsData', { friends: [], requests: [] });
    emitRoomsFor(socket);
  });

  socket.on('login', (d) => {
    const users = normalizeUsers(getUsers());
    const u = users.find(u => String(u.user || '').toLowerCase() === String(d.user || '').toLowerCase() && u.pass === d.pass);
    if (u) {
      totalLogins++;
      log('AUTH', `Login: ${d.user}`);
      socketUsers.set(socket.id, u.user);
      socket.emit('authOk', publicAuthUser(u));
      socket.emit('friendsData', friendPayload(u));
      emitRoomsFor(socket);
    } else {
      log('ERROR', `Login inválido: ${d.user}`);
      socket.emit('authErr', 'Usuário ou senha incorretos.');
    }
  });

  socket.on('createRoom', (d) => {
    if (!d || !d.playerName) return socket.emit('err', 'Dados inválidos.');

    const pin   = makePin();
    const allQ  = getQuestions();
    const theme = d.theme || 'ciencias';
    const room  = {
      pin, theme, difficulty: 'normal', host: socket.id, hostUser: socketUsers.get(socket.id) || d.playerName, hostName: d.playerName, createdAt: Date.now(),
      players: new Map(),
      questions: shuffle(allQ[theme] || allQ.ciencias || []),
      curIdx: 0, status: ROOM_PHASE.LOBBY,
      answered: new Set(), currentQuestionId: null,
      questionStartedAt: 0, deadlineAt: 0,
      questionTimer: null, nextTimer: null, cleanupTimer: null,
    };

    room.players.set(socket.id, createPlayer({ playerName: d.playerName, playerPhoto: d.playerPhoto, device: d.device }));
    rooms.set(pin, room);
    totalRoomsCreated++;
    log('ROOM', `Sala ${pin} criada por ${d.playerName} · ${theme}`);

    socket.join(pin);
    socket.emit('roomCreated', pin);
    io.to(pin).emit('pList', publicPlayers(room));
    emitRoomsToAll();
    scheduleRender();
  });

  socket.on('joinRoom', (d = {}) => {
    const room = rooms.get(d.pin);
    if (!room) return socket.emit('err', 'Sala não encontrada. Verifique o PIN.');

    const reconn = findDisconnectedByName(room, d.name);
    if (reconn) {
      if (d.device) reconn.player.device = d.device;
      reconnectPlayer(d.pin, room, reconn.oldSocketId, socket);
      log('CONNECT', `${d.name} reconectou à sala ${d.pin}`);
      return;
    }

    if (room.status !== ROOM_PHASE.LOBBY)
      return socket.emit('err', 'A partida já começou. Aguarde a próxima.');
    if ([...room.players.values()].some(p => !p.isBot && p.name === d.name))
      return socket.emit('err', 'Nome já em uso nesta sala.');

    room.players.set(socket.id, createPlayer({ name: d.name, photo: d.photo, device: d.device }));
    socket.join(d.pin);
    socket.emit('joined', { pin: d.pin });
    io.to(d.pin).emit('pList', publicPlayers(room));
    emitRoomsToAll();
    log('ROOM', `${d.name} entrou na sala ${d.pin}`);
    scheduleRender();
  });

  socket.on('addBots', (pin) => {
    if (!pin) return;
    const room = rooms.get(pin);
    if (!room || room.status !== ROOM_PHASE.LOBBY) return;
    if (room.host !== socket.id) return socket.emit('err', 'Apenas o host pode adicionar bots.');

    ['Bot Alpha 🤖', 'Bot Beta 🤖', 'Bot Gama 🤖'].forEach((name, i) => {
      const id = `bot-${i}`;
      if (!room.players.has(id)) room.players.set(id, createPlayer({ name }, true));
    });

    io.to(pin).emit('pList', publicPlayers(room));
    emitRoomsToAll();
    log('ROOM', `Bots adicionados na sala ${pin}`);
    scheduleRender();
  });

  socket.on('startGame', (payload) => {
    const pin = typeof payload === 'object' ? payload.pin : payload;
    const difficulty = (typeof payload === 'object' ? payload.difficulty : 'normal') === 'hard' ? 'hard' : 'normal';
    if (!pin) return;
    const room = rooms.get(pin);
    if (!room)                   return socket.emit('err', 'Sala não existe.');
    if (room.host !== socket.id) return socket.emit('err', 'Apenas o host pode iniciar.');
    if (![ROOM_PHASE.LOBBY, ROOM_PHASE.RANKING].includes(room.status)) return;
    if (!room.questions.length)  return socket.emit('err', 'Nenhuma questão para esse tema.');

    resetRoomForNewMatch(room, difficulty);
    totalMatchesStarted++;
    log('MATCH', `Partida iniciada · sala ${pin} · tema ${room.theme} · ${difficulty} · ${room.questions.length} questões`);

    room.status = ROOM_PHASE.STARTING;
    io.to(pin).emit('matchStarting', { pin, difficulty, questions: room.questions.length });
    emitRoomsToAll();
    scheduleRender();
    setTimeout(() => nextQ(pin), 800);
  });

  socket.on('answer', (data = {}) => {
    const room = rooms.get(data.pin);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const now = Date.now();
    const q   = room.questions[room.curIdx];

    if (room.status !== ROOM_PHASE.QUESTION)              return;
    if (!q || data.qid !== room.currentQuestionId)        return;
    if (now > room.deadlineAt)                            return;
    if (room.answered.has(socket.id))                     return;

    const idx = Number(data.idx);
    const isTimeout = idx === -1;
    if (!isTimeout && (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length)) return;

    room.answered.add(socket.id);
    player.lastQuestionId = room.currentQuestionId;
    player.answers = (player.answers || 0) + 1;

    const isCorrect = !isTimeout && q.answer === idx;
    let earned = 0;
    totalAnswers++;

    if (isCorrect) {
      totalCorrectAnswers++;
      const base       = q.difficulty === 'facil' ? 400 : q.difficulty === 'medio' ? 700 : 1000;
      const remMs      = Math.max(0, room.deadlineAt - now);
      const timeBonus  = Math.floor((remMs / ((Number(q.time) || 15) * 1000)) * 300);
      earned           = base + timeBonus;
      player.score    += earned;
      player.combo     = 0;
      player.correct   = (player.correct || 0) + 1;
      player.maxCombo  = 0;
      player.fastestMs = player.fastestMs == null ? (now - room.questionStartedAt) : Math.min(player.fastestMs, now - room.questionStartedAt);
      player.totalEarned = (player.totalEarned || 0) + earned;
    } else {
      player.combo = 0;
    }

    socket.emit('result', {
      qid: room.currentQuestionId, correct: isCorrect,
      earned, totalScore: player.score,
      correctIdx: q.answer, combo: 0,
    });

    room.players.forEach((p, id) => {
      if (p.isBot && !room.answered.has(id)) {
        room.answered.add(id);
        if (Math.random() > 0.3) { p.combo = 0; p.score += Math.floor(Math.random() * 500 + 200); }
        else p.combo = 0;
      }
    });

    checkAllAnswered(data.pin);
  });



  socket.on('getRooms', () => {
    emitRoomsFor(socket);
  });

  socket.on('inviteFriend', ({ to, pin } = {}) => {
    const from = socketUsers.get(socket.id);
    to = String(to || '').trim();
    pin = String(pin || '').trim();
    if (!from) return socket.emit('friendErr', 'Faça login para convidar amigos.');
    if (!to || !pin) return socket.emit('friendErr', 'Convite inválido.');

    const room = rooms.get(pin);
    if (!room || room.status !== ROOM_PHASE.LOBBY) return socket.emit('friendErr', 'Essa sala não está disponível para convite.');
    if (!room.players.has(socket.id)) return socket.emit('friendErr', 'Você precisa estar na sala para convidar.');

    const users = normalizeUsers(getUsers());
    const me = findUser(users, from);
    const target = findUser(users, to);
    if (!me || !target) return socket.emit('friendErr', 'Usuário não encontrado.');
    if (!isFriend(me, target.user)) return socket.emit('friendErr', 'Você só pode convidar amigos.');

    const targetSockets = getUserSockets(target.user);
    if (!targetSockets.length) return socket.emit('friendInfo', `${target.user} está offline agora.`);

    const payload = { from: me.user, pin, theme: room.theme, host: getRoomHostName(room), players: publicPlayers(room).length };
    targetSockets.forEach(s => s.emit('roomInvite', payload));
    socket.emit('friendInfo', `Convite enviado para ${target.user}.`);
  });

  socket.on('getFriends', () => {
    const username = socketUsers.get(socket.id);
    if (!username) return socket.emit('friendErr', 'Faça login para ver amigos.');
    const users = normalizeUsers(getUsers());
    const me = findUser(users, username);
    if (me) socket.emit('friendsData', friendPayload(me));
  });

  socket.on('sendFriendRequest', ({ to } = {}) => {
    const from = socketUsers.get(socket.id);
    to = String(to || '').trim();
    if (!from) return socket.emit('friendErr', 'Faça login para enviar pedido.');
    if (!to) return socket.emit('friendErr', 'Digite um usuário.');
    if (to.toLowerCase() === from.toLowerCase()) return socket.emit('friendErr', 'Você não pode adicionar você mesmo.');

    const users = normalizeUsers(getUsers());
    const me = findUser(users, from);
    const target = findUser(users, to);
    if (!target) return socket.emit('friendErr', 'Usuário não encontrado.');
    if (isFriend(me, target.user)) return socket.emit('friendErr', 'Vocês já são amigos.');

    const now = Date.now();
    if (hasRequest(me, target.user)) {
      addFriend(me, target.user, now); addFriend(target, me.user, now);
      removeRequest(me, target.user); removeRequest(target, me.user);
      saveUsers(users);
      emitFriendsFor(me.user); emitFriendsFor(target.user);
      return socket.emit('friendInfo', `${target.user} também tinha pedido você. Amizade aceita! 🤝`);
    }
    if (hasRequest(target, me.user)) return socket.emit('friendErr', 'Pedido já enviado. Aguarde o aceite.');

    target.friendRequests.push({ from: me.user, at: now });
    saveUsers(users);
    emitFriendsFor(me.user); emitFriendsFor(target.user);
    socket.emit('friendInfo', `Pedido enviado para ${target.user}.`);
  });

  socket.on('acceptFriendRequest', ({ from } = {}) => {
    const username = socketUsers.get(socket.id);
    from = String(from || '').trim();
    if (!username || !from) return;
    const users = normalizeUsers(getUsers());
    const me = findUser(users, username);
    const other = findUser(users, from);
    if (!me || !other || !hasRequest(me, other.user)) return socket.emit('friendErr', 'Pedido não encontrado.');
    const now = Date.now();
    addFriend(me, other.user, now); addFriend(other, me.user, now);
    removeRequest(me, other.user); removeRequest(other, me.user);
    saveUsers(users);
    emitFriendsFor(me.user); emitFriendsFor(other.user);
    socket.emit('friendInfo', `${other.user} agora é seu amigo!`);
  });

  socket.on('rejectFriendRequest', ({ from } = {}) => {
    const username = socketUsers.get(socket.id);
    from = String(from || '').trim();
    if (!username || !from) return;
    const users = normalizeUsers(getUsers());
    const me = findUser(users, username);
    if (!me) return;
    removeRequest(me, from);
    saveUsers(users);
    emitFriendsFor(me.user);
    socket.emit('friendInfo', 'Pedido recusado.');
  });

  socket.on('removeFriend', ({ user } = {}) => {
    const username = socketUsers.get(socket.id);
    user = String(user || '').trim();
    if (!username || !user) return;
    const users = normalizeUsers(getUsers());
    const me = findUser(users, username);
    const other = findUser(users, user);
    if (!me || !other) return;
    const keyMe = me.user.toLowerCase(), keyOther = other.user.toLowerCase();
    me.friends = (me.friends || []).filter(f => String(f.user || f).toLowerCase() !== keyOther);
    other.friends = (other.friends || []).filter(f => String(f.user || f).toLowerCase() !== keyMe);
    saveUsers(users);
    emitFriendsFor(me.user); emitFriendsFor(other.user);
    socket.emit('friendInfo', `${other.user} removido dos amigos.`);
  });

  socket.on('leaveRoom', (pin) => {
    const found = findRoomBySocket(socket.id);
    if (found && (!pin || found.pin === pin)) removePlayerFromRoom(found.pin, socket.id);
  });

  socket.on('getLeaderboard', () => {
    socket.emit('leaderboardData', buildLeaderboardPayload());
  });

  socket.on('disconnect', () => {
    connectedSockets.delete(socket.id);
    socketUsers.delete(socket.id);
    log('DISCONNECT', `Socket desconectado: ${socket.id.slice(0, 8)}`);
    markDisconnected(socket);
    scheduleRender();
  });
});

// ═══════════════════════════════════════════════════════
//  TICK DO PAINEL — atualiza o timer das questões ao vivo
//  sem depender de events (para o contador de segundos)
// ═══════════════════════════════════════════════════════
setInterval(() => {
  // Re-renderiza apenas se houver sala em questão ativa (timer muda a cada segundo)
  let hasActive = false;
  rooms.forEach(r => { if (r.status === ROOM_PHASE.QUESTION) hasActive = true; });
  if (hasActive) scheduleRender();

  // Também força refresh do uptime/hora a cada segundo
  scheduleRender();
}, 1000);

// ═══════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════
function start(port) {
  server.listen(port, '0.0.0.0')
    .on('error', () => start(port + 1))
    .on('listening', () => {
      const p = server.address().port;
      log('INFO', `Servidor iniciado na porta ${p} · ${new Date().toLocaleString('pt-BR')}`);

      // Render inicial imediato
      if (process.stdout.isTTY) {
        process.stdout.write(`${ESC}2J${ESC}H`);  // clear tela
        process.stdout.write(`${ESC}?25l`);        // esconde cursor (evita flickering)
      }
      renderPanel();
    });
}

// Restaura cursor ao sair
process.on('exit',    () => process.stdout.write(`${ESC}?25h`));
process.on('SIGINT',  () => { process.stdout.write(`${ESC}?25h\n`); process.exit(0); });
process.on('SIGTERM', () => { process.stdout.write(`${ESC}?25h\n`); process.exit(0); });

start(3001);
