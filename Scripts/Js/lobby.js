/**
 * Lobby Script
 */
const Lobby = {
    updateList(players) {
        const list = document.getElementById('player-list');
        if (!list) return;
        
        list.innerHTML = players.map(p => `
            <div class="player-card">
                <span>${p.name}</span>
            </div>
        `).join('');
        
        document.getElementById('player-count').innerText = players.length;
    }
};
