/* MeioKahoot — app.js */

/* ── AutoLogin ─────────────────────────────────────────── */
const AutoLogin = {
  _K: 'mk_autologin', _t: null,
  save(u, p)    { try { localStorage.setItem(this._K, JSON.stringify({ user: u, pass: p })); } catch {} },
  clear()       { localStorage.removeItem(this._K); },
  getSaved()    { try { return JSON.parse(localStorage.getItem(this._K)) || null; } catch { return null; } },
  cancelTimer() { clearTimeout(this._t); this._t = null; },
  attempt() {
    const c = this.getSaved();
    if (!c?.user || !c?.pass) return false;
    Splash.show(c.user);
    SocketClient.login(c.user, c.pass);
    this._t = setTimeout(() => {
      Splash.hide(); AutoLogin.clear();
      UI.showPage('p-auth'); Auth.showLogin();
      UI.toast('Não foi possível entrar. Faça login.');
    }, 4500);
    return true;
  },
};

/* ── Splash ────────────────────────────────────────────── */
const Splash = {
  _build() {
    if (document.getElementById('mk-splash')) return;
    const d = document.createElement('div'); d.id = 'mk-splash';
    d.innerHTML = `
      <span class="splash-icon">🌿</span>
      <div class="splash-title">MeioKahoot</div>
      <p class="splash-msg" id="splash-msg">Carregando...</p>
      <div class="splash-dots"><span></span><span></span><span></span></div>
      <button class="splash-cancel" onclick="Splash.cancel()">Usar outra conta</button>
    `;
    document.body.appendChild(d);
  },
  show(user) {
    this._build();
    const el  = document.getElementById('mk-splash');
    const msg = document.getElementById('splash-msg');
    if (msg) msg.textContent = user ? `Entrando como ${user}...` : 'Carregando...';
    if (el)  { el.style.display = 'flex'; void el.offsetWidth; el.classList.add('visible'); }
  },
  hide() {
    const el = document.getElementById('mk-splash');
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => { el.style.display = 'none'; }, 320);
  },
  cancel() {
    AutoLogin.cancelTimer(); AutoLogin.clear();
    this.hide();
    setTimeout(() => { UI.showPage('p-auth'); Auth.showLogin(); }, 280);
    Sounds.play('click');
  },
};

/* ── Auth ──────────────────────────────────────────────── */
const Auth = {
  showLogin()    { _show('s-login');    _hide('s-register'); },
  showRegister() { _hide('s-login');    _show('s-register'); Sounds.play('click'); },

  login() {
    const u = document.getElementById('login-user')?.value?.trim();
    const p = document.getElementById('login-pass')?.value;
    if (!u || !p) { UI.toast('Preencha usuário e senha'); return; }
    Sounds.play('click');
    _setBtn('#s-login .btn-primary', 'Entrando...');
    SocketClient.login(u, p);
  },

  onSuccess(u, p) {
    if (u && p) AutoLogin.save(u, p);
    _resetBtn('#s-login .btn-primary', 'Entrar');
    _resetBtn('#s-register .btn-primary', 'Cadastrar');
  },
  onError() {
    _resetBtn('#s-login .btn-primary', 'Entrar');
    _resetBtn('#s-register .btn-primary', 'Cadastrar');
  },

  register() {
    const u = document.getElementById('reg-user')?.value?.trim();
    const p = document.getElementById('reg-pass')?.value;
    const photo = document.getElementById('reg-file')?.dataset?.base64 || '';
    if (!u || !p) { UI.toast('Preencha todos os campos'); return; }
    if (u.length < 2) { UI.toast('Nome muito curto'); return; }
    Sounds.play('click');
    _setBtn('#s-register .btn-primary', 'Cadastrando...');
    SocketClient.register({ user: u, pass: p, name: u, photo });
  },

  previewPhoto(input) { Profile.previewPhoto(input); },

  logout() {
    AutoLogin.clear();

    // Para tudo do jogo (timer, sons, overlays, estado)
    GameUI.forceReset();
    Sounds.stopAll();

    // Desconecta da sala e limpa estado do socket
    SocketClient.leaveGame();

    // Fecha qualquer modal aberto
    Modal.close('modal-profile');
    Modal.close('modal-friends');
    Modal.close('modal-create');
    Modal.close('modal-credits');
    Podium.hide();

    // Reseta o HUD para estado de visitante
    UI.resetHud();

    // Limpa campos de login
    const lu = document.getElementById('login-user');
    const lp = document.getElementById('login-pass');
    if (lu) lu.value = '';
    if (lp) lp.value = '';

    // Volta para a tela de auth
    UI.showPage('p-auth');
    Auth.showLogin();
    UI.toast('Você saiu da conta.');
  },
};

