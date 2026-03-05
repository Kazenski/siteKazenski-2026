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
let myTasks = [];
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

    // O HTML JÁ ESTÁ NO INDEX.HTML AGORA!
    mapearDOM();
    setupTabsNavigation();
    setupEventListeners();

    if (auth.currentUser) {
        initDashboard(auth.currentUser);
    } else {
        const unsub = auth.onAuthStateChanged(user => {
            if (user) initDashboard(user);
            else window.showTab('inicio');
        });
    }
}

// ============================================================================
// SISTEMA DE NAVEGAÇÃO DAS ABAS INTERNAS (Sem sujar o HTML global)
// ============================================================================
function setupTabsNavigation() {
    const tabButtons = document.querySelectorAll('.aluno-tab-btn');
    const tabContents = document.querySelectorAll('.aluno-tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 1. Remove a classe 'active' de todos os botões e oculta os conteúdos
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // 2. Ativa o botão que foi clicado
            btn.classList.add('active');

            // 3. Lê o alvo (data-target) e mostra a aba correspondente
            const targetId = btn.getAttribute('data-target');
            const targetContent = document.getElementById(`atab-${targetId}`);
            
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // 4. Correção para os Gráficos (Chart.js precisa de resize quando a aba abre)
            if (targetId === 'metricas' || targetId === 'frequencia') {
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            }
        });
    });
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
        
        // Novos inputs de arquivos
        inpCover: document.getElementById('al-file-cover'),
        inpProfile: document.getElementById('al-file-profile'),
        inpColor: document.getElementById('al-input-color'),
        
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
    
    // REDE DE SEGURANÇA: Esconde o loading mesmo se o usuário não for achado no banco
    if (!userDoc.exists()) {
        els.loading.classList.add('hidden');
        els.dashboard.innerHTML = '<div class="text-white text-center mt-20">Usuário não encontrado no banco de dados.</div>';
        els.dashboard.classList.remove('hidden');
        return; 
    }
    
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

// ============================================================================
// SISTEMA DE EVENTOS E LÓGICA DE NEGÓCIO MODULARIZADA
// ============================================================================

function setupEventListeners() {
    // Eventos do Banner e Perfil
    document.getElementById('btn-edit-profile')?.addEventListener('click', () => els.inpProfile.click());
    document.getElementById('btn-edit-cover')?.addEventListener('click', () => els.inpCover.click());
    document.getElementById('btn-edit-border')?.addEventListener('click', () => els.inpColor.click());
    
    els.badgeTitle?.addEventListener('click', toggleTitleSelect);
    els.selTitle?.addEventListener('change', (e) => saveTitle(e.target.value));
    
    els.inpProfile?.addEventListener('change', (e) => handleUpload(e.target, 'profile'));
    els.inpCover?.addEventListener('change', (e) => handleUpload(e.target, 'cover'));
    els.inpColor?.addEventListener('change', (e) => saveBorderColor(e.target.value));

    // Eventos do Caderno Digital
    document.getElementById('btn-toggle-note-form')?.addEventListener('click', toggleNoteForm);
    document.getElementById('btn-save-note')?.addEventListener('click', saveNote);

    // Eventos do Kanban
    document.getElementById('btn-toggle-kanban-form')?.addEventListener('click', toggleKanbanForm);
    document.getElementById('btn-save-kanban')?.addEventListener('click', saveKanban);
    
    // Eventos do Calendário
    document.getElementById('al-btn-add-evt')?.addEventListener('click', () => openCalModal());
    document.getElementById('btn-close-cal')?.addEventListener('click', closeCalModal);
    document.getElementById('btn-save-cal')?.addEventListener('click', saveCalendarEvent);
    document.getElementById('al-btn-del-ev')?.addEventListener('click', deleteCalendarEvent);
    document.getElementById('btn-cal-prev')?.addEventListener('click', () => changeCalMonth(-1));
    document.getElementById('btn-cal-next')?.addEventListener('click', () => changeCalMonth(1));

    // Eventos de Filtros (Gráfico de Evolução)
    els.selEvol?.addEventListener('change', (e) => renderEvolutionChart(e.target.value));
}

// --- LÓGICA DO BANNER ---
function toggleTitleSelect() {
    els.badgeTitle.classList.add('hidden');
    els.selTitle.classList.remove('hidden');
    els.selTitle.focus();
}

