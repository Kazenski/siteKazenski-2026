import { app, db, auth } from '../core/firebase.js';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { escapeHTML } from '../core/utils.js';
window.profAPI = window.profAPI || {};

let state = {
    filters: { school: '', classId: '', disciplineId: '', quarter: '1' },
    cache: { students: [], disciplinesMap: new Map() },
    chamada: { registros: {}, obs: "", lancado: null },
    notasCache: {}
};
let els = {};
let anotacoesCache = [];
let apoiaCache = [];
let sortedGroupsCache = [];
let cadastroSucessos = [];
let recadastroCache = [];
let recadastroSelected = new Set();
let chartInstances = {}; 
let currentStudentAnalysisData = null;
let avaliacoesCache = [];
let avaliacoesSort = { column: 'dataAplicacao', order: 'desc' };
let geralAnalysisCache = {
    students: [],
    faltasMap: {}, 
    notasMap: {} 
};

const QUESITOS_AVALIACAO = {
    "Eixo 1: Conhecimento e Conteúdo": [
        { id: 'profundidade_pesquisa', label: 'Profundidade da Pesquisa' },
        { id: 'aplicacao_conceitos', label: 'Aplicação Correta dos Conceitos' },
        { id: 'pensamento_critico', label: 'Pensamento Crítico e Relevância' },
        { id: 'clareza_informacao', label: 'Clareza e Correção da Informação' }
    ],
    "Eixo 2: Habilidades Técnicas": [
        { id: 'criatividade_originalidade', label: 'Criatividade e Originalidade' },
        { id: 'qualidade_storytelling', label: 'Qualidade do Storytelling' },
        { id: 'producao_manual_digital', label: 'Produção Manual/Digital' },
        { id: 'design_usabilidade', label: 'Design e Usabilidade' }
    ],
    "Eixo 3: Comunicação": [
        { id: 'clareza_oralidade', label: 'Clareza e Objetividade na Oralidade' },
        { id: 'argumentacao_defesa', label: 'Argumentação e Defesa do Projeto' },
        { id: 'qualidade_material_apoio', label: 'Qualidade do Material de Apoio' }
    ],
    "Eixo 4: Socioemocional": [
        { id: 'colaboracao_equipe', label: 'Colaboração e Trabalho em Equipe' },
        { id: 'responsabilidade_autonomia', label: 'Responsabilidade e Autonomia' },
        { id: 'comprometimento_entregas', label: 'Comprometimento com as Entregas' },
        { id: 'proatividade_iniciativa', label: 'Proatividade e Iniciativa' },
        { id: 'escuta_ativa_feedback', label: 'Escuta Ativa e Feedback' },
        { id: 'resolucao_conflitos', label: 'Resolução de Conflitos' }
    ]
};

let evalState = {
    selectedStudents: [], 
    scores: {}, 
    currentQuesitoId: null
};

export async function renderProfessorTab() {
    const container = document.getElementById('professor-content');
    if (!container) return;

    // Remove limitações de largura para ocupar 100% da tela em todos os dispositivos
    container.classList.remove('max-w-7xl', 'mx-auto');
    container.classList.add('w-full', 'px-2', 'md:px-4', 'flex-1');

    if (!auth.currentUser) {
        container.innerHTML = '<div class="text-center text-slate-500 mt-20">Acesso negado. Faça login.</div>';
        return;
    }

    mapearDOM(); // 1º - O sistema "lê" todos os botões da tela
    setupSubTabs();
    await initFilters();
    els.inputDate.valueAsDate = new Date();

    // ==========================================
    // EVENTOS INICIAIS (Sempre APÓS o mapearDOM)
    // ==========================================
    
    // Básicos
    els.btnLoad.onclick = loadMasterData;
    els.btnGenReport.onclick = generateReport;
    els.btnPdf.onclick = generatePdf;

    // Gatilhos de Anotações
    els.btnRefreshAnotacoes.onclick = () => window.profAPI.loadAnotacoes();
    els.anotacaoFilter.addEventListener('input', () => window.profAPI.renderAnotacoesTable());

    // FUNÇÃO SEGURA PARA ADICIONAR EVENTOS (Evita erros no console)
    const addSafeListener = (target, func) => {
        // Adicionada a classe .prof-subtab-btn para não conflitar com a aba do Aluno
        const btn = document.querySelector(`.prof-subtab-btn[data-target="${target}"]`);
        if (btn) btn.addEventListener('click', func);
    };

    addSafeListener('apoia', () => window.profAPI.loadApoiaRegistros());
    addSafeListener('sorteios', () => window.profAPI.initSorteiosTab());
    addSafeListener('analise', () => window.profAPI.populateAnaliseStudentSelect());
    addSafeListener('analise-geral', () => window.profAPI.loadGeralDashboard());
    addSafeListener('avaliacoes', () => window.profAPI.loadAvaliacoesAdmin());
    addSafeListener('horario', () => window.profAPI.loadGradeHoraria());
    addSafeListener('avisos', () => window.profAPI.loadAvisosPanel());
    addSafeListener('aval360', () => window.profAPI.loadAvaliacoes360());
    addSafeListener('logs', () => window.profAPI.prepararAbaLogs());

    // Faz o sistema buscar os dados corretos caso o professor mude de N1 para N2
    if(els.evalSelectAv) {
        els.evalSelectAv.addEventListener('change', () => {
            if(evalState.selectedStudents.length > 0) {
                window.profAPI.loadSavedEvalData(evalState.selectedStudents[0].id);
            }
        });
    }
    
    // document.querySelector('[data-target="apoia"]').addEventListener('click', () => {
    //     window.profAPI.loadApoiaRegistros();
    // });

    // document.querySelector('[data-target="sorteios"]').addEventListener('click', () => {
    //     window.profAPI.initSorteiosTab();
    // });

    // document.querySelector('[data-target="analise"]').addEventListener('click', () => {
    //     window.profAPI.populateAnaliseStudentSelect();
    // });

    // document.querySelector('[data-target="analise-geral"]').addEventListener('click', () => {
    //     window.profAPI.loadGeralDashboard();
    // });

    // document.querySelector('[data-target="avaliacoes"]').addEventListener('click', () => {
    //     window.profAPI.loadAvaliacoesAdmin();
    // });

    // document.querySelector('[data-target="horario"]').addEventListener('click', () => {
    //     window.profAPI.loadGradeHoraria();
    // });

    // document.querySelector('[data-target="avisos"]').addEventListener('click', () => {
    //     window.profAPI.loadAvisosPanel();
    // });

    // Botões de Status de Lançamento (Pendente/Lançado)
    els.launchBtns.forEach(btn => {
        btn.onclick = () => {
            els.launchBtns.forEach(b => b.classList.remove('selected', 'bg-green-500/20', 'border-green-500', 'text-green-400', 'bg-red-500/20', 'border-red-500', 'text-red-400', 'bg-amber-500/20', 'border-amber-500', 'border-2'));
            btn.classList.add('selected', 'border-2');
            const val = btn.dataset.val;
            state.chamada.lancado = val === "true" ? true : (val === "false" ? false : null);
        };
    });
}

function mapearDOM() {
    els = {
        // Filtros Globais
        selSchool: document.getElementById('prof-filter-school'),
        selClass: document.getElementById('prof-filter-class'),
        selDisc: document.getElementById('prof-filter-disc'),
        selQuarter: document.getElementById('prof-filter-quarter'),
        inputDate: document.getElementById('prof-date'),
        btnLoad: document.getElementById('btn-prof-load'),

        // Chamada
        chamadaEmpty: document.getElementById('chamada-empty'),
        chamadaWrapper: document.getElementById('chamada-wrapper'),
        studentList: document.getElementById('chamada-list'),
        obsInput: document.getElementById('chamada-obs'),
        btnSaveChamada: document.getElementById('btn-save-chamada'),
        launchBtns: document.querySelectorAll('.launch-btn'),

        // Notas
        notasActions: document.getElementById('notas-actions'),
        notasList: document.getElementById('notas-list-container'),
        notasBody: document.getElementById('notas-table-body'),
        notasMsg: document.getElementById('notas-msg'),
        massInput: document.getElementById('mass-note-value'),
        massN1: document.getElementById('check-mass-n1'),
        massN2: document.getElementById('check-mass-n2'),
        massN3: document.getElementById('check-mass-n3'),
        massN4: document.getElementById('check-mass-n4'),

        // Relatório de Faltas
        relStart: document.getElementById('rel-start'),
        relEnd: document.getElementById('rel-end'),
        btnGenReport: document.getElementById('btn-gen-report'),
        relResults: document.getElementById('rel-results'),
        relSummary: document.getElementById('rel-summary-body'),
        relDetailed: document.getElementById('rel-detailed-body'),
        relTotal: document.getElementById('rel-total'),

        // Exportar PDF
        pdfStart: document.getElementById('pdf-start'),
        pdfEnd: document.getElementById('pdf-end'),
        btnPdf: document.getElementById('btn-gen-pdf'),
        pdfMsg: document.getElementById('pdf-msg'),

        // Avaliação 360
        aval360List: document.getElementById('aval360-list-container'),
        modalAval360: document.getElementById('modal-aval360'),
        aval360Id: document.getElementById('aval360-id'),
        aval360Aluno: document.getElementById('aval360-aluno'),
        aval360Quesito: document.getElementById('aval360-quesito'),
        aval360Status: document.getElementById('aval360-status'),
        aval360Texto: document.getElementById('aval360-texto'),
        btnDelAval360: document.getElementById('btn-delete-aval360'),

        // Anotações Conselho
        anotacaoFilter: document.getElementById('anotacao-filter-aluno'),
        btnRefreshAnotacoes: document.getElementById('btn-refresh-anotacoes'),
        anotacoesBody: document.getElementById('anotacoes-table-body'),
        anotacoesMsg: document.getElementById('anotacoes-msg'),

        // Modal Anotação
        anotacaoModal: document.getElementById('anotacao-modal'),
        anotacaoTitle: document.getElementById('anotacao-modal-title'),
        anotacaoId: document.getElementById('anotacao-id'),
        anotacaoSchool: document.getElementById('anotacao-school-display'),
        anotacaoClass: document.getElementById('anotacao-class-display'),
        anotacaoDiscId: document.getElementById('anotacao-disc-id'),
        anotacaoAlunoSel: document.getElementById('anotacao-aluno-select'),
        anotacaoTexto: document.getElementById('anotacao-texto'),
        anotacaoGestao: document.getElementById('anotacao-gestao'),
        btnSaveAnotacao: document.getElementById('btn-save-anotacao'),

        // APOIA
        apoiaList: document.getElementById('apoia-registros-list'),
        apoiaMsg: document.getElementById('apoia-msg'),
        apoiaFreqBox: document.getElementById('apoia-freq-analysis'),
        apoiaFreqBody: document.getElementById('apoia-freq-body'),
        apoiaModal: document.getElementById('apoia-modal'),
        apoiaTitle: document.getElementById('apoia-modal-title'),
        apoiaId: document.getElementById('apoia-id'),
        apoiaEscola: document.getElementById('apoia-escola'),
        apoiaTurma: document.getElementById('apoia-turma'),
        apoiaDisc: document.getElementById('apoia-disciplina'),
        apoiaAlunoSel: document.getElementById('apoia-aluno-select'),
        apoiaTrimestre: document.getElementById('apoia-trimestre'),
        apoiaStatus: document.getElementById('apoia-status'),
        apoiaTexto: document.getElementById('apoia-texto'),
        apoiaIntervencoes: document.getElementById('apoia-intervencoes'),
        intAvisoData: document.getElementById('int-aviso-data'),
        intAvisoObs: document.getElementById('int-aviso-obs'),
        intConselhoData: document.getElementById('int-conselho-data'),
        intConselhoObs: document.getElementById('int-conselho-obs'),
        btnSaveApoia: document.getElementById('btn-save-apoia'),
        pdfRenderArea: document.getElementById('pdf-render-area'),

        // Sorteios
        sorteiosCount: document.getElementById('sorteios-student-count'),
        btnToggleIndiv: document.getElementById('btn-toggle-indiv'),
        btnToggleGrupos: document.getElementById('btn-toggle-grupos'),
        viewSorteioIndiv: document.getElementById('view-sorteio-indiv'),
        viewSorteioGrupos: document.getElementById('view-sorteio-grupos'),
        rouletteDisplay: document.getElementById('roulette-display'),
        btnSpinIndiv: document.getElementById('btn-spin-indiv'),
        btnSpinGrupos: document.getElementById('btn-spin-grupos'),
        groupSizeInput: document.getElementById('group-size'),
        btnExportTxt: document.getElementById('btn-export-txt'),
        groupsDisplay: document.getElementById('groups-display'),

        // Cadastro Massivo
        cadastroInput: document.getElementById('cadastro-input'),
        btnProcessarCadastro: document.getElementById('btn-processar-cadastro'),
        btnPdfCadastro: document.getElementById('btn-pdf-cadastro'),
        cadastroLog: document.getElementById('cadastro-log-area'),
        logPing: document.getElementById('log-ping'),
        logStatusDot: document.getElementById('log-status-dot'),

        // Vincular Alunos (Recadastro)
        reList: document.getElementById('re-list-container'),
        reCount: document.getElementById('re-count-val'),
        reSearch: document.getElementById('re-search-input'),
        reLog: document.getElementById('re-log-area'),

        // Análise de Dados (Dashboard)
        analiseStudentSel: document.getElementById('analise-student-select'),
        analiseDashboard: document.getElementById('analise-dashboard'),
        analiseMsg: document.getElementById('analise-msg'),
        kpiConsecutive: document.getElementById('kpi-consecutive'),
        kpiMinGrade: document.getElementById('kpi-min-grade'),
        kpiMaxGrade: document.getElementById('kpi-max-grade'),
        canvasGrades: document.getElementById('chart-grades'),
        msgGrades: document.getElementById('chart-grades-msg'),
        canvasPresence: document.getElementById('chart-presence'),
        canvasEvolution: document.getElementById('chart-evolution'),
        msgEvolution: document.getElementById('chart-evolution-msg'),
        selEvolutionDisc: document.getElementById('chart-evolution-disc'),
        predictiveList: document.getElementById('predictive-list'),

        // Análise Geral (Turma)
        geralDashboard: document.getElementById('geral-dashboard'),
        geralMsg: document.getElementById('geral-msg'),
        geralStartDate: document.getElementById('geral-start-date'),
        geralEndDate: document.getElementById('geral-end-date'),
        kpiGeralMedia: document.getElementById('kpi-geral-media'),
        kpiGeralFaltas: document.getElementById('kpi-geral-faltas'),
        kpiGeralRisco: document.getElementById('kpi-geral-risco'),
        canvasGeralScatter: document.getElementById('chart-geral-scatter-notas'),
        msgGeralNotas: document.getElementById('msg-geral-notas'),
        canvasGeralFaltas: document.getElementById('chart-geral-bar-faltas'),
        msgGeralFaltas: document.getElementById('msg-geral-faltas'),
        geralFreqStudentSel: document.getElementById('geral-freq-student-select'),
        canvasGeralAll: document.getElementById('chart-geral-all-grades'),
        msgGeralAll: document.getElementById('msg-geral-all'),

        // Gestão de Avaliações
        evalListBody: document.getElementById('avaliacoes-list-body'),
        evalEmptyMsg: document.getElementById('avaliacoes-empty-msg'),
        evalAdminModal: document.getElementById('avaliacao-modal'),
        evalAdminTitle: document.getElementById('avaliacao-modal-title'),
        evalAdminId: document.getElementById('avaliacao-id'),
        formEvalDisc: document.getElementById('form-eval-disc'),
        formEvalDate: document.getElementById('form-eval-date'),
        formEvalTurmas: document.getElementById('form-eval-turmas'),
        formEvalContent: document.getElementById('form-eval-content'),
        formEvalTips: document.getElementById('form-eval-tips'),
        formEvalValue: document.getElementById('form-eval-value'),
        formEvalVisible: document.getElementById('form-eval-visible'),
        btnSaveAvaliacao: document.getElementById('btn-save-avaliacao'),

        // Grade Horária
        horarioFormContainer: document.getElementById('horario-form-container'),
        horarioFormTitle: document.getElementById('horario-form-title'),
        horarioId: document.getElementById('horario-id'),
        horarioDia: document.getElementById('horario-dia'),
        horarioOrdem: document.getElementById('horario-ordem'),
        horarioDisc: document.getElementById('horario-disc'),
        horarioProf: document.getElementById('horario-prof'),
        horarioConteudo: document.getElementById('horario-conteudo'),
        gradeGrid: document.getElementById('grade-grid'),
        horarioMsg: document.getElementById('horario-msg'),
        btnSaveHorario: document.getElementById('btn-save-horario'),

        // Avisos
        avisoFormContainer: document.getElementById('aviso-form-container'),
        avisoFormTitle: document.getElementById('aviso-form-title'),
        avisoId: document.getElementById('aviso-id'),
        avisoMsgInput: document.getElementById('aviso-msg'),
        avisoTurmasList: document.getElementById('aviso-turmas-list'),
        btnSaveAviso: document.getElementById('btn-save-aviso'),
        avisosList: document.getElementById('avisos-list'),
        avisosMsg: document.getElementById('avisos-msg'),

        // Reset Anual
        resetYear: document.getElementById('reset-year'),
        btnStartReset: document.getElementById('btn-start-reset'),
        resetConsole: document.getElementById('reset-console-container'),
        resetLog: document.getElementById('reset-log'),
        resetProgress: document.getElementById('reset-progress-fill'),

        // Pontos Extras (NOVO)
        extrasBody: document.getElementById('extras-table-body'),
        extrasMsg: document.getElementById('extras-msg'),
        massExt1: document.getElementById('check-mass-ext1'),
        massExt2: document.getElementById('check-mass-ext2'),
        massExt3: document.getElementById('check-mass-ext3'),
        massExt4: document.getElementById('check-mass-ext4'),

        // Logs
        logsBody: document.getElementById('logs-list-body'),
    };
}

function setupSubTabs() {
    const btns = document.querySelectorAll('.prof-subtab-btn');
    const contents = document.querySelectorAll('.prof-tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 1. Resetar estilos dos botões
            btns.forEach(b => {
                b.classList.remove('active', 'bg-amber-600', 'text-white');
                b.classList.add('bg-slate-800', 'text-slate-400');
            });

            // 2. Ativar botão clicado
            btn.classList.add('active', 'bg-amber-600', 'text-white');
            btn.classList.remove('bg-slate-800', 'text-slate-400');

            // 3. ESCONDER todas as abas (Garante que o 'hidden' seja aplicado)
            contents.forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('flex');
            });

            // 4. MOSTRAR apenas a aba alvo
            const targetId = `ptab-${btn.getAttribute('data-target')}`;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.classList.remove('hidden');
                targetEl.classList.add('flex');
            }
        });
    });
}

// ==========================================
// MÓDULO 1: FILTROS MASTER
// ==========================================
async function initFilters() {
    const snap = await getDocs(query(collection(db, "escolasCadastradas"), where("ativo", "==", true), orderBy("nome")));
    els.selSchool.innerHTML = '<option value="">-- Selecione Escola --</option>';
    snap.forEach(d => els.selSchool.add(new Option(d.data().nome, d.data().nome)));

    els.selSchool.onchange = async (e) => {
        state.filters.school = e.target.value;
        els.selClass.innerHTML = '<option>Carregando...</option>'; els.selClass.disabled = true;
        els.selDisc.innerHTML = '<option>Aguardando...</option>'; els.selDisc.disabled = true;

        const snap = await getDocs(query(collection(db, "turmasCadastradas"), where("ativo", "==", true), orderBy("nomeExibicao")));
        els.selClass.innerHTML = '<option value="">-- Selecione Turma --</option>';
        snap.forEach(d => els.selClass.add(new Option(d.data().nomeExibicao, d.data().identificador)));
        els.selClass.disabled = false;
    };

    els.selClass.onchange = async (e) => {
        state.filters.classId = e.target.value;
        els.selDisc.innerHTML = '<option>Carregando...</option>'; els.selDisc.disabled = true;

        const snap = await getDocs(query(collection(db, "disciplinasCadastradas"), where("ativo", "==", true), orderBy("nomeExibicao")));
        els.selDisc.innerHTML = '<option value="">-- Selecione Disciplina --</option>';
        snap.forEach(d => {
            els.selDisc.add(new Option(d.data().nomeExibicao, d.data().identificador));
            state.cache.disciplinesMap.set(d.data().identificador, d.data().nomeExibicao);
        });
        els.selDisc.disabled = false;
    };

    els.selDisc.onchange = (e) => state.filters.disciplineId = e.target.value;
    els.selQuarter.onchange = (e) => state.filters.quarter = e.target.value;
}

