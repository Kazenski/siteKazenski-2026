import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { db } from '../core/firebase.js';
import {
    collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { aprovar } from '../core/moderacao.js';
import { seedPesquisasTecnologicas } from './seedPesquisas.js';

// Supabase é mantido APENAS para a migração única dos dados antigos.
const SUPABASE_URL = 'https://dmwbvydkogpnhmprezew.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd2J2eWRrb2dwbmhtcHJlemV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODE4NDksImV4cCI6MjEwMjU1Nzg0OX0.bi15oVkl8n8veVCkKjryKtuPSzrPjKblJ9AMERymhFY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================
// MODELO FIRESTORE
//   colegios/{id}                       -> { nome, ... }
//   pesquisas/{id}                      -> { titulo, descricao, status, data_referencia, tabela_respostas_alvo, criadoEm }
//   pesquisas/{id}/perguntas/{qid}      -> { label_texto, campo_chave, tipo_sql, tamanho_max, opcoes, ordem }
//   pesquisas/{id}/respostas/{rid}      -> { colegio_id, colegio_nome, respostas: {chave: valor}, criadoEm }
// =========================================================
const COL_PESQUISAS = 'pesquisas';
const COL_COLEGIOS = 'colegios';

// Variáveis globais
window.pesquisaRespostasAtuais = [];   // respostas "achatadas" (flat) da pesquisa aberta
window.pesquisaPerguntasAtuais = [];   // perguntas da pesquisa aberta
window.chartInstances = {};            // instâncias Chart.js ativas no dashboard
window._pesquisasCache = [];           // cache da lista para uso em onclick

// Expor funções no window
window.abrirDashboardPesquisa = abrirDashboardPesquisa;
window.renderizarFormularioPesquisa = renderizarFormularioPesquisa;

// =========================================================
// RENDERIZAÇÃO PRINCIPAL DA ABA
// =========================================================
export async function renderPesquisasTechTab() {
    const container = document.getElementById('pesquisas-tech-content');
    if (!container) return;

    const isGestor = window.userRoles?.Admin || window.userRoles?.Moderador;
    const canDelete = window.userRoles?.Admin;

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
                    <p class="font-cinzel tracking-widest uppercase text-sm">Conectando ao Firebase...</p>
                </div>

                <div id="lista-pesquisas" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 hidden"></div>
                <div id="dashboard-pesquisa" class="hidden flex-col gap-8 w-full"></div>
                <div id="form-responder-pesquisa" class="hidden flex-col gap-6 w-full max-w-3xl mx-auto fade-in"></div>

                ${isGestor ? `
                <div id="crud-pesquisas" class="hidden flex-col gap-6 fade-in">

                    <!-- INSTITUIÇÕES / SELETOR DE COLÉGIO -->
                    <div class="bg-slate-800 p-8 rounded-2xl border-l-4 border-teal-500 shadow-xl shrink-0 mt-4">
                        <h3 class="text-teal-400 font-cinzel font-bold text-xl mb-2"><i class="fas fa-school mr-2"></i> Instituições (Opções do Seletor)</h3>
                        <p class="text-slate-400 text-xs mb-5">Aqui você cadastra as opções que aparecem no seletor de instituição das respostas. Vale para todas as pesquisas.</p>
                        <form id="form-colegio-crud" class="flex flex-col md:flex-row gap-3 mb-6">
                            <input type="text" id="novo-colegio-nome" required placeholder="Nome da instituição (ex: Colégio Kazenski Matriz)" class="flex-grow bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-teal-500 outline-none">
                            <button type="submit" class="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg">Adicionar</button>
                        </form>
                        <div id="lista-colegios-crud" class="space-y-3 max-h-64 overflow-y-auto custom-scroll pr-2"></div>
                    </div>

                    <!-- IMPORTAR CATÁLOGO OFICIAL (criado apenas via IA/local) -->
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-sky-500 shadow-xl shrink-0">
                        <h3 class="text-sky-400 font-cinzel font-bold text-xl mb-2"><i class="fas fa-layer-group mr-2"></i> Catálogo Oficial de Pesquisas</h3>
                        <p class="text-slate-400 text-xs mb-4">Novas pesquisas são cadastradas apenas pelo gestor via assistente (IA). Este botão (re)importa o catálogo oficial tech no Firestore, de forma idempotente — não apaga respostas de pesquisas clonadas.</p>
                        <button id="btn-importar-catalogo" class="px-6 py-2.5 bg-sky-600/20 text-sky-300 border border-sky-500/40 hover:bg-sky-600 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">
                            <i class="fas fa-cloud-download-alt mr-2"></i> Importar / Atualizar Catálogo
                        </button>
                        <pre id="log-importacao" class="hidden mt-4 bg-slate-950 text-emerald-400 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap"></pre>
                    </div>

                    <!-- EDITAR PESQUISA -->
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-amber-500 shadow-xl shrink-0">
                        <h3 class="text-amber-400 font-cinzel font-bold text-xl mb-4" id="form-crud-title">
                            <i class="fas fa-edit mr-2"></i> Editar Pesquisa
                        </h3>
                        <form id="form-pesquisa-crud" class="space-y-4">
                            <input type="hidden" id="crud-id" required>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Título da Pesquisa</label>
                                    <input type="text" id="crud-titulo" required class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-amber-500 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Período / Referência</label>
                                    <input type="text" id="crud-data" required placeholder="Ex: Q1 2026 ou Março 2026" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-amber-500 outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                                <select id="crud-status" class="w-full md:w-1/2 bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-amber-500 outline-none">
                                    <option value="Aberta">Aberta (Coletando)</option>
                                    <option value="Fechada">Fechada (Apenas Dashboard)</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição</label>
                                <textarea id="crud-descricao" required rows="2" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-amber-500 outline-none custom-scroll"></textarea>
                            </div>
                            <div class="flex justify-end gap-3 pt-2 border-t border-slate-700">
                                <button type="button" onclick="limparFormPesquisa()" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">Limpar</button>
                                <button type="submit" class="px-8 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>

                    <div class="flex-grow overflow-y-auto custom-scroll rounded-2xl border border-slate-700 bg-slate-900/50 shadow-xl relative min-h-[300px]">
                        <table class="w-full text-sm text-left border-collapse">
                            <thead class="bg-slate-800 text-slate-400 uppercase text-[10px] tracking-widest sticky top-0">
                                <tr>
                                    <th class="p-4">Título</th>
                                    <th class="p-4 text-center">Status</th>
                                    <th class="p-4 text-center">Firestore</th>
                                    <th class="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="crud-table-body" class="divide-y divide-slate-800"></tbody>
                        </table>
                    </div>

                    <!-- MIGRAÇÃO -->
                    <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-amber-500 shadow-xl">
                        <h3 class="text-amber-400 font-cinzel font-bold text-xl mb-2"><i class="fas fa-file-export mr-2"></i> Migração Supabase → Firebase</h3>
                        <p class="text-slate-400 text-xs mb-4">Importa pesquisas, perguntas, colégios e respostas antigas do Supabase para as coleções do Firebase. Pode ser executado mais de uma vez: usa IDs determinísticos e não duplica documentos já migrados.</p>
                        <button id="btn-migrar-supabase" class="px-6 py-2.5 bg-amber-600/20 text-amber-400 border border-amber-500/40 hover:bg-amber-600 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">
                            <i class="fas fa-cloud-upload-alt mr-2"></i> Migrar dados antigos agora
                        </button>
                        <pre id="log-migracao" class="hidden mt-4 bg-slate-950 text-emerald-400 text-xs p-4 rounded-xl overflow-x-auto max-h-64 custom-scroll whitespace-pre-wrap"></pre>
                    </div>

                </div>` : ''}
            </div>
        </div>
    `;

    await carregarListaPesquisasDB();
    document.getElementById('btn-voltar-pesquisas').addEventListener('click', voltarParaLista);

    if (isGestor) {
        document.getElementById('btn-toggle-crud').addEventListener('click', toggleCrudMode);
        document.getElementById('form-pesquisa-crud').addEventListener('submit', salvarPesquisaFirebase);
        window.canDeletePesquisa = canDelete;
        document.getElementById('btn-migrar-supabase').addEventListener('click', executarMigracao);
        document.getElementById('form-colegio-crud').addEventListener('submit', salvarColegioCrud);
        carregarListaColegiosCrud();
        document.getElementById('btn-importar-catalogo').addEventListener('click', async () => {
            const log = document.getElementById('log-importacao');
            log.classList.remove('hidden');
            log.textContent = 'Importando catálogo oficial...\n';
            try {
                const r = await seedPesquisasTecnologicas();
                log.textContent += `✅ Catálogo pronto: ${r.criadas} criadas, ${r.atualizadas} atualizadas.\n`;
                await carregarListaPesquisasDB();
            } catch (e) {
                console.error(e);
                log.textContent += `❌ Erro: ${e.message}\n`;
            }
        });
    }
}

// =========================================================
// LISTA DE PESQUISAS
// =========================================================
async function carregarListaPesquisasDB() {
    const listaContainer = document.getElementById('lista-pesquisas');
    const loading = document.getElementById('loading-pesquisas');
    const tbodyCrud = document.getElementById('crud-table-body');

    try {
        const snap = await getDocs(query(collection(db, COL_PESQUISAS), orderBy('criadoEm', 'asc')));
        const pesquisas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._pesquisasCache = pesquisas;

        listaContainer.innerHTML = '';
        if (tbodyCrud) tbodyCrud.innerHTML = '';

        if (pesquisas.length === 0) {
            listaContainer.innerHTML = '<p class="text-slate-400 italic">Nenhuma pesquisa encontrada.</p>';
        } else {
            pesquisas.forEach(pesquisa => {
                const isFechada = pesquisa.status === 'Fechada';
                const badgeCor = isFechada ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                const isGestor = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;

                let botoesAcaoHtml = '';
                const podeVerDashboard = isGestor;
                if (isFechada) {
                    botoesAcaoHtml = podeVerDashboard
                        ? `<button onclick="window.abrirDashboardPesquisa('${pesquisa.id}')"
                            class="bg-indigo-600 hover:bg-indigo-500 w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                            <i class="fas fa-chart-bar"></i> Ver Resultados Dashboard
                        </button>`
                        : `<p class="text-center text-slate-500 text-xs uppercase tracking-widest py-2 border border-slate-700 rounded-xl"><i class="fas fa-lock mr-2"></i> Pesquisa encerrada</p>`;
                } else {
                    botoesAcaoHtml = `<button onclick="window.renderizarFormularioPesquisa('${pesquisa.id}')"
                        class="bg-emerald-600 hover:bg-emerald-500 w-full text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center gap-2 mb-2">
                        <i class="fas fa-edit"></i> Responder Pesquisa
                    </button>`;
                    if (isGestor) {
                        botoesAcaoHtml += `<button onclick="window.abrirDashboardPesquisa('${pesquisa.id}')"
                            class="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white w-full font-bold text-[10px] uppercase tracking-widest py-2 rounded-xl transition-all flex justify-center items-center gap-2">
                            <i class="fas fa-chart-line"></i> Acessar Dashboard (Admin)
                        </button>`;
                    }
                }

                listaContainer.innerHTML += `
                    <div class="bg-slate-800/80 p-6 rounded-2xl border ${isFechada ? 'border-slate-700' : 'border-emerald-500/50'} shadow-xl flex flex-col transition-transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-4">
                            <span class="${badgeCor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span>
                            <span class="text-xs text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${pesquisa.data_referencia || ''}</span>
                        </div>
                        <h3 class="text-xl font-cinzel font-bold text-white mb-2 leading-tight">${pesquisa.titulo}</h3>
                        <p class="text-sm text-slate-400 mb-6 flex-grow leading-relaxed">${pesquisa.descricao}</p>
                        <div class="flex flex-col w-full mt-auto">${botoesAcaoHtml}</div>
                    </div>`;

                if (tbodyCrud) {
                    const podeDeletar = window.userRoles?.Admin;
                    const btnExcluir = podeDeletar
                        ? `<button onclick="window.excluirPesquisa('${pesquisa.id}')" title="Excluir" class="text-red-400 hover:text-red-300 bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>`
                        : '';
                    tbodyCrud.innerHTML += `
                        <tr class="hover:bg-slate-800/50 transition-colors">
                            <td class="p-4 text-white font-bold">${pesquisa.titulo}</td>
                            <td class="p-4 text-center"><span class="${badgeCor} px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">${pesquisa.status}</span></td>
                            <td class="p-4 text-center text-slate-500 font-mono text-[10px]">pesquisas/${pesquisa.id}</td>
                            <td class="p-4 text-right flex justify-end gap-2">
                                <button onclick="window.alternarStatusPesquisa('${pesquisa.id}')" title="Habilitar/Pausar" class="text-amber-400 hover:text-amber-300 bg-amber-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas ${pesquisa.status === 'Aberta' ? 'fa-pause' : 'fa-play'}"></i></button>
                                <button onclick="window.duplicarPesquisa('${pesquisa.id}')" title="Duplicar/Clonar Pesquisa" class="text-emerald-400 hover:text-emerald-300 bg-emerald-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-copy"></i></button>
                                <button onclick="window.editarPesquisa('${pesquisa.id}')" title="Editar" class="text-indigo-400 hover:text-indigo-300 bg-indigo-400/10 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-edit"></i></button>
                                ${btnExcluir}
                            </td>
                        </tr>`;
                }
            });
        }
    } catch (err) {
        console.error("Erro ao buscar pesquisas:", err);
        listaContainer.innerHTML = '<p class="text-red-400">Erro ao carregar pesquisas do Firebase.</p>';
    }

    loading.classList.add('hidden');
    listaContainer.classList.remove('hidden');
}

