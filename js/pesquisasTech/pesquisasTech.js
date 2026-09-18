import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://dmwbvydkogpnhmprezew.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd2J2eWRrb2dwbmhtcHJlemV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODE4NDksImV4cCI6MjEwMjU1Nzg0OX0.bi15oVkl8n8veVCkKjryKtuPSzrPjKblJ9AMERymhFY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variáveis globais para armazenar os dados e instâncias dos gráficos na memória
window.pesquisaRespostasAtuais = [];
window.chartDinamicoInstancia = null;

export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    const isGestor = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;
    window.canDeletePesquisa = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao;

    container.innerHTML = `
        <div class="h-full flex flex-col w-full mx-auto pb-20 relative">
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h2 class="text-2xl md:text-3xl font-cinzel font-black text-white tracking-widest uppercase">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i> Pesquisas Tech
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Gestão inteligente de pesquisas e relatórios.</p>
                </div>
                
                <div class="flex gap-3">
                    <button id="btn-voltar-global" onclick="voltarParaPublico()" class="hidden px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-slate-700 shadow-lg">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                    ${isGestor ? `
                    <button id="btn-toggle-crud" onclick="toggleCrudMode()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                        <i class="fas fa-cog"></i> Gestão
                    </button>` : ''}
                </div>
            </div>

            <div id="pesquisas-main-area" class="flex-grow fade-in relative">
                <div id="loading-pesquisas" class="hidden absolute inset-0 flex-col items-center justify-center text-slate-500 z-10 bg-slate-950/80 backdrop-blur-sm">
                    <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-indigo-500"></i>
                    <p class="font-cinzel tracking-widest uppercase text-sm">Processando...</p>
                </div>

                <!-- 1. VISÃO PÚBLICA (Cards) -->
                <div id="visao-publica" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"></div>
                
                <!-- 2. DASHBOARD & FORMULÁRIO -->
                <div id="visao-dashboard" class="hidden flex-col gap-8 w-full"></div>
                <div id="visao-formulario" class="hidden flex-col gap-6 w-full max-w-3xl mx-auto fade-in"></div>

                ${isGestor ? `
                <!-- 3. GESTÃO DE PESQUISAS (Mestre) -->
                <div id="visao-gestao-pesquisas" class="hidden flex-col gap-6 fade-in">
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-indigo-500 shadow-xl shrink-0">
                        <h3 class="text-indigo-400 font-cinzel font-bold text-xl mb-4" id="form-pesquisa-title"><i class="fas fa-plus-circle mr-2"></i> Nova Pesquisa</h3>
                        <form id="form-pesquisa" onsubmit="salvarPesquisa(event)" class="space-y-4">
                            <input type="hidden" id="p-id">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="md:col-span-2">
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Título</label>
                                    <input type="text" id="p-titulo" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                                    <select id="p-status" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                        <option value="Aberta">Aberta (Coletando)</option>
                                        <option value="Fechada">Fechada (Apenas Dash)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="md:col-span-1">
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Período</label>
                                    <input type="text" id="p-data" required placeholder="Ex: Q1 2026" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</label>
                                    <input type="text" id="p-desc" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                            </div>
                            <div class="flex justify-end gap-3 pt-2">
                                <button type="button" onclick="limparFormPesquisa()" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">Limpar</button>
                                <button type="submit" class="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">Salvar</button>
                            </div>
                        </form>
                    </div>
                    <div class="overflow-y-auto custom-scroll rounded-2xl border border-slate-700 bg-slate-900/50 shadow-xl min-h-[300px]">
                        <table class="w-full text-sm text-left border-collapse">
                            <thead class="bg-slate-800 text-slate-400 uppercase text-[10px] tracking-widest">
                                <tr>
                                    <th class="p-4">Título da Pesquisa</th>
                                    <th class="p-4 text-center">Status</th>
                                    <th class="p-4 text-right">Ações de Gestão</th>
                                </tr>
                            </thead>
                            <tbody id="tabela-pesquisas" class="divide-y divide-slate-800"></tbody>
                        </table>
                    </div>
                </div>

                <!-- 4. GESTÃO DE PERGUNTAS (Detalhe) -->
                <div id="visao-gestao-perguntas" class="hidden flex-col gap-6 fade-in">
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-emerald-500 shadow-xl">
                        <div class="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                            <div>
                                <button onclick="voltarParaGestaoPesquisas()" class="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1"><i class="fas fa-arrow-left"></i> Voltar às Pesquisas</button>
                                <h3 class="text-emerald-400 font-cinzel font-bold text-xl" id="form-pergunta-title"><i class="fas fa-list-ol mr-2"></i> Perguntas: <span id="lbl-pesquisa-atual" class="text-white"></span></h3>
                            </div>
                        </div>
                        <form id="form-pergunta" onsubmit="salvarPergunta(event)" class="space-y-4">
                            <input type="hidden" id="q-pesquisa-id">
                            <input type="hidden" id="q-id">
                            
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div class="md:col-span-3">
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Enunciado</label>
                                    <input type="text" id="q-texto" required placeholder="Ex: Qual sua idade?" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ordem</label>
                                    <input type="number" id="q-ordem" value="1" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Chave (Ex: idade_aluno)</label>
                                    <input type="text" id="q-chave" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none font-mono text-sm lowercase">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Resposta</label>
                                    <select id="q-tipo" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                        <option value="VARCHAR">Opções (Select)</option>
                                        <option value="INT">Número</option>
                                        <option value="TEXT">Texto Livre</option>
                                        <option value="BOOLEAN">Sim / Não</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Opções (Separar por vírgula)</label>
                                    <input type="text" id="q-opcoes" placeholder="Ex: Matutino, Vespertino" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                </div>
                            </div>
                            <div class="flex justify-end gap-3 pt-2">
                                <button type="button" onclick="limparFormPergunta()" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">Limpar</button>
                                <button type="submit" class="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">Adicionar Pergunta</button>
                            </div>
                        </form>
                    </div>

                    <div id="lista-perguntas" class="space-y-3 max-h-[500px] overflow-y-auto custom-scroll pr-2 mt-4"></div>
                </div>` : ''}
            </div>
        </div>
    `;

    // Expõe as funções globalmente para o HTML rodar
    window.toggleCrudMode = toggleCrudMode;
    window.voltarParaPublico = voltarParaPublico;
    window.limparFormPesquisa = limparFormPesquisa;
    window.salvarPesquisa = salvarPesquisa;
    window.editarPesquisa = editarPesquisa;
    window.excluirPesquisa = excluirPesquisa;
    window.clonarPesquisa = clonarPesquisa;
    
    window.abrirGestaoPerguntas = abrirGestaoPerguntas;
    window.voltarParaGestaoPesquisas = voltarParaGestaoPesquisas;
    window.limparFormPergunta = limparFormPergunta;
    window.salvarPergunta = salvarPergunta;
    window.editarPergunta = editarPergunta;
    window.excluirPergunta = excluirPergunta;

    window.abrirAcaoPesquisa = abrirAcaoPesquisa;

    await carregarVisaoPublica();
}



