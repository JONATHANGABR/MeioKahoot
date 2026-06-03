/* MeioKahoot — Game.js v5.0 (sem combo) */
const GameUI = (() => {
  let _picked = -1, _confirmed = false, _already = false;
  let _score = 0, _correct = 0, _total = 0;
  let _qid = null, _lastCorrect = -1, _waitingResult = false;
  let _active = false; // flag: estamos em jogo?

  function onQuestion(data) {
    _picked = -1; _confirmed = false; _already = data.alreadyAnswered || false;
    _waitingResult = false; _lastCorrect = -1;
    _qid = data.qid; _total++;
    _active = true;

    const ov = document.getElementById('result-overlay');
    if (ov) ov.classList.remove('show');

    UI.renderQuestion(data, data.n, data.total);
    UI.syncTimer(data.serverNow, data.deadlineAt, _onTimeout);
    Sounds.stop('timer'); Sounds.play('timer', true);

    if (_already) _lock('Você já respondeu');
    UI.showPage('p-game');
  }

  function pick(idx) {
    if (_confirmed || _already || !_active) return;
    Sounds.play('click');
    _picked = idx;
    for (let i = 0; i < 4; i++) document.getElementById(`ans-${i}`)?.classList.remove('picked');
    document.getElementById(`ans-${idx}`)?.classList.add('picked');
    const st = document.getElementById('ans-status');
    const cf = document.getElementById('btn-confirm');
    if (st) st.textContent = 'Opção ' + (idx + 1) + ' — pode trocar';
    if (cf) cf.disabled = false;
  }

  function confirm() {
    if (_confirmed || _picked < 0 || _already || !_active) return;
    _confirmed = true;
    Sounds.stop('timer');
    Sounds.play('click');
    const st = document.getElementById('ans-status');
    const cf = document.getElementById('btn-confirm');
    if (st) st.textContent = 'Aguardando...';
    if (cf) { cf.disabled = true; cf.textContent = 'Enviado ✓'; }
    SocketClient.sendAnswer(_picked);
  }

  function _onTimeout() {
    if (!_active) return; // se já saiu, não faz nada
    Sounds.stop('timer');
    _lock('Tempo esgotado');
    if (!_confirmed) { _confirmed = true; SocketClient.sendAnswer(-1); }
  }

  function onReveal(data) {
    if (!_active) return;
    UI.stopTimer(); Sounds.stop('timer');
    UI.revealAnswer(data.correct);
    _lastCorrect = data.correct;
    const was = _picked === data.correct;
    if (was) { Sounds.play('correct'); _correct++; }
    else     { Sounds.play('wrong'); }
    if (!_waitingResult) {
      UI.showResult(was, 0);
    }
    _waitingResult = true;
  }

  function onScoreSync(data) {
    if (!_active) return;
    _waitingResult = false;
    _score = data.totalScore || 0;
    const pts = data.earned || 0;
    const was = _lastCorrect >= 0 && _picked === _lastCorrect;

    UI.updateScore(_score);
    UI.showResult(was, pts);
  }

  function onGameOver(rank) {
    Sounds.stopAll(); Sounds.play('win'); UI.stopTimer();
    Profile.recordMatch({ score: _score, correct: _correct, total: _total, comboMax: 0 });
    _reset();
    Podium.show(rank);
  }

  function _reset() {
    _picked = -1; _confirmed = false; _waitingResult = false; _lastCorrect = -1;
    _score = 0; _correct = 0; _total = 0; _qid = null;
    _active = false;
  }

  /* Chamado pelo logout — para tudo imediatamente */
  function forceReset() {
    _reset();
    UI.stopTimer();
    UI.hideResult();
  }

  function _lock(msg) {
    for (let i = 0; i < 4; i++) { const b = document.getElementById(`ans-${i}`); if (b) b.disabled = true; }
    const st = document.getElementById('ans-status');
    const cf = document.getElementById('btn-confirm');
    if (st) st.textContent = msg;
    if (cf) cf.disabled = true;
  }

  return { pick, confirm, onQuestion, onReveal, onScoreSync, onGameOver, forceReset };
})();

