// ARQUIVO: js/alunoTech/perfilTech.js

import { db, storage, auth } from '../core/firebase.js';
import { 
    doc, getDoc, collection, query, where, orderBy, getDocs, 
    updateDoc, serverTimestamp, Timestamp, onSnapshot, addDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

// --- ESTADO GLOBAL DO MÓDULO ---
let currentUser = null;
let disciplineMap = {}; 
let chartInstances = {};
let studentGradesData = null; 
let els = {}; // Cache de Elementos DOM

// Vars Caderno
let notesUnsubscribe = null;
let myNotes = [];
let currentTagFilter = 'all';
let currentPage = 1;
const itemsPerPage = 12;
const noteColors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#eab308', '#64748b'];
let selectedNoteColor = noteColors[0];
let formIsPinned = false;

// Vars Kanban
let kanbanUnsub = null;
let draggedTask = null;

// Vars Calendário
let calDate = new Date();
let calEvents = [];
let calView = 'month'; 

export async function renderAlunoTechTab() {
    const container = document.getElementById('aluno-tech-content');
    if (!container) return;

    // Garante que o Chart.js está disponível
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        document.head.appendChild(script);
    }

    // Injeta a estrutura completa das 9 abas solicitadas
    container.innerHTML = `
        <div id="loading-aluno" class="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100]">
            <div class="aluno-spinner"></div>
            <p class="text-blue-500 font-cinzel tracking-widest mt-4 animate-pulse">Sincronizando Mente...</p>
        </div>

        <div id="dashboard-aluno" class="w-full h-full flex flex-col overflow-y-auto custom-scroll bg-slate-950 hidden fade-in">
            
            <nav class="aluno-tabs-nav flex gap-1 p-3 bg-slate-900 border-b border-blue-900/50 sticky top-0 z-50 shadow-2xl overflow-x-auto no-scrollbar">
                <button class="aluno-tab-btn active" onclick="window.perfilTech.switchTab('avisos')">Mural</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('boletim')">Boletim</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('frequencia')">Frequência</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('metricas')">Métricas</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('avaliacao360')">Avaliação 360</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('caderno')">Caderno</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('kanban')">Kanban</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('horario')">Horário</button>
                <button class="aluno-tab-btn" onclick="window.perfilTech.switchTab('calendario')">Calendário</button>
            </nav>

            <div class="w-full flex flex-col flex-grow">
                
                <div class="banner-wrapper rounded-none shadow-none mb-0">
                    <div class="cover-photo" id="al-bg-cover" style="background-image: url('https://images.unsplash.com/photo-1550439062-609e1531270e?q=80&w=2070');">
                        <div class="cover-overlay"></div>
                        <button class="edit-btn btn-cover" onclick="document.getElementById('al-file-cover').click()"><i class="fas fa-camera"></i></button>
                        <button class="edit-btn btn-border" onclick="document.getElementById('al-input-color').click()"><i class="fas fa-palette"></i></button>
                    </div>
                    
                    <div class="header-content px-6 md:px-20 pb-10">
                        <div class="profile-area">
                            <img src="" id="al-img-profile" class="profile-img">
                            <button class="edit-btn btn-profile" onclick="document.getElementById('al-file-profile').click()"><i class="fas fa-camera"></i></button>
                        </div>
                        
                        <div class="student-info">
                            <div id="al-badge-title" class="student-title-badge">Aspirante Tech</div>
                            <select id="al-title-select" class="hidden bg-slate-800 text-white rounded p-1 text-xs"></select>
                            <h1 class="student-name text-4xl md:text-6xl font-black font-cinzel" id="al-txt-name">Carregando...</h1>
                            <div class="student-class text-blue-400 font-bold" id="al-txt-class"><i class="fas fa-graduation-cap"></i> Turma: ---</div>
                        </div>

                        <div class="header-actions hidden lg:flex">
                            <div class="stat-box bg-slate-900/60 backdrop-blur p-4 rounded-xl border border-slate-700">
                                <span class="stat-num" id="al-stat-posts">0</span>
                                <span class="stat-label">Produções</span>
                            </div>
                            <div class="stat-box bg-slate-900/60 backdrop-blur p-4 rounded-xl border border-slate-700">
                                <span class="stat-num" id="al-stat-xp">0</span>
                                <span class="stat-label">Experiência</span>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="file" id="al-file-cover" class="hidden" accept="image/*">
                <input type="file" id="al-file-profile" class="hidden" accept="image/*">
                <input type="color" id="al-input-color" class="hidden">

                <div class="px-6 md:px-20 py-12">
                    
                    <div id="atab-avisos" class="aluno-tab-content active">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-xl">
                            <h3 class="text-blue-500 font-cinzel text-xl font-bold mb-6"><i class="fas fa-bullhorn mr-2"></i> Mural da Instituição</h3>
                            <div id="al-avisos-list" class="space-y-4"></div>
                        </div>
                    </div>

                    <div id="atab-boletim" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-xl overflow-x-auto custom-scroll">
                            <table class="boletim-table min-w-[1000px]">
                                <thead>
                                    <tr>
                                        <th rowspan="2">Disciplina</th>
                                        <th colspan="4" class="trim-divider">1º Trimestre</th>
                                        <th colspan="4" class="trim-divider">2º Trimestre</th>
                                        <th colspan="4" class="trim-divider">3º Trimestre</th>
                                        <th rowspan="2" class="media-final-col">Final</th>
                                    </tr>
                                    <tr>
                                        <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                        <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                        <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                    </tr>
                                </thead>
                                <tbody id="al-boletim-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="atab-frequencia" class="aluno-tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 flex flex-col items-center justify-center">
                                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Frequência Global</h4>
                                <div id="al-freq-perc" class="text-7xl font-mono font-black text-green-400">100%</div>
                                <div id="al-freq-total" class="text-red-500 text-sm mt-4 font-bold uppercase">0 Faltas</div>
                            </div>
                            <div class="lg:col-span-2 bg-slate-900/50 p-8 rounded-2xl border border-slate-800">
                                <canvas id="al-chart-freq" class="max-h-64"></canvas>
                            </div>
                        </div>
                    </div>

                    <div id="atab-metricas" class="aluno-tab-content">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800">
                                <h4 class="text-xs font-bold text-slate-500 uppercase mb-6">Dispersão de Notas</h4>
                                <div class="h-80"><canvas id="al-chart-scatter"></canvas></div>
                            </div>
                            <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800">
                                <div class="flex justify-between items-center mb-6">
                                    <h4 class="text-xs font-bold text-slate-500 uppercase">Evolução por Matéria</h4>
                                    <select id="al-sel-evol" class="bg-slate-950 border border-slate-700 text-[10px] p-1.5 rounded text-blue-400"></select>
                                </div>
                                <div class="h-80"><canvas id="al-chart-evol"></canvas></div>
                            </div>
                        </div>
                    </div>

                    <div id="atab-avaliacao360" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-xl">
                            <h3 class="text-blue-500 font-cinzel text-xl font-bold mb-6"><i class="fas fa-users-viewfinder mr-2"></i> Soft Skills 360º</h3>
                            <div id="al-eval-360-content" class="bg-slate-950 p-10 rounded-lg border border-dashed border-slate-700 text-center text-slate-500 italic">
                                Nenhuma avaliação liberada para este período.
                            </div>
                        </div>
                    </div>

                    <div id="atab-caderno" class="aluno-tab-content">
                        <div class="notebook-toolbar bg-slate-900/80 p-4 rounded-xl border border-slate-700 flex flex-wrap gap-4 items-center justify-between mb-8 shadow-lg">
                            <div id="al-note-tags" class="flex gap-2 overflow-x-auto no-scrollbar"></div>
                            <div class="flex gap-3">
                                <input type="text" id="al-note-search" placeholder="Buscar notas..." class="bg-slate-950 border border-slate-700 rounded-full px-4 py-2 text-sm text-white focus:border-blue-500 outline-none">
                                <button onclick="window.perfilTech.toggleNoteForm()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-full transition shadow-lg"><i class="fas fa-plus mr-2"></i> Nova</button>
                            </div>
                        </div>
                        <div id="al-note-form" class="note-form-panel hidden">
                            <input type="hidden" id="al-note-id">
                            <div class="flex justify-between items-center mb-4">
                                <input type="text" id="al-note-title" class="bg-transparent border-b border-slate-700 w-full text-2xl font-bold outline-none text-white p-2" placeholder="Título da Anotação">
                                <i id="al-note-pin" class="fas fa-thumbtack cursor-pointer p-4 text-slate-500" onclick="window.perfilTech.toggleFormPin()"></i>
                            </div>
                            <textarea id="al-note-body" class="bg-slate-950/50 border border-slate-700 w-full p-6 rounded-xl text-slate-300 min-h-[300px] outline-none focus:border-blue-500" placeholder="Digite seu conteúdo aqui..."></textarea>
                            <div class="flex flex-wrap gap-6 items-center mt-6">
                                <input type="text" id="al-note-tags-inp" placeholder="Tags: #aula, #js" class="bg-slate-950 border border-slate-700 p-3 rounded-lg text-sm text-slate-400 outline-none w-full md:w-64">
                                <div id="al-color-picker" class="flex gap-2"></div>
                                <div class="ml-auto flex gap-4">
                                    <button onclick="window.perfilTech.toggleNoteForm()" class="text-slate-400 font-bold hover:text-white">Cancelar</button>
                                    <button onclick="window.perfilTech.saveNote()" class="bg-green-600 hover:bg-green-500 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition">Salvar</button>
                                </div>
                            </div>
                        </div>
                        <div id="al-notes-grid" class="notes-grid"></div>
                        <div id="al-notes-pagination" class="pagination-wrapper hidden mt-10"></div>
                    </div>

                    <div id="atab-kanban" class="aluno-tab-content">
                        <div class="flex justify-end mb-6">
                            <button onclick="window.perfilTech.toggleKanbanForm()" class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-8 py-3 rounded-full shadow-lg transition"><i class="fas fa-plus mr-2"></i> Criar Card</button>
                        </div>
                        <div id="al-kanban-form" class="note-form-panel hidden border-purple-500 mb-8">
                            <input type="hidden" id="al-kanban-id">
                            <input type="text" id="al-kanban-title" class="bg-transparent border-b border-slate-700 w-full text-xl font-bold outline-none text-white p-2" placeholder="Missão/Tarefa">
                            <textarea id="al-kanban-body" class="bg-slate-950/50 border border-slate-700 w-full p-4 rounded-xl text-slate-300 min-h-[100px] outline-none mt-4" placeholder="Descrição rápida..."></textarea>
                            <div class="flex justify-end gap-4 mt-4">
                                <button onclick="window.perfilTech.toggleKanbanForm()" class="text-slate-400 font-bold">Cancelar</button>
                                <button onclick="window.perfilTech.saveKanban()" class="bg-purple-600 text-white px-8 py-2 rounded-lg font-bold">Salvar</button>
                            </div>
                        </div>
                        <div class="kanban-board">
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'a_fazer')">
                                <div class="kanban-column-header bg-blue-900/30 text-blue-400">A FAZER</div>
                                <div id="al-col-todo" class="kanban-cards-area"></div>
                            </div>
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'em_progresso')">
                                <div class="kanban-column-header bg-amber-900/30 text-amber-400">EM PROGRESSO</div>
                                <div id="al-col-doing" class="kanban-cards-area"></div>
                            </div>
                            <div class="kanban-column" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'concluido')">
                                <div class="kanban-column-header bg-green-900/30 text-green-400">FEITO</div>
                                <div id="al-col-done" class="kanban-cards-area"></div>
                            </div>
                        </div>
                    </div>

                    <div id="atab-horario" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 overflow-x-auto custom-scroll shadow-xl">
                            <table class="horario-tabela">
                                <thead>
                                    <tr>
                                        <th data-dia-id="segunda-feira">SEG <span class="data-dia block text-[10px] opacity-50"></span></th>
                                        <th data-dia-id="terca-feira">TER <span class="data-dia block text-[10px] opacity-50"></span></th>
                                        <th data-dia-id="quarta-feira">QUA <span class="data-dia block text-[10px] opacity-50"></span></th>
                                        <th data-dia-id="quinta-feira">QUI <span class="data-dia block text-[10px] opacity-50"></span></th>
                                        <th data-dia-id="sexta-feira">SEX <span class="data-dia block text-[10px] opacity-50"></span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td id="cell-segunda-feira"></td><td id="cell-terca-feira"></td><td id="cell-quarta-feira"></td><td id="cell-quinta-feira"></td><td id="cell-sexta-feira"></td>
                                    </tr>
                                </tbody>
                            </table>
                            <p id="al-horario-msg" class="text-center text-slate-500 mt-6 italic">Sincronizando...</p>
                        </div>
                    </div>

                    <div id="atab-calendario" class="aluno-tab-content">
                        <div class="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-xl">
                            <div class="calendar-controls mb-8 flex flex-wrap justify-between items-center gap-4">
                                <div class="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                                    <button onclick="window.perfilTech.changeCalMonth(-1)" class="p-2 hover:text-blue-400"><i class="fas fa-chevron-left"></i></button>
                                    <span id="al-cal-month" class="font-cinzel font-bold px-6 text-white min-w-[180px] text-center uppercase tracking-widest text-sm">---</span>
                                    <button onclick="window.perfilTech.changeCalMonth(1)" class="p-2 hover:text-blue-400"><i class="fas fa-chevron-right"></i></button>
                                </div>
                                <div class="flex gap-2">
                                    <button id="btn-v-month" onclick="window.perfilTech.switchCalView('month')" class="bg-blue-600 text-white px-4 py-2 rounded font-bold text-[10px]">MÊS</button>
                                    <button id="btn-v-week" onclick="window.perfilTech.switchCalView('week')" class="bg-slate-800 text-slate-500 px-4 py-2 rounded font-bold text-[10px]">SEMANA</button>
                                </div>
                                <button id="al-btn-add-evt" class="hidden bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg" onclick="window.perfilTech.openCalModal()">+ EVENTO</button>
                            </div>
                            <div class="calendar-header" id="al-cal-header">
                                <div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div>
                            </div>
                            <div id="al-cal-grid" class="calendar-grid"></div>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <div id="al-modal-cal" class="cal-modal hidden animate-fade-in" style="background: rgba(2,6,23,0.9); z-index: 1000;">
            <div class="cal-modal-content bg-slate-900 border border-slate-700 shadow-2xl">
                <span class="cal-close text-slate-500 hover:text-white" onclick="window.perfilTech.closeCalModal()">&times;</span>
                <h3 class="text-blue-500 font-cinzel font-bold mb-6 text-xl border-b border-slate-800 pb-2">Evento</h3>
                <div class="space-y-4">
                    <input type="text" id="al-ev-title" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white" placeholder="Título">
                    <input type="date" id="al-ev-date" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white">
                    <textarea id="al-ev-desc" rows="3" class="bg-slate-950 border border-slate-700 p-2 rounded w-full text-white" placeholder="Descrição"></textarea>
                    <input type="color" id="al-ev-color" value="#3b82f6" class="w-full h-10 bg-transparent border-none">
                    <div class="flex justify-end gap-3 pt-6 border-t border-slate-800">
                        <button id="al-btn-del-ev" onclick="window.perfilTech.deleteCalendarEvent()" class="hidden bg-red-900 text-red-200 px-4 py-2 rounded font-bold text-xs">Excluir</button>
                        <button onclick="window.perfilTech.saveCalendarEvent()" class="bg-green-600 text-white px-8 py-2 rounded font-bold shadow-lg">Salvar</button>
                    </div>
                </div>
                <input type="hidden" id="al-ev-id">
            </div>
        </div>
    `;

    // --- MAPEAMENTO DO DOM ---
    mapearDOM();

    // --- AUTH ---
    if (auth.currentUser) {
        initDashboard(auth.currentUser);
    } else {
        auth.onAuthStateChanged(user => {
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
        statPosts: document.getElementById('al-stat-posts'),
        statXp: document.getElementById('al-stat-xp'),
        avisosList: document.getElementById('al-avisos-list'),
        boletimBody: document.getElementById('al-boletim-body'),
        noteTags: document.getElementById('al-note-tags'),
        noteSearch: document.getElementById('al-note-search'),
        noteGrid: document.getElementById('al-notes-grid'),
        noteForm: document.getElementById('al-note-form'),
        noteTitle: document.getElementById('al-note-title'),
        noteBody: document.getElementById('al-note-body'),
        noteTagsInp: document.getElementById('al-note-tags-inp'),
        notePin: document.getElementById('al-note-pin'),
        colTodo: document.getElementById('al-col-todo'),
        colDoing: document.getElementById('al-col-doing'),
        colDone: document.getElementById('al-col-done'),
        freqPerc: document.getElementById('al-freq-perc'),
        freqTotal: document.getElementById('al-freq-total'),
        horarioMsg: document.getElementById('al-horario-msg'),
        selEvol: document.getElementById('al-sel-evol')
    };
}

// ----------------------------------------------------------------------------
// LOGICA DE INICIALIZAÇÃO E CARREGAMENTO
// ----------------------------------------------------------------------------

async function initDashboard(user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) return window.showTab('inicio');
    
    currentUser = { uid: user.uid, ...userDoc.data() };
    els.loading.classList.add('hidden');
    els.dashboard.classList.remove('hidden');

    renderBanner();
    await loadDisciplinesMap();
    loadAvisos();
    loadBoletim();
    loadUserStats();
    initNotebookSystem();
    initKanbanSystem();
    loadHorarioEscolar();
    initCalendarSystem();
}

// ----------------------------------------------------------------------------
// MÓDULO: BANNER E ESTATÍSTICAS
// ----------------------------------------------------------------------------

function renderBanner() {
    els.txtName.textContent = currentUser.nome || 'Membro';
    els.txtClass.innerHTML = `<i class="fas fa-graduation-cap"></i> Turma: ${currentUser.turma || 'Livre'}`;
    els.imgProfile.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nome)}&background=1e293b&color=3b82f6`;
    if(currentUser.coverImageURL) els.bgCover.style.backgroundImage = `url('${currentUser.coverImageURL}')`;
    
    const color = currentUser.profileBorderColor || '#3b82f6';
    els.imgProfile.style.borderColor = color;
    els.imgProfile.style.boxShadow = `0 0 20px ${color}`;

    const titles = currentUser.titulosConquistados || {};
    els.selTitle.innerHTML = '<option value="">-- Sem Título --</option>';
    let activeName = "Iniciante Tech"; 
    Object.entries(titles).forEach(([k, t]) => {
        const opt = new Option(t.nome, k);
        if(t.tituloAtivadoUser) { opt.selected = true; activeName = t.nome; }
        els.selTitle.add(opt);
    });
    els.badgeTitle.textContent = activeName;
}

async function loadUserStats() {
    const q = query(collection(db, 'posts'), where("autorUID", "==", currentUser.uid));
    const snap = await getDocs(q);
    els.statPosts.textContent = snap.size;
    els.statXp.textContent = currentUser.xp || 0;
}

// ----------------------------------------------------------------------------
// MÓDULO: CADERNO DIGITAL (FILTRO POR USERID)
// ----------------------------------------------------------------------------

function initNotebookSystem() {
    if(notesUnsubscribe) notesUnsubscribe();
    const q = query(collection(db, "anotacoes_pessoais"), where("userId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
    notesUnsubscribe = onSnapshot(q, snap => {
        myNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotes();
        renderTags();
    });
    document.getElementById('al-color-picker').innerHTML = noteColors.map(c => `<div class="color-option" style="background-color:${c}" onclick="window.perfilTech.selectColor('${c}', this)"></div>`).join('');
}

function renderNotes() {
    const search = els.noteSearch.value.toLowerCase();
    const filtered = myNotes.filter(n => (n.titulo||'').toLowerCase().includes(search) || (n.conteudo||'').toLowerCase().includes(search));
    els.noteGrid.innerHTML = filtered.map(n => `
        <div class="note-card" style="border-left-color:${n.color||'#3b82f6'}">
            <i class="fas fa-thumbtack note-pin ${n.favorita?'active':''}" onclick="window.perfilTech.togglePin('${n.id}', ${!n.favorita})"></i>
            <h4 class="note-title">${escapeHTML(n.titulo)}</h4>
            <p class="note-body custom-scroll">${escapeHTML(n.conteudo)}</p>
            <div class="note-footer">
                <button onclick='window.perfilTech.editNote(${JSON.stringify(n).replace(/'/g, "&apos;")})' class="note-btn"><i class="fas fa-edit"></i></button>
                <button onclick="window.perfilTech.deleteNote('${n.id}')" class="note-btn del"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function renderTags() {
    const tags = new Set(); myNotes.forEach(n => (n.tags || []).forEach(t => tags.add(t)));
    els.noteTags.innerHTML = `<span class="tag-pill active" onclick="window.perfilTech.setNoteTag('all')">Todas</span>` + 
    Array.from(tags).sort().map(t => `<span class="tag-pill" onclick="window.perfilTech.setNoteTag('${t}')">#${escapeHTML(t)}</span>`).join('');
}

