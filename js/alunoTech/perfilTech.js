import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, collection, query, where, orderBy, getDocs, updateDoc, serverTimestamp, Timestamp, onSnapshot, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

let currentUser = null;
let disciplineMap = {}; 
let chartInstances = {};
let studentGradesData = null; 

// Vars Caderno
let notesUnsubscribe = null;
let myNotes = [];
let currentTagFilter = 'all';
let currentPage = 1;
const itemsPerPage = 21;
const noteColors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#eab308', '#64748b'];
let selectedNoteColor = noteColors[0];
let formIsPinned = false;

// Vars Kanban
let kanbanUnsub = null;
let myTasks = [];
let draggedTask = null;

// Vars Calendário
let calDate = new Date();
let calEvents = [];
let calView = 'month'; 

export async function renderAlunoTechTab() {
    const container = document.getElementById('aluno-tech-content');
    if (!container) return;

    // Carrega script de gráficos (Chart.js) dinamicamente caso ainda não exista no head
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        document.head.appendChild(script);
    }

    container.innerHTML = `
        <div id="loading-aluno" class="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100]">
            <div class="aluno-spinner"></div>
            <p class="text-blue-500 font-cinzel tracking-widest mt-4">Sincronizando Mente...</p>
        </div>

        <div id="dashboard-aluno" class="w-full h-full flex flex-col overflow-y-auto custom-scroll bg-slate-950 pb-20 hidden fade-in">
            
            <nav class="aluno-tabs-nav flex gap-2 p-4 bg-slate-900 border-b border-blue-900/50 sticky top-0 z-50 shadow-lg justify-center overflow-x-auto">
                <button class="aluno-tab-btn active text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('avisos')">Mural de Avisos</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('boletim')">Boletim Escolar</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('frequencia')">Frequência</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('metricas')">Métricas</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('avaliacao360')">Avaliação 360º</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('caderno')">Caderno Digital</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('kanban')">Kanban Atividades</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('horario')">Horário Escolar</button>
                <button class="aluno-tab-btn text-slate-400 hover:text-white font-bold text-sm px-4 py-2 rounded-md transition border-b-2 border-transparent hover:bg-slate-800" onclick="window.perfilTech.switchTab('calendario')">Calendário</button>
            </nav>

            <div class="w-full max-w-7xl mx-auto flex flex-col flex-grow relative px-4 md:px-8 mt-4">
                
                <div class="banner-wrapper">
                    <div class="cover-photo" id="bg-cover">
                        <div class="cover-overlay"></div>
                        <button class="edit-btn btn-cover" title="Trocar Capa" onclick="document.getElementById('file-cover').click()"><i class="fas fa-camera"></i></button>
                        <button class="edit-btn btn-border" title="Cor do Neon" onclick="document.getElementById('input-color').click()"><i class="fas fa-palette"></i></button>
                    </div>
                    
                    <div class="header-content">
                        <div class="profile-area">
                            <img src="" id="img-profile" class="profile-img">
                            <button class="edit-btn btn-profile" title="Trocar Foto" onclick="document.getElementById('file-profile').click()"><i class="fas fa-camera"></i></button>
                        </div>
                        
                        <div class="student-info">
                            <div id="badge-title" class="student-title-badge">Iniciante</div>
                            <select id="title-select"></select>
                            <h1 class="student-name" id="txt-name">Carregando...</h1>
                            <div class="student-class" id="txt-class"><i class="fas fa-graduation-cap"></i> Turma: ...</div>
                        </div>

                        <div class="header-actions">
                            <div class="stat-box">
                                <span class="stat-num" id="stat-posts">0</span>
                                <span class="stat-label">Posts</span>
                            </div>
                            <div class="stat-box">
                                <span class="stat-num" id="stat-xp">0</span>
                                <span class="stat-label">XP</span>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="file" id="file-cover" class="hidden" accept="image/*">
                <input type="file" id="file-profile" class="hidden" accept="image/*">
                <input type="color" id="input-color" class="hidden">

                <div class="flex-grow w-full mt-10">
                    
                    <div id="tab-avisos" class="aluno-tab-content active">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-bullhorn"></i> Comunicados Oficiais</h3>
                            <div id="avisos-list" class="space-y-4"></div>
                        </div>
                    </div>

                    <div id="tab-boletim" class="aluno-tab-content">
                        <div class="bg-slate-800 p-4 md:p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-file-invoice"></i> Notas Detalhadas</h3>
                            <div class="overflow-x-auto custom-scroll pb-4">
                                <table class="boletim-table">
                                    <colgroup>
                                        <col style="width: 22%;"> <col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"> <col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"> <col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"><col style="width: 6%;"> <col style="width: 6%;">
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th rowspan="2" style="vertical-align: middle;">Disciplina</th>
                                            <th colspan="4" class="trim-divider">1º Trimestre</th>
                                            <th colspan="4" class="trim-divider">2º Trimestre</th>
                                            <th colspan="4" class="trim-divider">3º Trimestre</th>
                                            <th rowspan="2" class="media-final-col" style="vertical-align: middle;">Média Final</th>
                                        </tr>
                                        <tr>
                                            <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                            <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                            <th>N1</th><th>N2</th><th>N3</th><th class="trim-divider">N4</th>
                                        </tr>
                                    </thead>
                                    <tbody id="boletim-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="tab-frequencia" class="aluno-tab-content">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl mb-6">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-calendar-check"></i> Registro de Presença</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                <div class="flex flex-col gap-6">
                                    <div class="bg-slate-900 p-6 rounded-lg border border-slate-700 text-center shadow-inner">
                                        <h4 class="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">Presença Global</h4>
                                        <div class="text-5xl font-mono font-bold text-green-400" id="freq-perc">100%</div>
                                    </div>
                                    <div class="bg-slate-900 p-6 rounded-lg border border-slate-700 text-center shadow-inner">
                                        <h4 class="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">Total de Faltas</h4>
                                        <div class="text-5xl font-mono font-bold text-red-500" id="freq-total">0</div>
                                    </div>
                                </div>
                                <div class="h-64 relative w-full flex justify-center">
                                    <canvas id="chart-freq-rosca"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-4 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-list"></i> Faltas por Disciplina</h3>
                            <div id="freq-detail-list" class="space-y-2"></div>
                        </div>
                    </div>

                    <div id="tab-metricas" class="aluno-tab-content">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-chart-line"></i> Análise de Desempenho</h3>
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div>
                                    <h4 class="text-center text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">Dispersão das Notas</h4>
                                    <div class="h-64 relative w-full bg-slate-900 rounded-lg p-2 border border-slate-700 shadow-inner">
                                        <canvas id="chart-scatter-notas"></canvas>
                                    </div>
                                </div>
                                <div>
                                    <div class="flex justify-between items-center mb-4">
                                        <h4 class="text-slate-400 text-sm font-bold uppercase tracking-widest">Evolução Histórica</h4>
                                        <select id="sel-evolution-disc" class="bg-slate-950 text-white border border-slate-700 p-1.5 rounded text-xs outline-none focus:border-blue-500"></select>
                                    </div>
                                    <div class="h-64 relative w-full bg-slate-900 rounded-lg p-2 border border-slate-700 shadow-inner">
                                        <canvas id="chart-evolution"></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-avaliacao360" class="aluno-tab-content">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-users-viewfinder"></i> Avaliação 360º de Soft Skills</h3>
                            <div id="eval-360-content" class="bg-slate-900/50 p-10 rounded-lg border border-dashed border-slate-600 text-center text-slate-500 italic">
                                <p>Nenhuma avaliação liberada para você neste trimestre.</p>
                            </div>
                        </div>
                    </div>

                    <div id="tab-caderno" class="aluno-tab-content">
                        <div class="notebook-container">
                            <div class="notebook-toolbar">
                                <div class="tags-filter custom-scroll" id="st-note-tags">
                                    <span class="tag-pill active" onclick="window.perfilTech.setNoteTag('all')">Todas</span>
                                </div>
                                <div class="flex gap-4 items-center shrink-0 w-full md:w-auto mt-4 md:mt-0">
                                    <div class="relative flex-grow md:flex-grow-0">
                                        <input type="text" id="st-note-search" placeholder="Buscar..." class="w-full bg-slate-950 border border-slate-600 text-white py-2 pl-10 pr-4 rounded-full outline-none focus:border-blue-500 text-sm">
                                        <i class="fas fa-search absolute left-4 top-3 text-slate-500 text-xs"></i>
                                    </div>
                                    <button id="btn-new-note" onclick="window.perfilTech.toggleNoteForm()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-full flex items-center gap-2 shadow-lg transition whitespace-nowrap">
                                        <i class="fas fa-plus"></i> <span id="btn-new-note-text">Nova Nota</span>
                                    </button>
                                </div>
                            </div>

                            <div id="st-note-form-panel" class="note-form-panel">
                                <input type="hidden" id="note-id-input">
                                <div class="flex justify-between items-center mb-4">
                                    <input type="text" id="note-title-input" class="note-input-title" placeholder="Escreva o Título da Nota...">
                                    <div class="flex items-center gap-4">
                                        <i id="form-pin-icon" class="fas fa-thumbtack note-pin hover:scale-110" title="Fixar Nota no Topo" onclick="window.perfilTech.toggleFormPin()"></i>
                                        <button onclick="window.perfilTech.toggleNoteForm()" class="text-slate-500 hover:text-white transition"><i class="fas fa-times text-xl"></i></button>
                                    </div>
                                </div>
                                <textarea id="note-body-input" class="note-input-body custom-scroll" placeholder="O que você aprendeu hoje? Descreva suas ideias, código ou anotações..."></textarea>
                                <div class="flex flex-col md:flex-row gap-6 items-center">
                                    <div class="w-full md:flex-grow">
                                        <input type="text" id="note-tags-input" class="note-input-tags" placeholder="Tags: #html, #revisao (separadas por vírgula)">
                                    </div>
                                    <div class="color-selector w-full md:w-auto justify-center" id="note-color-selector"></div>
                                </div>
                                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                                    <button onclick="window.perfilTech.toggleNoteForm()" class="note-btn px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold">Cancelar</button>
                                    <button id="btn-save-note" class="px-8 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-bold shadow-lg">Salvar Anotação</button>
                                </div>
                            </div>

                            <div id="st-notes-grid" class="notes-grid"></div>

                            <div id="notes-pagination" class="pagination-wrapper hidden">
                                <button class="page-btn" id="btn-prev-page" onclick="window.perfilTech.changeNotePage(-1)"><i class="fas fa-chevron-left"></i></button>
                                <span class="page-info" id="page-indicator">Página 1</span>
                                <button class="page-btn" id="btn-next-page" onclick="window.perfilTech.changeNotePage(1)"><i class="fas fa-chevron-right"></i></button>
                            </div>
                        </div>
                    </div>

                    <div id="tab-kanban" class="aluno-tab-content">
                        <div class="kanban-toolbar">
                            <button onclick="window.perfilTech.toggleKanbanForm()" class="bg-purple-600 hover:bg-purple-500 text-white py-2 px-6 rounded-full font-bold shadow-lg flex items-center gap-2 transition">
                                <i class="fas fa-plus"></i> Criar Tarefa Ágil
                            </button>
                        </div>

                        <div id="kanban-form-panel" class="kanban-form-panel">
                            <input type="hidden" id="kanban-id-input">
                            <input type="text" id="kanban-title-input" class="note-input-title border-purple-500" placeholder="Defina a Tarefa (Ex: Estudar API Fetch)">
                            <textarea id="kanban-body-input" class="note-input-body custom-scroll" placeholder="O que precisa ser feito ou pesquisado?" style="min-height:100px;"></textarea>
                            <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
                                <button onclick="window.perfilTech.toggleKanbanForm()" class="note-btn bg-slate-700 px-6 py-2 rounded text-white font-bold hover:bg-slate-600">Cancelar</button>
                                <button id="btn-save-kanban" class="bg-green-600 px-8 py-2 rounded text-white font-bold hover:bg-green-500 shadow-lg">Guardar Card</button>
                            </div>
                        </div>

                        <div class="kanban-board">
                            <div class="kanban-column col-todo" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'a_fazer')">
                                <div class="kanban-column-header"><i class="fas fa-list-ul mr-2"></i> Backlog (A Fazer)</div>
                                <div id="col-a_fazer" class="kanban-cards-area custom-scroll"></div>
                            </div>
                            <div class="kanban-column col-doing" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'em_progresso')">
                                <div class="kanban-column-header"><i class="fas fa-spinner mr-2"></i> Sprint (Fazendo)</div>
                                <div id="col-em_progresso" class="kanban-cards-area custom-scroll"></div>
                            </div>
                            <div class="kanban-column col-done" ondragover="window.perfilTech.allowDrop(event)" ondrop="window.perfilTech.drop(event, 'concluido')">
                                <div class="kanban-column-header"><i class="fas fa-check-double mr-2"></i> Deploy (Feito)</div>
                                <div id="col-concluido" class="kanban-cards-area custom-scroll"></div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-horario" class="aluno-tab-content">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-clock"></i> Grade Escolar Semanal</h3>
                            <div class="horario-container custom-scroll">
                                <table class="horario-tabela">
                                    <thead>
                                        <tr>
                                            <th data-dia-id="segunda-feira">Segunda <span class="data-dia text-[10px] text-slate-400 block mt-1"></span></th>
                                            <th data-dia-id="terca-feira">Terça <span class="data-dia text-[10px] text-slate-400 block mt-1"></span></th>
                                            <th data-dia-id="quarta-feira">Quarta <span class="data-dia text-[10px] text-slate-400 block mt-1"></span></th>
                                            <th data-dia-id="quinta-feira">Quinta <span class="data-dia text-[10px] text-slate-400 block mt-1"></span></th>
                                            <th data-dia-id="sexta-feira">Sexta <span class="data-dia text-[10px] text-slate-400 block mt-1"></span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td id="cell-segunda-feira"></td>
                                            <td id="cell-terca-feira"></td>
                                            <td id="cell-quarta-feira"></td>
                                            <td id="cell-quinta-feira"></td>
                                            <td id="cell-sexta-feira"></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p id="horario-msg" class="text-center text-slate-400 mt-6 italic bg-slate-900 p-4 rounded-lg border border-slate-700">Carregando horários na base de dados...</p>
                        </div>
                    </div>

                    <div id="tab-calendario" class="aluno-tab-content">
                        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h3 class="text-xl font-bold text-blue-500 mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i class="fas fa-calendar-alt"></i> Cronograma do Ano Letivo</h3>
                            
                            <div class="calendar-controls">
                                <div class="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1">
                                    <button class="bg-transparent text-slate-400 hover:text-white px-4 py-2" onclick="window.perfilTech.changeCalMonth(-1)"><i class="fas fa-chevron-left"></i></button>
                                    <span id="cal-current-month" class="font-cinzel text-lg text-white font-bold w-40 text-center">Mês Ano</span>
                                    <button class="bg-transparent text-slate-400 hover:text-white px-4 py-2" onclick="window.perfilTech.changeCalMonth(1)"><i class="fas fa-chevron-right"></i></button>
                                </div>
                                <div class="flex bg-slate-900 border border-slate-700 rounded-lg p-1 gap-1">
                                    <button id="btn-view-month" class="bg-blue-600 text-white px-6 py-2 rounded-md font-bold text-sm" onclick="window.perfilTech.switchCalView('month')">Visão Mês</button>
                                    <button id="btn-view-week" class="bg-transparent text-slate-400 hover:text-white px-6 py-2 rounded-md font-bold text-sm" onclick="window.perfilTech.switchCalView('week')">Visão Semana</button>
                                </div>
                                <button id="btn-add-event" class="hidden bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg" onclick="window.perfilTech.openCalModal()"><i class="fas fa-plus mr-2"></i> Marcar Data</button>
                            </div>

                            <div class="calendar-header mt-6" id="cal-header-row">
                                <div>Segunda</div><div>Terça</div><div>Quarta</div><div>Quinta</div><div>Sexta</div>
                            </div>
                            <div id="calendar-grid" class="calendar-grid">
                                <div class="col-span-full p-10 text-center text-slate-500 italic"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando eventos...</div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <div id="cal-modal" class="cal-modal fade-in flex">
            <div class="cal-modal-content">
                <span class="cal-close" onclick="window.perfilTech.closeCalModal()"><i class="fas fa-times"></i></span>
                <h3 id="cal-modal-title" class="text-xl font-bold font-cinzel text-blue-500 mb-6 border-b border-slate-700 pb-2">Detalhes do Evento</h3>
                
                <div class="cal-form-group">
                    <label>Título do Compromisso</label>
                    <input type="text" id="cal-evt-title" placeholder="Ex: Prova Trimestral de Lógica">
                </div>
                <div class="cal-form-group">
                    <label>Data Agendada</label>
                    <input type="date" id="cal-evt-date" class="font-mono">
                </div>
                <div class="cal-form-group">
                    <label>Descrição (Tópicos)</label>
                    <textarea id="cal-evt-desc" rows="3" placeholder="Assuntos da prova, links, observações..."></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="cal-form-group mb-0">
                        <label>Cor Identificadora</label>
                        <input type="color" id="cal-evt-color" value="#3b82f6" class="p-1 h-12 cursor-pointer">
                    </div>
                    <div id="cal-admin-fields" class="hidden cal-form-group mb-0">
                        <label>Visibilidade da Etiqueta</label>
                        <select id="cal-evt-visib" class="h-12 font-bold text-xs">
                            <option value="todos">Todos da Plataforma</option>
                            <option value="publico">Apenas Site Público</option>
                            <option value="turmas_especificas">Privado: Para Minhas Turmas</option>
                        </select>
                    </div>
                </div>

                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                    <button id="btn-del-event" onclick="window.perfilTech.deleteCalendarEvent()" class="hidden bg-red-600 hover:bg-red-500 px-6 py-2 rounded text-white font-bold">Apagar</button>
                    <button id="btn-save-event" onclick="window.perfilTech.saveCalendarEvent()" class="bg-green-600 hover:bg-green-500 px-8 py-2 rounded text-white font-bold shadow-lg">Confirmar Agenda</button>
                </div>
                <input type="hidden" id="cal-evt-id">
            </div>
        </div>
    `;

    // Fechar modal no clique de fora
    document.getElementById('cal-modal').addEventListener('click', (e) => {
        if (e.target.id === 'cal-modal') window.perfilTech.closeCalModal();
    });

    // Init Logic
    if (auth.currentUser) {
        currentUser = { uid: auth.currentUser.uid };
        await initDashboard();
    } else {
        const unsub = auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = { uid: user.uid };
                await initDashboard();
            } else {
                alert("Você precisa estar logado para acessar seu perfil de aluno.");
                window.showTab('inicio');
            }
        });
    }
}

