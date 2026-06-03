/* MeioKahoot — Friends.js
   Sistema de amizade com pedido + aceite via servidor.
   O pedido só vira amizade quando o outro usuário aceitar.
*/
const Friends = (() => {
  let _state = { friends: [], requests: [] };

  function _cacheKey() {
    const name = (typeof Profile !== 'undefined' ? Profile.getName?.() : '') || 'visitante';
    return 'mk_friends_cache_' + String(name).toLowerCase();
  }
  function _loadCache() {
    try { return JSON.parse(localStorage.getItem(_cacheKey())) || null; } catch { return null; }
  }
  function _saveCache() {
    try { localStorage.setItem(_cacheKey(), JSON.stringify(_state)); } catch {}
  }

  function open() {
    Modal.open('modal-friends');
    const cached = _loadCache();
    if (cached) render(cached); else render();
    if (typeof SocketClient !== 'undefined') SocketClient.loadFriends();
  }

  function add() {
    const input = document.getElementById('friend-input');
    const name = input?.value?.trim();
    if (!name) return _toast('Digite o nome do usuário');

    const myName = Profile.getName();
    if (name.toLowerCase() === myName.toLowerCase()) return _toast('Esse é você! 😄');

    if (typeof SocketClient === 'undefined') return _toast('Conexão ainda não carregou.');
    SocketClient.sendFriendRequest(name);
    if (input) input.value = '';
  }

  function accept(user) {
    if (typeof SocketClient !== 'undefined') SocketClient.acceptFriendRequest(user);
  }

  function reject(user) {
    if (typeof SocketClient !== 'undefined') SocketClient.rejectFriendRequest(user);
  }

  function remove(user) {
    if (!confirm(`Remover ${user} dos amigos?`)) return;
    if (typeof SocketClient !== 'undefined') SocketClient.removeFriend(user);
  }

  function render(data) {
    if (data) {
      _state = {
        friends: Array.isArray(data.friends) ? data.friends : [],
        requests: Array.isArray(data.requests) ? data.requests : [],
      };
      _saveCache();
    }

    const reqBox = document.getElementById('friends-requests');
    const listBox = document.getElementById('friends-list');
    const badge = document.getElementById('friends-badge');

    if (badge) {
      const n = _state.requests.length;
      badge.textContent = n ? String(n) : '';
      badge.style.display = n ? 'inline-flex' : 'none';
    }

    _renderRequests(reqBox);
    _renderFriends(listBox);
  }

  function _renderRequests(el) {
    if (!el) return;
    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'friends-section-title';
    title.textContent = 'Pedidos recebidos';
    el.appendChild(title);

    if (!_state.requests.length) {
      const empty = document.createElement('p');
      empty.className = 'friend-empty';
      empty.textContent = 'Nenhum pedido pendente.';
      el.appendChild(empty);
      return;
    }

    _state.requests.forEach(r => {
      const user = r.from || r.user || r.name || String(r);
      const row = _friendRow(user, r.at, 'Quer ser seu amigo');
      const actions = document.createElement('div');
      actions.className = 'friend-actions';

      const ok = document.createElement('button');
      ok.className = 'friend-accept';
      ok.textContent = '✓';
      ok.title = 'Aceitar';
      ok.onclick = () => accept(user);

      const no = document.createElement('button');
      no.className = 'friend-reject';
      no.textContent = '✕';
      no.title = 'Recusar';
      no.onclick = () => reject(user);

      actions.append(ok, no);
      row.appendChild(actions);
      el.appendChild(row);
    });
  }

  function _renderFriends(el) {
    if (!el) return;
    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'friends-section-title';
    title.textContent = 'Meus amigos';
    el.appendChild(title);

    if (!_state.friends.length) {
      const empty = document.createElement('p');
      empty.className = 'friend-empty';
      empty.innerHTML = 'Nenhum amigo ainda.<br>Envie um pedido pelo nome de usuário!';
      el.appendChild(empty);
      return;
    }

    _state.friends.forEach(f => {
      const user = f.user || f.name || String(f);
      const row = _friendRow(user, f.since || f.addedAt, f.room ? `Em sala ${f.room.pin} · ${f.room.theme}` : 'Amigos desde');

      const actions = document.createElement('div');
      actions.className = 'friend-actions';

      if (f.room?.pin) {
        const join = document.createElement('button');
        join.className = 'friend-invite';
        join.textContent = 'Entrar';
        join.title = 'Entrar na sala desse amigo';
        join.onclick = () => { Modal.close('modal-friends'); UI.showPage('p-join'); RoomsBrowser.join(f.room.pin); };
        actions.appendChild(join);
      }

      if (typeof SocketClient !== 'undefined' && SocketClient.canInvite?.()) {
        const inv = document.createElement('button');
        inv.className = 'friend-invite';
        inv.textContent = 'Convidar';
        inv.title = 'Convidar para sua sala atual';
        inv.onclick = () => SocketClient.inviteFriend(user);
        actions.appendChild(inv);
      }

      const rm = document.createElement('button');
      rm.className = 'friend-rm';
      rm.textContent = '✕';
      rm.title = 'Remover';
      rm.onclick = () => remove(user);
      actions.appendChild(rm);

      row.appendChild(actions);
      el.appendChild(row);
    });
  }

  function _friendRow(user, dateValue, prefix) {
    const row = document.createElement('div');
    row.className = 'friend-row';

    const av = document.createElement('div');
    av.className = 'friend-av';
    av.textContent = (user?.[0] || '?').toUpperCase();

    const info = document.createElement('div');
    info.className = 'friend-info';

    const name = document.createElement('span');
    name.className = 'friend-name';
    name.textContent = user || 'Usuário';

    const sub = document.createElement('span');
    sub.className = 'friend-sub';
    const date = dateValue ? new Date(dateValue).toLocaleDateString('pt-BR') : '';
    sub.textContent = date ? `${prefix} ${date}` : prefix;

    info.append(name, sub);
    row.append(av, info);
    return row;
  }

  function getList() { return _state.friends; }

  function _toast(msg) {
    if (typeof UI !== 'undefined') return UI.toast(msg);
    alert(msg);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('friend-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  });

  return { open, add, accept, reject, remove, render, getList };
})();
