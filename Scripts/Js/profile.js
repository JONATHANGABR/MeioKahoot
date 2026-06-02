/* MeioKahoot — Profile.js */
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
    // Sub: melhor pontuação + nível simples
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

  /* Modal editar */
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
    const r = new FileReader();
    r.onload = e => {
      const raw = e.target.result;
      const apply = (dataUrl) => {
        _pPhoto = dataUrl;
        const img  = document.getElementById('edit-av-photo');
        const let_ = document.getElementById('edit-av-letter');
        if (img)  { img.src = _pPhoto; img.style.display = 'block'; }
        if (let_) let_.style.display = 'none';
      };
      if (typeof PhotoCrop !== 'undefined') PhotoCrop.open(raw, apply);
      else apply(raw);
      input.value = '';
    };
    r.readAsDataURL(file);
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
    const r = new FileReader();
    r.onload = e => {
      const raw = e.target.result;
      const apply = (dataUrl) => {
        input.dataset.base64 = dataUrl;
        const prev = document.getElementById('reg-photo-img');
        const init = document.getElementById('reg-initial');
        if (prev) { prev.src = dataUrl; prev.style.display = 'block'; }
        if (init) init.style.display = 'none';
      };
      if (typeof PhotoCrop !== 'undefined') PhotoCrop.open(raw, apply);
      else apply(raw);
      input.value = '';
    };
    r.readAsDataURL(file);
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