// =========================================================
// CRUD PESQUISAS MESTRE & VISÃO PÚBLICA
// =========================================================
async function carregarVisaoPublica() {
    showLoading(true);
    const container = document.getElementById('visao-publica');
    try {
        const { data, error } = await supabase.from('pesquisas_mestre').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        container.innerHTML = '';
        (data || []).forEach(p => {
            const isFechada = p.status === 'Fechada';
            const badgeCor = isFechada ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            const btnColor = isFechada ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500';
            const icon = isFechada ? 'fa-chart-bar' : 'fa-edit';
            
            container.innerHTML += `
                <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col">
                    <div class="flex justify-between items-start mb-4">
                        <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${p.status}</span>
                        <span class="text-xs text-slate-500 font-bold">${p.data_referencia}</span>
                    </div>
                    <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${p.titulo}</h3>
                    <p class="text-sm text-slate-400 mb-6 flex-grow">${p.descricao}</p>
                    <button onclick="window.abrirAcaoPesquisa('${p.id}', '${p.status}', '${p.titulo}')" class="${btnColor} w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                        <i class="fas ${icon}"></i> ${isFechada ? 'Ver Resultados' : 'Responder'}
                    </button>
                </div>
            `;
        });
    } catch (e) { console.error(e); }
    showLoading(false);
}

async function carregarTabelaPesquisas() {
    showLoading(true);
    const tbody = document.getElementById('tabela-pesquisas');
    try {
        const { data, error } = await supabase.from('pesquisas_mestre').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        tbody.innerHTML = '';
        (data || []).forEach(p => {
            const pData = JSON.stringify(p).replace(/'/g, "\\'");
            const btnExcluir = window.canDeletePesquisa ? `<button onclick="excluirPesquisa('${p.id}')" title="Excluir" class="text-red-400 hover:bg-red-400/10 px-3 py-1.5 rounded-lg"><i class="fas fa-trash"></i></button>` : '';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-800">
                    <td class="p-4">
                        <div class="text-white font-bold">${p.titulo}</div>
                        <div class="text-xs text-slate-500">${p.data_referencia}</div>
                    </td>
                    <td class="p-4 text-center">
                        <span class="bg-slate-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase text-white">${p.status}</span>
                    </td>
                    <td class="p-4 text-right flex justify-end gap-2">
                        <button onclick="abrirGestaoPerguntas('${p.id}', '${p.titulo}')" title="Gerenciar Perguntas" class="text-emerald-400 hover:bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-500/30"><i class="fas fa-list-ol mr-1"></i> Perguntas</button>
                        <button onclick="clonarPesquisa('${p.id}')" title="Clonar Pesquisa" class="text-amber-400 hover:bg-amber-400/10 px-3 py-1.5 rounded-lg"><i class="fas fa-copy"></i></button>
                        <button onclick='editarPesquisa(${pData})' title="Editar" class="text-indigo-400 hover:bg-indigo-400/10 px-3 py-1.5 rounded-lg"><i class="fas fa-edit"></i></button>
                        ${btnExcluir}
                    </td>
                </tr>
            `;
        });
    } catch (e) { console.error(e); }
    showLoading(false);
}

function limparFormPesquisa() {
    document.getElementById('form-pesquisa').reset();
    document.getElementById('p-id').value = '';
    document.getElementById('form-pesquisa-title').innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Nova Pesquisa';
}

// =========================================================
// RENDERIZAÇÃO DA LISTA DE PESQUISAS
// =========================================================
async function carregarListaPesquisasDB() {
    const listaContainer = document.getElementById('lista-pesquisas');
    const loading = document.getElementById('loading-pesquisas');
    const tbodyCrud = document.getElementById('crud-table-body');

    try {
        const { data: pesquisas, error } = await supabase.from('pesquisas_lista').select('*').order('id', { ascending: true });
        if (error) throw error;

        listaContainer.innerHTML = ''; 
        if (tbodyCrud) tbodyCrud.innerHTML = '';

        if (!pesquisas || pesquisas.length === 0) {
            listaContainer.innerHTML = '<p class="text-slate-400 italic">Nenhuma pesquisa encontrada.</p>';
        } else {
            pesquisas.forEach(pesquisa => {
                const isFechada = pesquisa.status === 'Fechada';
                const badgeCor = isFechada ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                
                listaContainer.innerHTML += `
                    <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col transition-transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-4">
                            <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span>
                            <span class="text-xs text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${pesquisa.data_referencia}</span>
                        </div>
                        <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${pesquisa.titulo}</h3>
                        <p class="text-sm text-slate-400 mb-6 flex-grow leading-relaxed">${pesquisa.descricao}</p>
                        <button onclick="window.abrirAcaoPesquisa('${pesquisa.tabela_respostas_alvo}', '${pesquisa.status}', '${pesquisa.titulo}')" 
                            class="${isFechada ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'} w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                            <i class="fas ${isFechada ? 'fa-chart-bar' : 'fa-edit'}"></i> ${isFechada ? 'Ver Resultados' : 'Responder Pesquisa'}
                        </button>
                    </div>
                `;

                if (tbodyCrud) {
                    const btnExcluir = window.canDeletePesquisa 
                        ? `<button onclick="excluirPesquisaSupabase(${pesquisa.id})" class="text-red-400 hover:text-red-300 bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>` 
                        : '';
                    const pData = JSON.stringify(pesquisa).replace(/'/g, "\\'");

                    tbodyCrud.innerHTML += `
                        <tr class="hover:bg-slate-800/50 transition-colors">
                            <td class="p-4 text-white font-bold">${pesquisa.titulo}</td>
                            <td class="p-4 text-center text-slate-400 font-mono text-xs">${pesquisa.tabela_respostas_alvo}</td>
                            <td class="p-4 text-center"><span class="${badgeCor} px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span></td>
                            <td class="p-4 text-right flex justify-end gap-2">
                                <button onclick='editarPesquisaSupabase(${pData})' class="text-indigo-400 hover:text-indigo-300 bg-indigo-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-edit"></i></button>
                                ${btnExcluir}
                            </td>
                        </tr>
                    `;
                }
            });
        }
    } catch (err) {
        console.error("Erro ao buscar pesquisas:", err);
    }

    loading.classList.add('hidden');
    listaContainer.classList.remove('hidden');
}

