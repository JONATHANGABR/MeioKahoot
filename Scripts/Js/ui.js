/* MeioKahoot — UI.js v6.0 (com suporte a animações e pódio) */
const UI = {
  _cur: null,

  showPage(id) {
    const next = document.getElementById(id);
    if (!next) return;

    // Se vamos para o pódio, esconde o HUD
    if (id === 'p-podium') {
      const hud = document.getElementById('hud');
      // Não esconde aqui, o Podium.show cuida disso
    }

    if (this._cur) {
      const prev = document.getElementById(this._cur);
      if (prev) { prev.classList.remove('active'); prev.style.display = 'none'; }
    }
    next.style.display = 'flex';
    // Trigger reflow para reiniciar a animação de transição
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
    hide('h-phase','h-players','h-pin','timer-bar','timer-circle-wrap','score-pill','lobby-sound-btn');

    // Logo: só em auth e home
    const logo = document.getElementById('hud-logo');
    if (logo) logo.style.display = (id === 'p-auth' || id === 'p-home') ? '' : 'none';

    // Botão amigos: só na home
    const fb = document.getElementById('friends-btn');
    if (fb) fb.style.display = (id === 'p-home') ? 'flex' : 'none';
    if (typeof Sounds !== 'undefined') Sounds.updateLobbyButton?.();

    // h-device sempre visível no HUD
    show('h-device');

    if (id === 'p-lobby') {
      show('h-players'); show('h-pin'); show('lobby-sound-btn', 'flex');
      set('h-phase', '🏠 Lobby'); show('h-phase');
    }
    if (id === 'p-game') {
      show('h-pin');
      set('h-phase', '🎮 Jogo'); show('h-phase');
      show('timer-bar', 'block');
      show('timer-circle-wrap', 'flex');
      show('score-pill', 'flex');
    }
    if (id === 'p-podium') {
      // Pódio gerencia seu próprio contexto, mas device fica visível
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
    
    const update = () => {
      const elapsed = Date.now() - start;
      const rem = Math.max(0, seconds - Math.floor(elapsed / 1000));
      const pct = Math.max(0, (total - elapsed) / total * 100);

      fill.style.width = pct + '%';
      if (num) num.textContent = rem;

      const cls = pct <= 20 ? 'urgent' : pct <= 40 ? 'warn' : '';
      if (fill.className !== 'timer-fill' + (cls ? ' ' + cls : '')) {
        fill.className = 'timer-fill' + (cls ? ' ' + cls : '');
        if (ring) ring.className = 'tc-ring' + (cls ? ' ' + cls : '');
      }
      if (ring) ring.style.strokeDashoffset = 100 - pct;

      if (elapsed < total) {
        this._int = requestAnimationFrame(update);
      } else {
        this.stopTimer();
        onEnd?.();
      }
    };

    this._int = requestAnimationFrame(update);
    this._to = setTimeout(() => {
      this.stopTimer();
      onEnd?.();
    }, total);
  },

  syncTimer(serverNow, deadlineAt, onEnd) {
    const rem = Math.max(0, Math.round((deadlineAt - Date.now()) / 1000));
    this.startTimer(rem, onEnd);
  },

  stopTimer() {
    if (this._int) cancelAnimationFrame(this._int);
    clearTimeout(this._to);
    this._int = null; this._to = null;
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
    if (!el) return;
    
    const current = parseInt(el.textContent.replace(/\./g, '')) || 0;
    const target = score;
    
    // Usa a animação do KahootAnim
    KahootAnim.scoreCountUp(el, current, target, 800);

    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  },

  // ── Resultado overlay ─────────────────────────────────────
  showResult(correct, pts) {
    const ov    = document.getElementById('result-overlay');
    const icon  = document.getElementById('result-icon');
    const label = document.getElementById('result-label');
    const ptsEl = document.getElementById('result-pts');
    const flash = document.getElementById('screen-flash');
    if (!ov) return;

    ov.className = 'result-overlay show ' + (correct ? 'correct' : 'wrong');
    if (icon)  icon.textContent  = correct ? '✔' : '✗';
    if (label) label.textContent = correct ? 'Correto!' : 'Incorreto!';

    // Flash de tela para impacto emocional
    if (flash) {
      flash.className = 'screen-flash active ' + (correct ? 'correct' : 'wrong');
      setTimeout(() => flash.classList.remove('active'), 200);
    }

    // Partículas se correto
    if (correct && pts > 0) {
      const scorePill = document.getElementById('score-pill');
      if (scorePill) {
        KahootAnim.spawnParticles(scorePill, { 
          count: 8, 
          emoji: ['✨','⭐','+'], 
          duration: 1500,
          spreadRadius: 80 
        });
      }
    }

    if (ptsEl) {
      if (correct && pts > 0) {
        ptsEl.textContent = `+${pts.toLocaleString('pt-BR')} pts`;
        ptsEl.style.animation = 'none';
        void ptsEl.offsetWidth;
        ptsEl.style.animation = 'iconPop .3s cubic-bezier(.34,1.6,.64,1)';
      } else if (pts === 0 && !correct) {
        ptsEl.textContent = '';
      }
    }

    if (navigator.vibrate) navigator.vibrate(correct ? [40] : [80, 40, 80]);
  },


  hideResult() {
    const ov = document.getElementById('result-overlay');
    if (ov) ov.classList.remove('show');
  },

  flash(correct) { this.showResult(correct, 0); },

  // ── Questão ────────────────────────────────────────────────
  renderQuestion(q, n, total) {
    this.hideResult();

    const txt  = document.getElementById('q-txt');
    const num  = document.getElementById('q-num');
    const cat  = document.getElementById('q-cat');
    const prog = document.getElementById('q-progress');
    const imgWrap = document.getElementById('q-image-wrap');
    const img  = document.getElementById('q-image');

    if (txt) {
      txt.textContent = q.question;
      const box = txt.closest('.q-box');
      if (box) { box.classList.remove('active'); void box.offsetWidth; box.classList.add('active'); }
    }
    if (num)  num.textContent  = `${n}/${total}`;
    if (cat)  cat.textContent  = q.category || 'Questão';
    if (prog) prog.style.width = `${n / total * 100}%`;

    // Image support
    if (imgWrap && img) {
      if (q.image) {
        img.src = q.image;
        imgWrap.style.display = 'block';
        imgWrap.classList.remove('loaded');
      } else {
        img.src = '';
        imgWrap.style.display = 'none';
        imgWrap.classList.remove('loaded');
      }
    }

    ['al-0','al-1','al-2','al-3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = q.options?.[i] || '';
    });
    ['ans-0','ans-1','ans-2','ans-3'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = false; b.className = b.className.replace(/\b(picked|correct|wrong)\b/g, '').trim(); }
    });

    // Anima as respostas com stagger
    const answers = document.querySelectorAll('.ans');
    KahootAnim.staggerReveal(answers, 80);

    const st = document.getElementById('ans-status');
    const cf = document.getElementById('btn-confirm');
    if (st) st.textContent = 'Escolha uma resposta';
    if (cf) { cf.disabled = true; cf.textContent = 'Confirmar'; }
  },

  revealAnswer(idx) {
    for (let i = 0; i < 4; i++) {
      const b = document.getElementById(`ans-${i}`);
      if (!b) continue;
      
      setTimeout(() => {
        b.disabled = true;
        b.classList.add(i === idx ? 'correct' : 'wrong');
      }, i * 100);
    }
    const cf = document.getElementById('btn-confirm');
    if (cf) cf.disabled = true;
  },

  // ── PIN ────────────────────────────────────────────────────
  setPin(pin) {
    const chip = document.getElementById('h-pin');
    if (chip) chip.textContent = pin;

    const digits = String(pin).padStart(6, '0').split('');
    digits.forEach((d, i) => {
      const el = document.getElementById(`pin-d${i}`);
      if (el) {
        el.textContent = d;
        // Anima cada dígito
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'bounce 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.animationDelay = `${i * 80}ms`;
        el.style.animationFillMode = 'both';
      }
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

  // ── Reset HUD (usado no logout) ───────────────────────────
  resetHud() {
    const name = document.getElementById('u-name');
    const xp   = document.getElementById('u-xp');
    const avL  = document.getElementById('av-letter');
    const avP  = document.getElementById('av-photo');
    if (name) name.textContent = 'Visitante';
    if (xp)   xp.textContent   = '0 pts · Nível 1';
    if (avL)  avL.textContent  = '?';
    if (avP)  { avP.src = ''; avP.style.display = 'none'; }

    const hn = document.getElementById('home-name');
    const hi = document.getElementById('home-initial');
    const ha = document.getElementById('home-avatar');
    if (hn) hn.textContent = '---';
    if (hi) hi.textContent = '?';
    if (ha) { ha.src = ''; ha.style.display = 'none'; }

    ['st-best','st-games','st-acc','st-combo'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.textContent = '0';
    });

    const sp = document.getElementById('score-pill');
    if (sp) sp.style.display = 'none';
    const sn = document.getElementById('score-num');
    if (sn) sn.textContent = '0';
  },

  // ── Toast ──────────────────────────────────────────────────
  toast(msg, dur = 2800) {
    let el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'toastIn 0.4s cubic-bezier(0.34,1.56,0.64,1)';
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