// ============================================================================
// CARREGAMENTO CENTRAL DA ABA ALUNO TECH
// ============================================================================

async function initDashboard() {
    try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (docSnap.exists()) {
            currentUser = { uid: currentUser.uid, ...docSnap.data() };
            // Bloqueio extra caso a rota falhe (já coberto no main.js, mas mantemos)
            if (currentUser.role === 'Visitante') {
                alert("Acesso Negado: Apenas alunos e staff possuem perfil técnico.");
                return window.showTab('inicio');
            }
        }
        
        document.getElementById('dashboard-aluno').classList.remove('hidden');
        document.getElementById('loading-aluno').classList.add('hidden');

        els.txtName = document.getElementById('txt-name');
        els.txtClass = document.getElementById('txt-class');
        els.imgProfile = document.getElementById('img-profile');
        els.bgCover = document.getElementById('bg-cover');
        els.badgeTitle = document.getElementById('badge-title');
        els.selTitle = document.getElementById('title-select');
        els.statPosts = document.getElementById('stat-posts');
        els.statXp = document.getElementById('stat-xp');
        els.avisosList = document.getElementById('avisos-list');
        els.boletimBody = document.getElementById('boletim-body');
        els.selEvolDisc = document.getElementById('sel-evolution-disc');
        els.freqPerc = document.getElementById('freq-perc');
        els.freqTotal = document.getElementById('freq-total');
        els.freqList = document.getElementById('freq-detail-list');
        els.eval360Content = document.getElementById('eval-360-content');
        els.horarioMsg = document.getElementById('horario-msg');
        els.inpProfile = document.getElementById('file-profile');
        els.inpCover = document.getElementById('file-cover');
        els.inpColor = document.getElementById('input-color');

        els.notesGrid = document.getElementById('st-notes-grid');
        els.noteTagsDiv = document.getElementById('st-note-tags');
        els.noteSearch = document.getElementById('st-note-search');
        els.noteFormPanel = document.getElementById('st-note-form-panel');
        els.btnNewNoteText = document.getElementById('btn-new-note-text');
        els.inpNoteId = document.getElementById('note-id-input');
        els.inpNoteTitle = document.getElementById('note-title-input');
        els.inpNoteBody = document.getElementById('note-body-input');
        els.inpNoteTags = document.getElementById('note-tags-input');
        els.colorSelector = document.getElementById('note-color-selector');
        els.formPinIcon = document.getElementById('form-pin-icon');
        els.btnNoteSave = document.getElementById('btn-save-note');

        els.kanbanFormPanel = document.getElementById('kanban-form-panel');
        els.inpKanbanId = document.getElementById('kanban-id-input');
        els.inpKanbanTitle = document.getElementById('kanban-title-input');
        els.inpKanbanBody = document.getElementById('kanban-body-input');
        els.colTodo = document.getElementById('col-a_fazer');
        els.colDoing = document.getElementById('col-em_progresso');
        els.colDone = document.getElementById('col-concluido');

        // Binds de Imagem
        els.inpProfile.onchange = (e) => { if(e.target.files[0]) uploadImage(e.target.files[0], 'profile'); };
        els.inpCover.onchange = (e) => { if(e.target.files[0]) uploadImage(e.target.files[0], 'cover'); };
        els.inpColor.onchange = async (e) => {
            const color = e.target.value;
            els.imgProfile.style.borderColor = color;
            els.imgProfile.style.boxShadow = `0 0 20px ${color}`;
            await updateDoc(doc(db, "users", currentUser.uid), { profileBorderColor: color });
        };
        els.btnNoteSave.onclick = window.perfilTech.saveNote;

        renderBanner();
        await loadDisciplinesMap();
        loadAvisos();
        await loadBoletimAndMetrics();
        loadFrequencia();
        loadAvaliacao360();
        initNotebookSystem();
        initKanbanSystem();
        loadHorarioEscolar();
        initCalendarSystem();
        loadUserStats();

    } catch (err) {
        console.error(err);
        alert("Falha ao carregar perfil de Aluno.");
    }
}