// =========================================================
// CRUD PESQUISAS (FIRESTORE)
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

window.limparFormPesquisa = function () {
    document.getElementById('form-pesquisa-crud').reset();
    document.getElementById('crud-id').value = '';
    document.getElementById('form-crud-title').innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Pesquisa';
};

window.editarPesquisa = function (id) {
    const pesquisa = window._pesquisasCache.find(p => p.id === id);
    if (!pesquisa) return;
    document.getElementById('crud-id').value = pesquisa.id;
    document.getElementById('crud-titulo').value = pesquisa.titulo;
    document.getElementById('crud-data').value = pesquisa.data_referencia || '';
    document.getElementById('crud-status').value = pesquisa.status;
    document.getElementById('crud-descricao').value = pesquisa.descricao;

    document.getElementById('form-crud-title').innerHTML = '<i class="fas fa-edit mr-2 text-amber-500"></i> Editando Pesquisa';
    document.getElementById('crud-pesquisas').scrollIntoView({ behavior: 'smooth' });
};

async function salvarPesquisaFirebase(e) {
    e.preventDefault();
    const id = document.getElementById('crud-id').value;

    const dados = {
        titulo: document.getElementById('crud-titulo').value,
        data_referencia: document.getElementById('crud-data').value,
        status: document.getElementById('crud-status').value,
        descricao: document.getElementById('crud-descricao').value
    };

    try {
        if (id) {
            await updateDoc(doc(db, COL_PESQUISAS, id), dados);
            alert("Pesquisa atualizada com sucesso!");
        } else {
            dados.criadoEm = serverTimestamp();
            const ref = await addDoc(collection(db, COL_PESQUISAS), dados);
            alert(`Nova pesquisa criada! Coleções prontas em pesquisas/${ref.id}/{perguntas,respostas}.`);
        }
        window.limparFormPesquisa();
        await carregarListaPesquisasDB();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Ocorreu um erro ao salvar a pesquisa no Firebase.");
    }
}

