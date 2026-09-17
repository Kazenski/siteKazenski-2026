import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'SUA_URL_DO_SUPABASE'; 
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON_DO_SUPABASE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variáveis globais para armazenar os dados e instâncias dos gráficos na memória
window.pesquisaRespostasAtuais = [];
window.chartDinamicoInstancia = null;

export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    const isGestor = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;
    const canDelete = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao;

    // Alterado de max-w-7xl para w-full para aproveitar 100% da largura da tela
    container.innerHTML = `
        <div class="h-full flex flex-col w-full mx-auto">
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h2 class="text-2xl md:text-3xl font-cinzel font-black text-white tracking-widest uppercase">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i> Pesquisas Tech
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Participe das pesquisas em andamento ou analise os relatórios interativos.</p>
                </div>
                
                <div class="flex gap-3">
                    <button id="btn-voltar-pesquisas" class="hidden px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-slate-700 shadow-lg">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                    ${isGestor ? `
                    <button id="btn-toggle-crud" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                        <i class="fas fa-cog"></i> Gestão
                    </button>` : ''}
                </div>
            </div>

            <div id="pesquisas-main-area" class="flex-grow fade-in relative">
                <div id="loading-pesquisas" class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10">
                    <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-indigo-500"></i>
                    <p class="font-cinzel tracking-widest uppercase text-sm">Conectando ao Supabase...</p>
                </div>

                <div id="lista-pesquisas" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 hidden"></div>
                
                <div id="dashboard-pesquisa" class="hidden flex-col gap-6 w-full"></div>

                ${isGestor ? `
                <div id="crud-pesquisas" class="hidden flex-col gap-6 fade-in">
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-indigo-500 shadow-xl shrink-0">
                        <h3 class="text-indigo-400 font-cinzel font-bold text-xl mb-6" id="form-crud-title">
                            <i class="fas fa-plus-circle mr-2"></i> Criar Nova Pesquisa
                        </h3>
                        <form id="form-pesquisa-crud" class="space-y-4">
                            <input type="hidden" id="crud-id">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Título da Pesquisa</label>
                                    <input type="text" id="crud-titulo" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tabela Alvo (Supabase)</label>
                                    <input type="text" id="crud-tabela" required placeholder="Ex: respostas_pesquisa" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Período / Referência</label>
                                    <input type="text" id="crud-data" required placeholder="Ex: Q1 2026 ou Março 2026" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                                    <select id="crud-status" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none">
                                        <option value="Aberta">Aberta (Coletando)</option>
                                        <option value="Fechada">Fechada (Apenas Dashboard)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</label>
                                <textarea id="crud-descricao" required rows="2" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-indigo-500 outline-none custom-scroll"></textarea>
                            </div>
                            <div class="flex justify-end gap-3 pt-2 border-t border-slate-700">
                                <button type="button" onclick="limparFormPesquisa()" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">Limpar</button>
                                <button type="submit" class="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg">Salvar Pesquisa</button>
                            </div>
                        </form>
                    </div>

                    <div class="flex-grow overflow-y-auto custom-scroll rounded-2xl border border-slate-700 bg-slate-900/50 shadow-xl relative min-h-[300px]">
                        <table class="w-full text-sm text-left border-collapse">
                            <thead class="bg-slate-800 text-slate-400 uppercase text-[10px] tracking-widest sticky top-0">
                                <tr>
                                    <th class="p-4">Título</th>
                                    <th class="p-4 text-center">Tabela Supabase</th>
                                    <th class="p-4 text-center">Status</th>
                                    <th class="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="crud-table-body" class="divide-y divide-slate-800"></tbody>
                        </table>
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;

    await carregarListaPesquisasDB();
    document.getElementById('btn-voltar-pesquisas').addEventListener('click', voltarParaLista);
    
    if (isGestor) {
        document.getElementById('btn-toggle-crud').addEventListener('click', toggleCrudMode);
        document.getElementById('form-pesquisa-crud').addEventListener('submit', salvarPesquisaSupabase);
        window.canDeletePesquisa = canDelete; 
    }
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
    const lista = document.getElementById('lista-pesquisas');
    const crud = document.getElementById('crud-pesquisas');
    const btn = document.getElementById('btn-toggle-crud');

    if (lista.classList.contains('hidden')) {
        lista.classList.remove('hidden');
        crud.classList.add('hidden');
        btn.innerHTML = '<i class="fas fa-cog"></i> Gestão';
        btn.classList.replace('bg-emerald-600', 'bg-indigo-600');
    } else {
        lista.classList.add('hidden');
        crud.classList.remove('hidden');
        btn.innerHTML = '<i class="fas fa-th-large"></i> Visão Pública';
        btn.classList.replace('bg-indigo-600', 'bg-emerald-600');
    }
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