async function saveTitle(val) {
    const titles = { ...currentUser.titulosConquistados };
    Object.keys(titles).forEach(k => titles[k].tituloAtivadoUser = (k === val));
    await updateDoc(doc(db, "users", currentUser.uid), { titulosConquistados: titles });
    currentUser.titulosConquistados = titles;
    els.selTitle.classList.add('hidden');
    els.badgeTitle.classList.remove('hidden');
    renderBanner();
}

async function saveBorderColor(val) {
    els.imgProfile.style.borderColor = val;
    els.imgProfile.style.boxShadow = `0 0 20px ${val}`;
    await updateDoc(doc(db, "users", currentUser.uid), { profileBorderColor: val });
}

function handleUpload(input, type) { 
    if(input.files[0]) uploadImage(input.files[0], type); 
}

// --- LÓGICA DO CADERNO ---
function toggleNoteForm() { els.noteForm.classList.toggle('hidden'); }

async function saveNote() {
    const titulo = els.noteTitle.value.trim();
    const conteudo = els.noteBody.value.trim();
    if(!titulo && !conteudo) return alert("Escreva algo na anotação!");

    const payload = { 
        titulo: titulo, 
        conteudo: conteudo, 
        userId: currentUser.uid, 
        color: selectedNoteColor, 
        favorita: formIsPinned, 
        updatedAt: serverTimestamp(), 
        tags: els.noteTagsInp.value.split(',').map(t => t.trim()).filter(t => t) 
    };
    
    const id = document.getElementById('al-note-id').value;
    
    if(id) {
        await updateDoc(doc(db, "anotacoes_pessoais", id), payload); 
    } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "anotacoes_pessoais"), payload);
    }
    
    toggleNoteForm();
    els.noteTitle.value = '';
    els.noteBody.value = '';
    document.getElementById('al-note-id').value = '';
}

// Funções globais apenas para os botões gerados dinamicamente via innerHTML
window.editNote = (id) => { 
    const n = myNotes.find(x => x.id === id);
    if(!n) return;
    
    els.noteForm.classList.remove('hidden'); 
    document.getElementById('al-note-id').value = n.id; 
    els.noteTitle.value = n.titulo; 
    els.noteBody.value = n.conteudo; 
    els.noteTagsInp.value = (n.tags || []).join(', ');
    formIsPinned = n.favorita || false;
    window.selectColor(n.color || noteColors[0]);
    els.noteForm.scrollIntoView({ behavior: 'smooth' });
};

window.deleteNote = async (id) => { if(confirm("Apagar nota permanentemente?")) await deleteDoc(doc(db, "anotacoes_pessoais", id)); };
window.togglePin = async (id, val) => { await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: !!val }); };
window.selectColor = (c) => { selectedNoteColor = c; els.noteForm.style.borderLeft = `5px solid ${c}`; };
window.setNoteTag = (t) => { currentTagFilter = t; renderNotes(); };

// --- LÓGICA DO KANBAN ---
function toggleKanbanForm() { 
    const form = document.getElementById('al-kanban-form');
    form.classList.toggle('hidden'); 
    if(!form.classList.contains('hidden')) {
        document.getElementById('al-kanban-id').value = '';
        document.getElementById('al-kanban-title').value = '';
        document.getElementById('al-kanban-body').value = '';
    }
}

async function saveKanban() {
    const titulo = document.getElementById('al-kanban-title').value.trim();
    if(!titulo) return alert("A tarefa precisa de um título.");

    const id = document.getElementById('al-kanban-id').value;
    const payload = { 
        titulo: titulo, 
        conteudo: document.getElementById('al-kanban-body').value.trim(), 
        userIdCriador: currentUser.uid,
        updatedAt: serverTimestamp() 
    };

    if(id) {
        await updateDoc(doc(db, "kanban_atividades", id), payload);
    } else {
        payload.status = 'a_fazer';
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "kanban_atividades"), payload); 
    }
    
    document.getElementById('al-kanban-form').classList.add('hidden');
}