window.excluirPesquisa = async function (id) {
    const podeDeletar = window.userRoles?.Admin;
    if (!podeDeletar) { alert("Acesso Negado: Você não tem permissão para excluir."); return; }

    if (confirm("Atenção: Deseja realmente excluir esta pesquisa e todas as suas perguntas/respostas?")) {
        try {
            // Apaga subcoleções
            for (const sub of ['perguntas', 'respostas']) {
                const snap = await getDocs(collection(db, COL_PESQUISAS, id, sub));
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            await deleteDoc(doc(db, COL_PESQUISAS, id));
            alert("Pesquisa removida.");
            await carregarListaPesquisasDB();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            alert("Erro ao excluir a pesquisa.");
        }
    }
};

window.alternarStatusPesquisa = async function (id) {
    const pesquisa = window._pesquisasCache.find(p => p.id === id);
    if (!pesquisa) return;
    const novo = pesquisa.status === 'Aberta' ? 'Fechada' : 'Aberta';
    try {
        await updateDoc(doc(db, COL_PESQUISAS, id), { status: novo });
        await carregarListaPesquisasDB();
    } catch (e) { console.error(e); alert('Erro ao alterar status.'); }
};

window.duplicarPesquisa = async function (id) {
    const pesquisa = window._pesquisasCache.find(p => p.id === id);
    if (!pesquisa) return;
    const novoTitulo = prompt("Digite o título da NOVA pesquisa (cópia):", pesquisa.titulo + " - (Cópia)");
    if (!novoTitulo) return;

    try {
        const nova = await addDoc(collection(db, COL_PESQUISAS), {
            titulo: novoTitulo,
            descricao: pesquisa.descricao,
            status: 'Aberta',
            data_referencia: pesquisa.data_referencia,
            criadoEm: serverTimestamp()
        });
        const pergSnap = await getDocs(collection(db, COL_PESQUISAS, id, 'perguntas'));
        const batch = writeBatch(db);
        pergSnap.docs.forEach(d => batch.set(doc(db, COL_PESQUISAS, nova.id, 'perguntas', d.id), d.data()));
        await batch.commit();
        alert("Pesquisa duplicada com sucesso!");
        await carregarListaPesquisasDB();
    } catch (err) {
        console.error("Erro ao duplicar:", err);
        alert("Erro ao duplicar pesquisa.");
    }
};

function voltarParaLista() {
    document.getElementById('dashboard-pesquisa').classList.add('hidden');
    document.getElementById('dashboard-pesquisa').innerHTML = '';
    window.destruirGraficos();

    const formContainer = document.getElementById('form-responder-pesquisa');
    if (formContainer) { formContainer.classList.add('hidden'); formContainer.innerHTML = ''; }

    document.getElementById('btn-voltar-pesquisas').classList.add('hidden');
    document.getElementById('lista-pesquisas').classList.remove('hidden');
}

window.destruirGraficos = function () {
    if (window.chartInstances) {
        Object.values(window.chartInstances).forEach(c => { try { c.destroy(); } catch (e) { } });
    }
    window.chartInstances = {};
};

// =========================================================
// CONSTRUTOR DE PERGUNTAS
// =========================================================
// Busca todas as perguntas e ordena no cliente (evita excluir docs sem o campo 'ordem')
async function getPerguntas(pesquisaId) {
    const snap = await getDocs(collection(db, COL_PESQUISAS, pesquisaId, 'perguntas'));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (Number.isFinite(Number(a.ordem)) ? Number(a.ordem) : 999) - (Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 999) || String(a.campo_chave || '').localeCompare(String(b.campo_chave || '')));
}

window.carregarEditorPerguntas = async function (pesquisaId) {
    const container = document.getElementById('lista-perguntas-container');
    if (!container) return;

    if (!pesquisaId) {
        container.innerHTML = '<p class="text-amber-500 italic p-4 bg-slate-900 rounded-xl border border-slate-700">Clique em "Editar" em uma pesquisa na tabela para carregar as perguntas vinculadas a ela.</p>';
        return;
    }

    try {
        const perguntas = await getPerguntas(pesquisaId);

        if (perguntas.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic">Nenhuma pergunta cadastrada para esta pesquisa ainda.</p>';
            return;
        }

        container.innerHTML = `<p class="text-slate-500 text-[10px] uppercase tracking-widest mb-2"><i class="fas fa-grip-vertical mr-1"></i> Arraste os cartões para reordenar</p>`;
        perguntas.forEach(p => {
            const btnExcluir = window.canDeletePesquisa ? `<button onclick="window.excluirPergunta('${pesquisaId}','${p.id}')" class="text-red-400 hover:text-red-300 ml-auto"><i class="fas fa-trash"></i></button>` : '';
            container.innerHTML += `
                <div class="perg-item bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col gap-2 cursor-grab active:cursor-grabbing" draggable="true" data-id="${p.id}">
                    <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
                        <i class="fas fa-grip-vertical text-slate-600"></i>
                        <span class="text-emerald-400 font-mono text-sm font-bold">${p.campo_chave}</span>
                        <span class="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded font-bold">${p.tipo_sql} (${p.tamanho_max})</span>
                        ${btnExcluir}
                    </div>
                    <div class="text-white text-sm">${p.label_texto}</div>
                    <div class="text-slate-500 text-xs italic">${p.opcoes ? 'Opções: ' + p.opcoes : 'Campo de entrada livre'}</div>
                </div>`;
        });

        // Drag & drop para reordenar (atualiza o campo 'ordem' no Firestore)
        container.querySelectorAll('.perg-item').forEach(item => {
            item.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', item.dataset.id); item.classList.add('opacity-50'); });
            item.addEventListener('dragend', () => item.classList.remove('opacity-50'));
            item.addEventListener('dragover', e => e.preventDefault());
            item.addEventListener('drop', async e => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId === item.dataset.id) return;
                const ids = [...container.querySelectorAll('.perg-item')].map(x => x.dataset.id);
                const from = ids.indexOf(draggedId);
                const to = ids.indexOf(item.dataset.id);
                ids.splice(to, 0, ids.splice(from, 1)[0]);
                try {
                    const batch = writeBatch(db);
                    ids.forEach((id, idx) => batch.update(doc(db, COL_PESQUISAS, pesquisaId, 'perguntas', id), { ordem: idx }));
                    await batch.commit();
                    window.carregarEditorPerguntas(pesquisaId);
                } catch (err) {
                    console.error('Erro ao reordenar:', err);
                    alert('Erro ao salvar a nova ordem.');
                }
            });
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="text-red-400">Erro ao carregar perguntas.</p>';
    }
};

window.salvarNovaPergunta = async function (e) {
    e.preventDefault();
    const pesquisaId = document.getElementById('perg-pesquisa-id').value;
    if (!pesquisaId) {
        alert("Por favor, clique em 'Editar' em uma pesquisa na tabela acima antes de adicionar perguntas!");
        return;
    }

    const novaPergunta = {
        label_texto: document.getElementById('perg-enunciado').value,
        campo_chave: document.getElementById('perg-chave').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        tipo_sql: document.getElementById('perg-tipo').value,
        tamanho_max: parseInt(document.getElementById('perg-tamanho').value) || 100,
        opcoes: document.getElementById('perg-opcoes').value,
        ordem: 99
    };

    try {
        await addDoc(collection(db, COL_PESQUISAS, pesquisaId, 'perguntas'), novaPergunta);
        alert("Nova pergunta adicionada com sucesso!");
        document.getElementById('form-pergunta-crud').reset();
        window.carregarEditorPerguntas(pesquisaId);
    } catch (error) {
        console.error("Erro ao inserir pergunta:", error);
        alert("Erro ao inserir pergunta no Firebase.");
    }
};

window.excluirPergunta = async function (pesquisaId, perguntaId) {
    if (!window.canDeletePesquisa) { alert("Acesso Negado: Você não tem permissão para excluir."); return; }
    if (confirm(`Deseja apagar esta pergunta?`)) {
        try {
            await deleteDoc(doc(db, COL_PESQUISAS, pesquisaId, 'perguntas', perguntaId));
            window.carregarEditorPerguntas(pesquisaId);
        } catch (error) {
            console.error("Erro ao excluir pergunta:", error);
            alert("Erro ao excluir a pergunta.");
        }
    }
};

// =========================================================
// CRUD DE COLÉGIOS (opções do seletor da instituição)
// =========================================================
async function carregarListaColegiosCrud() {
    const cont = document.getElementById('lista-colegios-crud');
    if (!cont) return;
    try {
        const snap = await getDocs(query(collection(db, COL_COLEGIOS), orderBy('nome', 'asc')));
        cont.innerHTML = '';
        if (snap.empty) { cont.innerHTML = '<p class="text-slate-500 italic text-sm">Nenhuma instituição cadastrada.</p>'; return; }
        snap.docs.forEach(d => {
            const c = d.data();
            const btnExcluir = window.userRoles?.Admin
                ? `<button onclick="window.excluirColegio('${d.id}')" class="text-red-400 hover:text-red-300 bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors" title="Excluir"><i class="fas fa-trash"></i></button>` : '';
            const btnEditar = `<button onclick="window.editarColegio('${d.id}','${(c.nome || '').replace(/'/g, "\\'")}')" class="text-indigo-400 hover:text-indigo-300 bg-indigo-400/10 px-3 py-1.5 rounded-lg transition-colors" title="Renomear"><i class="fas fa-pen"></i></button>`;
            cont.innerHTML += `
                <div class="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-700">
                    <span class="text-white font-bold"><i class="fas fa-school text-teal-500 mr-2"></i>${c.nome || ''}</span>
                    <div class="flex gap-2">${btnEditar}${btnExcluir}</div>
                </div>`;
        });
    } catch (e) {
        console.error(e);
        cont.innerHTML = '<p class="text-red-400 text-sm">Erro ao carregar instituições.</p>';
    }
}

