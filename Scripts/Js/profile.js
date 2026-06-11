/* MeioKahoot — Profile.js v7.0 (Com Fotos, Crop & Persistência) */
const Profile = (() => {
  const K  = 'mk_profile';
  const KS = 'mk_stats';
  const defP  = () => ({ name: '', user: '', photo: '' });
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

  /* Avatar baseado em cor, inicial ou foto */
  function _setAv(letterId, photoId, name, photo) {
    const letter = document.getElementById(letterId);
    const img    = document.getElementById(photoId);
    if (letter) {
      letter.textContent = (name[0] || '?').toUpperCase();
      const colors = ['#ff4d4d', '#4d79ff', '#4dff88', '#ffcc4d', '#ff4dff', '#4dffff'];
      const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      letter.style.backgroundColor = colors[hash % colors.length];
      letter.style.display = photo ? 'none' : '';
    }
    if (img) {
      if (photo) {
        img.src = photo;
        img.style.display = 'block';
      } else {
        img.src = '';
        img.style.display = 'none';
      }
    }
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
    _txt('st-combo',  Math.floor((s.games || 0) / 5) + 1);
    _setAv('home-initial', 'home-avatar', name, p.photo);
  }

  function openEdit() {
    const p = get(), s = getSt(), name = p.name || p.user || '?';
    _setAv('edit-av-letter', 'edit-av-photo', name, p.photo);
    _txt('es-best',  (s.best || 0).toLocaleString('pt-BR'));
    _txt('es-games', s.games || 0);
    _txt('es-acc',   acc(s));
    _txt('es-combo', s.combo || 0);
    Modal.open('modal-profile');
  }

  /* Foto com crop integrado */
  function previewPhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    
    // Reduz tamanho se muito grande
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      
      // Redimensiona a imagem para no máximo 256x256
      _resizeImage(base64, 256, (resized) => {
        // Tenta usar o crop se disponível
        if (typeof PhotoCrop !== 'undefined') {
          PhotoCrop.open(resized, (cropped) => {
            _applyPhotoToRegister(cropped);
          });
        } else {
          _applyPhotoToRegister(resized);
        }
      });
    };
    reader.readAsDataURL(file);
  }

  function _applyPhotoToRegister(base64) {
    const img = document.getElementById('reg-photo-img');
    const letEl = document.getElementById('reg-initial');
    if (img) { img.src = base64; img.style.display = 'block'; }
    if (letEl) { letEl.style.display = 'none'; }
    const input = document.getElementById('reg-file');
    if (input) input.dataset.base64 = base64;
  }

  function previewEdit(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      
      _resizeImage(base64, 256, (resized) => {
        // Tenta usar o crop se disponível
        if (typeof PhotoCrop !== 'undefined') {
          PhotoCrop.open(resized, (cropped) => {
            _applyPhotoToEdit(cropped);
          });
        } else {
          _applyPhotoToEdit(resized);
        }
      });
    };
    reader.readAsDataURL(file);
  }

  function _applyPhotoToEdit(base64) {
    const img = document.getElementById('edit-av-photo');
    const letEl = document.getElementById('edit-av-letter');
    if (img) { img.src = base64; img.style.display = 'block'; }
    if (letEl) { letEl.style.display = 'none'; }
    const input = document.getElementById('edit-file');
    if (input) input.dataset.base64 = base64;
    Sounds.play('click');
  }

  function _resizeImage(base64, maxSize, callback) {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxSize && img.height <= maxSize) {
        callback(base64);
        return;
      }
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = base64;
  }

  function randomizePhoto() {
    const seed = Math.random().toString(36).substring(7);
    const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
    const img = document.getElementById('edit-av-photo');
    const letEl = document.getElementById('edit-av-letter');
    if (img) { img.src = url; img.style.display = 'block'; }
    if (letEl) { letEl.style.display = 'none'; }
    const input = document.getElementById('edit-file');
    if (input) input.dataset.base64 = url;
    Sounds.play('click');
  }

  function saveEdit() {
    const p = get();
    const name = p.name || p.user || 'Jogador';
    const photo = document.getElementById('edit-file')?.dataset?.base64 || p.photo || '';
    
    // Efeito de "Salvando"
    const overlay = document.createElement('div');
    overlay.className = 'saving-overlay';
    overlay.innerHTML = `<div class="saving-spinner"></div><div>Sincronizando...</div>`;
    document.body.appendChild(overlay);

    if (window.SocketClient) {
      SocketClient.emit('updateProfile', { name, photo });
      
      // Atualiza localmente
      p.name = name;
      p.photo = photo;
      save(p);
      renderHud();
      renderHome();

      setTimeout(() => {
        overlay.remove();
        Modal.close('modal-profile');
        Sounds.play('click');
        UI.toast('Perfil salvo! ✅');
        
        // Efeito de confirmação
        KahootAnim.screenFlash('rgba(34,197,94,0.2)', 400);
      }, 1000);
    } else {
      p.name = name;
      p.photo = photo;
      save(p);
      renderHud();
      renderHome();
      overlay.remove();
      Modal.close('modal-profile');
    }
  }


  function setFromAuth(data) {
    const p = get();
    p.name  = data.name || data.user || p.name;
    p.user  = data.user  || p.user;
    p.photo = data.photo || p.photo;
    
    if (data.stats) {
      const s = getSt();
      s.best = data.stats.best || 0;
      s.games = data.stats.games || 0;
      saveSt(s);
    }
    save(p); renderHud(); renderHome();
  }

  function getName()  { return get().name || get().user || 'Jogador'; }
  function getPhoto() { return get().photo || ''; }

  function _txt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  return {
    get, save, getSt, saveSt, recordMatch,
    renderHud, renderHome,
    openEdit, saveEdit, previewEdit, previewPhoto, randomizePhoto,
    setFromAuth, getName, getPhoto,
  };
})();