async function uploadImage(file, type) {
    const loading = document.getElementById('loading-aluno');
    const path = `${type}_images/${currentUser.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    loading.classList.remove('hidden');
    try {
        const snap = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snap.ref);
        const field = type === 'profile' ? 'photoURL' : 'coverImageURL';
        await updateDoc(doc(db, "users", currentUser.uid), { [field]: url });
        currentUser[field] = url;
        renderBanner();
    } catch(e) {
        alert("Erro no upload: " + e.message);
    } finally {
        loading.classList.add('hidden');
    }
}

function renderBanner() {
    els.txtName.textContent = currentUser.nome || 'Aluno Desconhecido';
    els.txtClass.innerHTML = `<i class="fas fa-graduation-cap"></i> Turma: ${currentUser.turma || 'N/A'}`;
    const defPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nome || 'A')}&background=0D8ABC&color=fff&size=200`;
    els.imgProfile.src = currentUser.photoURL || defPic;
    const defCover = 'https://images.unsplash.com/photo-1550439062-609e1531270e?q=80&w=2070&auto=format&fit=crop'; // Capa mais "código/matrix"
    els.bgCover.style.backgroundImage = `url('${currentUser.coverImageURL || defCover}')`;
    const color = currentUser.profileBorderColor || '#3b82f6';
    els.imgProfile.style.borderColor = color;
    els.imgProfile.style.boxShadow = `0 0 20px ${color}`;

    const titles = currentUser.titulosConquistados || {};
    els.selTitle.innerHTML = '<option value="">-- Sem Título --</option>';
    let activeName = "Aspirante Tech"; 
    let activeIcon = "";
    Object.entries(titles).forEach(([key, t]) => {
        const text = t.icone ? `${t.icone} ${t.nome}` : t.nome;
        const opt = new Option(text, key);
        if(t.tituloAtivadoUser === true) {
            opt.selected = true; activeName = t.nome; activeIcon = t.icone || "";
        }
        els.selTitle.add(opt);
    });
    els.badgeTitle.innerHTML = activeIcon ? `${activeIcon} ${activeName}` : activeName;

    els.badgeTitle.onclick = () => { els.badgeTitle.style.display = 'none'; els.selTitle.style.display = 'inline-block'; els.selTitle.focus(); };
    els.selTitle.onblur = () => { els.selTitle.style.display = 'none'; els.badgeTitle.style.display = 'inline-block'; };
    els.selTitle.onchange = async () => {
        const selectedId = els.selTitle.value;
        els.badgeTitle.textContent = els.selTitle.options[els.selTitle.selectedIndex].text;
        els.selTitle.style.display = 'none'; els.badgeTitle.style.display = 'inline-block';
        const updatedTitles = { ...currentUser.titulosConquistados };
        Object.keys(updatedTitles).forEach(key => { updatedTitles[key].tituloAtivadoUser = (key === selectedId); });
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { titulosConquistados: updatedTitles, lastTitleChange: serverTimestamp() });
            currentUser.titulosConquistados = updatedTitles;
        } catch(error) { alert("Falha ao equipar título."); }
    };
}