// =========================================================
// FUNÇÕES DE CRUD (ADMIN)
// =========================================================
function toggleCrudMode() {
    const btn = document.getElementById('btn-toggle-crud');
    if (document.getElementById('visao-gestao-pesquisas').classList.contains('hidden')) {
        hideAllViews();
        document.getElementById('visao-gestao-pesquisas').classList.remove('hidden');
        btn.innerHTML = '<i class="fas fa-th-large"></i> Visão Pública';
        btn.classList.replace('bg-indigo-600', 'bg-emerald-600');
        carregarTabelaPesquisas();
    } else {
        voltarParaPublico();
        btn.innerHTML = '<i class="fas fa-cog"></i> Gestão';
        btn.classList.replace('bg-emerald-600', 'bg-indigo-600');
    }
}

function voltarParaPublico() {
    hideAllViews();
    document.getElementById('btn-voltar-global').classList.add('hidden');
    document.getElementById('visao-publica').classList.remove('hidden');
    carregarVisaoPublica();
}

function hideAllViews() {
    ['visao-publica', 'visao-dashboard', 'visao-formulario', 'visao-gestao-pesquisas', 'visao-gestao-perguntas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function showLoading(show) {
    const el = document.getElementById('loading-pesquisas');
    if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

window.limparFormPesquisa = function() {
    document.getElementById('form-pesquisa-crud').reset();
    document.getElementById('crud-id').value = '';
    document.getElementById('form-crud-title').innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Criar Nova Pesquisa';
}

window.editarPesquisaSupabase = function(pesquisa) {
    document.getElementById('crud-id').value = pesquisa.id;
    document.getElementById('crud-titulo').value = pesquisa.titulo;
    document.getElementById('crud-tabela').value = pesquisa.tabela_respostas_alvo;
    document.getElementById('crud-data').value = pesquisa.data_referencia;
    document.getElementById('crud-status').value = pesquisa.status;
    document.getElementById('crud-descricao').value = pesquisa.descricao;
    
    document.getElementById('form-crud-title').innerHTML = '<i class="fas fa-edit mr-2 text-amber-500"></i> Editando Pesquisa';
    document.getElementById('crud-pesquisas').scrollIntoView({ behavior: 'smooth' });
}

async function salvarPesquisa(e) {
    e.preventDefault();
    showLoading(true);
    const id = document.getElementById('p-id').value;
    const payload = {
        titulo: document.getElementById('p-titulo').value,
        status: document.getElementById('p-status').value,
        data_referencia: document.getElementById('p-data').value,
        descricao: document.getElementById('p-desc').value
    };

    try {
        if (id) await supabase.from('pesquisas_mestre').update(payload).eq('id', id);
        else await supabase.from('pesquisas_mestre').insert([payload]);
        limparFormPesquisa();
        await carregarTabelaPesquisas();
    } catch (e) { console.error(e); alert("Erro ao salvar."); }
    showLoading(false);
}

function editarPesquisa(p) {
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-titulo').value = p.titulo;
    document.getElementById('p-status').value = p.status;
    document.getElementById('p-data').value = p.data_referencia;
    document.getElementById('p-desc').value = p.descricao;
    document.getElementById('form-pesquisa-title').innerHTML = '<i class="fas fa-edit mr-2 text-amber-500"></i> Editando Pesquisa';
    document.getElementById('visao-gestao-pesquisas').scrollIntoView();
}

async function excluirPesquisa(id) {
    if (!window.canDeletePesquisa) return;
    if (confirm("EXCLUIR PESQUISA?\nIsso apagará todas as perguntas e respostas atreladas a ela permanentemente.")) {
        showLoading(true);
        await supabase.from('pesquisas_mestre').delete().eq('id', id);
        await carregarTabelaPesquisas();
    }
}

async function clonarPesquisa(idOriginal) {
    if (!confirm("Deseja clonar esta pesquisa e todas as suas perguntas?")) return;
    showLoading(true);
    try {
        // 1. Busca a pesquisa original
        const { data: pesqOrig } = await supabase.from('pesquisas_mestre').select('*').eq('id', idOriginal).single();
        // 2. Insere a nova pesquisa
        const { data: novaPesq } = await supabase.from('pesquisas_mestre').insert([{
            titulo: pesqOrig.titulo + ' (Cópia)',
            descricao: pesqOrig.descricao,
            status: 'Aberta',
            data_referencia: pesqOrig.data_referencia
        }]).select().single();

        // 3. Busca perguntas originais
        const { data: pergsOrig } = await supabase.from('perguntas_mestre').select('*').eq('pesquisa_id', idOriginal);
        
        // 4. Clona as perguntas apontando para o novo ID
        if (pergsOrig && pergsOrig.length > 0) {
            const novasPergs = pergsOrig.map(p => ({
                pesquisa_id: novaPesq.id,
                ordem: p.ordem,
                label_texto: p.label_texto,
                campo_chave: p.campo_chave,
                tipo_sql: p.tipo_sql,
                opcoes: p.opcoes
            }));
            await supabase.from('perguntas_mestre').insert(novasPergs);
        }
        await carregarTabelaPesquisas();
        alert("Pesquisa clonada com sucesso!");
    } catch (e) {
        console.error(e);
        alert("Erro ao clonar.");
    }
    showLoading(false);
}

window.excluirPesquisaSupabase = async function(id) {
    if (!window.canDeletePesquisa) {
        alert("Acesso Negado: Você não tem permissão para excluir.");
        return;
    }
    if (confirm("Atenção: Deseja realmente excluir esta pesquisa do catálogo? (Isso não apagará as respostas da tabela alvo)")) {
        try {
            const { error } = await supabase.from('pesquisas_lista').delete().eq('id', id);
            if (error) throw error;
            alert("Pesquisa removida do catálogo.");
            await carregarListaPesquisasDB();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }
    }
}

// =========================================================
// DASHBOARD ANALÍTICO (GRÁFICOS E CRUZAMENTO DE DADOS)
// =========================================================
window.abrirAcaoPesquisa = function(tabelaAlvo, status, titulo) {
    if (status === 'Aberta') {
        // Redireciona para o novo formulário renderizado dentro da própria página
        renderizarFormularioPesquisa(tabelaAlvo, titulo);
    } else {
        // Redireciona para o Dashboard Analítico
        abrirDashboardPesquisa(tabelaAlvo, titulo);
    }
};

function voltarParaLista() {
    document.getElementById('dashboard-pesquisa').classList.add('hidden');
    document.getElementById('dashboard-pesquisa').innerHTML = ''; 
    
    const formContainer = document.getElementById('form-responder-pesquisa');
    if(formContainer) {
        formContainer.classList.add('hidden');
        formContainer.innerHTML = ''; 
    }

    document.getElementById('btn-voltar-pesquisas').classList.add('hidden');
    document.getElementById('lista-pesquisas').classList.remove('hidden');
}

async function abrirDashboardPesquisa(tabelaAlvo, titulo) {
    const dashContainer = document.getElementById('dashboard-pesquisa');
    
    document.getElementById('lista-pesquisas').classList.add('hidden');
    document.getElementById('btn-voltar-pesquisas').classList.remove('hidden');
    dashContainer.classList.remove('hidden');

    // 1. INJETA APENAS A "CASCA" DO DASHBOARD (Título e Tela de Carregamento)
    dashContainer.innerHTML = `
        <div class="fade-in space-y-8 w-full mb-12">
            <h3 class="text-2xl font-cinzel font-bold text-indigo-400 border-l-4 border-indigo-500 pl-4 mb-6">Dashboard Analítico: ${titulo}</h3>
            
            <div id="dash-loading" class="text-center py-20 text-slate-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>

            <!-- O Conteúdo específico de cada pesquisa será injetado aqui dentro -->
            <div id="dash-content" class="hidden w-full flex-col gap-8"></div>
        </div>
    `;

    try {
        const { data: respostas, error } = await supabase.from(tabelaAlvo).select('*');
        if (error) throw error;

        document.getElementById('dash-loading').classList.add('hidden');
        document.getElementById('dash-content').classList.remove('hidden');

        // 2. O ROTEADOR (SWITCH)
        // Olha para o nome da tabela alvo e decide qual função de renderização chamar
        switch (tabelaAlvo) {
            case 'respostas_pesquisa':
                renderizarGraficosConvivencia(respostas || []);
                break;
                
            // EXEMPLO PARA O FUTURO:
            // case 'pesquisa_ia_2026':
            //     renderizarGraficosIA(respostas || []);
            //     break;
                
            default:
                // Se a tabela não tiver um painel programado, exibe uma mensagem amigável
                document.getElementById('dash-content').innerHTML = `
                    <div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center shadow-xl">
                        <i class="fas fa-tools text-4xl text-amber-500 mb-4"></i>
                        <h4 class="text-white font-bold mb-2">Painel em Construção</h4>
                        <p class="text-slate-400 text-sm">O dashboard analítico específico para a tabela <b>${tabelaAlvo}</b> ainda não foi programado no código-fonte.</p>
                    </div>`;
        }

    } catch (err) {
        console.error("Erro ao puxar dados da pesquisa:", err);
        document.getElementById('dash-loading').innerHTML = '<p class="text-red-400">Erro ao processar dados analíticos.</p>';
    }
}

// =========================================================
// MÓDULO 1: DASHBOARD DE CONVIVÊNCIA DIGITAL
// =========================================================
function renderizarGraficosConvivencia(respostas) {
    const content = document.getElementById('dash-content');
    
    // 1. INJETA O HTML ESPECÍFICO DESTA PESQUISA
    content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl flex flex-col justify-center text-center">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Respostas</h4>
                <div class="text-5xl font-black text-indigo-400">${respostas.length}</div>
            </div>
            <div class="md:col-span-2 bg-indigo-900/20 border border-indigo-500/30 p-8 rounded-2xl shadow-xl flex flex-col justify-center">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2"><i class="fas fa-info-circle mr-2"></i> Diagnóstico Ativo</h4>
                <p class="text-slate-400 text-sm leading-relaxed">Os gráficos abaixo cruzam as variáveis demográficas e de comportamento relatadas pelos alunos da pesquisa de Convivência.</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-user-shield mr-2"></i> 1. Número de Vítimas por Idade</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-vitimas-idade"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-eye mr-2"></i> 2. Presenciou Cyberbullying (Por Idade)</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-presenciou-idade"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-hands-helping mr-2"></i> 3. Sabe Pedir Ajuda (Por Série Escolar)</h4>
                <div class="relative flex-grow min-h-[320px] w-full flex justify-center items-center"><canvas id="chart-ajuda-serie"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-map-marked-alt mr-2"></i> 4. Ambiente Mais Propício (Cruzado c/ Idade)</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-ambiente-idade"></canvas></div>
            </div>
        </div>
    `;

    // 2. GERAÇÃO DOS GRÁFICOS DO CHART.JS
    Chart.defaults.color = '#94a3b8'; 
    Chart.defaults.font.family = 'Inter, sans-serif';

    if (window.chartInstances) {
        Object.values(window.chartInstances).forEach(chart => chart.destroy());
    }
    window.chartInstances = {};

    // Gráfico 1: Vítimas por Idade
    const vitimasPorIdade = {};
    respostas.filter(r => r.foi_vitima === true || r.foi_vitima === 'true').forEach(r => {
        if (r.idade) {
            vitimasPorIdade[r.idade] = (vitimasPorIdade[r.idade] || 0) + 1;
        }
    });
    const idadesV = Object.keys(vitimasPorIdade).sort((a,b) => a - b);
    
    window.chartInstances['vitimas'] = new Chart(document.getElementById('chart-vitimas-idade').getContext('2d'), {
        type: 'bar',
        data: {
            labels: idadesV.map(i => `${i} Anos`),
            datasets: [{
                label: 'Nº de Vítimas Identificadas',
                data: idadesV.map(i => vitimasPorIdade[i]),
                backgroundColor: '#ef4444', 
                borderRadius: 6
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } }
        }
    });

    // Gráfico 2: Presenciou Cyberbullying x Idade
    const presenciouCruzado = {}; 
    respostas.forEach(r => {
        if (r.idade && r.presenciou_bullying) {
            if (!presenciouCruzado[r.idade]) presenciouCruzado[r.idade] = {};
            const resp = r.presenciou_bullying;
            presenciouCruzado[r.idade][resp] = (presenciouCruzado[r.idade][resp] || 0) + 1;
        }
    });
    const idadesP = Object.keys(presenciouCruzado).sort((a,b) => a - b);
    const respostasUnicasP = [...new Set(respostas.map(r => r.presenciou_bullying).filter(Boolean))];
    
    const datasetsP = respostasUnicasP.map((resp, idx) => {
        const coresBorder = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7'];
        return {
            label: `Resp: ${resp}`,
            data: idadesP.map(idade => presenciouCruzado[idade][resp] || 0),
            borderColor: coresBorder[idx % coresBorder.length],
            backgroundColor: coresBorder[idx % coresBorder.length],
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 4,
            fill: false
        };
    });

    window.chartInstances['presenciou'] = new Chart(document.getElementById('chart-presenciou-idade').getContext('2d'), {
        type: 'line',
        data: { labels: idadesP.map(i => `${i} Anos`), datasets: datasetsP },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { color: '#334155' } } }
        }
    });

    // Gráfico 3: Sabe Pedir Ajuda x Série
    const ajudaSerie = {}; 
    respostas.forEach(r => {
        if (r.serie && r.sabe_pedir_ajuda !== undefined) {
            if (!ajudaSerie[r.serie]) ajudaSerie[r.serie] = {};
            const val = (r.sabe_pedir_ajuda === true || r.sabe_pedir_ajuda === 'true') ? 'Sabe Pedir Ajuda' : 'Tem Dúvida/Não Sabe';
            ajudaSerie[r.serie][val] = (ajudaSerie[r.serie][val] || 0) + 1;
        }
    });
    const seriesS = Object.keys(ajudaSerie);
    
    window.chartInstances['ajuda'] = new Chart(document.getElementById('chart-ajuda-serie').getContext('2d'), {
        type: 'radar',
        data: { 
            labels: seriesS, 
            datasets: [
                {
                    label: 'Sabe Pedir Ajuda',
                    data: seriesS.map(serie => ajudaSerie[serie]['Sabe Pedir Ajuda'] || 0),
                    backgroundColor: 'rgba(16, 185, 129, 0.4)',
                    borderColor: '#10b981',
                    pointBackgroundColor: '#10b981',
                    borderWidth: 2,
                    fill: true
                },
                {
                    label: 'Tem Dúvida/Não Sabe',
                    data: seriesS.map(serie => ajudaSerie[serie]['Tem Dúvida/Não Sabe'] || 0),
                    backgroundColor: 'rgba(239, 68, 68, 0.4)',
                    borderColor: '#ef4444',
                    pointBackgroundColor: '#ef4444',
                    borderWidth: 2,
                    fill: true
                }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: '#334155' },
                    grid: { color: '#334155' },
                    pointLabels: { color: '#cbd5e1', font: { size: 11 } },
                    ticks: { display: false }
                }
            }
        }
    });

    // Gráfico 4: Ambiente x Idade
    const ambienteIdade = {}; 
    respostas.forEach(r => {
        if (r.ambiente_risco && r.idade) {
            const amb = r.ambiente_risco;
            if (!ambienteIdade[amb]) ambienteIdade[amb] = {};
            ambienteIdade[amb][r.idade] = (ambienteIdade[amb][r.idade] || 0) + 1;
        }
    });
    const ambientesA = Object.keys(ambienteIdade);
    const todasIdades = [...new Set(respostas.map(r => r.idade).filter(Boolean))].sort((a,b) => a - b);

    const datasetsAmb = todasIdades.map((idade, idx) => {
        const cores = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981'];
        return {
            label: `${idade} Anos`,
            data: ambientesA.map(amb => ambienteIdade[amb][idade] || 0),
            backgroundColor: cores[idx % cores.length],
            borderRadius: 4
        };
    });

    window.chartInstances['ambiente'] = new Chart(document.getElementById('chart-ambiente-idade').getContext('2d'), {
        type: 'bar',
        data: { labels: ambientesA, datasets: datasetsAmb },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true, grid: { color: '#334155' } }, 
                y: { stacked: true, grid: { display: false } } 
            }
        }
    });
}

function renderizarGraficosEstaticos(dadosIdade, dadosMotivo, dadosTurno) {
    Chart.defaults.color = '#94a3b8'; 
    Chart.defaults.font.family = 'Inter, sans-serif';

    // 1. Gráfico de Barras (Idades)
    const idadesLabels = Object.keys(dadosIdade).sort((a, b) => parseInt(a) - parseInt(b));
    const idadesValores = idadesLabels.map(i => dadosIdade[i]);

    new Chart(document.getElementById('chart-pesquisa-idades').getContext('2d'), {
        type: 'bar',
        data: {
            labels: idadesLabels.map(i => `${i} Anos`),
            datasets: [{
                label: 'Respondentes por Idade',
                data: idadesValores,
                backgroundColor: '#6366f1', borderRadius: 4, barPercentage: 0.6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Gráfico de Pizza (Motivos)
    const motivosLabels = Object.keys(dadosMotivo);
    const motivosValores = motivosLabels.map(m => dadosMotivo[m]);

    new Chart(document.getElementById('chart-pesquisa-pizza').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: motivosLabels,
            datasets: [{
                data: motivosValores,
                backgroundColor: ['#3b82f6', '#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
                borderWidth: 2, borderColor: '#1e293b'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'left' } } }
    });

    // 3. Gráfico de Turno (Rosca)
    const turnoLabels = Object.keys(dadosTurno);
    const turnoValores = turnoLabels.map(t => dadosTurno[t]);

    new Chart(document.getElementById('chart-pesquisa-turno').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: turnoLabels,
            datasets: [{
                data: turnoValores,
                backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#94a3b8'],
                borderWidth: 2, borderColor: '#1e293b'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '50%', plugins: { legend: { position: 'bottom' } } }
    });
}


// =========================================================
// MÓDULO DO CONSTRUTOR DE PERGUNTAS (SCHEMA SQL)
// =========================================================
async function carregarEditorPerguntas() {
    const container = document.getElementById('lista-perguntas-container');
    if (!container) return;

    const { data: perguntas, error } = await supabase.from('perguntas_formulario').select('*').order('ordem', { ascending: true });
    
    if (error) {
        container.innerHTML = '<p class="text-red-400">Erro ao carregar estrutura do formulário.</p>';
        return;
    }

    container.innerHTML = '';
    (perguntas || []).forEach(p => {
        // Exibe o botão de exclusão apenas se o usuário for Admin/Professor/Coordenação
        const btnExcluir = window.canDeletePesquisa ? `<button onclick="excluirPergunta('${p.campo_chave}')" class="text-red-400 hover:text-red-300 ml-auto"><i class="fas fa-trash"></i></button>` : '';
        
        container.innerHTML += `
            <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col gap-2">
                <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span class="text-emerald-400 font-mono text-sm font-bold">${p.campo_chave}</span>
                    <span class="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded font-bold">${p.tipo_sql} (${p.tamanho_max})</span>
                    ${btnExcluir}
                </div>
                <div class="text-white text-sm">${p.label_texto}</div>
                <div class="text-slate-500 text-xs italic">${p.opcoes ? 'Opções: ' + p.opcoes : 'Campo de entrada livre'}</div>
            </div>
        `;
    });
}

window.salvarNovaPergunta = async function(e) {
    e.preventDefault();
    const novaPergunta = {
        label_texto: document.getElementById('perg-enunciado').value,
        campo_chave: document.getElementById('perg-chave').value,
        tipo_sql: document.getElementById('perg-tipo').value,
        tamanho_max: parseInt(document.getElementById('perg-tamanho').value),
        opcoes: document.getElementById('perg-opcoes').value,
        ordem: 99, 
        tipo_dado: document.getElementById('perg-tipo').value === 'INT' ? 'number' : 'select',
        colegio_id: 1 // Mantendo o padrão do seu app.js antigo
    };

    const { error } = await supabase.from('perguntas_formulario').insert([novaPergunta]);
    if (error) {
        console.error("Erro ao inserir pergunta:", error);
        alert("Erro ao inserir pergunta no Schema do Supabase.");
    } else {
        alert("Nova pergunta adicionada com sucesso!");
        document.getElementById('form-pergunta-crud').reset();
        carregarEditorPerguntas(); // Atualiza a lista na tela
    }
}

window.excluirPergunta = async function(campoChave) {
    if (!window.canDeletePesquisa) {
        alert("Acesso Negado: Você não tem permissão para excluir.");
        return;
    }
    
    if (confirm(`Deseja apagar a pergunta '${campoChave}' do banco de dados?`)) {
        const { error } = await supabase.from('perguntas_formulario').delete().eq('campo_chave', campoChave);
        if (error) {
            console.error("Erro ao excluir pergunta:", error);
            alert("Erro ao excluir a pergunta.");
        } else {
            carregarEditorPerguntas(); // Atualiza a lista na tela
        }
    }
}



// =========================================================
// CRUD PERGUNTAS (DETALHE DA PESQUISA)
// =========================================================
function abrirGestaoPerguntas(pesquisaId, titulo) {
    hideAllViews();
    document.getElementById('visao-gestao-perguntas').classList.remove('hidden');
    document.getElementById('lbl-pesquisa-atual').innerText = titulo;
    document.getElementById('q-pesquisa-id').value = pesquisaId;
    limparFormPergunta();
    carregarListaPerguntas(pesquisaId);
}

function voltarParaGestaoPesquisas() {
    hideAllViews();
    document.getElementById('visao-gestao-pesquisas').classList.remove('hidden');
    carregarTabelaPesquisas();
}

function limparFormPergunta() {
    document.getElementById('q-id').value = '';
    document.getElementById('q-texto').value = '';
    document.getElementById('q-chave').value = '';
    document.getElementById('q-opcoes').value = '';
    document.getElementById('q-tipo').value = 'VARCHAR';
    document.getElementById('q-ordem').value = '1';
    document.getElementById('form-pergunta-title').innerHTML = '<i class="fas fa-list-ol mr-2"></i> Perguntas: <span id="lbl-pesquisa-atual" class="text-white">' + document.getElementById('lbl-pesquisa-atual').innerText + '</span>';
}

async function carregarListaPerguntas(pesquisaId) {
    showLoading(true);
    const container = document.getElementById('lista-perguntas');
    try {
        const { data, error } = await supabase.from('perguntas_mestre').select('*').eq('pesquisa_id', pesquisaId).order('ordem', { ascending: true });
        if (error) throw error;
        
        container.innerHTML = '';
        (data || []).forEach(p => {
            const pData = JSON.stringify(p).replace(/'/g, "\\'");
            const btnExcluir = window.canDeletePesquisa ? `<button onclick="excluirPergunta('${p.id}')" class="text-red-400 hover:text-red-300 ml-2"><i class="fas fa-trash"></i></button>` : '';
            
            container.innerHTML += `
                <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col gap-2">
                    <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
                        <span class="bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold border border-emerald-500/30">Ordem: ${p.ordem}</span>
                        <span class="text-slate-300 font-mono text-sm font-bold ml-2">Chave: ${p.campo_chave}</span>
                        <div class="ml-auto flex gap-2">
                            <button onclick='editarPergunta(${pData})' class="text-indigo-400 hover:text-indigo-300"><i class="fas fa-edit"></i></button>
                            ${btnExcluir}
                        </div>
                    </div>
                    <div class="text-white text-sm font-bold">${p.label_texto}</div>
                    <div class="text-slate-500 text-xs italic">Tipo: ${p.tipo_sql} | ${p.opcoes ? 'Opções: ' + p.opcoes : 'Campo Livre'}</div>
                </div>
            `;
        });
    } catch (e) { console.error(e); }
    showLoading(false);
}

async function salvarPergunta(e) {
    e.preventDefault();
    showLoading(true);
    const pid = document.getElementById('q-pesquisa-id').value;
    const qid = document.getElementById('q-id').value;
    
    const payload = {
        pesquisa_id: pid,
        label_texto: document.getElementById('q-texto').value,
        campo_chave: document.getElementById('q-chave').value,
        tipo_sql: document.getElementById('q-tipo').value,
        opcoes: document.getElementById('q-opcoes').value,
        ordem: parseInt(document.getElementById('q-ordem').value)
    };

    try {
        if (qid) await supabase.from('perguntas_mestre').update(payload).eq('id', qid);
        else await supabase.from('perguntas_mestre').insert([payload]);
        limparFormPergunta();
        await carregarListaPerguntas(pid);
    } catch (e) { console.error(e); }
    showLoading(false);
}

function editarPergunta(p) {
    document.getElementById('q-id').value = p.id;
    document.getElementById('q-texto').value = p.label_texto;
    document.getElementById('q-chave').value = p.campo_chave;
    document.getElementById('q-tipo').value = p.tipo_sql;
    document.getElementById('q-opcoes').value = p.opcoes;
    document.getElementById('q-ordem').value = p.ordem;
    document.getElementById('visao-gestao-perguntas').scrollIntoView();
}

async function excluirPergunta(id) {
    if (!window.canDeletePesquisa) return;
    if (confirm("Excluir pergunta?")) {
        showLoading(true);
        const pid = document.getElementById('q-pesquisa-id').value;
        await supabase.from('perguntas_mestre').delete().eq('id', id);
        await carregarListaPerguntas(pid);
    }
}

// =========================================================
// FORMULÁRIO PÚBLICO (INSERINDO DADOS NO JSONB)
// =========================================================
window.abrirAcaoPesquisa = function(pesquisaId, status, titulo) {
    if (status === 'Aberta') renderizarFormularioPesquisa(pesquisaId, titulo);
    else abrirDashboardPesquisa(pesquisaId, titulo); // Dashboards podem ser desenvolvidos a partir do JSONB depois
};

async function renderizarFormularioPesquisa(pesquisaId, titulo) {
    hideAllViews();
    const formContainer = document.getElementById('visao-formulario');
    document.getElementById('btn-voltar-global').classList.remove('hidden');
    formContainer.classList.remove('hidden');

    formContainer.innerHTML = `
        <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full">
            <div class="border-b border-slate-700 pb-4 mb-6">
                <h3 class="text-2xl font-cinzel font-bold text-emerald-400"><i class="fas fa-edit mr-2"></i> ${titulo}</h3>
                <p class="text-sm text-slate-400 mt-2">Sua participação é confidencial e anônima.</p>
            </div>
            <form id="form-responder" onsubmit="enviarRespostaJSONB(event, '${pesquisaId}')" class="space-y-6">
                <div class="bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30">
                    <label class="block text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2"><i class="fas fa-school mr-1"></i> Selecione sua Instituição:</label>
                    <select id="form-colegio" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">
                        <option value="">Carregando...</option>
                    </select>
                </div>
                <div id="perguntas-dinamicas" class="space-y-6"><div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-emerald-500"></i></div></div>
                <div class="pt-6 border-t border-slate-700 text-right">
                    <button type="submit" id="btn-submit-resposta" class="w-full md:w-auto px-10 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">Enviar Resposta</button>
                </div>
            </form>
        </div>
    `;

    try {
        // Carrega Colégios (Assume que a tabela colegios ainda existe e é usada globalmente)
        const { data: colegios } = await supabase.from('colegios').select('*').order('nome');
        const selColegio = document.getElementById('form-colegio');
        selColegio.innerHTML = '<option value="">-- Selecione --</option>';
        (colegios || []).forEach(c => selColegio.innerHTML += `<option value="${c.id}">${c.nome}</option>`);

        // Carrega Perguntas da Pesquisa Específica
        const { data: perguntas } = await supabase.from('perguntas_mestre').select('*').eq('pesquisa_id', pesquisaId).order('ordem');
        const contPerguntas = document.getElementById('perguntas-dinamicas');
        contPerguntas.innerHTML = '';

        (perguntas || []).forEach(p => {
            const wrapper = document.createElement('div');
            wrapper.className = 'bg-slate-900/30 p-5 rounded-xl border border-slate-700';
            wrapper.innerHTML = `<label class="block text-sm font-bold text-slate-300 mb-3">${p.label_texto}</label>`;

            let inputHtml = '';
            if (p.tipo_sql === 'INT') {
                inputHtml = `<input type="number" name="${p.campo_chave}" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">`;
            } else if (p.tipo_sql === 'TEXT') {
                inputHtml = `<textarea name="${p.campo_chave}" required rows="3" class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500"></textarea>`;
            } else {
                let optionsHtml = '<option value="">Selecione...</option>';
                const lista = p.opcoes ? p.opcoes.split(',').map(o => o.trim()) : [];
                lista.forEach(o => optionsHtml += `<option value="${o}">${o}</option>`);
                inputHtml = `<select name="${p.campo_chave}" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">${optionsHtml}</select>`;
            }
            wrapper.innerHTML += inputHtml;
            contPerguntas.appendChild(wrapper);
        });
    } catch (err) { console.error(err); }
}

