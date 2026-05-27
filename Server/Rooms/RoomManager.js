/**
 * Room Manager
 */
class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(id) {
        this.rooms.set(id, {
            id,
            players: [],
            status: 'lobby'
        });
    }

    addPlayer(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (room) room.players.push(playerId);
    }
}

module.exports = new RoomManager();
