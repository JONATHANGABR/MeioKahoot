/* MeioKahoot — socket.js v5.2 */
const socket = io(window.location.origin, {
  reconnection: true, reconnectionAttempts: 12, reconnectionDelay: 1500, timeout: 8000,
});

// Tornar o socket acessível globalmente para outros módulos (como Profile.js)
window.mkSocket = socket;

let _lu = '', _lp = '';

const SocketClient = {
  _pin: null, _isHost: false, _withBots: false, _qid: null, _inLobby: false, _difficulty: 'facil',
  _loggedIn: false,

  // Método auxiliar para emitir eventos de forma centralizada
  emit(event, data) {
    socket.emit(event, data);
  },

  connect() {
    socket.on('connect',    () => UI.setNetStatus(true));
    socket.on('disconnect', () => { UI.setNetStatus(false); UI.toast('Conexão perdida. Reconectando...'); });
    socket.on('reconnect',  () => {
      UI.setNetStatus(true); UI.toast('Reconectado!');
      if (this._loggedIn && this._pin) this.joinRoom(this._pin);
    });

    socket.on('authOk', data => {
      AutoLogin.cancelTimer();
      this._loggedIn = true;
      Auth.onSuccess(_lu, _lp);
      Profile.setFromAuth({ name: data.name || data.user, photo: data.photo, user: data.user });
      Splash.hide();
      Sounds.play('click'); Sounds.playBg('lobby');
      SocketClient.loadFriends();
      HomeUI.checkRejoin();
      UI.showPage('p-home');
    });

    socket.on('authErr', msg => {
      const splash = document.getElementById('mk-splash');
      const wasAutoLogin = !!splash?.classList.contains('visible');
      AutoLogin.cancelTimer();
      Auth.onError();
      this._loggedIn = false;
      this._pin = null;
      this._isHost = false;
      this._inLobby = false;
      this._qid = null;

      if (wasAutoLogin) AutoLogin.clear();
      Splash.hide();

      const showLogin = () => {
        UI.showPage('p-auth');
        Auth.showLogin();
        UI.toast(wasAutoLogin ? 'Sessão expirada. Faça login.' : (msg || 'Usuário ou senha incorretos.'));
      };
      setTimeout(showLogin, wasAutoLogin ? 300 : 0);
      Sounds.play('wrong');
    });

    socket.on('roomCreated', pin => {
      if (!this._loggedIn) return;
      this._pin = pin; this._isHost = true; this._inLobby = true;
      Lobby.setPin(pin); Lobby.showHostControls(true);
      localStorage.setItem('mk_lastPin', pin);
      UI.showPage('p-lobby'); Sounds.playBg('lobby');
      if (this._withBots) { socket.emit('addBots', pin); this._withBots = false; }
    });

    socket.on('joined', data => {
      if (!this._loggedIn) return;
      this._pin = data.pin; this._isHost = false; this._inLobby = true;
      Lobby.setPin(data.pin); Lobby.showHostControls(false);
      localStorage.setItem('mk_lastPin', data.pin);
      UI.showPage('p-lobby'); Sounds.playBg('lobby');
    });

    socket.on('hostChanged', () => {
      if (!this._loggedIn) return;
      this._isHost = true; Lobby.showHostControls(true); UI.toast('Você é o host agora.');
    });
    socket.on('pList', players => {
      if (!this._loggedIn) return;
      Lobby.updateList(players);
    });
    socket.on('matchStarting', () => {});

    socket.on('q', data => {
      if (!this._loggedIn || !this._pin) return;
      this._inLobby = false;
      this._qid = data.qid;
      Sounds.stopBg();
      GameUI.onQuestion(data);
    });

    socket.on('result', data => {
      if (!this._loggedIn || !this._pin) return;
      GameUI.onScoreSync({ totalScore: data.totalScore, combo: data.combo, earned: data.earned });
    });

    socket.on('reveal', data => {
      if (!this._loggedIn || !this._pin) return;
      GameUI.onReveal(data);
    });

    socket.on('scoreSync', data => {
      if (!this._loggedIn || !this._pin) return;
      GameUI.onScoreSync({ totalScore: data.totalScore, combo: data.combo, earned: 0 });
    });

    socket.on('gameOver', payload => {
      if (!this._loggedIn || !this._pin) return;
      this._inLobby = false;
      GameUI.onGameOver(payload);
    });

    socket.on('profileUpdated', data => {
      if (!this._loggedIn) return;
      Profile.setFromAuth(data);
      UI.toast('Perfil sincronizado com servidor! ✅');
    });

    socket.on('leaderboardData', p => RankingBoard.render(p));
    socket.on('roomsData', data => RoomsBrowser.render(data));
    socket.on('roomInvite', data => RoomInvites.show(data));
    socket.on('friendsData', data => Friends.render(data));
    socket.on('friendInfo', msg => { UI.toast(msg || 'Amigos atualizado'); Sounds.play('click'); });
    socket.on('friendErr', msg => { UI.toast(msg || 'Erro no sistema de amigos'); Sounds.play('wrong'); });
    socket.on('err', msg => { UI.toast(msg || 'Erro no servidor'); Sounds.play('wrong'); });
  },

  login(u, p)    { _lu = u; _lp = p; socket.emit('login', { user: u, pass: p }); },
  register(d)    { _lu = d.user; _lp = d.pass; socket.emit('register', d); },

  createRoom(theme) {
    this._withBots = false;
    socket.emit('createRoom', { playerName: Profile.getName(), playerPhoto: Profile.getPhoto(), device: DeviceManager.current(), theme });
  },
  createRoomWithBots(theme) {
    this._withBots = true;
    socket.emit('createRoom', { playerName: Profile.getName(), playerPhoto: Profile.getPhoto(), device: DeviceManager.current(), theme, isBotMatch: true });
  },
  joinRoom(pin)  { socket.emit('joinRoom', { pin, name: Profile.getName(), photo: Profile.getPhoto(), device: DeviceManager.current() }); },
  setDifficulty(diff) { this._difficulty = diff; },
  startGame()    { if (this._pin) socket.emit('startGame', { pin: this._pin, difficulty: this._difficulty }); },
  sendAnswer(idx){ if (!this._pin) return; socket.emit('answer', { pin: this._pin, idx, qid: this._qid }); },
  loadRanking()  { socket.emit('getLeaderboard'); },
  loadRooms()    { if (this._loggedIn) socket.emit('getRooms'); },
  loadFriends()  { if (this._loggedIn) socket.emit('getFriends'); },
  sendFriendRequest(user) { if (this._loggedIn) socket.emit('sendFriendRequest', { to: user }); },
  acceptFriendRequest(user) { if (this._loggedIn) socket.emit('acceptFriendRequest', { from: user }); },
  rejectFriendRequest(user) { if (this._loggedIn) socket.emit('rejectFriendRequest', { from: user }); },
  removeFriend(user) { if (this._loggedIn) socket.emit('removeFriend', { user }); },
  inviteFriend(user) { if (this._loggedIn && this._pin) socket.emit('inviteFriend', { to: user, pin: this._pin }); },
  currentPin() { return this._pin; },
  canInvite() { return this._loggedIn && this._inLobby && !!this._pin; },

  leaveGame() {
    if (this._pin) {
      socket.emit('leaveRoom', this._pin);
    }
    this._pin = null;
    this._isHost = false;
    this._withBots = false;
    this._inLobby = false;
    this._difficulty = 'facil';
    this._qid = null;
    this._loggedIn = false;
  },
};

SocketClient.connect();
