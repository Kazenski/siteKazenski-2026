// ARQUIVO: js/main.js

import { auth, db } from './core/firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Importa os renderizadores (Vamos importar o Inicio por enquanto)
import { renderInicioTab } from './inicio/inicio.js';
// Em breve você vai criar os outros:
// import { renderConteudosTab } from './conteudos/conteudos.js';
// import { renderAdminTechTab } from './adminTech/adminTech.js';
// ...

// ============================================================================
// ESTRUTURA DE NAVEGAÇÃO E PERMISSÕES (RBAC)
// ============================================================================
const MENU_ARCHITECTURE = [
    { id: 'inicio', label: 'Início', roles: ['ALL'] },
    { id: 'conteudos', label: 'Conteúdos', roles: ['ALL'] },
    { id: 'projetos', label: 'Projetos', roles: ['ALL'] },
    { id: 'conexao-aluno', label: 'Conexão Aluno', roles: ['ALL'] },
    { id: 'atualizacoes', label: 'Atualizações', roles: ['ALL'] },
    { id: 'aluno-tech', label: 'Aluno Tech', roles: ['Aluno', 'moderador', 'Professor', 'Coordenacao', 'Admin'] },
    { id: 'moderador-tech', label: 'Moderador Tech', roles: ['moderador', 'Professor', 'Coordenacao', 'Admin'] },
    { id: 'professor-tech', label: 'Professor Tech', roles: ['Professor', 'Coordenacao', 'Admin'] },
    { id: 'admin-tech', label: 'Admin Tech', roles: ['Admin'] }
];

let currentUserRole = 'Visitante'; // Cargo Padrão
let activeTabId = 'inicio';

// ============================================================================
// GERENCIAMENTO DE ESTADO / AUTH
// ============================================================================

onAuthStateChanged(auth, async (user) => {
    const loadingEl = document.getElementById('user-loading');
    const infoEl = document.getElementById('user-info');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');

    if (user) {
        try {
            // Busca o cargo do usuário na coleção 'users'
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists() && userDoc.data().role) {
                currentUserRole = userDoc.data().role; 
            } else {
                // Se o usuário logado não tiver doc na coleção users, assume 'Visitante'
                currentUserRole = 'Visitante';
            }
        } catch (error) {
            console.error("Erro ao buscar permissões do usuário:", error);
            currentUserRole = 'Visitante';
        }

        // Atualiza a Interface de Usuário
        emailEl.textContent = user.email;
        roleEl.textContent = currentUserRole;
        loadingEl.classList.add('hidden');
        infoEl.classList.remove('hidden');
        infoEl.classList.add('flex');
    } else {
        // Usuário deslogado
        currentUserRole = 'Visitante';
        loadingEl.classList.add('hidden');
        infoEl.classList.add('hidden');
        infoEl.classList.remove('flex');
        // Pode ativar aqui um botão de Login se desejar no futuro
    }

    // Renderiza o menu superior baseado nas permissões obtidas
    buildTopMenu();
    
    // Força a renderização da aba atual (para checar permissão ou iniciar)
    window.showTab(activeTabId);
});

// ============================================================================
// CONSTRUÇÃO DA INTERFACE DO MENU
// ============================================================================

function buildTopMenu() {
    const navContainer = document.getElementById('top-nav-menu');
    navContainer.innerHTML = '';

    MENU_ARCHITECTURE.forEach(item => {
        // Verifica se o usuário atual tem permissão para ver este menu
        const hasAccess = item.roles.includes('ALL') || item.roles.includes(currentUserRole);

        if (hasAccess) {
            const btn = document.createElement('button');
            btn.textContent = item.label;
            btn.className = `nav-item-btn px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${activeTabId === item.id ? 'border-blue-500 text-blue-400 bg-slate-800/50' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`;
            btn.onclick = () => window.showTab(item.id);
            btn.dataset.target = item.id;
            
            navContainer.appendChild(btn);
        }
    });
}

function updateMenuStyles() {
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
        if (btn.dataset.target === activeTabId) {
            btn.classList.replace('border-transparent', 'border-blue-500');
            btn.classList.replace('text-slate-400', 'text-blue-400');
            btn.classList.add('bg-slate-800/50');
        } else {
            btn.classList.replace('border-blue-500', 'border-transparent');
            btn.classList.replace('text-blue-400', 'text-slate-400');
            btn.classList.remove('bg-slate-800/50');
        }
    });
}

// ============================================================================
// ROTEADOR CENTRAL (Pintar os conteúdos)
// ============================================================================

window.showTab = function(tabId) {
    // 1. Verificação de Segurança (Anti-Hack no HTML)
    const routeConfig = MENU_ARCHITECTURE.find(m => m.id === tabId);
    if (routeConfig && !routeConfig.roles.includes('ALL') && !routeConfig.roles.includes(currentUserRole)) {
        alert("Acesso Negado. Privilégios insuficientes.");
        return;
    }

    // 2. Atualiza estado e UI
    activeTabId = tabId;
    updateMenuStyles();

    // 3. Esconde todos os conteúdos
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // 4. Mostra o Contentor Alvo
    const targetContainer = document.getElementById(`${tabId}-content`);
    if (targetContainer) {
        targetContainer.classList.add('active');
    }

    // 5. Aciona o Renderizador Específico (Lazy Loading do Vanilla)
    if (tabId === 'inicio') {
        if(targetContainer.innerHTML === '') renderInicioTab();
    } 
    // Futuras rotas vão entrar aqui:
    // else if (tabId === 'conteudos') renderConteudosTab();
    // else if (tabId === 'admin-tech') renderAdminTechTab();
    else {
        // Fallback temporário para páginas não construídas ainda
        targetContainer.innerHTML = `
            <div class="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-950">
                <i class="fas fa-tools text-6xl mb-4 text-blue-900/50"></i>
                <h2 class="text-2xl font-cinzel text-slate-400 uppercase tracking-widest">Em Construção</h2>
                <p class="text-sm mt-2">Módulo '${tabId}' está a ser forjado.</p>
            </div>
        `;
    }
};

// ============================================================================
// FUNÇÕES GLOBAIS EXPOSTAS
// ============================================================================

window.logout = async function() {
    if (confirm("Deseja desconectar sua conta?")) {
        try {
            await signOut(auth);
            // Ao deslogar, o onAuthStateChanged é acionado, muda pra Visitante e recria os menus
            window.showTab('inicio'); // Volta pra home seguro
        } catch (error) {
            alert("Erro ao sair: " + error.message);
        }
    }
};

// Inicialização de segurança (antes do Firebase responder)
buildTopMenu();