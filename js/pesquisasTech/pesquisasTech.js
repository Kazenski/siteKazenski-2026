import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://dmwbvydkogpnhmprezew.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd2J2eWRrb2dwbmhtcHJlemV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODE4NDksImV4cCI6MjEwMjU1Nzg0OX0.bi15oVkl8n8veVCkKjryKtuPSzrPjKblJ9AMERymhFY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Variáveis globais para armazenar os dados e instâncias dos gráficos na memória
window.pesquisaRespostasAtuais = [];
window.chartDinamicoInstancia = null;
// Expor funções no window
window.abrirDashboardPesquisa = abrirDashboardPesquisa;
window.renderizarFormularioPesquisa = renderizarFormularioPesquisa;

export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    const isGestor = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;
    const canDelete = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao;

    container.innerHTML = `
        <div class="h-full flex flex-col w-full mx-auto pb-20">
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h2 class="text-2xl md:text-3xl font-cinzel font-black text-white tracking-widest uppercase">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i> Pesquisas Tech
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Participe das pesquisas em andamento ou analise os relatórios analíticos.</p>
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
                
                <div id="dashboard-pesquisa" class="hidden flex-col gap-8 w-full"></div>
                
                <!-- CONTAINER NOVO: FORMULÁRIO DE RESPOSTA PÚBLICO -->
                <div id="form-responder-pesquisa" class="hidden flex-col gap-6 w-full max-w-3xl mx-auto fade-in"></div>

                ${isGestor ? `
                <div id="crud-pesquisas" class="hidden flex-col gap-6 fade-in">
                    
                    <!-- CRIAR NOVA PESQUISA (CATÁLOGO) -->
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

                    <!-- CONSTRUTOR DE PERGUNTAS (ENGENHARIA DE DADOS) -->
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-emerald-500 shadow-xl mt-8">
                        <h3 class="text-emerald-400 font-cinzel font-bold text-xl mb-6">
                            <i class="fas fa-database mr-2"></i> Construtor de Perguntas (Schema SQL)
                        </h3>

                        <!-- NOVO: Indicador de pesquisa selecionada -->
                        <h4 id="perg-pesquisa-titulo" class="text-sm text-slate-400 mb-6 font-bold bg-slate-900 p-3 rounded-lg border border-slate-700">
                            Selecione uma pesquisa na tabela acima para gerenciar suas perguntas.
                        </h4>

                        <form id="form-pergunta-crud" class="space-y-4">

                            <!-- NOVO: Campo oculto para armazenar o ID da pesquisa selecionada -->
                            <input type="hidden" id="perg-pesquisa-id">

                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Enunciado Completo da Pergunta</label>
                                <input type="text" id="perg-enunciado" required placeholder="Ex: Qual o aplicativo que você mais utiliza?" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Campo Chave (Coluna SQL)</label>
                                    <input type="text" id="perg-chave" required placeholder="ex: app_mais_usado" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none font-mono text-sm">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo de Dado</label>
                                    <select id="perg-tipo" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                        <option value="VARCHAR">Lista de Opções (VARCHAR)</option>
                                        <option value="INT">Número Inteiro (INT)</option>
                                        <option value="BOOLEAN">Sim/Não (BOOLEAN)</option>
                                        <option value="TEXT">Texto Livre (TEXT)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tamanho Máximo</label>
                                    <input type="number" id="perg-tamanho" value="100" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Opções de Resposta (separadas por vírgula)</label>
                                <textarea id="perg-opcoes" rows="2" placeholder="Ex: WhatsApp, Instagram, TikTok" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-emerald-500 outline-none custom-scroll"></textarea>
                            </div>
                            <div class="flex justify-end pt-2">
                                <button type="submit" class="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-900/50">Adicionar Pergunta</button>
                            </div>
                        </form>

                        <div id="lista-perguntas-container" class="mt-6 space-y-3 max-h-80 overflow-y-auto custom-scroll pr-2"></div>
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
        
        // Listeners do Construtor de Perguntas
        const formPergunta = document.getElementById('form-pergunta-crud');
        if(formPergunta) formPergunta.addEventListener('submit', salvarNovaPergunta);
        
        window.canDeletePesquisa = canDelete; 
        carregarEditorPerguntas(); // Carrega as perguntas existentes na tela de gestão
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
                
                // LÓGICA DE BOTÕES: Se for gestor e estiver aberta, mostra 2 botões.
                const isGestor = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;
                
                let botoesAcaoHtml = '';
                if (isFechada) {
                    botoesAcaoHtml = `<button onclick="window.abrirDashboardPesquisa('${pesquisa.tabela_respostas_alvo}', '${pesquisa.titulo}')" 
                        class="bg-indigo-600 hover:bg-indigo-500 w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                        <i class="fas fa-chart-bar"></i> Ver Resultados Dashboard
                    </button>`;
                } else {
                    botoesAcaoHtml = `<button onclick="window.renderizarFormularioPesquisa('${pesquisa.tabela_respostas_alvo}', '${pesquisa.titulo}', ${pesquisa.id})" 
                        class="bg-emerald-600 hover:bg-emerald-500 w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2 mb-2">
                        <i class="fas fa-edit"></i> Responder Pesquisa
                    </button>`;
                    
                    // Se for gestor, adiciona o botão de ver resultados mesmo aberta
                    if (isGestor) {
                        botoesAcaoHtml += `<button onclick="window.abrirDashboardPesquisa('${pesquisa.tabela_respostas_alvo}', '${pesquisa.titulo}')" 
                            class="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white w-full font-bold text-[10px] uppercase tracking-widest py-2 rounded-xl transition-all flex justify-center items-center gap-2">
                            <i class="fas fa-chart-line"></i> Acessar Dashboard (Admin)
                        </button>`;
                    }
                }
                
                listaContainer.innerHTML += `
                    <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col transition-transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-4">
                            <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span>
                            <span class="text-xs text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${pesquisa.data_referencia}</span>
                        </div>
                        <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${pesquisa.titulo}</h3>
                        <p class="text-sm text-slate-400 mb-6 flex-grow leading-relaxed">${pesquisa.descricao}</p>
                        <div class="flex flex-col w-full mt-auto">
                            ${botoesAcaoHtml}
                        </div>
                    </div>
                `;

                if (tbodyCrud) {
                    const btnExcluir = window.canDeletePesquisa 
                        ? `<button onclick="excluirPesquisaSupabase(${pesquisa.id})" title="Excluir" class="text-red-400 hover:text-red-300 bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>` 
                        : '';
                    const pData = JSON.stringify(pesquisa).replace(/'/g, "\\'");

                    // NOVO: Adicionado botão de Duplicar
                    tbodyCrud.innerHTML += `
                        <tr class="hover:bg-slate-800/50 transition-colors">
                            <td class="p-4 text-white font-bold">${pesquisa.titulo}</td>
                            <td class="p-4 text-center text-slate-400 font-mono text-xs">${pesquisa.tabela_respostas_alvo}</td>
                            <td class="p-4 text-center"><span class="${badgeCor} px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span></td>
                            <td class="p-4 text-right flex justify-end gap-2">
                                <button onclick='window.duplicarPesquisa(${pData})' title="Duplicar Pesquisa" class="text-emerald-400 hover:text-emerald-300 bg-emerald-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-copy"></i></button>
                                <button onclick='editarPesquisaSupabase(${pData})' title="Editar" class="text-indigo-400 hover:text-indigo-300 bg-indigo-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-edit"></i></button>
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
    
    // Reseta o construtor de perguntas
    document.getElementById('perg-pesquisa-id').value = '';
    document.getElementById('perg-pesquisa-titulo').innerHTML = 'Selecione uma pesquisa na tabela acima para gerenciar suas perguntas.';
    window.carregarEditorPerguntas(null);
}

window.editarPesquisaSupabase = function(pesquisa) {
    document.getElementById('crud-id').value = pesquisa.id;
    document.getElementById('crud-titulo').value = pesquisa.titulo;
    document.getElementById('crud-tabela').value = pesquisa.tabela_respostas_alvo;
    document.getElementById('crud-data').value = pesquisa.data_referencia;
    document.getElementById('crud-status').value = pesquisa.status;
    document.getElementById('crud-descricao').value = pesquisa.descricao;
    
    document.getElementById('form-crud-title').innerHTML = '<i class="fas fa-edit mr-2 text-amber-500"></i> Editando Pesquisa';
    document.getElementById('perg-pesquisa-id').value = pesquisa.id;
    document.getElementById('perg-pesquisa-titulo').innerHTML = `Gerenciando perguntas da pesquisa: <strong class="text-emerald-400">${pesquisa.titulo}</strong>`;
    window.carregarEditorPerguntas(pesquisa.id);
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
        // 2. O ROTEADOR (SWITCH)
        // 🚀 ONDE ADICIONAR NOVOS DASHBOARDS:
        // Sempre que criar uma nova pesquisa, pegue o nome da "tabela_respostas_alvo" dela
        // e adicione um novo `case` aqui embaixo chamando a função do novo dashboard.
        switch (tabelaAlvo) {
            case 'respostas_pesquisa':
                renderizarGraficosConvivencia(respostas || []);
                break;
                
            // EXEMPLO DE COMO ADICIONAR A PRÓXIMA:
            // case 'minha_nova_tabela_tech':
            //     minhaFuncaoDeRenderNovoDash(respostas || []);
            //     break;
                
            default:
                document.getElementById('dash-content').innerHTML = `
                    <div class="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center shadow-xl">
                        <i class="fas fa-tools text-4xl text-amber-500 mb-4"></i>
                        <h4 class="text-white font-bold mb-2">Painel Padrão ou Em Construção</h4>
                        <p class="text-slate-400 text-sm mb-4">A tabela <b>${tabelaAlvo}</b> coletou <b>${respostas ? respostas.length : 0} respostas</b>.</p>
                        <p class="text-slate-500 text-xs italic">Dica: Crie uma função "renderizarGraficosX()" e adicione no switch em pesquisasTech.js</p>
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
// DUPLICAR PESQUISA E GERAR TABELA AUTOMÁTICA
// =========================================================
window.duplicarPesquisa = async function(pesquisaOriginal) {
    const novaTabela = prompt("Digite o nome da NOVA tabela no Supabase (ex: pesquisa_nova_2026):", pesquisaOriginal.tabela_respostas_alvo + "_copia");
    
    if (!novaTabela) return;

    try {
        // 1. Chama a função RPC (criada no passo 1) para gerar a tabela automaticamente
        const { error: rpcError } = await supabase.rpc('criar_tabela_pesquisa_dinamica', { nome_tabela: novaTabela });
        if (rpcError) throw rpcError;

        // 2. Duplica o registro da pesquisa no catálogo
        const novaPesquisa = {
            titulo: pesquisaOriginal.titulo + " (Cópia)",
            descricao: pesquisaOriginal.descricao,
            status: "Fechada", // Cria fechada por padrão
            data_referencia: new Date().getFullYear().toString(),
            tabela_respostas_alvo: novaTabela
        };

        const { data: pesqInserida, error: errInsert } = await supabase.from('pesquisas_lista').insert([novaPesquisa]).select();
        if (errInsert) throw errInsert;

        // 3. Duplicar as perguntas associadas a ela (Se houver lógica de pesquisa_id)
        const novoPesquisaId = pesqInserida[0].id;
        
        const { data: perguntasAntigas } = await supabase.from('perguntas_formulario').select('*').eq('pesquisa_id', pesquisaOriginal.id);
        
        if (perguntasAntigas && perguntasAntigas.length > 0) {
            const novasPerguntas = perguntasAntigas.map(p => {
                const { id, ...resto } = p; // Remove o ID antigo
                return { ...resto, pesquisa_id: novoPesquisaId };
            });
            await supabase.from('perguntas_formulario').insert(novasPerguntas);
        }

        alert(`✅ Pesquisa e Tabela '${novaTabela}' criadas com sucesso!`);
        await carregarListaPesquisasDB();

    } catch (error) {
        console.error("Erro ao duplicar:", error);
        alert("Erro ao duplicar. Certifique-se de ter rodado o script SQL no Supabase.");
    }
}

// =========================================================
// MÓDULO DE RESPOSTA PÚBLICA (FORMULÁRIO)
// =========================================================
async function renderizarFormularioPesquisa(tabelaAlvo, titulo, pesquisaId) {
    
    const formContainer = document.getElementById('form-responder-pesquisa');
    
    document.getElementById('lista-pesquisas').classList.add('hidden');
    document.getElementById('btn-voltar-pesquisas').classList.remove('hidden');
    formContainer.classList.remove('hidden');

    formContainer.innerHTML = `
        <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full">
            <div class="border-b border-slate-700 pb-4 mb-6 text-center md:text-left">
                <h3 class="text-2xl font-cinzel font-bold text-emerald-400"><i class="fas fa-edit mr-2"></i> ${titulo}</h3>
                <p class="text-sm text-slate-400 mt-2">Sua participação é confidencial e anônima.</p>
            </div>

            <form id="pesquisa-publica-form" class="space-y-6">
                <!-- Seletor de Colégio -->
                <div class="bg-slate-900/50 p-4 rounded-xl border border-emerald-500/30">
                    <label class="block text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2"><i class="fas fa-school mr-1"></i> Selecione sua Instituição/Setor:</label>
                    <select id="form-colegio" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">
                        <option value="">Carregando instituições...</option>
                    </select>
                </div>

                <div id="perguntas-dinamicas-container" class="space-y-6">
                    <div class="text-center py-10 text-slate-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
                </div>

                <div class="pt-6 border-t border-slate-700 text-right">
                    <button type="submit" id="btn-enviar-pesquisa" class="w-full md:w-auto px-10 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-transform hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                        <i class="fas fa-paper-plane mr-2"></i> Enviar Resposta Anônima
                    </button>
                </div>
            </form>
        </div>
    `;

    try {
        // 1. Carregar Colégios
        const { data: colegios, error: errCol } = await supabase.from('colegios').select('*').order('nome');
        if (errCol) throw errCol;
        
        const selColegio = document.getElementById('form-colegio');
        selColegio.innerHTML = '<option value="">-- Selecione sua escola/setor --</option>';
        (colegios || []).forEach(c => {
            selColegio.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
        });

        // 2. Carregar Perguntas do Construtor
        const { data: perguntas, error: errPerg } = await supabase.from('perguntas_formulario')
            .select('*')
            .eq('pesquisa_id', pesquisaId)
            .order('ordem', { ascending: true });

        const contPerguntas = document.getElementById('perguntas-dinamicas-container');
        contPerguntas.innerHTML = '';

        if (!perguntas || perguntas.length === 0) {
            contPerguntas.innerHTML = '<p class="text-amber-500 italic p-4 bg-slate-900 rounded-xl border border-slate-700">Nenhuma pergunta configurada no sistema.</p>';
            return;
        }

        // 3. Renderizar Inputs Baseado no Tipo SQL
        perguntas.forEach(p => {
            const wrapper = document.createElement('div');
            wrapper.className = 'bg-slate-900/30 p-5 rounded-xl border border-slate-700';

            const label = document.createElement('label');
            label.className = 'block text-sm font-bold text-slate-300 mb-3';
            label.innerText = p.label_texto;
            wrapper.appendChild(label);

            let inputElement;

            if (p.tipo_sql === 'INT') {
                inputElement = `<input type="number" name="${p.campo_chave}" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">`;
            } 
            else if (p.tipo_sql === 'TEXT') {
                inputElement = `<textarea name="${p.campo_chave}" required rows="3" class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500 custom-scroll"></textarea>`;
            } 
            else {
                // VARCHAR / BOOLEAN (Selects)
                let optionsHtml = '<option value="">Selecione...</option>';
                const listaOpcoes = p.opcoes ? p.opcoes.split(',').map(o => o.trim()) : [];
                
                listaOpcoes.forEach(opText => {
                    // Lógica legada do seu app.js para booleanos
                    let valor = opText;
                    if (p.campo_chave === 'foi_vitima' || p.campo_chave === 'sabe_pedir_ajuda') {
                        valor = opText.toLowerCase() === 'sim' ? 'true' : 'false';
                    }
                    optionsHtml += `<option value="${valor}">${opText}</option>`;
                });
                
                inputElement = `<select name="${p.campo_chave}" required class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500">${optionsHtml}</select>`;
            }

            wrapper.innerHTML += inputElement;
            contPerguntas.appendChild(wrapper);
        });

        // 4. Configurar o Submit do Formulário
        document.getElementById('pesquisa-publica-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('btn-enviar-pesquisa');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';

            const formData = new FormData(this);
            const dadosBrutos = Object.fromEntries(formData.entries());

            // Pega o ID e Nome do colégio
            const seletor = document.getElementById('form-colegio');
            const col_id = parseInt(seletor.value);
            const col_nome = seletor.options[seletor.selectedIndex].text;
            
            // Remove dados do colegio dos dados brutos para colocar no JSON, se quiser
            delete dadosBrutos['colegio_id'];

            // Formatação (Legado)
            if (dadosBrutos.idade) dadosBrutos.idade = parseInt(dadosBrutos.idade);
            if (dadosBrutos.foi_vitima) dadosBrutos.foi_vitima = dadosBrutos.foi_vitima === 'true';
            if (dadosBrutos.sabe_pedir_ajuda) dadosBrutos.sabe_pedir_ajuda = dadosBrutos.sabe_pedir_ajuda === 'true';

            // DADOS PARA INSERIR
            // Se for a tabela antiga, ele tenta jogar tudo na raiz (pode dar erro se a coluna não existir).
            // Se for uma tabela NOVA criada pela nossa função SQL, ele insere no JSONB.
            let dadosInsert = {
                colegio_id: col_id,
                colegio_nome: col_nome,
                respostas_json: dadosBrutos // Envia tudo dinâmico para a coluna JSONB!
            };

            // Hack de compatibilidade retroativa com a tabela 'respostas_pesquisa' original sua
            if (tabelaAlvo === 'respostas_pesquisa') {
                dadosInsert = { colegio_id: col_id, colegio_nome: col_nome, ...dadosBrutos };
                delete dadosInsert.respostas_json;
            }

            try {
                const { error } = await supabase.from(tabelaAlvo).insert([dadosInsert]);
                if (error) throw error;
                
                alert("✅ Resposta enviada com sucesso! Muito obrigado pela participação.");
                voltarParaLista(); 
            } catch (error) {
                console.error("Erro ao salvar resposta:", error);
                alert("❌ Erro ao enviar a resposta. Tente novamente.");
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Enviar Resposta Anônima';
            }
        });

    } catch (err) {
        console.error("Erro ao carregar o formulário:", err);
    }
}


// =========================================================
// MÓDULO DO CONSTRUTOR DE PERGUNTAS (SCHEMA SQL)
// =========================================================
window.carregarEditorPerguntas = async function(pesquisaId) {
    const container = document.getElementById('lista-perguntas-container');
    if (!container) return;

    if (!pesquisaId) {
        container.innerHTML = '<p class="text-amber-500 italic p-4 bg-slate-900 rounded-xl border border-slate-700">Clique em "Editar" em uma pesquisa na tabela para carregar as perguntas vinculadas a ela.</p>';
        return;
    }

    // Filtra no Supabase apenas as perguntas da pesquisa selecionada
    const { data: perguntas, error } = await supabase.from('perguntas_formulario')
        .select('*')
        .eq('pesquisa_id', pesquisaId)
        .order('ordem', { ascending: true });
    
    if (error) {
        container.innerHTML = '<p class="text-red-400">Erro ao carregar estrutura do formulário.</p>';
        return;
    }

    container.innerHTML = '';
    
    if (!perguntas || perguntas.length === 0) {
        container.innerHTML = '<p class="text-slate-400 italic">Nenhuma pergunta cadastrada para esta pesquisa ainda.</p>';
        return;
    }

    (perguntas || []).forEach(p => {
        const btnExcluir = window.canDeletePesquisa ? `<button onclick="window.excluirPergunta('${p.campo_chave}', ${pesquisaId})" class="text-red-400 hover:text-red-300 ml-auto"><i class="fas fa-trash"></i></button>` : '';
        
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
    
    const pesquisaId = document.getElementById('perg-pesquisa-id').value;
    
    if (!pesquisaId) {
        alert("Por favor, clique em 'Editar' em uma pesquisa na tabela acima antes de adicionar perguntas!");
        return;
    }

    // Objeto limpo, enviando apenas colunas que existem no Supabase
    const novaPergunta = {
        label_texto: document.getElementById('perg-enunciado').value,
        campo_chave: document.getElementById('perg-chave').value,
        tipo_sql: document.getElementById('perg-tipo').value,
        tamanho_max: parseInt(document.getElementById('perg-tamanho').value),
        opcoes: document.getElementById('perg-opcoes').value,
        ordem: 99, 
        colegio_id: 1,
        pesquisa_id: parseInt(pesquisaId) // Vincula a pergunta à pesquisa editada
    }; 

    const { error } = await supabase.from('perguntas_formulario').insert([novaPergunta]);
    if (error) {
        console.error("Erro ao inserir pergunta:", error);
        alert("Erro ao inserir pergunta no Schema do Supabase.");
    } else {
        alert("Nova pergunta adicionada com sucesso!");
        document.getElementById('form-pergunta-crud').reset();
        window.carregarEditorPerguntas(pesquisaId); // Atualiza a lista na tela imediatamente
    }
}

window.excluirPergunta = async function(campoChave, pesquisaId) {
    if (!window.canDeletePesquisa) {
        alert("Acesso Negado: Você não tem permissão para excluir.");
        return;
    }
    
    if (confirm(`Deseja apagar a pergunta '${campoChave}' do banco de dados?`)) {
        // Exclui usando o campo_chave E o pesquisa_id para garantir que não apague de outra pesquisa acidentalmente se houver chaves iguais
        const { error } = await supabase.from('perguntas_formulario')
            .delete()
            .eq('campo_chave', campoChave)
            .eq('pesquisa_id', pesquisaId);
            
        if (error) {
            console.error("Erro ao excluir pergunta:", error);
            alert("Erro ao excluir a pergunta.");
        } else {
            window.carregarEditorPerguntas(pesquisaId); // Atualiza a lista segmentada
        }
    }
}