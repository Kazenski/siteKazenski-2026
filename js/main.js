import { auth, db, rtdb } from './core/firebase.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, set, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { renderConexaoAlunoTab } from './conexaoAluno/conexaoAluno.js';

// IMPORTAÇÃO DOS RENDERIZADORES DE PÁGINA
import { renderInicioTab } from './inicio/inicio.js';
import { renderAlunoTechTab } from './alunoTech/perfilTech.js';
import { renderConteudosTab } from './conteudos/conteudosAula.js';
import { renderProfessorTab } from './professorTech/professorTech.js';
import './atualizacoes/atualizacoes.js';

// ============================================================================
// HIERARQUIA DE PERMISSÕES (Baseado nos booleanos exatos do Firebase)
// ============================================================================

let userRoles = {
    Admin: false,
    Professor: false,
    Coordenacao: false,
    Moderador: false,
    Aluno: false,
    Visitante: true 
};

let activeTabId = localStorage.getItem('kazenski_active_tab') || 'inicio';
let isAlunoTechLoaded = false;
let isConteudosLoaded = false;
let isProfessorLoaded = false;
let isModeradorLoaded = false;
let isConexaoAlunoLoaded = false;

// Definição rigorosa da arquitetura de menus e quem pode ver o quê
const MENU_ARCHITECTURE = [
    { id: 'inicio', label: 'Início', showTo: (r) => true }, 
    { id: 'conteudos', label: 'Conteúdos', showTo: (r) => true },
    { id: 'projetos', label: 'Projetos', showTo: (r) => true },
    { id: 'conexao-aluno', label: 'Conexão Aluno', showTo: (r) => true },
    { id: 'atualizacoes', label: 'Atualizações', showTo: (r) => true },
    
    // REGRAS DE OCULTAÇÃO SOLICITADAS:
    // Aluno vê até Aluno Tech. Admin vê tudo. Professor/Coordenação vê tudo menos Admin.
    { id: 'aluno-tech', label: 'Aluno Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno },
    { id: 'moderador-tech', label: 'Moderador Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador },
    { id: 'professor', label: 'Professor Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao },
    { id: 'admin-tech', label: 'Admin Tech', showTo: (r) => r.Admin }
];

// ============================================================================
// GESTÃO DE SESSÃO (REALTIME DATABASE)
// ============================================================================
const SESSION_TIMEOUT_MINUTES = 15; // Definição dos minutos aqui
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;
let sessionInterval = null;
let lastActivityUpdate = 0;
let rtdbUnsubscribe = null;
let currentUserUid = null;

const updateActivity = () => {
    if (!currentUserUid) return;
    const now = Date.now();
    // Atualiza o banco no máximo a cada 30 segundos para não estourar a cota gratuita
    if (now - lastActivityUpdate > 30000) {
        set(ref(rtdb, `sessions/${currentUserUid}/lastActive`), serverTimestamp());
        lastActivityUpdate = now;
    }
};

function startSessionManager(user) {
    currentUserUid = user.uid;
    const timerDiv = document.getElementById('session-timer');
    const countdownSpan = document.getElementById('session-countdown');
    
    if(timerDiv) {
        timerDiv.classList.remove('hidden');
        timerDiv.classList.add('flex');
    }

    // Escuta atividade do usuário para manter a sessão viva
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);

    // Registra a entrada imediatamente
    lastActivityUpdate = 0; 
    updateActivity();

    // Sincroniza com o Firebase RTDB
    const sessionRef = ref(rtdb, `sessions/${user.uid}/lastActive`);
    rtdbUnsubscribe = onValue(sessionRef, (snapshot) => {
        const lastActiveServer = snapshot.val();
        if (!lastActiveServer) return;

        if (sessionInterval) clearInterval(sessionInterval);

        sessionInterval = setInterval(() => {
            const timeLeft = (lastActiveServer + SESSION_TIMEOUT_MS) - Date.now();

            if (timeLeft <= 0) {
                stopSessionManager();
                window.logout(true); // Logout forçado por inatividade
            } else {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                
                if(countdownSpan) {
                    countdownSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    // Fica vermelho e pisca nos últimos 2 minutos
                    if (timeLeft < 120000) { 
                        countdownSpan.classList.replace('text-amber-500', 'text-red-500');
                        countdownSpan.classList.add('animate-pulse');
                    } else {
                        countdownSpan.classList.replace('text-red-500', 'text-amber-500');
                        countdownSpan.classList.remove('animate-pulse');
                    }
                }
            }
        }, 1000);
    });
}

function stopSessionManager() {
    currentUserUid = null;
    window.removeEventListener('mousemove', updateActivity);
    window.removeEventListener('keydown', updateActivity);
    window.removeEventListener('click', updateActivity);
    if (sessionInterval) clearInterval(sessionInterval);
    if (rtdbUnsubscribe) rtdbUnsubscribe();
    
    const timerDiv = document.getElementById('session-timer');
    if(timerDiv) {
        timerDiv.classList.remove('flex');
        timerDiv.classList.add('hidden');
    }
}

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
    userRoles = { Admin: false, Professor: false, Coordenacao: false, Moderador: false, Aluno: false, Visitante: true };
    let displayRoleName = 'Visitante';

    if (user) {

        startSessionManager(user);

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                
                // Mapeamento aceitando tanto Boolean (true) quanto String ("true")
                userRoles.Admin = (data.Admin === true || data.Admin === "true");
                userRoles.Professor = (data.Professor === true || data.Professor === "true");
                userRoles.Coordenacao = (data.Coordenacao === true || data.Coordenacao === "true");
                
                // Aceita "Moderador" (maiúsculo) ou "moderador" (minúsculo), em Boolean ou String
                userRoles.Moderador = (data.Moderador === true || data.Moderador === "true" || data.moderador === true || data.moderador === "true");
                
                userRoles.Aluno = (data.Aluno === true || data.Aluno === "true");
                userRoles.Visitante = false;

                // Define o rótulo de exibição baseado na maior autoridade
                if (userRoles.Admin) displayRoleName = 'Admin';
                else if (userRoles.Coordenacao) displayRoleName = 'Coordenação';
                else if (userRoles.Professor) displayRoleName = 'Professor';
                else if (userRoles.Moderador) displayRoleName = 'Moderador';
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

        stopSessionManager();
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
        // Redireciona silenciosamente se perder a permissão ou tentar burlar o cache
        return window.showTab('inicio'); 
    }

    activeTabId = tabId;
    
    // GRAVA A ABA ATUAL NO CACHE DO NAVEGADOR
    localStorage.setItem('kazenski_active_tab', tabId); 
    
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
    else if (tabId === 'professor') {
        if (!isProfessorLoaded) {
            renderProfessorTab();
            isProfessorLoaded = true;
        }
    }
    else if (tabId === 'moderador-tech' && !isModeradorLoaded) {
        isModeradorLoaded = true; 
    }
    else if (tabId === 'conexao-aluno') {
        if (!isConexaoAlunoLoaded) {
            renderConexaoAlunoTab();
            isConexaoAlunoLoaded = true;
        }
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

window.logout = async function(isAuto = false) {
    const msg = isAuto ? "Sua sessão expirou por inatividade. Faça login novamente." : "Deseja sair?";
    
    // Se for automático (isAuto), desloga direto. Se for manual, mostra o confirm.
    if (isAuto === true || confirm(msg)) {
        try {
            localStorage.setItem('kazenski_active_tab', 'inicio'); 
            await signOut(auth);
            if(isAuto === true) alert(msg); // Avisa o usuário que ele caiu
            window.showTab('inicio');
        } catch (error) {
            if(isAuto !== true) alert("Erro: " + error.message);
        }
    }
};