import { auth, db } from './core/firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORTAÇÃO DOS RENDERIZADORES DE PÁGINA
import { renderInicioTab } from './inicio/inicio.js';
import { renderAlunoTechTab } from './alunoTech/perfilTech.js';
// Em breve criaremos os outros:
// import { renderAdminTechTab } from './adminTech/admin.js';

// ============================================================================
// HIERARQUIA DE PERMISSÕES (Baseado nos booleanos do Firebase)
// ============================================================================

// Guarda o estado de permissões do usuário atual logado
let userRoles = {
    Admin: false,
    Professor: false,
    Coordenacao: false,
    moderador: false,
    Aluno: false,
    Visitante: true // Visitante é true por padrão se nada for satisfeito
};

// Aba que está atualmente aberta no navegador
let activeTabId = 'inicio';

const MENU_ARCHITECTURE = [
    // PÚBLICAS
    { id: 'inicio', label: 'Início', showTo: (r) => true }, // Todos veem
    { id: 'conteudos', label: 'Conteúdos', showTo: (r) => true },
    { id: 'projetos', label: 'Projetos', showTo: (r) => true },
    { id: 'conexao-aluno', label: 'Conexão Aluno', showTo: (r) => true },
    { id: 'atualizacoes', label: 'Atualizações', showTo: (r) => true },
    
    // RESTRITAS
    { id: 'aluno-tech', label: 'Aluno Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.moderador || r.Aluno },
    { id: 'moderador-tech', label: 'Moderador Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.moderador },
    { id: 'professor-tech', label: 'Professor Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao },
    { id: 'admin-tech', label: 'Admin Tech', showTo: (r) => r.Admin }
];

// ============================================================================
// GERENCIAMENTO DE AUTHENTICATION E CÁLCULO DE ROLE
// ============================================================================

onAuthStateChanged(auth, async (user) => {
    const loadingEl = document.getElementById('user-loading');
    const infoEl = document.getElementById('user-info');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');
    const loginBtn = document.getElementById('btn-login-visitor');

    // Reseta permissões
    userRoles = { Admin: false, Professor: false, Coordenacao: false, moderador: false, Aluno: false, Visitante: true };
    let displayRoleName = 'Visitante';

    if (user) {
        try {
            // Busca o documento do usuário na coleção 'users'
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                
                // Mapeia os campos booleanos do banco de dados para a memória local
                userRoles.Admin = !!data.Admin;
                userRoles.Professor = !!data.Professor;
                userRoles.Coordenacao = !!data.Coordenacao;
                userRoles.moderador = !!data.moderador;
                userRoles.Aluno = !!data.Aluno;
                userRoles.Visitante = false;

                // Determina qual é o nome mais alto da hierarquia para exibir na tela
                if (userRoles.Admin) displayRoleName = 'Administrador';
                else if (userRoles.Coordenacao) displayRoleName = 'Coordenação';
                else if (userRoles.Professor) displayRoleName = 'Professor';
                else if (userRoles.moderador) displayRoleName = 'Moderador';
                else if (userRoles.Aluno) displayRoleName = 'Aluno';
            }
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        }

        // Configura a UI para logado
        emailEl.textContent = user.email;
        roleEl.textContent = displayRoleName;
        loadingEl.classList.add('hidden');
        loginBtn.classList.add('hidden');
        infoEl.classList.remove('hidden');
        infoEl.classList.add('flex');
    } else {
        // Configura a UI para Visitante / Deslogado
        loadingEl.classList.add('hidden');
        infoEl.classList.add('hidden');
        infoEl.classList.remove('flex');
        loginBtn.classList.remove('hidden'); // Mostra botão de login
    }

    // Com as roles definidas, desenhamos a barra de navegação
    buildTopMenu();
    
    // Mostra a aba (se o visitante tentar atualizar numa aba restrita, o showTab vai bloqueá-lo)
    window.showTab(activeTabId);
});

// ============================================================================
// CONSTRUÇÃO DO MENU SUPERIOR DINÂMICO
// ============================================================================

function buildTopMenu() {
    const navContainer = document.getElementById('top-nav-menu');
    navContainer.innerHTML = '';

    MENU_ARCHITECTURE.forEach(item => {
        // Verifica as permissões executando a função showTo passando os roles atuais
        if (item.showTo(userRoles)) {
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
// ROTEADOR CENTRAL DA SPA (Troca de Páginas)
// ============================================================================

window.showTab = function(tabId) {
    // 1. Validação de Segurança - Garante que ninguém force a URL sem o Cargo exato
    const routeConfig = MENU_ARCHITECTURE.find(m => m.id === tabId);
    if (routeConfig && !routeConfig.showTo(userRoles)) {
        alert("Acesso Negado: Você não possui a credencial necessária para acessar esta área.");
        return window.showTab('inicio');
    }

    // 2. Atualiza Estilo da Barra Superior
    activeTabId = tabId;
    updateMenuStyles();

    // 3. Oculta todos os painéis
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // 4. Mostra o contentor correto
    const targetContainer = document.getElementById(`${tabId}-content`);
    if (targetContainer) {
        targetContainer.classList.add('active');
    }

    // 5. Injeta a aplicação dentro do contentor apenas na primeira vez que for aberto (Lazy Load)
    if (tabId === 'inicio') {
        if (targetContainer.innerHTML === '') renderInicioTab();
    } 
    else if (tabId === 'aluno-tech') {
        if (targetContainer.innerHTML === '') renderAlunoTechTab();
    }
    // As próximas serão adicionadas aqui...
    else {
        // Tela genérica de "Em Construção" para páginas não feitas
        if (targetContainer) {
            targetContainer.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-950 animate-fade-in">
                    <i class="fas fa-hammer text-6xl mb-4 text-blue-900/50"></i>
                    <h2 class="text-2xl font-cinzel text-slate-400 uppercase tracking-widest">Em Desenvolvimento</h2>
                    <p class="text-sm mt-2">A página '${routeConfig?.label || tabId}' está sendo forjada.</p>
                </div>
            `;
        }
    }
};

// ============================================================================
// FUNÇÕES GLOBAIS DE ACESSO RÁPIDO
// ============================================================================

window.logout = async function() {
    if (confirm("Deseja desconectar sua conta?")) {
        try {
            await signOut(auth);
            // Ao sair, o AuthState muda para Visitante, o menu é refeito, e nós voltamos pra home
            window.showTab('inicio');
        } catch (error) {
            alert("Erro ao sair: " + error.message);
        }
    }
};