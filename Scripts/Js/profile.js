/* MeioKahoot — Profile.js (com editor de foto) */
const Profile = (() => {
  const K  = 'mk_profile';
  const KS = 'mk_stats';
  const defP  = () => ({ name: '', photo: '', user: '' });
  const defSt = () => ({ games: 0, correct: 0, total: 0, best: 0, combo: 0 });

  const get    = () => { try { return { ...defP(),  ...JSON.parse(localStorage.getItem(K)  || '{}') }; } catch { return defP();  } };
  const getSt  = () => { try { return { ...defSt(), ...JSON.parse(localStorage.getItem(KS) || '{}') }; } catch { return defSt(); } };
  const save   = d => localStorage.setItem(K,  JSON.stringify({ ...defP(),  ...d }));
  const saveSt = d => localStorage.setItem(KS, JSON.stringify({ ...defSt(), ...d }));
  const acc    = s => s.total > 0 ? Math.round(s.correct / s.total * 100) + '%' : '0%';

  function recordMatch({ score = 0, correct = 0, total = 0, comboMax = 0 } = {}) {
    const s = getSt();
    s.games++;
    s.correct += correct;
    s.total   += total;
    s.best     = Math.max(s.best, score);
    s.combo    = Math.max(s.combo, comboMax);
    saveSt(s);
    renderHud(); renderHome();
  }

  /* Renderiza avatar: letra fundo + foto em cima */
  function _setAv(letterId, photoId, name, photo) {
    const letter = document.getElementById(letterId);
    const img    = document.getElementById(photoId);
    if (letter) letter.textContent = (name[0] || '?').toUpperCase();
    if (img)    { img.src = photo || ''; img.style.display = photo ? 'block' : 'none'; }
  }

  function renderHud() {
    const p = get(), s = getSt(), name = p.name || p.user || 'Visitante';
    _txt('u-name', name);
    const lvl = Math.floor((s.games || 0) / 5) + 1;
    _txt('u-xp', `${(s.best || 0).toLocaleString('pt-BR')} pts · Nível ${lvl}`);
    _setAv('av-letter', 'av-photo', name, p.photo);
  }

  function renderHome() {
    const p = get(), s = getSt(), name = p.name || p.user || '---';
    _txt('home-name', name);
    _txt('st-best',   (s.best || 0).toLocaleString('pt-BR'));
    _txt('st-games',  s.games || 0);
    _txt('st-acc',    acc(s));
    _txt('st-combo',  s.combo || 0);
    _setAv('home-initial', 'home-avatar', name, p.photo);
  }

  /* ── Modal editar perfil ─────────────────────── */
  let _pPhoto = '';

  function openEdit() {
    const p = get(), s = getSt(), name = p.name || p.user || '?';
    _pPhoto = p.photo || '';
    _setAv('edit-av-letter', 'edit-av-photo', name, p.photo);
    _txt('es-best',  (s.best || 0).toLocaleString('pt-BR'));
    _txt('es-games', s.games || 0);
    _txt('es-acc',   acc(s));
    _txt('es-combo', s.combo || 0);
    Modal.open('modal-profile');
  }

  function previewEdit(input) {
    const file = input.files[0]; if (!file) return;
    input.value = ''; // reset para permitir reselecionar o mesmo arquivo
    PhotoCrop.open(file, (croppedBase64) => {
      _pPhoto = croppedBase64;
      const img  = document.getElementById('edit-av-photo');
      const let_ = document.getElementById('edit-av-letter');
      if (img) { img.src = _pPhoto; img.style.display = 'block'; }
      if (let_) let_.style.display = 'none';
    });
  }

  function saveEdit() {
    const p = get(); p.photo = _pPhoto; save(p);
    renderHud(); renderHome();
    Modal.close('modal-profile');
    Sounds.play('click');
  }

  function setFromAuth(data) {
    const p = get();
    p.name  = data.name || data.user || p.name;
    p.photo = data.photo || p.photo;
    p.user  = data.user  || p.user;
    save(p); renderHud(); renderHome();
  }

  function previewPhoto(input) {
    const file = input.files[0]; if (!file) return;
    input.value = '';
    PhotoCrop.open(file, (croppedBase64) => {
      // Guarda no dataset do input original de registro
      const regFile = document.getElementById('reg-file');
      if (regFile) regFile.dataset.base64 = croppedBase64;
      const prev = document.getElementById('reg-photo-img');
      const init = document.getElementById('reg-initial');
      if (prev) { prev.src = croppedBase64; prev.style.display = 'block'; }
      if (init) init.style.display = 'none';
    });
  }

  function getName()  { return get().name || get().user || 'Jogador'; }
  function getPhoto() { return get().photo || ''; }

  function _txt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  return {
    get, save, getSt, saveSt, recordMatch,
    renderHud, renderHome,
    openEdit, previewEdit, saveEdit,
    setFromAuth, getName, getPhoto, previewPhoto,
  };
})();