// ----------------------------------------------------------------------------
// EXPORTAÇÃO GLOBAL PARA EVENTOS
// ----------------------------------------------------------------------------

window.perfilTech = {
    switchTab: (id) => {
        document.querySelectorAll('.aluno-tab-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
        document.querySelectorAll('.aluno-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`atab-${id}`).classList.add('active');
    },
    toggleNoteForm: () => {
        const h = els.noteForm.classList.contains('hidden');
        if(h) { els.noteForm.classList.remove('hidden'); document.getElementById('al-note-id').value = ''; els.noteTitle.value=''; els.noteBody.value=''; }
        else els.noteForm.classList.add('hidden');
    },
    saveNote: async () => {
        const id = document.getElementById('al-note-id').value;
        const p = { titulo: els.noteTitle.value, conteudo: els.noteBody.value, userId: currentUser.uid, color: selectedNoteColor, favorita: formIsPinned, updatedAt: serverTimestamp() };
        if(id) await updateDoc(doc(db, "anotacoes_pessoais", id), p); else await addDoc(collection(db, "anotacoes_pessoais"), p);
        window.perfilTech.toggleNoteForm();
    },
    deleteNote: async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, "anotacoes_pessoais", id)); },
    togglePin: async (id, val) => { await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: !!val }); },
    selectColor: (c, el) => { selectedNoteColor = c; els.noteForm.style.borderLeftColor = c; },
    
    toggleKanbanForm: () => { document.getElementById('al-kanban-form').classList.toggle('hidden'); },
    saveKanban: async () => {
        const p = { titulo: document.getElementById('al-kanban-title').value, conteudo: document.getElementById('al-kanban-body').value, userIdCriador: currentUser.uid, status: 'a_fazer', createdAt: serverTimestamp() };
        await addDoc(collection(db, "kanban_atividades"), p);
        window.perfilTech.toggleKanbanForm();
    },
    allowDrop: (e) => e.preventDefault(),
    drop: async (e, status) => {
        e.preventDefault(); const id = e.dataTransfer.getData("text/plain");
        await updateDoc(doc(db, "kanban_atividades", id), { status, updatedAt: serverTimestamp() });
    },
    
    changeCalMonth: (dir) => { calDate.setMonth(calDate.getMonth()+dir); fetchCalendarEvents(); },
    switchCalView: (v) => { calView = v; window.renderCalendarGrid(); },
    openCalModal: (ev=null, dt=null) => { document.getElementById('al-modal-cal').classList.remove('hidden'); },
    closeCalModal: () => document.getElementById('al-modal-cal').classList.add('hidden'),
    saveCalendarEvent: async () => { /* Logica de save original */ }
};