// ==========================================
// MÓDULO 2: CARREGAMENTO CENTRAL (CHAMADA E NOTAS)
// ==========================================
async function loadMasterData() {
    const { classId, disciplineId, quarter } = state.filters;
    const date = els.inputDate.value;

    if (!classId || !disciplineId || !date) return alert("Preencha todos os filtros (Escola, Turma, Disciplina e Data).");

    document.querySelector('[data-target="chamada"]').click();
    els.chamadaEmpty.classList.add('hidden');
    els.chamadaWrapper.classList.remove('hidden');
    els.studentList.innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-amber-500 text-3xl"></i></div>';

    els.notasMsg.textContent = "Carregando pauta de notas...";
    els.notasMsg.classList.remove('hidden');

    try {
        const qUsers = query(collection(db, "users"), where("turma", "==", classId), where("Aluno", "==", true), orderBy("nome"));
        const snapUsers = await getDocs(qUsers);
        state.cache.students = [];
        snapUsers.forEach(d => state.cache.students.push({ id: d.id, ...d.data() }));

        const docId = `${classId}_${disciplineId}_${date}`;
        const snapChamada = await getDoc(doc(db, "presencas", docId));
        state.chamada = { registros: {}, obs: "", lancado: null };

        if (snapChamada.exists()) {
            const data = snapChamada.data();
            state.chamada.registros = data.registros || {};
            state.chamada.obs = data.comentarioGeral || "";
            if (data.hasOwnProperty('lancadoSistema')) state.chamada.lancado = data.lancadoSistema;
        }

        // 3. Busca Notas (com correção automática 4 notas)
        state.notasCache = {};
        const batch = writeBatch(db);
        let needsBatch = false;

        await Promise.all(state.cache.students.map(async (st) => {
            const docSnap = await getDoc(doc(db, "notas", st.id));
            let n1 = "", n2 = "", n3 = "", n4 = "";
            let e1 = false, e2 = false, e3 = false, e4 = false;
            let missing = false;

            if (docSnap.exists()) {
                const trimData = docSnap.data().disciplinasComNotas?.[disciplineId]?.[quarter];
                if (trimData) {
                    n1 = trimData.nota1 ?? ""; n2 = trimData.nota2 ?? ""; n3 = trimData.nota3 ?? "";
                    if (trimData.nota4 === undefined) { n4 = ""; missing = true; } else { n4 = trimData.nota4 ?? ""; }
                    
                    // Extrai os pontos extras (false por padrão)
                    e1 = trimData.ext1 || false;
                    e2 = trimData.ext2 || false;
                    e3 = trimData.ext3 || false;
                    e4 = trimData.ext4 || false;

                } else { missing = true; }
            } else { missing = true; }

            if (missing) {
                batch.set(doc(db, "notas", st.id), {
                    userId: st.id, nomeAluno: st.nome, escola: state.filters.school,
                    disciplinasComNotas: {
                        [disciplineId]: {
                            [quarter]: {
                                nota1: n1 === "" ? null : n1, nota2: n2 === "" ? null : n2, nota3: n3 === "" ? null : n3, nota4: n4 === "" ? null : n4,
                                ext1: e1, ext2: e2, ext3: e3, ext4: e4
                            }
                        }
                    },
                    lastUpdatedAt: serverTimestamp()
                }, { merge: true });
                needsBatch = true;
            }
            state.notasCache[st.id] = { n1, n2, n3, n4, e1, e2, e3, e4, modified: false, extModified: false };
        }));

        if (needsBatch) await batch.commit();

        renderChamadaList();
        renderNotasTable();
        renderExtrasTable();
        //window.profAPI.populateEvalStudents();

    } catch (e) {
        els.studentList.innerHTML = `<div class="text-center text-red-500 py-10 font-bold">${e.message}</div>`;
        els.notasMsg.textContent = e.message;
    }
}

function renderExtrasTable() {
    if(!els.extrasBody) return;
    els.extrasBody.innerHTML = '';
    if(els.extrasMsg) els.extrasMsg.classList.add('hidden');
    
    state.cache.students.forEach(st => {
        const cache = state.notasCache[st.id];
        const isActive = st.registroAtivo !== false;
        
        // Calcula a soma (Quantos estão marcados como TRUE)
        const somaExtras = [cache.e1, cache.e2, cache.e3, cache.e4].filter(Boolean).length;
        
        const tr = document.createElement('tr');
        tr.dataset.uid = st.id;
        tr.className = `group transition-colors border-b border-slate-800 ${isActive ? 'hover:bg-slate-800/50' : 'opacity-50 grayscale'}`;
        
        let html = `
            <td class="p-4 text-center">
                <input type="checkbox" class="w-4 h-4 accent-amber-500 cursor-pointer row-checkbox-ext" ${!isActive ? 'disabled' : ''}>
            </td>
            <td class="p-4 font-bold text-slate-200 truncate max-w-[200px]">${escapeHTML(st.nome)}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}">
                    ${isActive ? 'ATIVO' : 'INATIVO'}
                </span>
            </td>
        `;

        // Campos de EXT 1 a EXT 4
        ['e1', 'e2', 'e3', 'e4'].forEach(f => { 
            const isChecked = cache[f] ? 'checked' : '';
            html += `<td class="p-2 text-center">
                <input type="checkbox" class="w-5 h-5 accent-blue-500 cursor-pointer ext-input" 
                    ${isChecked} data-field="${f}" 
                    onchange="window.profAPI.updateLocalExtra('${st.id}', this)" 
                    ${isActive ? '' : 'disabled'}>
            </td>`;
        });

        html += `
            <td class="p-4 text-center font-black text-xl text-blue-400" id="soma-ext-${st.id}">${somaExtras}</td>
            <td class="p-4 text-center">
                <button onclick="window.profAPI.saveSingleExtra('${st.id}')" class="btn-save-row-ext text-slate-600 hover:text-blue-400 transition-colors opacity-50" title="Salvar Linha">
                    <i class="fas fa-save text-xl"></i>
                </button>
            </td>
        `;
        tr.innerHTML = html;
        els.extrasBody.appendChild(tr);
    });
}

// ==========================================
// RENDERIZADORES E LÓGICA DE INTERFACE
// ==========================================
function renderChamadaList() {
    els.studentList.innerHTML = '';
    els.obsInput.value = state.chamada.obs;
    
    // Atualiza o botão de Status de Lançamento (Pendente/Lançado)
    const targetBtn = document.querySelector(`.launch-btn[data-val="${state.chamada.lancado}"]`);
    if(targetBtn) targetBtn.click();

    state.cache.students.forEach(st => {
        const isActive = st.registroAtivo !== false; 
        const status = state.chamada.registros[st.id] || 'presente';
        state.chamada.registros[st.id] = status; // Por padrão, todos ganham 'presente'

        const row = document.createElement('div');
        row.className = `student-row ${!isActive ? 'inactive' : ''}`;
        row.innerHTML = `
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="hidden md:flex w-10 h-10 rounded-xl bg-slate-950 items-center justify-center text-sm font-black text-amber-500 border border-slate-700 shadow-inner shrink-0">${st.nome.charAt(0)}</div>
                
                <span class="text-sm font-bold text-slate-200 truncate w-full md:max-w-md">${escapeHTML(st.nome)}</span>
            </div>
            
            <div class="flex items-center justify-between w-full md:w-auto gap-4 shrink-0">
                <select class="hidden md:block bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 font-bold ${isActive ? 'text-blue-400' : 'text-slate-500'} outline-none" onchange="window.profAPI.toggleActive('${st.id}', this)">
                    <option value="true" ${isActive?'selected':''}>ATIVO</option><option value="false" ${!isActive?'selected':''}>INATIVO</option>
                </select>
                
                <div class="flex w-full md:w-auto justify-between bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
                    <button class="p-btn flex-1 md:flex-none presente ${status==='presente'?'selected':''}" onclick="window.profAPI.setStatus('${st.id}', 'presente', this)" ${!isActive?'disabled':''}>P</button>
                    <button class="p-btn flex-1 md:flex-none ausente ${status==='ausente'?'selected':''}" onclick="window.profAPI.setStatus('${st.id}', 'ausente', this)" ${!isActive?'disabled':''}>F</button>
                    <button class="p-btn flex-1 md:flex-none justificado ${status==='justificado'?'selected':''}" onclick="window.profAPI.setStatus('${st.id}', 'justificado', this)" ${!isActive?'disabled':''}>J</button>
                </div>
            </div>
        `;
        els.studentList.appendChild(row);
    });
}

window.profAPI.saveChamada = async () => {
    const date = els.inputDate.value;
    const docId = `${classId}_${disciplineId}_${date}`;
    
    const payload = { 
        turma: classId, 
        disciplineId: disciplineId, 
        data_aula_timestamp: Timestamp.fromDate(new Date(date + "T00:00:00")), 
        registros: state.chamada.registros, 
        comentarioGeral: els.obsInput.value, 
        lancadoSistema: state.chamada.lancado, 
        lastUpdate: serverTimestamp() 
    };
    
    els.btnSaveChamada.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    try { 
        await setDoc(doc(db, "presencas", docId), payload, { merge: true }); 
        alert("Chamada Salva no Firebase!"); 
    } catch(e) { 
        alert("Erro: " + e.message); 
    }
}

function renderNotasTable() {
    els.notasBody.innerHTML = '';
    els.notasMsg.classList.add('hidden');
    
    state.cache.students.forEach(st => {
        const cache = state.notasCache[st.id];
        const media = calcMedia(cache.n1, cache.n2, cache.n3, cache.n4);
        const isActive = st.registroAtivo !== false;
        
        const tr = document.createElement('tr');
        tr.dataset.uid = st.id;
        // Se inativo, fica transparente e bloqueia hover
        tr.className = `group transition-colors border-b border-slate-800 ${isActive ? 'hover:bg-slate-800/50' : 'opacity-50 grayscale'}`;
        
        let html = `
            <td class="p-4 text-center">
                <input type="checkbox" class="w-4 h-4 accent-amber-500 cursor-pointer row-checkbox" ${!isActive ? 'disabled' : ''}>
            </td>
            <td class="p-4 font-bold text-slate-200 truncate max-w-[200px]">${escapeHTML(st.nome)}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}">
                    ${isActive ? 'ATIVO' : 'INATIVO'}
                </span>
            </td>
        `;

        // Campos de N1 a N4
        ['n1', 'n2', 'n3', 'n4'].forEach(f => { 
            const val = cache[f];
            html += `<td class="p-2">
                <input type="number" step="0.1" min="0" max="10" 
                    class="nota-input font-bold text-lg ${getNoteColor(val)}" 
                    value="${val}" data-field="${f}" 
                    onchange="window.profAPI.updateLocalNote('${st.id}', this)" 
                    placeholder="-" ${isActive ? '' : 'disabled'}>
            </td>`;
        });

        html += `
            <td class="p-4 text-center font-black text-xl ${getNoteColor(media==='-'?'':media)}" id="media-${st.id}">${media}</td>
            <td class="p-4 text-center">
                <button onclick="window.profAPI.saveSingleNote('${st.id}')" class="btn-save-row text-slate-600 hover:text-amber-400 transition-colors opacity-50" title="Salvar Linha">
                    <i class="fas fa-save text-xl"></i>
                </button>
            </td>
        `;
        tr.innerHTML = html;
        els.notasBody.appendChild(tr);
    });
}

// Helpers
function calcMedia(n1, n2, n3, n4) { 
    let sum = 0, count = 0;
    [n1, n2, n3, n4].forEach(v => { const f = parseFloat(v); if(!isNaN(f)){ sum+=f; count++; } });
    return count > 0 ? (sum / count).toFixed(1) : "-";
}
function getNoteColor(v) {
    const n = parseFloat(v);
    if(isNaN(n)) return "text-slate-500";
    if(n > 6) return "text-green-400"; 
    if(n === 6) return "text-amber-400"; 
    return "text-red-400";
}

// ==========================================
// MÓDULO 3: RELATÓRIO DE FALTAS
// ==========================================
async function generateReport() {
    const { classId, disciplineId } = state.filters;
    const startStr = els.relStart.value;
    const endStr = els.relEnd.value;

    if(!classId) return alert("Selecione a Turma no topo (menu principal).");
    if(!startStr || !endStr) return alert("Selecione as datas de início e fim.");

    els.relResults.classList.remove('hidden');
    els.relDetailed.innerHTML = '<tr><td colspan="2" class="text-center py-8 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando métricas...</td></tr>';
    els.relSummary.innerHTML = ''; 
    els.relTotal.textContent = '';

    try {
        const start = new Date(startStr + "T00:00:00");
        const end = new Date(endStr + "T23:59:59");
        
        // Array de filtros do Firebase
        const constraints = [
            where("turma", "==", classId),
            where("data_aula_timestamp", ">=", Timestamp.fromDate(start)),
            where("data_aula_timestamp", "<=", Timestamp.fromDate(end))
        ];
        
        // Se escolheu disciplina, filtra só ela. Se não, traz todas da turma.
        if(disciplineId) constraints.push(where("disciplinaId", "==", disciplineId));

        const q = query(collection(db, "presencas"), ...constraints);
        const snap = await getDocs(q);

        const stats = {}; 
        const discStats = {}; 
        let grandTotal = 0;

        // Processa os dados
        snap.forEach(doc => {
            const data = doc.data();
            const dId = data.disciplineId || data.disciplinaId;
            
            // Filtro local da disciplina para evitar bugs do banco
            if(disciplineId && dId !== disciplineId) return;

            Object.entries(data.registros || {}).forEach(([uid, status]) => {
                let s = status;
                if(s === 'falta') s = 'ausente';
                
                if(s === 'ausente') {
                    stats[uid] = (stats[uid] || 0) + 1;
                    discStats[dId] = (discStats[dId] || 0) + 1;
                    grandTotal++;
                }
            });
        });

        // 1. Renderiza Tabela de Resumo
        let summaryHtml = '';
        for(const [dId, count] of Object.entries(discStats)) {
            const dName = state.cache.disciplinesMap.get(dId) || dId;
            summaryHtml += `
                <tr class="hover:bg-slate-800/80 transition-colors">
                    <td class="p-4 text-slate-300 font-bold">${escapeHTML(dName)}</td>
                    <td class="p-4 text-center font-black text-red-500 text-lg">${count}</td>
                </tr>`;
        }
        els.relSummary.innerHTML = summaryHtml || '<tr><td colspan="2" class="text-center p-6 text-slate-500 italic">Nenhuma falta registrada no período.</td></tr>';
        els.relTotal.textContent = `Total de Faltas no Período: ${grandTotal}`;

        // 2. Renderiza Tabela Detalhada por Aluno
        els.relDetailed.innerHTML = '';
        for(const [uid, count] of Object.entries(stats)) {
            let name = "Aluno Desconhecido";
            const cached = state.cache.students.find(s => s.id === uid);
            if (cached) {
                name = cached.nome;
            } else {
                const docSnap = await getDoc(doc(db, "users", uid));
                if(docSnap.exists()) name = docSnap.data().nome;
            }
            
            els.relDetailed.insertAdjacentHTML('beforeend', `
                <tr class="hover:bg-slate-800/80 transition-colors">
                    <td class="p-4 font-bold text-slate-200">${escapeHTML(name)}</td>
                    <td class="p-4 text-center font-black text-red-500 text-lg">${count}</td>
                </tr>
            `);
        }
        if(Object.keys(stats).length === 0) {
            els.relDetailed.innerHTML = '<tr><td colspan="2" class="text-center p-6 text-slate-500 italic">Turma com 100% de presença neste período!</td></tr>';
        }
        
    } catch(e) { 
        alert("Erro ao gerar relatório: " + e.message); 
        els.relDetailed.innerHTML = `<tr><td colspan="2" class="text-center p-6 text-red-500 font-bold">Falha na consulta.</td></tr>`;
    }
}

async function generatePdf() {
    const { classId, disciplineId, school } = state.filters;
    const startStr = els.pdfStart.value;
    const endStr = els.pdfEnd.value;

    if(!classId || !disciplineId) return alert("Selecione Turma e Disciplina no menu superior.");
    if(!startStr || !endStr) return alert("Selecione as datas de início e fim.");

    els.pdfMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Gerando PDF...';
    els.pdfMsg.className = "text-center text-sm mt-4 font-bold text-blue-400 block";
    els.btnPdf.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        
        // 1. Puxa os alunos (do cache ou do banco se o cache falhar)
        let students = [];
        if (state.cache.students.length > 0 && state.filters.classId === classId) {
            students = [...state.cache.students];
        } else {
            const qS = query(collection(db, "users"), where("turma", "==", classId), where("Aluno", "==", true), orderBy("nome"));
            const snapS = await getDocs(qS);
            snapS.forEach(d => students.push({id: d.id, nome: d.data().nome}));
        }

        // 2. Busca todas as presenças do período
        const start = new Date(startStr + "T00:00:00");
        const end = new Date(endStr + "T23:59:59");
        // Remove o filtro estrito de disciplina da query e filtra via JS
        const qP = query(
            collection(db, "presencas"), 
            where("turma", "==", classId), 
            where("data_aula_timestamp", ">=", Timestamp.fromDate(start)), 
            where("data_aula_timestamp", "<=", Timestamp.fromDate(end)), 
            orderBy("data_aula_timestamp", "asc")
        );
        
        const snapP = await getDocs(qP);
        
        // Filtra as aulas da disciplina correta e monta as colunas (cobre ambos os nomes de variável)
        const cols = [];
        snapP.forEach(doc => {
            const d = doc.data();
            if (d.disciplineId === disciplineId || d.disciplinaId === disciplineId) {
                const dateObj = d.data_aula_timestamp.toDate();
                const label = `${String(dateObj.getDate()).padStart(2,'0')}/${String(dateObj.getMonth()+1).padStart(2,'0')}`;
                cols.push({ label, regs: d.registros || {} });
            }
        });

        if(cols.length === 0) throw new Error("Sem aulas registradas neste período para exportar.");

        // 4. Monta as Linhas (Alunos e as Faltas)
        const body = students.map(s => {
            const row = [s.nome]; 
            let totalFaltas = 0;
            
            cols.forEach(col => {
                const stat = col.regs[s.id]; 
                let mark = '-';
                if(stat === 'presente') mark = 'P'; 
                else if(stat === 'ausente') { mark = 'F'; totalFaltas++; } 
                else if(stat === 'justificado') mark = 'J';
                row.push(mark);
            });
            row.push(String(totalFaltas));
            return row;
        });

        // 5. Instancia o PDF e Desenha a Tabela
        const pdf = new jsPDF('landscape');
        const dName = state.cache.disciplinesMap.get(disciplineId) || disciplineId;
        
        pdf.setFontSize(14); 
        pdf.text("Diario Oficial - Matriz de Frequência", 14, 15);
        pdf.setFontSize(10); 
        pdf.text(`Escola: ${school} | Turma: ${classId} | Disciplina: ${dName}`, 14, 22);
        
        pdf.autoTable({ 
            startY: 30, 
            head: [['Aluno', ...cols.map(c => c.label), 'Total Faltas']], 
            body: body, 
            styles: { fontSize: 8, halign: 'center' }, 
            columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }, 
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] } // Azul padrão para combinar com o layout
        });
        
        pdf.save(`Matriz_Frequencia_${classId}_${dName.substring(0, 10)}.pdf`);
        
        els.pdfMsg.innerHTML = '<i class="fas fa-check-circle mr-2"></i> PDF Baixado com Sucesso!'; 
        els.pdfMsg.classList.replace('text-blue-400', 'text-green-400');
        
    } catch(e) { 
        console.error(e);
        els.pdfMsg.textContent = "Erro: " + e.message; 
        els.pdfMsg.classList.replace('text-blue-400', 'text-red-400'); 
    } finally { 
        els.btnPdf.disabled = false; 
    }
}

