const fs = require('fs');
const path = require('path');

class QuestionManager {
    constructor() {
        this.questions = [];
    }

    loadTheme(themeName) {
        const filePath = path.join(__dirname, `../../Data/Questoes/${themeName}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.questions = data.questions;
        return this.questions;
    }

    getQuestion(index) {
        return this.questions[index];
    }
}

module.exports = new QuestionManager();
