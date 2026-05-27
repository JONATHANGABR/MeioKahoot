/**
 * Utilitário para carregar questões dinamicamente via Fetch
 */
async function carregarPerguntas(tema) {
    try {
        const response = await fetch(`../../Data/Questoes/${tema}.json`);
        const data = await response.json();
        return data.questions;
    } catch (error) {
        console.error("Erro ao carregar questões:", error);
        return [];
    }
}