// ----------------------------------------------------------------------------
// AUXILIARES
// ----------------------------------------------------------------------------

async function loadAvisos() {
    const q = query(collection(db, "avisos_colegio"), where("turmasRelacionadas", "array-contains", currentUser.turma || 'Geral'), orderBy("dataCriacao", "desc"));
    const snap = await getDocs(q);
    els.avisosList.innerHTML = snap.docs.map(d => `<div class="aviso-item"><div class="aviso-header"><span>${d.data().autor}</span></div><div class="aviso-text font-mono text-xs">${d.data().mensagem}</div></div>`).join('');
}

async function loadBoletim() {
    const snap = await getDoc(doc(db, "notas", currentUser.uid));
    if(!snap.exists()) { els.boletimBody.innerHTML = '<tr><td colspan="14" class="p-10 text-center italic">Sem notas.</td></tr>'; return; }
    const notas = snap.data().disciplinasComNotas || {};
    els.boletimBody.innerHTML = Object.entries(notas).map(([id, tr]) => `
        <tr>
            <td class="font-bold text-white text-xs">${id}</td>
            <td>${tr['1']?.nota1||'-'}</td><td>${tr['1']?.nota2||'-'}</td><td>${tr['1']?.nota3||'-'}</td><td class="trim-divider">${tr['1']?.nota4||'-'}</td>
            <td>${tr['2']?.nota1||'-'}</td><td>${tr['2']?.nota2||'-'}</td><td>${tr['2']?.nota3||'-'}</td><td class="trim-divider">${tr['2']?.nota4||'-'}</td>
            <td>${tr['3']?.nota1||'-'}</td><td>${tr['3']?.nota2||'-'}</td><td>${tr['3']?.nota3||'-'}</td><td class="trim-divider">${tr['3']?.nota4||'-'}</td>
            <td class="media-final-col">---</td>
        </tr>
    `).join('');
}