async function salvarPesquisaSupabase(e) {
    e.preventDefault();
    const id = document.getElementById('crud-id').value;
    const dados = {
        titulo: document.getElementById('crud-titulo').value,
        tabela_respostas_alvo: document.getElementById('crud-tabela').value,
        data_referencia: document.getElementById('crud-data').value,
        status: document.getElementById('crud-status').value,
        descricao: document.getElementById('crud-descricao').value
    };

    try {
        if (id) {
            const { error } = await supabase.from('pesquisas_lista').update(dados).eq('id', id);
            if (error) throw error;
            alert("Pesquisa atualizada com sucesso!");
        } else {
            const { error } = await supabase.from('pesquisas_lista').insert([dados]);
            if (error) throw error;
            alert("Nova pesquisa criada com sucesso!");
        }
        limparFormPesquisa();
        await carregarListaPesquisasDB();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Ocorreu um erro ao salvar a pesquisa no Supabase.");
    }
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
        window.open('https://kazenski.github.io/tecnicoTancredo/index.html', '_blank');
    } else {
        abrirDashboardPesquisa(tabelaAlvo, titulo);
    }
};

function voltarParaLista() {
    document.getElementById('dashboard-pesquisa').classList.add('hidden');
    document.getElementById('dashboard-pesquisa').innerHTML = ''; 
    document.getElementById('btn-voltar-pesquisas').classList.add('hidden');
    document.getElementById('lista-pesquisas').classList.remove('hidden');
}

