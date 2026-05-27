/**
 * MeioKahoot Sound Manager (Robust Version)
 * Gerencia o áudio de forma segura: se o arquivo não existir, o jogo continua.
 */
const Sounds = {
    // Lista de sons (nome do arquivo)
    files: {
        click: 'Click.mp3',
        correct: 'Correct.mp3',
        wrong: 'Incorrrect.mp3',
        timer: 'Coundown.mp3',
        lobby: 'Lobby.mp3',
        countdown: 'Alarm.mp3',
        win: 'victory.mp3'
    },
    
    instances: {},
    available: {}, // Monitora quais sons foram carregados com sucesso

    init() {
        console.log("[Sounds] Inicializando sistema de áudio...");
        for (let key in this.files) {
            const audio = new Audio(`/Assets/Audio/${this.files[key]}`);
            
            // Tenta pré-carregar
            audio.addEventListener('canplaythrough', () => {
                this.available[key] = true;
            }, { once: true });

            // Se der erro (arquivo não existe), desativa o som silenciosamente
            audio.onerror = () => {
                console.warn(`[Sounds] Aviso: O arquivo ${this.files[key]} não foi encontrado. O jogo continuará sem este som.`);
                this.available[key] = false;
            };

            this.instances[key] = audio;
        }
    },

    play(key, loop = false) {
        // Só tenta tocar se o áudio foi carregado e está marcado como disponível
        if (this.instances[key] && this.available[key] !== false) {
            try {
                this.instances[key].currentTime = 0;
                this.instances[key].loop = loop;
                
                const promise = this.instances[key].play();
                
                if (promise !== undefined) {
                    promise.catch(error => {
                        // Isso evita erros no console se o usuário ainda não interagiu com a página
                        // ou se o arquivo sumiu no meio do caminho
                        this.available[key] = false;
                    });
                }
            } catch (e) {
                this.available[key] = false;
                console.log(`[Sounds] Erro ao tentar tocar ${key}:`, e.message);
            }
        }
    },

    stop(key) {
        if (this.instances[key]) {
            this.instances[key].pause();
            this.instances[key].currentTime = 0;
        }
    }
};

// Inicializa o sistema de som
Sounds.init();
