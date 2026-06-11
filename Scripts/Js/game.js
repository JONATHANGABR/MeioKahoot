/* MeioKahoot — Game.js v6.0 (Pódio Epic + Animações Kahoot) */
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
    if (!_active) return;
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
    Sounds.stopAll();
    UI.stopTimer();
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

/* ══════════════════════════════════════════════════════════
   PÓDIO EPIC — Kahoot-themed com animações, fogos, confetti
   ══════════════════════════════════════════════════════════ */
const Podium = (() => {
  let _lastRank = [];

  function show(rank, stats) {
    const sorted = [...rank].sort((a, b) => (a.position || 999) - (b.position || 999) || (b.score || 0) - (a.score || 0));
    _lastRank = sorted;
    const page = document.getElementById('p-podium');
    if (!page) return;

    // Esconde o HUD para tela cheia
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';

    // Gera estrelas no fundo
    _generateStars();

    // Título
    const title = document.getElementById('podium-title');
    if (title) {
      const topTie = stats?.topTie || sorted.filter(p => (p.score || 0) === (sorted[0]?.score || -1)).length > 1;
      title.textContent = topTie ? '🏆 Empate! 🏆' : '🏆 Resultado Final 🏆';
      title.classList.remove('visible');
    }

    // Stage (Top 3)
    const stage = document.getElementById('podium-stage');
    if (stage) {
      stage.innerHTML = '';
      const order = [2, 1, 0]; // 3º, 2º, 1º
      const bClass = ['b3', 'b2', 'b1'];
      const medals = ['🥉', '🥈', '🥇'];
      
      order.forEach((posIdx, i) => {
        const p = sorted[posIdx];
        if (!p) return;

        const slot = document.createElement('div');
        slot.className = 'pod-winner-slot';
        if (posIdx === 0) slot.classList.add('champion');
        
        // Avatar
        const av = document.createElement('div');
        av.className = 'pod-winner-av';
        av.id = `pod-av-${posIdx}`;
        if (p.photo) {
          const img = document.createElement('img');
          img.src = p.photo;
          img.alt = p.name || '';
          av.appendChild(img);
        } else {
          av.textContent = (p.name?.[0] || '?').toUpperCase();
        }

        // Block (pedestal)
        const block = document.createElement('div');
        block.className = `pod-winner-block ${bClass[i]}`;
        
        // Medalha
        const medal = document.createElement('div');
        medal.className = 'pod-medal';
        medal.textContent = medals[i];
        
        const nameEl = document.createElement('div');
        nameEl.className = 'pod-winner-name';
        nameEl.textContent = p.name || 'Jogador';
        
        const scoreEl = document.createElement('div');
        scoreEl.className = 'pod-winner-score';
        scoreEl.id = `pod-score-${posIdx}`;
        scoreEl.textContent = '0 pts';

        block.appendChild(medal);
        block.appendChild(nameEl);
        block.appendChild(scoreEl);
        slot.appendChild(av);
        slot.appendChild(block);
        stage.appendChild(slot);

        // Animação sequencial com bounce
        setTimeout(() => {
          slot.classList.add('show');
          // Score count up animado
          const scoreTarget = p.score || 0;
          KahootAnim.scoreCountUp(scoreEl, 0, scoreTarget, 1500);
          
          // Se for champion, adiciona coroa e efeitos extras
          if (posIdx === 0) {
            setTimeout(() => {
              KahootAnim.crownDrop(av, 200);
              KahootAnim.pulseRing(av, '#fbbf24', 3);
            }, 600);
          }
        }, i * 600 + 400);
      });
    }

    // Lista de posições 4º+
    const rankList = document.getElementById('podium-rank-list');
    if (rankList) {
      rankList.innerHTML = '';
      sorted.slice(3).forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'podium-rank-row';
        row.innerHTML = `
          <span class="podium-rank-pos">#${i + 4}</span>
          <span class="podium-rank-name">${p.name || 'Jogador'}</span>
          <span class="podium-rank-score">${(p.score || 0).toLocaleString('pt-BR')} pts</span>
        `;
        rankList.appendChild(row);
        setTimeout(() => row.classList.add('visible'), i * 100 + 2800);
      });
    }

    // Stats Grid
    const statsEl = document.getElementById('podium-stats');
    if (statsEl) {
      const humans = sorted.filter(p => !p.isBot);
      const totalAnswers = stats?.totalAnswers ?? humans.reduce((s, p) => s + (p.answers || 0), 0);
      const totalCorrect = stats?.totalCorrect ?? humans.reduce((s, p) => s + (p.correct || 0), 0);
      const accuracy = stats?.accuracy ?? (totalAnswers ? Math.round(totalCorrect / totalAnswers * 100) : 0);
      
      statsEl.innerHTML = `
        <div class="pod-stat-item"><label>Jogadores</label><strong>${sorted.length}</strong></div>
        <div class="pod-stat-item"><label>Perguntas</label><strong>${stats?.questions || '—'}</strong></div>
        <div class="pod-stat-item"><label>Acertos</label><strong>${totalCorrect}/${totalAnswers}</strong></div>
        <div class="pod-stat-item"><label>Precisão</label><strong>${accuracy}%</strong></div>
      `;

      // Anima as stats com stagger
      setTimeout(() => {
        const items = statsEl.querySelectorAll('.pod-stat-item');
        KahootAnim.staggerReveal(items, 120);
      }, 3000);
    }

    // Mostra a página
    UI.showPage('p-podium');

    // ── SEQUÊNCIA DE ANIMAÇÕES ──
    
    // 1. Título aparece
    setTimeout(() => {
      title?.classList.add('visible');
    }, 200);

    // 2. Toca som de vitória
    setTimeout(() => {
      Sounds.play('correct');
    }, 400);

    // 3. Confetti burst principal
    setTimeout(() => {
      KahootAnim.confettiBurst({ count: 150, duration: 5000 });
    }, 1500);

    // 4. Flash de tela verde
    setTimeout(() => {
      KahootAnim.screenFlash('rgba(34,197,94,0.3)', 500);
    }, 1200);

    // 5. Partículas eco
    setTimeout(() => {
      const champion = stage?.querySelector('.champion');
      if (champion) {
        KahootAnim.spawnParticles(champion, { count: 15, emoji: ['🌿','⭐','✨','🏆'], spreadRadius: 150 });
      }
    }, 2000);

    // 6. Fogos de artifício
    setTimeout(() => {
      KahootAnim.fireworks(4000);
    }, 2500);

    // 7. Confetti extra para manter a vibe
    setTimeout(() => {
      KahootAnim.confettiBurst({ count: 80, duration: 3000 });
    }, 4000);
  }

  function _generateStars() {
    const container = document.getElementById('pod-stars');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 50; i++) {
      const star = document.createElement('div');
      star.className = 'pod-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      star.style.animationDelay = Math.random() * 3 + 's';
      star.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
      star.style.width = (Math.random() * 3 + 1) + 'px';
      star.style.height = star.style.width;
      container.appendChild(star);
    }
  }

  function playAgain() {
    _restoreHud();
    Sounds.stopAll();
    Sounds.play('click');
    if (SocketClient._pin && SocketClient._isHost) {
      UI.showPage('p-lobby');
      Lobby.showHostControls(true);
      Sounds.playBg('lobby');
    } else {
      UI.showPage('p-home');
      Sounds.playBg('lobby');
    }
  }

  function exit() {
    _restoreHud();
    SocketClient.leaveGame();
    Sounds.stopAll();
    Sounds.play('click');
    UI.showPage('p-home');
    Sounds.playBg('lobby');
  }

  function hide() {
    _restoreHud();
    UI.showPage('p-home');
    Sounds.stopAll();
    Sounds.playBg('lobby');
  }

  function _restoreHud() {
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = '';
    // Garante que o botão de device fica visível após pódio (já é fixo, mas garante)
    const dev = document.getElementById('h-device');
    if (dev) dev.style.display = 'inline-flex';
  }

  return { show, hide, playAgain, exit };
})();

/* ── HomeUI ──────────────────────────────────────────────── */
const HomeUI = (() => {
  let _theme = 'unificado', _diff = 'facil';

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
    _diff = diff;
    SocketClient.setDifficulty?.(_diff);
    document.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const msg = {
      facil: '🟢 Fácil: 6 perguntas simples',
      medio: '🟡 Médio: 12 perguntas fáceis + médias',
      dificil: '🟠 Difícil: 30 perguntas incluindo difíceis com imagens',
      extremo: '🔴 Extremo: TODAS as 126 perguntas — 61 difíceis!'
    }[diff] || 'Dificuldade alterada';
    UI.toast(msg);
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
      return `<div class="rank-row ${cls}" style="animation-delay:${i * 50}ms">
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
