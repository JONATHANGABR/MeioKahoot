/* MeioKahoot — Lobby.js (minimalista) */
const Lobby = {
  _last: 0,

  updateList(players) {
    const grid  = document.getElementById('lb-list');
    const count = document.getElementById('lb-count');
    if (!grid) return;

    const n = players.length;
    UI.setPlayerCount(n);
    if (count) count.textContent = n;
    if (n > this._last) Sounds.play('click');
    this._last = n;

    grid.innerHTML = '';
    players.forEach((p, i) => {
      const chip = document.createElement('div');
      chip.className = 'player-chip' + (p.connected === false ? ' offline' : '');
      chip.style.animationDelay = `${i * 0.04}s`;

      const av  = document.createElement('div');
      av.className = 'chip-av';
      if (p.photo) {
        const img = document.createElement('img');
        img.src = p.photo;
        img.onerror = () => { img.remove(); av.textContent = (p.name?.[0] || '?').toUpperCase(); };
        av.appendChild(img);
      } else {
        av.textContent = (p.name?.[0] || '?').toUpperCase();
      }

      const nm = document.createElement('span');
      nm.className = 'chip-name';
      nm.textContent = p.name + (p.isBot ? ' 🤖' : p.connected === false ? ' ···' : '');

      chip.appendChild(av);
      chip.appendChild(nm);
      grid.appendChild(chip);
    });

    const txt = document.getElementById('lobby-status-txt');
    if (txt) txt.textContent = n === 0 ? 'Aguardando...' : n === 1 ? '1 jogador' : `${n} jogadores`;
  },

  setPin(pin) {
    // UI.setPin cuida do HUD chip + dígitos separados do lobby
    UI.setPin(pin);
  },

  showHostControls(show) {
    const el = document.getElementById('host-controls');
    if (el) el.style.display = show ? 'block' : 'none';
  },
};
