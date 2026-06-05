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
    
    // DETECÇÃO DE FIM DE JOGO
    const isLast = data.isLastQuestion === true || (data.n && data.total && data.n >= data.total);
    if (isLast) {
      setTimeout(() => { if (_active) GameUI.onGameOver(data.rank || []); }, 2200);
    }
  }

  function onGameOver(payload) {
    const rank = Array.isArray(payload) ? payload : (payload?.rank || []);
    const stats = Array.isArray(payload) ? null : (payload?.stats || null);
    Sounds.stopAll(); Sounds.play('win'); UI.stopTimer();
    UI.hideResult();
    Profile.recordMatch({ score: _score, correct: _correct, total: _total, comboMax: 0 });
    _reset();
    Podium.show(rank, stats);
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

  function show(rank, stats) {
    const sorted = [...rank].sort((a, b) => (a.position || 999) - (b.position || 999) || (b.score || 0) - (a.score || 0));
    const el = document.getElementById('modal-podium');
    if (!el) return;

    _setTitle(sorted, stats);
    _buildTop3(sorted);
    _buildStats(sorted, stats);
    _buildRest(sorted);
    _buildActions();

    el.style.display = 'flex';
    setTimeout(() => _revealRest(), 400);
  }

  function hide() {
    const el = document.getElementById('modal-podium');
    if (el) el.style.display = 'none';
  }


  function _setTitle(sorted, stats) {
    const title = document.getElementById('podium-title');
    if (!title) return;
    const topTie = stats?.topTie || sorted.filter(p => (p.score || 0) === (sorted[0]?.score || -1)).length > 1;
    title.textContent = topTie ? 'Resultado Final — Empate!' : 'Resultado Final';
  }

  function _ensureStatsBox() {
    let box = document.getElementById('podium-stats');
    const stage = document.getElementById('podium-top3');
    if (!box && stage) {
      box = document.createElement('div');
      box.id = 'podium-stats';
      box.className = 'podium-stats';
      stage.insertAdjacentElement('afterend', box);
    }
    return box;
  }

  function _buildStats(sorted, stats) {
    const box = _ensureStatsBox();
    if (!box) return;

    const humans = sorted.filter(p => !p.isBot);
    const totalAnswers = stats?.totalAnswers ?? humans.reduce((s, p) => s + (p.answers || 0), 0);
    const totalCorrect = stats?.totalCorrect ?? humans.reduce((s, p) => s + (p.correct || 0), 0);
    const accuracy = stats?.accuracy ?? (totalAnswers ? Math.round(totalCorrect / totalAnswers * 100) : 0);
    const questions = stats?.questions ?? '—';
    const topTie = stats?.topTie || sorted.filter(p => (p.score || 0) === (sorted[0]?.score || -1)).length > 1;

    box.innerHTML = `
      ${topTie ? '<div class="podium-tie-banner" style="grid-column:1/-1">🤝 Empate detectado no placar!</div>' : ''}
      <div class="podium-stat"><label>Jogadores</label><strong>${sorted.length}</strong></div>
      <div class="podium-stat"><label>Perguntas</label><strong>${questions}</strong></div>
      <div class="podium-stat"><label>Acertos</label><strong>${totalCorrect}/${totalAnswers}</strong></div>
      <div class="podium-stat"><label>Precisão</label><strong>${accuracy}%</strong></div>
    `;
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
        <span class="pod-medal">${p.tie ? '🤝' : medals[vi]}</span>
        <span class="pod-position">${p.position ? p.position + 'º lugar' : ''}</span>
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
      row.className = 'pod-row' + (p.tie ? ' tie' : '');
      const av = _av(p, '');
      av.style.cssText = 'width:32px;height:32px;font-size:.82rem;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden;flex-shrink:0;';
      row.innerHTML = `<span class="pod-row-pos">#${p.position || (i + 4)}</span>`;
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
  let _theme = 'ciencias', _diff = 'normal';

  function showJoin() {
    hideCreateMenu();
    UI.showPage('p-join');
    Sounds.play('click');
    RoomsBrowser.load();
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
    _diff = diff === 'hard' ? 'hard' : 'normal';
    SocketClient.setDifficulty?.(_diff);
    document.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    UI.toast(_diff === 'hard' ? 'Modo difícil: mais questões (12)' : 'Modo normal: menos questões (6)');
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

/* ── Salas abertas + Convites ───────────────────────────────── */
const RoomsBrowser = (() => {
  let _data = { rooms: [] };

  function load() { SocketClient.loadRooms(); }

  function render(payload) {
    _data = payload || { rooms: [] };
    const el = document.getElementById('rooms-list');
    if (!el) return;
    const rooms = _data.rooms || [];
    if (!rooms.length) {
      el.innerHTML = '<p class="room-empty">Nenhuma sala aberta agora.</p>';
      return;
    }
    el.innerHTML = rooms.map(r => {
      const friends = r.friends?.length ? `<span class="room-friends">👥 ${r.friends.join(', ')}</span>` : '';
      return `<div class="room-row ${r.isFriendRoom ? 'friend-room' : ''}">
        <div class="room-main">
          <strong>${r.isFriendRoom ? '⭐ ' : ''}${r.pin}</strong>
          <span>Host: ${_esc(r.host || 'Host')} · Tema: ${_esc(r.theme || 'ciencias')}</span>
          ${friends}
        </div>
        <div class="room-side"><span>${r.players || 0} jogadores</span><button onclick="RoomsBrowser.join('${r.pin}')">Entrar</button></div>
      </div>`;
    }).join('');
  }

  function join(pin) {
    const inp = document.getElementById('join-pin');
    if (inp) inp.value = pin;
    SocketClient.joinRoom(pin);
    Sounds.play('click');
  }

  function _esc(s) { return String(s).replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }
  return { load, render, join };
})();

const RoomInvites = (() => {
  function show(data) {
    const msg = `${data.from} te convidou para a sala ${data.pin} (${data.theme || 'tema'}). Entrar agora?`;
    if (confirm(msg)) {
      UI.showPage('p-join');
      RoomsBrowser.join(data.pin);
    } else {
      UI.toast(`Convite de ${data.from} recebido.`);
    }
    Sounds.play('click');
  }
  return { show };
})();

/* ── RankingBoard ────────────────────────────────────────── */
const RankingBoard = (() => {
  let _tab = 'best', _data = null;

  function load() { SocketClient.loadRanking(); }

  function render(payload) {
    _data = payload || {};
    const st = _data.stats || {};
    _set('rb-best',    (st.bestScore || 0).toLocaleString('pt-BR'));
    _set('rb-player',  st.bestPlayer  || '—');
    _set('rb-players', st.players     || '—');
    _set('rb-records', st.records     || '—');
    _set('rb-avg',     (st.avgScore || 0).toLocaleString('pt-BR'));
    _set('rb-podiums', st.totalPodiums || '0');
    _set('rb-themes',  st.activeThemes || '0');
    _set('rb-wins',    st.totalWins || '0');
    _fillThemes();
    _renderMine();
    applyFilters();
  }

  function setTab(tab, btn) {
    _tab = tab;
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    applyFilters();
    Sounds.play('click');
  }

  function applyFilters() {
    if (!_data) return;
    let list = _getCurrentList();
    const q = document.getElementById('rank-search')?.value?.trim()?.toLowerCase() || '';
    const theme = document.getElementById('rank-theme')?.value || '';

    if (q) list = list.filter(p => String(p.name || p.theme || '').toLowerCase().includes(q));
    if (theme && _tab !== 'themes') list = list.filter(p => (p.theme || p.favoriteTheme || '') === theme || p.themes?.[theme]);
    _list(list);
  }

  function _getCurrentList() {
    if (_tab === 'wins') return _data.wins || [];
    if (_tab === 'avg') return _data.avg || [];
    if (_tab === 'podiums') return _data.podiums || [];
    if (_tab === 'themes') return _data.themes || [];
    if (_tab === 'recent') return _data.recent || [];
    return _data.best || [];
  }

  function _fillThemes() {
    const sel = document.getElementById('rank-theme');
    if (!sel) return;
    const cur = sel.value;
    const themes = _data.themes || [];
    sel.innerHTML = '<option value="">Todos os temas</option>' + themes.map(t => `<option value="${_esc(t.theme)}">${_esc(_themeName(t.theme))}</option>`).join('');
    sel.value = cur;
  }

  function _renderMine() {
    const el = document.getElementById('rank-me');
    if (!el) return;
    const me = Profile.getName?.()?.toLowerCase();
    const all = _data.best || [];
    const p = all.find(x => String(x.name || '').toLowerCase() === me);
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'grid';
    el.innerHTML = `
      <div><label>Meu melhor</label><strong>${(p.bestScore || p.score || 0).toLocaleString('pt-BR')} pts</strong></div>
      <div><label>Partidas</label><strong>${p.games || 0}</strong></div>
      <div><label>Vitórias</label><strong>${p.wins || 0}</strong></div>
      <div><label>Consistência</label><strong>${p.consistency || 0}%</strong></div>
    `;
  }

  function _list(list) {
    const el = document.getElementById('lb-board');
    if (!el) return;
    if (!list?.length) { el.innerHTML = '<p class="muted center">Nenhum registro encontrado.</p>'; return; }

    if (_tab === 'themes') {
      el.innerHTML = list.map((t, i) => `<div class="rank-row theme-rank-row ${i < 3 ? 'top-' + (i + 1) : ''}">
        <span class="rank-pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</span>
        <div class="rank-player"><div class="rank-avatar">${_themeIcon(t.theme)}</div><div>
          <strong>${_themeName(t.theme)}</strong>
          <span>${t.records || 0} registros · líder: ${_esc(t.bestPlayer || '---')}</span>
        </div></div>
        <div class="rank-score">${(t.bestScore || 0).toLocaleString('pt-BR')}<span>recorde</span></div>
      </div>`).join('');
      return;
    }

    el.innerHTML = list.map((p, i) => {
      const cls = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';
      const med = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const av  = p.photo
        ? `<img src="${p.photo}" alt="" onerror="this.outerHTML='<div class=rank-avatar>${(p.name?.[0]||'?').toUpperCase()}</div>'"/>`
        : `<div class="rank-avatar">${(p.name?.[0] || '?').toUpperCase()}</div>`;
      const score = p.bestScore || p.score || 0;
      const badges = _badges(p);
      const meta = p.games
        ? `<span>🎮 ${p.games} · 🏆 ${p.wins || 0} · 🥉 ${p.podiums || 0} · média ${(p.avgScore || 0).toLocaleString('pt-BR')} · tema ${_themeName(p.favoriteTheme || p.theme || '')}</span>`
        : `<span>${p.theme ? 'Tema: ' + _themeName(p.theme) : ''}${p.tie ? ' · 🤝 empate' : ''}${p.date ? ' · ' + new Date(p.date).toLocaleDateString('pt-BR') : ''}</span>`;
      return `<div class="rank-row ${cls}">
        <span class="rank-pos">${p.position ? '#' + p.position : med}</span>
        <div class="rank-player">${av}<div>
          <strong>${_esc(p.name || 'Jogador')} ${badges}</strong>
          ${meta}
        </div></div>
        <div class="rank-score">${score.toLocaleString('pt-BR')}<span>${_scoreLabel()}</span></div>
      </div>`;
    }).join('');
  }

  function _scoreLabel() {
    if (_tab === 'wins') return 'melhor';
    if (_tab === 'avg') return 'média/top';
    if (_tab === 'podiums') return 'melhor';
    return 'pts';
  }
  function _badges(p) {
    const b = [];
    if ((p.wins || 0) >= 5) b.push('<span class="rank-badge">Lenda</span>');
    else if ((p.wins || 0) >= 1) b.push('<span class="rank-badge">Vencedor</span>');
    if ((p.consistency || 0) >= 60 && (p.games || 0) >= 3) b.push('<span class="rank-badge green">Constante</span>');
    if (p.ties) b.push('<span class="rank-badge amber">Empates</span>');
    return b.join(' ');
  }
  function _themeName(t) {
    return ({ ciencias:'Ciências', reciclagem:'Reciclagem', agua:'Água', clima:'Clima', energia:'Energia', sustentabilidade:'Sustentabilidade' }[t] || t || 'Geral');
  }
  function _themeIcon(t) {
    return ({ ciencias:'🔬', reciclagem:'♻️', agua:'💧', clima:'🌡', energia:'⚡', sustentabilidade:'🌿' }[t] || '🏆');
  }
  function _esc(s) { return String(s).replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }
  function _set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  return { load, render, setTab, applyFilters };
})();
