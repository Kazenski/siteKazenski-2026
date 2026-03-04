// ARQUIVO: js/alunoTech/perfilTech.js
import { db, storage, auth } from '../core/firebase.js';
import { 
    doc, getDoc, collection, query, where, orderBy, getDocs, 
    updateDoc, serverTimestamp, Timestamp, onSnapshot, addDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

// --- ESTADO INTERNO ---
let currentUser = null;
let disciplineMap = {}; 
let chartInstances = {};
let studentGradesData = null; 
let els = {}; // Cache de Elementos DOM

// Controles de Sub-Abas e Módulos
let notesUnsubscribe = null;
let kanbanUnsub = null;
let myNotes = [];
let currentTagFilter = 'all';
let currentPage = 1;
const itemsPerPage = 12;
const noteColors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#eab308', '#64748b'];
let selectedNoteColor = noteColors[0];
let formIsPinned = false;
let draggedTask = null;
let calDate = new Date();
let calEvents = [];
let calView = 'month';

export async function renderAlunoTechTab() {
    const container = document.getElementById('aluno-tech-content');
    if (!container) return;

    // Carrega Chart.js dinamicamente se não existir
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        document.head.appendChild(script);
    }

    // Estrutura HTML das 9 Sub-Abas + Perfil
    container.innerHTML = `
        <div id="loading-aluno" class="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100]">
            <div class="aluno-spinner"></div>
            <p class="text-blue-500 font-cinzel tracking-widest mt-4">Sincronizando Mente...</p>
        </div>

        <div id="dashboard-aluno" class="w-full h-full flex flex-col overflow-y-auto custom-scroll bg-slate-950 hidden">
            
            <div class="w-full flex flex-col flex-grow relative">
                
                <div class="banner-wrapper rounded-none mb-0">
                    <div class="cover-photo cursor-pointer" id="al-bg-cover">
                        <div class="cover-overlay"></div>
                        <button class="edit-btn btn-cover" onclick="document.getElementById('al-file-cover').click()"><i class="fas fa-camera"></i></button>
                        <button class="edit-btn btn-border" onclick="document.getElementById('al-input-color').click()"><i class="fas fa-palette"></i></button>
                    </div>
                    
                    <div class="header-content px-6 md:px-20 pb-6 flex flex-col md:flex-row items-center md:items-end gap-6 w-full">
                        <div class="profile-area shrink-0">
                            <img src="" id="al-img-profile" class="profile-img cursor-pointer" onclick="document.getElementById('al-file-profile').click()">
                            <button class="edit-btn btn-profile" onclick="document.getElementById('al-file-profile').click()"><i class="fas fa-camera"></i></button>
                        </div>
                        <div class="student-info text-center md:text-left mb-4 md:mb-0">
                            <div id="al-badge-title" class="student-title-badge cursor-pointer" onclick="window.perfilTech.toggleTitleSelect()">Aspirante</div>
                            <select id="al-title-select" class="hidden bg-slate-800 text-white rounded p-1 text-xs border border-blue-500" onchange="window.perfilTech.saveTitle(this.value)"></select>
                            <h1 class="student-name text-4xl md:text-5xl font-black font-cinzel mt-2 drop-shadow-md" id="al-txt-name">---</h1>
                            <div class="student-class text-blue-400 font-bold mt-1" id="al-txt-class">---</div>
                        </div>
                    </div>
                </div>

                <input type="file" id="al-file-cover" class="hidden" onchange="window.perfilTech.handleUpload(this, 'cover')">
                <input type="file" id="al-file-profile" class="hidden" onchange="window.perfilTech.handleUpload(this, 'profile')">
                <input type="color" id="al-input-color" class="hidden" onchange="window.perfilTech.saveBorderColor(this.value)">

                <nav class="aluno-tabs-nav no-scrollbar">
                    <button class="aluno-tab-btn active" onclick="window.perfilTech.switchTab('avisos')"><i class="fas fa-bullhorn"></i> Mural</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('boletim')"><i class="fas fa-file-invoice"></i> Boletim</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('frequencia')"><i class="fas fa-calendar-check"></i> Frequência</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('metricas')"><i class="fas fa-chart-line"></i> Métricas</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('avaliacao360')"><i class="fas fa-users-viewfinder"></i> Avaliação 360</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('caderno')"><i class="fas fa-book"></i> Caderno</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('kanban')"><i class="fas fa-columns"></i> Kanban</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('horario')"><i class="fas fa-clock"></i> Horário</button>
                    <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('calendario')"><i class="fas fa-calendar-alt"></i> Calendário</button>
                </nav>

                <div class="px-6 md:px-20 py-10 pb-32"> <div id="atab-avisos" class="aluno-tab-content active"><div id="al-avisos-list" class="space-y-4"></div></div>
                    
                    <div id="atab-boletim" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-6 rounded-xl border border-slate-800 overflow-x-auto">
                            <table class="boletim-table min-w-[900px]">
                                <thead>
                                    <tr><th rowspan="2">Disciplina</th><th colspan="4">1º Trim</th><th colspan="4">2º Trim</th><th colspan="4">3º Trim</th><th rowspan="2">Média</th></tr>
                                    <tr><th>N1</th><th>N2</th><th>N3</th><th>N4</th><th>N1</th><th>N2</th><th>N3</th><th>N4</th><th>N1</th><th>N2</th><th>N3</th><th>N4</th></tr>
                                </thead>
                                <tbody id="al-boletim-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="atab-frequencia" class="aluno-tab-content">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="bg-slate-900 p-10 rounded-xl border border-slate-800 text-center">
                                <h4 class="text-xs font-bold text-slate-500 uppercase mb-4">Presença</h4>
                                <div id="al-freq-perc" class="text-6xl font-black text-green-400">100%</div>
                                <div id="al-freq-total" class="text-red-500 mt-4 font-bold">0 Faltas</div>
                            </div>
                            <div class="bg-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-center"><canvas id="al-chart-freq"></canvas></div>
                        </div>
                    </div>

                    <div id="atab-metricas" class="aluno-tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="bg-slate-900 p-6 rounded-xl border border-slate-800"><canvas id="al-chart-scatter"></canvas></div>
                            <div class="bg-slate-900 p-6 rounded-xl border border-slate-800">
                                <select id="al-sel-evol" class="mb-4 bg-slate-950 text-white text-xs p-2 rounded" onchange="window.perfilTech.updateEvolChart(this.value)"></select>
                                <canvas id="al-chart-evol"></canvas>
                            </div>
                        </div>
                    </div>

                    <div id="atab-avaliacao360" class="aluno-tab-content">
                        <div id="al-eval-360-content" class="bg-slate-900 p-10 rounded-xl border border-dashed border-slate-700 text-center text-slate-500">Nenhuma avaliação pendente.</div>
                    </div>

                    <div id="atab-caderno" class="aluno-tab-content">
                        <div class="flex flex-wrap gap-4 items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 mb-6">
                            <div id="al-note-tags" class="flex gap-2 overflow-x-auto no-scrollbar"></div>
                            <div class="flex gap-2">
                                <input type="text" id="al-note-search" placeholder="Buscar..." class="bg-slate-950 border border-slate-700 rounded-full px-4 py-2 text-sm text-white outline-none">
                                <button onclick="window.perfilTech.toggleNoteForm()" class="bg-blue-600 text-white px-6 py-2 rounded-full font-bold shadow-lg transition hover:scale-105"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                        <div id="al-note-form" class="note-form-panel hidden mb-6">
                            <input type="hidden" id="al-note-id">
                            <div class="flex justify-between mb-4"><input type="text" id="al-note-title" placeholder="Título" class="bg-transparent border-b border-slate-700 w-full text-white text-2xl font-bold outline-none"></div>
                            <textarea id="al-note-body" class="bg-slate-950 p-4 rounded-xl w-full text-slate-300 min-h-[200px] outline-none" placeholder="O que você está pensando?"></textarea>
                            <div class="flex flex-wrap gap-4 items-center mt-4">
                                <input type="text" id="al-note-tags-inp" placeholder="Tags..." class="bg-slate-950 border border-slate-700 p-2 rounded text-sm text-white">
                                <div id="al-color-picker" class="flex gap-2"></div>
                                <button onclick="window.perfilTech.saveNote()" class="ml-auto bg-green-600 text-white px-8 py-2 rounded font-bold">Salvar</button>
                            </div>
                        </div>
                        <div id="al-notes-grid" class="grid grid-cols-1 md:grid-cols-3 gap-6"></div>
                    </div>

                    <div id="atab-kanban" class="aluno-tab-content">
                        <div class="flex justify-end mb-6"><button onclick="window.perfilTech.toggleKanbanForm()" class="bg-purple-600 text-white px-6 py-2 rounded-full font-bold shadow-lg">+ Tarefa</button></div>
                        <div id="al-kanban-form" class="note-form-panel hidden border-purple-500 mb-8">
                            <input type="hidden" id="al-kanban-id"><input type="text" id="al-kanban-title" placeholder="Tarefa" class="bg-transparent border-b border-slate-700 w-full text-white text-xl font-bold outline-none"><textarea id="al-kanban-body" class="bg-slate-950 p-4 rounded-xl w-full text-slate-300 min-h-[100px] outline-none mt-4"></textarea>
                            <button onclick="window.perfilTech.saveKanban()" class="mt-4 bg-green-600 text-white px-8 py-2 rounded font-bold">Adicionar</button>
                        </div>
                        <div class="kanban-board">
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'a_fazer')"><div class="kanban-column-header">A FAZER</div><div id="al-col-todo" class="kanban-cards-area"></div></div>
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'em_progresso')"><div class="kanban-column-header">EM EXECUÇÃO</div><div id="al-col-doing" class="kanban-cards-area"></div></div>
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'concluido')"><div class="kanban-column-header">FEITO</div><div id="al-col-done" class="kanban-cards-area"></div></div>
                        </div>
                    </div>

                    <div id="atab-horario" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
                            <table class="horario-tabela"><thead><tr><th data-dia-id="segunda-feira">SEG</th><th data-dia-id="terca-feira">TER</th><th data-dia-id="quarta-feira">QUA</th><th data-dia-id="quinta-feira">QUI</th><th data-dia-id="sexta-feira">SEX</th></tr></thead>
                            <tbody><tr><td id="cell-segunda-feira"></td><td id="cell-terca-feira"></td><td id="cell-quarta-feira"></td><td id="cell-quinta-feira"></td><td id="cell-sexta-feira"></td></tr></tbody></table>
                            <p id="al-horario-msg" class="text-center text-slate-500 mt-6 italic">Carregando grade horária...</p>
                        </div>
                    </div>

                    <div id="atab-calendario" class="aluno-tab-content">
                        <div class="calendar-controls flex justify-between items-center mb-6">
                            <div class="flex items-center gap-4"><button onclick="window.perfilTech.changeCalMonth(-1)" class="p-2 bg-slate-800 rounded hover:bg-slate-700">&lt;</button><span id="al-cal-month" class="font-bold text-white uppercase font-cinzel text-lg">---</span><button onclick="window.perfilTech.changeCalMonth(1)" class="p-2 bg-slate-800 rounded hover:bg-slate-700">&gt;</button></div>
                            <button id="al-btn-add-evt" class="hidden bg-green-600 text-white px-4 py-2 rounded text-xs font-bold" onclick="window.perfilTech.openCalModal()">+ EVENTO</button>
                        </div>
                        <div id="al-cal-grid" class="calendar-grid"></div>
                    </div>

                </div>
            </div>
        </div>

        <div id="al-modal-cal" class="cal-modal" style="display: none;">
            <div class="cal-modal-content">
                <span class="cal-close" onclick="window.perfilTech.closeCalModal()">&times;</span>
                <h3 class="text-blue-500 font-cinzel font-bold mb-4">Novo Evento</h3>
                <input type="text" id="al-ev-title" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white mb-3" placeholder="Título">
                <input type="date" id="al-ev-date" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white mb-3">
                <textarea id="al-ev-desc" rows="3" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white mb-3" placeholder="Descrição"></textarea>
                <div class="flex justify-end gap-3 pt-4 border-t border-slate-800"><button id="al-btn-del-ev" onclick="window.perfilTech.deleteCalendarEvent()" class="hidden bg-red-900 text-white px-4 py-2 rounded text-xs">Excluir</button><button onclick="window.perfilTech.saveCalendarEvent()" class="bg-green-600 text-white px-6 py-2 rounded font-bold">Salvar</button></div>
            </div>
        </div>
    `;

    mapearDOM();

    if (auth.currentUser) {
        initDashboard(auth.currentUser);
    } else {
        const unsub = auth.onAuthStateChanged(user => {
            if (user) initDashboard(user);
            else window.showTab('inicio');
        });
    }
}