async function loadDisciplinesMap() {
    const snap = await getDocs(query(collection(db, "disciplinasCadastradas")));
    snap.forEach(d => { disciplineMap[d.data().identificador] = d.data().nomeExibicao; });
}

async function loadAvisos() {
    if(!currentUser.turma) { els.avisosList.innerHTML = '<p class="text-slate-500 italic">Você não foi designado a nenhuma turma.</p>'; return; }
    const q = query(collection(db, "avisos_colegio"), where("turmasRelacionadas", "array-contains", currentUser.turma), where("exibir", "==", true), orderBy("dataCriacao", "desc"));
    const snap = await getDocs(q);
    if(snap.empty) { els.avisosList.innerHTML = '<p class="text-slate-500 italic">O mural está vazio hoje.</p>'; return; }
    let html = '';
    snap.forEach(doc => {
        const d = doc.data();
        const date = d.dataCriacao?.toDate().toLocaleDateString('pt-BR') || '';
        html += `<div class="aviso-item"><div class="aviso-header"><span><i class="fas fa-bullhorn text-blue-500"></i> ${escapeHTML(d.autor||'Sistema')}</span><span>${date}</span></div><div class="aviso-text font-mono text-sm">${escapeHTML(d.mensagem)}</div></div>`;
    });
    els.avisosList.innerHTML = html;
}

async function loadUserStats() {
    try {
        const q = query(collection(db, 'posts'), where("autorUID", "==", currentUser.uid));
        const snap = await getDocs(q);
        let totalXp = currentUser.xp !== undefined ? currentUser.xp : 0;
        if(currentUser.xp === undefined) { snap.forEach(d => { totalXp += (d.data().elogios || 0); }); }
        if (els.statPosts) els.statPosts.textContent = snap.size;
        if (els.statXp) els.statXp.textContent = totalXp;
    } catch (e) { console.warn(e); }
}

async function loadAvaliacao360() {
    const data = currentUser.avaliacao_360;
    if(data) {
        els.eval360Content.innerHTML = `<div class="p-8"><i class="fas fa-star text-4xl text-amber-500 mb-4"></i><h4 class="text-blue-500 text-3xl font-black font-mono">Nota Final: ${data.mediaFinal || '-'}</h4><p class="text-slate-400 mt-2">Revisão conduzida por ${escapeHTML(data.avaliador || 'Professor')}</p></div>`;
        els.eval360Content.classList.replace('border-dashed', 'border-solid');
        els.eval360Content.classList.add('border-blue-500', 'bg-blue-900/10');
    }
}