function renderKanbanBoard() {
    els.colTodo.innerHTML = ''; els.colDoing.innerHTML = ''; els.colDone.innerHTML = '';
    myTasks.forEach(t => {
        const div = document.createElement('div'); 
        div.className = 'p-4 bg-slate-700 border border-slate-600 rounded-xl mb-3 cursor-grab shadow-lg hover:-translate-y-1 transition-transform relative group'; 
        div.draggable = true;
        
        div.innerHTML = `
            <div class="font-bold text-white text-sm pr-6 mb-2">${escapeHTML(t.titulo)}</div>
            <div class="text-xs text-slate-300 whitespace-pre-wrap line-clamp-3">${escapeHTML(t.conteudo)}</div>
            <div class="mt-3 pt-2 border-t border-slate-600/50 flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="window.editKanbanTask('${t.id}')" class="text-slate-400 hover:text-blue-400"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteKanbanTask('${t.id}')" class="text-slate-500 hover:text-red-500"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", t.id); draggedTask = t; };
        
        if(t.status === 'a_fazer') els.colTodo.appendChild(div);
        else if(t.status === 'em_progresso') els.colDoing.appendChild(div);
        else els.colDone.appendChild(div);
    });
}

// Funções Globais Kanban
window.editKanbanTask = (id) => {
    const t = myTasks.find(x => x.id === id); 
    if(!t) return;
    document.getElementById('al-kanban-form').classList.remove('hidden');
    document.getElementById('al-kanban-id').value = t.id;
    document.getElementById('al-kanban-title').value = t.titulo;
    document.getElementById('al-kanban-body').value = t.conteudo;
    document.getElementById('al-kanban-form').scrollIntoView({ behavior: 'smooth' });
};
window.deleteKanbanTask = async (id) => { if(confirm("Apagar tarefa do Kanban?")) await deleteDoc(doc(db, "kanban_atividades", id)); };

window.allowDrop = (e) => e.preventDefault();
window.drop = async (e, status) => {
    const id = e.dataTransfer.getData("text/plain");
    if(id && draggedTask && draggedTask.status !== status) {
        await updateDoc(doc(db, "kanban_atividades", id), { status: status, updatedAt: serverTimestamp() });
    }
};

// ============================================================================
// LÓGICA DO CALENDÁRIO ESCOLAR (COM PAINEL LATERAL MODERNO)
// ============================================================================

async function initCalendarSystem() {
    // Exibe botões de Admin/Professor
    const isStaff = currentUser.Admin || currentUser.Professor || currentUser.Coordenacao;
    if(isStaff) {
        document.getElementById('al-btn-add-evt').classList.remove('hidden');
        document.getElementById('al-ev-visib-container').classList.remove('hidden');
    }

    // Botões de Visualização (Mês/Semana)
    document.getElementById('btn-view-month').addEventListener('click', () => switchCalView('month'));
    document.getElementById('btn-view-week').addEventListener('click', () => switchCalView('week'));

    await fetchCalendarEvents();
}

async function fetchCalendarEvents() {
    // Restaura a lógica poderosa do código antigo
    let queries = [];
    const calRef = collection(db, "calendarioAnual");

    // 1. Eventos Globais
    queries.push(query(calRef, where("visibilidade", "in", ["publico", "todos"])));

    // 2. Eventos da Turma (se aluno)
    if(currentUser.turma && currentUser.role === 'aluno') {
        queries.push(query(calRef, where("visibilidade", "==", "turmas_especificas"), where("turmasAlvo", "array-contains", currentUser.turma)));
    }

    // 3. Meus Eventos (se Professor/Admin ver os que ele mesmo criou)
    if(currentUser.Admin || currentUser.Professor || currentUser.Coordenacao) {
        queries.push(query(calRef, where("instrutorUID", "==", currentUser.uid)));
    }

    try {
        const results = await Promise.all(queries.map(q => getDocs(q)));
        const uniqueEvents = new Map();

        results.forEach(snap => {
            snap.forEach(doc => uniqueEvents.set(doc.id, { id: doc.id, ...doc.data() }));
        });

        calEvents = Array.from(uniqueEvents.values());
        renderCalendarGrid();
    } catch(e) { console.error("Erro no calendário:", e); }
}

function renderCalendarGrid() {
    const grid = document.getElementById('al-cal-grid');
    const title = document.getElementById('al-cal-month');
    grid.innerHTML = '';
    title.textContent = calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    let daysToRender = [];
    
    if(calView === 'month') {
        const year = calDate.getFullYear();
        const month = calDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1; 
        if(startDay < 0) startDay = 6; 
        
        for(let i=0; i < startDay; i++) if(i < 5) daysToRender.push(null); 
        for(let d=1; d <= lastDay.getDate(); d++) {
            const current = new Date(year, month, d);
            if(current.getDay() >= 1 && current.getDay() <= 5) daysToRender.push(current);
        }
        document.getElementById('cal-header-row').classList.remove('hidden');
        grid.className = 'grid grid-cols-5 bg-slate-900 border border-slate-700 rounded-b-xl overflow-hidden';
    } else {
        document.getElementById('cal-header-row').classList.add('hidden');
        grid.className = 'flex flex-col gap-3 bg-transparent border-none';
        
        const current = new Date(calDate);
        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(current.setDate(diff));
        
        for(let i=0; i<5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            daysToRender.push(d);
        }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    daysToRender.forEach(date => {
        const cell = document.createElement('div');
        
        if(!date) {
            cell.className = 'min-h-[120px] bg-slate-900/30 border-r border-b border-slate-800 pointer-events-none';
        } else {
            const dateStr = date.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            
            // Classes do Tailwind para a célula do calendário
            cell.className = `min-h-[120px] p-2 border-r border-b border-slate-700 relative flex flex-col cursor-pointer transition-colors ${calView === 'week' ? 'rounded-xl border' : ''} hover:bg-slate-800/50 ${isToday ? 'bg-blue-900/20' : 'bg-slate-900'}`;
            
            // Renderiza o dia
            const num = document.createElement('span');
            num.className = `self-end text-sm font-bold mb-2 ${isToday ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-slate-500'}`;
            num.textContent = calView === 'week' ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }) : date.getDate();
            cell.appendChild(num);

            // Filtra e renderiza eventos do dia
            const dayEvents = calEvents.filter(ev => {
                if (!ev.dataInicio) return false;
                try {
                    const evDate = ev.dataInicio.toDate ? ev.dataInicio.toDate() : new Date(ev.dataInicio);
                    return evDate.toISOString().split('T')[0] === dateStr;
                } catch(e) { return false; }
            });

            dayEvents.forEach(ev => {
                const badge = document.createElement('div');
                badge.className = 'text-[11px] font-bold text-white px-2 py-1 rounded shadow-sm mb-1 truncate hover:brightness-110 transition-all';
                badge.style.backgroundColor = ev.cor || '#3b82f6';
                badge.textContent = ev.titulo;
                badge.onclick = (e) => { e.stopPropagation(); openCalModal(ev); };
                cell.appendChild(badge);
            });

            cell.onclick = () => openCalModal(null, dateStr);
        }
        grid.appendChild(cell);
    });
}

