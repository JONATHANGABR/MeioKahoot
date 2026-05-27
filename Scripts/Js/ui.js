const UI = {
    showPage(id) {
        // Esconde todas as divs que tem a classe 'page'
        document.querySelectorAll('.page').forEach(p => {
            p.style.display = 'none';
        });
        
        // Mostra a página solicitada
        const target = document.getElementById(id);
        if (target) {
            target.style.display = 'flex';
        }
    },

    renderQuestion(q) {
        const container = document.getElementById('question-area');
        container.innerHTML = `
            <h2 style="font-size: 2.5rem; margin-bottom: 2rem;">${q.question}</h2>
            <div class="options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%; max-width: 900px;">
                ${q.options.map((opt, i) => `
                    <button class="opt-btn color-${i}" onclick="Game.submitAnswer(${i})">${opt}</button>
                `).join('')}
            </div>
        `;
    }
};