/* ── DeviceManager ─────────────────────────────────────── */
const DeviceManager = {
  _d: 'pc',
  detect() {
    this._d = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent) || window.innerWidth < 700 ? 'mobile' : 'pc';
    return this._d;
  },
  current() { return this._d; },
  apply() {
    document.body.classList.remove('device-mobile', 'device-pc');
    document.body.classList.add(`device-${this._d}`);
    const ic = document.getElementById('device-icon');
    const ch = document.getElementById('h-device');
    if (ic) ic.textContent = this._d === 'mobile' ? '📱' : '💻';
    if (ch) ch.textContent = this._d === 'mobile' ? '📱' : '💻';
  },
  toggle() {
    this._d = this._d === 'pc' ? 'mobile' : 'pc'; this.apply();
    const btn = document.getElementById('btn-device-toggle');
    const tip = document.getElementById('device-tips');
    if (btn) btn.textContent = this._d === 'mobile' ? 'Mudar para PC' : 'Mudar para celular';
    if (tip) tip.textContent = this._d === 'mobile' ? 'Interface para toque ativada' : 'Interface para mouse ativada';
  },
  confirm() {
    this.apply();
    const ov = document.getElementById('ov-device');
    if (ov) ov.style.display = 'none';
    Sounds.play('click');
  },
  showModal() {
    const d = this.detect(); this.apply();
    const ov  = document.getElementById('ov-device');
    const ic  = document.getElementById('device-icon');
    const tip = document.getElementById('device-tips');
    const btn = document.getElementById('btn-device-toggle');
    if (ic)  ic.textContent  = d === 'mobile' ? '📱' : '💻';
    if (tip) tip.textContent = d === 'mobile' ? 'Interface para toque ativada.' : 'Interface para mouse ativada.';
    if (btn) btn.textContent = d === 'mobile' ? 'Mudar para PC' : 'Mudar para celular';
    if (ov)  ov.style.display = 'flex';
  },
};

/* ── Helpers ────────────────────────────────────────────── */
function _show(id) { const e = document.getElementById(id); if (e) e.style.display = 'flex'; }
function _hide(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
function _bind(id, fn) { const e = document.getElementById(id); if (e) e.addEventListener('keydown', ev => { if (ev.key === 'Enter') fn(); }); }
function _setBtn(sel, t) { const b = document.querySelector(sel); if (b) { b.textContent = t; b.disabled = true; } }
function _resetBtn(sel, t) { const b = document.querySelector(sel); if (b) { b.textContent = t; b.disabled = false; } }

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('load', () => {
  _bind('login-user', Auth.login.bind(Auth));
  _bind('login-pass', Auth.login.bind(Auth));
  _bind('reg-user',   Auth.register.bind(Auth));
  _bind('join-pin',   HomeUI.joinRoom.bind(HomeUI));

  DeviceManager.showModal();
  Profile.renderHud();

  if (!AutoLogin.attempt()) {
    UI.showPage('p-auth');
    Auth.showLogin();
  }

  window.addEventListener('online',  () => UI.setNetStatus(true));
  window.addEventListener('offline', () => UI.setNetStatus(false));
});
