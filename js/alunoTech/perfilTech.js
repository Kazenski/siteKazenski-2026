// ARQUIVO: js/alunoTech/perfilTech.js
import { db, storage, auth } from '../core/firebase.js';
import {
    doc, getDoc, collection, query, where, orderBy, getDocs,
    updateDoc, serverTimestamp, Timestamp, onSnapshot, addDoc, deleteDoc, or
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

const purify = window.DOMPurify;

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
let usersCacheForShare = [];
let selectedNoteColor = noteColors[0];
let formIsPinned = false;
let draggedTask = null;
let calDate = new Date();
let calEvents = [];
let calView = 'month';
let cropperInstance = null;
let currentCropType = null;

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
        inpCover: document.getElementById('al-file-cover'),
        inpProfile: document.getElementById('al-file-profile'),
        inpColor: document.getElementById('al-input-color'),
        avisosList: document.getElementById('al-avisos-list'),
        boletimBody: document.getElementById('al-boletim-body'),
        freqPerc: document.getElementById('al-freq-perc'),
        freqTotal: document.getElementById('al-freq-total'),
        horarioMsg: document.getElementById('al-horario-msg'),
        selEvol: document.getElementById('al-sel-evol'),

        // --- IDS DA ARQUITETURA DE 3 COLUNAS ---
        noteTags: document.getElementById('al-notebook-tags'),
        noteSearch: document.getElementById('al-note-search'),
        noteList: document.getElementById('al-notes-list'),
        noteEmptyState: document.getElementById('al-note-empty-state'),
        noteActiveState: document.getElementById('al-note-active-state'),
        noteActiveId: document.getElementById('al-note-active-id'),
        noteActiveTitle: document.getElementById('al-note-active-title'),
        noteActiveTags: document.getElementById('al-note-active-tags'),
        noteActiveBody: document.getElementById('al-note-active-body'),
        noteColorPicker: document.getElementById('al-note-colors'),

        colTodo: document.getElementById('al-col-todo'),
        colDoing: document.getElementById('al-col-doing'),
        colDone: document.getElementById('al-col-done'),

        modalCrop: document.getElementById('al-modal-crop'),
        imageToCrop: document.getElementById('image-to-crop'),
        btnConfirmCrop: document.getElementById('btn-confirm-crop')
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
    monitorarAuraGlobal(user.uid);

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
    document.getElementById('btn-new-note')?.addEventListener('click', createNewNote);
    document.getElementById('btn-note-save')?.addEventListener('click', saveNote);
    document.getElementById('btn-note-delete')?.addEventListener('click', deleteActiveNote);
    document.getElementById('btn-note-pin')?.addEventListener('click', toggleActiveNotePin);
    document.getElementById('btn-note-share')?.addEventListener('click', window.openShareModal);

    // Seletor nativo de cor
    els.noteColorPicker?.addEventListener('input', (e) => { selectedNoteColor = e.target.value; });

    els.btnConfirmCrop?.addEventListener('click', async () => {
        if (!cropperInstance) return;

        const canvas = cropperInstance.getCroppedCanvas({
            maxWidth: currentCropType === 'profile' ? 512 : 1920,
            maxHeight: currentCropType === 'profile' ? 512 : 1080,
        });

        if (!canvas) return alert("Erro ao cortar a imagem.");

        els.loading.classList.remove('hidden');
        window.closeCropModal();

        canvas.toBlob(async (blob) => {
            if (!blob) return els.loading.classList.add('hidden');
            await uploadImage(blob, currentCropType);
        }, 'image/webp', 0.85); 
    });

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
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (!file.type.startsWith('image/')) return alert("Selecione um arquivo de imagem válido.");

        currentCropType = type;
        const reader = new FileReader();

        reader.onload = function(e) {
            els.imageToCrop.onload = function() {
                openCropModal(type);
            };
            els.imageToCrop.src = e.target.result;
        }
        reader.readAsDataURL(file);
        input.value = ''; // Permite subir a mesma imagem de novo se errar
    }
}

function openCropModal(type) {
    els.modalCrop.classList.remove('hidden');
    if (cropperInstance) cropperInstance.destroy();

    const isProfile = type === 'profile';
    const aspectRatio = isProfile ? 1 / 1 : 21 / 9; // 1:1 perfil, 21:9 banner
    
    if(isProfile) els.imageToCrop.parentElement.classList.add('cropper-profile-mode');
    else els.imageToCrop.parentElement.classList.remove('cropper-profile-mode');

    cropperInstance = new Cropper(els.imageToCrop, {
        aspectRatio: aspectRatio,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        restore: false,
        guides: !isProfile,
        center: false,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
    });
}

window.closeCropModal = () => {
    els.modalCrop.classList.add('hidden');
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
};

// Funções globais apenas para os botões gerados dinamicamente via innerHTML
window.editNote = (id) => {
    const n = myNotes.find(x => x.id === id);
    if (!n) return;

    els.noteForm.classList.remove('hidden');
    document.getElementById('al-note-id').value = n.id;
    els.noteTitle.value = n.titulo;
    els.noteBody.value = n.conteudo;
    els.noteTagsInp.value = (n.tags || []).join(', ');
    formIsPinned = n.favorita || false;
    window.selectColor(n.color || noteColors[0]);
    els.noteForm.scrollIntoView({ behavior: 'smooth' });
};

window.deleteNote = async (id) => { if (confirm("Apagar nota permanentemente?")) await deleteDoc(doc(db, "anotacoes_pessoais", id)); };
window.togglePin = async (id, val) => { await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: !!val }); };
window.selectColor = (c) => { selectedNoteColor = c; els.noteForm.style.borderLeft = `5px solid ${c}`; };
window.setNoteTag = (t) => { currentTagFilter = t; renderNotes(); };

// ============================================================================
// LÓGICA DO KANBAN DE ATIVIDADES
// ============================================================================

function toggleKanbanForm() {
    const form = document.getElementById('al-kanban-form');
    form.classList.toggle('hidden');

    // Limpa os campos se estiver abrindo o form
    if (!form.classList.contains('hidden')) {
        document.getElementById('al-kanban-id').value = '';
        document.getElementById('al-kanban-title').value = '';
        document.getElementById('al-kanban-body').value = '';
        document.getElementById('al-kanban-title').focus();
    }
}

async function saveKanban() {
    const titulo = document.getElementById('al-kanban-title').value.trim();
    const conteudo = document.getElementById('al-kanban-body').value.trim();
    const id = document.getElementById('al-kanban-id').value;

    if (!titulo) return alert("A tarefa precisa de um título.");

    const payload = {
        titulo: titulo,
        conteudo: conteudo,
        userIdCriador: currentUser.uid,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "kanban_atividades", id), payload);
        } else {
            payload.status = 'a_fazer';
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "kanban_atividades"), payload);
        }
        document.getElementById('al-kanban-form').classList.add('hidden');
    } catch (e) {
        console.error("Erro Kanban:", e);
        alert("Erro ao salvar tarefa.");
    }
}

