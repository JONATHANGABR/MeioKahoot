/* ============================================================
   TELA DE RANKING FINAL – Lógica (ranking.js)
   Coloque em: /Scripts/Js/ranking.js
   Conecta com 'gameOver':  io.to(pin).emit('gameOver', rank)
   rank = Array<{ name, photo, score, isBot }>
   ============================================================ */

const RankingScreen = (() => {

  // ──────────────── CONFIG ────────────────
  const REVEAL_DELAY_MS   = 600;
  const INITIAL_DELAY_MS  = 800;
  const CONFETTI_COUNT    = 80;
  const CONFETTI_COLORS   = ['#ffd700','#ff6b6b','#51cf66','#4dabf7','#ff922b',
                             '#f06595','#20c997','#ffd43b','#845ef7','#fff'];

  // ──────────────── ESTADO ────────────────
  let overlayEl    = null;
  let listEl       = null;
  let confettiEl   = null;
  let titleEl      = null;
  let subtitleEl   = null;
  let btnPlayAgain = null;
  let btnLeave     = null;
  let isVisible    = false;

  let onPlayAgain  = null;
  let onLeave      = null;

  // ──────────────── TEMPLATE ────────────────
  function buildHTML() {
    return `
    <div id="rankingOverlay">
      <div class="ranking-confetti" id="rankingConfetti"></div>
      <div class="ranking-content">
        <h1 class="ranking-title" id="rankingTitle">🏆 Ranking Final</h1>
        <p class="ranking-subtitle" id="rankingSubtitle"></p>
        <div class="ranking-list" id="rankingList"></div>
        <div class="ranking-actions">
          <button class="btn-ranking btn-play-again" id="btnPlayAgain">🔄 Jogar de Novo</button>
          <button class="btn-ranking btn-leave" id="btnLeave">🚪 Sair</button>
        </div>
      </div>
    </div>`;
  }

  // ──────────────── INICIALIZAÇÃO ────────────────
  function init() {
    if (!document.getElementById('rankingOverlay')) {
      document.body.insertAdjacentHTML('beforeend', buildHTML());
    }

    overlayEl    = document.getElementById('rankingOverlay');
    listEl       = document.getElementById('rankingList');
    confettiEl   = document.getElementById('rankingConfetti');
    titleEl      = document.getElementById('rankingTitle');
    subtitleEl   = document.getElementById('rankingSubtitle');
    btnPlayAgain = document.getElementById('btnPlayAgain');
    btnLeave     = document.getElementById('btnLeave');

    btnPlayAgain.addEventListener('click', () => {
      hide();
      if (onPlayAgain) onPlayAgain();
    });

    btnLeave.addEventListener('click', () => {
      hide();
      if (onLeave) onLeave();
      else window.location.reload();
    });
  }

  // ──────────────── CONFETTI ────────────────
  function spawnConfetti() {
    if (!confettiEl) return;
    confettiEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left            = Math.random() * 100 + '%';
      piece.style.backgroundColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.width           = (Math.random() * 10 + 6) + 'px';
      piece.style.height          = (Math.random() * 10 + 6) + 'px';
      piece.style.animationDuration = (Math.random() * 2.5 + 2) + 's';
      piece.style.animationDelay    = Math.random() * 1.5 + 's';
      piece.style.borderRadius      = Math.random() > 0.5 ? '50%' : '2px';
      frag.appendChild(piece);
    }
    confettiEl.appendChild(frag);

    setTimeout(() => {
      if (confettiEl) confettiEl.innerHTML = '';
    }, 4500);
  }

  // ──────────────── MEDALHAS ────────────────
  function getMedal(pos) {
    if (pos === 0) return '🥇';
    if (pos === 1) return '🥈';
    if (pos === 2) return '🥉';
    return '';
  }

  // ──────────────── RENDERIZA OS CARDS ────────────────
  function renderCards(rank) {
    if (!listEl) return;
    listEl.innerHTML = '';

    rank.forEach((player, idx) => {
      const pos   = idx + 1;
      const medal = getMedal(idx);

      const card = document.createElement('div');
      card.className = 'player-rank-card';

      // Coroa no 1º lugar
      if (idx === 0) {
        const crown = document.createElement('span');
        crown.className = 'winner-crown';
        crown.textContent = '👑';
        card.appendChild(crown);
      }

      // Posição / Medalha
      const posSpan = document.createElement('span');
      posSpan.className = 'rank-pos';
      posSpan.textContent = medal || '#' + pos;
      card.appendChild(posSpan);

      // Foto / Avatar
      const photoDiv = document.createElement('div');
      photoDiv.className = 'rank-photo';
      if (player.photo) {
        const img = document.createElement('img');
        img.src = player.photo;
        img.alt = player.name;
        img.onerror = () => {
          img.style.display = 'none';
          photoDiv.textContent = (player.name || '?').charAt(0).toUpperCase();
        };
        photoDiv.appendChild(img);
      } else {
        photoDiv.textContent = (player.name || '?').charAt(0).toUpperCase();
      }
      card.appendChild(photoDiv);

      // Nome
      const nameSpan = document.createElement('span');
      nameSpan.className = 'rank-name';
      nameSpan.textContent = player.name + (player.isBot ? ' 🤖' : '');
      card.appendChild(nameSpan);

      // Score
      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'rank-score';
      scoreSpan.innerHTML = player.score.toLocaleString('pt-BR')
        + '<span class="rank-score-label">pts</span>';
      card.appendChild(scoreSpan);

      listEl.appendChild(card);
    });
  }

  // ──────────────── ANIMAÇÃO DE REVELAÇÃO ────────────────
  function revealOneByOne(callback) {
    const cards = listEl.querySelectorAll('.player-rank-card');
    if (cards.length === 0) {
      if (callback) callback();
      return;
    }

    let i = 0;
    function revealNext() {
      if (i >= cards.length) {
        if (callback) callback();
        return;
      }
      cards[i].classList.add('revealed');
      i++;

      // O 1º lugar tem delay maior pra dar destaque
      const delay = (i === 1) ? REVEAL_DELAY_MS + 400 : REVEAL_DELAY_MS;
      setTimeout(revealNext, delay);
    }
    setTimeout(revealNext, INITIAL_DELAY_MS);
  }

  // ──────────────── MOSTRAR ────────────────
  function show(rank) {
    if (!overlayEl) init();
    if (!rank || rank.length === 0) {
      console.warn('RankingScreen: rank vazio');
      return;
    }

    // Garante ordenação por score decrescente
    const sorted = [...rank].sort((a, b) => b.score - a.score);
    const totalPlayers = sorted.length;

    renderCards(sorted);
    subtitleEl.textContent = totalPlayers + ' jogador'
      + (totalPlayers > 1 ? 'es' : '') + ' • Partida finalizada!';
    titleEl.textContent = '🏆 Ranking Final';

    overlayEl.classList.add('active');
    isVisible = true;

    spawnConfetti();
    revealOneByOne(() => {
      console.log('RankingScreen: revelação completa 🎉');
    });
  }

  // ──────────────── ESCONDER ────────────────
  function hide() {
    if (!overlayEl) return;
    overlayEl.classList.remove('active');
    isVisible = false;
  }

  // ──────────────── CALLBACKS ────────────────
  function setOnPlayAgain(fn) { onPlayAgain = fn; }
  function setOnLeave(fn)     { onLeave = fn; }

  // ──────────────── INIT AUTO ────────────────
  init();

  // ──────────────── API PÚBLICA ────────────────
  return {
    show,
    hide,
    init,
    setOnPlayAgain,
    setOnLeave,
    get isVisible() { return isVisible; },
  };

})();
