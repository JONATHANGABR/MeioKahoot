class TimerManager {
    constructor() {
        this.timers = new Map();
    }

    startTimer(roomId, duration, onTick, onEnd) {
        let timeLeft = duration;
        const interval = setInterval(() => {
            timeLeft--;
            onTick(timeLeft);
            if (timeLeft <= 0) {
                clearInterval(interval);
                onEnd();
            }
        }, 1000);
        this.timers.set(roomId, interval);
    }

    stopTimer(roomId) {
        if (this.timers.has(roomId)) {
            clearInterval(this.timers.get(roomId));
            this.timers.delete(roomId);
        }
    }
}

module.exports = new TimerManager();
