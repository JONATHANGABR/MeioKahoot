/* MeioKahoot — Friends.js
   Sistema de amigos simples via localStorage
   Amigos são salvos por nome de usuário.
   Em multi-jogador real, seria via servidor — aqui é local.
*/
const Friends = (() => {
  const KEY = 'mk_friends';

  function _get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function _save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

  function open() {
    Modal.open('modal-friends');
    render();
  }

  function add() {
    const input = document.getElementById('friend-input');
    const name  = input?.value?.trim();
    if (!name) { _toast('Digite um nome'); return; }

    const myName = Profile.getName();
    if (name.toLowerCase() === myName.toLowerCase()) { _toast('Esse é você! 😄'); return; }

    const list = _get();
    if (list.find(f => f.name.toLowerCase() === name.toLowerCase())) {
      _toast('Já é seu amigo!'); return;
    }
    if (list.length >= 50) { _toast('Limite de 50 amigos'); return; }

    list.push({ name, addedAt: Date.now() });
    _save(list);
    if (input) input.value = '';
    render();
    _toast(`${name} adicionado! 🎉`);
  }

  function remove(name) {
    const list = _get().filter(f => f.name.toLowerCase() !== name.toLowerCase());
    _save(list);
    render();
  }

  function render() {
    const el = document.getElementById('friends-list');
    if (!el) return;
    const list = _get();

    if (!list.length) {
      el.innerHTML = `<p style="text-align:center;padding:16px;color:#888;font-size:.85rem">
        Nenhum amigo ainda.<br>Adicione pelo nome de usuário!
      </p>`;
      return;
    }

    el.innerHTML = list.map(f => {
      const letter = (f.name[0] || '?').toUpperCase();
      const date   = new Date(f.addedAt).toLocaleDateString('pt-BR');
      return `
        <div class="friend-row">
          <div class="friend-av">${letter}</div>
          <div class="friend-info">
            <span class="friend-name">${_esc(f.name)}</span>
            <span class="friend-sub">Adicionado em ${date}</span>
          </div>
          <button class="friend-rm" onclick="Friends.remove('${_esc(f.name)}')" title="Remover">✕</button>
        </div>
      `;
    }).join('');
  }

  function getList() { return _get(); }

  function _toast(msg) {
    // Reutiliza o toast da UI se disponível
    if (typeof UI !== 'undefined') { UI.toast(msg); return; }
    alert(msg);
  }

  function _esc(s) { return s.replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }

  // Bind Enter no input
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('friend-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  });

  return { open, add, remove, render, getList };
})();