/* ── Pódio ───────────────────────────────────────────────── */
const Podium = (() => {

  function show(rank) {
    const sorted = [...rank].sort((a, b) => (b.score || 0) - (a.score || 0));
    const el = document.getElementById('modal-podium');
    if (!el) return;

    _buildTop3(sorted);
    _buildRest(sorted);
    _buildActions();

    el.style.display = 'flex';
    setTimeout(() => _revealRest(), 400);
  }

  function hide() {
    const el = document.getElementById('modal-podium');
    if (el) el.style.display = 'none';
  }

  function _av(p, size) {
    const letter = (p.name?.[0] || '?').toUpperCase();
    const div = document.createElement('div');
    div.className = `pod-av ${size}`;
    if (p.photo) {
      const img = document.createElement('img');
      img.src = p.photo; img.onerror = () => { img.remove(); div.textContent = letter; };
      div.appendChild(img);
    } else {
      div.textContent = letter;
    }
    return div;
  }

  function _buildTop3(sorted) {
    const stage = document.getElementById('podium-top3');
    if (!stage) return;
    stage.innerHTML = '';

    const order  = [1, 0, 2];
    const bClass = ['b2', 'b1', 'b3'];
    const medals = ['🥈', '🥇', '🥉'];

    order.forEach((pos, vi) => {
      const p = sorted[pos];
      if (!p) return;

      const slot = document.createElement('div');
      slot.className = 'pod-slot';

      const avSize = pos === 0 ? 'sz-lg' : 'sz-md';
      slot.appendChild(_av(p, avSize));

      const blk = document.createElement('div');
      blk.className = `pod-block ${bClass[vi]}`;
      blk.innerHTML = `
        <span class="pod-medal">${medals[vi]}</span>
        <span class="pod-name">${p.name || '?'}${p.isBot ? ' 🤖' : ''}</span>
        <span class="pod-score">${(p.score || 0).toLocaleString('pt-BR')} pts</span>
      `;
      slot.appendChild(blk);
      stage.appendChild(slot);
    });
  }

  function _buildRest(sorted) {
    const list = document.getElementById('podium-rest');
    if (!list) return;
    list.innerHTML = '';
    sorted.slice(3).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pod-row';
      const av = _av(p, '');
      av.style.cssText = 'width:32px;height:32px;font-size:.82rem;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden;flex-shrink:0;';
      row.innerHTML = `<span class="pod-row-pos">#${i + 4}</span>`;
      row.appendChild(av);
      row.insertAdjacentHTML('beforeend', `
        <span class="pod-row-name">${p.name || 'Jogador'}${p.isBot ? ' 🤖' : ''}</span>
        <span class="pod-row-score">${(p.score || 0).toLocaleString('pt-BR')} pts</span>
      `);
      list.appendChild(row);
    });
  }

  function _revealRest() {
    document.querySelectorAll('.pod-row').forEach((row, i) => {
      setTimeout(() => row.classList.add('in'), i * 150);
    });
  }

  function _buildActions() {
    const wrap = document.getElementById('podium-actions');
    if (!wrap) return;
    wrap.innerHTML = '';

    const play = document.createElement('button');
    play.className = 'pod-action primary';
    play.textContent = 'Jogar de novo';
    play.onclick = () => { Podium.hide(); Sounds.stopAll(); Sounds.playBg('lobby'); UI.showPage('p-home'); };

    const leave = document.createElement('button');
    leave.className = 'pod-action ghost';
    leave.textContent = 'Sair';
    leave.onclick = () => { Podium.hide(); Sounds.stopAll(); Sounds.playBg('lobby'); UI.showPage('p-home'); };

    wrap.appendChild(play);
    wrap.appendChild(leave);
  }

  return { show, hide };
})();

