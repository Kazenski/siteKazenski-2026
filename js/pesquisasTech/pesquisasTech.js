import { db } from '../core/firebase.js'; 
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Função principal chamada pelo main.js ao clicar no menu
export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    // Estrutura inicial da página: Header e Container Principal (Lista e Dashboard)
    container.innerHTML = `
        <div class="h-full flex flex-col max-w-7xl mx-auto">
            <!-- Header da Página -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-800 pb-4 shrink-0">
                <div>
                    <h2 class="text-2xl md:text-3xl font-cinzel font-black text-white tracking-widest uppercase">
                        <i class="fas fa-chart-pie text-indigo-500 mr-2"></i> Pesquisas Tech
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Participe das pesquisas em andamento ou analise os relatórios das finalizadas.</p>
                </div>
                
                <!-- Botão de Voltar do Dashboard (Inicia oculto) -->
                <button id="btn-voltar-pesquisas" class="hidden px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-slate-700 shadow-lg">
                    <i class="fas fa-arrow-left"></i> Voltar para Lista
                </button>
            </div>

            <!-- Área Dinâmica: Aqui entra a Lista ou o Dashboard -->
            <div id="pesquisas-main-area" class="flex-grow fade-in relative">
                <!-- Estado de Carregamento -->
                <div id="loading-pesquisas" class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10">
                    <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-indigo-500"></i>
                    <p class="font-cinzel tracking-widest uppercase text-sm">Buscando dados no servidor...</p>
                </div>

                <!-- Grid de Pesquisas -->
                <div id="lista-pesquisas" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 hidden"></div>

                <!-- Área do Dashboard (Inicia Oculta) -->
                <div id="dashboard-pesquisa" class="hidden flex-col gap-6"></div>
            </div>
        </div>
    `;

    // Carrega a listagem do Firestore
    await carregarListaPesquisas();

    // Configura evento de voltar
    document.getElementById('btn-voltar-pesquisas').addEventListener('click', voltarParaLista);
}

// =========================================================
// RENDERIZAÇÃO DA LISTA DE PESQUISAS
// =========================================================
async function carregarListaPesquisas() {
    const listaContainer = document.getElementById('lista-pesquisas');
    const loading = document.getElementById('loading-pesquisas');

    // MOCK DE DADOS (Substituir pela chamada real do Firestore quando a coleção existir)
    // Para implementar com Firebase real: const snap = await getDocs(collection(db, "pesquisas"));
    const mockPesquisas = [
        { id: '1', titulo: 'E-commerce Insights 2026', descricao: 'Pesquisa de maturidade sobre tendências de consumo digital e plataformas de e-commerce.', status: 'Fechada', data: 'Q1 2026' },
        { id: '2', titulo: 'Uso de IA no Ensino Técnico', descricao: 'Levantamento com alunos sobre a percepção de IAs gerativas em atividades de sala de aula.', status: 'Aberta', data: 'Outubro 2026' },
        { id: '3', titulo: 'Pesquisa Cyberbullying 2026', descricao: 'Mapeamento do comportamento digital e segurança na internet focado na rede escolar.', status: 'Fechada', data: 'Março 2026' }
    ];

    listaContainer.innerHTML = ''; // Limpa container

    mockPesquisas.forEach(pesquisa => {
        const isFechada = pesquisa.status === 'Fechada';
        const badgeCor = isFechada ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        const iconeBtn = isFechada ? 'fa-chart-bar' : 'fa-edit';
        const txtBtn = isFechada ? 'Ver Resultados' : 'Responder Pesquisa';
        const corBtn = isFechada ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500';

        const cardHTML = `
            <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col transition-transform hover:-translate-y-1">
                <div class="flex justify-between items-start mb-4">
                    <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span>
                    <span class="text-xs text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${pesquisa.data}</span>
                </div>
                <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${pesquisa.titulo}</h3>
                <p class="text-sm text-slate-400 mb-6 flex-grow leading-relaxed">${pesquisa.descricao}</p>
                <button onclick="window.abrirAcaoPesquisa('${pesquisa.id}', '${pesquisa.status}', '${pesquisa.titulo}')" 
                    class="${corBtn} w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                    <i class="fas ${iconeBtn}"></i> ${txtBtn}
                </button>
            </div>
        `;
        listaContainer.innerHTML += cardHTML;
    });

    // Transição de telas
    loading.classList.add('hidden');
    listaContainer.classList.remove('hidden');
    listaContainer.classList.add('fade-in');
}

// =========================================================
// CONTROLE DE AÇÃO (RESPONDER OU VER DASHBOARD)
// =========================================================
// Expondo a função no window pois está sendo chamada pelo HTML inline gerado no mock
window.abrirAcaoPesquisa = function(id, status, titulo) {
    if (status === 'Aberta') {
        alert(`Abrindo formulário de resposta para: ${titulo}\n(Aqui você pode chamar o seu componente de formulário)`);
        // Aqui você chamará a função de abrir o formulário
    } else {
        abrirDashboardPesquisa(id, titulo);
    }
};

