/**
 * Server-side Socket Handler
 */
const MatchManager = require('../Game/MatchManager');
const PlayerManager = require('../Players/PlayerManager');

module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('joinRoom', (data) => {
            const player = PlayerManager.create(socket.id, data.name);
            socket.join('main-room');
            
            io.to('main-room').emit('updatePlayerList', PlayerManager.getAll());
        });

        socket.on('submitAnswer', (data) => {
            const score = MatchManager.processAnswer(socket.id, data.answer);
            socket.emit('answerResult', { score });
        });

        socket.on('disconnect', () => {
            PlayerManager.remove(socket.id);
            io.to('main-room').emit('updatePlayerList', PlayerManager.getAll());
        });
    });
};