/* ── HomeUI ──────────────────────────────────────────────── */
const HomeUI = (() => {
  let _theme = 'ciencias';

  function showJoin() {
    hideCreateMenu();
    UI.showPage('p-join');
    Sounds.play('click');
    setTimeout(() => document.getElementById('join-pin')?.focus(), 100);
  }

  function joinRoom() {
    const pin = document.getElementById('join-pin')?.value?.trim();
    if (!pin || pin.length !== 6) { UI.toast('PIN deve ter 6 dígitos'); return; }
    Sounds.play('click');
    localStorage.setItem('mk_lastPin', pin);
    SocketClient.joinRoom(pin);
  }

  function rejoin() {
    const pin = localStorage.getItem('mk_lastPin');
    if (!pin) return;
    Sounds.play('click');
    SocketClient.joinRoom(pin);
  }

  function showCreateMenu() {
    Modal.open('modal-create');
  }

  function hideCreateMenu() {
    Modal.close('modal-create');
  }

  function createRoom(theme) {
    _theme = theme; Sounds.play('click');
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.theme-btn[data-theme="${theme}"]`)?.classList.add('active');
    Modal.close('modal-create');
    SocketClient.createRoom(theme);
  }

  function createBot() {
    Sounds.play('click');
    Modal.close('modal-create');
    SocketClient.createRoomWithBots(_theme);
  }

  function startGame() { Sounds.play('click'); SocketClient.startGame(); }

  function setDiff(btn, diff) {
    document.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function goRanking() {
    Sounds.play('click');
    RankingBoard.load();
    UI.showPage('p-rank');
  }

  function checkRejoin() {
    const pin = localStorage.getItem('mk_lastPin');
    const btn = document.getElementById('btn-rejoin');
    if (btn) btn.style.display = pin ? 'block' : 'none';
  }

  return { showJoin, joinRoom, rejoin, showCreateMenu, hideCreateMenu, createRoom, createBot, startGame, setDiff, goRanking, checkRejoin };
})();

/* ── RankingBoard ────────────────────────────────────────── */
const RankingBoard = (() => {
  let _tab = 'best', _data = null;

  function load() { SocketClient.loadRanking(); }

  function render(payload) {
    _data = payload;
    const st = payload.stats || {};
    _set('rb-best',    (st.bestScore || 0).toLocaleString('pt-BR'));
    _set('rb-player',   st.bestPlayer  || '—');
    _set('rb-players',  st.players     || '—');
    _set('rb-records',  st.records     || '—');
    _list(_tab === 'best' ? payload.best : payload.recent);
  }

  function setTab(tab, btn) {
    _tab = tab;
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (_data) _list(_tab === 'best' ? _data.best : _data.recent);
    Sounds.play('click');
  }

  function _list(list) {
    const el = document.getElementById('lb-board');
    if (!el) return;
    if (!list?.length) { el.innerHTML = '<p class="muted center">Nenhum registro ainda.</p>'; return; }
    el.innerHTML = list.map((p, i) => {
      const cls = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';
      const med = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const av  = p.photo
        ? `<img src="${p.photo}" alt="" onerror="this.outerHTML='<div class=rank-avatar>${(p.name?.[0]||'?').toUpperCase()}</div>'"/>`
        : `<div class="rank-avatar">${(p.name?.[0] || '?').toUpperCase()}</div>`;
      return `<div class="rank-row ${cls}">
        <span class="rank-pos">${med}</span>
        <div class="rank-player">${av}<div>
          <strong>${p.name || 'Jogador'}</strong>
          <span>${p.theme ? 'Tema: ' + p.theme : ''}</span>
        </div></div>
        <div class="rank-score">${(p.score||0).toLocaleString('pt-BR')}<span>pts</span></div>
      </div>`;
    }).join('');
  }

  function _set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  return { load, render, setTab };
})();
