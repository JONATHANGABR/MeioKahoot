class ScoreManager {
    static calculate(timeLeft, basePoints = 500) {
        // Kahoot Formula: 1000 * (1 - ((response_time / total_time) / 2))
        return Math.floor(basePoints + (timeLeft * 25));
    }
}

module.exports = ScoreManager;
