/* MeioKahoot — socket.js */
const socket = io(window.location.origin, {
  reconnection: true, reconnectionAttempts: 12, reconnectionDelay: 1500, timeout: 8000,
});

let _lu = '', _lp = '';

const SocketClient = {
  _pin: null, _isHost: false, _withBots: false, _qid: null,

  connect() {
    socket.on('connect',    () => UI.setNetStatus(true));
    socket.on('disconnect', () => { UI.setNetStatus(false); UI.toast('Conexão perdida. Reconectando...'); });
    socket.on('reconnect',  () => { UI.setNetStatus(true); UI.toast('Reconectado!'); if (this._pin) this.joinRoom(this._pin); });

    socket.on('authOk', data => {
      AutoLogin.cancelTimer();
      Auth.onSuccess(_lu, _lp);
      Profile.setFromAuth({ name: data.name || data.user, photo: data.photo, user: data.user });
      Splash.hide();
      Sounds.play('click'); Sounds.playBg('lobby');
      HomeUI.checkRejoin();
      UI.showPage('p-home');
    });

    socket.on('authErr', msg => {
      AutoLogin.cancelTimer(); Splash.hide(); Auth.onError();
      const splash = document.getElementById('mk-splash');
      if (splash?.classList.contains('visible')) {
        AutoLogin.clear();
        setTimeout(() => { UI.showPage('p-auth'); Auth.showLogin(); UI.toast('Sessão expirada. Faça login.'); }, 300);
      } else {
        UI.toast(msg || 'Usuário ou senha incorretos.');
      }
      Sounds.play('wrong');
    });

    socket.on('roomCreated', pin => {
      this._pin = pin; this._isHost = true;
      Lobby.setPin(pin); Lobby.showHostControls(true);
      localStorage.setItem('mk_lastPin', pin);
      UI.showPage('p-lobby'); Sounds.playBg('lobby');
      if (this._withBots) { socket.emit('addBots', pin); this._withBots = false; }
    });

    socket.on('joined', data => {
      this._pin = data.pin; this._isHost = false;
      Lobby.setPin(data.pin); Lobby.showHostControls(false);
      localStorage.setItem('mk_lastPin', data.pin);
      UI.showPage('p-lobby'); Sounds.playBg('lobby');
    });

    socket.on('hostChanged', () => { this._isHost = true; Lobby.showHostControls(true); UI.toast('Você é o host agora.'); });
    socket.on('pList',       players => Lobby.updateList(players));
    socket.on('matchStarting', () => {});

    socket.on('q', data => {
      this._qid = data.qid;
      Sounds.stopBg();
      GameUI.onQuestion(data);
    });

    socket.on('result', data => {
      GameUI.onScoreSync({ totalScore: data.totalScore, combo: data.combo, earned: data.earned });
    });

    socket.on('reveal',    data    => GameUI.onReveal(data));
    socket.on('scoreSync', data    => GameUI.onScoreSync({ totalScore: data.totalScore, combo: data.combo, earned: 0 }));
    socket.on('gameOver',  rank    => GameUI.onGameOver(rank));
    socket.on('leaderboardData', p => RankingBoard.render(p));
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
    socket.emit('createRoom', { playerName: Profile.getName(), playerPhoto: Profile.getPhoto(), device: DeviceManager.current(), theme });
  },
  joinRoom(pin)  { socket.emit('joinRoom', { pin, name: Profile.getName(), photo: Profile.getPhoto(), device: DeviceManager.current() }); },
  startGame()    { if (this._pin) socket.emit('startGame', this._pin); },
  sendAnswer(idx){ socket.emit('answer', { pin: this._pin, idx, qid: this._qid }); },
  loadRanking()  { socket.emit('getLeaderboard'); },
};

SocketClient.connect();