function mapearDOM() {
    els = {
        loading: document.getElementById('loading-aluno'),
        dashboard: document.getElementById('dashboard-aluno'),
        txtName: document.getElementById('al-txt-name'),
        txtClass: document.getElementById('al-txt-class'),
        imgProfile: document.getElementById('al-img-profile'),
        bgCover: document.getElementById('al-bg-cover'),
        badgeTitle: document.getElementById('al-badge-title'),
        selTitle: document.getElementById('al-title-select'),
        avisosList: document.getElementById('al-avisos-list'),
        boletimBody: document.getElementById('al-boletim-body'),
        noteTags: document.getElementById('al-note-tags'),
        noteSearch: document.getElementById('al-note-search'),
        noteGrid: document.getElementById('al-notes-grid'),
        noteForm: document.getElementById('al-note-form'),
        noteTitle: document.getElementById('al-note-title'),
        noteBody: document.getElementById('al-note-body'),
        noteTagsInp: document.getElementById('al-note-tags-inp'),
        colTodo: document.getElementById('al-col-todo'),
        colDoing: document.getElementById('al-col-doing'),
        colDone: document.getElementById('al-col-done'),
        freqPerc: document.getElementById('al-freq-perc'),
        freqTotal: document.getElementById('al-freq-total'),
        horarioMsg: document.getElementById('al-horario-msg'),
        selEvol: document.getElementById('al-sel-evol')
    };
}

