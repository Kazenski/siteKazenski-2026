import { auth, db } from './core/firebase.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORTAÇÃO DOS RENDERIZADORES DE PÁGINA
import { renderInicioTab } from './inicio/inicio.js';
import { renderAlunoTechTab } from './alunoTech/perfilTech.js';
import { renderConteudosTab } from './conteudos/conteudosAula.js';

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
let isAlunoTechLoaded = false;
let isConteudosLoaded = false;

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
        renderInicioTab();
    } 
    else if (tabId === 'aluno-tech') {
        if (!isAlunoTechLoaded) {
            renderAlunoTechTab();
            isAlunoTechLoaded = true; 
        }
    }
    else if (tabId === 'conteudos') {
        if (!isConteudosLoaded) {
            renderConteudosTab();
            isConteudosLoaded = true; 
        }
    }
    else if (tabId === 'login') {
        renderLoginTab();
    }
};


// ============================================================================
// TELA DE LOGIN DEDICADA
// ============================================================================

function renderLoginTab() {
    const container = document.getElementById('login-content');
    if (!container) return;

    // Constrói uma interface de Login moderna e limpa
    container.innerHTML = `
        <div class="w-full max-w-md bg-slate-800 p-8 md:p-10 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden fade-in">
            
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>
            
            <div class="text-center mb-8 pt-2">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 border border-slate-700 mb-4 shadow-inner">
                    <i class="fas fa-user-astronaut text-2xl text-blue-500"></i>
                </div>
                <h2 class="text-3xl font-cinzel font-bold text-white">Acesso Restrito</h2>
                <p class="text-slate-400 text-sm mt-2 font-medium">Insira suas credenciais para continuar</p>
            </div>

            <form id="login-form" class="space-y-5">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Email</label>
                    <div class="relative">
                        <i class="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input type="email" id="login-email" required 
                               class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600" 
                               placeholder="seu@email.com">
                    </div>
                </div>
                
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Senha</label>
                    <div class="relative">
                        <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input type="password" id="login-pass" required 
                               class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600" 
                               placeholder="••••••••">
                    </div>
                </div>

                <div id="login-error" class="hidden bg-red-500/10 border border-red-500/50 text-red-400 text-xs p-3 rounded-lg text-center font-bold"></div>

                <button type="submit" id="btn-submit-login" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] flex items-center justify-center gap-3 mt-4">
                    <span>Entrar no Portal</span>
                    <i class="fas fa-sign-in-alt"></i>
                </button>
            </form>
            
            <div class="mt-8 text-center border-t border-slate-700/50 pt-6">
                <button onclick="window.showTab('inicio')" class="text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 w-full">
                    <i class="fas fa-arrow-left"></i> Voltar para o Início
                </button>
            </div>
        </div>
    `;

    // Lógica de Submissão
    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-submit-login');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-pass').value.trim();

        if (!email || !pass) return;

        // Animação de Loading no botão
        btnSubmit.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xl"></i>';
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-70');
        errorDiv.classList.add('hidden');

        try {
            // Tenta autenticar
            await signInWithEmailAndPassword(auth, email, pass);
            
            // Sucesso! A função onAuthStateChanged vai rodar sozinha e exibir o painel do usuário.
            // Vamos apenas redirecioná-lo para a tela Início para ele ver as abas liberadas.
            window.showTab('inicio');
            
        } catch (error) {
            // Falha. Restaura o botão e mostra o erro
            btnSubmit.innerHTML = '<span>Entrar no Portal</span><i class="fas fa-sign-in-alt"></i>';
            btnSubmit.disabled = false;
            btnSubmit.classList.remove('opacity-70');
            
            errorDiv.classList.remove('hidden');
            
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Credenciais inválidas.';
            } else {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Erro ao conectar. Tente novamente.';
            }
        }
    });
}

// ============================================================================
// LOGOUT
// ============================================================================

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