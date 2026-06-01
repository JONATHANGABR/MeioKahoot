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

// ═══════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
const rooms            = new Map();
const connectedSockets = new Set();
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

function resetRoomForNewMatch(room) {
  clearRoomTimers(room);
  room.curIdx = room.questionStartedAt = room.deadlineAt = 0;
  room.status            = ROOM_PHASE.LOBBY;
  room.answered          = new Set();
  room.currentQuestionId = null;
  room.players.forEach(p => { p.score = 0; p.combo = 0; p.lastQuestionId = null; });
  const allQ = getQuestions();
  room.questions = shuffle(allQ[room.theme] || allQ.ciencias || []);
}

function createPlayer(data, isBot = false) {
  return {
    name:           data.name || data.playerName || 'Jogador',
    photo:          data.photo || data.playerPhoto || '',
    device:         data.device || null,
    score: 0, combo: 0, isBot,
    connected: true, disconnectedAt: null,
    cleanupTimer: null, lastQuestionId: null,
  };
}

const publicPlayers = (room) => [...room.players.values()].map(p => ({
  name: p.name, photo: p.photo || '', score: p.score || 0,
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
  scheduleRender();

  if (![...room.players.values()].some(p => !p.isBot)) {
    clearRoomTimers(room); rooms.delete(pin);
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
      if (Math.random() > 0.4) { p.combo = (p.combo || 0) + 1; p.score += Math.floor(Math.random() * 400 + 200); }
      else p.combo = 0;
    }
  });

  io.to(pin).emit('reveal', { qid: room.currentQuestionId, correct: q.answer });
  room.curIdx++;
  scheduleRender();
  room.nextTimer = setTimeout(() => nextQ(pin), REVEAL_MS);
}

function finishGame(pin) {
  const room = rooms.get(pin);
  if (!room) return;

  clearRoomTimers(room);
  totalMatchesFinished++;
  room.status = ROOM_PHASE.RANKING;

  const rank = publicPlayers(room).sort((a, b) => b.score - a.score);
  saveMatchToLeaderboard(room, rank);
  io.to(pin).emit('gameOver', rank);
  log('MATCH', `Partida finalizada na sala ${pin} · ${rank.length} jogadores`);

  room.cleanupTimer = setTimeout(() => {
    clearRoomTimers(room); rooms.delete(pin);
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
    cur.push({ name: p.name, photo: p.photo || '', score: p.score || 0, position: i + 1, theme: room.theme || 'ciencias', date: now })
  );
  cur.sort((a, b) => (b.score || 0) - (a.score || 0));
  saveLeaderboard(cur.slice(0, 100));
}

function buildLeaderboardPayload() {
  const data = getLeaderboard();
  const best = new Map();
  data.forEach(item => {
    const k = String(item.name || '').toLowerCase();
    if (!k) return;
    const o = best.get(k);
    if (!o || (item.score || 0) > (o.score || 0)) best.set(k, item);
  });
  const sorted = [...best.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20);
  return {
    best: sorted,
    recent: data.slice(-20).reverse(),
    stats: {
      records: data.length, players: best.size,
      bestScore: sorted[0]?.score || 0, bestPlayer: sorted[0]?.name || '---',
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
    const users = getUsers();
    if (users.find(u => u.user === d.user))
      return socket.emit('authErr', 'Nome já em uso. Tente outro.');
    users.push({ ...d, xp: 0 });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    totalRegistrations++;
    log('AUTH', `Cadastro: ${d.user}`);
    socket.emit('authOk', { ...d, xp: 0 });
  });

  socket.on('login', (d) => {
    const u = getUsers().find(u => u.user === d.user && u.pass === d.pass);
    if (u) {
      totalLogins++;
      log('AUTH', `Login: ${d.user}`);
      socket.emit('authOk', u);
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
      pin, theme, host: socket.id,
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
    log('ROOM', `Bots adicionados na sala ${pin}`);
    scheduleRender();
  });

  socket.on('startGame', (pin) => {
    if (!pin) return;
    const room = rooms.get(pin);
    if (!room)                   return socket.emit('err', 'Sala não existe.');
    if (room.host !== socket.id) return socket.emit('err', 'Apenas o host pode iniciar.');
    if (![ROOM_PHASE.LOBBY, ROOM_PHASE.RANKING].includes(room.status)) return;
    if (!room.questions.length)  return socket.emit('err', 'Nenhuma questão para esse tema.');

    resetRoomForNewMatch(room);
    totalMatchesStarted++;
    log('MATCH', `Partida iniciada · sala ${pin} · tema ${room.theme}`);

    room.status = ROOM_PHASE.STARTING;
    io.to(pin).emit('matchStarting', { pin });
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
    if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return;

    room.answered.add(socket.id);
    player.lastQuestionId = room.currentQuestionId;

    const isCorrect = q.answer === idx;
    let earned = 0;
    totalAnswers++;

    if (isCorrect) {
      totalCorrectAnswers++;
      const base       = q.difficulty === 'facil' ? 400 : q.difficulty === 'medio' ? 700 : 1000;
      const remMs      = Math.max(0, room.deadlineAt - now);
      const timeBonus  = Math.floor((remMs / ((Number(q.time) || 15) * 1000)) * 300);
      const combo      = (player.combo || 0) + 1;
      earned           = Math.floor((base + timeBonus) * (1 + combo * 0.15));
      player.score    += earned;
      player.combo     = combo;
    } else {
      player.combo = 0;
    }

    socket.emit('result', {
      qid: room.currentQuestionId, correct: isCorrect,
      earned, totalScore: player.score,
      correctIdx: q.answer, combo: player.combo,
    });

    room.players.forEach((p, id) => {
      if (p.isBot && !room.answered.has(id)) {
        room.answered.add(id);
        if (Math.random() > 0.3) { p.combo = (p.combo || 0) + 1; p.score += Math.floor(Math.random() * 500 + 200); }
        else p.combo = 0;
      }
    });

    checkAllAnswered(data.pin);
  });

  socket.on('getLeaderboard', () => {
    socket.emit('leaderboardData', buildLeaderboardPayload());
  });

  socket.on('disconnect', () => {
    connectedSockets.delete(socket.id);
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