// ------------------------------------------------------------------------------------
// EXPORTAÇÃO DAS FUNÇÕES INTERATIVAS DO HTML (Abas, Caderno, Calendário...)
// ------------------------------------------------------------------------------------
window.perfilTech = {
    switchTab: (tabId) => {
        document.querySelectorAll('.aluno-tab-btn').forEach(b => {
            b.classList.remove('active', 'border-blue-500', 'text-white', 'bg-slate-800');
            b.classList.add('border-transparent', 'text-slate-400');
        });
        const clicked = document.querySelector(`.aluno-tab-btn[onclick*="${tabId}"]`);
        if(clicked) {
            clicked.classList.add('active', 'border-blue-500', 'text-white', 'bg-slate-800');
            clicked.classList.remove('border-transparent', 'text-slate-400');
        }
        document.querySelectorAll('.aluno-tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(`tab-${tabId}`);
        if(target) target.classList.add('active');
        
        // Pequena correção de redimensionamento dos gráficos ao abrir aba
        if(tabId === 'metricas' || tabId === 'frequencia') {
            window.dispatchEvent(new Event('resize')); 
        }
    },

    // Caderno
    setNoteTag: (tag) => {
        currentTagFilter = tag; currentPage = 1; renderNotes();
        const tags = new Set();
        myNotes.forEach(n => (n.tags || []).forEach(t => tags.add(t)));
        let html = `<span class="tag-pill ${currentTagFilter==='all'?'active':''}" onclick="window.perfilTech.setNoteTag('all')">Todas</span>`;
        Array.from(tags).sort().forEach(t => { html += `<span class="tag-pill ${currentTagFilter===t?'active':''}" onclick="window.perfilTech.setNoteTag('${t}')">#${escapeHTML(t)}</span>`; });
        els.noteTagsDiv.innerHTML = html;
    },
    toggleNoteForm: () => {
        const isHidden = els.noteFormPanel.style.display === 'none' || els.noteFormPanel.style.display === '';
        if(isHidden) {
            els.inpNoteId.value = ''; els.inpNoteTitle.value = ''; els.inpNoteBody.value = ''; els.inpNoteTags.value = '';
            formIsPinned = false; els.formPinIcon.classList.remove('active'); els.formPinIcon.style.color = '#94a3b8';
            document.querySelectorAll('.color-option').forEach(el=>el.classList.remove('selected'));
            els.colorSelector.children[0].classList.add('selected'); selectedNoteColor = noteColors[0]; els.noteFormPanel.style.borderLeftColor = selectedNoteColor;
            els.noteFormPanel.style.display = 'block'; els.btnNewNoteText.textContent = "Fechar Editor"; els.inpNoteTitle.focus();
        } else {
            els.noteFormPanel.style.display = 'none'; els.btnNewNoteText.textContent = "Nova Nota";
        }
    },
    toggleFormPin: () => {
        formIsPinned = !formIsPinned;
        els.formPinIcon.classList.toggle('active', formIsPinned);
        els.formPinIcon.style.color = formIsPinned ? '#00e5ff' : '#94a3b8';
    },
    saveNote: async () => {
        const title = els.inpNoteTitle.value.trim(); const content = els.inpNoteBody.value.trim();
        if(!title && !content) return alert("A nota está vazia.");
        const tags = els.inpNoteTags.value.split(',').map(t=>t.trim()).filter(t=>t);
        const payload = { titulo: title||'Sem Título', conteudo: content, tags: tags, favorita: !!formIsPinned, color: selectedNoteColor, userId: currentUser.uid, updatedAt: serverTimestamp() };
        try {
            if(els.inpNoteId.value) await updateDoc(doc(db, "anotacoes_pessoais", els.inpNoteId.value), payload);
            else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, "anotacoes_pessoais"), payload); }
            els.noteFormPanel.style.display = 'none'; els.btnNewNoteText.textContent = "Nova Nota";
        } catch(e) { alert("Erro: " + e.message); }
    },
    changeNotePage: (dir) => { currentPage += dir; renderNotes(); document.getElementById('st-notes-grid').scrollIntoView({behavior:'smooth'}); },
    editNoteCard: (note) => {
        window.perfilTech.toggleNoteForm();
        els.inpNoteId.value = note.id; els.inpNoteTitle.value = note.titulo; els.inpNoteBody.value = note.conteudo; els.inpNoteTags.value = (note.tags||[]).join(', ');
        formIsPinned = !!note.favorita; window.perfilTech.toggleFormPin(); window.perfilTech.toggleFormPin(); // Hack to refresh visually
        const cIdx = noteColors.indexOf(note.color||noteColors[0]);
        if(cIdx>=0){ document.querySelectorAll('.color-option').forEach(el=>el.classList.remove('selected')); els.colorSelector.children[cIdx].classList.add('selected'); selectedNoteColor=noteColors[cIdx]; els.noteFormPanel.style.borderLeftColor=selectedNoteColor; }
    },
    deleteNoteCard: async (id) => { if(confirm("Apagar anotação?")) await deleteDoc(doc(db, "anotacoes_pessoais", id)); },
    togglePinDB: async (id, val) => { await updateDoc(doc(db, "anotacoes_pessoais", id), { favorita: !!val }); },

    // Kanban
    toggleKanbanForm: () => {
        if(els.kanbanFormPanel.style.display === 'block') { els.kanbanFormPanel.style.display = 'none'; els.inpKanbanId.value=''; els.inpKanbanTitle.value=''; els.inpKanbanBody.value=''; }
        else { els.kanbanFormPanel.style.display = 'block'; els.inpKanbanTitle.focus(); }
    },
    allowDrop: (e) => { e.preventDefault(); const c = e.target.closest('.kanban-column'); if(c) c.classList.add('drag-over'); },
    drop: async (e, status) => {
        e.preventDefault(); const c = e.target.closest('.kanban-column'); if(c) c.classList.remove('drag-over');
        if(draggedTask && draggedTask.status !== status) {
            await updateDoc(doc(db, "kanban_atividades", draggedTask.id), { status: status, updatedAt: serverTimestamp() });
        }
    },
    editKTask: (task) => { window.perfilTech.toggleKanbanForm(); els.inpKanbanId.value=task.id; els.inpKanbanTitle.value=task.titulo; els.inpKanbanBody.value=task.conteudo; },
    delKTask: async (id) => { if(confirm("Remover do backlog?")) await deleteDoc(doc(db, "kanban_atividades", id)); },

    // Calendário
    changeCalMonth: (dir) => { if(calView==='month') calDate.setMonth(calDate.getMonth()+dir); else calDate.setDate(calDate.getDate()+(dir*7)); fetchCalendarEvents(); },
    switchCalView: (v) => { calView = v; document.getElementById('btn-view-month').className = v==='month'?'bg-blue-600 text-white px-6 py-2 rounded-md font-bold text-sm':'bg-transparent text-slate-400 hover:text-white px-6 py-2 rounded-md font-bold text-sm'; document.getElementById('btn-view-week').className = v==='week'?'bg-blue-600 text-white px-6 py-2 rounded-md font-bold text-sm':'bg-transparent text-slate-400 hover:text-white px-6 py-2 rounded-md font-bold text-sm'; window.renderCalendarGrid(); },
    openCalModal: (ev=null, dtStr=null) => {
        const isStaff = currentUser.Admin || currentUser.Coordenacao || currentUser.Professor;
        if(!ev && !isStaff) return;
        document.getElementById('cal-modal').style.display='flex';
        if(ev) {
            document.getElementById('cal-evt-id').value=ev.id; document.getElementById('cal-evt-title').value=ev.titulo; document.getElementById('cal-evt-date').value=ev.dataInicio?.toDate().toISOString().split('T')[0]; document.getElementById('cal-evt-desc').value=ev.descricao||''; document.getElementById('cal-evt-color').value=ev.cor||'#3b82f6';
            const canE = isStaff && (currentUser.Admin || ev.instrutorUID === currentUser.uid);
            document.getElementById('btn-del-event').style.display = canE?'block':'none'; document.getElementById('btn-save-event').style.display = canE?'block':'none';
            ['cal-evt-title','cal-evt-date','cal-evt-desc','cal-evt-color'].forEach(i=>document.getElementById(i).disabled=!canE);
        } else {
            document.getElementById('cal-evt-id').value=''; document.getElementById('cal-evt-title').value=''; document.getElementById('cal-evt-date').value=dtStr||new Date().toISOString().split('T')[0]; document.getElementById('cal-evt-desc').value=''; document.getElementById('cal-evt-color').value='#3b82f6';
            document.getElementById('btn-del-event').style.display='none'; document.getElementById('btn-save-event').style.display='block';
            ['cal-evt-title','cal-evt-date','cal-evt-desc','cal-evt-color'].forEach(i=>document.getElementById(i).disabled=false);
        }
    },
    closeCalModal: () => document.getElementById('cal-modal').style.display='none',
    deleteCalendarEvent: async () => { const id = document.getElementById('cal-evt-id').value; if(id && confirm("Excluir da agenda?")) { await deleteDoc(doc(db,"calendarioAnual",id)); window.perfilTech.closeCalModal(); fetchCalendarEvents(); } },
    saveCalendarEvent: async () => {
        const title=document.getElementById('cal-evt-title').value, dt=document.getElementById('cal-evt-date').value;
        if(!title||!dt) return alert("Título e Data vazios.");
        const [y,m,d] = dt.split('-').map(Number); const dO = new Date(y,m-1,d,12,0,0);
        const vis = document.getElementById('cal-evt-visib').value;
        const payload = { titulo:title, dataInicio:Timestamp.fromDate(dO), descricao:document.getElementById('cal-evt-desc').value, cor:document.getElementById('cal-evt-color').value, visibilidade:vis, instrutorUID:currentUser.uid, instrutorOrganizador:currentUser.nome, updatedAt:serverTimestamp() };
        if(vis==='turmas_especificas' && currentUser.turma) payload.turmasAlvo=[currentUser.turma];
        try {
            const id = document.getElementById('cal-evt-id').value;
            if(id) await updateDoc(doc(db,"calendarioAnual",id), payload); else { payload.createdAt=serverTimestamp(); await addDoc(collection(db,"calendarioAnual"), payload); }
            window.perfilTech.closeCalModal(); fetchCalendarEvents();
        } catch(e) { alert("Falha ao agendar: "+e.message); }
    }
};