async function initDashboard(user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) return;
    currentUser = { uid: user.uid, ...userDoc.data() };

    els.loading.classList.add('hidden');
    els.dashboard.classList.remove('hidden');

    renderBanner();
    await loadDisciplinesMap();
    loadAvisos();
    await loadBoletimAndMetrics();
    loadFrequencia();
    initNotebookSystem();
    initKanbanSystem();
    loadHorarioEscolar();
    initCalendarSystem();
}

// ============================================================================
// MÓDULOS GLOBAIS EXPOSTOS (window.perfilTech)
// ============================================================================

window.perfilTech = {
    switchTab: (id) => {
        // 1. Remove active de todos os botões do menu
        document.querySelectorAll('.aluno-tab-btn').forEach(b => b.classList.remove('active'));
        
        // 2. Acha o botão clicado e adiciona active
        const activeBtn = Array.from(document.querySelectorAll('.aluno-tab-btn'))
            .find(b => b.getAttribute('onclick').includes(id));
        if(activeBtn) activeBtn.classList.add('active');

        // 3. Esconde todos os conteúdos
        document.querySelectorAll('.aluno-tab-content').forEach(c => c.classList.remove('active'));
        
        // 4. Mostra o conteúdo correto
        document.getElementById(`atab-${id}`).classList.add('active');
        
        // 5. Redimensiona os gráficos caso a aba clicada os contenha
        if(id==='metricas'||id==='frequencia') {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        }
    },

    toggleTitleSelect: () => {
        els.badgeTitle.classList.add('hidden');
        els.selTitle.classList.remove('hidden');
        els.selTitle.focus();
    },

    saveTitle: async (val) => {
        const titles = { ...currentUser.titulosConquistados };
        Object.keys(titles).forEach(k => titles[k].tituloAtivadoUser = (k === val));
        await updateDoc(doc(db, "users", currentUser.uid), { titulosConquistados: titles });
        currentUser.titulosConquistados = titles;
        els.selTitle.classList.add('hidden');
        els.badgeTitle.classList.remove('hidden');
        renderBanner();
    },

    saveBorderColor: async (val) => {
        els.imgProfile.style.borderColor = val;
        els.imgProfile.style.boxShadow = `0 0 20px ${val}`;
        await updateDoc(doc(db, "users", currentUser.uid), { profileBorderColor: val });
    },

    handleUpload: (input, type) => { if(input.files[0]) uploadImage(input.files[0], type); },

    // Caderno Digital
    toggleNoteForm: () => els.noteForm.classList.toggle('hidden'),
    saveNote: async () => {
        const payload = { titulo: els.noteTitle.value, conteudo: els.noteBody.value, userId: currentUser.uid, color: selectedNoteColor, favorita: formIsPinned, updatedAt: serverTimestamp(), tags: els.noteTagsInp.value.split(',').map(t=>t.trim()) };
        const id = document.getElementById('al-note-id').value;
        if(id) await updateDoc(doc(db, "anotacoes_pessoais", id), payload); else await addDoc(collection(db, "anotacoes_pessoais"), payload);
        window.perfilTech.toggleNoteForm();
    },
    editNote: (n) => { window.perfilTech.toggleNoteForm(); document.getElementById('al-note-id').value=n.id; els.noteTitle.value=n.titulo; els.noteBody.value=n.conteudo; },
    deleteNote: async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, "anotacoes_pessoais", id)); },
    togglePin: async (id, val) => { await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: !!val }); },
    selectColor: (c) => { selectedNoteColor = c; els.noteForm.style.borderLeft = `5px solid ${c}`; },
    setNoteTag: (t) => { currentTagFilter = t; renderNotes(); },

    // Kanban
    toggleKanbanForm: () => document.getElementById('al-kanban-form').classList.toggle('hidden'),
    saveKanban: async () => {
        const p = { titulo: document.getElementById('al-kanban-title').value, conteudo: document.getElementById('al-kanban-body').value, userIdCriador: currentUser.uid, status: 'a_fazer', createdAt: serverTimestamp() };
        await addDoc(collection(db, "kanban_atividades"), p); window.perfilTech.toggleKanbanForm();
    },
    allowDrop: (e) => e.preventDefault(),
    drop: async (e, status) => {
        const id = e.dataTransfer.getData("text/plain");
        await updateDoc(doc(db, "kanban_atividades", id), { status, updatedAt: serverTimestamp() });
    },

    updateEvolChart: (val) => renderEvolutionChart(val),

    // Calendário - COMPLETO
    openCalModal: (ev=null, dt=null) => {
        document.getElementById('al-modal-cal').style.display='flex';
        if(ev) { 
            document.getElementById('al-ev-id').value = ev.id; 
            document.getElementById('al-ev-title').value = ev.titulo; 
            document.getElementById('al-ev-date').value = ev.dataInicio?.toDate().toISOString().split('T')[0]; 
            document.getElementById('al-ev-desc').value = ev.descricao || '';
            document.getElementById('al-btn-del-ev').classList.remove('hidden');
        } else {
            document.getElementById('al-ev-id').value = ''; 
            document.getElementById('al-ev-title').value = ''; 
            document.getElementById('al-ev-date').value = dt || new Date().toISOString().split('T')[0];
            document.getElementById('al-ev-desc').value = '';
            document.getElementById('al-btn-del-ev').classList.add('hidden');
        }
    },
    closeCalModal: () => document.getElementById('al-modal-cal').style.display='none',
    changeCalMonth: (dir) => { calDate.setMonth(calDate.getMonth() + dir); fetchCalendarEvents(); },
    switchCalView: (v) => { calView = v; window.renderCalendarGrid(); },
    saveCalendarEvent: async () => { 
        const title = document.getElementById('al-ev-title').value;
        const dateVal = document.getElementById('al-ev-date').value;
        const desc = document.getElementById('al-ev-desc').value;
        
        if(!title || !dateVal) return alert("Título e Data são obrigatórios");
        const [y, m, d] = dateVal.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);

        const payload = {
            titulo: title,
            dataInicio: Timestamp.fromDate(dateObj),
            descricao: desc,
            visibilidade: 'todos',
            instrutorUID: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        const id = document.getElementById('al-ev-id').value;
        if(id) await updateDoc(doc(db, "calendarioAnual", id), payload); 
        else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, "calendarioAnual"), payload); }
        
        window.perfilTech.closeCalModal(); 
        fetchCalendarEvents();
    },
    deleteCalendarEvent: async () => { 
        const id = document.getElementById('al-ev-id').value;
        if(id && confirm("Excluir evento?")) {
            await deleteDoc(doc(db, "calendarioAnual", id));
            window.perfilTech.closeCalModal(); 
            fetchCalendarEvents();
        }
    }
};