function switchCalView(view) {
    calView = view;
    document.getElementById('btn-view-month').className = view === 'month' ? 'px-4 py-1.5 rounded text-sm font-bold bg-blue-600 text-white transition-colors' : 'px-4 py-1.5 rounded text-sm font-bold text-slate-400 hover:text-white transition-colors';
    document.getElementById('btn-view-week').className = view === 'week' ? 'px-4 py-1.5 rounded text-sm font-bold bg-blue-600 text-white transition-colors' : 'px-4 py-1.5 rounded text-sm font-bold text-slate-400 hover:text-white transition-colors';
    renderCalendarGrid();
}

function changeCalMonth(dir) {
    if(calView === 'month') calDate.setMonth(calDate.getMonth() + dir);
    else calDate.setDate(calDate.getDate() + (dir * 7));
    fetchCalendarEvents();
}

// === PAINEL LATERAL DO CALENDÁRIO ===
window.openCalModal = (event = null, dateStr = null) => {
    const modal = document.getElementById('al-modal-cal');
    const panel = document.getElementById('al-modal-panel');
    const isStaff = currentUser.Admin || currentUser.Coordenacao || currentUser.Professor;
    
    if(!event && !isStaff) return; // Aluno não cria

    // Limpa / Preenche campos
    const inps = ['al-ev-title', 'al-ev-date', 'al-ev-desc', 'al-ev-color', 'al-ev-visib'];
    
    if(event) {
        document.getElementById('al-ev-id').value = event.id;
        document.getElementById('al-ev-title').value = event.titulo;
        document.getElementById('al-ev-date').value = event.dataInicio?.toDate().toISOString().split('T')[0];
        document.getElementById('al-ev-desc').value = event.descricao || '';
        document.getElementById('al-ev-color').value = event.cor || '#3b82f6';
        document.getElementById('al-ev-visib').value = event.visibilidade || 'todos';
        
        const canEdit = isStaff && (currentUser.Admin || event.instrutorUID === currentUser.uid);
        document.getElementById('al-btn-del-ev').classList.toggle('hidden', !canEdit);
        document.getElementById('btn-save-cal').classList.toggle('hidden', !canEdit);
        inps.forEach(id => document.getElementById(id).disabled = !canEdit);
    } else {
        document.getElementById('al-ev-id').value = '';
        document.getElementById('al-ev-title').value = '';
        document.getElementById('al-ev-date').value = dateStr || new Date().toISOString().split('T')[0];
        document.getElementById('al-ev-desc').value = '';
        document.getElementById('al-ev-color').value = '#3b82f6';
        
        document.getElementById('al-btn-del-ev').classList.add('hidden');
        document.getElementById('btn-save-cal').classList.remove('hidden');
        inps.forEach(id => document.getElementById(id).disabled = false);
    }

    // Exibe o modal com animação
    modal.classList.remove('hidden');
    setTimeout(() => panel.classList.remove('translate-x-full'), 10); // Animação de entrar pela direita
};

