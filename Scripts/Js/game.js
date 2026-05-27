/**
 * Game Core Logic
 */
const Game = {
    currentQuestion: 0,
    score: 0,
    timer: null,

    start() {
        this.loadQuestion(0);
    },

    loadQuestion(index) {
        const q = QuestionManager.get(index);
        UI.renderQuestion(q);
        TimerManager.start(q.time, () => this.onTimeOut());
    },

    submitAnswer(index) {
        TimerManager.stop();
        const correct = QuestionManager.check(this.currentQuestion, index);
        if (correct) {
            this.score += ScoreManager.calculate(TimerManager.timeLeft);
            UI.showFeedback(true);
        } else {
            UI.showFeedback(false);
        }
        
        setTimeout(() => this.next(), 2000);
    },

    next() {
        this.currentQuestion++;
        // Lógica de próxima pergunta ou ranking
    }
};