// Bind do Salvamento do Kanban (Estava faltando na refatoração)
document.addEventListener('click', (e) => {
    if(e.target && e.target.id === 'btn-save-kanban'){
        const title = els.inpKanbanTitle.value.trim(); const content = els.inpKanbanBody.value.trim(); const id = els.inpKanbanId.value;
        if(!title) return alert("Defina a missão!");
        const payload = { titulo: title, conteudo: content, updatedAt: serverTimestamp() };
        try {
            if(id) updateDoc(doc(db, "kanban_atividades", id), payload);
            else { payload.userIdCriador=currentUser.uid; payload.nomeCriador=currentUser.nome; payload.status='a_fazer'; payload.createdAt=serverTimestamp(); addDoc(collection(db,"kanban_atividades"), payload); }
            window.perfilTech.toggleKanbanForm();
        } catch(e) { alert(e.message); }
    }
});


// ------------------ FUNÇÕES AUXILIARES GIGANTES --------------------
function initNotebookSystem() {
    if(notesUnsubscribe) return;
    els.colorSelector.innerHTML = noteColors.map(c => `<div class="color-option ${c===selectedNoteColor?'selected':''}" style="background-color:${c}; border-color:${c===selectedNoteColor?'white':'transparent'}" onclick="window.perfilTech.selectColor('${c}', this)"></div>`).join('');
    
    window.perfilTech.selectColor = (c, el) => {
        selectedNoteColor = c; els.noteFormPanel.style.borderLeftColor = c;
        document.querySelectorAll('.color-option').forEach(e => { e.classList.remove('selected'); e.style.borderColor='transparent'; });
        el.classList.add('selected'); el.style.borderColor='white';
    };

    const q = query(collection(db, "anotacoes_pessoais"), where("userId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
    notesUnsubscribe = onSnapshot(q, snap => {
        myNotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.perfilTech.setNoteTag('all'); // Inicializa e popula filtros
    });

    els.noteSearch.addEventListener('input', () => { currentPage = 1; renderNotes(); });
}

function renderNotes() {
    const search = els.noteSearch.value.toLowerCase();
    const filtered = myNotes.filter(n => {
        const txt = (n.titulo||'').toLowerCase().includes(search) || (n.conteudo||'').toLowerCase().includes(search);
        const tag = currentTagFilter === 'all' || (n.tags && n.tags.includes(currentTagFilter));
        return txt && tag;
    });
    filtered.sort((a,b) => (b.favorita?1:0) - (a.favorita?1:0));

    if(filtered.length === 0) {
        els.notesGrid.innerHTML = '<div class="col-span-full text-center p-10 text-slate-500 italic">O caderno está em branco. Escreva algo genial!</div>';
        document.getElementById('notes-pagination').classList.add('hidden');
        return;
    }

    const total = Math.ceil(filtered.length / itemsPerPage);
    if(currentPage > total) currentPage = total;
    if(currentPage < 1) currentPage = 1;

    const pageNotes = filtered.slice((currentPage-1)*itemsPerPage, currentPage*itemsPerPage);
    
    els.notesGrid.innerHTML = pageNotes.map(n => {
        const tags = (n.tags||[]).map(t=>`<span class="note-tag">#${escapeHTML(t)}</span>`).join('');
        const noteStr = JSON.stringify(n).replace(/"/g, '&quot;');
        return `
            <div class="note-card ${n.favorita?'pinned':''}" style="border-left-color:${n.color||noteColors[0]}">
                <i class="fas fa-thumbtack note-pin ${n.favorita?'active':''}" onclick="window.perfilTech.togglePinDB('${n.id}', ${!n.favorita})"></i>
                <div class="note-title" title="${escapeHTML(n.titulo)}">${escapeHTML(n.titulo)}</div>
                <div class="note-tags">${tags}</div>
                <div class="note-body custom-scroll">${escapeHTML(n.conteudo)}</div>
                <div class="note-footer">
                    <button class="note-btn" onclick='window.perfilTech.editNoteCard(${noteStr})'><i class="fas fa-edit"></i></button>
                    <button class="note-btn del" onclick="window.perfilTech.deleteNoteCard('${n.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    const pag = document.getElementById('notes-pagination');
    if(total > 1) {
        pag.classList.remove('hidden'); pag.classList.add('flex');
        document.getElementById('page-indicator').textContent = `Página ${currentPage} de ${total}`;
        document.getElementById('btn-prev-page').disabled = (currentPage === 1);
        document.getElementById('btn-next-page').disabled = (currentPage === total);
    } else {
        pag.classList.add('hidden'); pag.classList.remove('flex');
    }
}

function initKanbanSystem() {
    if(kanbanUnsub) return;
    const q = query(collection(db, "kanban_atividades"), where("userIdCriador", "==", currentUser.uid), orderBy("createdAt", "desc"));
    kanbanUnsub = onSnapshot(q, snap => {
        myTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        els.colTodo.innerHTML = ''; els.colDoing.innerHTML = ''; els.colDone.innerHTML = '';
        myTasks.forEach(task => {
            const safeT = JSON.stringify(task).replace(/"/g, '&quot;');
            const html = `
                <div class="kanban-card" draggable="true" ondragstart="window.perfilTech.kDrag(event, ${safeT})" ondragend="window.perfilTech.kEnd()">
                    <button class="k-expand-btn" onclick="this.parentElement.classList.toggle('expanded')"><i class="fas fa-chevron-down"></i></button>
                    <div class="k-card-title">${escapeHTML(task.titulo)}</div>
                    <div class="k-card-body">${escapeHTML(task.conteudo)}</div>
                    <div class="note-footer mt-2 pt-2 border-t border-slate-800">
                        <button class="note-btn" onclick='window.perfilTech.editKTask(${safeT})'><i class="fas fa-edit"></i></button>
                        <button class="note-btn del" onclick="window.perfilTech.delKTask('${task.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            if(task.status==='a_fazer') els.colTodo.innerHTML += html;
            else if(task.status==='em_progresso') els.colDoing.innerHTML += html;
            else els.colDone.innerHTML += html;
        });
    });

    window.perfilTech.kDrag = (e, t) => { draggedTask = t; e.dataTransfer.setData("text/plain", t.id); setTimeout(()=>e.target.classList.add('dragging'),0); };
    window.perfilTech.kEnd = () => { draggedTask = null; document.querySelectorAll('.kanban-card.dragging').forEach(el=>el.classList.remove('dragging')); document.querySelectorAll('.kanban-column').forEach(c=>c.classList.remove('drag-over')); };
}

async function loadHorarioEscolar() {
    if (!currentUser.Professor && !currentUser.turma) { els.horarioMsg.innerHTML = "Sem turma vinculada no sistema."; return; }

    const diasIds = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
    const h = new Date(); const dAt = h.getDay(); const seg = new Date(h); seg.setDate(h.getDate() + (dAt===0?-6:1-dAt));
    diasIds.forEach((id, i) => {
        const dt = new Date(seg); dt.setDate(seg.getDate()+i);
        const th = document.querySelector(`th[data-dia-id="${id}"] .data-dia`);
        if(th) th.textContent = dt.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        document.querySelector(`th[data-dia-id="${id}"]`).classList.toggle('hoje', (dAt >= 1 && dAt <= 5) && diasIds[dAt-1]===id);
        document.getElementById(`cell-${id}`).classList.toggle('hoje', (dAt >= 1 && dAt <= 5) && diasIds[dAt-1]===id);
    });

    ['segunda', 'terca', 'quarta', 'quinta', 'sexta'].forEach(d => { document.getElementById(`cell-${d}-feira`).innerHTML=''; });

    let q = currentUser.Professor ? query(collection(db, "aulas"), where("professorId", "==", currentUser.uid), orderBy("ordem")) 
                                  : query(collection(db, "aulas"), where("turmaId", "==", currentUser.turma), orderBy("ordem"));
    
    try {
        const snap = await getDocs(q);
        if(snap.empty) { els.horarioMsg.style.display='block'; els.horarioMsg.textContent = "Sem grade inserida para você."; return; }
        els.horarioMsg.style.display='none';
        snap.forEach(doc => {
            const a = doc.data(); const t = document.getElementById(`cell-${a.diaSemana}`);
            if(t) {
                const n = disciplineMap[a.disciplina] || a.disciplina;
                const sub = currentUser.Professor ? `<i class="fas fa-users text-amber-400"></i> ${a.turmaNome||a.turmaId}` : `<i class="fas fa-chalkboard-teacher text-blue-400"></i> ${a.professorNome}`;
                t.innerHTML += `<div class="aula-card border-l-2 border-blue-500"><h4 class="font-bold text-xs truncate">${a.ordem}ª - ${n}</h4><p class="text-[10px] mt-1">${sub}</p>${a.conteudo?`<div class="mt-1 pt-1 border-t border-slate-600/50 text-[9px] italic text-slate-400 leading-tight">${escapeHTML(a.conteudo)}</div>`:''}</div>`;
            }
        });
    } catch(e) { els.horarioMsg.style.display='block'; els.horarioMsg.textContent = "Erro na Matrix: " + e.message; }
}

async function fetchCalendarEvents() {
    const queries = [query(collection(db, "calendarioAnual"), where("visibilidade", "in", ["publico", "todos"]))];
    if(currentUser.turma && currentUser.role === 'aluno') queries.push(query(collection(db, "calendarioAnual"), where("visibilidade", "==", "turmas_especificas"), where("turmasAlvo", "array-contains", currentUser.turma)));
    if(currentUser.Admin || currentUser.Professor || currentUser.Coordenacao) queries.push(query(collection(db, "calendarioAnual"), where("instrutorUID", "==", currentUser.uid)));

    try {
        const res = await Promise.all(queries.map(q => getDocs(q)));
        const map = new Map();
        res.forEach(s => s.forEach(d => map.set(d.id, {id: d.id, ...d.data()})));
        calEvents = Array.from(map.values());
        window.renderCalendarGrid();
    } catch(e) {}
}

async function initCalendarSystem() {
    const isS = currentUser.Admin || currentUser.Coordenacao || currentUser.Professor;
    if(isS) { document.getElementById('btn-add-event').classList.remove('hidden'); document.getElementById('cal-admin-fields').classList.remove('hidden'); }
    await fetchCalendarEvents();
}

window.renderCalendarGrid = () => {
    const grid = document.getElementById('calendar-grid');
    document.getElementById('cal-current-month').textContent = calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    grid.innerHTML = '';
    
    let days = [];
    if(calView === 'month') {
        const y = calDate.getFullYear(); const m = calDate.getMonth();
        const ld = new Date(y, m + 1, 0);
        let sd = new Date(y, m, 1).getDay() - 1; if(sd < 0) sd = 6;
        for(let i=0; i < sd; i++) if(i < 5) days.push(null);
        for(let d=1; d <= ld.getDate(); d++) { const c = new Date(y, m, d); if(c.getDay()>=1 && c.getDay()<=5) days.push(c); }
        document.getElementById('cal-header-row').style.display = 'grid';
        grid.className = 'calendar-grid';
    } else {
        document.getElementById('cal-header-row').style.display = 'none';
        grid.className = 'calendar-grid week-view';
        const c = new Date(calDate); const d = c.getDay(); const mon = new Date(c.setDate(c.getDate() - d + (d===0?-6:1)));
        for(let i=0; i<5; i++) { const nd = new Date(mon); nd.setDate(mon.getDate() + i); days.push(nd); }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    days.forEach(dt => {
        const cell = document.createElement('div'); cell.className = 'day-cell';
        if(!dt || isNaN(dt.getTime())) cell.classList.add('empty');
        else {
            const ds = dt.toISOString().split('T')[0];
            if(ds === todayStr) cell.classList.add('today');
            cell.innerHTML = `<span class="day-number">${calView==='week'?dt.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric'}):dt.getDate()}</span>`;
            
            const evs = calEvents.filter(e => {
                if(!e.dataInicio) return false;
                try { const ed = e.dataInicio.toDate?e.dataInicio.toDate():new Date(e.dataInicio); return !isNaN(ed.getTime()) && ed.toISOString().split('T')[0]===ds; } catch(x){return false;}
            });
            evs.forEach(ev => {
                const safeE = JSON.stringify(ev).replace(/"/g, '&quot;');
                cell.innerHTML += `<div class="event-item" style="background-color:${ev.cor||'#3b82f6'};" onclick='event.stopPropagation(); window.perfilTech.openCalModal(${safeE})'>${escapeHTML(ev.titulo)}</div>`;
            });
            cell.onclick = () => window.perfilTech.openCalModal(null, ds);
        }
        grid.appendChild(cell);
    });
};

// GRÁFICOS (Chart.js)
async function loadBoletimAndMetrics() {
    const snap = await getDoc(doc(db, "notas", currentUser.uid));
    if(!snap.exists()) { els.boletimBody.innerHTML = '<tr><td colspan="14" class="text-center p-8 text-slate-500 italic">Sem avaliações registradas.</td></tr>'; return; }
    studentGradesData = snap.data().disciplinasComNotas || {};
    let html = ''; els.selEvolDisc.innerHTML = '<option value="">Geral (Média das Matérias)</option>';
    
    for(const [discId, trims] of Object.entries(studentGradesData)) {
        const nome = disciplineMap[discId] || discId;
        els.selEvolDisc.add(new Option(nome, discId));
        const getN = (t, k) => { const num = parseFloat(t[k]); return isNaN(num) ? '-' : num.toFixed(1); };
        const t1 = trims['1']||{}; const t2 = trims['2']||{}; const t3 = trims['3']||{};
        const calcM = (t) => { const v = [t.nota1,t.nota2,t.nota3,t.nota4].map(parseFloat).filter(n=>!isNaN(n)); return v.length?(v.reduce((a,b)=>a+b)/v.length):null; };
        const ms = [calcM(t1), calcM(t2), calcM(t3)].filter(n=>n!==null);
        const final = ms.length ? (ms.reduce((a,b)=>a+b)/ms.length).toFixed(1) : '-';
        const color = (n) => n==='-' ? 'nota-neutra' : (parseFloat(n)>=6?'nota-boa':'nota-ruim');

        html += `
            <tr class="hover:bg-slate-800/50 transition-colors">
                <td class="font-bold text-white text-xs p-3">${nome}</td>
                <td class="${color(getN(t1,'nota1'))}">${getN(t1,'nota1')}</td><td class="${color(getN(t1,'nota2'))}">${getN(t1,'nota2')}</td><td class="${color(getN(t1,'nota3'))}">${getN(t1,'nota3')}</td><td class="trim-divider ${color(getN(t1,'nota4'))}">${getN(t1,'nota4')}</td>
                <td class="${color(getN(t2,'nota1'))}">${getN(t2,'nota1')}</td><td class="${color(getN(t2,'nota2'))}">${getN(t2,'nota2')}</td><td class="${color(getN(t2,'nota3'))}">${getN(t2,'nota3')}</td><td class="trim-divider ${color(getN(t2,'nota4'))}">${getN(t2,'nota4')}</td>
                <td class="${color(getN(t3,'nota1'))}">${getN(t3,'nota1')}</td><td class="${color(getN(t3,'nota2'))}">${getN(t3,'nota2')}</td><td class="${color(getN(t3,'nota3'))}">${getN(t3,'nota3')}</td><td class="trim-divider ${color(getN(t3,'nota4'))}">${getN(t3,'nota4')}</td>
                <td class="media-final-col ${color(final)} text-sm">${final}</td>
            </tr>
        `;
    }
    els.boletimBody.innerHTML = html;
    renderScatterChart(); renderEvolutionChart();
}

els.selEvolDisc = { onchange: (e) => renderEvolutionChart(e.target.value) }; // Mock para o onChange do JS vanilla injetado

function renderScatterChart() {
    const ctx = document.getElementById('chart-scatter-notas').getContext('2d');
    const pts = [];
    Object.entries(studentGradesData).forEach(([dId, tr]) => {
        const n = disciplineMap[dId]||dId;
        ['1','2','3'].forEach(t => {
            ['nota1','nota2','nota3','nota4'].forEach((k,i) => {
                const v = parseFloat((tr[t]||{})[k]);
                if(!isNaN(v)) pts.push({x: Math.random()*10, y: v, label: `${n} (T${t}-N${i+1})`});
            });
        });
    });
    if(chartInstances['scatter']) chartInstances['scatter'].destroy();
    chartInstances['scatter'] = new Chart(ctx, {
        type: 'scatter', data: { datasets: [{ label: 'Notas', data: pts, backgroundColor: c=>c.raw?.y>=6?'#4ade80':'#ef4444', pointRadius: 5 }] },
        options: { responsive:true, maintainAspectRatio:false, scales:{x:{display:false}, y:{min:0,max:10,grid:{color:'#334155'}}}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`${c.raw.label}: ${c.raw.y}`}}} }
    });
}

