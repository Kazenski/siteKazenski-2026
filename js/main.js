// ARQUIVO: js/main.js
import { renderInicioTab } from './inicio/inicio.js';

// Função global para trocar de abas
window.showTab = function(tabId) {
    // Esconde todas as abas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Mostra a aba clicada
    const target = document.getElementById(`${tabId}-content`);
    if (target) {
        target.classList.add('active');
    }

    // Roteamento: Renderiza o conteúdo apenas quando a aba é aberta
    if (tabId === 'inicio') {
        target.innerHTML = ''; // Limpa antes de renderizar
        renderInicioTab();
    }
};

// Inicializa a página principal ao carregar
document.addEventListener('DOMContentLoaded', () => {
    window.showTab('inicio');
});