function renderKanbanBoard() {
    const colTodo = document.getElementById('al-col-todo');
    const colDoing = document.getElementById('al-col-doing');
    const colDone = document.getElementById('al-col-done');

    if (!colTodo || !colDoing || !colDone) return;

    colTodo.innerHTML = ''; colDoing.innerHTML = ''; colDone.innerHTML = '';

    myTasks.forEach(t => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-slate-900 border border-slate-700 rounded-xl cursor-grab shadow-lg hover:-translate-y-1 transition-all relative group';
        div.draggable = true;

        // Se a descrição for longa, permite expandir/encolher (o escapeHTML previne quebra de layout)
        const safeTitle = t.titulo ? t.titulo.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
        const safeBody = t.conteudo ? t.conteudo.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';

        div.innerHTML = `
            <div class="font-bold text-white text-sm pr-6 mb-2 truncate">${safeTitle}</div>
            <div class="k-desc text-xs text-slate-400 whitespace-pre-wrap line-clamp-3 transition-all">${safeBody}</div>
            
            <div class="mt-3 pt-2 border-t border-slate-800 flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="window.editKanbanTask('${t.id}')" class="text-slate-400 hover:text-blue-400"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteKanbanTask('${t.id}')" class="text-slate-500 hover:text-red-500"><i class="fas fa-trash"></i></button>
            </div>
        `;

        // Efeitos de clicar e segurar (Drag Start)
        div.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", t.id);
            draggedTask = t;
            setTimeout(() => div.classList.add('opacity-40', 'scale-95', 'border-purple-500'), 0);
        };
        // Ao soltar (Drag End)
        div.ondragend = () => {
            draggedTask = null;
            div.classList.remove('opacity-40', 'scale-95', 'border-purple-500');
        };

        // Distribui nas colunas baseando-se no status
        if (t.status === 'a_fazer') colTodo.appendChild(div);
        else if (t.status === 'em_progresso') colDoing.appendChild(div);
        else colDone.appendChild(div);
    });
}

// Funções Globais expostas para os botões do Card e para as Colunas
window.editKanbanTask = (id) => {
    const t = myTasks.find(x => x.id === id);
    if (!t) return;
    document.getElementById('al-kanban-form').classList.remove('hidden');
    document.getElementById('al-kanban-id').value = t.id;
    document.getElementById('al-kanban-title').value = t.titulo;
    document.getElementById('al-kanban-body').value = t.conteudo;
    document.getElementById('al-kanban-form').scrollIntoView({ behavior: 'smooth' });
};

window.deleteKanbanTask = async (id) => {
    if (confirm("Apagar tarefa permanentemente?")) {
        await deleteDoc(doc(db, "kanban_atividades", id));
    }
};

window.allowDrop = (e) => {
    e.preventDefault(); // Necessário para o navegador permitir o "Drop"
};