// A MÁGICA DO JSONB: Coleta as respostas e salva tudo num único campo flexível
window.enviarRespostaJSONB = async function(e, pesquisaId) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-resposta');
    btn.disabled = true; btn.innerHTML = 'Enviando...';

    const formData = new FormData(e.target);
    const jsonbData = {}; // Objeto que vai guardar todas as respostas dinamicas
    let colegioId = null;
    let colegioNome = null;

    for (let [key, value] of formData.entries()) {
        if (key === 'form-colegio') {
            colegioId = value;
            const sel = document.getElementById('form-colegio');
            colegioNome = sel.options[sel.selectedIndex].text;
        } else {
            jsonbData[key] = value; // Guarda a resposta da pergunta na chave correspondente
        }
    }

    try {
        const { error } = await supabase.from('respostas_mestre').insert([{
            pesquisa_id: pesquisaId,
            colegio_id: parseInt(colegioId),
            colegio_nome: colegioNome,
            dados_dinamicos: jsonbData // O Supabase entende e salva o JSON certinho!
        }]);
        if (error) throw error;
        
        alert("✅ Resposta enviada com sucesso!");
        voltarParaPublico();
    } catch (err) {
        console.error(err);
        alert("Erro ao enviar.");
        btn.disabled = false; btn.innerHTML = 'Enviar Resposta';
    }
}