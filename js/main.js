import { auth, db, rtdb } from './core/firebase.js';
import {
    onAuthStateChanged, signOut, signInWithEmailAndPassword,
    signInWithPopup, GoogleAuthProvider, linkWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, set, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { renderConexaoAlunoTab } from './conexaoAluno/conexaoAluno.js';
import { renderProjetosTab } from './projetos/projetos.js';
import { renderAvaliacoesTab } from './avaliacoesDigitais/avaliacoesDigitais.js';

// IMPORTAÇÃO DOS RENDERIZADORES DE PÁGINA
import { renderInicioTab } from './inicio/inicio.js';
import { renderAlunoTechTab } from './alunoTech/perfilTech.js';
import { renderConteudosTab } from './conteudos/conteudosAula.js';
import { iniciarManutencao, renderAtualizacoesTab, aplicarPermissoes } from './manutencao/manutencao.js';
import { iniciarModeracao } from './core/moderacao.js';
import { renderProfessorTab } from './professorTech/professorTech.js';
import { renderPesquisasTechTab } from './pesquisasTech/pesquisasTech.js';
import { renderVotacaoTab } from './votacao/votacao.js';
import './atualizacoes/atualizacoes.js';
import { gestaoAuraAPI } from './conteudos/gestaoAura.js';
import { lojaAuraAPI } from './conteudos/lojaAura.js';
import { iniciarConsentimento, forcarConsentimento } from './auth/consentimento.js';
import { renderMigrarContaTab } from './auth/migracaoConta.js';

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
let isProjetosLoaded = false;
let isGestaoAuraLoaded = false;
let isAvaliacoesLoaded = false;
let isPesquisasTechLoaded = false;

// Definição rigorosa da arquitetura de menus e quem pode ver o quê
const MENU_ARCHITECTURE = [
    { id: 'inicio', label: 'Início', showTo: (r) => true },
    { id: 'projetos', label: 'Projetos', showTo: (r) => true },
    { id: 'conteudos', label: 'Conteúdos', showTo: (r) => true },
    { id: 'blog-tech', label: 'Blog', showTo:(r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno  },
    { id: 'pesquisas-tech', label: 'Pesquisas Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno },
    { id: 'gestao-aura', label: 'Gestão Aura', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno },
    // { id: 'conexao-aluno', label: 'Conexão Aluno', showTo: (r) => true },
    { id: 'atualizacoes', label: 'Atualizações', showTo: (r) => true },
    { id: 'votacao', label: 'Votação', showTo: (r) => window._votacaoAtiva === true && (r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno) },

    // REGRAS DE OCULTAÇÃO SOLICITADAS:
    // Aluno vê até Aluno Tech. Admin vê tudo. Professor/Coordenação vê tudo menos Admin.
    { id: 'aluno-tech', label: 'Aluno Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno },
    { id: 'avaliacoes', label: 'Avaliações Digitais', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador || r.Aluno },
    { id: 'moderador-tech', label: 'Moderador Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao || r.Moderador },
    { id: 'professor', label: 'Professor Tech', showTo: (r) => r.Admin || r.Professor || r.Coordenacao },
    { id: 'admin-tech', label: 'Admin Tech', showTo: (r) => r.Admin }
];

// ============================================================================
// SISTEMA DE NOTIFICAÇÕES GLOBAIS (BADGES NO MENU)
// ============================================================================
let globalBadges = { avaliacoes: false };
let unsubAvaliacoes = null;
let unsubEntregas = null;

// Listener da configuração da votação (controla visibilidade da aba no menu)
onSnapshot(doc(db, 'config', 'votacao'), (snap) => {
    window._votacaoAtiva = snap.exists() && snap.data().ativa === true;
    buildTopMenu();
}, (err) => console.warn('Config de votação indisponível:', err));

function iniciarMonitoramentoNotificacoes(uid, turma) {
    if (!turma) return;

    // Ouve as avaliações ativas e as entregas feitas por esse aluno específico
    const qAval = query(collection(db, "avaliacoes_digitais"), where("status", "==", "ativa"));
    const qEntregas = query(collection(db, "avaliacoes_entregas"), where("alunoUid", "==", uid));

    let avaliacoes = [];
    let entregas = [];

    const recalcularBadge = () => {
        const agora = new Date();
        let pendentes = 0;

        avaliacoes.forEach(a => {
            if (a.oculta) return;
            if (!a.turmasAlvo || !a.turmasAlvo.includes(turma)) return;

            const dAberta = a.dataAbertura ? a.dataAbertura.toDate() : null;
            const dFecha = a.dataFechamento ? a.dataFechamento.toDate() : null;

            if (dAberta && dAberta > agora) return; // Ainda não abriu para o aluno
            if (dFecha && dFecha < agora) return; // O prazo já acabou (não notifica mais, apenas mostra atrasado/encerrado na aba)

            // Verifica se o aluno já enviou algo para esta avaliação
            const jaEntregou = entregas.some(e => e.avaliacaoId === a.id);
            if (!jaEntregou) {
                pendentes++;
            }
        });

        const hasPending = pendentes > 0;
        // Se o status da bolinha mudar (ex: ele acabou de entregar), atualiza o menu
        if (globalBadges.avaliacoes !== hasPending) {
            globalBadges.avaliacoes = hasPending;
            buildTopMenu();
        }
    };

    unsubAvaliacoes = onSnapshot(qAval, (snap) => {
        avaliacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        recalcularBadge();
    });

    unsubEntregas = onSnapshot(qEntregas, (snap) => {
        entregas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        recalcularBadge();
    });
}

function pararMonitoramentoNotificacoes() {
    if (unsubAvaliacoes) unsubAvaliacoes();
    if (unsubEntregas) unsubEntregas();
    globalBadges.avaliacoes = false;
}

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

    if (timerDiv) {
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

                if (countdownSpan) {
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
    if (timerDiv) {
        timerDiv.classList.remove('flex');
        timerDiv.classList.add('hidden');
    }
}

// ============================================================================
// SISTEMA DE AURA (CÁLCULO E SINCRONIZAÇÃO)
// ============================================================================

async function calcularAuraDoUsuario(dadosUser, uid) {
    let auraTotal = 0;

    try {
        const notaRef = doc(db, 'notas', uid);
        const notaSnap = await getDoc(notaRef);

        if (notaSnap.exists()) {
            const notaData = notaSnap.data();
            const disciplinas = notaData.disciplinasComNotas || {};

            for (const disc in disciplinas) {
                const trimestres = disciplinas[disc];

                for (const tri in trimestres) {
                    const dadosTri = trimestres[tri];

                    // 1. Soma das Notas (nota1, nota2, nota3, nota4)
                    // Cada ponto de nota vale 2500 de Aura
                    ['nota1', 'nota2', 'nota3', 'nota4'].forEach(campo => {
                        if (dadosTri[campo] !== undefined && dadosTri[campo] !== null && dadosTri[campo] !== "") {
                            const valorNota = parseFloat(String(dadosTri[campo]).replace(',', '.'));
                            if (!isNaN(valorNota)) {
                                auraTotal += Math.floor(valorNota * 2500);
                            }
                        }
                    });

                    // 2. Soma das Atividades Extras (ext1, ext2, ext3, ext4)
                    // Se o campo for 'true' ou houver valor, ganha 100 de Aura
                    ['ext1', 'ext2', 'ext3', 'ext4'].forEach(campo => {
                        const v = dadosTri[campo];
                        if (v === true || v === "true" || (typeof v === "number" && v > 0)) {
                            auraTotal += 100;
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error(`[Aura] Erro ao processar notas do aluno ${uid}:`, error);
    }

    if (dadosUser.auraManual) auraTotal += parseInt(dadosUser.auraManual) || 0;
    if (dadosUser.atividadesExtras) auraTotal += (parseInt(dadosUser.atividadesExtras) * 100) || 0;

    const gasta = parseInt(dadosUser.auraGasta || 0);

    return {
        total: auraTotal, // Intocável para o Ranking/Topo
        disponivel: auraTotal - gasta // Para gastar na loja
    };
}

async function sincronizarAuraGeralSilencioso() {
    console.log("[Auditoria Aura] Iniciando varredura detalhada...");
    try {
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);
        let atualizados = 0;

        for (const documento of snapshot.docs) {
            const d = documento.data();
            const uid = documento.id;

            // FILTRO RÍGIDO: Apenas registroAtivo true
            const isAtivo = (d.registroAtivo === true || d.registroAtivo === "true");

            if (isAtivo) {
                // Agora recebemos um objeto { total, disponivel }
                const resultadoAura = await calcularAuraDoUsuario(d, uid);
                const auraCorreta = resultadoAura.total; // Usamos o TOTAL para o ranking/auditoria

                if (auraCorreta > 0) {
                    console.log(`[Forja] ${d.nome || uid}: ${auraCorreta.toLocaleString('pt-BR')} Aura`);
                }

                // REMOVIDA A TRAVA DE IGUALDADE (d.aura !== auraCorreta)
                // Força a gravação de todos os alunos ativos no banco sempre que rodar
                const refDoc = doc(db, 'users', uid);
                await updateDoc(refDoc, {
                    aura: auraCorreta,
                    sincronizadoEm: new Date().toISOString()
                });
                atualizados++;
            }
        }
        console.log(`[Auditoria Aura] Finalizado. ${atualizados} heróis tiveram sua Aura atualizada.`);
    } catch (error) {
        console.error("[Auditoria Aura] Erro:", error);
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

                userRoles.Admin = (data.Admin === true || data.Admin === "true");
                userRoles.Professor = (data.Professor === true || data.Professor === "true");
                userRoles.Coordenacao = (data.Coordenacao === true || data.Coordenacao === "true");
                userRoles.Moderador = (data.Moderador === true || data.Moderador === "true" || data.moderador === true || data.moderador === "true");
                userRoles.Aluno = (data.Aluno === true || data.Aluno === "true");
                userRoles.Visitante = false;
                window.userRoles = userRoles;
                
                if (userRoles.Admin) displayRoleName = 'Admin';
                else if (userRoles.Coordenacao) displayRoleName = 'Coordenação';
                else if (userRoles.Professor) displayRoleName = 'Professor';
                else if (userRoles.Moderador) displayRoleName = 'Moderador';
                else if (userRoles.Aluno) displayRoleName = 'Aluno';

                // AURA: CALCULAR E EXIBIR NO LOGIN
                if (data.registroAtivo === true || data.registroAtivo === "true") {

                    // 1. O cálculo retorna um objeto { total, disponivel }
                    const resultadoAura = await calcularAuraDoUsuario(data, user.uid);

                    // 2. Atualiza o banco (SÓ O TOTAL, para o ranking não cair)
                    if (data.aura !== resultadoAura.total) {
                        await updateDoc(doc(db, 'users', user.uid), { aura: resultadoAura.total });
                    }

                    // 3. Atualiza o Topo do site (Aura de Poder)
                    const auraValEl = document.getElementById('user-aura-value'); // Verifique se é este ID que você usa no menu principal
                    if (auraValEl) {
                        auraValEl.textContent = resultadoAura.total.toLocaleString('pt-BR');
                    }

                    // 4. ATUALIZA A TELA DA LOJA (O Saldo Disponível)
                    // É esta linha que faz o HTML que você enviou ganhar vida!
                    const saldoLojaEl = document.getElementById('shop-user-aura-disponivel');
                    if (saldoLojaEl) {
                        saldoLojaEl.textContent = resultadoAura.disponivel.toLocaleString('pt-BR');
                    }
                }

                // INICIA MONITORAMENTO DE AVALIAÇÕES (Bolhinha Amarela) SE FOR ALUNO
                if (userRoles.Aluno) {
                    iniciarMonitoramentoNotificacoes(user.uid, data.turma);
                } else {
                    pararMonitoramentoNotificacoes(); // Admin/Professores não precisam da bolinha de pendência
                }
            }
        } catch (error) {
            console.error("Erro ao mapear permissões:", error);
        }

        let userDocData = null;
        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
                userDocData = userSnap.data();
            }
        } catch (e) {
            console.error("Erro ao ler usuário:", e);
        }

        // AURA: SYNC SILENCIOSO SE FOR ADMIN
        if (user.email === "kazenski.developer@gmail.com") {
            sincronizarAuraGeralSilencioso();
        }

        // ============================================================================
        // GUARDAS DE MIGRAÇÃO + CONSENTIMENTO
        // ============================================================================
        // 1. Se logou com EMAIL+SENHA e ainda NÃO migrou → redireciona p/ migração guiada
        // 2. Verifica aceite dos Termos/LGPD/ECA (versionado). Obriga aceite.
        let redirecionadoPorGuard = false;

        // Verifica se precisa migrar
        const temGoogleProv = Array.isArray(user.providerData)
            ? user.providerData.some((p) => p.providerId === 'google.com')
            : false;
        const jaMigrado = (userDocData && userDocData.migratedToGoogle === true);

        // Login com password e ainda não migrado
        const loginPassword = window._lastLoginMethod === 'password';
        if (!temGoogleProv && !jaMigrado && loginPassword) {
            window._lastLoginMethod = null;
            try { sessionStorage.setItem('kz_hint_email_senha', '1'); } catch { /* ignora */ }
            renderMigrarContaTab();
            activeTabId = 'migrar-conta';
            window.showTab('migrar-conta');
            redirecionadoPorGuard = true;
        }
        window._lastLoginMethod = null;

        // Consentimento (Termos/LGPD/ECA) — obrigatório para usuários logados
        if (!redirecionadoPorGuard) {
            const consentOk = await forcarConsentimento(user, () => {
                // Após aceitar, garante que vai para home
                if (activeTabId === 'login') window.showTab('inicio');
            });
            // Se ainda não aceitou, o modal está aberto — não muda aba nem força
        }

        emailEl.textContent = user.email;
        roleEl.textContent = displayRoleName;
        loadingEl.classList.add('hidden');
        loginBtn.classList.add('hidden');
        infoEl.classList.remove('hidden');
        infoEl.classList.add('flex');

    } else {

        stopSessionManager();
        pararMonitoramentoNotificacoes();
        loadingEl.classList.add('hidden');
        infoEl.classList.add('hidden');
        infoEl.classList.remove('flex');
        loginBtn.classList.remove('hidden');
    }

    // Reconstrói o menu com as novas permissões
    buildTopMenu();
    if (activeTabId === 'votacao') {
        renderVotacaoTab();
    }

    // Informa o módulo de manutenção quem está logado (e com qual papel).
    // É a única fonte de verdade de permissão — o módulo não lê o Firestore
    // de novo, apenas consome este objeto.
    aplicarPermissoes(userRoles, {
        logado: !!user,
        uid: user?.uid || null,
        email: user?.email || null,
        nome: displayRoleName,
    });

    // Informa a barreira de moderação sobre o papel do usuário logado
    window.moderacaoAPI?.definirPapeis(userRoles, {
        uid: user?.uid || null,
        displayName: displayRoleName,
        email: user?.email || null
    });

    // Fecha o modo "login aberto a partir da capa" se a sessão não for staff.
    if (!user) {
        window.manutencaoAPI?.fecharPausa();
        window.moderacaoAPI?.encerrarSessao();
    }

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

            // Estilização com Flexbox para alinhar o texto e a bolinha
            const isActive = activeTabId === item.id;
            btn.className = `nav-item-btn flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${isActive ? 'border-blue-500 text-blue-400 bg-slate-800/50' : 'border-transparent text-slate-400 hover:text-slate-200'}`;

            // Texto base do botão
            let innerHTML = `<span>${item.label}</span>`;

            // Se for a aba de avaliações e houver pendências, adiciona a bolinha (Ping animation Tailwind)
            if (item.id === 'avaliacoes' && globalBadges.avaliacoes) {
                innerHTML += `<span class="relative flex h-2.5 w-2.5" title="Você possui atividades pendentes!"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span></span>`;
            }

            btn.innerHTML = innerHTML;
            btn.onclick = () => window.showTab(item.id);
            btn.dataset.target = item.id;

            navContainer.appendChild(btn);
        }
    });
}

// ============================================================================
// ROTEADOR CENTRAL (Troca de Abas)
// ============================================================================

window.showTab = function (tabId) {
    // Trava de manutenção: com o site fechado, o único destino liberado é o
    // login (para Admin/Moderador entrarem). Qualquer outra aba volta pro Início.
    if (window.manutencaoAPI?.bloqueiaNavegacao(tabId)) {
        tabId = 'inicio';
    }

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
    // Para o mini player da votação ao trocar de aba
    if (tabId !== 'votacao') window.votacaoAPI?.fecharPlayer();

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
    else if (tabId === 'pesquisas-tech') {
        if (!isPesquisasTechLoaded) {
            renderPesquisasTechTab();
            isPesquisasTechLoaded = true;
        }
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
    else if (tabId === 'migrar-conta') {
        renderMigrarContaTab();
    }
    else if (tabId === 'migrar-conta') {
        renderMigrarContaTab();
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
    // else if (tabId === 'conexao-aluno') {
    //     if (!isConexaoAlunoLoaded) {
    //         renderConexaoAlunoTab();
    //         isConexaoAlunoLoaded = true;
    //     }
    // }
    else if (tabId === 'projetos') {
        if (!isProjetosLoaded) {
            renderProjetosTab();
            isProjetosLoaded = true;
        }
    }
    else if (tabId === 'avaliacoes') {
        if (!isAvaliacoesLoaded) {
            renderAvaliacoesTab();
            isAvaliacoesLoaded = true;
        }
    }
    else if (tabId === 'gestao-aura') {
        if (!isGestaoAuraLoaded) {
            gestaoAuraAPI.init();
            lojaAuraAPI.init();
            isGestaoAuraLoaded = true;
        }
    }
    else if (tabId === 'blog-tech') {
        if (window.blogAPI) window.blogAPI.initReader();
    }
    else if (tabId === 'moderador-tech') {
        if (!isModeradorLoaded) {
            isModeradorLoaded = true;
            if (window.blogAPI) window.blogAPI.initMod();
        }
        window.votacaoModAPI?.renderPainel();
    }
    else if (tabId === 'atualizacoes') {
        renderAtualizacoesTab();
    }
    else if (tabId === 'votacao') {
        renderVotacaoTab();
    }
};


// ============================================================================
// TELA DE LOGIN DEDICADA — LOGIN DUPLO (Google + Email/Senha)
// ============================================================================
// Regras:
//  · Google é a forma PREFERENCIAL (botão grande, no topo).
//  · Email/Senha em segundo plano (bloco colapsável " outra forma de entrar"),
//    mantido até 31/12/2026 para os alunos já cadastrados.
//  · Se o login com Google criar um usuário NOVO (isNewUser) e o e-mail não
//    corresponder a nenhuma conta existente, mostramos a orientação de migrar —
//    assim evitamos criar UIDs duplicados que quebrariam o histórico de notas.
// ============================================================================

// Domínios institucionais apenas para messaging/educação (não bloqueiam nada).
const DOMINIOS_INSTITUCIONAIS = ['estudante.sed.sc.gov.br', 'profe.sed.sc.gov.br'];
const googleProviderCompartilhado = new GoogleAuthProvider();

function ehEmailInstitucional(email) {
    const dominio = String(email || '').toLowerCase().split('@')[1] || '';
    return DOMINIOS_INSTITUCIONAIS.includes(dominio);
}

function mensagemDominio(email) {
    if (ehEmailInstitucional(email)) return '';
    return `<p class="text-[11px] text-slate-500 mt-3 text-center">
        <i class="fas fa-circle-info mr-1"></i>
        Dica: prefira seu e-mail institucional da SED
        (<span class="text-slate-400">@estudante.sed.sc.gov.br</span> ou
        <span class="text-slate-400">@profe.sed.sc.gov.br</span>) para facilitar o acompanhamento.
    </p>`;
}

function renderLoginTab() {
    const container = document.getElementById('login-content');
    if (!container) return;

    container.innerHTML = `
        <div class="w-full max-w-md bg-slate-800 p-8 md:p-10 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden fade-in">

            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>

            <div class="text-center mb-7 pt-2">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 border border-slate-700 mb-4 shadow-inner">
                    <i class="fas fa-user-astronaut text-2xl text-blue-500"></i>
                </div>
                <h2 class="text-3xl font-cinzel font-bold text-white">Acesso ao Portal</h2>
                <p class="text-slate-400 text-sm mt-2 font-medium">Entre com sua conta para continuar</p>
            </div>

            <!-- ============ GOOGLE (PREFERENCIAL) ============ -->
            <button id="btn-login-google" type="button"
                class="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold uppercase tracking-widest py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3">
                <svg class="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>Entrar com Google</span>
            </button>

            <div id="google-error" class="hidden mt-4 bg-amber-500/10 border border-amber-500/50 text-amber-300 text-xs p-3 rounded-lg text-center font-bold leading-relaxed"></div>

            ${mensagemDominio()}

            <!-- ============ DIVISOR ============ -->
            <div class="flex items-center gap-4 my-6">
                <div class="flex-1 h-px bg-slate-700"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">ou</span>
                <div class="flex-1 h-px bg-slate-700"></div>
            </div>

            <!-- ============ EMAIL E SENHA (SEGUNDO PLANO) ============ -->
            <div id="bloco-email-senha">
                <button type="button" id="btn-toggle-email-senha"
                    class="w-full flex items-center justify-between bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all">
                    <span class="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-key text-slate-500"></i> Entrar com e-mail e senha
                    </span>
                    <i id="icone-toggle-email" class="fas fa-chevron-down text-xs transition-transform"></i>
                </button>

                <div id="aviso-alternativo" class="hidden mt-3 bg-blue-900/20 border border-blue-500/30 text-blue-200 text-[11px] p-3 rounded-lg leading-relaxed">
                    <i class="fas fa-info-circle mr-1"></i>
                    O acesso por e-mail e senha permanece disponível até <strong>31/12/2026</strong>.
                    Se você ainda não migrou sua conta para o Google, use esta opção e depois
                    conclua a <strong>migração guiada</strong> para não perder o acesso no futuro.
                </div>

                <form id="login-form" class="hidden space-y-5 mt-5">
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
            </div>

            <div class="mt-8 text-center border-t border-slate-700/50 pt-6 space-y-3">
                <button onclick="window.abrirCentralTermos?.()" class="text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 w-full">
                    <i class="fas fa-shield-alt"></i> Termos, LGPD e ECA Digital
                </button>
                <button onclick="window.showTab('inicio')" class="text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 w-full">
                    <i class="fas fa-arrow-left"></i> Voltar para o Início
                </button>
            </div>
        </div>
    `;

    // ---------- Lógica do toggle e-mail/senha ----------
    const btnToggle = document.getElementById('btn-toggle-email-senha');
    const form = document.getElementById('login-form');
    const avisoAlt = document.getElementById('aviso-alternativo');
    const iconeToggle = document.getElementById('icone-toggle-email-senha') || document.getElementById('icone-toggle-email');

    // Abre automaticamente o formulário se o aluno acabou de ser redirecionado
    // vindos da migração (parâmetro na URL/localStorage).
    let abrirForm = false;
    try {
        if (sessionStorage.getItem('kz_hint_email_senha') === '1') {
            abrirForm = true;
            sessionStorage.removeItem('kz_hint_email_senha');
        }
    } catch { /* ignora */ }

    function aplicarToggle(aberto) {
        form.classList.toggle('hidden', !aberto);
        avisoAlt.classList.toggle('hidden', !aberto);
        iconeToggle.style.transform = aberto ? 'rotate(180deg)' : '';
        if (aberto) setTimeout(() => document.getElementById('login-email')?.focus(), 80);
    }

    aplicarToggle(abrirForm);
    btnToggle.addEventListener('click', () => {
        aplicarToggle(form.classList.contains('hidden'));
    });

    // ---------- Login com Google ----------
    const btnGoogle = document.getElementById('btn-login-google');
    const googleError = document.getElementById('google-error');

    btnGoogle.addEventListener('click', async () => {
        googleError.classList.add('hidden');
        const htmlOriginal = btnGoogle.innerHTML;
        btnGoogle.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Conectando...</span>';
        btnGoogle.disabled = true;

        try {
            const provider = new GoogleAuthProvider();
            // Não forçamos domínio: We'd break students without institutional account yet.
            // Apenas registramos a preferência (ver `ehEmailInstitucional`).
            const cred = await signInWithPopup(auth, provider);
            const user = cred.user;
            const isNewUser = cred.additionalUserInfo?.isNewUser === true;

            // Log de acesso
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                await addDoc(collection(db, 'logs_usuarios'), {
                    uid: user.uid,
                    nome: (userDoc.exists() ? userDoc.data().nome : null) || 'Usuário',
                    turma: (userDoc.exists() ? userDoc.data().turma : null) || 'SemTurma',
                    acao: 'Realizou Login',
                    detalhes: 'Acessou o portal com Google.',
                    viaGoogle: true,
                    institutional: ehEmailInstitucional(user.email),
                    timestamp: serverTimestamp()
                });
            } catch { /* log é best-effort */ }

            // Se é usuário NOVO e ainda não tem documento de perfil,
            // tratamos como "aluno novo" (entrada apenas por Google).
            if (isNewUser) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (!userDoc.exists()) {
                    await setDoc(doc(db, 'users', user.uid), {
                        nome: user.displayName || user.email.split('@')[0],
                        role: 'Pendente',
                        origemCadastro: 'google-self-signup',
                        emailInstitucional: ehEmailInstitucional(user.email),
                        criadoEm: serverTimestamp(),
                    });
                }
            }

            // Redireciona: se ainda não migrou (sem Google no providerData? impossível aqui)
            // ou se não aceitou termos, os guards cuidado disso.
            window.showTab('inicio');

        } catch (error) {
            console.error('[Login Google]', error);
            btnGoogle.innerHTML = htmlOriginal;
            btnGoogle.disabled = false;

            let msg = 'Não foi possível entrar com Google. Tente novamente.';
            if (error.code === 'auth/popup-closed-by-user') {
                msg = 'Você fechou a janela do Google antes de concluir.';
            } else if (error.code === 'auth/popup-blocked') {
                msg = 'Permita popups para este site nas configurações do navegador e tente novamente.';
            } else if (error.code === 'auth/account-exists-with-different-credential') {
                msg = 'Já existe uma conta com este e-mail usando senha. Faça login com e-mail e senha e conclua a migração guiada.';
            } else if (error.code === 'auth/network-request-failed') {
                msg = 'Falha de conexão. Verifique sua internet e tente novamente.';
            }

            googleError.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i> ${msg}`;
            googleError.classList.remove('hidden');
        }
    });

    // ---------- Login com e-mail e senha ----------
    const errorDiv = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-submit-login');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-pass').value.trim();

        if (!email || !pass) return;

        btnSubmit.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xl"></i>';
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-70');
        errorDiv.classList.add('hidden');

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);

            const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
            if (userDoc.exists()) {
                await addDoc(collection(db, "logs_usuarios"), {
                    uid: userCredential.user.uid,
                    nome: userDoc.data().nome || "Usuário",
                    turma: userDoc.data().turma || "Sem Turma",
                    acao: "Realizou Login",
                    detalhes: "Acessou o portal com email e senha.",
                    timestamp: serverTimestamp()
                });
            }

            // Guarda os dados para o guard de migração no onAuthStateChanged.
            window._lastLoginMethod = 'password';
            window.showTab('inicio');

        } catch (error) {
            btnSubmit.innerHTML = '<span>Entrar no Portal</span><i class="fas fa-sign-in-alt"></i>';
            btnSubmit.disabled = false;
            btnSubmit.classList.remove('opacity-70');

            errorDiv.classList.remove('hidden');

            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Credenciais inválidas.';
            } else if (error.code === 'auth/too-many-requests') {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Muitas tentativas. Aguarde alguns instantes.';
            } else {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Erro ao conectar. Tente novamente.';
            }
        }
    });
}

// ============================================================================
// LOGOUT
// ============================================================================

window.logout = async function (isAuto = false) {
    const msg = isAuto ? "Sua sessão expirou por inatividade. Faça login novamente." : "Deseja sair?";

    if (isAuto === true || confirm(msg)) {
        try {
            // LOG DE LOGOUT: Grava antes de destruir a sessão
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
                if (userDoc.exists()) {
                    await addDoc(collection(db, "logs_usuarios"), {
                        uid: auth.currentUser.uid,
                        nome: userDoc.data().nome || "Usuário",
                        turma: userDoc.data().turma || "Sem Turma",
                        acao: isAuto ? "Logout Automático" : "Realizou Logout",
                        detalhes: isAuto ? "Sessão expirada por inatividade." : "Saiu do portal manualmente.",
                        timestamp: serverTimestamp()
                    });
                }
            }

            localStorage.setItem('kazenski_active_tab', 'inicio');
            await signOut(auth);
            if (isAuto === true) alert(msg);
            window.manutencaoAPI?.fecharPausa();
            window.showTab('inicio');
        } catch (error) {
            if (isAuto !== true) alert("Erro: " + error.message);
        }
    }
};

// ============================================================================
// MANUTENÇÃO / ATUALIZAÇÕES / MODERAÇÃO
// ============================================================================
// Lê `site_status/maintenance` e o `changelog.json`, aplica a trava da tela de
// manutenção e, ao detectar um deploy novo, fecha o site para quem não é
// Admin/Moderador. Nunca bloqueia o carregamento: o `catch` mantém o site
// funcionando mesmo se a leitura do Firestore falhar (fail-open).
iniciarManutencao().catch((e) => {
    console.error('[Manutenção] Falha na inicialização:', e);
});

// Inicializa a barreira de moderação (lista de termos, UI de bloqueio, etc.)
iniciarModeracao().catch((e) => {
    console.error('[Moderação] Falha na inicialização:', e);
});

// Inicializa expostos globais (botão "Termos e Políticas")
iniciarConsentimento();