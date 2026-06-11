/* MeioKahoot — Sounds.js */
const Sounds = (() => {
  const FILES = {
    click:   'Click.mp3',
    correct: 'Correct.mp3',
    wrong:   'Incorrect.mp3',
    timer:   'Coundown.mp3',
    lobby:   'Lobby.mp3',
    win:     'Correct.mp3',
  };
  const VOL = { lobby: .45, timer: .65, default: .8 };

  const nodes = {}, ok = {};
  let bgKey = null, muted = false, unlocked = false;
  let lobbyMuted = localStorage.getItem('mk_lobby_muted') === '1';

  function _tryUnlock() {
    if (unlocked) return; unlocked = true;
    Object.keys(nodes).forEach(k => {
      const a = nodes[k]; if (!a || ok[k] === false) return;
      a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = VOL[k] ?? VOL.default; }).catch(() => {});
    });
  }

  function init() {
    Object.entries(FILES).forEach(([k, f]) => {
      const a = new Audio();
      a.preload = 'auto'; a.volume = VOL[k] ?? VOL.default; ok[k] = null;
      a.addEventListener('canplaythrough', () => { ok[k] = true; }, { once: true });
      a.addEventListener('error',          () => { ok[k] = false; }, { once: true });
      a.src = `/Assets/Audio/${f}`; nodes[k] = a;
    });
    const u = () => { _tryUnlock(); document.removeEventListener('click', u); document.removeEventListener('touchend', u); };
    document.addEventListener('click', u, { once: true });
    document.addEventListener('touchend', u, { once: true });
  }

  function play(key, loop = false) {
    if (muted || ok[key] === false) return;
    const base = nodes[key]; if (!base) return;
    try {
      let a = (!loop && ['click','correct','wrong'].includes(key)) ? base.cloneNode() : base;
      a.volume = VOL[key] ?? VOL.default; a.loop = loop;
      if (a !== base) a.currentTime = 0; else base.currentTime = 0;
      const p = a.play(); if (p) p.catch(() => { ok[key] = false; });
    } catch { ok[key] = false; }
  }

  function stop(key)  { const a = nodes[key]; if (a) { try { a.pause(); a.currentTime = 0; } catch {} } }
  function playBg(k)  { if (k === 'lobby' && lobbyMuted) { stopBg(); updateLobbyButton(); return; } if (bgKey === k) return; stopBg(); bgKey = k; play(k, true); updateLobbyButton(); }
  function stopBg()   { if (bgKey) { stop(bgKey); bgKey = null; } updateLobbyButton(); }
  function stopAll()  { Object.keys(nodes).forEach(stop); bgKey = null; }
  function toggleMute() { muted = !muted; if (muted) stopAll(); return muted; }
  function isLobbyMuted() { return lobbyMuted; }
  function updateLobbyButton() {
    const btn = document.getElementById('lobby-sound-btn');
    if (!btn) return;
    btn.textContent = lobbyMuted ? '🔇' : '🔊';
    btn.title = lobbyMuted ? 'Ativar som do lobby' : 'Desativar som do lobby';
    btn.classList.toggle('muted', lobbyMuted);
  }
  function toggleLobbyMute() {
    lobbyMuted = !lobbyMuted;
    localStorage.setItem('mk_lobby_muted', lobbyMuted ? '1' : '0');
    if (lobbyMuted) stop('lobby'); else playBg('lobby');
    updateLobbyButton();
    if (typeof UI !== 'undefined') UI.toast(lobbyMuted ? 'Som do lobby desativado' : 'Som do lobby ativado');
    return lobbyMuted;
  }

  init();
  document.addEventListener('DOMContentLoaded', updateLobbyButton);
  return { play, stop, playBg, stopBg, stopAll, toggleMute, toggleLobbyMute, isLobbyMuted, updateLobbyButton, _nodes: nodes };
})();
