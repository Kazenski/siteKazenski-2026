import { auth, db } from './core/firebase.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORTAÇÃO DOS RENDERIZADORES DE PÁGINA
import { renderInicioTab } from './inicio/inicio.js';
import { renderAlunoTechTab } from './alunoTech/perfilTech.js';

// ============================================================================
// HIERARQUIA DE PERMISSÕES (Baseado nos booleanos exatos do Firebase)
// ============================================================================

let userRoles = {
    Admin: false,
    Professor: false,
    Coordenacao: false,
    moderador: false,
    Aluno: false,
    Visitante: true 
};

let activeTabId = 'inicio';

// Definição rigorosa da arquitetura de menus e quem pode ver o quê
const MENU_ARCHITECTURE = [
    { id: 'inicio', label: 'Início', showTo: (r) => true }, 
    { id: 'conteudos', label: 'Conteúdos', showTo: (r) => true },
    { id: 'projetos', label: 'Projetos', showTo: (r) => true },
    { id: 'conexao-aluno', label: 'Conexão Aluno', showTo: (r) => true },
    { id: 'atualizacoes', label: 'Atualizações', showTo: (r) => true },
    
    // REGRAS DE OCULTAÇÃO SOLICITADAS:
    // Aluno vê até Aluno Tech. Admin vê tudo. Professor/Coordenação vê tudo menos Admin.
    { id: 'aluno-tech', label: 'Aluno Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.moderador || r.Aluno },
    { id: 'moderador-tech', label: 'Moderador Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.moderador },
    { id: 'professor-tech', label: 'Professor Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao },
    { id: 'admin-tech', label: 'Admin Tech', showTo: (r) => r.Admin }
];

// ============================================================================
// GERENCIAMENTO DE AUTHENTICATION
// ============================================================================

onAuthStateChanged(auth, async (user) => {
    const loadingEl = document.getElementById('user-loading');
    const infoEl = document.getElementById('user-info');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');
    const loginBtn = document.getElementById('btn-login-visitor');

    // Reset padrão
    userRoles = { Admin: false, Professor: false, Coordenacao: false, moderador: false, Aluno: false, Visitante: true };
    let displayRoleName = 'Visitante';

    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                
                // Mapeamento direto dos campos booleanos do seu Firebase
                userRoles.Admin = data.Admin === true;
                userRoles.Professor = data.Professor === true;
                userRoles.Coordenacao = data.Coordenacao === true;
                userRoles.moderador = data.moderador === true;
                userRoles.Aluno = data.Aluno === true;
                userRoles.Visitante = false;

                // Define o rótulo de exibição baseado na maior autoridade
                if (userRoles.Admin) displayRoleName = 'Admin';
                else if (userRoles.Coordenacao) displayRoleName = 'Coordenação';
                else if (userRoles.Professor) displayRoleName = 'Professor';
                else if (userRoles.moderador) displayRoleName = 'Moderador';
                else if (userRoles.Aluno) displayRoleName = 'Aluno';
            }
        } catch (error) {
            console.error("Erro ao mapear permissões:", error);
        }

        emailEl.textContent = user.email;
        roleEl.textContent = displayRoleName;
        loadingEl.classList.add('hidden');
        loginBtn.classList.add('hidden');
        infoEl.classList.remove('hidden');
        infoEl.classList.add('flex');
    } else {
        loadingEl.classList.add('hidden');
        infoEl.classList.add('hidden');
        infoEl.classList.remove('flex');
        loginBtn.classList.remove('hidden');
    }

    // Reconstrói o menu com as novas permissões
    buildTopMenu();
    
    // Força o carregamento da aba inicial ou da aba que estava aberta
    window.showTab(activeTabId);
});

// ============================================================================
// CONSTRUÇÃO DO MENU SUPERIOR
// ============================================================================

function buildTopMenu() {
    const navContainer = document.getElementById('top-nav-menu');
    if (!navContainer) return;
    navContainer.innerHTML = '';

    MENU_ARCHITECTURE.forEach(item => {
        if (item.showTo(userRoles)) {
            const btn = document.createElement('button');
            btn.textContent = item.label;
            
            // Estilização idêntica ao que você pediu
            const isActive = activeTabId === item.id;
            btn.className = `nav-item-btn px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${isActive ? 'border-blue-500 text-blue-400 bg-slate-800/50' : 'border-transparent text-slate-400 hover:text-slate-200'}`;
            
            btn.onclick = () => window.showTab(item.id);
            btn.dataset.target = item.id;
            
            navContainer.appendChild(btn);
        }
    });
}

// ============================================================================
// ROTEADOR CENTRAL (Troca de Abas)
// ============================================================================

window.showTab = function(tabId) {
    // Validação de Segurança
    const routeConfig = MENU_ARCHITECTURE.find(m => m.id === tabId);
    if (routeConfig && !routeConfig.showTo(userRoles)) {
        alert("Acesso Negado.");
        return window.showTab('inicio');
    }

    activeTabId = tabId;
    
    // Atualiza visual dos botões do menu
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
        const isTarget = btn.dataset.target === tabId;
        btn.classList.toggle('border-blue-500', isTarget);
        btn.classList.toggle('text-blue-400', isTarget);
        btn.classList.toggle('bg-slate-800/50', isTarget);
        btn.classList.toggle('border-transparent', !isTarget);
        btn.classList.toggle('text-slate-400', !isTarget);
    });

    // Gerencia visibilidade das seções
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('active');
    });

    const targetContainer = document.getElementById(`${tabId}-content`);
    if (targetContainer) {
        targetContainer.classList.remove('hidden');
        targetContainer.classList.add('active');
    }

    // GATILHOS DE RENDERIZAÇÃO
    if (tabId === 'inicio') {
        // Sempre chamamos o render para garantir que o carrossel e o background resetem
        renderInicioTab();
    } 
    else if (tabId === 'aluno-tech') {
        // Se a aba estiver vazia, renderiza o perfil
        if (targetContainer && targetContainer.innerHTML.trim() === '') {
            renderAlunoTechTab();
        }
    }
    else if (tabId === 'login') {
        renderLoginTab();
    }
};

// ============================================================================
// LOGIN E LOGOUT
// ============================================================================

function renderLoginTab() {
    const target = document.getElementById('app-main');
    // Criar um modal ou aba de login caso o usuário clique em "Fazer Login"
    // Por enquanto, usamos um prompt simples ou você pode direcionar para uma aba de login dedicada
    const email = prompt("Email:");
    const pass = prompt("Senha:");
    if(email && pass) {
        signInWithEmailAndPassword(auth, email, pass).catch(e => alert("Erro: " + e.message));
    }
}

window.logout = async function() {
    if (confirm("Deseja sair?")) {
        try {
            await signOut(auth);
            window.showTab('inicio');
        } catch (error) {
            alert("Erro: " + error.message);
        }
    }
};