window.closeCalModal = () => {
    const modal = document.getElementById('al-modal-cal');
    const panel = document.getElementById('al-modal-panel');
    
    panel.classList.add('translate-x-full'); // Animação de sair pela direita
    setTimeout(() => modal.classList.add('hidden'), 300); // Aguarda animação terminar
};

async function saveCalendarEvent() {
    const title = document.getElementById('al-ev-title').value;
    const dateVal = document.getElementById('al-ev-date').value;
    if(!title || !dateVal) return alert("Título e Data são obrigatórios");

    const [y, m, d] = dateVal.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const visib = document.getElementById('al-ev-visib').value;

    const payload = {
        titulo: title,
        dataInicio: Timestamp.fromDate(dateObj),
        descricao: document.getElementById('al-ev-desc').value,
        cor: document.getElementById('al-ev-color').value,
        visibilidade: visib,
        instrutorUID: currentUser.uid,
        updatedAt: serverTimestamp()
    };

    if(visib === 'turmas_especificas' && currentUser.turma) payload.turmasAlvo = [currentUser.turma];

    const id = document.getElementById('al-ev-id').value;
    if(id) await updateDoc(doc(db, "calendarioAnual", id), payload);
    else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, "calendarioAnual"), payload); }

    closeCalModal();
    fetchCalendarEvents();
}

async function deleteCalendarEvent() {
    const id = document.getElementById('al-ev-id').value;
    if(id && confirm("Excluir evento do calendário?")) {
        await deleteDoc(doc(db, "calendarioAnual", id));
        closeCalModal();
        fetchCalendarEvents();
    }
}

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
    
    if(!snap.exists()) { 
        els.boletimBody.innerHTML = '<tr><td colspan="14" class="p-8 text-center text-slate-500 italic">Sem notas registradas.</td></tr>'; 
        return; 
    }
    
    studentGradesData = snap.data().disciplinasComNotas || {};
    
    // --- NOVA LÓGICA DO SELETOR DE EVOLUÇÃO ---
    els.selEvol.innerHTML = '<option value="">Geral (Média)</option>';
    
    if (currentUser.Admin) {
        // Se for Admin, mostra todas as disciplinas cadastradas na escola
        Object.entries(disciplineMap).forEach(([id, nome]) => {
            els.selEvol.add(new Option(nome, id));
        });
    } else {
        // Se for aluno, mostra apenas as disciplinas que ele tem no boletim
        Object.keys(studentGradesData).forEach(discId => {
            const nome = disciplineMap[discId] || discId;
            els.selEvol.add(new Option(nome, discId));
        });
    }
    // ------------------------------------------
    
    let html = '';
    for(const [id, tr] of Object.entries(studentGradesData)) {
        html += `<tr>
            <td class="font-bold text-white text-xs p-3">${disciplineMap[id]||id}</td>
            <td>${tr['1']?.nota1||'-'}</td><td>${tr['1']?.nota2||'-'}</td><td>${tr['1']?.nota3||'-'}</td><td>${tr['1']?.nota4||'-'}</td>
            <td>${tr['2']?.nota1||'-'}</td><td>${tr['2']?.nota2||'-'}</td><td>${tr['2']?.nota3||'-'}</td><td>${tr['2']?.nota4||'-'}</td>
            <td>${tr['3']?.nota1||'-'}</td><td>${tr['3']?.nota2||'-'}</td><td>${tr['3']?.nota3||'-'}</td><td>${tr['3']?.nota4||'-'}</td>
            <td class="media-final-col text-blue-400 font-bold">---</td>
        </tr>`;
    }
    els.boletimBody.innerHTML = html;
    
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
    
    if(filtered.length === 0) {
        els.noteGrid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-10">Nenhuma anotação encontrada.</div>';
        return;
    }

    els.noteGrid.innerHTML = filtered.map(n => `
        <div class="note-card p-5 bg-slate-800 border border-slate-700 rounded-xl relative shadow-lg transition hover:-translate-y-1" style="border-left: 5px solid ${n.color||'#3b82f6'}">
            <i class="fas fa-thumbtack absolute top-4 right-4 cursor-pointer text-lg ${n.favorita ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]' : 'text-slate-600 hover:text-slate-400'}" onclick="window.togglePin('${n.id}', ${!n.favorita})"></i>
            <h4 class="text-white font-cinzel font-bold text-lg mb-2 pr-6 truncate">${escapeHTML(n.titulo)}</h4>
            <div class="flex gap-2 mb-3 flex-wrap">
                ${(n.tags||[]).map(t => `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] px-2 py-0.5 rounded">${escapeHTML(t)}</span>`).join('')}
            </div>
            <p class="text-slate-400 text-sm line-clamp-4 flex-grow mb-4 whitespace-pre-wrap">${escapeHTML(n.conteudo)}</p>
            <div class="pt-3 border-t border-slate-700/50 flex justify-end gap-3 mt-auto">
                <button onclick="window.editNote('${n.id}')" class="text-slate-400 hover:text-blue-400 text-sm font-bold flex items-center gap-1 transition-colors"><i class="fas fa-edit"></i> Editar</button>
                <button onclick="window.deleteNote('${n.id}')" class="text-slate-500 hover:text-red-500 text-sm font-bold flex items-center gap-1 transition-colors"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function initKanbanSystem() {
    if(kanbanUnsub) return;
    
    const q = query(collection(db, "kanban_atividades"), 
        where("userIdCriador", "==", currentUser.uid)
    );

    kanbanUnsub = onSnapshot(q, (snap) => {
        myTasks = [];
        snap.forEach(doc => myTasks.push({ id: doc.id, ...doc.data() }));
        
        // Ordena as tarefas da mais recente para a mais antiga localmente (evita erro de índice no Firebase)
        myTasks.sort((a, b) => {
            const timeA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now();
            const timeB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now();
            return timeB - timeA;
        });

        // Chama a função que desenha o quadro com o visual novo!
        renderKanbanBoard();
    }, (error) => {
        console.error("Erro ao carregar o Kanban:", error);
    });
}