function initKanbanSystem() {
    const q = query(collection(db, "kanban_atividades"), where("userIdCriador", "==", currentUser.uid));
    onSnapshot(q, snap => {
        els.colTodo.innerHTML = ''; els.colDoing.innerHTML = ''; els.colDone.innerHTML = '';
        snap.docs.forEach(doc => {
            const t = doc.data(); const id = doc.id;
            const div = document.createElement('div'); div.className = 'kanban-card'; div.draggable = true;
            div.innerHTML = `<div class="k-card-title">${escapeHTML(t.titulo)}</div>`;
            div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", id); draggedTask = {id, ...t}; };
            if(t.status==='a_fazer') els.colTodo.appendChild(div);
            else if(t.status==='em_progresso') els.colDoing.appendChild(div);
            else els.colDone.appendChild(div);
        });
    });
}

async function loadHorarioEscolar() {
    const diasIds = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
    diasIds.forEach(d => document.getElementById(`cell-${d}`).innerHTML = '');
    const q = query(collection(db, "aulas"), where("turmaId", "==", currentUser.turma || '---'), orderBy("ordem"));
    const snap = await getDocs(q);
    if(snap.empty) els.horarioMsg.style.display = 'block'; else els.horarioMsg.style.display = 'none';
    snap.forEach(doc => {
        const a = doc.data(); const cell = document.getElementById(`cell-${a.diaSemana}`);
        if(cell) cell.innerHTML += `<div class="aula-card"><h4>${a.ordem}ª - ${a.disciplina}</h4><p>${a.professorNome}</p></div>`;
    });
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
    for(let i=1; i<=31; i++){
        const d = document.createElement('div'); d.className = 'day-cell';
        d.innerHTML = `<span class="day-number">${i}</span>`;
        grid.appendChild(d);
    }
}

// --- CARREGA O MAPA DE DISCIPLINAS (PARA TRADUZIR IDs EM NOMES) ---
async function loadDisciplinesMap() {
    try {
        const q = query(collection(db, "disciplinasCadastradas"));
        const snap = await getDocs(q);
        
        // Limpa o mapa atual
        disciplineMap = {};
        
        snap.forEach(doc => {
            const data = doc.data();
            // Mapeia o identificador (ex: "prog_01") para o nome real (ex: "Lógica de Programação")
            if (data.identificador && data.nomeExibicao) {
                disciplineMap[data.identificador] = data.nomeExibicao;
            }
        });
        
        console.log("Mapa de disciplinas carregado com sucesso.");
    } catch (error) {
        console.error("Erro ao carregar mapa de disciplinas:", error);
    }
}