// ==========================================
// EXPORT API GLOBAL
// ==========================================
window.profAPI = {
    
    setStatus: (uid, status, btn) => {
        state.chamada.registros[uid] = status;
        btn.parentElement.querySelectorAll('.p-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    },

    markAll: (status) => { document.querySelectorAll(`.p-btn.${status}:not(:disabled)`).forEach(b => b.click()); },
    toggleActive: async (uid, sel) => {
        const newVal = sel.value === 'true'; sel.disabled = true;
        try {
            await updateDoc(doc(db, "users", uid), { registroAtivo: newVal });
            const st = state.cache.students.find(s => s.id === uid); if (st) st.registroAtivo = newVal;
            renderChamadaList(); renderNotasTable();
        } catch (e) { alert("Erro ao atualizar banco."); sel.value = (!newVal).toString(); }
        finally { sel.disabled = false; }
    },

    saveChamada: async () => {
        const { classId, disciplineId } = state.filters;
        const date = els.inputDate.value;
        const docId = `${classId}_${disciplineId}_${date}`;
        const payload = { turma: classId, disciplineId, data_aula_timestamp: Timestamp.fromDate(new Date(date + "T00:00:00")), registros: state.chamada.registros, comentarioGeral: els.obsInput.value, lancadoSistema: state.chamada.lancado, lastUpdate: serverTimestamp() };

        els.btnSaveChamada.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
        try { await setDoc(doc(db, "presencas", docId), payload, { merge: true }); alert("Chamada Salva no Firebase!"); }
        catch (e) { alert("Erro: " + e.message); }
        finally { els.btnSaveChamada.innerHTML = '<i class="fas fa-save mr-2"></i> Salvar Registro'; }
    },

    updateLocalNote: (uid, input) => {
        const field = input.dataset.field; const val = input.value;
        input.className = `nota-input ${getNoteColor(val)}`;
        if (state.notasCache[uid]) {
            state.notasCache[uid][field] = val; state.notasCache[uid].modified = true;
            const c = state.notasCache[uid]; const m = calcMedia(c.n1, c.n2, c.n3, c.n4);
            const mEl = document.getElementById(`media-${uid}`);
            if (mEl) { mEl.textContent = m; mEl.className = `p-4 text-center font-black text-lg ${getNoteColor(m === '-' ? '' : m)}`; }
            const btn = input.closest('tr').querySelector('.btn-save-row');
            if (btn) { btn.classList.remove('opacity-50', 'text-slate-600'); btn.classList.add('text-amber-500', 'opacity-100'); }
        }
    },

    toggleSelectAll: (source) => { document.querySelectorAll('#notas-table-body .row-checkbox:not(:disabled)').forEach(cb => cb.checked = source.checked); },
    applyMassNote: () => {
        const val = els.massInput.value; if (!val) return alert("Digite a nota.");
        const fields = [];
        if (els.massN1.checked) fields.push('n1'); if (els.massN2.checked) fields.push('n2');
        if (els.massN3.checked) fields.push('n3'); if (els.massN4.checked) fields.push('n4');
        if (fields.length === 0) return alert("Selecione (N1, N2, N3 ou N4).");

        const rows = document.querySelectorAll('#notas-table-body .row-checkbox:checked');
        if (rows.length === 0) return alert("Selecione os alunos na tabela.");

        rows.forEach(cb => {
            const tr = cb.closest('tr'); const uid = tr.dataset.uid;
            fields.forEach(f => { const i = tr.querySelector(`[data-field="${f}"]`); i.value = val; window.profAPI.updateLocalNote(uid, i); });
        });
    },

    saveSingleNote: async (uid) => {
        const cache = state.notasCache[uid]; const { disciplineId, quarter } = state.filters;
        try {
            const payload = {
                disciplinasComNotas: {
                    [disciplineId]: {
                        [quarter]: {
                            nota1: cache.n1 === "" ? null : cache.n1, nota2: cache.n2 === "" ? null : cache.n2, nota3: cache.n3 === "" ? null : cache.n3, nota4: cache.n4 === "" ? null : cache.n4, updatedAt: Date.now()
                        }
                    }
                }, lastUpdatedAt: serverTimestamp()
            };
            await setDoc(doc(db, "notas", uid), payload, { merge: true });
            cache.modified = false;
            const btn = document.querySelector(`tr[data-uid="${uid}"] .btn-save-row`);
            if (btn) { btn.classList.add('text-slate-600', 'opacity-50'); btn.classList.remove('text-amber-500', 'opacity-100'); }
        } catch (e) { console.error(e); alert("Erro ao salvar nota isolada."); }
    },

    saveAllNotes: async () => {
        const mods = Object.keys(state.notasCache).filter(uid => state.notasCache[uid].modified);
        if (mods.length === 0) return alert("Nenhuma alteração para salvar.");
        if (!confirm(`Salvar alterações de ${mods.length} alunos?`)) return;
        let err = 0;
        for (const uid of mods) { try { await window.profAPI.saveSingleNote(uid); } catch (e) { err++; } }
        if (err > 0) alert(`Salvo, porém com ${err} erros.`); else alert("Notas salvas no Grimório com Sucesso!");
    },

    // ==========================================
    // MÓDULO: PONTOS EXTRAS
    // ==========================================
    updateLocalExtra: (uid, input) => {
        const field = input.dataset.field; 
        const isChecked = input.checked;
        
        if (state.notasCache[uid]) {
            state.notasCache[uid][field] = isChecked; 
            state.notasCache[uid].extModified = true;
            
            // Recalcula a soma e atualiza a interface
            const c = state.notasCache[uid]; 
            const soma = [c.e1, c.e2, c.e3, c.e4].filter(Boolean).length;
            
            const sEl = document.getElementById(`soma-ext-${uid}`);
            if (sEl) sEl.textContent = soma;
            
            const btn = input.closest('tr').querySelector('.btn-save-row-ext');
            if (btn) { btn.classList.remove('opacity-50', 'text-slate-600'); btn.classList.add('text-blue-500', 'opacity-100'); }
        }
    },

    toggleSelectAllExtras: (source) => { document.querySelectorAll('#extras-table-body .row-checkbox-ext:not(:disabled)').forEach(cb => cb.checked = source.checked); },
    applyMassExtra: () => {
        const fields = [];
        if (els.massExt1.checked) fields.push('e1'); 
        if (els.massExt2.checked) fields.push('e2');
        if (els.massExt3.checked) fields.push('e3'); 
        if (els.massExt4.checked) fields.push('e4');
        if (fields.length === 0) return alert("Selecione qual Coluna Extra (1 a 4) aplicar no painel de massa.");

        const rows = document.querySelectorAll('#extras-table-body .row-checkbox-ext:checked');
        if (rows.length === 0) return alert("Selecione os alunos desejados na tabela.");

        rows.forEach(cb => {
            const tr = cb.closest('tr'); const uid = tr.dataset.uid;
            fields.forEach(f => { 
                const i = tr.querySelector(`[data-field="${f}"]`); 
                i.checked = true; // Aplica sempre como verdadeiro
                window.profAPI.updateLocalExtra(uid, i); 
            });
        });
    },

    saveSingleExtra: async (uid) => {
        const cache = state.notasCache[uid]; const { disciplineId, quarter } = state.filters;
        try {
            const payload = {
                disciplinasComNotas: {
                    [disciplineId]: {
                        [quarter]: {
                            ext1: cache.e1, ext2: cache.e2, ext3: cache.e3, ext4: cache.e4, updatedAt: Date.now()
                        }
                    }
                }, lastUpdatedAt: serverTimestamp()
            };
            await setDoc(doc(db, "notas", uid), payload, { merge: true });
            cache.extModified = false;
            const btn = document.querySelector(`tr[data-uid="${uid}"] .btn-save-row-ext`);
            if (btn) { btn.classList.add('text-slate-600', 'opacity-50'); btn.classList.remove('text-blue-500', 'opacity-100'); }
        } catch (e) { console.error(e); alert("Erro ao salvar extra isolado."); }
    },
    
    saveAllExtras: async () => {
        const mods = Object.keys(state.notasCache).filter(uid => state.notasCache[uid].extModified);
        if (mods.length === 0) return alert("Nenhuma alteração pendente em Pontos Extras para salvar.");
        if (!confirm(`Confirmar registro de pontos extras para ${mods.length} alunos?`)) return;
        
        let err = 0;
        if(els.extrasMsg) {
            els.extrasMsg.textContent = "Salvando extras no Grimório...";
            els.extrasMsg.classList.remove('hidden');
        }
        
        for (const uid of mods) { try { await window.profAPI.saveSingleExtra(uid); } catch (e) { err++; } }
        
        if (err > 0) alert(`Salvo, porém com ${err} erros.`); else alert("Pontos Extras salvos com Sucesso!");
        if(els.extrasMsg) els.extrasMsg.classList.add('hidden');
    },

    // ==========================================
    // MÓDULO: ANOTAÇÕES DO CONSELHO
    // ==========================================
    loadAnotacoes: async () => {
        const { school, classId, disciplineId } = state.filters;
        if(!classId) {
            els.anotacoesMsg.textContent = "Selecione uma Turma no menu superior (Carregar).";
            els.anotacoesMsg.classList.remove('hidden');
            return;
        }

        els.anotacoesMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Buscando anotações...';
        els.anotacoesMsg.classList.remove('hidden');
        els.anotacoesBody.innerHTML = '';

        try {
            const constraints = [where("turma", "==", classId)];
            if(disciplineId) constraints.push(where("disciplina", "==", disciplineId));
            if(school) constraints.push(where("escola", "==", school));

            const q = query(collection(db, "anotacoesAlunos"), ...constraints);
            const snap = await getDocs(q);

            anotacoesCache = [];
            snap.forEach(d => { anotacoesCache.push({ id: d.id, ...d.data() }); });

            // Ordenação local (Mais recentes primeiro)
            anotacoesCache.sort((a, b) => {
                const tA = a.atualizadoEm ? a.atualizadoEm.seconds : 0;
                const tB = b.atualizadoEm ? b.atualizadoEm.seconds : 0;
                return tB - tA;
            });

            window.profAPI.renderAnotacoesTable();

        } catch(e) {
            console.error(e);
            els.anotacoesMsg.textContent = "Erro ao buscar: " + e.message;
        }
    },

    renderAnotacoesTable: () => {
        const termo = els.anotacaoFilter.value.toLowerCase();
        const currentDisc = state.filters.disciplineId;
        
        const filtered = anotacoesCache.filter(a => !termo || (a.alunoNome && a.alunoNome.toLowerCase().includes(termo)));
        els.anotacoesBody.innerHTML = '';

        if(filtered.length === 0) {
            els.anotacoesMsg.textContent = "Nenhuma anotação encontrada.";
            els.anotacoesMsg.classList.remove('hidden');
            return;
        }
        els.anotacoesMsg.classList.add('hidden');

        filtered.forEach(note => {
            const isSameDisc = note.disciplina === currentDisc;
            let dateStr = '-';
            if(note.atualizadoEm?.toDate) dateStr = note.atualizadoEm.toDate().toLocaleDateString('pt-BR');
            else if (note.criadoEm?.toDate) dateStr = note.criadoEm.toDate().toLocaleDateString('pt-BR');
            
            const discName = state.cache.disciplinesMap.get(note.disciplina) || note.disciplina;
            const noteSafe = JSON.stringify(note).replace(/"/g, '&quot;').replace(/'/g, "&#39;");

            const tr = document.createElement('tr');
            // Destaque visual forte se for pra Gestão
            tr.className = `border-b border-slate-700/50 transition-colors ${note.atendimento ? 'bg-red-900/20 hover:bg-red-900/30' : 'hover:bg-slate-800/50'} ${!isSameDisc ? 'opacity-60' : ''}`;
            if(note.atendimento) tr.style.borderLeft = "4px solid #ef4444";

            tr.innerHTML = `
                <td class="p-4 font-bold text-slate-200">${escapeHTML(note.alunoNome || 'Sem nome')}</td>
                <td class="p-4 text-xs text-slate-400">
                    <div class="truncate max-w-[120px]">${note.turma}</div>
                    <div class="${isSameDisc ? 'text-amber-400 font-bold' : 'text-slate-500'} truncate max-w-[120px]">${discName}</div>
                </td>
                <td class="p-4 text-xs text-slate-300 italic cursor-help" title="${escapeHTML(note.conteudo)}">
                    <div class="line-clamp-2 leading-relaxed">${escapeHTML(note.conteudo)}</div>
                </td>
                <td class="p-4 text-center">
                    ${note.atendimento ? '<span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Gestão</span>' : '<span class="text-slate-600">-</span>'}
                </td>
                <td class="p-4 text-center text-xs text-slate-500 font-mono">${dateStr}</td>
                <td class="p-4 text-right">
                    <button onclick='window.profAPI.openAnotacaoModal(${noteSafe})' class="text-blue-400 hover:text-white mr-3 transition-colors p-2" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="window.profAPI.deleteAnotacao('${note.id}')" class="text-red-500 hover:text-red-300 transition-colors p-2" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
            els.anotacoesBody.appendChild(tr);
        });
    },

    openAnotacaoModal: async (noteData = null) => {
        const { school, classId, disciplineId } = state.filters;
        if(!classId || !disciplineId) return alert("Carregue Turma e Disciplina no menu superior primeiro.");

        // Preenche info visual
        els.anotacaoSchool.value = school;
        const discName = state.cache.disciplinesMap.get(disciplineId) || disciplineId;
        els.anotacaoClass.value = `${classId} | ${discName}`;
        els.anotacaoDiscId.value = disciplineId;

        // Popula Select de Alunos do cache
        els.anotacaoAlunoSel.innerHTML = '<option value="">Selecione o Aluno...</option>';
        state.cache.students.forEach(al => els.anotacaoAlunoSel.add(new Option(al.nome, al.id)));

        if(noteData) {
            els.anotacaoTitle.textContent = "Editar Anotação";
            els.anotacaoId.value = noteData.id;
            els.anotacaoAlunoSel.value = noteData.alunoId || ""; 
            if(!els.anotacaoAlunoSel.value && noteData.alunoNome) {
                for(let i=0; i<els.anotacaoAlunoSel.options.length; i++) {
                    if(els.anotacaoAlunoSel.options[i].text === noteData.alunoNome) { els.anotacaoAlunoSel.selectedIndex = i; break; }
                }
            }
            els.anotacaoTexto.value = noteData.conteudo;
            els.anotacaoGestao.checked = noteData.atendimento;
        } else {
            els.anotacaoTitle.textContent = "Nova Anotação";
            els.anotacaoId.value = "";
            els.anotacaoTexto.value = "";
            els.anotacaoGestao.checked = false;
        }

        els.anotacaoModal.classList.remove('hidden');
        els.anotacaoModal.classList.add('flex');
    },

    closeAnotacaoModal: () => {
        els.anotacaoModal.classList.add('hidden');
        els.anotacaoModal.classList.remove('flex');
    },

    saveAnotacao: async () => {
        const id = els.anotacaoId.value;
        const alunoUid = els.anotacaoAlunoSel.value;
        const alunoNome = els.anotacaoAlunoSel.options[els.anotacaoAlunoSel.selectedIndex]?.text;
        const conteudo = els.anotacaoTexto.value.trim();
        const gestao = els.anotacaoGestao.checked;
        
        const { school, classId, disciplineId } = state.filters;

        if(!alunoUid || !conteudo) return alert("Selecione o aluno e digite o conteúdo da anotação.");

        els.btnSaveAnotacao.disabled = true;
        els.btnSaveAnotacao.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';

        try {
            const payload = {
                escola: school, turma: classId, disciplina: disciplineId,
                alunoId: alunoUid, alunoNome,
                conteudo, atendimento: gestao,
                atualizadoEm: serverTimestamp()
            };

            if(id) {
                await updateDoc(doc(db, "anotacoesAlunos", id), payload);
            } else {
                payload.criadoEm = serverTimestamp();
                await addDoc(collection(db, "anotacoesAlunos"), payload);
            }

            window.profAPI.closeAnotacaoModal();
            window.profAPI.loadAnotacoes(); 

        } catch(e) {
            console.error(e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            els.btnSaveAnotacao.disabled = false;
            els.btnSaveAnotacao.innerHTML = 'Salvar Anotação';
        }
    },

    deleteAnotacao: async (id) => {
        if(!confirm("Tem certeza que deseja excluir esta anotação permanentemente?")) return;
        try {
            await deleteDoc(doc(db, "anotacoesAlunos", id));
            window.profAPI.loadAnotacoes();
        } catch(e) { alert("Erro ao excluir: " + e.message); }
    },

    // ==========================================
    // MÓDULO: SISTEMA APOIA (EVASÃO E FREQUÊNCIA)
    // ==========================================
    loadApoiaRegistros: async () => {
        const { classId } = state.filters;
        if(!classId) {
            els.apoiaList.innerHTML = '';
            els.apoiaMsg.textContent = "Selecione uma Turma e Disciplina no topo (Carregar).";
            els.apoiaMsg.classList.remove('hidden');
            return;
        }

        els.apoiaMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Lendo registros oficiais...';
        els.apoiaMsg.classList.remove('hidden');
        els.apoiaList.innerHTML = '';

        try {
            // Busca os dados da turma específica, ordenando do mais recente
            const q = query(collection(db, "apoiaRegistros"), where("turmaId", "==", classId));
            const snap = await getDocs(q);

            apoiaCache = [];
            snap.forEach(d => apoiaCache.push({ id: d.id, ...d.data() }));
            
            // Ordenação local por data
            apoiaCache.sort((a,b) => {
                const tA = a.criadoEm ? a.criadoEm.seconds : 0;
                const tB = b.criadoEm ? b.criadoEm.seconds : 0;
                return tB - tA;
            });

            window.profAPI.renderApoiaList();

        } catch(e) {
            console.error("Erro APOIA:", e);
            els.apoiaMsg.textContent = "Erro ao carregar: " + e.message;
        }
    },

    renderApoiaList: () => {
        els.apoiaList.innerHTML = '';
        if(apoiaCache.length === 0) {
            els.apoiaMsg.textContent = "Nenhum documento APOIA gerado para esta turma.";
            els.apoiaMsg.classList.remove('hidden');
            return;
        }
        els.apoiaMsg.classList.add('hidden');

        apoiaCache.forEach(reg => {
            const dataStr = reg.criadoEm ? reg.criadoEm.toDate().toLocaleDateString('pt-BR') : '-';
            const isCoord = reg.status === 'enviado_coordenacao';
            
            const badgeClass = isCoord ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-slate-700 text-slate-300 border-slate-600';
            const badgeLabel = isCoord ? '<i class="fas fa-building mr-1"></i> COORDENAÇÃO' : '<i class="fas fa-chalkboard-teacher mr-1"></i> PROFESSOR';

            const regSafe = JSON.stringify(reg).replace(/"/g, '&quot;').replace(/'/g, "&#39;");

            els.apoiaList.insertAdjacentHTML('beforeend', `
                <div class="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-slate-800/80 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors gap-4">
                    <div>
                        <div class="font-bold text-slate-200 text-sm mb-1">${escapeHTML(reg.alunoNome)}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                            ${reg.disciplinaNome} <span class="mx-1">|</span> ${reg.trimestre}º Trimestre <span class="mx-1">|</span> ${dataStr}
                        </div>
                    </div>
                    <div class="flex items-center gap-3 w-full md:w-auto">
                        <span class="px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${badgeClass}">${badgeLabel}</span>
                        <div class="flex gap-2 ml-auto">
                            <button onclick='window.profAPI.generateApoiaPdf(${regSafe})' class="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 p-2 rounded-lg transition-colors" title="Gerar Ofício PDF"><i class="fas fa-file-pdf"></i></button>
                            <button onclick='window.profAPI.openApoiaForm(${regSafe})' class="bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-white border border-amber-500/30 p-2 rounded-lg transition-colors" title="Editar / Ver"><i class="fas fa-edit"></i></button>
                            <button onclick="window.profAPI.deleteApoia('${reg.id}')" class="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 p-2 rounded-lg transition-colors" title="Excluir"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `);
        });
    },

    openApoiaForm: (data = null) => {
        const { school, classId, disciplineId, quarter } = state.filters;
        if(!classId || !disciplineId) return alert("Carregue a Turma e Disciplina no menu superior primeiro.");

        // Readonly Fixos
        els.apoiaEscola.value = school;
        els.apoiaTurma.value = document.getElementById('prof-filter-class').options[document.getElementById('prof-filter-class').selectedIndex]?.text || classId;
        els.apoiaDisc.value = state.cache.disciplinesMap.get(disciplineId) || disciplineId;

        // Popula Select
        els.apoiaAlunoSel.innerHTML = '<option value="">Selecione o Aluno...</option>';
        state.cache.students.forEach(al => els.apoiaAlunoSel.add(new Option(al.nome, al.id)));

        // Mostra área da gestão apenas se for o Admin Principal
        if(auth.currentUser.email === 'kazenski.developer@gmail.com') {
            els.apoiaIntervencoes.classList.remove('hidden');
        } else {
            els.apoiaIntervencoes.classList.add('hidden');
        }

        if(data) {
            els.apoiaTitle.innerHTML = '<i class="fas fa-file-signature mr-2"></i> Editar Registro APOIA';
            els.apoiaId.value = data.id;
            els.apoiaAlunoSel.value = data.alunoId;
            els.apoiaTrimestre.value = data.trimestre;
            els.apoiaStatus.value = data.status;
            els.apoiaTexto.value = data.textoExplicativo;
            
            els.intAvisoData.value = data.intervencaoAviso?.data || '';
            els.intAvisoObs.value = data.intervencaoAviso?.anotacoes || '';
            els.intConselhoData.value = data.intervencaoConselho?.data || '';
            els.intConselhoObs.value = data.intervencaoConselho?.anotacoes || '';
        } else {
            els.apoiaTitle.innerHTML = '<i class="fas fa-file-signature mr-2"></i> Novo Registro APOIA';
            els.apoiaId.value = "";
            els.apoiaTexto.value = "";
            els.apoiaStatus.value = "registro_professor";
            els.apoiaTrimestre.value = quarter || "1"; 
            
            els.intAvisoData.value = ''; els.intAvisoObs.value = '';
            els.intConselhoData.value = ''; els.intConselhoObs.value = '';
        }

        els.apoiaModal.classList.remove('hidden');
        els.apoiaModal.classList.add('flex');
    },

    closeApoiaForm: () => {
        els.apoiaModal.classList.add('hidden');
        els.apoiaModal.classList.remove('flex');
    },

    saveApoia: async () => {
        const id = els.apoiaId.value;
        const alunoId = els.apoiaAlunoSel.value;
        const alunoNome = els.apoiaAlunoSel.options[els.apoiaAlunoSel.selectedIndex]?.text;
        
        if(!alunoId) return alert("Selecione o aluno envolvido.");

        const { school, classId, disciplineId } = state.filters;
        
        els.btnSaveApoia.disabled = true;
        els.btnSaveApoia.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Registrando...';

        const payload = {
            escolaId: school, escolaNome: school,
            turmaId: classId, turmaNome: els.apoiaTurma.value,
            disciplinaId: disciplineId, disciplinaNome: els.apoiaDisc.value,
            alunoId, alunoNome,
            trimestre: els.apoiaTrimestre.value,
            status: els.apoiaStatus.value,
            textoExplicativo: els.apoiaTexto.value,
            criadoPorNome: "Professor(a)", 
            atualizadoEm: serverTimestamp()
        };

        // Salva Intervenções se Admin (área visível)
        if(!els.apoiaIntervencoes.classList.contains('hidden')) {
            payload.intervencaoAviso = { data: els.intAvisoData.value, anotacoes: els.intAvisoObs.value };
            payload.intervencaoConselho = { data: els.intConselhoData.value, anotacoes: els.intConselhoObs.value };
        }

        try {
            if(id) { await updateDoc(doc(db, "apoiaRegistros", id), payload); } 
            else {
                payload.criadoEm = serverTimestamp();
                await addDoc(collection(db, "apoiaRegistros"), payload);
            }
            
            window.profAPI.closeApoiaForm();
            window.profAPI.loadApoiaRegistros();
            alert("Documento oficializado com sucesso!");
        } catch(e) {
            console.error(e);
            alert("Erro ao salvar APOIA: " + e.message);
        } finally {
            els.btnSaveApoia.disabled = false;
            els.btnSaveApoia.innerHTML = 'Oficializar Registro';
        }
    },

    deleteApoia: async (id) => {
        if(!confirm("Atenção: Você tem certeza que deseja EXCLUIR este documento oficial APOIA?")) return;
        try { await deleteDoc(doc(db, "apoiaRegistros", id)); window.profAPI.loadApoiaRegistros(); }
        catch(e) { alert("Erro ao excluir: " + e.message); }
    },

    analyzeApoiaFreq: async () => {
        const { classId, disciplineId } = state.filters;
        if(!classId || !disciplineId) return alert("Selecione Turma e Disciplina no topo.");
        
        els.apoiaFreqBody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-red-400"><i class="fas fa-spinner fa-spin mr-2"></i> Varrendo diários...</td></tr>';
        els.apoiaFreqBox.classList.remove('hidden');

        try {
            // --- LÓGICA DE RESET DO APOIA ---
            // 1. Busca os Registros APOIA já existentes para saber quando "resetar" a contagem
            const apoiaQ = query(collection(db, "apoiaRegistros"), where("turmaId", "==", classId), where("disciplinaId", "==", disciplineId));
            const apoiaSnap = await getDocs(apoiaQ);
            const lastApoiaPerStudent = {};
            
            apoiaSnap.forEach(doc => {
                const data = doc.data();
                const timestamp = data.criadoEm ? data.criadoEm.toMillis() : 0;
                // Guarda apenas a data do APOIA mais recente do aluno
                if (!lastApoiaPerStudent[data.alunoId] || timestamp > lastApoiaPerStudent[data.alunoId]) {
                    lastApoiaPerStudent[data.alunoId] = timestamp;
                }
            });

            // 2. Busca Presenças
            const q = query(collection(db, "presencas"), where("turma", "==", classId), orderBy("data_aula_timestamp", "asc"));
            const snap = await getDocs(q);
            
            const faltasAluno = {}; 
            
            snap.forEach(doc => {
                const data = doc.data();
                const dId = data.disciplineId || data.disciplinaId;
                if(dId !== disciplineId) return; // Garante a disciplina certa
                
                const aulaTime = data.data_aula_timestamp ? data.data_aula_timestamp.toMillis() : 0;
                const regs = data.registros || {};
                
                // Reseta a contagem de consecutivas se o aluno veio na aula
                for(const uid in faltasAluno) { 
                    let s = regs[uid];
                    if(s === 'falta') s = 'ausente';
                    if(s !== 'ausente') faltasAluno[uid].consecutivas = 0; 
                }

                for(const [uid, status] of Object.entries(regs)) {
                    let s = status;
                    if(s === 'falta') s = 'ausente';

                    // Se a aula ocorreu ANTES ou NO MESMO DIA do último APOIA, ignora! (Reset)
                    if (lastApoiaPerStudent[uid] && aulaTime <= lastApoiaPerStudent[uid]) {
                        continue; 
                    }

                    if(!faltasAluno[uid]) faltasAluno[uid] = { total: 0, consecutivas: 0, maxConsecutivas: 0 };
                    
                    if(s === 'ausente') {
                        faltasAluno[uid].total++;
                        faltasAluno[uid].consecutivas++;
                        if(faltasAluno[uid].consecutivas > faltasAluno[uid].maxConsecutivas) {
                            faltasAluno[uid].maxConsecutivas = faltasAluno[uid].consecutivas;
                        }
                    }
                }
            });

            els.apoiaFreqBody.innerHTML = '';
            let count = 0;
            
            for(const [uid, dados] of Object.entries(faltasAluno)) {
                // A Regra de Ouro do APOIA (7 faltas totais ou 5 consecutivas)
                if(dados.total >= 7 || dados.maxConsecutivas >= 5) {
                    
                    let name = "Aluno Desconhecido";
                    const cached = state.cache.students.find(s => s.id === uid);
                    if (cached) name = cached.nome;
                    else {
                        try {
                            const uSnap = await getDoc(doc(db, "users", uid));
                            if(uSnap.exists()) name = uSnap.data().nome;
                        } catch(e) {}
                    }

                    let sit = [];
                    if(dados.total >= 7) sit.push("7+ Faltas (Total)");
                    if(dados.maxConsecutivas >= 5) sit.push("5+ Seguidas (Evasão)");
                    
                    els.apoiaFreqBody.insertAdjacentHTML('beforeend', `
                        <tr class="bg-red-950/30 hover:bg-red-900/50 transition-colors">
                            <td class="p-4 font-bold text-slate-200">${escapeHTML(name)}</td>
                            <td class="p-4 text-center font-black text-red-500 text-lg">${dados.total}</td>
                            <td class="p-4 text-center"><span class="bg-red-600 text-white px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">${sit.join(" | ")}</span></td>
                        </tr>
                    `);
                    count++;
                }
            }
            if(count === 0) els.apoiaFreqBody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-green-500 font-bold"><i class="fas fa-check-circle mr-2"></i> Nenhum aluno atingiu o limite crítico (7 faltas) nesta disciplina.</td></tr>';

        } catch(e) {
            console.error(e);
            els.apoiaFreqBody.innerHTML = `<tr><td colspan="3" class="text-center p-6 text-red-500 font-bold">Erro na varredura: ${e.message}</td></tr>`;
        }
    },

    generateApoiaPdf: async (data) => {
        const area = els.pdfRenderArea;
        
        // Constrói o layout formal do ofício no elemento invisível
        area.innerHTML = `
            <div style="padding: 30px; font-family: 'Times New Roman', serif; color: #000; background: #fff;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px;">
                    <h1 style="font-size: 24px; margin: 0;">SISTEMA APOIA</h1>
                    <p style="font-size: 14px; margin: 5px 0 0 0;">Programa de Combate à Evasão Escolar</p>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
                    <tr>
                        <td style="border: 1px solid #000; padding: 10px; width: 50%;"><b>Aluno(a):</b> ${data.alunoNome}</td>
                        <td style="border: 1px solid #000; padding: 10px; width: 50%;"><b>Turma:</b> ${data.turmaNome}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #000; padding: 10px;"><b>Disciplina:</b> ${data.disciplinaNome}</td>
                        <td style="border: 1px solid #000; padding: 10px;"><b>Data da Emissão:</b> ${new Date().toLocaleDateString('pt-BR')}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #000; padding: 10px;"><b>Escola:</b> ${data.escolaNome}</td>
                        <td style="border: 1px solid #000; padding: 10px;"><b>Trimestre de Ref.:</b> ${data.trimestre}º</td>
                    </tr>
                </table>
                
                <h3 style="font-size: 16px; margin-bottom: 10px; text-transform: uppercase;">1. Parecer Descritivo do Docente / Motivo do Acionamento:</h3>
                <div style="border: 1px solid #000; padding: 15px; min-height: 250px; font-size: 14px; line-height: 1.6; text-align: justify; margin-bottom: 30px;">
                    ${data.textoExplicativo.replace(/\n/g, '<br>')}
                </div>
                
                ${data.intervencaoAviso?.data ? `
                <h3 style="font-size: 16px; margin-bottom: 10px; text-transform: uppercase;">2. Registro de Intervenção (Contato com Responsáveis):</h3>
                <div style="border: 1px solid #000; padding: 15px; font-size: 14px; margin-bottom: 30px;">
                    <b>Data do Contato:</b> ${data.intervencaoAviso.data}<br><br>
                    <b>Anotações Oficiais:</b> ${data.intervencaoAviso.anotacoes}
                </div>` : ''}

                <div style="margin-top: 80px; display: flex; justify-content: space-between; text-align: center;">
                    <div style="width: 45%;">
                        <hr style="border: none; border-top: 1px solid #000; margin-bottom: 10px;">
                        <span style="font-size: 14px;">Assinatura do Educador/Coordenação</span>
                    </div>
                    <div style="width: 45%;">
                        <hr style="border: none; border-top: 1px solid #000; margin-bottom: 10px;">
                        <span style="font-size: 14px;">Assinatura do Responsável Legal</span>
                    </div>
                </div>
            </div>
        `;
        
        try {
            // Requer as bibliotecas jsPDF e html2canvas
            const canvas = await html2canvas(area, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Documento_APOIA_${data.alunoNome.replace(/\s+/g, '_')}.pdf`);
            
        } catch(e) {
            console.error(e);
            alert("Erro ao gerar o Ofício PDF: " + e.message);
        }
    },

    // ==========================================
    // MÓDULO: SORTEIOS E GRUPOS
    // ==========================================
    initSorteiosTab: () => {
        const count = state.cache.students.length;
        els.sorteiosCount.textContent = count;
        
        const hasStudents = count > 0;
        els.btnSpinIndiv.disabled = !hasStudents;
        els.btnSpinGrupos.disabled = count < 2;

        if (!hasStudents) {
            els.rouletteDisplay.innerHTML = '<span class="text-2xl opacity-50 text-red-400">Sem Alunos. Carregue a turma.</span>';
        } else if (els.rouletteDisplay.classList.contains('roulette-winner')) {
            // Se já tiver rolado sorteio antes, reseta a tela
            els.rouletteDisplay.innerHTML = '<span class="text-2xl opacity-50">Pronto para sortear</span>';
            els.rouletteDisplay.classList.remove('roulette-winner');
        }
    },

    toggleSorteioMode: (mode) => {
        // Estilização dos botões Toggle
        if (mode === 'indiv') {
            els.btnToggleIndiv.className = "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all bg-amber-600 text-white shadow-lg";
            els.btnToggleGrupos.className = "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all text-slate-400 hover:text-white";
            
            els.viewSorteioGrupos.classList.replace('flex', 'hidden');
            els.viewSorteioIndiv.classList.replace('hidden', 'flex');
        } else {
            els.btnToggleGrupos.className = "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all bg-amber-600 text-white shadow-lg";
            els.btnToggleIndiv.className = "px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all text-slate-400 hover:text-white";
            
            els.viewSorteioIndiv.classList.replace('flex', 'hidden');
            els.viewSorteioGrupos.classList.replace('hidden', 'flex');
        }
    },

    spinIndividual: () => {
        const students = state.cache.students;
        if (students.length === 0) return;

        els.btnSpinIndiv.disabled = true;
        els.rouletteDisplay.classList.remove('roulette-winner');
        
        let duration = 3000; // 3 segundos de animação
        let intervalTime = 50;
        let elapsed = 0;
        
        const interval = setInterval(() => {
            // Sorteia um nome rapidamente para a animação
            const randomIdx = Math.floor(Math.random() * students.length);
            els.rouletteDisplay.textContent = students[randomIdx].nome;
            
            elapsed += intervalTime;
            
            // Desaceleração: Se passou de 70% do tempo, vai freando
            if (elapsed > duration * 0.7) intervalTime += 20;

            if (elapsed >= duration) {
                clearInterval(interval);
                
                // Escolhe o Vencedor Final
                const winnerIdx = Math.floor(Math.random() * students.length);
                const winner = students[winnerIdx];
                
                els.rouletteDisplay.textContent = winner.nome;
                els.rouletteDisplay.classList.add('roulette-winner');
                els.btnSpinIndiv.disabled = false;
                
                // Efeito de Confete!
                if (window.confetti) {
                    window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#f59e0b', '#ffffff', '#3b82f6'] });
                }
            }
        }, intervalTime);
    },

    spinGrupos: () => {
        const students = [...state.cache.students]; // Copia o array para não estragar o original
        const size = parseInt(els.groupSizeInput.value);
        
        if (students.length === 0) return;
        if (size < 2 || size > students.length) return alert("Tamanho de equipe inválido.");

        // Algoritmo de Embaralhamento (Fisher-Yates Shuffle)
        for (let i = students.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [students[i], students[j]] = [students[j], students[i]];
        }

        // Fatiar a lista em pedaços do tamanho desejado
        sortedGroupsCache = [];
        while(students.length > 0) {
            sortedGroupsCache.push(students.splice(0, size));
        }

        window.profAPI.renderGroups();
        
        // Efeito de Confete!
        if (window.confetti) window.confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#f59e0b', '#3b82f6'] });
    },

    renderGroups: () => {
        els.groupsDisplay.innerHTML = '';
        
        sortedGroupsCache.forEach((group, idx) => {
            const card = document.createElement('div');
            card.className = 'group-card animate-fade-in';
            
            let listHtml = '';
            group.forEach(st => {
                listHtml += `<li class="py-1.5 border-b border-slate-700/50 text-slate-300 text-sm font-medium flex items-center gap-2 last:border-0"><i class="fas fa-user text-amber-500 text-[10px]"></i> ${escapeHTML(st.nome)}</li>`;
            });

            card.innerHTML = `
                <div class="font-cinzel text-lg font-bold text-white mb-3 border-b border-slate-700 pb-2">Equipe ${idx + 1}</div>
                <ul class="list-none p-0 m-0">${listHtml}</ul>
            `;
            els.groupsDisplay.appendChild(card);
        });

        els.btnExportTxt.classList.remove('hidden');
    },

    exportGroupsTxt: () => {
        if (sortedGroupsCache.length === 0) return;
        
        const { school, classId } = state.filters;
        let content = `ESCOLA: ${school}\nTURMA: ${classId}\nDATA: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
        content += "=== EQUIPES SORTEADAS ===\n\n";

        sortedGroupsCache.forEach((group, idx) => {
            content += `[ EQUIPE ${idx + 1} ]\n`;
            group.forEach(st => content += `- ${st.nome}\n`);
            content += "\n";
        });

        // Cria o arquivo de texto na memória do navegador e força o download
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Equipes_${classId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    // ==========================================
    // MÓDULO: CADASTRO MASSIVO DE ALUNOS
    // ==========================================
    
    // Helper visual para o log
    logCadastro: (msg, type) => {
        const div = document.createElement('div');
        if (type === 'error') div.className = 'text-red-500 font-bold';
        else if (type === 'success') div.className = 'text-green-400';
        else if (type === 'warning') div.className = 'text-amber-400';
        else div.className = 'text-blue-400';
        
        div.innerHTML = `<span class="text-slate-600 mr-2">[${new Date().toLocaleTimeString()}]</span> > ${msg}`;
        els.cadastroLog.appendChild(div);
        els.cadastroLog.scrollTop = els.cadastroLog.scrollHeight;
    },

    // Função interna que chama a API REST do Firebase (Cria conta sem deslogar o admin)
    createUserRest: async (email, password) => {
        // Puxando a chave de forma limpa direto da configuração central do app!
        const apiKey = app.options.apiKey; 
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password, returnSecureToken: true })
        });
        const data = await response.json();
        if (!response.ok) {
            if (data.error.message === "EMAIL_EXISTS") throw new Error("EMAIL_EXISTS");
            if (data.error.message.includes("WEAK_PASSWORD")) throw new Error("Senha muito fraca (Mín 6 carac.)");
            throw new Error(data.error.message || "Erro na API de Auth");
        }
        return data.localId; // Retorna o UID do novo usuário
    },

    processarCadastro: async () => {
        const texto = els.cadastroInput.value.trim();
        const { school, classId, disciplineId } = state.filters;

        if (!texto) return alert("Insira a lista de alunos (Nome, Email, Senha).");
        if (!school || !classId || !disciplineId) return alert("ATENÇÃO: Selecione Escola, Turma e Disciplina no menu superior primeiro!");

        const linhas = texto.split('\n').filter(l => l.trim().length > 0);
        if (!confirm(`Você está prestes a processar ${linhas.length} alunos.\nTurma destino: ${classId}\nDisciplina: ${disciplineId}\n\nDeseja continuar?`)) return;

        // UI Updates
        els.btnProcessarCadastro.disabled = true;
        els.btnProcessarCadastro.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Processando...';
        els.cadastroLog.innerHTML = '';
        els.logPing.classList.remove('hidden');
        els.logStatusDot.classList.replace('bg-slate-600', 'bg-green-500');
        els.btnPdfCadastro.classList.add('hidden');
        
        cadastroSucessos = [];
        window.profAPI.logCadastro(`Iniciando lote na turma ${classId}...`, 'info');

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i].trim();
            const partes = linha.split(',');
            
            if (partes.length < 3) {
                window.profAPI.logCadastro(`Linha ${i+1}: Formato inválido. Use Nome, Email, Senha`, 'error');
                continue;
            }

            const nomeCompleto = partes[0].trim().toUpperCase();
            const email = partes[1].trim().toLowerCase();
            const senha = partes[2].trim();

            if (senha.length < 6) {
                window.profAPI.logCadastro(`Linha ${i+1} (${email}): Senha muito curta`, 'error');
                continue;
            }

            try {
                let uid;
                let isNewUser = false;

                // 1. Tenta criar usuário no Firebase Auth
                try {
                    uid = await window.profAPI.createUserRest(email, senha);
                    isNewUser = true;
                } catch (errAuth) {
                    if (errAuth.message === "EMAIL_EXISTS") {
                        // Se já existe, procura o UID dele no banco
                        const qUser = query(collection(db, "users"), where("email", "==", email));
                        const snapUser = await getDocs(qUser);
                        if (snapUser.empty) throw new Error("Email existe no Auth mas não no Banco de Dados.");
                        
                        uid = snapUser.docs[0].id;
                        isNewUser = false;
                    } else {
                        throw errAuth;
                    }
                }

                // 2. Salva/Atualiza o perfil no Firestore
                if (isNewUser) {
                    await setDoc(doc(db, "users", uid), {
                        nome: nomeCompleto, email: email,
                        escola: school, turma: classId,
                        Aluno: true, Professor: false, Admin: false, Coordenacao: false, Moderador: false, Visitante: false,
                        role: "aluno", registroAtivo: true,
                        createdAt: serverTimestamp(),
                        disciplinas: { [disciplineId]: true }
                    });
                    window.profAPI.logCadastro(`[OK] ${nomeCompleto} -> CONTA CRIADA`, 'success');
                } else {
                    await updateDoc(doc(db, "users", uid), {
                        nome: nomeCompleto, turma: classId, escola: school, registroAtivo: true,
                        [`disciplinas.${disciplineId}`]: true
                    });
                    window.profAPI.logCadastro(`[OK] ${nomeCompleto} -> ATUALIZADO (Vínculo Adicionado)`, 'warning');
                }

                // 3. Garante a criação da Pauta de Notas
                await setDoc(doc(db, "notas", uid), {
                    userId: uid, nomeAluno: nomeCompleto, escola: school,
                    disciplinasComNotas: {
                        [disciplineId]: {
                            "1": { nota1: null, nota2: null, nota3: null, nota4: null },
                            "2": { nota1: null, nota2: null, nota3: null, nota4: null },
                            "3": { nota1: null, nota2: null, nota3: null, nota4: null }
                        }
                    },
                    lastUpdatedAt: serverTimestamp()
                }, { merge: true });

                cadastroSucessos.push({ email, senha, nome: nomeCompleto, status: isNewUser ? 'NOVO' : 'VINCULADO' });

            } catch (e) {
                window.profAPI.logCadastro(`[ERRO] Linha ${i+1} (${email}): ${e.message}`, 'error');
            }
            
            // Pausa minúscula para não travar o navegador e respeitar limite da API
            await new Promise(r => setTimeout(r, 150)); 
        }

        // FIM DO PROCESSO
        window.profAPI.logCadastro(`--- PROCESSO CONCLUÍDO ---`, 'info');
        window.profAPI.logCadastro(`Sucessos: ${cadastroSucessos.length} de ${linhas.length}`, 'success');
        
        els.btnProcessarCadastro.disabled = false;
        els.btnProcessarCadastro.innerHTML = '<i class="fas fa-cogs mr-2"></i> Processar Cadastros';
        els.logPing.classList.add('hidden');
        els.logStatusDot.classList.replace('bg-green-500', 'bg-slate-600');

        if (cadastroSucessos.length > 0) {
            els.btnPdfCadastro.classList.remove('hidden');
            // Opcional: Salvar log de auditoria no Firebase
            try {
                await addDoc(collection(db, "cadastrosAlunosOficial"), {
                    data: serverTimestamp(),
                    admin: auth.currentUser.email,
                    escola: school, turmaId: classId, disciplinaAdicionada: disciplineId,
                    totalProcessados: cadastroSucessos.length,
                    detalhes: cadastroSucessos.map(s => ({ email: s.email, status: s.status }))
                });
            } catch(e) { console.error("Erro ao salvar auditoria:", e); }
        }
    },

    gerarPdfCadastro: () => {
        if (cadastroSucessos.length === 0) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const { school, classId } = state.filters;
        
        doc.setFontSize(16);
        doc.text("Relatório Oficial: Criação de Contas", 14, 20);
        doc.setFontSize(10);
        doc.text(`Escola: ${school} | Turma: ${classId} | Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
        
        const rows = cadastroSucessos.map(s => [s.nome, s.email, s.senha, s.status]);
        
        doc.autoTable({
            startY: 40,
            head: [['Nome (Provisório)', 'E-mail de Acesso', 'Senha Inicial', 'Ação no Banco']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }, // Verde sucesso
            styles: { fontSize: 9 }
        });
        
        doc.save(`Contas_Turma_${classId}.pdf`);
    },

    // ==========================================
    // MÓDULO: VINCULAR ALUNOS EXISTENTES
    // ==========================================
    loadRecadastroData: async () => {
        els.reList.innerHTML = '<div class="text-center p-10"><i class="fas fa-circle-notch fa-spin text-amber-500 text-3xl mb-4 block"></i><span class="text-slate-400 font-bold uppercase tracking-widest text-xs">Lendo Base Global de Alunos...</span></div>';
        
        try {
            // Busca apenas usuários marcados como Aluno na base
            const q = query(collection(db, "users"), where("Aluno", "==", true));
            const snap = await getDocs(q);
            
            recadastroCache = [];
            snap.forEach(d => {
                const u = d.data();
                recadastroCache.push({
                    id: d.id,
                    nome: (u.nome || "SEM NOME").toUpperCase(),
                    email: u.email || "Sem e-mail",
                    turmaAtual: u.turma || "NENHUMA"
                });
            });
            
            // Ordena alfabeticamente
            recadastroCache.sort((a, b) => a.nome.localeCompare(b.nome));
            window.profAPI.renderRecadastroList();
            
        } catch(e) { 
            els.reList.innerHTML = `<div class="text-red-500 font-bold p-4 text-center">Erro: ${e.message}</div>`; 
        }
    },

    renderRecadastroList: () => {
        const searchVal = els.reSearch.value.toLowerCase();
        els.reList.innerHTML = '';
        
        const filtered = recadastroCache.filter(u => u.nome.toLowerCase().includes(searchVal) || u.email.toLowerCase().includes(searchVal));
        
        if (filtered.length === 0) {
            els.reList.innerHTML = '<div class="text-center text-slate-500 italic p-10">Nenhum aluno encontrado com este termo.</div>';
            return;
        }

        filtered.forEach(u => {
            const active = recadastroSelected.has(u.id);
            const div = document.createElement('div');
            
            // Estilo altera se selecionado
            div.className = `flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${active ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'}`;
            
            div.onclick = () => {
                if(active) recadastroSelected.delete(u.id); 
                else recadastroSelected.add(u.id);
                
                window.profAPI.renderRecadastroList();
                els.reCount.textContent = recadastroSelected.size;
            };
            
            div.innerHTML = `
                <div>
                    <div class="text-sm font-bold ${active ? 'text-amber-400' : 'text-slate-200'}">${escapeHTML(u.nome)}</div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-widest mt-1">${escapeHTML(u.email)} <span class="mx-2">|</span> Turma Atual: <span class="${u.turmaAtual !== 'NENHUMA' ? 'text-blue-400' : 'text-slate-500'}">${escapeHTML(u.turmaAtual)}</span></div>
                </div>
                <div class="shrink-0 ml-4">
                    <i class="fas ${active ? 'fa-check-square text-amber-500 text-xl' : 'fa-square text-slate-600 text-xl'}"></i>
                </div>
            `;
            els.reList.appendChild(div);
        });
    },

    executarVinculoMassa: async () => {
        const { school, classId, disciplineId } = state.filters;
        
        if (!school || !classId || !disciplineId) return alert("ATENÇÃO: Selecione Escola, Turma e Disciplina no menu superior primeiro!");
        if (recadastroSelected.size === 0) return alert("Selecione pelo menos um aluno na lista.");
        
        if (!confirm(`Confirmar vínculo de ${recadastroSelected.size} alunos à turma ${classId} (${disciplineId})?`)) return;

        els.reLog.innerHTML = '<div class="text-blue-400 font-bold mb-2">Iniciando Vínculos...</div>';
        
        let sucessos = 0;

        try {
            for(let uid of recadastroSelected) {
                const u = recadastroCache.find(x => x.id === uid);
                
                // 1. Atualiza documento Users (Adiciona Turma, Escola e a nova Disciplina no map)
                await updateDoc(doc(db, "users", uid), { 
                    escola: school, 
                    turma: classId, 
                    [`disciplinas.${disciplineId}`]: true, 
                    registroAtivo: true 
                });
                
                // 2. Garante Pauta de Notas (Cria a estrutura N1 a N4 para o trimestre, sem apagar as outras matérias usando merge)
                await setDoc(doc(db, "notas", uid), { 
                    userId: uid, 
                    nomeAluno: u.nome, 
                    escola: school, 
                    disciplinasComNotas: { 
                        [disciplineId]: { 
                            "1": { nota1: null, nota2: null, nota3: null, nota4: null }, 
                            "2": { nota1: null, nota2: null, nota3: null, nota4: null }, 
                            "3": { nota1: null, nota2: null, nota3: null, nota4: null } 
                        } 
                    },
                    lastUpdatedAt: serverTimestamp()
                }, { merge: true });
                
                els.reLog.insertAdjacentHTML('beforeend', `<div class="text-green-400">> ${u.nome}: VINCULADO COM SUCESSO</div>`);
                els.reLog.scrollTop = els.reLog.scrollHeight;
                sucessos++;
            }
            
            els.reLog.insertAdjacentHTML('beforeend', `<div class="text-amber-400 font-bold mt-2">--- FINALIZADO: ${sucessos} VÍNCULOS ---</div>`);
            els.reLog.scrollTop = els.reLog.scrollHeight;
            
            alert(`Processo concluído com sucesso! ${sucessos} alunos vinculados.`);
            
            // Esvaziar seleção ou manter para o professor vincular em outra disciplina
            // recadastroSelected.clear();
            els.reCount.textContent = '0';
            window.profAPI.renderRecadastroList();
            
        } catch(e) { 
            alert("Erro no processo: " + e.message); 
            els.reLog.insertAdjacentHTML('beforeend', `<div class="text-red-500 font-bold mt-2">> ERRO FATAL: ${e.message}</div>`);
        }
    },

    // ==========================================
    // MÓDULO: ANÁLISE DE DADOS (DASHBOARD INDIVIDUAL)
    // ==========================================
    populateAnaliseStudentSelect: () => {
        const list = state.cache.students;
        els.analiseStudentSel.innerHTML = '<option value="">Selecione um aluno...</option>';
        
        if (list.length > 0) {
            list.forEach(s => els.analiseStudentSel.add(new Option(s.nome, s.id)));
            els.analiseMsg.textContent = "Selecione um aluno acima para visualizar a análise completa.";
        } else {
            els.analiseMsg.textContent = "Carregue a turma no menu superior primeiro.";
        }
    },

    loadAnaliseDashboard: async (uid) => {
        if(!uid) {
            els.analiseDashboard.classList.add('hidden');
            els.analiseMsg.classList.remove('hidden');
            return;
        }

        els.analiseMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2 text-amber-500"></i> Carregando dossiê do aluno...';
        els.analiseDashboard.classList.add('hidden');
        els.analiseMsg.classList.remove('hidden');

        try {
            const notasSnap = await getDoc(doc(db, "notas", uid));
            const notasData = notasSnap.exists() ? notasSnap.data().disciplinasComNotas || {} : {};

            // 2. Busca Presenças com Sincronização Total (Mesma lógica da Visão Geral)
            const { classId, disciplineId } = state.filters;
            
            // Removemos o orderBy para evitar falhas de Index do Firebase e filtramos no JS
            const presSnap = await getDocs(query(
                collection(db, "presencas"), 
                where("turma", "==", classId)
            ));
            
            const presencasData = [];
            presSnap.forEach(d => {
                const data = d.data();
                // Normalização: Lê tanto 'disciplineId' quanto 'disciplinaId'
                const dId = data.disciplineId || data.disciplinaId;
                
                // Se houver disciplina selecionada no filtro master, aplica o filtro rigoroso
                if (disciplineId && dId !== disciplineId) return;

                const rawStatus = data.registros ? data.registros[uid] : null;
                
                if(rawStatus) {
                    let status = rawStatus;
                    if(status === 'falta') status = 'ausente';
                    if(status === 'justificada' || String(status).startsWith('justi')) status = 'justificado';

                    // Conversão de data ultra-segura
                    let dateObj = new Date();
                    if (data.data_aula_timestamp) {
                        dateObj = typeof data.data_aula_timestamp.toDate === 'function' 
                            ? data.data_aula_timestamp.toDate() 
                            : new Date(data.data_aula_timestamp);
                    }

                    presencasData.push({
                        date: dateObj,
                        disciplineId: dId,
                        status: status
                    });
                }
            });

            // Ordenação cronológica manual
            presencasData.sort((a, b) => a.date - b.date);

            currentStudentAnalysisData = { notas: notasData, presencas: presencasData, uid: uid };
            
            window.profAPI.renderDashboardCharts();
            
            els.analiseMsg.classList.add('hidden');
            els.analiseDashboard.classList.remove('hidden');
            els.analiseDashboard.classList.add('flex');

        } catch(e) {
            console.error(e);
            els.analiseMsg.textContent = "Erro ao carregar dados: " + e.message;
        }
    },

    renderDashboardCharts: () => {
        const { notas, presencas } = currentStudentAnalysisData;

        // --- KPI: Faltas Consecutivas ---
        let maxConsecutive = 0, currentConsecutive = 0;
        presencas.sort((a,b) => a.date - b.date);
        
        presencas.forEach(p => {
            if(p.status === 'ausente') currentConsecutive++;
            else currentConsecutive = 0; 
            if(currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
        });
        els.kpiConsecutive.textContent = maxConsecutive;

        // --- KPI: Min/Max Notas ---
        let allGrades = [];
        Object.values(notas).forEach(disc => {
            Object.values(disc).forEach(trim => {
                if(trim.nota1) allGrades.push(parseFloat(trim.nota1));
                if(trim.nota2) allGrades.push(parseFloat(trim.nota2));
                if(trim.nota3) allGrades.push(parseFloat(trim.nota3));
                if(trim.nota4) allGrades.push(parseFloat(trim.nota4));
            });
        });
        if(allGrades.length > 0) {
            els.kpiMinGrade.textContent = Math.min(...allGrades).toFixed(1);
            els.kpiMaxGrade.textContent = Math.max(...allGrades).toFixed(1);
        } else {
            els.kpiMinGrade.textContent = "-"; els.kpiMaxGrade.textContent = "-";
        }

        // --- GRÁFICO: Média por Disciplina (Barra) ---
        const labelsBar = [];
        const dataBar = [];
        Object.entries(notas).forEach(([discId, trimestres]) => {
            let sum = 0, count = 0;
            Object.values(trimestres).forEach(t => {
                ['nota1','nota2','nota3','nota4'].forEach(k => {
                    if(t[k] && !isNaN(parseFloat(t[k]))) { sum += parseFloat(t[k]); count++; }
                });
            });
            if(count > 0) {
                const name = state.cache.disciplinesMap.get(discId) || discId;
                labelsBar.push(name.substring(0, 15) + (name.length > 15 ? '...' : '')); 
                dataBar.push((sum/count).toFixed(2));
            }
        });
        window.profAPI.renderGenericChart('grades', 'bar', labelsBar, dataBar, 'Média Global', '#f59e0b');

        // --- GRÁFICO: Presença (Doughnut) ---
        let p=0, f=0, j=0;
        presencas.forEach(x => {
            if(x.status === 'presente') p++;
            else if(x.status === 'ausente') f++;
            else if(x.status === 'justificado') j++;
        });
        window.profAPI.renderGenericChart('presence', 'doughnut', ['Presente', 'Falta', 'Justificado'], [p, f, j], 'Frequência', ['#4ade80', '#ef4444', '#f59e0b']);

        // --- GRÁFICO: Evolução (Prepara Select) ---
        // --- GRÁFICO: Evolução (Prepara Select) ---
        els.selEvolutionDisc.innerHTML = '<option value="">Selecione a Disciplina...</option>';
        
        // Listar apenas disciplinas que o aluno realmente tem vínculo ou nota lançada
        const studentObj = state.cache.students.find(s => s.id === currentStudentAnalysisData.uid);
        const studentDisciplines = studentObj?.disciplinas || {}; 
        
        Object.keys(notas).forEach(discId => {
            const hasData = Object.values(notas[discId] || {}).some(t => t.nota1 || t.nota2 || t.nota3 || t.nota4);
            if (studentDisciplines[discId] || hasData) {
                const name = state.cache.disciplinesMap.get(discId) || discId;
                els.selEvolutionDisc.add(new Option(name, discId));
            }
        });

        if(chartInstances['evolution']) chartInstances['evolution'].destroy();
        els.msgEvolution.classList.remove('hidden');

        // --- ANÁLISE PREDITIVA (Avisos de IA) ---
        window.profAPI.runPredictiveAnalysis();

        // Cria uma lista visual com os dias exatos das faltas formatada como [F] e [J]
        // --- RELATÓRIO ANALÍTICO DE FALTAS EM FORMATO TABELA (MATRIZ INDIVIDUAL) ---
        // Replica a clareza da exportação PDF diretamente na interface
        let tableHTML = `
            <div class="mt-8 bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl flex-shrink-0 mb-10">
                <div class="p-5 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
                    <h4 class="text-white font-black uppercase tracking-tighter flex items-center gap-2">
                        <i class="fas fa-table text-amber-500"></i> Relatório Analítico de Frequência
                    </h4>
                    <span class="text-[10px] font-bold bg-slate-900 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                        MATRIZ DE DADOS OFICIAIS
                    </span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-900/50">
                                <th class="p-4 text-[10px] font-black uppercase text-slate-500 border-b border-slate-700">Data da Aula</th>
                                <th class="p-4 text-[10px] font-black uppercase text-slate-500 border-b border-slate-700">Disciplina</th>
                                <th class="p-4 text-[10px] font-black uppercase text-slate-500 border-b border-slate-700 text-center">Status</th>
                                <th class="p-4 text-[10px] font-black uppercase text-slate-500 border-b border-slate-700 text-center">Registro</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (presencas.length === 0) {
            tableHTML += `<tr><td colspan="4" class="p-10 text-center text-slate-500 italic text-sm">Nenhum registro de frequência encontrado para os filtros atuais.</td></tr>`;
        } else {
            presencas.forEach(p => {
                const isFalta = p.status === 'ausente';
                const isJust = p.status === 'justificado';
                
                let badge = '<span class="px-2 py-1 rounded text-[9px] font-black bg-green-500/10 text-green-400 border border-green-500/20">PRESENTE</span>';
                let mark = '<span class="text-green-500/30 font-mono">P</span>';

                if(isFalta) {
                    badge = '<span class="px-2 py-1 rounded text-[9px] font-black bg-red-500/20 text-red-400 border border-red-500/30">AUSENTE</span>';
                    mark = '<span class="text-red-500 font-black font-mono">F</span>';
                } else if(isJust) {
                    badge = '<span class="px-2 py-1 rounded text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">JUSTIFICADO</span>';
                    mark = '<span class="text-amber-400 font-black font-mono">J</span>';
                }

                const dName = state.cache.disciplinesMap.get(p.disciplineId) || p.disciplineId;

                tableHTML += `
                    <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                        <td class="p-4 text-xs font-mono text-slate-300">${p.date.toLocaleDateString('pt-BR')}</td>
                        <td class="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">${dName}</td>
                        <td class="p-4 text-center">${badge}</td>
                        <td class="p-4 text-center text-lg">${mark}</td>
                    </tr>
                `;
            });
        }

        // Rodapé com o totalizador igual ao PDF
        const totalFaltas = presencas.filter(x => x.status === 'ausente').length;
        tableHTML += `
                        </tbody>
                        <tfoot class="bg-slate-900/80">
                            <tr>
                                <td colspan="3" class="p-4 text-right text-[10px] font-black uppercase text-slate-500">Contagem Total de Faltas no Período:</td>
                                <td class="p-4 text-center text-xl font-black text-red-500">${totalFaltas}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;

        // Injeção limpa no DOM
        const oldHist = document.getElementById('hist-faltas-dinamico');
        if(oldHist) oldHist.remove();
        
        const histDiv = document.createElement('div');
        histDiv.id = 'hist-faltas-dinamico';
        histDiv.className = 'w-full flex-shrink-0 z-10'; 
        histDiv.innerHTML = tableHTML;
        
        els.predictiveList.parentElement.appendChild(histDiv);
    },

    updateEvolutionChart: (discId) => {
        if(!discId) {
            if(chartInstances['evolution']) chartInstances['evolution'].destroy();
            els.msgEvolution.classList.remove('hidden');
            return;
        }
        
        const trimestres = currentStudentAnalysisData.notas[discId] || {};
        const labels = [], data = [];
        
        ['1','2','3'].forEach(trim => {
            const tData = trimestres[trim] || {};
            if(tData.nota1) { labels.push(`T${trim}-N1`); data.push(parseFloat(tData.nota1)); }
            if(tData.nota2) { labels.push(`T${trim}-N2`); data.push(parseFloat(tData.nota2)); }
            if(tData.nota3) { labels.push(`T${trim}-N3`); data.push(parseFloat(tData.nota3)); }
            if(tData.nota4) { labels.push(`T${trim}-N4`); data.push(parseFloat(tData.nota4)); }
        });

        if(data.length > 0) {
            els.msgEvolution.classList.add('hidden');
            window.profAPI.renderGenericChart('evolution', 'line', labels, data, 'Evolução das Notas', '#a855f7'); // Roxo
        } else {
            els.msgEvolution.textContent = "Sem notas para esta disciplina.";
            els.msgEvolution.classList.remove('hidden');
            if(chartInstances['evolution']) chartInstances['evolution'].destroy();
        }
    },

    renderGenericChart: (id, type, labels, data, labelStr, color) => {
        const ctx = document.getElementById('chart-'+id).getContext('2d');
        const msgEl = document.getElementById('chart-'+id+'-msg');
        
        if(chartInstances[id]) chartInstances[id].destroy();
        
        if(data.length === 0 || data.every(v => v === 0)) {
            if(msgEl) msgEl.classList.remove('hidden');
            return;
        }
        if(msgEl) msgEl.classList.add('hidden');

        // Configuração do Chart.js estilizada para tema Dark
        const config = {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: labelStr,
                    data: data,
                    backgroundColor: Array.isArray(color) ? color : color + 'CC',
                    borderColor: Array.isArray(color) ? '#1e293b' : color, // Borda escura se for pizza
                    borderWidth: type === 'doughnut' ? 4 : 2,
                    tension: 0.4, 
                    fill: type === 'line' ? { target: 'origin', above: color + '20' } : false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: type === 'doughnut', position: 'right', labels: { color: '#cbd5e1', font: {family: 'Inter', weight: 'bold'} } },
                    datalabels: { color: '#ffffff', font: { weight: 'black', size: 10 } }
                },
                scales: type !== 'doughnut' ? {
                    y: { beginAtZero: true, max: 10, ticks: { color: '#64748b' }, grid: { color: '#334155', drawBorder: false } },
                    x: { ticks: { color: '#94a3b8', font: {size: 9} }, grid: { display: false } }
                } : {}
            },
            plugins: [ChartDataLabels]
        };
        
        chartInstances[id] = new Chart(ctx, config);
    },

    runPredictiveAnalysis: () => {
        const list = els.predictiveList;
        list.innerHTML = '';
        const { notas, presencas } = currentStudentAnalysisData;
        let hasIssues = false;

        // 1. Notas Baixas
        const lowGrades = [];
        Object.entries(notas).forEach(([disc, trims]) => {
            Object.values(trims).forEach(t => {
                if( (t.nota1 && t.nota1 < 6) || (t.nota2 && t.nota2 < 6) || (t.nota3 && t.nota3 < 6) || (t.nota4 && t.nota4 < 6) ) {
                    const name = state.cache.disciplinesMap.get(disc) || disc;
                    if(!lowGrades.includes(name)) lowGrades.push(name);
                }
            });
        });
        
        if(lowGrades.length > 0) {
            list.insertAdjacentHTML('beforeend', `<li class="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-xs font-bold leading-relaxed flex gap-3"><i class="fas fa-exclamation-triangle mt-0.5 text-lg"></i> <div>Risco Acadêmico: Detectamos notas abaixo da média nas disciplinas: <span class="text-white">${lowGrades.join(', ')}</span>.</div></li>`);
            hasIssues = true;
        }

        // 2. Taxa de Faltas Evasão
        const totalAulas = presencas.length;
        const faltas = presencas.filter(p => p.status === 'ausente').length;
        if(totalAulas > 0 && (faltas/totalAulas) > 0.20) { 
            list.insertAdjacentHTML('beforeend', `<li class="bg-amber-500/10 text-amber-500 border border-amber-500/20 p-3 rounded-lg text-xs font-bold leading-relaxed flex gap-3"><i class="fas fa-walking mt-0.5 text-lg"></i> <div>Alerta de Evasão: Taxa de ausência de <span class="text-white text-sm">${((faltas/totalAulas)*100).toFixed(0)}%</span>. Risco severo de reprovação por faltas.</div></li>`);
            hasIssues = true;
        }

        if(!hasIssues) {
            list.insertAdjacentHTML('beforeend', `<li class="bg-green-500/10 text-green-400 border border-green-500/20 p-3 rounded-lg text-xs font-bold leading-relaxed flex items-center gap-3"><i class="fas fa-check-circle text-lg"></i> Desempenho estável. Não há alertas de notas baixas ou excesso de faltas no momento.</li>`);
        }
    },

    // ==========================================
    // MÓDULO: ANÁLISE GERAL DA TURMA
    // ==========================================
    loadGeralDashboard: async () => {
        const { classId, disciplineId } = state.filters;
        
        if(!classId || !disciplineId) {
            els.geralDashboard.classList.add('hidden');
            els.geralMsg.textContent = "Selecione Turma e Disciplina no topo e clique em Carregar.";
            els.geralMsg.classList.remove('hidden');
            return;
        }

        els.geralMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2 text-amber-500"></i> Processando dados da turma...';
        els.geralDashboard.classList.add('hidden');
        els.geralMsg.classList.remove('hidden');

        try {
            // 1. Garante os Alunos (Usa o cache se já tiver carregado na chamada)
            let students = state.cache.students;
            if(students.length === 0) {
                const qS = query(collection(db, "users"), where("turma", "==", classId), where("Aluno", "==", true), orderBy("nome"));
                const snapS = await getDocs(qS);
                students = [];
                snapS.forEach(d => students.push({id: d.id, ...d.data()}));
                state.cache.students = students;
            }
            geralAnalysisCache.students = students;

            // Popula Dropdown de Frequência Individual e Atrela o Evento (Correção do Gráfico que não mudava)
            els.geralFreqStudentSel.innerHTML = '<option value="">Selecione Aluno...</option>';
            students.forEach(s => els.geralFreqStudentSel.add(new Option(s.nome, s.id)));
            
            els.geralFreqStudentSel.onchange = (e) => {
                window.profAPI.renderIndividualFreqChartGeral(e.target.value);
            };

            // 2. Busca Notas da Turma toda
            const notasPromises = students.map(s => getDoc(doc(db, "notas", s.id)));
            const notasSnaps = await Promise.all(notasPromises);
            
            // 3. Busca Presenças (Traz tudo da turma e filtra localmente para evitar problemas de nomenclatura no Firebase)
            const presSnap = await getDocs(query(collection(db, "presencas"), where("turma", "==", classId)));
            
            const startStr = els.geralStartDate.value;
            const endStr = els.geralEndDate.value;
            const startLimit = startStr ? new Date(startStr + "T00:00:00").getTime() : 0;
            const endLimit = endStr ? new Date(endStr + "T23:59:59").getTime() : Infinity;
            
            // --- PROCESSAMENTO DOS DADOS ---
            const dataFaltas = {}; 
            let totalFaltasTurma = 0;
            const uniqueAulas = new Set();
            
            // Inicializa a contagem de faltas para todos os alunos da turma
            students.forEach(s => dataFaltas[s.id] = { ausente: 0, presente: 0, justificado: 0 });

            presSnap.forEach(doc => {
                const p = doc.data();
                const dId = p.disciplineId || p.disciplinaId;
                
                // Tratamento seguro da data (Evita falhas se o Firebase entregar timestamp ou string)
                let pTime = 0;
                if (p.data_aula_timestamp) {
                    pTime = typeof p.data_aula_timestamp.toMillis === 'function' 
                        ? p.data_aula_timestamp.toMillis() 
                        : new Date(p.data_aula_timestamp).getTime();
                }
                
                // Filtra EXATAMENTE pela disciplina atual e pelos limites de data
                if(dId === disciplineId && pTime >= startLimit && pTime <= endLimit) {
                    uniqueAulas.add(doc.id);
                    if(p.registros) {
                        Object.entries(p.registros).forEach(([uid, status]) => {
                            if(dataFaltas[uid]) {
                                // Normalização contra erros de digitação no banco
                                let s = status;
                                if(s === 'justificada' || String(s).startsWith('justi')) s = 'justificado';
                                if(s === 'falta') s = 'ausente';
                                
                                dataFaltas[uid][s] = (dataFaltas[uid][s] || 0) + 1;
                                if(s === 'ausente') totalFaltasTurma++;
                            }
                        });
                    }
                }
            });
            
            const totalAulas = uniqueAulas.size;
            geralAnalysisCache.faltasMap = dataFaltas;

            // Processa Notas (Estrutura: disciplinasComNotas > discId > trimestres > nota1..4)
            const scatterData = []; 
            const panoramaData = []; 
            let somaMedias = 0;
            let countAlunosComNota = 0;
            
            notasSnaps.forEach((snap, idx) => {
                if(!snap.exists()) return;
                const d = snap.data().disciplinasComNotas || {};
                const sName = students[idx].nome;
                const sId = students[idx].id;
                const discData = d[disciplineId] || {};

                let somaAluno = 0;
                let countAluno = 0;

                ['1', '2', '3'].forEach(trim => {
                    const tData = discData[trim] || {};
                    ['nota1', 'nota2', 'nota3', 'nota4'].forEach((nKey, nIdx) => { 
                        const val = parseFloat(tData[nKey]);
                        if(!isNaN(val)) {
                            somaAluno += val;
                            countAluno++;
                            const labelNota = `N${nIdx+1}`;
                            const labelTrim = `${trim}º Tri`;
                            panoramaData.push({ x: `${labelNota} - ${labelTrim}`, y: val });
                        }
                    });
                });

                // Só considera o aluno para a média da turma se ele tiver ao menos uma nota lançada
                if(countAluno > 0) {
                    const mediaFinal = somaAluno / countAluno;
                    somaMedias += mediaFinal;
                    countAlunosComNota++;
                    
                    const faltasAluno = dataFaltas[sId]?.ausente || 0;
                    scatterData.push({ x: faltasAluno, y: parseFloat(mediaFinal.toFixed(1)), student: sName });
                }
            });

            // --- CÁLCULO UNIFICADO: ALUNOS EM RISCO E TOOLTIP ---
            let alunosRisco = 0;
            let alunosRiscoNomes = [];
            
            students.forEach(s => {
                const f = dataFaltas[s.id]?.ausente || 0;
                // Critério de risco: mais de 20% de falta das aulas DADAS nesta disciplina
                if(totalAulas > 0 && (f / totalAulas) > 0.20) {
                    alunosRisco++; // Conta apenas UMA vez
                    alunosRiscoNomes.push(s.nome);
                }
            });

            // Preenche KPIs Visuais
            const mediaTurma = countAlunosComNota > 0 ? (somaMedias/countAlunosComNota).toFixed(2) : "-";
            els.kpiGeralMedia.textContent = mediaTurma;
            els.kpiGeralMedia.className = `text-4xl font-black ${mediaTurma >= 7 ? 'text-green-400' : (mediaTurma >= 6 ? 'text-amber-400' : 'text-red-500')}`;
            
            els.kpiGeralFaltas.textContent = totalFaltasTurma;
            els.kpiGeralRisco.textContent = alunosRisco;
            
            // Tooltip com os nomes no Card de Risco
            const cardRisco = els.kpiGeralRisco.parentElement;
            if (alunosRiscoNomes.length > 0) {
                cardRisco.title = "Alunos em Risco:\n\n" + alunosRiscoNomes.join("\n");
                cardRisco.classList.add('cursor-help');
            } else {
                cardRisco.title = "Nenhum aluno em risco de evasão.";
                cardRisco.classList.remove('cursor-help');
            }

            // Renderiza Gráficos (Mesmo sem notas, os gráficos carregam em branco e exibem o KPI de Faltas)
            window.profAPI.renderGeralScatter(scatterData);
            window.profAPI.renderGeralPanorama(panoramaData);
            
            // Reseta gráfico individual de frequência
            if(chartInstances['geral-freq-ind']) chartInstances['geral-freq-ind'].destroy();
            els.msgGeralFaltas.classList.remove('hidden');
            els.geralFreqStudentSel.value = "";

            els.geralMsg.classList.add('hidden');
            els.geralDashboard.classList.remove('hidden');
            els.geralDashboard.classList.add('flex');

        } catch(e) {
            console.error(e);
            els.geralMsg.textContent = "Erro ao processar visão geral: " + e.message;
        }
    },

    renderGeralScatter: (data) => {
        const ctx = els.canvasGeralScatter.getContext('2d');
        if(chartInstances['geral-scatter']) chartInstances['geral-scatter'].destroy();

        if(data.length === 0) {
            els.msgGeralNotas.classList.remove('hidden');
            return;
        }
        els.msgGeralNotas.classList.add('hidden');

        chartInstances['geral-scatter'] = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Aluno',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)', // Azul Inst
                    borderColor: '#60a5fa',
                    pointRadius: 6,
                    pointHoverRadius: 9
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false }, // Desliga datalabels para não poluir
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.student}: Nota Média ${ctx.raw.y} | ${ctx.raw.x} Faltas`
                        }
                    }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Total de Faltas', color: '#94a3b8', font: { weight: 'bold' } },
                        ticks: { color: '#94a3b8', stepSize: 1 },
                        grid: { color: '#334155', drawBorder: false },
                        min: 0
                    },
                    y: { 
                        title: { display: true, text: 'Média Global', color: '#94a3b8', font: { weight: 'bold' } },
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155', drawBorder: false },
                        min: 0, max: 10
                    }
                }
            }
        });
    },

    renderIndividualFreqChartGeral: (uid) => {
        if(!uid) {
            if(chartInstances['geral-freq-ind']) chartInstances['geral-freq-ind'].destroy();
            els.msgGeralFaltas.classList.remove('hidden');
            return;
        }
        
        const dados = geralAnalysisCache.faltasMap[uid];
        if(!dados) return;

        const ctx = els.canvasGeralFaltas.getContext('2d');
        if(chartInstances['geral-freq-ind']) chartInstances['geral-freq-ind'].destroy();
        els.msgGeralFaltas.classList.add('hidden');

        chartInstances['geral-freq-ind'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Presentes', 'Justificadas', 'Ausências'],
                datasets: [{
                    // Garante o 0 caso o aluno não tenha aquele status
                    data: [dados.presente || 0, dados.justificado || 0, dados.ausente || 0],
                    backgroundColor: ['#4ade80', '#f59e0b', '#ef4444'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    datalabels: { color: '#ffffff', font: { weight: 'black', size: 14 } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: '#334155', drawBorder: false } },
                    x: { ticks: { color: '#cbd5e1', font: {weight: 'bold'} }, grid: { display: false } }
                }
            },
            plugins: [ChartDataLabels]
        });
    },

    renderGeralPanorama: (data) => {
        const ctx = els.canvasGeralAll.getContext('2d');
        if(chartInstances['geral-panorama']) chartInstances['geral-panorama'].destroy();

        if(data.length === 0) {
            els.msgGeralAll.textContent = "Nenhuma nota lançada na disciplina.";
            els.msgGeralAll.classList.remove('hidden');
            return;
        }
        els.msgGeralAll.classList.add('hidden');

        // Ordem fixa do Eixo X
        const ordemCategorias = [
            "N1 - 1º Tri", "N2 - 1º Tri", "N3 - 1º Tri", "N4 - 1º Tri",
            "N1 - 2º Tri", "N2 - 2º Tri", "N3 - 2º Tri", "N4 - 2º Tri",
            "N1 - 3º Tri", "N2 - 3º Tri", "N3 - 3º Tri", "N4 - 3º Tri"
        ];

        chartInstances['geral-panorama'] = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Notas Lançadas',
                    data: data,
                    backgroundColor: (ctx) => {
                        const val = ctx.raw?.y;
                        if(val >= 7) return 'rgba(74, 222, 128, 0.7)'; // Verde
                        if(val >= 6) return 'rgba(245, 158, 11, 0.7)'; // Amarelo
                        return 'rgba(239, 68, 68, 0.7)'; // Vermelho
                    },
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1,
                    pointRadius: 6,
                    pointHoverRadius: 10
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => ctx[0].raw.x,
                            label: (ctx) => `Nota Alcançada: ${ctx.raw.y}`
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'category',
                        labels: ordemCategorias, 
                        ticks: { color: '#94a3b8', font: {size: 9} },
                        grid: { color: '#334155', drawBorder: false },
                        offset: true
                    },
                    y: { 
                        min: 0, max: 10, 
                        title: { display: true, text: 'Nota', color: '#94a3b8', font: { weight: 'bold' } },
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155', drawBorder: false }
                    }
                }
            }
        });
    },

    // ==========================================
    // MÓDULO: REGISTRO DE AVALIAÇÕES (PROVAS/TRABALHOS)
    // ==========================================
    loadAvaliacoesAdmin: async () => {
        els.evalListBody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><i class="fas fa-spinner fa-spin text-amber-500 text-2xl"></i></td></tr>';
        els.evalEmptyMsg.classList.add('hidden');

        try {
            // Busca as avaliações globais
            const q = query(collection(db, "avaliacoes"), orderBy("dataAplicacao", "desc"));
            const snap = await getDocs(q);

            if(snap.empty) {
                avaliacoesCache = [];
                els.evalListBody.innerHTML = '';
                els.evalEmptyMsg.classList.remove('hidden');
                return;
            }

            const tSnap = await getDocs(query(collection(db, "turmasCadastradas")));
            const turmasMap = new Map();
            tSnap.forEach(d => turmasMap.set(d.data().identificador, d.data().nomeExibicao));

            if(state.cache.disciplinesMap.size === 0) {
                const dSnap = await getDocs(query(collection(db, "disciplinasCadastradas"), where("ativo", "==", true)));
                dSnap.forEach(d => state.cache.disciplinesMap.set(d.data().identificador, d.data().nomeExibicao));
            }

            // 1. Armazena os dados processados no Cache para permitir a Ordenação
            avaliacoesCache = [];
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                
                const discName = state.cache.disciplinesMap.get(data.disciplina) || data.disciplina;
                const turmasNames = (data.turmas_ids || []).map(tid => turmasMap.get(tid) || tid).join(", ");
                const dateObj = data.dataAplicacao ? data.dataAplicacao.toDate() : null;
                const dateStr = dateObj ? dateObj.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'N/A';
                
                avaliacoesCache.push({
                    id: id,
                    dataOriginal: data, // Guarda o dado original para o formulário de edição
                    disciplinaNome: discName,
                    turmasNames: turmasNames,
                    conteudo: data.conteudo || '-',
                    dataAplicacao: dateObj ? dateObj.getTime() : 0, // Usado para ordenar cronologicamente
                    dataStr: dateStr,
                    valorPontos: parseFloat(data.valorPontos) || 0,
                    exibir: !!data.exibir,
                    dataIso: dateObj?.toISOString()
                });
            });

            // 2. Chama a função que desenha a tabela na tela
            window.profAPI.renderAvaliacoesTable();

        } catch(e) {
            console.error(e);
            els.evalListBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold">Erro: ${e.message}</td></tr>`;
        }
    },

    // Disparada ao clicar no cabeçalho da tabela ---
    sortAvaliacoes: (column) => {
        // Se clicar na mesma coluna, inverte a ordem (ASC / DESC). Se for nova, define como ASC.
        if (avaliacoesSort.column === column) {
            avaliacoesSort.order = avaliacoesSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            avaliacoesSort.column = column;
            avaliacoesSort.order = 'asc';
        }
        window.profAPI.renderAvaliacoesTable(); // Redesenha a tabela
    },

    // Renderiza e Ordena os dados ---
    renderAvaliacoesTable: () => {
        els.evalListBody.innerHTML = '';
        if (avaliacoesCache.length === 0) {
            els.evalEmptyMsg.classList.remove('hidden');
            return;
        }
        els.evalEmptyMsg.classList.add('hidden');

        // Lógica de Ordenação do Array
        const { column, order } = avaliacoesSort;
        avaliacoesCache.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];
            
            // Tratamento ignorando letras maiúsculas/minúsculas
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });

        // Loop de Renderização
        avaliacoesCache.forEach(item => {
            const visibleBadge = item.exibir ? 
                '<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">SIM</span>' : 
                '<span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">NÃO</span>';

            const dataSafe = JSON.stringify({id: item.id, ...item.dataOriginal, dataIso: item.dataIso}).replace(/"/g, '&quot;');

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/50 transition-colors border-b border-slate-700/50";
            tr.innerHTML = `
                <td class="p-4 font-bold text-amber-400">${escapeHTML(item.disciplinaNome)}</td>
                <td class="p-4 text-xs text-slate-300 max-w-[150px] truncate" title="${escapeHTML(item.turmasNames)}">${escapeHTML(item.turmasNames)}</td>
                <td class="p-4 text-xs text-slate-400 italic line-clamp-2 max-w-[200px]" title="${escapeHTML(item.conteudo)}">${escapeHTML(item.conteudo)}</td>
                <td class="p-4 text-center text-xs font-mono text-slate-200">${item.dataStr}</td>
                <td class="p-4 text-center font-black text-lg text-amber-500">${item.valorPontos || '-'}</td>
                <td class="p-4 text-center">${visibleBadge}</td>
                <td class="p-4 text-right">
                    <button onclick='window.profAPI.openAvaliacaoForm(${dataSafe})' class="text-blue-400 hover:text-white mr-3 transition-colors p-2" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="window.profAPI.deleteAvaliacao('${item.id}')" class="text-red-500 hover:text-red-300 transition-colors p-2" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
            els.evalListBody.appendChild(tr);
        });
    },

    openAvaliacaoForm: async (data = null) => {
        // 1. Popula Selects na primeira vez que abre o modal
        if(els.formEvalDisc.options.length <= 1) {
            els.formEvalDisc.innerHTML = '<option value="">Carregando...</option>';
            const dSnap = await getDocs(query(collection(db, "disciplinasCadastradas"), where("ativo", "==", true), orderBy("nomeExibicao")));
            els.formEvalDisc.innerHTML = '<option value="">Selecione a Disciplina...</option>';
            dSnap.forEach(d => els.formEvalDisc.add(new Option(d.data().nomeExibicao, d.data().identificador)));

            els.formEvalTurmas.innerHTML = '<option>Carregando...</option>';
            const tSnap = await getDocs(query(collection(db, "turmasCadastradas"), where("ativo", "==", true), orderBy("nomeExibicao")));
            els.formEvalTurmas.innerHTML = '';
            tSnap.forEach(t => els.formEvalTurmas.add(new Option(t.data().nomeExibicao, t.data().identificador)));
        }

        // 2. Preenche os campos
        if(data) {
            els.evalAdminTitle.innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Avaliação';
            els.evalAdminId.value = data.id;
            els.formEvalDisc.value = data.disciplina;
            
            // Ajusta fuso horário do ISO para o input datetime-local
            if(data.dataIso) {
                // "2024-03-15T14:30:00.000Z" -> "2024-03-15T14:30"
                els.formEvalDate.value = data.dataIso.slice(0, 16); 
            } else {
                els.formEvalDate.value = "";
            }
            
            // Multi-select Turmas
            const options = els.formEvalTurmas.options;
            const selectedIds = data.turmas_ids || [];
            for(let i=0; i<options.length; i++) {
                options[i].selected = selectedIds.includes(options[i].value);
            }

            els.formEvalContent.value = data.conteudo || '';
            els.formEvalTips.value = data.dicasProf || '';
            els.formEvalValue.value = data.valorPontos || '';
            els.formEvalVisible.checked = !!data.exibir;
        } else {
            els.evalAdminTitle.innerHTML = '<i class="fas fa-calendar-plus mr-2"></i> Nova Avaliação';
            els.evalAdminId.value = "";
            els.formEvalDisc.value = "";
            els.formEvalDate.value = "";
            
            // Limpa Turmas
            for(let i=0; i<els.formEvalTurmas.options.length; i++) els.formEvalTurmas.options[i].selected = false;
            
            els.formEvalContent.value = "";
            els.formEvalTips.value = "";
            els.formEvalValue.value = "";
            els.formEvalVisible.checked = true;
            
            // UX: Se tiver filtro global ativo, já seleciona a turma e disciplina no modal
            if(state.filters.classId) {
                for(let i=0; i<els.formEvalTurmas.options.length; i++) {
                    if(els.formEvalTurmas.options[i].value === state.filters.classId) els.formEvalTurmas.options[i].selected = true;
                }
            }
            if(state.filters.disciplineId) els.formEvalDisc.value = state.filters.disciplineId;
        }

        els.evalAdminModal.classList.remove('hidden');
        els.evalAdminModal.classList.add('flex');
    },

    closeAvaliacaoForm: () => {
        els.evalAdminModal.classList.add('hidden');
        els.evalAdminModal.classList.remove('flex');
    },

    saveAvaliacao: async () => {
        const id = els.evalAdminId.value;
        const disciplina = els.formEvalDisc.value;
        const dataStr = els.formEvalDate.value;
        
        // Pega as turmas selecionadas no multi-select
        const turmas_ids = Array.from(els.formEvalTurmas.selectedOptions).map(opt => opt.value);
        
        if(!disciplina || !dataStr || turmas_ids.length === 0) return alert("Por favor, preencha a Disciplina, a Data e selecione ao menos uma Turma.");

        els.btnSaveAvaliacao.disabled = true;
        els.btnSaveAvaliacao.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';

        try {
            const payload = {
                disciplina,
                turmas_ids,
                dataAplicacao: Timestamp.fromDate(new Date(dataStr)),
                conteudo: els.formEvalContent.value,
                dicasProf: els.formEvalTips.value,
                valorPontos: parseFloat(els.formEvalValue.value) || 0,
                exibir: els.formEvalVisible.checked,
                ultimaModificacao: serverTimestamp()
            };

            if(id) {
                await updateDoc(doc(db, "avaliacoes", id), payload);
            } else {
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, "avaliacoes"), payload);
            }

            window.profAPI.closeAvaliacaoForm();
            window.profAPI.loadAvaliacoesAdmin();
            alert("Avaliação registrada com sucesso no calendário!");

        } catch(e) {
            console.error(e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            els.btnSaveAvaliacao.disabled = false;
            els.btnSaveAvaliacao.innerHTML = 'Salvar Avaliação';
        }
    },

    deleteAvaliacao: async (id) => {
        if(!confirm("Atenção: Excluir esta avaliação irá removê-la do calendário de todas as turmas vinculadas. Continuar?")) return;
        try {
            await deleteDoc(doc(db, "avaliacoes", id));
            window.profAPI.loadAvaliacoesAdmin();
        } catch(e) { alert("Erro ao excluir: " + e.message); }
    },

    // ==========================================
    // MÓDULO: GRADE HORÁRIA
    // ==========================================
    loadGradeHoraria: async () => {
        const { classId } = state.filters;
        
        if(els.horarioDisc.options.length <= 1) window.profAPI.populateHorarioSelects();

        if(!classId) {
            els.horarioMsg.textContent = "Selecione uma Turma no topo (menu principal).";
            els.horarioMsg.classList.remove('hidden');
            window.profAPI.renderEmptyGrade();
            return;
        }

        els.horarioMsg.innerHTML = '<i class="fas fa-spinner fa-spin mr-2 text-amber-500"></i> Carregando grade...';
        els.horarioMsg.classList.remove('hidden');

        try {
            const q = query(collection(db, "aulas"), where("turmaId", "==", classId));
            const snap = await getDocs(q);
            
            const aulasMap = {};           
            
            snap.forEach(doc => {
                const d = doc.data();
                
                let dia = (d.diaSemana || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                if (dia && !dia.includes('-feira')) dia += '-feira';
                const numOrdem = parseInt(d.ordem);
                const key = `${dia}_${numOrdem}`;
                aulasMap[key] = { id: doc.id, ...d };
            });

            window.profAPI.renderGrade(aulasMap);
            els.horarioMsg.classList.add('hidden');

        } catch(e) {
            console.error(e);
            els.horarioMsg.textContent = "Erro ao carregar grade: " + e.message;
        }
    },

    populateHorarioSelects: async () => {
        const { school } = state.filters;
        if (!school) return;

        // 1. Popula Disciplinas da Escola
        els.horarioDisc.innerHTML = '<option value="">Carregando...</option>';
        const dSnap = await getDocs(query(collection(db, "disciplinasCadastradas"), where("ativo", "==", true), where("escolaOrigem", "==", school), orderBy("nomeExibicao")));
        els.horarioDisc.innerHTML = '<option value="">Selecione a Disciplina...</option>';
        dSnap.forEach(d => els.horarioDisc.add(new Option(d.data().nomeExibicao, d.data().identificador)));

        // 2. Popula Professores (Traz todos os professores e filtra na memória para evitar erro de índice composto)
        els.horarioProf.innerHTML = '<option value="">Carregando...</option>';
        const pSnap = await getDocs(query(collection(db, "users"), where("Professor", "==", true)));
        
        els.horarioProf.innerHTML = '<option value="">Selecione o Docente...</option>';
        pSnap.forEach(d => {
            const profData = d.data();
            // Verifica se o professor leciona na escola atual
            if (profData.escolas && profData.escolas[school]) {
                els.horarioProf.add(new Option(profData.nome, `${d.id}|${profData.nome}`));
            }
        });
    },

    renderEmptyGrade: () => {
        window.profAPI.renderGrade({});
    },

    renderGrade: (aulasMap) => {
        els.gradeGrid.innerHTML = `
            <div class="grade-header border-b border-r border-slate-700">Horário</div>
            <div class="grade-header border-b border-r border-slate-700">Segunda</div>
            <div class="grade-header border-b border-r border-slate-700">Terça</div>
            <div class="grade-header border-b border-r border-slate-700">Quarta</div>
            <div class="grade-header border-b border-r border-slate-700">Quinta</div>
            <div class="grade-header border-b border-slate-700">Sexta</div>
        `;

        const dias = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
        
        for(let i = 1; i <= 7; i++) {
            const timeCell = document.createElement('div');
            timeCell.className = 'grade-time border-r border-b border-slate-700/50';
            timeCell.innerHTML = `<span class="bg-slate-800 px-2 py-1 rounded-md border border-slate-700 shadow-inner">${i}ª Aula</span>`;
            els.gradeGrid.appendChild(timeCell);

            dias.forEach(dia => {
                const cell = document.createElement('div');
                cell.className = 'grade-cell border-r border-b border-slate-700/50';
                
                const aula = aulasMap[`${dia}_${i}`];
                if(aula) {
                    // Aceita tanto o campo novo quanto o campo antigo do BD
                    const discIdReal = aula.disciplinaId || aula.disciplina || "";
                    const discName = state.cache.disciplinesMap.get(discIdReal) || discIdReal || "Desconhecida";
                    
                    // Tratamento rigoroso de aspas para o botão não quebrar a tela
                    const aulaSafe = JSON.stringify(aula).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    
                    cell.innerHTML = `
                        <div class="aula-card hover:scale-[1.02] transition-transform">
                            <strong>${escapeHTML(discName)}</strong>
                            <span><i class="fas fa-chalkboard-teacher mr-1 text-[9px]"></i> ${escapeHTML(aula.professorNome || "Professor")}</span>
                            ${aula.conteudo ? `<span class="mt-1 text-amber-500 italic line-clamp-1" title="${escapeHTML(aula.conteudo)}">${escapeHTML(aula.conteudo)}</span>` : ''}
                            <div class="aula-actions">
                                <button class="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white" onclick='window.profAPI.editAula(${aulaSafe})'><i class="fas fa-edit"></i></button>
                                <button class="bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white" onclick="window.profAPI.deleteAula('${aula.id}')"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `;
                }
                els.gradeGrid.appendChild(cell);
            });
        }
    },

    toggleHorarioForm: () => {
        const el = els.horarioFormContainer;
        if(el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            if(els.horarioFormTitle.textContent !== 'Nova Aula') window.profAPI.resetHorarioForm();
        } else {
            el.classList.add('hidden');
            window.profAPI.resetHorarioForm();
        }
    },

    resetHorarioForm: () => {
        els.horarioFormTitle.innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Nova Aula';
        els.horarioId.value = "";
        els.horarioDia.value = "";
        els.horarioOrdem.value = "";
        els.horarioDisc.value = "";
        els.horarioProf.value = "";
        els.horarioConteudo.value = "";
        els.btnSaveHorario.textContent = "Salvar Aula";
    },

    editAula: (data) => {
        els.horarioFormTitle.innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Aula';
        els.horarioId.value = data.id;
        
        // FIX: Normaliza o dia para selecionar a opção correta no <select> (que não possui cedilha no value)
        let diaNormalizado = (data.diaSemana || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
        if (diaNormalizado && !diaNormalizado.includes('-feira')) diaNormalizado += '-feira';
        els.horarioDia.value = diaNormalizado;
        
        // Extrai apenas o número da ordem para selecionar no <select> corretamente
        els.horarioOrdem.value = parseInt(data.ordem) || "";
        
        els.horarioDisc.value = data.disciplinaId || data.disciplina || "";
        els.horarioProf.value = `${data.professorId}|${data.professorNome}`;
        els.horarioConteudo.value = data.conteudo || "";
        
        els.horarioFormContainer.classList.remove('hidden');
        els.horarioFormContainer.scrollIntoView({ behavior: 'smooth' });
        els.btnSaveHorario.textContent = "Atualizar Aula";
    },

    saveHorario: async () => {
        const { school, classId } = state.filters;
        if(!classId) return alert("Selecione a Turma no topo da página.");

        const id = els.horarioId.value;
        const diaSemana = els.horarioDia.value;
        const ordem = parseInt(els.horarioOrdem.value);
        const disciplina = els.horarioDisc.value;
        const profVal = els.horarioProf.value;
        
        if(!diaSemana || !ordem || !disciplina || !profVal) return alert("Preencha todos os campos obrigatórios (*).");
        
        const [professorId, professorNome] = profVal.split('|');
        const turmaName = document.getElementById('prof-filter-class').options[document.getElementById('prof-filter-class').selectedIndex]?.text;

        const payload = {
            escolaId: school, turmaId: classId, turmaNome: turmaName,
            diaSemana, ordem, disciplinaId: disciplina, disciplina: disciplina, 
            professorId, professorNome,
            conteudo: els.horarioConteudo.value
        };

        els.btnSaveHorario.disabled = true;
        els.btnSaveHorario.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            if(id) {
                await updateDoc(doc(db, "aulas", id), payload);
            } else {
                payload.dataCadastro = serverTimestamp();
                await addDoc(collection(db, "aulas"), payload);
            }
            
            window.profAPI.toggleHorarioForm();
            window.profAPI.loadGradeHoraria();
        } catch(e) {
            console.error(e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            els.btnSaveHorario.disabled = false;
            els.btnSaveHorario.textContent = "Salvar Aula";
        }
    },

    deleteAula: async (id) => {
        if(!confirm("Excluir esta aula da grade?")) return;
        try {
            await deleteDoc(doc(db, "aulas", id));
            window.profAPI.loadGradeHoraria();
        } catch(e) { alert("Erro: " + e.message); }
    },

    // ==========================================
    // MÓDULO: MURAL DE AVISOS
    // ==========================================
    loadAvisosPanel: async () => {
        // 1. Popula a lista de turmas se ainda estiver vazia
        if(els.avisoTurmasList.children.length <= 1) {
            window.profAPI.populateAvisoTurmas();
        }
        // 2. Carrega a lista de avisos
        window.profAPI.loadAvisosList();
    },

    populateAvisoTurmas: async () => {
        els.avisoTurmasList.innerHTML = '<div class="text-center text-slate-500 text-xs py-4"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando turmas...</div>';
        try {
            const q = query(collection(db, "turmasCadastradas"), where("ativo", "==", true), orderBy("nomeExibicao"));
            const snap = await getDocs(q);
            
            let html = `
                <div class="flex items-center p-3 bg-slate-700/50 rounded-lg mb-2 border border-slate-600">
                    <input type="checkbox" id="check-all-turmas" class="w-4 h-4 accent-amber-500 cursor-pointer" onchange="window.profAPI.toggleAllAvisoTurmas(this)">
                    <label for="check-all-turmas" class="font-bold text-amber-400 ml-3 cursor-pointer text-xs uppercase tracking-widest w-full">Selecionar Todas as Turmas</label>
                </div>
            `;

            snap.forEach(doc => {
                const t = doc.data();
                html += `
                    <div class="flex items-center p-2 hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer">
                        <input type="checkbox" id="aviso-t-${t.identificador}" value="${t.identificador}" class="aviso-turma-checkbox w-4 h-4 accent-amber-500 cursor-pointer">
                        <label for="aviso-t-${t.identificador}" class="ml-3 cursor-pointer text-slate-300 text-sm w-full">${t.nomeExibicao}</label>
                    </div>
                `;
            });
            els.avisoTurmasList.innerHTML = html;

        } catch(e) {
            console.error(e);
            els.avisoTurmasList.innerHTML = '<div class="text-red-400 text-center text-xs py-4 font-bold">Erro ao carregar turmas</div>';
        }
    },

    toggleAllAvisoTurmas: (source) => {
        const checkboxes = els.avisoTurmasList.querySelectorAll('.aviso-turma-checkbox');
        checkboxes.forEach(cb => cb.checked = source.checked);
    },

    loadAvisosList: async () => {
        els.avisosList.innerHTML = '<div class="text-center py-10 text-amber-500"><i class="fas fa-circle-notch fa-spin text-3xl"></i></div>';
        els.avisosMsg.classList.add('hidden');

        try {
            const q = query(collection(db, "avisos_colegio"), orderBy("dataCriacao", "desc"));
            const snap = await getDocs(q);

            if(snap.empty) {
                els.avisosList.innerHTML = '';
                els.avisosMsg.classList.remove('hidden');
                return;
            }

            els.avisosList.innerHTML = '';
            
            // Opcional: Se quiser os nomes reais das turmas, poderia buscar no BD. 
            // Como otimização, o aviso já guarda a lista de IDs.

            snap.forEach(doc => {
                const aviso = doc.data();
                const id = doc.id;
                
                const dataStr = aviso.dataCriacao?.toDate().toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) || 'N/A';
                
                const qtdTurmas = aviso.turmasRelacionadas ? aviso.turmasRelacionadas.length : 0;
                const turmasLabel = qtdTurmas > 3 ? `${qtdTurmas} Turmas Destinatárias` : (aviso.turmasRelacionadas || []).join(", ");

                const div = document.createElement('div');
                div.className = 'bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg relative group transition-colors hover:bg-slate-800/80';
                
                // Trata quebras de linha na mensagem
                const mensagemFormatada = escapeHTML(aviso.mensagem).replace(/\n/g, '<br>');

                // Usamos JSON com escape seguro para jogar o objeto inteiro pro botão de editar
                const avisoSafe = JSON.stringify(aviso).replace(/"/g, '&quot;');

                div.innerHTML = `
                    <div class="text-slate-200 text-sm leading-relaxed mb-4 font-medium">${mensagemFormatada}</div>
                    
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4 border-t border-slate-700/50">
                        <div class="flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                            <span class="flex items-center"><i class="fas fa-user-circle mr-1 text-slate-500"></i> ${escapeHTML(aviso.autor || 'Coordenação')}</span>
                            <span class="text-slate-600">|</span>
                            <span class="flex items-center"><i class="far fa-clock mr-1 text-slate-500"></i> ${dataStr}</span>
                        </div>
                        
                        <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                            <span class="bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest truncate max-w-[200px]" title="${escapeHTML((aviso.turmasRelacionadas || []).join('\n'))}">
                                <i class="fas fa-users mr-1"></i> ${escapeHTML(turmasLabel)}
                            </span>
                            
                            <div class="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onclick='window.profAPI.editAviso("${id}", ${avisoSafe})' class="bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/30 p-2 rounded-lg transition-colors" title="Editar Aviso"><i class="fas fa-edit"></i></button>
                                <button onclick="window.profAPI.deleteAviso('${id}')" class="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 p-2 rounded-lg transition-colors" title="Excluir Aviso"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `;
                els.avisosList.appendChild(div);
            });

        } catch(e) {
            console.error(e);
            els.avisosList.innerHTML = `<div class="text-center text-red-500 font-bold p-6">Erro: ${e.message}</div>`;
        }
    },

    toggleAvisoForm: () => {
        const el = els.avisoFormContainer;
        if(el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            window.profAPI.resetAvisoForm();
            el.scrollIntoView({behavior: 'smooth', block: 'start'});
        } else {
            el.classList.add('hidden');
        }
    },

    resetAvisoForm: () => {
        els.avisoFormTitle.innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Novo Aviso';
        els.avisoId.value = "";
        els.avisoMsgInput.value = "";
        els.btnSaveAviso.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Publicar Aviso';
        
        const cbs = els.avisoTurmasList.querySelectorAll('input[type="checkbox"]');
        cbs.forEach(cb => cb.checked = false);
    },

    editAviso: (id, data) => {
        els.avisoFormContainer.classList.remove('hidden');
        els.avisoFormTitle.innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Aviso';
        els.avisoId.value = id;
        els.avisoMsgInput.value = data.mensagem || "";
        els.btnSaveAviso.innerHTML = '<i class="fas fa-save mr-2"></i> Atualizar Aviso';
        
        // Marca as turmas que já estavam selecionadas
        const cbs = els.avisoTurmasList.querySelectorAll('.aviso-turma-checkbox');
        if(data.turmasRelacionadas) {
            cbs.forEach(cb => {
                cb.checked = data.turmasRelacionadas.includes(cb.value);
            });
        }
        
        els.avisoFormContainer.scrollIntoView({behavior: 'smooth', block: 'start'});
    },

    saveAviso: async () => {
        const id = els.avisoId.value;
        const mensagem = els.avisoMsgInput.value.trim();
        
        const turmasSelecionadas = [];
        const cbs = els.avisoTurmasList.querySelectorAll('.aviso-turma-checkbox:checked');
        cbs.forEach(cb => turmasSelecionadas.push(cb.value));

        if(!mensagem) return alert("Digite a mensagem do comunicado.");
        if(turmasSelecionadas.length === 0) return alert("Selecione ao menos uma turma destinatária.");

        els.btnSaveAviso.disabled = true;
        els.btnSaveAviso.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processando...';

        try {
            const payload = {
                mensagem,
                turmasRelacionadas: turmasSelecionadas,
                autor: auth.currentUser.email, // Salva o e-mail do admin logado
                exibir: true,
                atualizadoEm: serverTimestamp()
            };

            if(id) {
                await updateDoc(doc(db, "avisos_colegio", id), payload);
            } else {
                payload.dataCriacao = serverTimestamp();
                await addDoc(collection(db, "avisos_colegio"), payload);
            }
            
            els.avisoFormContainer.classList.add('hidden');
            window.profAPI.loadAvisosList();
            alert("Comunicado publicado com sucesso!");

        } catch(e) {
            console.error(e);
            alert("Erro ao publicar aviso: " + e.message);
        } finally {
            els.btnSaveAviso.disabled = false;
        }
    },

    deleteAviso: async (id) => {
        if(!confirm("Tem certeza que deseja APAGAR este comunicado permanentemente?")) return;
        try {
            await deleteDoc(doc(db, "avisos_colegio", id));
            window.profAPI.loadAvisosList();
        } catch(e) { alert("Erro ao excluir: " + e.message); }
    },

    // ==========================================
    // MÓDULO: RESET ANUAL (BACKUP & WIPE)
    // ==========================================
    
    // Logger Visual do Console
    logReset: (msg, type = 'info') => {
        const div = document.createElement('div');
        const time = new Date().toLocaleTimeString();
        
        if (type === 'info') div.className = "text-blue-400";
        if (type === 'success') div.className = "text-green-400 font-bold";
        if (type === 'warning') div.className = "text-amber-400";
        if (type === 'error') div.className = "text-red-500 font-bold bg-red-900/20 p-1 rounded mt-1";
        
        div.innerHTML = `<span class="text-slate-600 mr-2">[${time}]</span> ${msg}`;
        els.resetLog.appendChild(div);
        els.resetLog.scrollTop = els.resetLog.scrollHeight;
    },

    // Função para processar grandes volumes em lotes sem estourar o limite do Firebase (500 docs/batch)
    processBatchChunked: async (docs, operationCallback, description) => {
        const CHUNK_SIZE = 450; 
        const total = docs.length;
        let processed = 0;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
            const chunk = docs.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            
            chunk.forEach(docSnapshot => {
                operationCallback(batch, docSnapshot);
            });

            await batch.commit();
            processed += chunk.length;
            
            const pct = Math.round((processed / total) * 100);
            els.resetProgress.style.width = `${pct}%`;
            window.profAPI.logReset(`> ${description}: Lote ${Math.ceil(i/CHUNK_SIZE)+1} finalizado (${processed}/${total})`);
        }
    },

    startAnnualReset: async () => {
        const year = els.resetYear.value;
        if (!year || year.length !== 4) return alert("Digite um ano de referência válido com 4 dígitos (ex: 2026).");

        // 1. Confirmação de Segurança Nível Máximo
        const inputCredential = prompt(`ATENÇÃO: PROTOCOLO DE RESET ANUAL\n\nEssa ação é irreversível e irá mover as notas e presenças de TODOS OS ALUNOS para o arquivo morto.\n\nDigite sua SENHA de administrador ou o Código Mestre para confirmar:`);
        
        if (!inputCredential) return; 

        els.btnStartReset.disabled = true;
        els.btnStartReset.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Verificando permissões...';

        try {
            // 2. Validação da Autenticação
            let authorized = false;
            // Código mestre hardcoded para fallback (do sistema antigo)
            if (inputCredential === "8pcapdoe6gdd") {
                authorized = true;
            } else {
                try {
                    const credential = EmailAuthProvider.credential(auth.currentUser.email, inputCredential);
                    await reauthenticateWithCredential(auth.currentUser, credential);
                    authorized = true;
                } catch (authErr) {
                    authorized = false;
                }
            }

            if (!authorized) throw new Error("Senha incorreta ou Código Mestre inválido. Acesso bloqueado.");

            // 3. Preparando o Console UI
            els.btnStartReset.classList.add('opacity-50', 'cursor-not-allowed');
            els.btnStartReset.innerHTML = '<i class="fas fa-radiation fa-spin mr-2"></i> OPERAÇÃO EM ANDAMENTO';
            els.resetConsole.classList.remove('hidden');
            els.resetConsole.classList.add('flex');
            els.resetLog.innerHTML = '';
            els.resetProgress.style.width = '0%';

            const notasBackupColl = `notas_backup_${year}`;
            const presencasBackupColl = `presencas_backup_${year}`;

            window.profAPI.logReset(`Acesso concedido. Iniciando Protocolo de Encerramento Letivo [${year}]...`, 'warning');

            // --- ETAPA 1: LEITURA GLOBAL ---
            window.profAPI.logReset("Buscando dados massivos para arquivamento...", 'info');
            const snapNotas = await getDocs(query(collection(db, "notas"))); 
            const snapPres = await getDocs(query(collection(db, "presencas"))); 
            const snapUsersReset = await getDocs(query(collection(db, "users"), where("Aluno", "==", true)));

            // --- ETAPA 2: BACKUP DE NOTAS ---
            if (!snapNotas.empty) {
                window.profAPI.logReset(`Arquivando ${snapNotas.size} documentos de notas...`, 'warning');
                await window.profAPI.processBatchChunked(snapNotas.docs, (batch, docSnap) => {
                    const ref = doc(db, notasBackupColl, docSnap.id);
                    batch.set(ref, docSnap.data());
                }, "Backup Notas");
            } else { window.profAPI.logReset("Nenhuma nota encontrada para backup.", 'info'); }

            // --- ETAPA 3: BACKUP DE PRESENÇAS ---
            if (!snapPres.empty) {
                window.profAPI.logReset(`Arquivando ${snapPres.size} registros de presença (diários)...`, 'warning');
                await window.profAPI.processBatchChunked(snapPres.docs, (batch, docSnap) => {
                    const ref = doc(db, presencasBackupColl, docSnap.id);
                    batch.set(ref, docSnap.data());
                }, "Backup Presenças");
            } else { window.profAPI.logReset("Nenhuma chamada encontrada para backup.", 'info'); }

            // --- ETAPA 4: WIPE (LIMPEZA OFICIAL) ---
            window.profAPI.logReset("Aviso: Excluindo bases de dados originais...", 'error');
            if (!snapNotas.empty) {
                await window.profAPI.processBatchChunked(snapNotas.docs, (batch, docSnap) => {
                    batch.delete(docSnap.ref);
                }, "Limpeza Pauta de Notas");
            }
            if (!snapPres.empty) {
                await window.profAPI.processBatchChunked(snapPres.docs, (batch, docSnap) => {
                    batch.delete(docSnap.ref);
                }, "Limpeza Diários de Classe");
            }

            // --- ETAPA 5: RESET DOS PERFIS DE ALUNOS ---
            if (!snapUsersReset.empty) {
                window.profAPI.logReset(`Desvinculando turmas de ${snapUsersReset.size} perfis de alunos...`, 'warning');
                await window.profAPI.processBatchChunked(snapUsersReset.docs, (batch, docSnap) => {
                    batch.update(docSnap.ref, {
                        turma: "",            // Limpa turma
                        disciplinas: {},      // Limpa matérias
                        lastAnnualReset: serverTimestamp() 
                    });
                }, "Atualização de Perfis");
                window.profAPI.logReset("Vínculos removidos. Perfis dos alunos preservados.", 'success');
            }

            // --- FIM ---
            window.profAPI.logReset("===========================================", 'success');
            window.profAPI.logReset("PROTOCOLOS DE ENCERRAMENTO CONCLUÍDOS COM SUCESSO!", 'success');
            
            setTimeout(() => {
                alert("Reset Anual finalizado!\n\n1. Notas e Presenças de todas as turmas foram arquivadas.\n2. Alunos foram desvinculados para o novo ano.\n3. Perfis e títulos foram preservados.\n\nA página será recarregada por segurança.");
                location.reload(); 
            }, 1000);

        } catch (e) {
            console.error(e);
            window.profAPI.logReset(`ERRO FATAL ABORTANDO PROCESSO: ${e.message}`, 'error');
            alert(`Falha Crítica: ${e.message}`);
            els.btnStartReset.disabled = false;
            els.btnStartReset.classList.remove('opacity-50', 'cursor-not-allowed');
            els.btnStartReset.innerHTML = '<i class="fas fa-radiation mr-2 text-lg"></i> Iniciar Processo de Reset';
        }
    },

    // ==========================================
    // MÓDULO: AVALIAÇÃO 360 CONTÍNUA
    // ==========================================
    
    // Variável interna para guardar a lista carregada
    cacheAvaliacoes360: [],

    loadAvaliacoes360: async () => {
        // Busca direta para evitar falha no mapearDOM
        const container = document.getElementById('aval360-list-container');
        if (!container) return console.error("ERRO: Container da lista 360 não encontrado no HTML.");

        const { classId, disciplineId } = state.filters;
        if (!classId || !disciplineId) {
            container.innerHTML = '<div class="text-slate-500 text-sm italic col-span-full text-center py-10">Selecione Turma e Disciplina no Menu Master para carregar.</div>';
            return;
        }

        container.innerHTML = '<div class="text-blue-400 text-sm col-span-full text-center py-10"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando avaliações...</div>';

        try {
            const q = query(
                collection(db, "avaliacoes_360"), 
                where("turmaId", "==", classId),
                where("disciplinaId", "==", disciplineId)
            );
            
            const snap = await getDocs(q);
            window.profAPI.cacheAvaliacoes360 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            window.profAPI.renderAvaliacoes360List();
        } catch (e) {
            console.error("Erro ao buscar avaliações 360:", e);
            container.innerHTML = `<div class="text-red-500 text-sm col-span-full text-center py-10">Erro ao carregar dados: ${e.message}</div>`;
        }
    },

    renderAvaliacoes360List: () => {
        const container = document.getElementById('aval360-list-container');
        if (!container) return;

        if (window.profAPI.cacheAvaliacoes360.length === 0) {
            container.innerHTML = '<div class="text-slate-500 text-sm italic col-span-full text-center py-10">Nenhuma avaliação cadastrada para esta turma.</div>';
            return;
        }

        const coresStatus = {
            'Identificado': 'bg-red-500/20 text-red-400 border-red-500/30',
            'Em evolução': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            'Crescimento': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            'Alcançado': 'bg-green-500/20 text-green-400 border-green-500/30'
        };

        const iconesStatus = {
            'Identificado': 'fa-exclamation-circle',
            'Em evolução': 'fa-arrow-up',
            'Crescimento': 'fa-chart-line',
            'Alcançado': 'fa-check-circle'
        };

        container.innerHTML = window.profAPI.cacheAvaliacoes360.map(av => `
            <div onclick="window.profAPI.openModalAval360('${av.id}')" class="bg-slate-800 border border-slate-700 rounded-xl p-5 cursor-pointer hover:-translate-y-1 hover:border-blue-500 transition-all flex flex-col h-full shadow-md group">
                <div class="flex justify-between items-start mb-3">
                    <div class="text-xs text-slate-400 font-bold uppercase tracking-widest truncate pr-2"><i class="fas fa-user text-blue-500 mr-1"></i> ${av.alunoNome}</div>
                    <span class="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded border whitespace-nowrap ${coresStatus[av.status] || coresStatus['Identificado']}"><i class="fas ${iconesStatus[av.status] || iconesStatus['Identificado']} mr-1"></i> ${av.status}</span>
                </div>
                <h4 class="text-white font-bold text-sm mb-2">${av.quesito}</h4>
                <p class="text-slate-500 text-xs line-clamp-3 leading-relaxed flex-grow">${av.textoExplicativo}</p>
                <div class="text-right mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Atualizar <i class="fas fa-arrow-right ml-1"></i></span>
                </div>
            </div>
        `).join('');
    },

    openModalAval360: (id = null) => {
        const { classId } = state.filters;
        if (!classId) return alert("Selecione uma Turma no Menu Master primeiro!");

        const modal = document.getElementById('modal-aval360');
        const selAluno = document.getElementById('aval360-aluno');
        const inpId = document.getElementById('aval360-id');
        const inpQuesito = document.getElementById('aval360-quesito');
        const inpStatus = document.getElementById('aval360-status');
        const inpTexto = document.getElementById('aval360-texto');
        const btnDel = document.getElementById('btn-delete-aval360');
        const title = document.getElementById('aval360-modal-title');

        // Popula o select de alunos
        selAluno.innerHTML = '<option value="">Selecione um aluno da turma...</option>';
        state.cache.students.forEach(st => selAluno.add(new Option(st.nome, st.id)));

        if (id) {
            const av = window.profAPI.cacheAvaliacoes360.find(x => x.id === id);
            if (!av) return;
            title.textContent = "Atualizar Evolução do Aluno";
            inpId.value = av.id;
            selAluno.value = av.alunoId;
            inpQuesito.value = av.quesito;
            inpStatus.value = av.status;
            inpTexto.value = av.textoExplicativo;
            btnDel.classList.remove('hidden');
        } else {
            title.textContent = "Nova Avaliação 360";
            inpId.value = '';
            selAluno.value = '';
            inpQuesito.value = '';
            inpStatus.value = 'Identificado';
            inpTexto.value = '';
            btnDel.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    },

    closeModalAval360: () => {
        const modal = document.getElementById('modal-aval360');
        if(modal) modal.classList.add('hidden');
    },

    saveAvaliacao360: async () => {
        const { classId, disciplineId } = state.filters;
        
        const id = document.getElementById('aval360-id').value;
        const selAluno = document.getElementById('aval360-aluno');
        const alunoId = selAluno.value;
        const quesito = document.getElementById('aval360-quesito').value.trim();
        const status = document.getElementById('aval360-status').value;
        const texto = document.getElementById('aval360-texto').value.trim();

        if (!alunoId || !quesito || !texto) return alert("Preencha o Aluno, o Quesito e o Parecer descritivo.");

        const alunoNome = selAluno.options[selAluno.selectedIndex].text;

        const payload = {
            alunoId,
            alunoNome,
            turmaId: classId,
            disciplinaId: disciplineId,
            professorUid: auth.currentUser.uid,
            quesito,
            status,
            textoExplicativo: texto,
            dataAtualizacao: serverTimestamp()
        };

        try {
            if (id) {
                await updateDoc(doc(db, "avaliacoes_360", id), payload);
            } else {
                payload.dataCriacao = serverTimestamp();
                await addDoc(collection(db, "avaliacoes_360"), payload);
            }
            
            window.profAPI.closeModalAval360();
            window.profAPI.loadAvaliacoes360(); 
        } catch (e) {
            console.error("Erro ao salvar:", e);
            alert("Erro ao salvar avaliação.");
        }
    },

    deleteAvaliacao360: async () => {
        const id = document.getElementById('aval360-id').value;
        if (!id) return;

        if (confirm("Deseja realmente apagar este registro de avaliação?")) {
            try {
                await deleteDoc(doc(db, "avaliacoes_360", id));
                window.profAPI.closeModalAval360();
                window.profAPI.loadAvaliacoes360();
            } catch (e) {
                console.error("Erro ao excluir:", e);
                alert("Erro ao excluir avaliação.");
            }
        }
    },

    // ==========================================
    // MÓDULO: LOGS DE USUÁRIO
    // ==========================================
    
    // 1. Função que injeta os alunos no Select antes de buscar
    prepararAbaLogs: () => {
        const selAluno = document.getElementById('log-student-select');
        if(selAluno && state.cache.students) {
            selAluno.innerHTML = '<option value="">Selecione um aluno da turma...</option>';
            state.cache.students.forEach(st => selAluno.add(new Option(st.nome, st.id)));
        }
        window.profAPI.loadLogsAluno(); // Chama a pesquisa (se estiver vazio, pedirá para selecionar)
    },

    // 2. A pesquisa real
    loadLogsAluno: async () => {
        const selAluno = document.getElementById('log-student-select');
        const logsBody = document.getElementById('logs-list-body');
        
        if (!logsBody) return;

        const studentId = selAluno ? selAluno.value : null;
        
        if (!studentId) {
            logsBody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-slate-500 italic">Selecione um aluno no seletor acima para carregar os logs.</td></tr>';
            return;
        }

        logsBody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-blue-400"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando histórico de ações...</td></tr>';

        try {
            const q = query(
                collection(db, "logs_usuarios"),
                where("uid", "==", studentId),
                orderBy("timestamp", "desc"),
                limit(50)
            );
            
            const snap = await getDocs(q);
            
            if (snap.empty) {
                logsBody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-slate-500 italic">Nenhuma atividade registrada para este aluno.</td></tr>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                let dataFormatada = 'Sem data';
                    if (data.timestamp) {
                        // Tenta usar a função nativa do Firebase (toDate), se falhar, converte via JavaScript normal
                        dataFormatada = typeof data.timestamp.toDate === 'function' 
                            ? data.timestamp.toDate().toLocaleString('pt-BR') 
                            : new Date(data.timestamp).toLocaleString('pt-BR');
                    }
                
                html += `
                    <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                        <td class="px-6 py-4 font-mono text-xs text-emerald-400 whitespace-nowrap w-48">${dataFormatada}</td>
                        <td class="px-6 py-4 font-bold text-white whitespace-nowrap w-48">${data.acao}</td>
                        <td class="px-6 py-4 text-xs text-slate-400 leading-relaxed">${data.detalhes || '-'}</td>
                    </tr>
                `;
            });

            logsBody.innerHTML = html;

        } catch (error) {
            console.error("Erro ao buscar logs:", error);
            
            if(error.message.includes("index")) {
                logsBody.innerHTML = `<tr><td colspan="3" class="px-6 py-10 text-center text-amber-500 text-xs bg-amber-500/10 rounded-lg">
                    <i class="fas fa-exclamation-triangle text-xl mb-2 block"></i> 
                    O Firebase exige a criação de um "Índice" para cruzar o Usuário com a Data da Ação.<br><br>
                    <strong>Aperte F12 para abrir o console, clique no link azul gerado pelo Firebase no erro e crie o índice!</strong>
                </td></tr>`;
            } else {
                logsBody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-red-500">Erro ao carregar o histórico. Tente novamente.</td></tr>';
            }
        }
    }

};