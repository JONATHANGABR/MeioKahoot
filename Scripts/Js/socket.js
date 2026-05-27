/**
 * Client-side Socket Handler
 * Gerencia a comunicação em tempo real com o servidor DNS/IP
 */
const socket = io(window.location.origin); // Detecta automaticamente o endereço (IP ou DNS)

const SocketClient = {
    connect() {
        socket.on('connect', () => {
            console.log("Conectado ao servidor MeioKahoot");
        });

        socket.on('updatePlayerList', (players) => {
            Lobby.updateList(players);
        });

        socket.on('gameStarted', (data) => {
            Game.init(data);
        });

        socket.on('receiveRanking', (data) => {
            Ranking.show(data);
        });
    },

    join(name, room) {
        socket.emit('joinRoom', { name, room });
    },

    sendAnswer(answerIndex) {
        socket.emit('submitAnswer', { answer: answerIndex });
    }
};

SocketClient.connect();
