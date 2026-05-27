/**
 * Player Manager
 */
class PlayerManager {
    constructor() {
        this.players = new Map();
    }

    create(id, name) {
        const player = { id, name, score: 0, streak: 0 };
        this.players.set(id, player);
        return player;
    }

    remove(id) {
        this.players.delete(id);
    }

    getAll() {
        return Array.from(this.players.values());
    }

    getById(id) {
        return this.players.get(id);
    }
}

module.exports = new PlayerManager();