window.drop = async (e, novoStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");

    if (id && draggedTask && draggedTask.status !== novoStatus) {
        try {
            // Atualiza visualmente na mesma hora para o aluno não sentir lag (Opcional, mas muito bom para UX)
            draggedTask.status = novoStatus;
            renderKanbanBoard();

            // Grava no banco de dados Firebase no background
            await updateDoc(doc(db, "kanban_atividades", id), {
                status: novoStatus,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error(error);
            alert("Erro de conexão ao mover a tarefa.");
        }
    }
};

// ============================================================================
// LÓGICA DO CALENDÁRIO ESCOLAR (COM PAINEL LATERAL MODERNO)
// ============================================================================

async function initCalendarSystem() {
    // Exibe botões de Admin/Professor
    const isStaff = currentUser.Admin || currentUser.Professor || currentUser.Coordenacao;
    if (isStaff) {
        document.getElementById('al-btn-add-evt').classList.remove('hidden');
        document.getElementById('al-ev-visib-container').classList.remove('hidden');
    }

    // Botões de Visualização (Mês/Semana)
    document.getElementById('btn-view-month').addEventListener('click', () => switchCalView('month'));
    document.getElementById('btn-view-week').addEventListener('click', () => switchCalView('week'));

    await fetchCalendarEvents();
}

async function fetchCalendarEvents() {
    let queriesCal = [];
    let queriesAva = [];
    const calRef = collection(db, "calendarioAnual");
    const avaRef = collection(db, "avaliacoes");

    // --- 1. LÓGICA DE EVENTOS NORMAIS (calendarioAnual) ---
    queriesCal.push(query(calRef, where("visibilidade", "in", ["publico", "todos"])));

    if (currentUser.turma && currentUser.role === 'aluno') {
        queriesCal.push(query(calRef, where("visibilidade", "==", "turmas_especificas"), where("turmasAlvo", "array-contains", currentUser.turma)));
    }

    const isStaff = currentUser.Admin || currentUser.Professor || currentUser.Coordenacao;
    if (isStaff) {
        queriesCal.push(query(calRef, where("instrutorUID", "==", currentUser.uid)));
    }

    // --- 2. LÓGICA DE AVALIAÇÕES (Provas e Trabalhos) ---
    if (isStaff) {
        // Professor/Coord/Admin veem TODAS as avaliações cadastradas de todas as turmas
        queriesAva.push(query(avaRef));
    } else if (currentUser.turma && currentUser.role === 'aluno') {
        // Aluno vê apenas as da sua turma e que o professor marcou para exibir
        queriesAva.push(query(avaRef, where("turmas_ids", "array-contains", currentUser.turma), where("exibir", "==", true)));
    }

    try {
        // Executa as buscas de calendário e avaliações paralelamente
        const resultsCal = await Promise.all(queriesCal.map(q => getDocs(q)));
        const resultsAva = await Promise.all(queriesAva.map(q => getDocs(q)));
        
        const uniqueEvents = new Map();

        // Insere Eventos Comuns no Calendário
        resultsCal.forEach(snap => {
            snap.forEach(doc => uniqueEvents.set(doc.id, { id: doc.id, ...doc.data() }));
        });

        // Modela e insere as Avaliações disfarçadas de eventos no Calendário
        resultsAva.forEach(snap => {
            snap.forEach(doc => {
                const data = doc.data();
                const nomeDisc = disciplineMap[data.disciplina] || data.disciplina;
                
                uniqueEvents.set(doc.id, {
                    id: doc.id,
                    titulo: `Prova: ${nomeDisc}`, // Título adaptado
                    dataInicio: data.dataAplicacao, // Mapeia o campo da avaliação para o que o calendário lê
                    descricao: `Conteúdo: ${data.conteudo || 'Sem descrição'}\nValor: ${data.valorPontos || 0} pts\nDicas: ${data.dicasProf || ''}`,
                    cor: '#f59e0b', // Cor Laranja/Âmbar fixa para dar destaque às provas
                    visibilidade: 'turmas_especificas',
                    isAvaliacao: true, // FLAG IMPORTANTE: Impede edição via painel do aluno
                    ...data
                });
            });
        });

        calEvents = Array.from(uniqueEvents.values());
        renderCalendarGrid();
    } catch (e) { 
        console.error("Erro no calendário:", e); 
    }
}

function renderCalendarGrid() {
    const grid = document.getElementById('al-cal-grid');
    const title = document.getElementById('al-cal-month');
    grid.innerHTML = '';
    title.textContent = calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    let daysToRender = [];

    if (calView === 'month') {
        const year = calDate.getFullYear();
        const month = calDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6;

        for (let i = 0; i < startDay; i++) if (i < 5) daysToRender.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const current = new Date(year, month, d);
            if (current.getDay() >= 1 && current.getDay() <= 5) daysToRender.push(current);
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

        for (let i = 0; i < 5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            daysToRender.push(d);
        }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    daysToRender.forEach(date => {
        const cell = document.createElement('div');

        if (!date) {
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
                } catch (e) { return false; }
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
    if (calView === 'month') calDate.setMonth(calDate.getMonth() + dir);
    else calDate.setDate(calDate.getDate() + (dir * 7));
    fetchCalendarEvents();
}

// === PAINEL LATERAL DO CALENDÁRIO ===
window.openCalModal = (event = null, dateStr = null) => {
    const modal = document.getElementById('al-modal-cal');
    const panel = document.getElementById('al-modal-panel');
    const isStaff = currentUser.Admin || currentUser.Coordenacao || currentUser.Professor;

    if (!event && !isStaff) return; // Aluno não cria

    // Limpa / Preenche campos
    const inps = ['al-ev-title', 'al-ev-date', 'al-ev-desc', 'al-ev-color', 'al-ev-visib'];

    if (event) {
        document.getElementById('al-ev-id').value = event.id;
        document.getElementById('al-ev-title').value = event.titulo;
        document.getElementById('al-ev-date').value = event.dataInicio?.toDate().toISOString().split('T')[0];
        
        // Se for avaliação e o usuário for gestão, avisa onde ele deve editar
        let descText = event.descricao || '';
        if(event.isAvaliacao && isStaff) {
            descText = "⚠️ Atenção: Esta é uma Avaliação.\nPara editá-la, acesse a aba Professor Tech > Provas/Trabalhos.\n\n" + descText;
        }
        document.getElementById('al-ev-desc').value = descText;
        
        document.getElementById('al-ev-color').value = event.cor || '#3b82f6';
        document.getElementById('al-ev-visib').value = event.visibilidade || 'todos';

        // NOVA REGRA: Só edita se for staff, for o dono (ou admin) E NÃO FOR UMA AVALIAÇÃO
        const canEdit = isStaff && (currentUser.Admin || event.instrutorUID === currentUser.uid) && !event.isAvaliacao;
        
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
    setTimeout(() => panel.classList.remove('translate-x-full'), 10);
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
    if (!title || !dateVal) return alert("Título e Data são obrigatórios");

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

    if (visib === 'turmas_especificas' && currentUser.turma) payload.turmasAlvo = [currentUser.turma];

    const id = document.getElementById('al-ev-id').value;
    if (id) await updateDoc(doc(db, "calendarioAnual", id), payload);
    else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, "calendarioAnual"), payload); }

    closeCalModal();
    fetchCalendarEvents();
}

async function deleteCalendarEvent() {
    const id = document.getElementById('al-ev-id').value;
    if (id && confirm("Excluir evento do calendário?")) {
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

    if (!snap.exists()) {
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
    for (const [id, tr] of Object.entries(studentGradesData)) {
        // Usa title para mostrar o nome completo se o mouse passar por cima
        const nome = disciplineMap[id] || id;
        html += `<tr class="bg-slate-900/10 hover:bg-slate-900/50 transition-colors">
            <td class="font-bold text-slate-300 text-xs p-3 border border-slate-700 truncate max-w-[200px]" title="${nome}">${nome}</td>
            <td class="border border-slate-700 text-center py-2">${tr['1']?.nota1 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['1']?.nota2 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['1']?.nota3 || '-'}</td><td class="border border-slate-700 text-center py-2 bg-slate-900/30 font-bold">${tr['1']?.nota4 || '-'}</td>
            <td class="border border-slate-700 text-center py-2">${tr['2']?.nota1 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['2']?.nota2 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['2']?.nota3 || '-'}</td><td class="border border-slate-700 text-center py-2 bg-slate-900/30 font-bold">${tr['2']?.nota4 || '-'}</td>
            <td class="border border-slate-700 text-center py-2">${tr['3']?.nota1 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['3']?.nota2 || '-'}</td><td class="border border-slate-700 text-center py-2">${tr['3']?.nota3 || '-'}</td><td class="border border-slate-700 text-center py-2 bg-slate-900/30 font-bold">${tr['3']?.nota4 || '-'}</td>
            <td class="media-final-col text-blue-400 font-bold border border-slate-700 text-center py-2 bg-blue-900/10">---</td>
        </tr>`;
    }
    els.boletimBody.innerHTML = html;

    renderScatterChart();
    renderEvolutionChart();
}

async function loadFrequencia() {
    if (!currentUser.turma) return;
    const q = query(collection(db, "presencas"), where("turma", "==", currentUser.turma));
    const snap = await getDocs(q);
    let p = 0, f = 0;
    snap.forEach(d => { const reg = d.data().registros || {}; if (reg[currentUser.uid] === 'presente') p++; else if (reg[currentUser.uid] === 'ausente') f++; });
    const total = p + f;
    const perc = total > 0 ? Math.round((p / total) * 100) : 100;
    els.freqPerc.textContent = `${perc}%`;
    els.freqTotal.textContent = `${f} Faltas`;

    // Gráfico de Frequência
    if (chartInstances['freq']) chartInstances['freq'].destroy();
    const ctx = document.getElementById('al-chart-freq').getContext('2d');
    chartInstances['freq'] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Presente', 'Faltas'], datasets: [{ data: [p, f], backgroundColor: ['#4ade80', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } } }
    });
}

function renderScatterChart() {
    if (!studentGradesData) return;
    const pts = [];
    Object.entries(studentGradesData).forEach(([dId, tr]) => {
        ['1', '2', '3'].forEach(t => ['nota1', 'nota2', 'nota3', 'nota4'].forEach((k, i) => {
            const v = parseFloat((tr[t] || {})[k]);
            if (!isNaN(v)) pts.push({ x: Math.random() * 10, y: v, label: `${disciplineMap[dId] || dId} (T${t}-N${i + 1})` });
        }));
    });
    const ctx = document.getElementById('al-chart-scatter').getContext('2d');
    if (chartInstances['scatter']) chartInstances['scatter'].destroy();
    chartInstances['scatter'] = new Chart(ctx, {
        type: 'scatter', data: { datasets: [{ label: 'Notas', data: pts, backgroundColor: c => c.raw?.y >= 6 ? '#4ade80' : '#ef4444', pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { min: 0, max: 10, grid: { color: '#334155' } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw.label}: ${c.raw.y}` } } } }
    });
}

function renderEvolutionChart(discId = "") {
    if (!studentGradesData) return;
    let dVals = [];
    if (discId) {
        const tr = studentGradesData[discId] || {};
        ['1', '2', '3'].forEach(t => ['nota1', 'nota2', 'nota3', 'nota4'].forEach(k => { const v = parseFloat((tr[t] || {})[k]); dVals.push(isNaN(v) ? null : v); }));
    } else {
        const s = Array(12).fill(0), c = Array(12).fill(0);
        Object.values(studentGradesData).forEach(tr => { let idx = 0;['1', '2', '3'].forEach(t => ['nota1', 'nota2', 'nota3', 'nota4'].forEach(k => { const v = parseFloat((tr[t] || {})[k]); if (!isNaN(v)) { s[idx] += v; c[idx]++; } idx++; })); });
        dVals = s.map((sm, i) => c[i] ? (sm / c[i]) : null);
    }
    const ctx = document.getElementById('al-chart-evol').getContext('2d');
    if (chartInstances['evol']) chartInstances['evol'].destroy();
    chartInstances['evol'] = new Chart(ctx, {
        type: 'line', data: { labels: ['T1N1', 'T1N2', 'T1N3', 'T1N4', 'T2N1', 'T2N2', 'T2N3', 'T2N4', 'T3N1', 'T3N2', 'T3N3', 'T3N4'], datasets: [{ label: discId ? (disciplineMap[discId] || discId) : 'Média', data: dVals, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 10, grid: { color: '#334155' } }, x: { grid: { color: '#334155' } } } }
    });
}

// ============================================================================
// LÓGICA DO CADERNO DIGITAL (LAYOUT 3 COLUNAS)
// ============================================================================

let activeNoteId = null;

function initNotebookSystem() {
    if (notesUnsubscribe) return;
    renderColorPicker();

    const q = query(
        collection(db, "anotacoes_pessoais"),
        or(
            where("userId", "==", currentUser.uid),
            where("sharedWithUserIds", "array-contains", currentUser.uid)
        )
    );

    notesUnsubscribe = onSnapshot(q, (snapshot) => {
        myNotes = [];
        snapshot.forEach(doc => { myNotes.push({ id: doc.id, ...doc.data() }); });
        myNotes.sort((a, b) => {
            const timeA = a.updatedAt?.toMillis() || Date.now();
            const timeB = b.updatedAt?.toMillis() || Date.now();
            return timeB - timeA;
        });
        updateTagFilters();
        renderNotes();
        if (!activeNoteId) showEmptyNoteState();
    });

    els.noteSearch?.addEventListener('input', () => { renderNotes(); });

    // Listener Recebidas
    document.getElementById('btn-filter-recebidas')?.addEventListener('click', () => {
        resetSidebarFilters();
        document.getElementById('btn-filter-recebidas').classList.add('bg-indigo-500/20', 'border-indigo-500/50', 'text-indigo-300');
        currentTagFilter = 'recebidas';
        document.getElementById('al-note-approval-state')?.classList.add('hidden');
        renderNotes();
        showEmptyNoteState();
    });

    // Listener Pendentes
    document.getElementById('btn-filter-pendentes')?.addEventListener('click', () => {
        resetSidebarFilters();
        document.getElementById('btn-filter-pendentes').classList.add('bg-amber-500/20', 'border-amber-500/50', 'text-amber-300');
        currentTagFilter = 'pendentes';
        activeNoteId = null;
        renderNotes();
        window.mostrarCentralAprovacao();
    });
}

function resetSidebarFilters() {
    document.querySelectorAll('#al-notebook-tags button, #btn-filter-recebidas, #btn-filter-pendentes').forEach(btn => {
        btn.classList.remove('bg-blue-600/20', 'text-blue-400', 'border-blue-500/30', 'bg-indigo-500/20', 'border-indigo-500/50', 'text-indigo-300', 'bg-amber-500/20', 'border-amber-500/50', 'text-amber-300');
        btn.classList.add('text-slate-400', 'border-transparent');
    });
}

// 1. Ao clicar em "+" Nova Anotação
function createNewNote() {
    // 1. RESET DE INTERFACE: Oculta aprovações e o estado vazio, mostra o editor
    document.getElementById('al-note-approval-state')?.classList.add('hidden');
    document.getElementById('al-note-empty-state')?.classList.add('hidden');
    
    const activeState = document.getElementById('al-note-active-state');
    if (activeState) {
        activeState.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        activeState.classList.add('flex');
    }

    // 2. LIMPEZA DE DADOS: Zera o estado interno e os campos do DOM
    activeNoteId = null;
    formIsPinned = false;
    selectedNoteColor = '#3b82f6';

    els.noteActiveId.value = '';
    els.noteActiveTitle.value = '';
    els.noteActiveBody.value = '';
    els.noteActiveTags.value = '';
    
    // Reseta o seletor de cores para a cor padrão
    renderColorPicker(); 
    if (activeState) activeState.style.borderTop = `4px solid ${selectedNoteColor}`;

    // 3. CONTROLE DE BOTÕES E INFOS
    const btnSave = document.getElementById('btn-note-save');
    const senderInfoDiv = document.getElementById('al-note-sender-info');

    if (btnSave) btnSave.classList.remove('hidden');
    if (senderInfoDiv) {
        senderInfoDiv.classList.add('hidden');
        senderInfoDiv.classList.remove('flex');
    }

    // 4. FINALIZAÇÃO VISUAL
    updatePinIconVisuals();
    
    // Remove qualquer destaque de seleção da lista de notas da coluna 2
    document.querySelectorAll('[id^="note-item-"]').forEach(el => {
        el.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-900/20', 'border-blue-500');
    });

    els.noteActiveTitle.focus();
}

// 2. Ao clicar numa anotação da lista (Coluna 2)
window.selectNote = async (id) => {
    // --- RESET DE INTERFACE: Garante que o editor apareça e a aprovação suma ---
    document.getElementById('al-note-approval-state')?.classList.add('hidden');
    document.getElementById('al-note-empty-state')?.classList.add('hidden');
    
    const activeState = document.getElementById('al-note-active-state');
    if (activeState) {
        activeState.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        activeState.classList.add('flex');
    }
    // --------------------------------------------------------------------------

    const n = myNotes.find(x => x.id === id);
    if (!n) return;

    activeNoteId = n.id;
    formIsPinned = !!n.favorita;
    selectedNoteColor = n.color || '#3b82f6';

    // Preenche o painel da direita para edição imediata
    els.noteActiveId.value = n.id;
    els.noteActiveTitle.value = n.titulo || '';
    els.noteActiveBody.value = n.conteudo || '';
    els.noteActiveTags.value = (n.tags || []).join(', ');
    els.noteColorPicker.value = selectedNoteColor;

    renderColorPicker(); // Força a atualização visual da bolinha de cor
    if (activeState) activeState.style.borderTop = `4px solid ${selectedNoteColor}`; // Borda superior do painel
    
    updatePinIconVisuals();
    showActiveNoteState();

    // Coloca a bordinha azul na nota selecionada da lista
    document.querySelectorAll('[id^="note-item-"]').forEach(el => el.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-900/20', 'border-blue-500'));
    document.getElementById(`note-item-${id}`)?.classList.add('bg-blue-900/20', 'border-blue-500');

    // Controle do Selo de Remetente com Busca no Banco 
    const senderInfoDiv = document.getElementById('al-note-sender-info');
    const senderNameEl = document.getElementById('al-note-sender-name');
    const senderEmailEl = document.getElementById('al-note-sender-email');
    const btnSave = document.getElementById('btn-note-save');

    // Verifica se a nota tem um autor diferente do usuário logado (nota recebida)
    if (n.userId && n.userId !== currentUser.uid) {
        if(senderInfoDiv) {
            senderInfoDiv.classList.remove('hidden');
            senderInfoDiv.classList.add('flex');
        }
        
        // Coloca um estado de carregamento rápido enquanto vai no banco de dados
        if(senderNameEl) senderNameEl.textContent = 'Buscando usuário...'; 
        if(senderEmailEl) senderEmailEl.textContent = ''; 
        
        try {
            // CRUZA OS DADOS: Busca o perfil real de quem enviou na coleção "users"
            const userSnap = await getDoc(doc(db, "users", n.userId));
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if(senderNameEl) senderNameEl.textContent = userData.nome || 'Usuário sem nome'; 
                // Exibe o email se existir na modelagem do banco (ou exibe a matrícula/turma se preferir)
                if(senderEmailEl) senderEmailEl.textContent = userData.email ? `(${userData.email})` : ''; 
            } else {
                if(senderNameEl) senderNameEl.textContent = 'Usuário não encontrado';
            }
        } catch(e) {
            console.error("Erro ao buscar autor da nota:", e);
            if(senderNameEl) senderNameEl.textContent = 'Erro ao identificar';
        }
        
        // Oculta botão de salvar se a nota for de outra pessoa (modo leitura)
        if(btnSave) btnSave.classList.add('hidden');
    } else {
        // Se a nota for própria do usuário
        if(senderInfoDiv) {
            senderInfoDiv.classList.add('hidden');
            senderInfoDiv.classList.remove('flex');
        }
        
        // Garante que o botão de salvar esteja visível para editar a própria nota
        if(btnSave) btnSave.classList.remove('hidden');
    }
};

// 3. Renderiza a Lista (Coluna 2)
function renderNotes() {
    if (!els.noteList) return;
    const search = els.noteSearch.value.toLowerCase();

    const filtered = myNotes.filter(n => {
        const textMatch = (n.titulo || '').toLowerCase().includes(search) || (n.conteudo || '').toLowerCase().includes(search);
        const statusParaMim = n.statusDestinatarios?.[currentUser.uid] || 'Pendente';

        // REGRA MESTRA: Se o usuário recusou, a nota some.
        if (n.userId !== currentUser.uid && statusParaMim === 'Recusado') return false;

        let tagMatch = false;
        if (currentTagFilter === 'all') {
            tagMatch = (n.userId === currentUser.uid) || (statusParaMim === 'Enviado');
        } else if (currentTagFilter === 'recebidas') {
            tagMatch = (n.userId !== currentUser.uid) && (statusParaMim === 'Enviado');
        } else if (currentTagFilter === 'pendentes') {
            tagMatch = (n.userId !== currentUser.uid) && (statusParaMim === 'Pendente');
        } else {
            tagMatch = (n.tags && n.tags.includes(currentTagFilter)) && ((n.userId === currentUser.uid) || statusParaMim === 'Enviado');
        }
        
        return textMatch && tagMatch;
    });
    
    filtered.sort((a, b) => (b.favorita ? 1 : 0) - (a.favorita ? 1 : 0));

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (filtered.length === 0) {
        els.noteList.innerHTML = '<div class="text-center text-slate-500 py-10 italic text-sm">Nenhuma nota aqui.</div>';
        document.getElementById('notes-pagination').classList.add('hidden');
        return;
    }

    els.noteList.innerHTML = paginated.map(n => {
        const isActive = n.id === activeNoteId ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700/80';
        
        const safeTitle = purify ? purify.sanitize(n.titulo || 'Sem Título') : escapeHTML(n.titulo || 'Sem Título');
        const safeContent = purify ? purify.sanitize(n.conteudo || '') : escapeHTML(n.conteudo || '');
        
        // VISÃO DO REMETENTE: Etiquetas de Status (Nova Lógica)
        let statusHtml = '';
        if (n.userId === currentUser.uid && n.sharedWithUserIds && n.sharedWithUserIds.length > 0) {
            const stats = Object.values(n.statusDestinatarios || {});
            const hasRecused = stats.includes('Recusado');
            const hasPending = stats.includes('Pendente');
            
            statusHtml += '<div class="flex gap-1.5 mt-1.5">';
            if (hasRecused) statusHtml += '<span class="text-[8px] bg-red-500/20 border border-red-500/30 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Recusada(s)</span>';
            if (hasPending) statusHtml += '<span class="text-[8px] bg-amber-500/20 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Pendente(s)</span>';
            if (!hasRecused && !hasPending) statusHtml += '<span class="text-[8px] bg-green-500/20 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Aceita(s)</span>';
            statusHtml += '</div>';
        }

        return `
        <div id="note-item-${n.id}" onclick="window.selectNote('${n.id}')" class="p-3 border-l-4 rounded-r-xl border-t border-b border-r cursor-pointer transition-all flex flex-col gap-1 mb-2 ${isActive}" style="border-left-color: ${n.color||'#3b82f6'}">
            
            <div class="flex justify-between items-start gap-2">
                <div class="flex flex-col flex-grow min-w-0">
                    <div class="flex items-center gap-2">
                        <h4 class="text-white font-bold text-xs truncate">${safeTitle}</h4>
                        ${n.userId !== currentUser.uid ? '<span class="shrink-0 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest">Recebida</span>' : ''}
                    </div>
                    ${statusHtml} </div>
                ${n.favorita ? '<i class="fas fa-thumbtack text-blue-400 text-[10px] shrink-0 mt-0.5"></i>' : ''}
            </div>

            <div class="text-slate-500 text-[10px] line-clamp-2 leading-tight mt-1">${safeContent}</div>
        </div>
    `}).join('');
    
    const pagWrapper = document.getElementById('notes-pagination');
    if (totalPages > 1) {
        pagWrapper.classList.replace('hidden', 'flex');
        document.getElementById('page-indicator').textContent = `${currentPage} / ${totalPages}`;
        document.getElementById('btn-prev-page').onclick = () => { currentPage--; renderNotes(); };
        document.getElementById('btn-next-page').onclick = () => { currentPage++; renderNotes(); };
        document.getElementById('btn-prev-page').disabled = currentPage === 1;
        document.getElementById('btn-next-page').disabled = currentPage === totalPages;
    } else {
        pagWrapper.classList.replace('flex', 'hidden');
    }
}

// 4. Renderiza as Pastas/Tags (Coluna 1)
function updateTagFilters() {
    const allTags = new Set();
    myNotes.forEach(n => (n.tags || []).forEach(t => allTags.add(t)));

    const renderFolder = (tag, label, icon) => `
        <button onclick="window.setNoteTag('${tag}')" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${currentTagFilter === tag ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-700 hover:text-white border border-transparent'}">
            <i class="${icon} w-4 text-center"></i> <span class="truncate">${label}</span>
        </button>
    `;

    let html = renderFolder('all', 'Todas as Notas', 'fas fa-book');

    Array.from(allTags).sort().forEach(tag => {
        html += renderFolder(tag, tag.toUpperCase(), 'fas fa-hashtag opacity-50');
    });

    if (els.noteTags) els.noteTags.innerHTML = html;
}

window.setNoteTag = (tag) => {
    currentTagFilter = tag;
    updateTagFilters();
    renderNotes();
};

// 5. Salvar a nota atual
async function saveNote() {
    const titulo = els.noteActiveTitle.value.trim();
    const conteudo = els.noteActiveBody.value.trim();
    if (!titulo && !conteudo) return alert("Escreva algo na anotação!");

    const payload = {
        titulo: titulo,
        conteudo: conteudo,
        userId: currentUser.uid,
        color: selectedNoteColor,
        favorita: formIsPinned,
        updatedAt: serverTimestamp(),
        tags: els.noteActiveTags.value.split(',').map(t => t.trim()).filter(t => t)
    };

    const id = els.noteActiveId.value;

    try {
        if (id) {
            await updateDoc(doc(db, "anotacoes_pessoais", id), payload);
        } else {
            payload.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, "anotacoes_pessoais"), payload);
            activeNoteId = docRef.id;
            els.noteActiveId.value = activeNoteId;
        }

        // Efeito de Botão Salvo
        const btn = document.getElementById('btn-note-save');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
        btn.classList.replace('bg-blue-600', 'bg-green-600');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.replace('bg-green-600', 'bg-blue-600');
        }, 2000);

    } catch (e) { alert("Erro ao salvar anotação."); }
}

// 6. Excluir nota atual
async function deleteActiveNote() {
    const id = els.noteActiveId.value;
    if (!id) { showEmptyNoteState(); return; } // Se for nova e não salva, só limpa
    if (confirm("Deseja apagar esta anotação permanentemente?")) {
        await deleteDoc(doc(db, "anotacoes_pessoais", id));
        activeNoteId = null;
        showEmptyNoteState();
    }
}

// 7. Fixar nota atual (Pin)
async function toggleActiveNotePin() {
    const id = els.noteActiveId.value;
    formIsPinned = !formIsPinned;
    updatePinIconVisuals();
    // Se a nota já existir no banco, salva o pin na hora
    if (id) await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: formIsPinned });
}

function updatePinIconVisuals() {
    const btn = document.getElementById('btn-note-pin');
    if (formIsPinned) {
        btn.classList.replace('text-slate-500', 'text-blue-400');
        btn.classList.add('bg-blue-900/30', 'border', 'border-blue-500/50');
    } else {
        btn.classList.replace('text-blue-400', 'text-slate-500');
        btn.classList.remove('bg-blue-900/30', 'border', 'border-blue-500/50');
    }
}

// 8. Compartilhar
function shareActiveNote() {
    const id = els.noteActiveId.value;
    if (!id) return alert("Salve a anotação antes de tentar compartilhar!");

    const email = prompt("Digite o e-mail do aluno que deseja compartilhar (ou código da turma):");
    if (email) {
        // Placeholder para sua futura função de cache de turmas!
        alert(`O sistema está pronto para enviar a nota para ${email}. Lógica de cache será anexada na próxima sprint!`);
    }
}

// Utilitários de Interface (Alternar entre as telas da 3ª Coluna)
function showEmptyNoteState() {
    els.noteEmptyState.classList.remove('hidden');
    els.noteActiveState.classList.add('opacity-0', 'pointer-events-none');
}

function showActiveNoteState() {
    els.noteEmptyState.classList.add('hidden');
    els.noteActiveState.classList.remove('opacity-0', 'pointer-events-none');
}

// --- LÓGICA DE CORES FIXAS ---
function renderColorPicker() {
    const container = document.getElementById('al-note-colors');
    if (!container) return;
    container.innerHTML = noteColors.map(c => `
        <button onclick="window.selectColor('${c}')" class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center shadow-md ${selectedNoteColor === c ? 'border-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'border-transparent'}" style="background-color: ${c}">
            ${selectedNoteColor === c ? '<i class="fas fa-check text-[10px] text-white drop-shadow-md"></i>' : ''}
        </button>
    `).join('');
}

window.selectColor = (c) => {
    selectedNoteColor = c;
    renderColorPicker();
    // Atualiza a borda do painel direito em tempo real
    els.noteActiveState.style.borderTop = `4px solid ${c}`;
};

// --- LÓGICA DE COMPARTILHAMENTO (BUSCA DE ALUNOS E PROFESSORES) ---
window.openShareModal = async () => {
    const noteId = els.noteActiveId.value;
    if (!noteId) return alert("Salve a anotação primeiro para poder compartilhar!");

    document.getElementById('al-modal-share').classList.remove('hidden');
    const resultsContainer = document.getElementById('al-share-results');
    resultsContainer.innerHTML = '<div class="text-center text-slate-500 py-6"><i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br>Buscando usuários...</div>';

    if (usersCacheForShare.length === 0) {
        try {
            const isStaff = currentUser.Admin || currentUser.Professor || currentUser.Coordenacao;
            let fetchedUsers = [];

            if (isStaff) {
                // Staff (Professor/Admin) vê todo mundo cadastrado
                const snap = await getDocs(collection(db, "users"));
                fetchedUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            } else {
                // Aluno vê a própria turma + Todos os Professores
                if (!currentUser.turma) throw new Error("Você não possui uma turma vinculada.");

                const qTurma = query(collection(db, "users"), where("turma", "==", currentUser.turma));
                const qProfs = query(collection(db, "users"), where("Professor", "==", true));

                const [snapTurma, snapProfs] = await Promise.all([getDocs(qTurma), getDocs(qProfs)]);

                // Usa um Map para evitar professores que já caíram na regra da turma (duplicatas)
                const mapUsers = new Map();
                snapTurma.forEach(d => mapUsers.set(d.id, { uid: d.id, ...d.data() }));
                snapProfs.forEach(d => mapUsers.set(d.id, { uid: d.id, ...d.data() }));

                fetchedUsers = Array.from(mapUsers.values());
            }

            // Remove o próprio usuário da lista
            usersCacheForShare = fetchedUsers.filter(u => u.uid !== currentUser.uid);

            // Coloca os professores primeiro na lista
            usersCacheForShare.sort((a, b) => (b.Professor ? 1 : 0) - (a.Professor ? 1 : 0));

        } catch (e) {
            resultsContainer.innerHTML = `<div class="text-red-400 text-center py-4 font-bold"><i class="fas fa-exclamation-triangle"></i> Erro: ${e.message}</div>`;
            return;
        }
    }

    window.renderShareResults('');
};

window.closeShareModal = () => {
    document.getElementById('al-modal-share').classList.add('hidden');
    document.getElementById('al-share-search').value = '';
};

// Listener para a barra de pesquisa
document.getElementById('al-share-search')?.addEventListener('input', (e) => window.renderShareResults(e.target.value));

window.renderShareResults = (searchTerm) => {
    const container = document.getElementById('al-share-results');
    const term = searchTerm.toLowerCase();
    const filtered = usersCacheForShare.filter(u => (u.nome || '').toLowerCase().includes(term));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-slate-500 text-center py-4 text-sm italic">Nenhum aluno encontrado.</div>';
        return;
    }

    const activeNote = myNotes.find(n => n.id === els.noteActiveId.value);
    const sharedList = activeNote?.sharedWithUserIds || [];

    container.innerHTML = filtered.map(u => {
        const isShared = sharedList.includes(u.uid);
        const pic = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nome)}&background=1e293b&color=3b82f6`;

        return `
            <div class="flex items-center justify-between bg-slate-950 p-3 rounded-xl border ${isShared ? 'border-blue-500/50' : 'border-slate-800'} transition-colors">
                <div class="flex items-center gap-3">
                    <img src="${pic}" class="w-8 h-8 rounded-full border border-slate-700 object-cover">
                    <div>
                        <div class="text-white text-xs font-bold">${escapeHTML(u.nome)}</div>
                        <div class="text-slate-500 text-[10px]"><i class="fas fa-users text-blue-500"></i> ${u.turma || 'Sem turma'}</div>
                    </div>
                </div>
                <button onclick="window.toggleShareNote('${u.uid}')" class="${isShared ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/30' : 'bg-slate-800 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white'} px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors w-24 text-center">
                    ${isShared ? 'Remover' : 'Enviar'}
                </button>
            </div>
        `;
    }).join('');
};

window.toggleShareNote = async (targetUid) => {
    const noteId = els.noteActiveId.value;
    const note = myNotes.find(n => n.id === noteId);
    if (!note) return;

    let sharedList = [...(note.sharedWithUserIds || [])]; // Copia o array

    if (sharedList.includes(targetUid)) {
        sharedList = sharedList.filter(id => id !== targetUid);
    } else {
        sharedList.push(targetUid);
    }

    try {
        await updateDoc(doc(db, "anotacoes_pessoais", noteId), { sharedWithUserIds: sharedList });
        // O onSnapshot do banco vai atualizar a interface automaticamente, mas para o visual ser instantâneo:
        note.sharedWithUserIds = sharedList;
        window.renderShareResults(document.getElementById('al-share-search').value);
    } catch (e) {
        alert("Erro de permissão: " + e.message);
    }
};





function initKanbanSystem() {
    if (kanbanUnsub) return;

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
    
    // Remove destaques anteriores
    document.querySelectorAll('.horario-tabela th').forEach(th => th.classList.remove('bg-blue-600', 'text-white'));
    document.querySelectorAll('.horario-tabela td').forEach(td => td.classList.remove('bg-blue-900/20'));

    if(diaHoje >= 1 && diaHoje <= 5) {
        const idHoje = diasIds[diaHoje - 1];
        const th = document.querySelector(`th[data-dia-id="${idHoje}"]`);
        const td = document.getElementById(`cell-${idHoje}`);
        
        if(th) {
            th.classList.add('bg-blue-600', 'text-white');
            th.style.color = '#ffffff'; 
        }
        if(td) td.classList.add('bg-blue-900/20');
    }

    // 3. Busca os dados no Firebase dependendo de quem está logado
    let q;
    if (currentUser.Professor) {
        // Se for professor, busca todas as aulas onde ele está alocado
        q = query(collection(db, "aulas"), where("professorNome", "==", currentUser.nome), orderBy("ordem"));
    } else {
        // Se for aluno, busca as aulas da turma dele
        q = query(collection(db, "aulas"), where("turmaId", "==", currentUser.turma || '---'), orderBy("ordem"));
    }

    try {
        const snap = await getDocs(q);
        els.horarioMsg.style.display = snap.empty ? 'block' : 'none';
        
        // 4. Preenche as aulas
        snap.forEach(doc => {
            const a = doc.data(); 
            
            // FIX DO DIA: Garante que "segunda" vire "segunda-feira" para achar o ID no HTML
            let diaDB = (a.diaSemana || '').toLowerCase();
            if (!diaDB.includes('-feira')) diaDB += '-feira';
            
            const cell = document.getElementById(`cell-${diaDB}`);
            
            if(cell) {
                // Truque de UX: Se for o professor olhando, mostra a Turma. Se for aluno, mostra o Professor.
                const subTexto = currentUser.Professor 
                    ? `<i class="fas fa-users mr-1"></i> Turma: ${a.turmaId}` 
                    : `<i class="fas fa-chalkboard-teacher mr-1"></i> ${a.professorNome}`;

                cell.innerHTML += `
                    <div class="aula-card p-3 bg-slate-900/80 border-l-4 border-blue-500 mb-3 rounded-lg shadow-md transition hover:-translate-y-1">
                        <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">${a.ordem}ª - ${disciplineMap[a.disciplina]||a.disciplina}</h4>
                        <p class="text-[10px] font-bold text-blue-400 mt-1.5">${subTexto}</p>
                    </div>
                `;
            }
        });
    } catch (error) {
        console.error("Erro ao carregar horário:", error);
        els.horarioMsg.textContent = "Erro ao carregar a grade horária.";
        els.horarioMsg.style.display = 'block';
    }
}

window.renderCalendarGrid = () => {
    const grid = document.getElementById('al-cal-grid');
    document.getElementById('al-cal-month').textContent = calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    grid.innerHTML = '';

    let daysToRender = [];

    if (calView === 'month') {
        const year = calDate.getFullYear(), month = calDate.getMonth();
        const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6;

        for (let i = 0; i < startDay; i++) if (i < 5) daysToRender.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const current = new Date(year, month, d);
            if (current.getDay() >= 1 && current.getDay() <= 5) daysToRender.push(current);
        }
        document.getElementById('cal-header-row').classList.remove('hidden');
        grid.className = 'grid grid-cols-5 bg-slate-900 border border-slate-700 rounded-b-xl overflow-hidden';
    } else {
        document.getElementById('cal-header-row').classList.add('hidden');
        grid.className = 'flex flex-col gap-3 bg-transparent border-none';

        const current = new Date(calDate), day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(current.setDate(diff));

        for (let i = 0; i < 5; i++) {
            const d = new Date(monday); d.setDate(monday.getDate() + i); daysToRender.push(d);
        }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    daysToRender.forEach(date => {
        const cell = document.createElement('div');
        if (!date) {
            cell.className = 'min-h-[120px] bg-slate-900/30 border-r border-b border-slate-800 pointer-events-none';
        } else {
            const dateStr = date.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;

            cell.className = `min-h-[120px] p-2 border-r border-b border-slate-700 relative flex flex-col cursor-pointer transition-colors ${calView === 'week' ? 'rounded-xl border' : ''} hover:bg-slate-800/50 ${isToday ? 'bg-blue-900/20' : 'bg-slate-900'}`;

            cell.innerHTML = `<span class="self-end text-sm font-bold mb-2 ${isToday ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-slate-500'}">${calView === 'week' ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }) : date.getDate()}</span>`;

            // Verifica e Injeta os Eventos
            const dayEvents = calEvents.filter(ev => {
                if (!ev.dataInicio) return false;
                try {
                    const evDate = ev.dataInicio.toDate ? ev.dataInicio.toDate() : new Date(ev.dataInicio);
                    return evDate.toISOString().split('T')[0] === dateStr;
                } catch (e) { return false; }
            });

            dayEvents.forEach(ev => {
                const badge = document.createElement('div');
                badge.className = 'text-[10px] font-bold text-white px-2 py-1.5 rounded shadow-md mb-1 truncate flex items-center justify-between group hover:brightness-110 transition-all';
                badge.style.backgroundColor = ev.cor || '#3b82f6';
                badge.innerHTML = `<span>${ev.titulo}</span> <span class="hidden group-hover:inline opacity-70"><i class="fas fa-eye"></i></span>`;

                // Aqui removemos o perfilTech, usamos a função direta
                badge.onclick = (e) => { e.stopPropagation(); openCalModal(ev); };
                cell.appendChild(badge);
            });

            // Aqui também removemos o perfilTech
            cell.onclick = () => openCalModal(null, dateStr);
        }
        grid.appendChild(cell);
    });
};

async function renderBanner() {
    els.txtName.textContent = currentUser.nome || 'Membro';
    els.txtClass.innerHTML = `<i class="fas fa-graduation-cap"></i> Turma: ${currentUser.turma || '---'}`;
    const pic = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nome)}&background=1e293b&color=3b82f6`;
    els.imgProfile.src = pic;
    if (currentUser.coverImageURL) els.bgCover.style.backgroundImage = `url('${currentUser.coverImageURL}')`;

    // ==========================================
    // NOVA LÓGICA DE RENDERIZAÇÃO DE TÍTULOS
    // ==========================================
    const titulos = currentUser.titulosConquistados || {};
    let optionsHtml = '<option value="">-- Remover Título (Aspirante) --</option>';
    let tituloAtivo = null;

    if (Object.keys(titulos).length > 0) {
        for (const [id, dados] of Object.entries(titulos)) {
            
            // 1. Formata a Data
            let dataFormatada = "";
            if (dados.concedidoEm) {
                try {
                    const dateObj = dados.concedidoEm.toDate ? dados.concedidoEm.toDate() : new Date(dados.concedidoEm);
                    dataFormatada = dateObj.toLocaleDateString('pt-BR');
                } catch(e) {}
            }

            // 2. Ajuste do ícone para o Dropdown
            let iconeSelect = dados.icone || '🏆';
            if (iconeSelect.includes('fa-')) {
                iconeSelect = '🎖️'; 
            }
            
            // 3. Monta a string da Option
            const nomeStr = dados.nome || 'Título Desconhecido';
            const labelStr = `${iconeSelect} - ${nomeStr}${dataFormatada ? ' - ' + dataFormatada : ''}`;

            // 4. Marca como "selected" se for o título ativo
            if (dados.tituloAtivadoUser) {
                tituloAtivo = dados;
                optionsHtml += `<option value="${id}" selected>${labelStr}</option>`;
            } else {
                optionsHtml += `<option value="${id}">${labelStr}</option>`;
            }
        }
        els.selTitle.disabled = false;
    } else {
        optionsHtml = '<option value="">Nenhum título conquistado</option>';
        els.selTitle.disabled = true;
    }

    // Injeta todo o HTML construído de uma vez no Select
    els.selTitle.innerHTML = optionsHtml;

    // 5. Atualiza o visual da Badge (Etiqueta Laranja)
    if (tituloAtivo) {
        const isFaIcon = tituloAtivo.icone && tituloAtivo.icone.includes('fa-');
        const iconeHtml = isFaIcon ? `<i class="${tituloAtivo.icone} mr-1"></i>` : `${tituloAtivo.icone || '🏆'} `;
        els.badgeTitle.innerHTML = `${iconeHtml} ${tituloAtivo.nome}`;
    } else {
        els.badgeTitle.innerHTML = `🏆 Aspirante`;
    }
}

async function uploadImage(fileOrBlob, type) {
    const storageRef = ref(storage, `${type}_images/${currentUser.uid}/${Date.now()}.webp`);
    els.loading.classList.remove('hidden');
    const snap = await uploadBytes(storageRef, fileOrBlob);
    const url = await getDownloadURL(snap.ref);
    await updateDoc(doc(db, "users", currentUser.uid), { [type === 'profile' ? 'photoURL' : 'coverImageURL']: url });
    currentUser[type === 'profile' ? 'photoURL' : 'coverImageURL'] = url;
    renderBanner();
    els.loading.classList.add('hidden');
}

export async function monitorarAuraGlobal(uid) {
    const auraValEl = document.getElementById('user-aura-value');
    const auraCont = document.getElementById('aura-container');

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    
    // Regra para Cargos Administrativos
    if (userData.Admin || userData.Professor || userData.Coordenacao) {
        if (auraValEl && auraCont) {
            auraValEl.textContent = "MAX";
            auraCont.title = "NÍVEL AUTORIDADE:&#10;Aura máxima concedida para Administradores e Professores.";
            auraCont.classList.remove('hidden');
            auraCont.classList.add('flex');
        }
        return;
    }

    // Regra para Alunos (Monitoramento Reativo)
    onSnapshot(doc(db, "notas", uid), (docSnap) => {
        let totalAura = 0;
        if (docSnap.exists()) {
            const disciplinas = docSnap.data().disciplinasComNotas || {};
            Object.values(disciplinas).forEach(trimestres => {
                Object.values(trimestres).forEach(notas => {
                    const soma = (parseFloat(notas.nota1) || 0) + (parseFloat(notas.nota2) || 0) + 
                                 (parseFloat(notas.nota3) || 0) + (parseFloat(notas.nota4) || 0);
                    totalAura += soma * 2500;
                });
            });
        }

        getDoc(doc(db, "pontos_extras", uid)).then(extrasSnap => {
            if (extrasSnap.exists()) {
                const disciplinasExtras = extrasSnap.data().disciplinasExtras || {};
                Object.values(disciplinasExtras).forEach(ex => {
                    if (ex.ext1) totalAura += 100;
                    if (ex.ext2) totalAura += 100;
                    if (ex.ext3) totalAura += 100;
                    if (ex.ext4) totalAura += 100;
                });
            }

            if (auraValEl) {
                auraValEl.textContent = totalAura.toLocaleString('pt-BR');
                auraCont?.classList.remove('hidden');
                auraCont?.classList.add('flex');
            }
        });
    });
}

window.mostrarCentralAprovacao = () => {
    document.getElementById('al-note-active-state')?.classList.add('hidden');
    document.getElementById('al-note-empty-state')?.classList.add('hidden');
    const container = document.getElementById('al-note-approval-state');
    if (container) { container.classList.remove('hidden'); container.classList.add('flex'); }

    const lista = document.getElementById('approval-list');
    const pendentes = myNotes.filter(n => n.userId !== currentUser.uid && (n.statusDestinatarios?.[currentUser.uid] === 'Pendente' || !n.statusDestinatarios?.[currentUser.uid]));

    lista.innerHTML = pendentes.length === 0 ? 
        '<div class="text-slate-500 italic text-center py-20 text-sm">Nenhuma nota aguardando sua decisão.</div>' : 
        pendentes.map(n => `
        <div class="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex flex-col gap-3">
            <div>
                <p class="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Enviado por: ${n.userName || 'Colega'}</p>
                <h4 class="text-white font-bold text-sm">${n.titulo || 'Sem Título'}</h4>
            </div>
            <div class="flex gap-2">
                <button onclick="window.atualizarStatusNota('${n.id}', 'Enviado')" class="flex-grow bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-[10px] font-bold uppercase transition-colors">Aceitar Nota</button>
                <button onclick="window.atualizarStatusNota('${n.id}', 'Recusado')" class="flex-grow bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-[10px] font-bold uppercase transition-colors">Deixar de Seguir</button>
            </div>
        </div>
    `).join('');
};

window.atualizarStatusNota = async (id, status) => {
    try {
        await updateDoc(doc(db, "anotacoes_pessoais", id), {
            [`statusDestinatarios.${currentUser.uid}`]: status
        });
        if (status === 'Enviado') alert("Nota aceita! Ela agora aparece em suas 'Recebidas'.");
        window.mostrarCentralAprovacao();
    } catch (e) { console.error(e); }
};

// Modificação no Modal de Compartilhar para carregar as turmas
const originalOpenShareModal = window.openShareModal;
window.openShareModal = async () => {
    const isStaff = currentUser.Professor || currentUser.Admin || currentUser.Coordenacao;
    const panel = document.getElementById('panel-mass-share');
    
    if (isStaff) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        
        // Buscando as turmas
        const snap = await getDocs(collection(db, "turmasCadastradas"));
        let options = '<option value="">Selecione a Turma...</option>';
        
        snap.forEach(d => {
            const dados = d.data();
            // Mostra o nome legível, mas mantém o ID no value para o Firebase
            options += `<option value="${d.id}">${dados.nomeTurma || d.id}</option>`;
        });
        
        document.getElementById('sel-share-turma').innerHTML = options;
    }
    if (originalOpenShareModal) originalOpenShareModal();
};

window.executarEnvioMassa = async () => {
    const turma = document.getElementById('sel-share-turma').value;
    const noteId = els.noteActiveId.value;
    if (!turma || !noteId) return alert("Selecione a turma.");

    try {
        const snapAlunos = await getDocs(query(collection(db, "users"), where("turma", "==", turma)));
        const uids = [];
        const statusMap = {};

        snapAlunos.forEach(d => {
            if (d.id !== currentUser.uid) {
                uids.push(d.id);
                statusMap[d.id] = 'Pendente';
            }
        });

        await updateDoc(doc(db, "anotacoes_pessoais", noteId), {
            sharedWithUserIds: uids,
            statusDestinatarios: statusMap,
            userName: currentUser.nome // Salva seu nome para o destinatário ver
        });

        alert(`Nota compartilhada com a turma ${turma}!`);
        window.closeShareModal();
    } catch (e) { alert("Erro: " + e.message); }
};

const originalOpenShare = window.openShareModal;
window.openShareModal = async () => {
    const isStaff = currentUser.Admin || currentUser.Professor || currentUser.Coordenacao;
    const panel = document.getElementById('panel-mass-share');
    
    if (isStaff) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        const snap = await getDocs(collection(db, "turmasCadastradas"));
        let html = '<option value="">Selecione a Turma...</option>';
        snap.forEach(d => html += `<option value="${d.id}">${d.data().nomeTurma || d.id}</option>`);
        document.getElementById('sel-share-turma').innerHTML = html;
    }
    if (originalOpenShare) originalOpenShare();
};