async function salvarColegioCrud(e) {
    e.preventDefault();
    const nome = document.getElementById('novo-colegio-nome').value.trim();
    if (!nome) return;
    try {
        await addDoc(collection(db, COL_COLEGIOS), { nome });
        document.getElementById('novo-colegio-nome').value = '';
        await carregarListaColegiosCrud();
    } catch (e) { console.error(e); alert('Erro ao cadastrar instituição.'); }
}

window.excluirColegio = async function (id) {
    if (!(window.userRoles?.Admin)) { alert('Apenas Admin pode excluir.'); return; }
    if (!confirm('Excluir esta instituição? Respostas antigas continuam registradas.')) return;
    try {
        await deleteDoc(doc(db, COL_COLEGIOS, id));
        await carregarListaColegiosCrud();
    } catch (e) { console.error(e); alert('Erro ao excluir.'); }
};

window.editarColegio = async function (id, nomeAtual) {
    const novoNome = prompt('Novo nome da instituição:', nomeAtual);
    if (!novoNome || !novoNome.trim()) return;
    try {
        await updateDoc(doc(db, COL_COLEGIOS, id), { nome: novoNome.trim() });
        await carregarListaColegiosCrud();
    } catch (e) { console.error(e); alert('Erro ao renomear.'); }
};

// =========================================================
// MIGRAÇÃO SUPABASE -> FIREBASE
// =========================================================
async function executarMigracao() {
    const btn = document.getElementById('btn-migrar-supabase');
    const log = document.getElementById('log-migracao');
    log.classList.remove('hidden');
    log.textContent = 'Iniciando migração...\n';
    btn.disabled = true;
    const say = (t) => { log.textContent += t + '\n'; log.scrollTop = log.scrollHeight; };

    try {
        // 1. Colégios
        const { data: colegios } = await supabase.from('colegios').select('*');
        let b = writeBatch(db), n = 0;
        for (const c of (colegios || [])) {
            b.set(doc(db, COL_COLEGIOS, String(c.id)), { nome: c.nome, ...c });
            if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); }
        }
        await b.commit();
        say(`✔ ${(colegios || []).length} colégios migrados.`);

        // 2. Pesquisas + perguntas + respostas
        const { data: pesquisas, error: ePesq } = await supabase.from('pesquisas_lista').select('*');
        if (ePesq) throw ePesq;

        const { data: perguntasForm } = await supabase.from('perguntas_formulario').select('*');

        for (const p of (pesquisas || [])) {
            const pesqId = `supa_${p.id}`;
            await setDoc(doc(db, COL_PESQUISAS, pesqId), {
                titulo: p.titulo,
                descricao: p.descricao,
                status: p.status,
                data_referencia: p.data_referencia,
                tabela_respostas_alvo: p.tabela_respostas_alvo || null,
                criadoEm: serverTimestamp(),
                migradaSupabase: true
            }, { merge: true });
            say(`→ Pesquisa "${p.titulo}" (${pesqId})`);

            const pergs = (perguntasForm || []).filter(x => String(x.pesquisa_id) === String(p.id));
            b = writeBatch(db); n = 0;
            for (const per of pergs) {
                b.set(doc(db, COL_PESQUISAS, pesqId, 'perguntas', `supa_${per.id}`), {
                    label_texto: per.label_texto,
                    campo_chave: per.campo_chave,
                    tipo_sql: per.tipo_sql,
                    tamanho_max: per.tamanho_max,
                    opcoes: per.opcoes || '',
                    ordem: per.ordem ?? 99
                });
                if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); }
            }
            await b.commit();
            say(`   ✔ ${pergs.length} perguntas`);

            if (p.tabela_respostas_alvo) {
                try {
                    const { data: rows } = await supabase.from(p.tabela_respostas_alvo).select('*');
                    b = writeBatch(db); n = 0;
                    for (const r of (rows || [])) {
                        // Respostas podem estar espalhadas na raiz (tabela legada) ou dentro de respostas_json
                        let respostas = {};
                        if (r.respostas_json && typeof r.respostas_json === 'object') {
                            respostas = { ...r.respostas_json };
                        } else {
                            const { id, colegio_id, colegio_nome, created_at, ...resto } = r;
                            respostas = resto;
                        }
                        b.set(doc(db, COL_PESQUISAS, pesqId, 'respostas', `supa_${r.id}`), {
                            colegio_id: r.colegio_id ?? null,
                            colegio_nome: r.colegio_nome || '',
                            respostas,
                            criadoEm: serverTimestamp()
                        });
                        if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); }
                    }
                    await b.commit();
                    say(`   ✔ ${(rows || []).length} respostas`);
                } catch (e) {
                    say(`   ⚠ Não foi possível ler a tabela '${p.tabela_respostas_alvo}': ${e.message}`);
                }
            }
        }
        say('\n✅ Migração concluída!');
        await carregarListaPesquisasDB();
    } catch (err) {
        console.error(err);
        say(`\n❌ Erro na migração: ${err.message}`);
    } finally {
        btn.disabled = false;
    }
}