window.perfilTech.renderEvolutionChartProxy = renderEvolutionChart; // Expõe
function renderEvolutionChart(discId = "") {
    const ctx = document.getElementById('chart-evolution').getContext('2d');
    if(chartInstances['evol']) chartInstances['evol'].destroy();
    let dVals = [];
    if(discId) {
        const tr = studentGradesData[discId]||{};
        ['1','2','3'].forEach(t => ['nota1','nota2','nota3','nota4'].forEach(k => { const v=parseFloat((tr[t]||{})[k]); dVals.push(isNaN(v)?null:v); }));
    } else {
        const s = Array(12).fill(0), c = Array(12).fill(0);
        Object.values(studentGradesData).forEach(tr => { let idx=0; ['1','2','3'].forEach(t => ['nota1','nota2','nota3','nota4'].forEach(k => { const v=parseFloat((tr[t]||{})[k]); if(!isNaN(v)){s[idx]+=v; c[idx]++;} idx++; })); });
        dVals = s.map((sm,i)=>c[i]?(sm/c[i]):null);
    }
    chartInstances['evol'] = new Chart(ctx, {
        type: 'line', data: { labels: ['T1N1','T1N2','T1N3','T1N4','T2N1','T2N2','T2N3','T2N4','T3N1','T3N2','T3N3','T3N4'], datasets: [{ label: discId?(disciplineMap[discId]||discId):'Média', data: dVals, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)', fill: true, tension: 0.4, spanGaps: true }] },
        options: { responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true,max:10,grid:{color:'#334155'}},x:{grid:{color:'#334155'}}} }
    });
}
document.getElementById('aluno-tech-content').addEventListener('change', e => { if(e.target.id === 'sel-evolution-disc') renderEvolutionChart(e.target.value); });