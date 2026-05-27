/**
 * Main Application Logic
 */
const App = {
    init() {
        console.log("MeioKahoot Inicializado");
        UI.showPage('login-screen');
        
        // Permitir entrar apertando "Enter" no teclado
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.join();
        });
    },

    join() {
        const nameInput = document.getElementById('playerName');
        const name = nameInput.value.trim();

        if (name) {
            console.log("Entrando como:", name);
            SocketClient.join(name, 'main-room');
            UI.showPage('lobby-waiting');
            document.getElementById('display-name').innerText = name;
        } else {
            alert("Por favor, digite um Nome!");
        }
    }
};

window.onload = () => App.init();