// =========================================================
// FORMULÁRIO PÚBLICO DE RESPOSTA
// =========================================================
async function renderizarFormularioPesquisa(pesquisaId) {
    const pesquisa = window._pesquisasCache.find(p => p.id === pesquisaId) || {};
    const titulo = pesquisa.titulo || 'Pesquisa';
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
        </div>`;

    try {
        // Colégios do Firestore
        const selColegio = document.getElementById('form-colegio');
        try {
            const snapCol = await getDocs(query(collection(db, COL_COLEGIOS), orderBy('nome', 'asc')));
            selColegio.innerHTML = '<option value="">-- Selecione sua escola/setor --</option>';
            snapCol.docs.forEach(d => {
                const c = d.data();
                selColegio.innerHTML += `<option value="${d.id}" data-nome="${(c.nome || '').replace(/"/g, '&quot;')}">${c.nome}</option>`;
            });
        } catch {
            selColegio.innerHTML = '<option value="">Nenhuma instituição cadastrada</option>';
        }

        // Perguntas da pesquisa
        const perguntas = await getPerguntas(pesquisaId);
        window.pesquisaPerguntasAtuais = perguntas;

        const contPerguntas = document.getElementById('perguntas-dinamicas-container');
        contPerguntas.innerHTML = '';

        if (perguntas.length === 0) {
            contPerguntas.innerHTML = '<p class="text-amber-500 italic p-4 bg-slate-900 rounded-xl border border-slate-700">Nenhuma pergunta configurada no sistema.</p>';
            return;
        }

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
            } else if (p.tipo_sql === 'TEXT') {
                inputElement = `<textarea name="${p.campo_chave}" required rows="3" class="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 outline-none focus:border-emerald-500 custom-scroll"></textarea>`;
            } else {
                let optionsHtml = '<option value="">Selecione...</option>';
                const listaOpcoes = p.opcoes ? p.opcoes.split(',').map(o => o.trim()) : [];
                listaOpcoes.forEach(opText => {
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

        document.getElementById('pesquisa-publica-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            const btn = document.getElementById('btn-enviar-pesquisa');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';

            const formData = new FormData(this);
            const dadosBrutos = Object.fromEntries(formData.entries());

            // Barreira de moderação
            const camposParaModerar = [];
            for (const [chave, valor] of Object.entries(dadosBrutos)) {
                if (typeof valor === 'string' && valor.trim().length > 0) {
                    const ehTextoLivre = /coment|texto|resposta|obs|msg|desc|abert|livre|justif|motiv|sugest|opin/i.test(chave);
                    if (ehTextoLivre || valor.length > 50) {
                        camposParaModerar.push({ nome: chave, valor, rotulo: `Campo "${chave}"`, max: 5000 });
                    }
                }
            }
            if (camposParaModerar.length > 0) {
                if (!aprovar(camposParaModerar, { origem: 'pesquisasTech:resposta', permitirStaff: true })) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Enviar Resposta Anônima';
                    return;
                }
            }

            const seletor = document.getElementById('form-colegio');
            const col_id = seletor.value;
            const col_nome = seletor.options[seletor.selectedIndex].dataset.nome || seletor.options[seletor.selectedIndex].text;

            // Tipagem
            perguntas.forEach(p => {
                if (p.tipo_sql === 'INT' && dadosBrutos[p.campo_chave] !== undefined) dadosBrutos[p.campo_chave] = parseInt(dadosBrutos[p.campo_chave]);
                if (p.campo_chave === 'foi_vitima' || p.campo_chave === 'sabe_pedir_ajuda') {
                    if (dadosBrutos[p.campo_chave] === 'true') dadosBrutos[p.campo_chave] = true;
                    else if (dadosBrutos[p.campo_chave] === 'false') dadosBrutos[p.campo_chave] = false;
                }
            });

            try {
                await addDoc(collection(db, COL_PESQUISAS, pesquisaId, 'respostas'), {
                    colegio_id: col_id,
                    colegio_nome: col_nome,
                    respostas: dadosBrutos,
                    criadoEm: serverTimestamp()
                });
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
        formContainer.innerHTML = '<p class="text-red-400 p-6">Erro ao carregar o formulário da pesquisa.</p>';
    }
}

// =========================================================
// DASHBOARD ANALÍTICO
// =========================================================
async function abrirDashboardPesquisa(pesquisaId) {
    const pesquisa = window._pesquisasCache.find(p => p.id === pesquisaId);
    const titulo = pesquisa?.titulo || 'Pesquisa';
    const tabelaAlvo = pesquisa?.tabela_respostas_alvo || '';
    const dashContainer = document.getElementById('dashboard-pesquisa');

    document.getElementById('lista-pesquisas').classList.add('hidden');
    document.getElementById('btn-voltar-pesquisas').classList.remove('hidden');
    dashContainer.classList.remove('hidden');

    dashContainer.innerHTML = `
        <div class="fade-in space-y-8 w-full mb-12">
            <h3 class="text-2xl font-cinzel font-bold text-indigo-400 border-l-4 border-indigo-500 pl-4">Dashboard Analítico: ${titulo}</h3>
            <div id="dash-loading" class="text-center py-20 text-slate-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            <div id="dash-content" class="hidden w-full flex-col gap-8"></div>
        </div>`;

    try {
        // Respostas (flat: colegio_nome + respostas espalhadas na raiz p/ compatibilidade com gráficos legados)
        const snapResp = await getDocs(collection(db, COL_PESQUISAS, pesquisaId, 'respostas'));
        const respostas = snapResp.docs.map(d => {
            const r = d.data();
            return { colegio_nome: r.colegio_nome, colegio_id: r.colegio_id, ...(r.respostas || {}) };
        });
        const perguntas = await getPerguntas(pesquisaId);

        window.pesquisaRespostasAtuais = respostas;
        window.pesquisaPerguntasAtuais = perguntas;

        document.getElementById('dash-loading').classList.add('hidden');
        const content = document.getElementById('dash-content');
        content.classList.remove('hidden');

        content.innerHTML = `
            <!-- FILTRO POR COLÉGIO -->
            <div class="bg-slate-800/60 border border-slate-700 p-6 rounded-2xl flex flex-col md:flex-row gap-5 items-center justify-between mb-6">
                <span class="text-slate-400 text-xs font-bold uppercase tracking-widest"><i class="fas fa-filter mr-2 text-indigo-400"></i>Filtros</span>
                <select id="dash-filtro-colegio" class="bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-sm outline-none focus:border-indigo-500">
                    <option value="">Todos os colégios</option>
                </select>
                <div class="flex gap-2 flex-wrap items-center" id="dash-tabs">
                    <button data-tab="visao" class="dash-tab px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-indigo-600 text-white">Visão Geral</button>
                </div>
            </div>
            <div id="dash-corpo"></div>`;

        const selFiltro = document.getElementById('dash-filtro-colegio');
        [...new Set(respostas.map(r => r.colegio_nome).filter(Boolean))].sort().forEach(nome => {
            selFiltro.innerHTML += `<option value="${nome}">${nome}</option>`;
        });

        let abaAtual = 'visao';
        const renderAba = () => {
            const filme = selFiltro.value;
            const filtradas = filme ? respostas.filter(r => r.colegio_nome === filme) : respostas;
            window.destruirGraficos();
            renderVisaoGeral(filtradas, perguntas, tabelaAlvo);
        };
        selFiltro.addEventListener('change', renderAba);
        document.querySelectorAll('.dash-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dash-tab').forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-slate-800', 'text-slate-400', 'border', 'border-slate-700'); });
                btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-slate-800', 'text-slate-400');
                abaAtual = btn.dataset.tab;
                renderAba();
            });
        });
        renderAba();
    } catch (err) {
        console.error("Erro ao puxar dados da pesquisa:", err);
        document.getElementById('dash-loading').innerHTML = '<p class="text-red-400">Erro ao processar dados analíticos.</p>';
    }
}

