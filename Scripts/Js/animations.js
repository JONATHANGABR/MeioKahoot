/* ══════════════════════════════════════════════════════════
   MeioKahoot — Animations.js v1.0
   Motor de animações Kahoot-themed (confetti, particles, 
   podium epic reveal, screen transitions, logo effects)
   ══════════════════════════════════════════════════════════ */

const KahootAnim = (() => {

  /* ── CONFETTI MELHORADO ─────────────────────────────── */
  function confettiBurst(opts = {}) {
    const {
      count = 120,
      duration = 4000,
      colors = ['#facc15','#ef4444','#3b82f6','#22c55e','#a855f7','#ec4899','#f97316','#06b6d4'],
      shapes = ['rect','circle','triangle'],
      spread = true
    } = opts;

    const container = document.createElement('div');
    container.className = 'kahoot-confetti-container';
    container.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;';
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const size = Math.random() * 10 + 6;
      const left = spread ? Math.random() * 100 : 50 + (Math.random() - 0.5) * 30;
      const delay = Math.random() * 1500;
      const animDuration = (Math.random() * 2 + 2);
      const rotEnd = Math.random() * 1080 - 540;
      const swayAmt = Math.random() * 200 - 100;

      piece.style.cssText = `
        position:absolute;
        top:-20px;
        left:${left}%;
        width:${size}px;
        height:${shape === 'rect' ? size * 0.6 : size}px;
        background:${color};
        border-radius:${shape === 'circle' ? '50%' : shape === 'triangle' ? '0' : '2px'};
        ${shape === 'triangle' ? `clip-path:polygon(50% 0%, 0% 100%, 100% 100%);` : ''}
        opacity:${Math.random() * 0.5 + 0.5};
        animation: kahootConfettiFall ${animDuration}s ${delay}ms ease-in forwards;
        --sway:${swayAmt}px;
        --rot:${rotEnd}deg;
      `;
      container.appendChild(piece);
    }

    setTimeout(() => container.remove(), duration + 2000);
  }

  /* ── PARTICLES (Floating eco leaves / stars) ────────── */
  function spawnParticles(target, opts = {}) {
    const {
      count = 20,
      emoji = ['🌿','🍃','⭐','✨','🌍'],
      duration = 5000,
      spreadRadius = 200,
    } = opts;

    const rect = target.getBoundingClientRect();
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;overflow:hidden;';
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const em = emoji[Math.floor(Math.random() * emoji.length)];
      const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * spreadRadius;
      const y = rect.top + rect.height / 2;
      const delay = Math.random() * 800;
      const animDur = Math.random() * 1.5 + 1.5;

      p.textContent = em;
      p.style.cssText = `
        position:absolute;
        left:${x}px;top:${y}px;
        font-size:${Math.random() * 16 + 14}px;
        animation: particleRise ${animDur}s ${delay}ms ease-out forwards;
        pointer-events:none;
      `;
      container.appendChild(p);
    }

    setTimeout(() => container.remove(), duration);
  }

  /* ── SCREEN FLASH (full screen color burst) ─────────── */
  function screenFlash(color = '#22c55e', dur = 600) {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;inset:0;z-index:9990;
      background:${color};
      pointer-events:none;
      animation: screenFlashAnim ${dur}ms ease-out forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), dur + 100);
  }

  /* ── COUNTDOWN ANIMATION (antes da partida) ─────────── */
  function countdown(container, opts = {}) {
    const { numbers = ['3','2','1','GO!'], colors = ['#ef4444','#f97316','#eab308','#22c55e'], onDone } = opts;

    return new Promise(resolve => {
      let idx = 0;

      function showNext() {
        if (idx >= numbers.length) {
          if (onDone) onDone();
          resolve();
          return;
        }

        const num = document.createElement('div');
        num.className = 'kahoot-countdown-num';
        num.textContent = numbers[idx];
        num.style.color = colors[idx] || '#fff';
        container.appendChild(num);

        // Trigger animation
        requestAnimationFrame(() => {
          num.classList.add('animate');
        });

        setTimeout(() => {
          num.classList.add('exit');
          setTimeout(() => num.remove(), 400);
          idx++;
          showNext();
        }, 800);
      }

      showNext();
    });
  }

  /* ── SHAKE ANIMATION ────────────────────────────────── */
  function shake(element, intensity = 10, dur = 500) {
    if (!element) return;
    element.style.animation = `kahootShake ${dur}ms ease`;
    setTimeout(() => element.style.animation = '', dur);
  }

  /* ── BOUNCE IN ──────────────────────────────────────── */
  function bounceIn(element, delay = 0) {
    if (!element) return;
    element.style.opacity = '0';
    element.style.transform = 'scale(0.3)';
    setTimeout(() => {
      element.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      element.style.opacity = '1';
      element.style.transform = 'scale(1)';
    }, delay);
  }

  /* ── PULSE RING (efeito ao redor de um elemento) ────── */
  function pulseRing(element, color = '#22c55e', count = 3) {
    if (!element) return;
    const rect = element.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const ring = document.createElement('div');
      ring.style.cssText = `
        position:fixed;
        left:${rect.left + rect.width / 2}px;
        top:${rect.top + rect.height / 2}px;
        width:20px;height:20px;
        border:3px solid ${color};
        border-radius:50%;
        transform:translate(-50%,-50%);
        animation: pulseRingOut 1s ${i * 300}ms ease-out forwards;
        pointer-events:none;
        z-index:9990;
      `;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 1500 + i * 300);
    }
  }

  /* ── TROPHY SPIN (roda o troféu na tela do pódio) ──── */
  function trophySpin(element) {
    if (!element) return;
    element.style.animation = 'trophySpin 1.2s cubic-bezier(0.34,1.56,0.64,1)';
  }

  /* ── SCORE COUNT UP (anima número subindo) ──────────── */
  function scoreCountUp(element, from, to, dur = 1500) {
    if (!element) return;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / dur, 1);
      // Easing: ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      element.textContent = current.toLocaleString('pt-BR');
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ── STAGGER REVEAL (revela elementos sequencialmente) ─ */
  function staggerReveal(elements, staggerMs = 150, animClass = 'fadeInUp') {
    elements.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      setTimeout(() => {
        el.style.transition = 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * staggerMs);
    });
  }

  /* ── FIREWORKS (fogos no pódio) ─────────────────────── */
  function fireworks(dur = 5000) {
    const container = document.createElement('div');
    container.className = 'kahoot-fireworks-container';
    container.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;';
    document.body.appendChild(container);

    const fwColors = ['#facc15','#ef4444','#3b82f6','#22c55e','#a855f7','#ec4899','#f97316'];

    let active = true;
    const endTime = Date.now() + dur;

    function spawnBurst() {
      if (!active || Date.now() > endTime) return;

      const cx = Math.random() * 80 + 10;
      const cy = Math.random() * 50 + 10;
      const burstCount = Math.floor(Math.random() * 15) + 10;
      const color = fwColors[Math.floor(Math.random() * fwColors.length)];

      for (let i = 0; i < burstCount; i++) {
        const spark = document.createElement('div');
        const angle = (Math.PI * 2 / burstCount) * i;
        const dist = Math.random() * 80 + 40;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const sparkDur = Math.random() * 0.5 + 0.8;

        spark.style.cssText = `
          position:absolute;
          left:${cx}%;top:${cy}%;
          width:4px;height:4px;
          background:${color};
          border-radius:50%;
          box-shadow:0 0 6px ${color};
          animation: fireworkSpark ${sparkDur}s ease-out forwards;
          --dx:${dx}px;--dy:${dy}px;
        `;
        container.appendChild(spark);
        setTimeout(() => spark.remove(), sparkDur * 1000 + 100);
      }

      setTimeout(spawnBurst, Math.random() * 400 + 200);
    }

    spawnBurst();
    setTimeout(() => { active = false; setTimeout(() => container.remove(), 2000); }, dur);
  }

  /* ── BACKGROUND GRADIENT PULSE ──────────────────────── */
  function bgGradientPulse(element, colors = ['rgba(38,137,12,0.15)','rgba(70,23,143,0.15)'], dur = 3000) {
    if (!element) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % colors.length;
      element.style.background = colors[idx];
      element.style.transition = `background ${dur}ms ease`;
    }, dur);
    return () => clearInterval(interval);
  }

  /* ── CROWN DROP (coroa cai no avatar do 1º lugar) ──── */
  function crownDrop(avatarElement, delay = 0) {
    if (!avatarElement) return;
    const crown = document.createElement('div');
    crown.textContent = '👑';
    crown.style.cssText = `
      position:absolute;
      top:-30px;left:50%;transform:translateX(-50%) translateY(-60px) scale(0);
      font-size:2rem;z-index:10;
      filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3));
      transition:all 0.8s cubic-bezier(0.34,1.56,0.64,1);
    `;
    avatarElement.style.position = 'relative';
    avatarElement.appendChild(crown);

    setTimeout(() => {
      crown.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    }, delay);
  }

  return {
    confettiBurst,
    spawnParticles,
    screenFlash,
    countdown,
    shake,
    bounceIn,
    pulseRing,
    trophySpin,
    scoreCountUp,
    staggerReveal,
    fireworks,
    bgGradientPulse,
    crownDrop,
  };
})();
