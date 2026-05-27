class MatchManager {
    constructor() {
        this.matches = new Map();
    }

    createMatch(roomId) {
        this.matches.set(roomId, {
            status: 'waiting',
            players: [],
            currentQuestion: 0
        });
    }

    startMatch(roomId) {
        const match = this.matches.get(roomId);
        if (match) match.status = 'playing';
    }
}

module.exports = new MatchManager();
