// Importa o cliente do Supabase via CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Credenciais extraídas do projeto TecnicoTancredo
const SUPABASE_URL = 'https://dmwbvydkogpnhmprezew.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd2J2eWRrb2dwbmhtcHJlemV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODE4NDksImV4cCI6MjEwMjU1Nzg0OX0.bi15oVkl8n8veVCkKjryKtuPSzrPjKblJ9AMERymhFY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    container.innerHTML = `
        <div class="h-full flex flex-col max-w-7xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h2 class="text-2xl md:text-3xl font-cinzel font-black text-white tracking-widest uppercase">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i> Pesquisas Tech
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Participe das pesquisas em andamento ou analise os relatórios das finalizadas.</p>
                </div>
                
                <button id="btn-voltar-pesquisas" class="hidden px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-slate-700 shadow-lg">
                    <i class="fas fa-arrow-left"></i> Voltar para Lista
                </button>
            </div>

            <div id="pesquisas-main-area" class="flex-grow fade-in relative">
                <div id="loading-pesquisas" class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10">
                    <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-indigo-500"></i>
                    <p class="font-cinzel tracking-widest uppercase text-sm">Conectando ao Supabase...</p>
                </div>

                <div id="lista-pesquisas" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 hidden"></div>
                <div id="dashboard-pesquisa" class="hidden flex-col gap-6"></div>
            </div>
        </div>
    `;

    await carregarListaPesquisasDB();
    document.getElementById('btn-voltar-pesquisas').addEventListener('click', voltarParaLista);
}

// =========================================================
// RENDERIZAÇÃO DA LISTA DE PESQUISAS (SUPABASE)
// =========================================================
async function carregarListaPesquisasDB() {
    const listaContainer = document.getElementById('lista-pesquisas');
    const loading = document.getElementById('loading-pesquisas');

    try {
        const { data: pesquisas, error } = await supabase
            .from('pesquisas_lista')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        listaContainer.innerHTML = ''; 

        if (!pesquisas || pesquisas.length === 0) {
            listaContainer.innerHTML = '<p class="text-slate-400 italic">Nenhuma pesquisa encontrada.</p>';
        } else {
            pesquisas.forEach(pesquisa => {
                const isFechada = pesquisa.status === 'Fechada';
                const badgeCor = isFechada ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                const iconeBtn = isFechada ? 'fa-chart-bar' : 'fa-edit';
                const txtBtn = isFechada ? 'Ver Resultados' : 'Responder Pesquisa';
                const corBtn = isFechada ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500';

                const cardHTML = `
                    <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col transition-transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-4">
                            <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span>
                            <span class="text-xs text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${pesquisa.data_referencia}</span>
                        </div>
                        <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${pesquisa.titulo}</h3>
                        <p class="text-sm text-slate-400 mb-6 flex-grow leading-relaxed">${pesquisa.descricao}</p>
                        <button onclick="window.abrirAcaoPesquisa('${pesquisa.tabela_respostas_alvo}', '${pesquisa.status}', '${pesquisa.titulo}')" 
                            class="${corBtn} w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                            <i class="fas ${iconeBtn}"></i> ${txtBtn}
                        </button>
                    </div>
                `;
                listaContainer.innerHTML += cardHTML;
            });
        }
    } catch (err) {
        console.error("Erro ao buscar pesquisas:", err);
        listaContainer.innerHTML = '<p class="text-red-400">Erro ao carregar as pesquisas.</p>';
    }

    loading.classList.add('hidden');
    listaContainer.classList.remove('hidden');
    listaContainer.classList.add('fade-in');
}

// =========================================================
// CONTROLES E DASHBOARD ANALÍTICO
// =========================================================
window.abrirAcaoPesquisa = function(tabelaAlvo, status, titulo) {
    if (status === 'Aberta') {
        // Redireciona para o index público de formulário do projeto antigo
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
        <div class="fade-in space-y-6">
            <h3 class="text-2xl font-cinzel font-bold text-indigo-400 border-l-4 border-indigo-500 pl-4 mb-6">Dashboard Analítico: ${titulo}</h3>
            
            <div id="dash-loading" class="text-center py-10 text-slate-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>

            <div id="dash-content" class="hidden">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div class="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Volume de Respostas por Idade</h4>
                        <div class="relative h-64 w-full"><canvas id="chart-pesquisa-barras"></canvas></div>
                    </div>
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-center text-center">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Respostas</h4>
                        <div class="text-5xl font-black text-white mb-2" id="dash-total-interacoes">0</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Principais Motivos Relatados</h4>
                        <div class="relative h-64 w-full flex justify-center"><canvas id="chart-pesquisa-pizza"></canvas></div>
                    </div>
                    <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center">
                        <div class="text-center">
                            <i class="fas fa-brain text-5xl text-indigo-500 mb-4 opacity-50"></i>
                            <h4 class="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Análise de Sentimento</h4>
                            <p class="text-xs text-slate-500">Integração futura com IA Gemini baseada nos textos.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        // Busca os dados reais da tabela alvo (ex: respostas_pesquisa)
        const { data: respostas, error } = await supabase.from(tabelaAlvo).select('idade, motivo_frequente');
        
        if (error) throw error;

        document.getElementById('dash-loading').classList.add('hidden');
        document.getElementById('dash-content').classList.remove('hidden');
        document.getElementById('dash-total-interacoes').innerText = respostas.length;

        // Processa dados para os gráficos
        const contagemIdade = {};
        const contagemMotivo = {};

        respostas.forEach(r => {
            if (r.idade) contagemIdade[r.idade] = (contagemIdade[r.idade] || 0) + 1;
            const motivo = r.motivo_frequente || 'Não Informado';
            contagemMotivo[motivo] = (contagemMotivo[motivo] || 0) + 1;
        });

        renderizarGraficos(contagemIdade, contagemMotivo);

    } catch (err) {
        console.error("Erro ao puxar dados da pesquisa:", err);
        document.getElementById('dash-loading').innerHTML = '<p class="text-red-400">Erro ao processar dados analíticos.</p>';
    }
}

function renderizarGraficos(dadosIdade, dadosMotivo) {
    Chart.defaults.color = '#94a3b8'; 
    Chart.defaults.font.family = 'Inter, sans-serif';

    // Gráfico de Barras (Idades)
    const idadesLabels = Object.keys(dadosIdade).sort((a, b) => parseInt(a) - parseInt(b));
    const idadesValores = idadesLabels.map(i => dadosIdade[i]);

    const ctxBar = document.getElementById('chart-pesquisa-barras').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: idadesLabels.map(i => `${i} Anos`),
            datasets: [{
                label: 'Respondentes',
                data: idadesValores,
                backgroundColor: '#6366f1', borderRadius: 4, barPercentage: 0.6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Gráfico de Pizza (Motivos)
    const motivosLabels = Object.keys(dadosMotivo);
    const motivosValores = motivosLabels.map(m => dadosMotivo[m]);

    const ctxPie = document.getElementById('chart-pesquisa-pizza').getContext('2d');
    new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: motivosLabels,
            datasets: [{
                data: motivosValores,
                backgroundColor: ['#3b82f6', '#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
                borderWidth: 2, borderColor: '#1e293b'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%',
            plugins: { legend: { position: 'left' } } 
        }
    });
}