// ---------------- Helpers estatísticos ----------------
function isNum(v) { return typeof v === 'number' && !isNaN(v); }
function valsCategoria(respostas, chave) {
    return respostas.map(r => r[chave]).filter(v => v !== undefined && v !== null && v !== '')
        .map(v => (v === true ? 'Sim' : v === false ? 'Não' : String(v)));
}
function valsNumericos(respostas, chave) {
    return respostas.map(r => Number(r[chave])).filter(v => !isNaN(v));
}
function contagem(arr) { const m = {}; arr.forEach(v => m[v] = (m[v] || 0) + 1); return m; }
function media(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function mediana(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const PALETA = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
function tipoPergunta(p) {
    if (p.tipo_sql === 'INT') return 'num';
    if (p.tipo_sql === 'TEXT') return 'text';
    return 'cat';
}

// ---------------- Aba: Visão Geral (1 pergunta por gráfico) ----------------
function renderVisaoGeral(respostas, perguntas, tabelaAlvo) {
    const corpo = document.getElementById('dash-corpo');
    const colegiosUnicos = new Set(respostas.map(r => r.colegio_nome).filter(Boolean)).size;
    let html = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-6">
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl flex flex-col justify-center text-center">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total de Respostas</h4>
                <div class="text-4xl font-black text-indigo-400">${respostas.length}</div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl flex flex-col justify-center text-center">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Colégios Participantes</h4>
                <div class="text-4xl font-black text-emerald-400">${colegiosUnicos}</div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl flex flex-col justify-center text-center">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Perguntas</h4>
                <div class="text-4xl font-black text-amber-400">${perguntas.length}</div>
            </div>
            <div class="bg-indigo-900/20 border border-indigo-500/30 p-8 rounded-2xl shadow-xl flex flex-col justify-center">
                <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2"><i class="fas fa-info-circle mr-2"></i> Diagnóstico</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Cada pergunta aparece com gráficos em formatos diferentes (colunas, pizza, rosca, dispersão e linha) lado a lado para facilitar a leitura.</p>
            </div>
        </div>`;

    if (perguntas.length === 0) {
        html += '<p class="text-slate-500 italic p-6 bg-slate-900 rounded-xl border border-slate-700">Esta pesquisa ainda não possui perguntas cadastradas.</p>';
    } else {
        html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-14">';
        perguntas.forEach((p, idx) => {
            const t = tipoPergunta(p);
            html += `
                <div class="bg-slate-800/90 border border-slate-700/80 p-10 rounded-3xl shadow-xl w-full flex flex-col">
                    <h4 class="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-8 border-b border-slate-700 pb-4"><i class="fas fa-chart-bar mr-2"></i> ${p.label_texto}</h4>
                    ${t === 'text'
                    ? `<div id="lista-respostas-${idx}" class="text-sm text-slate-300 space-y-3 max-h-64 overflow-y-auto custom-scroll"></div>`
                    : `<div class="grid grid-cols-1 ${t === 'cat' ? 'md:grid-cols-3' : 'lg:grid-cols-3'} gap-8">
                             <div class="relative min-h-[220px]"><canvas id="chart-q-bar-${idx}"></canvas></div>
                             ${t === 'cat'
                            ? `<div class="relative min-h-[220px]"><canvas id="chart-q-pie-${idx}"></canvas></div>
                                <div class="relative min-h-[220px]"><canvas id="chart-q-dough-${idx}"></canvas></div>`
                            : `<div class="relative min-h-[160px]"><canvas id="chart-q-scatter-${idx}"></canvas></div>
                                <div class="relative min-h-[160px]"><canvas id="chart-q-line-${idx}"></canvas></div>`}
                           </div>`}
                </div>`;
        });
        html += '</div>';
    }

    // Dashboard legado preservado (pesquisa de Convivência)
    if (tabelaAlvo === 'respostas_pesquisa') {
        html += `<div id="legacy-convivencia" class="mt-10"></div>`;
    }

    corpo.innerHTML = html;

    // Renderiza gráficos por pergunta
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter, sans-serif';

    perguntas.forEach((p, idx) => {
        const t = tipoPergunta(p);
        const chave = p.campo_chave;
        if (t === 'text') {
            const lista = document.getElementById(`lista-respostas-${idx}`);
            const vals = respostas.map(r => r[chave]).filter(v => v);
            lista.innerHTML = vals.length
                ? vals.slice(0, 12).map(v => `<p class="bg-slate-900 p-3 rounded-lg border border-slate-800">“${v}”</p>`).join('')
                : '<p class="text-slate-600 italic">Sem respostas de texto ainda.</p>';
            return;
        }
        if (t === 'cat') {
            const cont = contagem(valsCategoria(respostas, chave));
            const labels = Object.keys(cont);
            const data = Object.values(cont);
            // Rotaciona formatos por questão: cada pergunta usa 3 tipos distintos
            const trio = idx % 3 === 0 ? ['bar', 'pie', 'doughnut']
                       : idx % 3 === 1 ? ['horizBar', 'polarArea', 'pie']
                       : ['polarArea', 'bar', 'doughnut'];
            const ids = [`chart-q-bar-${idx}`, `chart-q-pie-${idx}`, `chart-q-dough-${idx}`];
            trio.forEach((tp, k) => {
                const el = document.getElementById(ids[k]);
                if (!el) return;
                let cfg;
                if (tp === 'horizBar') {
                    cfg = { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: PALETA, borderRadius: 6 }] },
                            options: { indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: 'Barras Horizontais' } } } };
                } else if (tp === 'polarArea') {
                    cfg = { type: 'polarArea', data: { labels, datasets: [{ data, backgroundColor: PALETA.map(c => c + '99') }] },
                            options: { plugins: { title: { display: true, text: 'Área Polar' } } } };
                } else if (tp === 'doughnut') {
                    cfg = { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: PALETA }] }, options: { plugins: { title: { display: true, text: 'Rosca' } } } };
                } else if (tp === 'pie') {
                    cfg = { type: 'pie', data: { labels, datasets: [{ data, backgroundColor: PALETA }] }, options: { plugins: { title: { display: true, text: 'Pizza' } } } };
                } else {
                    cfg = { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: PALETA, borderRadius: 6 }] },
                            options: { plugins: { legend: { display: false }, title: { display: true, text: 'Colunas' } }, scales: { x: { ticks: { autoSkip: false, maxRotation: 45 } } } } };
                }
                window.chartInstances[`q${idx}k${k}`] = new Chart(el.getContext('2d'), cfg);
            });
        } else {
            const vals = valsNumericos(respostas, chave);
            const cont = contagem(vals.map(String));
            const labels = Object.keys(cont).sort((a, b) => Number(a) - Number(b));
            // Rotaciona formatos numéricos: cada pergunta usa 3 tipos distintos
            const trio = idx % 3 === 0 ? ['bar', 'scatter', 'line']
                       : idx % 3 === 1 ? ['line', 'bar', 'scatter']
                       : ['scatter', 'line', 'bar'];
            const ids = [`chart-q-bar-${idx}`, `chart-q-scatter-${idx}`, `chart-q-line-${idx}`];
            trio.forEach((tp, k) => {
                const el = document.getElementById(ids[k]);
                if (!el) return;
                let cfg;
                if (tp === 'scatter') {
                    cfg = { type: 'scatter', data: { datasets: [{ label: p.label_texto, data: vals.map((v, i) => ({ x: i + 1, y: v })), backgroundColor: '#10b98199' }] },
                            options: { scales: { x: { title: { display: true, text: 'Nº da resposta' } }, y: { title: { display: true, text: p.label_texto } } }, plugins: { title: { display: true, text: 'Dispersão' } } } };
                } else if (tp === 'line') {
                    cfg = { type: 'line', data: { labels: vals.map((_, i) => i + 1), datasets: [{ label: 'Valor', data: vals, borderColor: '#3b82f6', backgroundColor: '#3b82f622', fill: true, tension: 0.3 }] },
                            options: { plugins: { legend: { display: false }, title: { display: true, text: 'Linha (evolução)' } }, scales: { x: { title: { display: true, text: 'Nº da resposta' } } } } };
                } else {
                    cfg = { type: 'bar', data: { labels, datasets: [{ label: 'Frequência', data: labels.map(l => cont[l]), backgroundColor: '#6366f1', borderRadius: 6 }] },
                            options: { plugins: { legend: { display: false }, title: { display: true, text: 'Colunas (frequência)' } } } };
                }
                window.chartInstances[`qn${idx}k${k}`] = new Chart(el.getContext('2d'), cfg);
            });
        }
    });

    if (tabelaAlvo === 'respostas_pesquisa') {
        renderizarGraficosConvivencia(respostas);
    }
}

// ---------------- Aba: Cruzamentos (pergunta × pergunta) ----------------
function renderCruzamentos(respostas, perguntas) {
    const corpo = document.getElementById('dash-corpo');
    const opcoes = perguntas.map((p, i) => `<option value="${i}">${p.label_texto} (${tipoPergunta(p) === 'num' ? 'numérica' : tipoPergunta(p) === 'text' ? 'texto' : 'categórica'})</option>`).join('');

    corpo.innerHTML = `
        <div class="bg-slate-800/90 border border-slate-700/80 p-6 rounded-2xl shadow-xl">
            <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4"><i class="fas fa-exchange-alt mr-2"></i> Cruzar perguntas</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pergunta X</label>
                    <select id="cruz-x" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-indigo-500">${opcoes}</select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pergunta Y</label>
                    <select id="cruz-y" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-indigo-500">${opcoes}</select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Medida (quando Y numérica)</label>
                    <select id="cruz-medida" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-indigo-500">
                        <option value="media">Média</option>
                        <option value="mediana">Mediana</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl mt-8">
            <div class="relative min-h-[320px] w-full"><canvas id="chart-cruzamento"></canvas></div>
        </div>
        <div id="tabela-cruzamento" class="mt-8 overflow-x-auto"></div>`;

    const atualizar = () => {
        window.destruirGraficos();
        const ix = parseInt(document.getElementById('cruz-x').value);
        let iy = parseInt(document.getElementById('cruz-y').value);
        if (ix === iy && perguntas.length > 1) {
            iy = (ix + 1) % perguntas.length;
            document.getElementById('cruz-y').value = String(iy);
        }
        const px = perguntas[ix];
        const py = perguntas[iy];
        if (!px || !py) return;
        const medida = document.getElementById('cruz-medida').value;
        try {
            desenharCruzamento(respostas, px, py, medida);
        } catch (e) {
            console.error('Erro no cruzamento:', e);
            document.getElementById('tabela-cruzamento').innerHTML = '<p class="text-amber-400 text-sm bg-slate-900 p-4 rounded-xl border border-slate-800">Não foi possível cruzar estas perguntas (dados insuficientes ou incompatíveis).</p>';
        }
    };
    ['cruz-x', 'cruz-y', 'cruz-medida'].forEach(id => document.getElementById(id).addEventListener('change', atualizar));
    if (perguntas.length >= 2) {
        document.getElementById('cruz-y').selectedIndex = 1;
    }
    atualizar();
}

function desenharCruzamento(respostas, px, py, medida) {
    const tx = tipoPergunta(px), ty = tipoPergunta(py);
    const canvas = document.getElementById('chart-cruzamento');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tabelaDiv = document.getElementById('tabela-cruzamento');
    const tipoCat = (t) => t === 'cat' || t === 'text';

    // Num × Num -> dispersão com linha de tendência
    if (tx === 'num' && ty === 'num') {
        const pontos = respostas
            .map(r => ({ x: Number(r[px.campo_chave]), y: Number(r[py.campo_chave]) }))
            .filter(p => !isNaN(p.x) && !isNaN(p.y));
        // Regressão linear simples (mínimos quadrados)
        let trend = [];
        if (pontos.length >= 2) {
            const n = pontos.length;
            const sx = pontos.reduce((a, p) => a + p.x, 0), sy = pontos.reduce((a, p) => a + p.y, 0);
            const sxy = pontos.reduce((a, p) => a + p.x * p.y, 0), sxx = pontos.reduce((a, p) => a + p.x * p.x, 0);
            const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
            const b = (sy - m * sx) / n;
            const xs = pontos.map(p => p.x);
            trend = [{ x: Math.min(...xs), y: m * Math.min(...xs) + b }, { x: Math.max(...xs), y: m * Math.max(...xs) + b }];
        }
        window.chartInstances['cruz'] = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: `${px.label_texto} × ${py.label_texto}`, data: pontos, backgroundColor: '#6366f1aa', showLine: false },
                    ...(trend.length ? [{ type: 'line', label: 'Tendência', data: trend, borderColor: '#f59e0b', borderDash: [6, 4], pointRadius: 0, fill: false }] : [])
                ]
            },
            options: { scales: { x: { title: { display: true, text: px.label_texto } }, y: { title: { display: true, text: py.label_texto } } } }
        });
        tabelaDiv.innerHTML = `<p class="text-slate-400 text-sm bg-slate-900 p-4 rounded-xl border border-slate-800">Dispersão de <b>${pontos.length}</b> pares válidos com linha de tendência (regressão linear).</p>`;
        return;
    }

    // Cat/Text × Num -> média/mediana por categoria
    if (ty === 'num') {
        const grupos = {};
        respostas.forEach(r => {
            const cat = r[px.campo_chave];
            const v = Number(r[py.campo_chave]);
            if (cat === undefined || cat === '' || isNaN(v)) return;
            const chave = (cat === true ? 'Sim' : cat === false ? 'Não' : String(cat));
            (grupos[chave] = grupos[chave] || []).push(v);
        });
        const labels = Object.keys(grupos).map(l => l.length > 40 ? l.slice(0, 37) + '...' : l);
        const keysOrig = Object.keys(grupos);
        const medias = keysOrig.map(l => media(grupos[l]));
        const medianas = keysOrig.map(l => mediana(grupos[l]));
        window.chartInstances['cruz'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels, datasets: [
                    { label: `Média de ${py.label_texto}`, data: medias, backgroundColor: '#6366f1', borderRadius: 6 },
                    { label: `Mediana de ${py.label_texto}`, data: medianas, backgroundColor: '#10b981', borderRadius: 6 }
                ]
            }
        });
        tabelaDiv.innerHTML = tabelaGruposDuo(labels, medias, medianas, py.label_texto);
        return;
    }

    // Num × Cat -> inverte
    if (tx === 'num' && ty !== 'num') {
        const grupos = {};
        respostas.forEach(r => {
            const cat = r[py.campo_chave];
            const v = Number(r[px.campo_chave]);
            if (cat === undefined || cat === '' || isNaN(v)) return;
            const chave = (cat === true ? 'Sim' : cat === false ? 'Não' : String(cat));
            (grupos[chave] = grupos[chave] || []).push(v);
        });
        const keysOrig = Object.keys(grupos);
        const labels = keysOrig.map(l => l.length > 40 ? l.slice(0, 37) + '...' : l);
        const medias = keysOrig.map(l => media(grupos[l]));
        const medianas = keysOrig.map(l => mediana(grupos[l]));
        window.chartInstances['cruz'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels, datasets: [
                    { label: `Média de ${px.label_texto}`, data: medias, backgroundColor: '#6366f1', borderRadius: 6 },
                    { label: `Mediana de ${px.label_texto}`, data: medianas, backgroundColor: '#10b981', borderRadius: 6 }
                ]
            }
        });
        tabelaDiv.innerHTML = tabelaGruposDuo(labels, medias, medianas, px.label_texto);
        return;
    }

    // Cat × Cat -> barras empilhadas + tabela de contingência (heatmap simples)
    const matriz = {};
    const catsX = new Set(), catsY = new Set();
    respostas.forEach(r => {
        let vx = r[px.campo_chave], vy = r[py.campo_chave];
        if (vx === undefined || vy === undefined || vx === '' || vy === '') return;
        vx = vx === true ? 'Sim' : vx === false ? 'Não' : String(vx);
        vy = vy === true ? 'Sim' : vy === false ? 'Não' : String(vy);
        catsX.add(vx); catsY.add(vy);
        matriz[vx] = matriz[vx] || {};
        matriz[vx][vy] = (matriz[vx][vy] || 0) + 1;
    });
    const categoriasY = [...catsY];
    // Limita categorias para evitar gráficos ilegíveis (Top 8 mais frequentes)
    const freqX = {}, freqY = {};
    respostas.forEach(r => {
        let vx = r[px.campo_chave], vy = r[py.campo_chave];
        if (vx === undefined || vy === undefined || vx === '' || vy === '') return;
        vx = vx === true ? 'Sim' : vx === false ? 'Não' : String(vx);
        vy = vy === true ? 'Sim' : vy === false ? 'Não' : String(vy);
        freqX[vx] = (freqX[vx] || 0) + 1; freqY[vy] = (freqY[vy] || 0) + 1;
    });
    const chop = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8));
    const freqXTop = chop(freqX), freqYTop = chop(freqY);
    const labelsX = Object.keys(freqXTop);
    const categoriasYTop = Object.keys(freqYTop);
    if (labelsX.length === 0 || categoriasYTop.length === 0) {
        tabelaDiv.innerHTML = '<p class="text-amber-400 text-sm bg-slate-900 p-4 rounded-xl border border-slate-800">Sem respostas em comum entre as duas perguntas.</p>';
        return;
    }
    const datasets = categoriasYTop.map((cy, i) => ({
        label: cy.length > 40 ? cy.slice(0, 37) + '...' : cy,
        data: labelsX.map(cx => matriz[cx]?.[cy] || 0),
        backgroundColor: PALETA[i % PALETA.length],
        borderRadius: 4
    }));
    window.chartInstances['cruz'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: labelsX.map(l => l.length > 40 ? l.slice(0, 37) + '...' : l), datasets },
        options: { scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Nº de respostas' } } } }
    });

    // Tabela de contingência
    let th = `<table class="w-full text-sm border-collapse bg-slate-900/60 rounded-xl overflow-hidden"><thead><tr class="bg-slate-800 text-slate-400 text-[10px] uppercase tracking-widest"><th class="p-3 text-left">${px.label_texto} \\ ${py.label_texto}</th>`;
    categoriasYTop.forEach(cy => th += `<th class="p-3 text-center">${cy}</th>`);
    th += `<th class="p-3 text-center">Total</th></tr></thead><tbody class="divide-y divide-slate-800">`;
    labelsX.forEach(cx => {
        let total = 0;
        let row = `<tr><td class="p-3 text-white font-bold">${cx}</td>`;
        categoriasYTop.forEach(cy => {
            const v = matriz[cx]?.[cy] || 0;
            total += v;
            const intensidade = Math.min(0.7, v / Math.max(1, respostas.length) * 3);
            row += `<td class="p-3 text-center" style="background: rgba(99,102,241,${intensidade.toFixed(2)})">${v}</td>`;
        });
        row += `<td class="p-3 text-center text-indigo-300 font-bold">${total}</td></tr>`;
        th += row;
    });
    th += '</tbody></table>';
    tabelaDiv.innerHTML = th;
}

function tabelaGruposDuo(labels, medias, medianas, titulo) {
    let h = `<table class="w-full text-sm border-collapse bg-slate-900/60 rounded-xl overflow-hidden"><thead><tr class="bg-slate-800 text-slate-400 text-[10px] uppercase tracking-widest"><th class="p-3 text-left">Categoria</th><th class="p-3 text-right">Média de ${titulo}</th><th class="p-3 text-right">Mediana de ${titulo}</th></tr></thead><tbody class="divide-y divide-slate-800">`;
    labels.forEach((l, i) => h += `<tr><td class="p-3 text-white font-bold">${l}</td><td class="p-3 text-right text-indigo-300 font-bold">${medias[i].toFixed(2)}</td><td class="p-3 text-right text-emerald-300 font-bold">${medianas[i].toFixed(2)}</td></tr>`);
    return h + '</tbody></table>';
}

function tabelaGrupos(labels, valores, titulo) {
    let h = `<table class="w-full text-sm border-collapse bg-slate-900/60 rounded-xl overflow-hidden"><thead><tr class="bg-slate-800 text-slate-400 text-[10px] uppercase tracking-widest"><th class="p-3 text-left">Categoria</th><th class="p-3 text-right">${titulo}</th></tr></thead><tbody class="divide-y divide-slate-800">`;
    labels.forEach((l, i) => h += `<tr><td class="p-3 text-white font-bold">${l}</td><td class="p-3 text-right text-indigo-300 font-bold">${valores[i].toFixed(2)}</td></tr>`);
    return h + '</tbody></table>';
}

// ---------------- Aba: Estatísticas ----------------
function renderEstatisticas(respostas, perguntas) {
    const corpo = document.getElementById('dash-corpo');
    const numericas = perguntas.filter(p => tipoPergunta(p) === 'num');

    if (numericas.length === 0) {
        corpo.innerHTML = '<p class="text-slate-500 italic p-6 bg-slate-900 rounded-xl border border-slate-700">Esta pesquisa não tem perguntas numéricas para estatísticas.</p>';
        return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">';
    numericas.forEach(p => {
        const vals = valsNumericos(respostas, p.campo_chave);
        const m = media(vals), md = mediana(vals);
        const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 0;
        const desvio = vals.length ? Math.sqrt(media(vals.map(v => (v - m) ** 2))) : 0;
        html += `
            <div class="bg-slate-800/90 border border-slate-700/80 p-6 rounded-2xl shadow-xl">
                <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 border-b border-slate-700 pb-2">${p.label_texto}</h4>
                <div class="grid grid-cols-2 gap-3 text-center">
                    <div class="bg-slate-900 p-3 rounded-xl"><div class="text-2xl font-black text-white">${m.toFixed(1)}</div><div class="text-[10px] text-slate-500 uppercase">Média</div></div>
                    <div class="bg-slate-900 p-3 rounded-xl"><div class="text-2xl font-black text-white">${md.toFixed(1)}</div><div class="text-[10px] text-slate-500 uppercase">Mediana</div></div>
                    <div class="bg-slate-900 p-3 rounded-xl"><div class="text-2xl font-black text-white">${min}</div><div class="text-[10px] text-slate-500 uppercase">Mín</div></div>
                    <div class="bg-slate-900 p-3 rounded-xl"><div class="text-2xl font-black text-white">${max}</div><div class="text-[10px] text-slate-500 uppercase">Máx</div></div>
                    <div class="bg-slate-900 p-3 rounded-xl col-span-2"><div class="text-2xl font-black text-amber-400">${desvio.toFixed(2)}</div><div class="text-[10px] text-slate-500 uppercase">Desvio Padrão</div></div>
                </div>
            </div>`;
    });
    html += '</div>';

    // Comparativo Média × Mediana de todas as variáveis numéricas
    html += `<div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl mb-8">
        <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-balance-scale mr-2"></i> Média × Mediana por Pergunta</h4>
        <div class="relative min-h-[300px]"><canvas id="chart-medias-medianas"></canvas></div>
    </div>`;
    if (numericas.length >= 2) {
        html += `<div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl">
            <h4 class="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-project-diagram mr-2"></i> Dispersão: ${numericas[0].label_texto} × ${numericas[1].label_texto}</h4>
            <div class="relative min-h-[320px]"><canvas id="chart-dispersao-geral"></canvas></div>
        </div>`;
    }
    corpo.innerHTML = html;

    window.chartInstances['mediasmed'] = new Chart(document.getElementById('chart-medias-medianas').getContext('2d'), {
        type: 'bar',
        data: {
            labels: numericas.map(p => p.label_texto),
            datasets: [
                { label: 'Média', data: numericas.map(p => media(valsNumericos(respostas, p.campo_chave))), backgroundColor: '#6366f1', borderRadius: 6 },
                { label: 'Mediana', data: numericas.map(p => mediana(valsNumericos(respostas, p.campo_chave))), backgroundColor: '#10b981', borderRadius: 6 }
            ]
        }
    });

    if (numericas.length >= 2) {
        const pontos = respostas
            .map(r => ({ x: Number(r[numericas[0].campo_chave]), y: Number(r[numericas[1].campo_chave]) }))
            .filter(p => !isNaN(p.x) && !isNaN(p.y));
        window.chartInstances['dispgeral'] = new Chart(document.getElementById('chart-dispersao-geral').getContext('2d'), {
            type: 'scatter',
            data: { datasets: [{ data: pontos, backgroundColor: '#10b981aa' }] },
            options: { scales: { x: { title: { display: true, text: numericas[0].label_texto } }, y: { title: { display: true, text: numericas[1].label_texto } } } }
        });
    }
}

// =========================================================
// DASHBOARD LEGADO: CONVIVÊNCIA DIGITAL (preservado)
// =========================================================
function renderizarGraficosConvivencia(respostas) {
    const legacy = document.getElementById('legacy-convivencia');
    if (!legacy) return;

    legacy.innerHTML = `
        <h3 class="text-xl font-cinzel font-bold text-amber-400 border-l-4 border-amber-500 pl-4 mb-6">Dashboard Clássico: Convivência Digital</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-user-shield mr-2"></i> 1. Número de Vítimas por Idade</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-vitimas-idade"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-eye mr-2"></i> 2. Presenciou Cyberbullying (Por Idade)</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-presenciou-idade"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-hands-helping mr-2"></i> 3. Sabe Pedir Ajuda (Por Série Escolar)</h4>
                <div class="relative flex-grow min-h-[320px] w-full flex justify-center items-center"><canvas id="chart-ajuda-serie"></canvas></div>
            </div>
            <div class="bg-slate-800/90 border border-slate-700/80 p-8 rounded-2xl shadow-xl w-full flex flex-col">
                <h4 class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-3"><i class="fas fa-map-marked-alt mr-2"></i> 4. Ambiente Mais Propício (Cruzado c/ Idade)</h4>
                <div class="relative flex-grow min-h-[320px] w-full"><canvas id="chart-ambiente-idade"></canvas></div>
            </div>
        </div>`;

    const el = (id) => document.getElementById(id)?.getContext('2d');

    // 1. Vítimas por Idade
    const vitimasPorIdade = {};
    respostas.filter(r => r.foi_vitima === true || r.foi_vitima === 'true').forEach(r => {
        if (r.idade) vitimasPorIdade[r.idade] = (vitimasPorIdade[r.idade] || 0) + 1;
    });
    const idadesV = Object.keys(vitimasPorIdade).sort((a, b) => a - b);
    const elV = el('chart-vitimas-idade');
    if (elV) window.chartInstances['vitimas'] = new Chart(elV, {
        type: 'bar',
        data: { labels: idadesV, datasets: [{ label: 'Vítimas', data: idadesV.map(i => vitimasPorIdade[i]), backgroundColor: '#ef4444', borderRadius: 6 }] }
    });

    // 2. Presenciou por Idade
    const presencPorIdade = {};
    respostas.filter(r => r.presenciou_bullying === true || r.presenciou_bullying === 'true' || r.presenciou_bullying === 'Sim').forEach(r => {
        if (r.idade) presencPorIdade[r.idade] = (presencPorIdade[r.idade] || 0) + 1;
    });
    const idadesP = Object.keys(presencPorIdade).sort((a, b) => a - b);
    const elP = el('chart-presenciou-idade');
    if (elP) window.chartInstances['presenciou'] = new Chart(elP, {
        type: 'bar',
        data: { labels: idadesP, datasets: [{ label: 'Presenciou', data: idadesP.map(i => presencPorIdade[i]), backgroundColor: '#f59e0b', borderRadius: 6 }] }
    });

    // 3. Sabe pedir ajuda por série
    const ajudaPorSerie = {};
    respostas.forEach(r => {
        if (r.serie) {
            ajudaPorSerie[r.serie] = ajudaPorSerie[r.serie] || { sim: 0, nao: 0 };
            if (r.sabe_pedir_ajuda === true || r.sabe_pedir_ajuda === 'true' || r.sabe_pedir_ajuda === 'Sim') ajudaPorSerie[r.serie].sim++;
            else ajudaPorSerie[r.serie].nao++;
        }
    });
    const series = Object.keys(ajudaPorSerie);
    const elA = el('chart-ajuda-serie');
    if (elA) window.chartInstances['ajuda'] = new Chart(elA, {
        type: 'bar',
        data: {
            labels: series, datasets: [
                { label: 'Sim', data: series.map(s => ajudaPorSerie[s].sim), backgroundColor: '#10b981' },
                { label: 'Não', data: series.map(s => ajudaPorSerie[s].nao), backgroundColor: '#ef4444' }
            ]
        },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } }
    });

    // 4. Ambiente por idade
    const ambPorIdade = {};
    respostas.forEach(r => {
        if (r.idade && r.ambiente_risco) {
            ambPorIdade[r.ambiente_risco] = ambPorIdade[r.ambiente_risco] || {};
            ambPorIdade[r.ambiente_risco][r.idade] = (ambPorIdade[r.ambiente_risco][r.idade] || 0) + 1;
        }
    });
    const ambientes = Object.keys(ambPorIdade);
    const idadesA = [...new Set(respostas.map(r => r.idade).filter(Boolean))].sort((a, b) => a - b);
    const elAm = el('chart-ambiente-idade');
    if (elAm) window.chartInstances['ambiente'] = new Chart(elAm, {
        type: 'bar',
        data: {
            labels: idadesA,
            datasets: ambientes.map((amb, i) => ({ label: amb, data: idadesA.map(id => ambPorIdade[amb][id] || 0), backgroundColor: PALETA[i % PALETA.length] }))
        },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } }
    });
}