async function abrirDashboardPesquisa(tabelaAlvo, titulo) {
    const dashContainer = document.getElementById('dashboard-pesquisa');
    
    document.getElementById('lista-pesquisas').classList.add('hidden');
    document.getElementById('btn-voltar-pesquisas').classList.remove('hidden');
    dashContainer.classList.remove('hidden');

    dashContainer.innerHTML = `
        <div class="fade-in space-y-6 w-full">
            <h3 class="text-2xl font-cinzel font-bold text-indigo-400 border-l-4 border-indigo-500 pl-4 mb-6">Dashboard Analítico: ${titulo}</h3>
            
            <div id="dash-loading" class="text-center py-10 text-slate-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>

            <div id="dash-content" class="hidden w-full flex-col gap-6">
                
                <!-- KPIs Topo -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-center text-center">
                        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Respostas</h4>
                        <div class="text-4xl font-black text-indigo-400" id="dash-total-interacoes">0</div>
                    </div>
                    <div class="lg:col-span-3 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Distribuição de Idades</h4>
                        <div class="relative h-48 w-full"><canvas id="chart-pesquisa-idades"></canvas></div>
                    </div>
                </div>

                <!-- Gráficos Estáticos Secundários -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Principais Motivos Relatados</h4>
                        <div class="relative h-64 w-full flex justify-center"><canvas id="chart-pesquisa-pizza"></canvas></div>
                    </div>
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Distribuição por Turno</h4>
                        <div class="relative h-64 w-full flex justify-center"><canvas id="chart-pesquisa-turno"></canvas></div>
                    </div>
                </div>

                <!-- Explorador de Dados Dinâmico -->
                <div class="bg-slate-900/50 p-6 md:p-8 rounded-2xl border border-indigo-500/30 shadow-xl w-full">
                    <h3 class="text-lg font-cinzel font-bold text-indigo-400 mb-2"><i class="fas fa-search-chart mr-2"></i> Explorador Dinâmico de Dados</h3>
                    <p class="text-xs text-slate-400 mb-6">Cruze informações gerando gráficos baseados em perguntas específicas da pesquisa.</p>
                    
                    <div class="flex flex-col md:flex-row gap-4 mb-6">
                        <select id="seletor-dinamico" class="w-full flex-grow bg-slate-800 border border-slate-700 text-white rounded-xl py-3 px-4 outline-none focus:border-indigo-500 font-bold">
                            <option value="">Carregando perguntas disponíveis...</option>
                        </select>
                        <button onclick="window.gerarGraficoCruzado()" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest px-8 py-3 rounded-xl transition-all shadow-lg whitespace-nowrap">
                            <i class="fas fa-chart-bar mr-2"></i> Gerar Gráfico
                        </button>
                    </div>

                    <div class="relative h-80 w-full bg-slate-800 rounded-xl p-4 border border-slate-700">
                        <canvas id="chart-pesquisa-dinamico"></canvas>
                        <div id="msg-dinamico" class="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-xl text-slate-500 text-xs uppercase tracking-widest font-bold">
                            Selecione uma pergunta acima para cruzar os dados.
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    try {
        // 1. Busca os dados reais da tabela alvo (ex: respostas_pesquisa)
        const { data: respostas, error: errResp } = await supabase.from(tabelaAlvo).select('*');
        if (errResp) throw errResp;

        // Armazena globalmente para não precisar baixar novamente ao trocar de gráfico dinâmico
        window.pesquisaRespostasAtuais = respostas || [];

        // 2. Busca a estrutura de perguntas do formulário para o Explorador Dinâmico
        const { data: perguntas, error: errPerg } = await supabase.from('perguntas_formulario').select('*').order('ordem', { ascending: true });
        if (errPerg) throw errPerg;

        const selectDinamico = document.getElementById('seletor-dinamico');
        selectDinamico.innerHTML = '<option value="">-- Selecione uma pergunta para analisar --</option>';
        if (perguntas) {
            perguntas.forEach(p => {
                selectDinamico.innerHTML += `<option value="${p.campo_chave}">${p.label_texto}</option>`;
            });
        }

        // 3. Oculta Loading e Popula Dados Iniciais
        document.getElementById('dash-loading').classList.add('hidden');
        document.getElementById('dash-content').classList.remove('hidden');
        document.getElementById('dash-total-interacoes').innerText = window.pesquisaRespostasAtuais.length;

        // Processa dados para os gráficos estáticos iniciais
        const contagemIdade = {};
        const contagemMotivo = {};
        const contagemTurno = {};

        window.pesquisaRespostasAtuais.forEach(r => {
            if (r.idade) contagemIdade[r.idade] = (contagemIdade[r.idade] || 0) + 1;
            
            const motivo = r.motivo_frequente || 'Não Informado';
            contagemMotivo[motivo] = (contagemMotivo[motivo] || 0) + 1;

            const turno = r.turno || 'Não Informado';
            contagemTurno[turno] = (contagemTurno[turno] || 0) + 1;
        });

        renderizarGraficosEstaticos(contagemIdade, contagemMotivo, contagemTurno);

    } catch (err) {
        console.error("Erro ao puxar dados da pesquisa:", err);
        document.getElementById('dash-loading').innerHTML = '<p class="text-red-400">Erro ao processar dados analíticos.</p>';
    }
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
// LÓGICA DO EXPLORADOR DINÂMICO
// =========================================================
window.gerarGraficoCruzado = function() {
    const select = document.getElementById('seletor-dinamico');
    const campo = select.value;
    
    if (!campo) {
        alert("Selecione uma pergunta primeiro.");
        return;
    }

    const textoPergunta = select.options[select.selectedIndex].text;
    const msgDinamico = document.getElementById('msg-dinamico');
    msgDinamico.classList.add('hidden'); // Esconde a mensagem "Selecione uma pergunta"

    // 1. Processa os dados já cacheados localmente na variável global
    const contagemDinamica = {};
    
    window.pesquisaRespostasAtuais.forEach(r => {
        let valor = r[campo];
        
        // Formata Booleanos para texto amigável
        if (valor === true || valor === 'true') valor = 'Sim';
        else if (valor === false || valor === 'false') valor = 'Não';
        else if (valor === null || valor === undefined || valor === '') valor = 'Sem Resposta';

        contagemDinamica[valor] = (contagemDinamica[valor] || 0) + 1;
    });

    const labels = Object.keys(contagemDinamica);
    const valores = Object.values(contagemDinamica);

    // 2. Destrói o gráfico anterior caso ele exista para não dar sobreposição no Canvas
    if (window.chartDinamicoInstancia) {
        window.chartDinamicoInstancia.destroy();
    }

    // 3. Renderiza o Novo Gráfico
    const ctx = document.getElementById('chart-pesquisa-dinamico').getContext('2d');
    window.chartDinamicoInstancia = new Chart(ctx, {
        type: 'bar', // Barra horizontal é melhor para ler texto
        data: {
            labels: labels,
            datasets: [{
                label: `Quantidade de Respostas`,
                data: valores,
                backgroundColor: '#a855f7', // purple-500
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Inverte o eixo X pelo Y (Barras deitadas)
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: textoPergunta,
                    color: '#cbd5e1',
                    font: { size: 14 }
                },
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: '#334155' } },
                y: { grid: { display: false } }
            }
        }
    });
}