// ============================================================================
// LOGICAS AUXILIARES 
// ============================================================================

async function loadDisciplinesMap() {
    const snap = await getDocs(collection(db, "disciplinasCadastradas"));
    els.selEvol.innerHTML = '<option value="">Geral</option>';
    snap.forEach(d => { 
        const dt = d.data(); 
        disciplineMap[dt.identificador] = dt.nomeExibicao; 
        els.selEvol.add(new Option(dt.nomeExibicao, dt.identificador)); 
    });
}

async function loadAvisos() {
    const q = query(collection(db, "avisos_colegio"), where("turmasRelacionadas", "array-contains", currentUser.turma || 'Geral'), orderBy("dataCriacao", "desc"));
    const snap = await getDocs(q);
    els.avisosList.innerHTML = snap.docs.map(d => `<div class="aviso-item p-4 bg-slate-900 border-l-4 border-blue-500 rounded-lg"><div class="text-xs text-slate-500 mb-1">${d.data().autor}</div><div class="text-white text-sm">${escapeHTML(d.data().mensagem)}</div></div>`).join('');
}

async function loadBoletimAndMetrics() {
    const snap = await getDoc(doc(db, "notas", currentUser.uid));
    if(!snap.exists()) { els.boletimBody.innerHTML = '<tr><td colspan="14" class="p-8 text-center text-slate-500 italic">Sem notas.</td></tr>'; return; }
    studentGradesData = snap.data().disciplinasComNotas || {};
    
    let html = '';
    for(const [id, tr] of Object.entries(studentGradesData)) {
        html += `<tr><td class="font-bold text-white text-xs p-3">${disciplineMap[id]||id}</td><td>${tr['1']?.nota1||'-'}</td><td>${tr['1']?.nota2||'-'}</td><td>${tr['1']?.nota3||'-'}</td><td>${tr['1']?.nota4||'-'}</td><td>${tr['2']?.nota1||'-'}</td><td>${tr['2']?.nota2||'-'}</td><td>${tr['2']?.nota3||'-'}</td><td>${tr['2']?.nota4||'-'}</td><td>${tr['3']?.nota1||'-'}</td><td>${tr['3']?.nota2||'-'}</td><td>${tr['3']?.nota3||'-'}</td><td>${tr['3']?.nota4||'-'}</td><td class="media-final-col text-blue-500 font-bold">---</td></tr>`;
    }
    els.boletimBody.innerHTML = html;
    
    // Inicia os gráficos
    renderScatterChart();
    renderEvolutionChart();
}

