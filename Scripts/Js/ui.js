/* MeioKahoot — UI.js v4.0 */
const UI = {
  _cur: null,

  showPage(id) {
    const next = document.getElementById(id);
    if (!next) return;
    if (this._cur) {
      const prev = document.getElementById(this._cur);
      if (prev) { prev.classList.remove('active'); prev.style.display = 'none'; }
    }
    next.style.display = 'flex';
    void next.offsetWidth;
    next.classList.add('active');
    this._cur = id;
    this._ctx(id);
  },

  _ctx(id) {
    const hide = (...ids) => ids.forEach(i => { const e = document.getElementById(i); if (e) e.style.display = 'none'; });
    const show = (i, d = 'inline-flex') => { const e = document.getElementById(i); if (e) e.style.display = d; };
    const set  = (i, t) => { const e = document.getElementById(i); if (e) e.textContent = t; };

    // Esconde resultado da rodada anterior
    const ro = document.getElementById('result-overlay');
    if (ro) ro.classList.remove('show');

    // Reset chips
    hide('h-device','h-phase','h-players','h-pin','timer-bar','timer-circle-wrap','score-pill','combo-pill');

    // Logo: só em auth e home
    const logo = document.getElementById('hud-logo');
    if (logo) logo.style.display = (id === 'p-auth' || id === 'p-home') ? '' : 'none';

    // Botão amigos: só na home
    const fb = document.getElementById('friends-btn');
    if (fb) fb.style.display = (id === 'p-home') ? 'flex' : 'none';

    if (id === 'p-lobby') {
      show('h-device'); show('h-players'); show('h-pin');
      set('h-phase', '🏠 Lobby'); show('h-phase');
    }
    if (id === 'p-game') {
      show('h-device'); show('h-pin');
      set('h-phase', '🎮 Jogo'); show('h-phase');
      show('timer-bar', 'block');
      show('timer-circle-wrap', 'flex');
      show('score-pill', 'flex');
    }
  },

  // ── Timer ──────────────────────────────────────────────────
  _int: null, _to: null,

  startTimer(seconds, onEnd) {
    const fill = document.getElementById('timer-fill');
    const num  = document.getElementById('timer-num');
    const ring = document.getElementById('timer-ring');
    if (!fill) return;
    clearInterval(this._int); clearTimeout(this._to);

    fill.style.transition = 'none';
    fill.style.width = '100%';
    fill.className = 'timer-fill';
    if (ring) { ring.style.strokeDasharray = '100 100'; ring.style.strokeDashoffset = '0'; ring.className = 'tc-ring'; }
    if (num) num.textContent = seconds;

    const start = Date.now(), total = seconds * 1000;
    this._int = setInterval(() => {
      const elapsed = Date.now() - start;
      const rem = Math.max(0, seconds - Math.floor(elapsed / 1000));
      const pct = Math.max(0, (total - elapsed) / total * 100);

      fill.style.transition = 'width .25s linear';
      fill.style.width = pct + '%';
      if (num) num.textContent = rem;

      const cls = pct <= 20 ? 'urgent' : pct <= 40 ? 'warn' : '';
      fill.className = 'timer-fill' + (cls ? ' ' + cls : '');
      if (ring) {
        ring.className = 'tc-ring' + (cls ? ' ' + cls : '');
        ring.style.strokeDashoffset = 100 - pct;
      }

      if (rem <= 0) clearInterval(this._int);
    }, 250);

    this._to = setTimeout(() => {
      clearInterval(this._int);
      this.stopTimer();
      onEnd?.();
    }, total);
  },

  syncTimer(serverNow, deadlineAt, onEnd) {
    const rem = Math.max(0, Math.round((deadlineAt - Date.now()) / 1000));
    this.startTimer(rem, onEnd);
  },

  stopTimer() {
    clearInterval(this._int); clearTimeout(this._to);
    const fill = document.getElementById('timer-fill');
    const num  = document.getElementById('timer-num');
    const ring = document.getElementById('timer-ring');
    if (fill) { fill.style.width = '0'; fill.className = 'timer-fill'; }
    if (num)  num.textContent = '';
    if (ring) { ring.style.strokeDashoffset = '100'; ring.className = 'tc-ring'; }
  },

  // ── Score ──────────────────────────────────────────────────
  updateScore(score) {
    const el   = document.getElementById('score-num');
    const pill = document.getElementById('score-pill');
    if (el) el.textContent = score.toLocaleString('pt-BR');
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  },

  // ── Resultado overlay — SEM delay automático
  //    O servidor decide quando vem a próxima questão.
  //    O overlay fica visível ATÉ a próxima questão chegar
  //    (onQuestion() vai escondê-lo automaticamente).
  showResult(correct, pts, combo) {
    const ov    = document.getElementById('result-overlay');
    const icon  = document.getElementById('result-icon');
    const label = document.getElementById('result-label');
    const ptsEl = document.getElementById('result-pts');
    const cmbEl = document.getElementById('result-combo');
    if (!ov) return;

    ov.className = 'result-overlay show ' + (correct ? 'correct' : 'wrong');
    if (icon)  icon.textContent  = correct ? '✔' : '✗';
    if (label) label.textContent = correct ? 'Correto!' : 'Incorreto!';
    if (ptsEl) ptsEl.textContent = (correct && pts > 0) ? `+${pts.toLocaleString('pt-BR')} pts` : '';
    if (cmbEl) cmbEl.textContent = (correct && combo >= 2) ? `🔥 Combo x${combo}` : '';

    if (navigator.vibrate) navigator.vibrate(correct ? [40] : [80, 40, 80]);

    // NÃO tem setTimeout aqui — o overlay fica até a próxima questão.
    // Isso faz a transição parecer imediata e conectada.
  },

  hideResult() {
    const ov = document.getElementById('result-overlay');
    if (ov) ov.classList.remove('show');
  },

  flash(correct) { this.showResult(correct, 0, 0); },

  // ── Combo pill ──────────────────────────────────────────────
  showCombo(n) {
    const el  = document.getElementById('combo-pill');
    const txt = document.getElementById('combo-txt');
    if (!el) return;
    if (txt) txt.textContent = 'x' + n;
    el.style.display = 'flex';
    clearTimeout(this._comboTO);
    this._comboTO = setTimeout(() => { el.style.display = 'none'; }, 2000);
  },

  // ── Questão ────────────────────────────────────────────────
  renderQuestion(q, n, total) {
    // Esconde resultado IMEDIATAMENTE ao chegar nova questão
    this.hideResult();

    const txt  = document.getElementById('q-txt');
    const num  = document.getElementById('q-num');
    const cat  = document.getElementById('q-cat');
    const prog = document.getElementById('q-progress');

    if (txt) {
      txt.textContent = q.question;
      const box = txt.closest('.q-box');
      if (box) { box.classList.remove('active'); void box.offsetWidth; box.classList.add('active'); }
    }
    if (num)  num.textContent  = `${n}/${total}`;
    if (cat)  cat.textContent  = q.category || 'Questão';
    if (prog) prog.style.width = `${n / total * 100}%`;

    ['al-0','al-1','al-2','al-3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = q.options?.[i] || '';
    });
    ['ans-0','ans-1','ans-2','ans-3'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = false; b.className = b.className.replace(/\b(picked|correct|wrong)\b/g, '').trim(); }
    });

    const st = document.getElementById('ans-status');
    const cf = document.getElementById('btn-confirm');
    if (st) st.textContent = 'Escolha uma resposta';
    if (cf) { cf.disabled = true; cf.textContent = 'Confirmar'; }
  },

  revealAnswer(idx) {
    for (let i = 0; i < 4; i++) {
      const b = document.getElementById(`ans-${i}`);
      if (!b) continue;
      b.disabled = true;
      b.classList.add(i === idx ? 'correct' : 'wrong');
    }
    const cf = document.getElementById('btn-confirm');
    if (cf) cf.disabled = true;
  },

  // ── PIN — separado em dígitos ──────────────────────────────
  setPin(pin) {
    // HUD chip (compacto)
    const chip = document.getElementById('h-pin');
    if (chip) chip.textContent = pin;

    // Card do lobby (dígitos separados — nunca transborda)
    const digits = String(pin).padStart(6, '0').split('');
    digits.forEach((d, i) => {
      const el = document.getElementById(`pin-d${i}`);
      if (el) el.textContent = d;
    });
  },

  setPlayerCount(n) {
    const e = document.getElementById('h-players');
    if (e) e.textContent = '👥 ' + n;
  },

  setNetStatus(online) {
    const e = document.getElementById('net-badge');
    if (!e) return;
    e.textContent = online ? '● Online' : '● Offline';
    e.className   = 'net-badge' + (online ? '' : ' off');
  },

  // ── Toast ──────────────────────────────────────────────────
  toast(msg, dur = 2800) {
    let el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.style.display = 'none'; }, dur);
  },
};

/* Modal */
const Modal = {
  open(id) {
    const e = document.getElementById(id);
    if (!e) return;
    e.style.display = 'flex';
    Sounds.play('click');
  },
  close(id) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  },
};