async function loadHorarioEscolar() {
    // 1. Limpa a tabela
    ['segunda', 'terca', 'quarta', 'quinta', 'sexta'].forEach(d => {
        const cell = document.getElementById(`cell-${d}-feira`);
        if(cell) cell.innerHTML = '';
    });

    // 2. Lógica para destacar o dia de hoje
    const diasIds = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
    const diaHoje = new Date().getDay(); // 0 = Dom, 1 = Seg ... 5 = Sex
    
    // Remove destaques anteriores (caso a aba seja recarregada)
    document.querySelectorAll('.horario-tabela th').forEach(th => th.classList.remove('bg-blue-600', 'text-white'));
    document.querySelectorAll('.horario-tabela td').forEach(td => td.classList.remove('bg-blue-900/20'));

    // Aplica o destaque se for dia de semana
    if(diaHoje >= 1 && diaHoje <= 5) {
        const idHoje = diasIds[diaHoje - 1];
        const th = document.querySelector(`th[data-dia-id="${idHoje}"]`);
        const td = document.getElementById(`cell-${idHoje}`);
        
        if(th) {
            th.classList.add('bg-blue-600', 'text-white');
            th.style.color = '#ffffff'; // Força a cor por cima do CSS
        }
        if(td) td.classList.add('bg-blue-900/20'); // Fundo azul translúcido na coluna
    }

    // 3. Busca os dados no Firebase
    const q = query(collection(db, "aulas"), where("turmaId", "==", currentUser.turma || '---'), orderBy("ordem"));
    const snap = await getDocs(q);
    
    els.horarioMsg.style.display = snap.empty ? 'block' : 'none';
    
    // 4. Preenche as aulas
    snap.forEach(doc => {
        const a = doc.data(); 
        const cell = document.getElementById(`cell-${a.diaSemana}`);
        
        if(cell) {
            cell.innerHTML += `
                <div class="aula-card p-3 bg-slate-900/80 border-l-4 border-blue-500 mb-3 rounded-lg shadow-md transition hover:-translate-y-1">
                    <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">${a.ordem}ª - ${disciplineMap[a.disciplina]||a.disciplina}</h4>
                    <p class="text-[10px] font-bold text-blue-400 mt-1.5"><i class="fas fa-chalkboard-teacher mr-1"></i> ${a.professorNome}</p>
                </div>
            `;
        }
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