async function loadFrequencia() {
    if(!currentUser.turma) return;
    const q = query(collection(db, "presencas"), where("turma", "==", currentUser.turma));
    const snap = await getDocs(q);
    let p=0, f=0;
    snap.forEach(d => { const reg = d.data().registros || {}; if(reg[currentUser.uid]==='presente') p++; else if(reg[currentUser.uid]==='ausente') f++; });
    const total = p+f;
    const perc = total > 0 ? Math.round((p/total)*100) : 100;
    els.freqPerc.textContent = `${perc}%`;
    els.freqTotal.textContent = `${f} Faltas`;

    // Gráfico de Frequência
    if(chartInstances['freq']) chartInstances['freq'].destroy();
    const ctx = document.getElementById('al-chart-freq').getContext('2d');
    chartInstances['freq'] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Presente', 'Faltas'], datasets: [{ data: [p, f], backgroundColor: ['#4ade80', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } } }
    });
}

function renderScatterChart() {
    if(!studentGradesData) return;
    const pts = [];
    Object.entries(studentGradesData).forEach(([dId, tr]) => {
        ['1','2','3'].forEach(t => ['nota1','nota2','nota3','nota4'].forEach((k,i) => {
            const v = parseFloat((tr[t]||{})[k]);
            if(!isNaN(v)) pts.push({x: Math.random()*10, y: v, label: `${disciplineMap[dId]||dId} (T${t}-N${i+1})`});
        }));
    });
    const ctx = document.getElementById('al-chart-scatter').getContext('2d');
    if(chartInstances['scatter']) chartInstances['scatter'].destroy();
    chartInstances['scatter'] = new Chart(ctx, {
        type: 'scatter', data: { datasets: [{ label: 'Notas', data: pts, backgroundColor: c=>c.raw?.y>=6?'#4ade80':'#ef4444', pointRadius: 5 }] },
        options: { responsive:true, maintainAspectRatio:false, scales:{x:{display:false}, y:{min:0,max:10,grid:{color:'#334155'}}}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`${c.raw.label}: ${c.raw.y}`}}} }
    });
}