/* ══════════════════════════════════════════════════════════════
   PhotoCrop — Editor de foto com arrastar + zoom
   O usuário escolhe a área visível dentro de um círculo.
══════════════════════════════════════════════════════════════ */
const PhotoCrop = (() => {
  let _cb = null;
  let _img = null;
  let _scale = 1, _x = 0, _y = 0;
  let _dragging = false, _startX = 0, _startY = 0, _origX = 0, _origY = 0;
  const SIZE = 280; // tamanho do canvas de preview

  function _build() {
    if (document.getElementById('photo-crop-overlay')) return;

    const ov = document.createElement('div');
    ov.id = 'photo-crop-overlay';
    ov.innerHTML = `
      <div class="crop-modal">
        <h3>Ajustar foto</h3>
        <p>Arraste para posicionar e use o zoom</p>
        <div class="crop-area" id="crop-area">
          <canvas id="crop-canvas" width="${SIZE}" height="${SIZE}"></canvas>
          <div class="crop-circle"></div>
        </div>
        <div class="crop-zoom-row">
          <span class="crop-zoom-label">−</span>
          <input type="range" id="crop-zoom" min="50" max="300" value="100" class="crop-slider"/>
          <span class="crop-zoom-label">+</span>
        </div>
        <div class="crop-actions">
          <button class="crop-btn crop-btn-cancel" id="crop-cancel">Cancelar</button>
          <button class="crop-btn crop-btn-ok" id="crop-ok">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // Eventos
    const area = document.getElementById('crop-area');
    const slider = document.getElementById('crop-zoom');

    // Mouse
    area.addEventListener('mousedown', _onDown);
    window.addEventListener('mousemove', _onMove);
    window.addEventListener('mouseup', _onUp);

    // Touch
    area.addEventListener('touchstart', _onTouchDown, { passive: false });
    window.addEventListener('touchmove', _onTouchMove, { passive: false });
    window.addEventListener('touchend', _onUp);

    // Zoom
    slider.addEventListener('input', (e) => {
      _scale = parseInt(e.target.value) / 100;
      _draw();
    });

    // Scroll wheel zoom
    area.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -5 : 5;
      const cur = parseInt(slider.value);
      slider.value = Math.max(50, Math.min(300, cur + delta));
      _scale = parseInt(slider.value) / 100;
      _draw();
    }, { passive: false });

    document.getElementById('crop-cancel').addEventListener('click', close);
    document.getElementById('crop-ok').addEventListener('click', _confirm);
  }

  function open(file, callback) {
    _cb = callback;
    _build();
    _scale = 1; _x = 0; _y = 0;
    const slider = document.getElementById('crop-zoom');
    if (slider) slider.value = 100;

    const reader = new FileReader();
    reader.onload = (e) => {
      _img = new Image();
      _img.onload = () => {
        // Centralizar a imagem
        _x = (SIZE - _img.width * _scale) / 2;
        _y = (SIZE - _img.height * _scale) / 2;
        // Auto-fit: escala mínima para cobrir o círculo
        const fitScale = Math.max(SIZE / _img.width, SIZE / _img.height);
        _scale = fitScale;
        _x = (SIZE - _img.width * _scale) / 2;
        _y = (SIZE - _img.height * _scale) / 2;
        const slider = document.getElementById('crop-zoom');
        if (slider) slider.value = Math.round(_scale * 100);
        _draw();
      };
      _img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    const ov = document.getElementById('photo-crop-overlay');
    if (ov) { ov.style.display = 'flex'; }
    if (typeof Sounds !== 'undefined') Sounds.play('click');
  }

  function close() {
    const ov = document.getElementById('photo-crop-overlay');
    if (ov) ov.style.display = 'none';
    _img = null;
  }

  function _draw() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas || !_img) return;
    const ctx = canvas.getContext('2d');
    const w = _img.width * _scale;
    const h = _img.height * _scale;

    // Limpa
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Fundo escuro
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Desenha imagem
    ctx.drawImage(_img, _x, _y, w, h);

    // Máscara: escurece fora do círculo
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();
  }

  function _onDown(e) {
    e.preventDefault();
    _dragging = true;
    _startX = e.clientX; _startY = e.clientY;
    _origX = _x; _origY = _y;
  }
  function _onTouchDown(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    _dragging = true;
    _startX = e.touches[0].clientX; _startY = e.touches[0].clientY;
    _origX = _x; _origY = _y;
  }
  function _onMove(e) {
    if (!_dragging) return;
    _x = _origX + (e.clientX - _startX);
    _y = _origY + (e.clientY - _startY);
    _draw();
  }
  function _onTouchMove(e) {
    if (!_dragging || e.touches.length !== 1) return;
    e.preventDefault();
    _x = _origX + (e.touches[0].clientX - _startX);
    _y = _origY + (e.touches[0].clientY - _startY);
    _draw();
  }
  function _onUp() { _dragging = false; }

  function _confirm() {
    // Renderiza o resultado final: recorta o círculo em 256x256
    const out = document.createElement('canvas');
    const outSize = 256;
    out.width = outSize; out.height = outSize;
    const ctx = out.getContext('2d');

    // Clip circular
    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Escala proporção do preview para o output
    const ratio = outSize / SIZE;
    if (_img) {
      ctx.drawImage(_img, _x * ratio, _y * ratio, _img.width * _scale * ratio, _img.height * _scale * ratio);
    }

    const base64 = out.toDataURL('image/jpeg', 0.85);
    if (_cb) _cb(base64);
    close();
    if (typeof Sounds !== 'undefined') Sounds.play('click');
  }

  return { open, close };
})();