function voltarParaLista() {
    document.getElementById('dashboard-pesquisa').classList.add('hidden');
    document.getElementById('dashboard-pesquisa').innerHTML = ''; // Limpa os gráficos para não duplicar
    document.getElementById('btn-voltar-pesquisas').classList.add('hidden');
    document.getElementById('lista-pesquisas').classList.remove('hidden');
}

// =========================================================
// RENDERIZAÇÃO DO DASHBOARD (CHART.JS)
// =========================================================
function abrirDashboardPesquisa(id, titulo) {
    const dashContainer = document.getElementById('dashboard-pesquisa');
    
    // Esconde a lista e mostra o topo do dashboard
    document.getElementById('lista-pesquisas').classList.add('hidden');
    document.getElementById('btn-voltar-pesquisas').classList.remove('hidden');
    dashContainer.classList.remove('hidden');

    // Constrói a estrutura HTML que reflete a imagem solicitada
    dashContainer.innerHTML = `
        <div class="fade-in space-y-6">
            <h3 class="text-2xl font-cinzel font-bold text-indigo-400 border-l-4 border-indigo-500 pl-4 mb-6">Dashboard Analítico: ${titulo}</h3>
            
            <!-- Linha 1: KPIs e Gráfico de Barras -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Gráfico Principal (Esquerda) -->
                <div class="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Volume de Respostas (Q1 2024 - Q1 2026)</h4>
                    <div class="relative h-64 w-full">
                        <canvas id="chart-pesquisa-barras"></canvas>
                    </div>
                </div>

                <!-- Painel de Destaque (Direita) -->
                <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-center text-center">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Interações</h4>
                    <div class="text-5xl font-black text-white mb-2">145.337</div>
                    <div class="text-sm font-bold text-emerald-400 bg-emerald-500/10 py-1.5 px-4 rounded-lg inline-block self-center mx-auto mb-6">
                        <i class="fas fa-arrow-up mr-1"></i> 2.39% vs. Semestre anterior
                    </div>
                    
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Meta da Pesquisa</h4>
                    <div class="w-full bg-slate-900 rounded-full h-4 mb-1 border border-slate-700">
                        <div class="bg-emerald-500 h-4 rounded-full" style="width: 75%"></div>
                    </div>
                    <div class="text-right text-[10px] text-slate-500 font-bold uppercase">75% da meta</div>
                </div>
            </div>

            <!-- Linha 2: Aprofundamento e Gráfico de Pizza -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Categorias Mais Votadas</h4>
                    <div class="relative h-64 w-full flex justify-center">
                        <canvas id="chart-pesquisa-pizza"></canvas>
                    </div>
                </div>
                
                <!-- Aqui você pode adicionar outro gráfico ou tabela de análise de sentimentos futuramente -->
                <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center">
                    <div class="text-center">
                        <i class="fas fa-brain text-5xl text-indigo-500 mb-4 opacity-50"></i>
                        <h4 class="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Análise de Sentimento (IA)</h4>
                        <p class="text-xs text-slate-500">Módulo de IA do Gemini será integrado aqui no futuro.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Aguarda o HTML renderizar para instanciar os gráficos via Chart.js
    setTimeout(() => {
        renderizarGraficos();
    }, 100);
}

function renderizarGraficos() {
    // Configurações globais do Chart.js para combinar com seu Tema Dark Escolar
    Chart.defaults.color = '#94a3b8'; // text-slate-400
    Chart.defaults.font.family = 'Inter, sans-serif';

    // 1. Gráfico de Barras (Referência: "Revenue and orders over time")
    const ctxBar = document.getElementById('chart-pesquisa-barras').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Q1 2024', 'Q3 2024', 'Q1 2025', 'Q3 2025', 'Q1 2026'],
            datasets: [{
                label: 'Respostas Recebidas',
                data: [30, 110, 145, 100, 45],
                backgroundColor: '#6366f1', // indigo-500
                borderRadius: 4,
                barPercentage: 0.6
            }, {
                label: 'Tendência (Linha)',
                data: [100, 130, 150, 140, 145],
                type: 'line',
                borderColor: '#10b981', // emerald-500
                backgroundColor: '#10b981',
                borderWidth: 2,
                tension: 0.4, // Suaviza a curva da linha
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 8 } }
            },
            scales: {
                y: { grid: { color: '#334155' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });

    // 2. Gráfico de Pizza (Referência: "Total orders by product category")
    const ctxPie = document.getElementById('chart-pesquisa-pizza').getContext('2d');
    new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Tecnologia', 'Metodologia', 'Infraestrutura', 'Didática'],
            datasets: [{
                data: [27, 26, 26, 21],
                backgroundColor: [
                    '#3b82f6', // blue-500
                    '#6366f1', // indigo-500
                    '#a855f7', // purple-500
                    '#94a3b8'  // slate-400
                ],
                borderWidth: 2,
                borderColor: '#1e293b' // Cor de fundo do card para criar espaçamento
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%', // Espessura do anel
            plugins: {
                legend: { position: 'left', labels: { usePointStyle: true, padding: 20 } }
            }
        }
    });
}