function renderEvolutionChart(discId = "") {
    if(!studentGradesData) return;
    let dVals = [];
    if(discId) {
        const tr = studentGradesData[discId]||{};
        ['1','2','3'].forEach(t => ['nota1','nota2','nota3','nota4'].forEach(k => { const v=parseFloat((tr[t]||{})[k]); dVals.push(isNaN(v)?null:v); }));
    } else {
        const s = Array(12).fill(0), c = Array(12).fill(0);
        Object.values(studentGradesData).forEach(tr => { let idx=0; ['1','2','3'].forEach(t => ['nota1','nota2','nota3','nota4'].forEach(k => { const v=parseFloat((tr[t]||{})[k]); if(!isNaN(v)){s[idx]+=v; c[idx]++;} idx++; })); });
        dVals = s.map((sm,i)=>c[i]?(sm/c[i]):null);
    }
    const ctx = document.getElementById('al-chart-evol').getContext('2d');
    if(chartInstances['evol']) chartInstances['evol'].destroy();
    chartInstances['evol'] = new Chart(ctx, {
        type: 'line', data: { labels: ['T1N1','T1N2','T1N3','T1N4','T2N1','T2N2','T2N3','T2N4','T3N1','T3N2','T3N3','T3N4'], datasets: [{ label: discId?(disciplineMap[discId]||discId):'Média', data: dVals, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)', fill: true, tension: 0.4 }] },
        options: { responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true,max:10,grid:{color:'#334155'}},x:{grid:{color:'#334155'}}} }
    });
}

function initNotebookSystem() {
    const q = query(collection(db, "anotacoes_pessoais"), where("userId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
    notesUnsubscribe = onSnapshot(q, snap => {
        myNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotes();
    });
    document.getElementById('al-color-picker').innerHTML = noteColors.map(c => `<div class="color-option" style="background-color:${c}; width:20px; height:20px; border-radius:50%; cursor:pointer;" onclick="window.perfilTech.selectColor('${c}')"></div>`).join('');
}

function renderNotes() {
    const search = els.noteSearch.value.toLowerCase();
    const filtered = myNotes.filter(n => (n.titulo||'').toLowerCase().includes(search) || (n.conteudo||'').toLowerCase().includes(search));
    els.noteGrid.innerHTML = filtered.map(n => `<div class="note-card p-4 bg-slate-900 border border-slate-800 rounded-xl" style="border-left: 5px solid ${n.color||'#3b82f6'}"><i class="fas fa-thumbtack note-pin ${n.favorita?'active':''}" onclick="window.perfilTech.togglePin('${n.id}', ${!n.favorita})"></i><h4 class="note-title text-white font-bold mb-2">${escapeHTML(n.titulo)}</h4><p class="note-body text-slate-400 text-xs line-clamp-3">${escapeHTML(n.conteudo)}</p><div class="note-footer mt-4 flex justify-end gap-2"><button onclick='window.perfilTech.editNote(${JSON.stringify(n).replace(/'/g, "&apos;")})' class="note-btn"><i class="fas fa-edit"></i></button><button onclick="window.perfilTech.deleteNote('${n.id}')" class="note-btn del"><i class="fas fa-trash"></i></button></div></div>`).join('');
}

function initKanbanSystem() {
    const q = query(collection(db, "kanban_atividades"), where("userIdCriador", "==", currentUser.uid));
    kanbanUnsub = onSnapshot(q, snap => {
        els.colTodo.innerHTML = ''; els.colDoing.innerHTML = ''; els.colDone.innerHTML = '';
        snap.docs.forEach(doc => {
            const t = doc.data(); const id = doc.id;
            const div = document.createElement('div'); div.className = 'kanban-card p-4 bg-slate-800 border border-slate-700 rounded-xl mb-3 cursor-grab shadow-lg'; div.draggable = true;
            div.innerHTML = `<div class="font-bold text-white text-sm">${escapeHTML(t.titulo)}</div>`;
            div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", id); draggedTask = {id, ...t}; };
            if(t.status==='a_fazer') els.colTodo.appendChild(div);
            else if(t.status==='em_progresso') els.colDoing.appendChild(div);
            else els.colDone.appendChild(div);
        });
    });
}

async function loadHorarioEscolar() {
    ['segunda', 'terca', 'quarta', 'quinta', 'sexta'].forEach(d => document.getElementById(`cell-${d}-feira`).innerHTML = '');
    const q = query(collection(db, "aulas"), where("turmaId", "==", currentUser.turma || '---'), orderBy("ordem"));
    const snap = await getDocs(q);
    els.horarioMsg.style.display = snap.empty ? 'block' : 'none';
    snap.forEach(doc => {
        const a = doc.data(); const cell = document.getElementById(`cell-${a.diaSemana}`);
        if(cell) cell.innerHTML += `<div class="aula-card p-3 bg-blue-900/10 border-l-4 border-blue-500 mb-3 rounded shadow-md"><h4 class="text-xs font-bold text-blue-100">${a.ordem}ª - ${disciplineMap[a.disciplina]||a.disciplina}</h4><p class="text-[10px] text-slate-500 mt-1">${a.professorNome}</p></div>`;
    });
}

async function initCalendarSystem() {
    const isStaff = currentUser.Admin || currentUser.Professor;
    if(isStaff) document.getElementById('al-btn-add-evt').classList.remove('hidden');
    fetchCalendarEvents();
}

async function fetchCalendarEvents() {
    const q = query(collection(db, "calendarioAnual"), where("visibilidade", "==", "todos"));
    const snap = await getDocs(q);
    calEvents = snap.docs.map(d => ({id: d.id, ...d.data()}));
    window.renderCalendarGrid();
}

window.renderCalendarGrid = () => {
    const grid = document.getElementById('al-cal-grid');
    document.getElementById('al-cal-month').textContent = calDate.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
    grid.innerHTML = '';
    const lastDay = new Date(calDate.getFullYear(), calDate.getMonth()+1, 0).getDate();
    for(let i=1; i<=lastDay; i++){
        const cell = document.createElement('div'); cell.className = 'day-cell bg-slate-900 border border-slate-800 h-24 p-2 relative';
        cell.innerHTML = `<span class="day-number text-slate-600 font-bold text-xs absolute top-2 right-2">${i}</span>`;
        grid.appendChild(cell);
    }
};

async function renderBanner() {
    els.txtName.textContent = currentUser.nome || 'Membro';
    els.txtClass.innerHTML = `<i class="fas fa-graduation-cap"></i> Turma: ${currentUser.turma || '---'}`;
    const pic = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nome)}&background=1e293b&color=3b82f6`;
    els.imgProfile.src = pic;
    if(currentUser.coverImageURL) els.bgCover.style.backgroundImage = `url('${currentUser.coverImageURL}')`;
}

async function uploadImage(file, type) {
    const storageRef = ref(storage, `${type}_images/${currentUser.uid}/${Date.now()}`);
    els.loading.classList.remove('hidden');
    const snap = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snap.ref);
    await updateDoc(doc(db, "users", currentUser.uid), { [type === 'profile' ? 'photoURL' : 'coverImageURL']: url });
    currentUser[type === 'profile' ? 'photoURL' : 'coverImageURL'] = url;
    renderBanner();
    els.loading.classList.add('hidden');
}