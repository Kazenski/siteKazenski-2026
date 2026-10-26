import { collection, doc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { app, db, storage } from '../core/firebase.js';
import { escapeHTML } from '../core/utils.js';
import { TIPOS, novaQuestao, montarDocs, estadoDeQuestao } from './questoesCore.js';
import { criarEditorCodigo, destacarCodigo } from './editorCodigo.js';

let editoresProva = [];
let editoresEditor = [];
const destruirEditoresProva = () => { editoresProva.forEach(e => e.destroy()); editoresProva = []; };
const destruirEditoresEditor = () => { editoresEditor.forEach(e => e.destroy()); editoresEditor = []; };

const CLASSE_INPUT = 'w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 text-sm outline-none focus:border-blue-500';
const CLASSE_BTN = 'text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-blue-500 transition-colors';
const CLASSE_BTN_PROVA = 'px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
const CLASSE_ARQUIVO = 'text-[10px] text-slate-400 cursor-pointer file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-700 file:text-white hover:file:bg-slate-600';
const esc = (s) => escapeHTML(String(s ?? ''));
const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;

// ============================================================
// EDITOR (PROFESSOR)
// ============================================================
let editorQuestoes = [];

function garantirEventos(container) {
    if (container.dataset.pronto) return;
    container.dataset.pronto = '1';
    container.addEventListener('input', (e) => onInput(e, container));
    container.addEventListener('change', (e) => onChange(e, container));
    container.addEventListener('click', (e) => onClick(e, container));
}

export function iniciarEditor(container) {
    garantirEventos(container);
    editorQuestoes = [];
    renderEditor(container);
}

export function limparEditor(container) {
    iniciarEditor(container);
}

export function coletarQuestoes() {
    return editorQuestoes;
}

export async function carregarEditor(container, avalId) {
    garantirEventos(container);
    const [questoes, gabaritos] = await Promise.all([buscarQuestoesProfessor(avalId), buscarGabaritos(avalId)]);
    editorQuestoes = questoes.map(q => estadoDeQuestao(q, gabaritos[q.id]));
    renderEditor(container);
}

function renderEditor(container) {
    const cards = editorQuestoes.map((q, i) => cardQuestao(q, i)).join('');
    const total = editorQuestoes.reduce((soma, q) => soma + (Number(q.pontos) || 0), 0);
    destruirEditoresEditor();
    container.innerHTML = `
        <div class="space-y-4">
            ${editorQuestoes.length ? `
                <div class="flex flex-wrap justify-between gap-2 text-xs">
                    <span class="text-slate-400">${editorQuestoes.length} questão(ões) cadastrada(s)</span>
                    <span class="font-bold text-blue-400">Total da prova: ${Number(total.toFixed(2))} pt(s)</span>
                </div>` : ''}
            ${cards || '<p class="text-slate-500 text-xs italic">Sem questões: a avaliação funciona como atividade com envio de arquivo.</p>'}
            <button type="button" data-acao="add-questao" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Adicionar questão</button>
        </div>`;
    container.querySelectorAll('[data-editor-campo]').forEach(host => {
        const q = editorQuestoes[qIdx(host)];
        const campo = host.dataset.editorCampo;
        editoresEditor.push(criarEditorCodigo(host, {
            linguagem: host.dataset.editorLang,
            valor: lerCampoCodigo(q, campo),
            onChange: (v) => aplicarCampoCodigo(q, campo, v)
        }));
    });
}

function lerCampoCodigo(q, campo) {
    if (campo === 'codigo-inicial') return q.codigoInicial || '';
    if (campo === 'sql-inicial') return q.consultaInicial || '';
    if (campo === 'sql-gabarito') return q.sql || '';
    return '';
}

function aplicarCampoCodigo(q, campo, valor) {
    if (campo === 'codigo-inicial') q.codigoInicial = valor;
    if (campo === 'sql-inicial') q.consultaInicial = valor;
    if (campo === 'sql-gabarito') q.sql = valor;
}

function cardQuestao(q, i) {
    const opcoesTipo = Object.entries(TIPOS)
        .map(([v, l]) => `<option value="${v}" ${v === q.tipo ? 'selected' : ''}>${l}</option>`).join('');
    return `
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3" data-q="${i}">
            <div class="flex flex-wrap gap-2 items-center justify-between">
                <span class="text-xs font-bold text-blue-400 uppercase tracking-widest">Questão ${i + 1}</span>
                <div class="flex items-center gap-2">
                    <select data-campo="tipo" class="${CLASSE_INPUT} w-auto">${opcoesTipo}</select>
                    <input type="number" min="0.1" step="0.1" data-campo="pontos" value="${esc(q.pontos)}" title="Pontos" class="${CLASSE_INPUT} w-20">
                    <button type="button" data-acao="rm-questao" class="${CLASSE_BTN} hover:border-red-500 hover:text-red-400" title="Remover questão"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <textarea data-campo="enunciado" rows="2" placeholder="Enunciado da questão" class="${CLASSE_INPUT}">${esc(q.enunciado)}</textarea>
            ${seletorImagem(q.imagem, 'imagem-questao', 'rm-imagem', null, 'Imagem da questão (opcional)')}
            ${corpoTipo(q, i)}
            <textarea data-campo="explicacao" rows="2" placeholder="Explicação da resposta (o aluno só vê se você liberar o gabarito)" class="${CLASSE_INPUT}">${esc(q.explicacao)}</textarea>
        </div>`;
}

function seletorImagem(src, campo, acaoRemover, idx, rotulo) {
    const atributoIdx = idx === null ? '' : `data-idx="${idx}"`;
    const preview = src
        ? `<div class="flex flex-wrap items-center gap-3">
                <img src="${esc(src)}" alt="${esc(rotulo)}" class="max-h-48 max-w-full rounded-lg border border-slate-700 bg-slate-950 object-contain">
                <button type="button" data-acao="${acaoRemover}" ${atributoIdx} class="${CLASSE_BTN} hover:border-red-500 hover:text-red-400"><i class="fas fa-trash mr-1"></i> Remover imagem</button>
           </div>`
        : '';
    return `
        <div class="bg-slate-950/60 border border-dashed border-slate-700 rounded-lg p-3 space-y-2">
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">${rotulo}</label>
            ${preview}
            <input type="file" accept="image/*" data-campo="${campo}" ${atributoIdx} class="${CLASSE_ARQUIVO} block w-full">
        </div>`;
}

function corpoTipo(q, i) {
    switch (q.tipo) {
        case 'multipla_escolha':
        case 'multipla_selecao': {
            const tipoInput = q.tipo === 'multipla_escolha' ? 'radio' : 'checkbox';
            const linhas = q.opcoes.map((o, k) => `
                <div class="flex flex-wrap items-center gap-2 bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                    <input type="${tipoInput}" name="corr-${i}" data-campo="opcao-correta" data-idx="${k}" ${o.correta ? 'checked' : ''} class="accent-emerald-500 w-4 h-4" title="Correta">
                    <input type="text" data-campo="opcao-texto" data-idx="${k}" value="${esc(o.texto)}" placeholder="Opção ${k + 1}" class="${CLASSE_INPUT} flex-1 min-w-[12rem]">
                    ${o.imagem ? `<img src="${esc(o.imagem)}" alt="Imagem da opção ${k + 1}" class="h-12 max-w-[6rem] rounded border border-slate-700 bg-slate-950 object-contain">` : ''}
                    <input type="file" accept="image/*" data-campo="imagem-opcao" data-idx="${k}" title="Imagem da opção" class="${CLASSE_ARQUIVO} w-44">
                    ${o.imagem ? `<button type="button" data-acao="rm-imagem-opcao" data-idx="${k}" class="${CLASSE_BTN}" title="Remover imagem da opção"><i class="fas fa-image"></i></button>` : ''}
                    <button type="button" data-acao="rm-opcao" data-idx="${k}" class="${CLASSE_BTN}" title="Remover opção"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-2">${linhas}
                <button type="button" data-acao="add-opcao" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Opção</button>
                <p class="text-[10px] text-slate-500">Marque a(s) opção(ões) correta(s). Cada opção pode ter sua própria imagem.</p></div>`;
        }
        case 'verdadeiro_falso': {
            const linhas = q.afirmacoes.map((a, k) => `
                <div class="flex items-center gap-2">
                    <input type="text" data-campo="afirm-texto" data-idx="${k}" value="${esc(a.texto)}" placeholder="Afirmação ${k + 1}" class="${CLASSE_INPUT}">
                    <select data-campo="afirm-valor" data-idx="${k}" class="${CLASSE_INPUT} w-auto">
                        <option value="true" ${a.valor ? 'selected' : ''}>Verdadeiro</option>
                        <option value="false" ${!a.valor ? 'selected' : ''}>Falso</option>
                    </select>
                    <button type="button" data-acao="rm-afirm" data-idx="${k}" class="${CLASSE_BTN}"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-2">${linhas}
                <button type="button" data-acao="add-afirm" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Afirmação</button></div>`;
        }
        case 'ligar_colunas': {
            const linhas = q.pares.map((p, k) => `
                <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input type="text" data-campo="par-a" data-idx="${k}" value="${esc(p.a)}" placeholder="Coluna A ${k + 1}" class="${CLASSE_INPUT}">
                    <input type="text" data-campo="par-b" data-idx="${k}" value="${esc(p.b)}" placeholder="Coluna B ${k + 1}" class="${CLASSE_INPUT}">
                    <button type="button" data-acao="rm-par" data-idx="${k}" class="${CLASSE_BTN}"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-2">${linhas}
                <button type="button" data-acao="add-par" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Par</button>
                <p class="text-[10px] text-slate-500">O sistema embaralha a coluna B para o aluno.</p></div>`;
        }
        case 'ordenar': {
            const linhas = q.itens.map((t, k) => `
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-500 w-6 text-right">${k + 1}.</span>
                    <input type="text" data-campo="item-texto" data-idx="${k}" value="${esc(t)}" placeholder="Item ${k + 1}" class="${CLASSE_INPUT}">
                    <button type="button" data-acao="rm-item" data-idx="${k}" class="${CLASSE_BTN}"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-2">${linhas}
                <button type="button" data-acao="add-item" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Item</button>
                <p class="text-[10px] text-slate-500">Digite os itens na ordem correta. O aluno verá em ordem embaralhada.</p></div>`;
        }
        case 'sql':
            return `<div class="space-y-3">
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Consulta inicial (opcional)</label>
                <div data-editor-campo="sql-inicial" data-editor-lang="sql"></div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Consulta gabarito</label>
                <div data-editor-campo="sql-gabarito" data-editor-lang="sql"></div>
                <p class="text-[10px] text-slate-500">A nota é dada se o resultado do aluno for igual ao do gabarito (nomes das colunas não contam). Se o gabarito tiver ORDER BY, a ordem das linhas também é exigida. A base é a das tabelas CSV enviadas na avaliação.</p>
            </div>`;
        case 'python': {
            const linhas = q.testes.map((t, k) => `
                <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-start bg-slate-950/60 border border-slate-800 rounded-lg p-2">
                    <textarea data-campo="teste-entrada" data-idx="${k}" rows="2" placeholder="Entrada (stdin)" class="${CLASSE_INPUT} font-mono">${esc(t.entrada)}</textarea>
                    <textarea data-campo="teste-saida" data-idx="${k}" rows="2" placeholder="Saída esperada" class="${CLASSE_INPUT} font-mono">${esc(t.saida)}</textarea>
                    <label class="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-widest pt-2 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" data-campo="teste-oculto" data-idx="${k}" ${t.oculto ? 'checked' : ''} class="accent-amber-500 w-4 h-4"> Oculto
                    </label>
                    <button type="button" data-acao="rm-teste" data-idx="${k}" class="${CLASSE_BTN}"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-3">
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Código inicial (opcional)</label>
                <div data-editor-campo="codigo-inicial" data-editor-lang="python"></div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Testes</label>
                ${linhas}
                <button type="button" data-acao="add-teste" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Teste</button>
                <p class="text-[10px] text-slate-500">Cada teste envia a entrada ao programa do aluno e compara a saída. Testes ocultos não aparecem para o aluno. A nota é proporcional aos testes aprovados.</p>
            </div>`;
        }
        case 'dissertativa':
            return `<div class="space-y-2">
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Resposta esperada (referência para correção)</label>
                <textarea data-campo="referencia" rows="3" placeholder="Resposta de referência para você corrigir manualmente" class="${CLASSE_INPUT}">${esc(q.referencia)}</textarea>
                <p class="text-[10px] text-slate-500">Esta questão é corrigida por você no painel da entrega. A referência fica no servidor e só aparece no gabarito, se você liberá-lo após o prazo.</p>
            </div>`;
        default:
            return `<p class="text-[10px] text-slate-500">Correção manual: você atribui a nota no painel da entrega.</p>`;
    }
}

const qIdx = (t) => Number(t.closest('[data-q]').dataset.q);

const LIMITE_MB = LIMITE_IMAGEM_BYTES / (1024 * 1024);

async function enviarImagem(file) {
    if (!file.type.startsWith('image/')) throw new Error('O arquivo precisa ser uma imagem (PNG, JPG, GIF ou WebP).');
    if (file.size > LIMITE_IMAGEM_BYTES) throw new Error(`A imagem passa de ${LIMITE_MB} MB. Reduza o tamanho e tente de novo.`);
    const nome = file.name.replace(/[^\w.-]+/g, '_');
    const arquivo = ref(storage, `avaliacoes_questoes/${Date.now()}_${nome}`);
    await uploadBytes(arquivo, file);
    return getDownloadURL(arquivo);
}

async function anexarImagem(input, container, aplicar) {
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    try {
        aplicar(await enviarImagem(file));
    } catch (err) {
        console.error('Falha ao enviar imagem da questão:', err);
        alert(err.message || 'Não foi possível enviar a imagem.');
    }
    renderEditor(container);
}

function onInput(e, container) {
    const t = e.target;
    const campo = t.dataset.campo;
    if (!campo) return;
    const q = editorQuestoes[qIdx(t)];
    const idx = Number(t.dataset.idx);
    switch (campo) {
        case 'enunciado': q.enunciado = t.value; break;
        case 'explicacao': q.explicacao = t.value; break;
        case 'pontos': q.pontos = t.value; break;
        case 'referencia': q.referencia = t.value; break;
        case 'opcao-texto': q.opcoes[idx].texto = t.value; break;
        case 'afirm-texto': q.afirmacoes[idx].texto = t.value; break;
        case 'par-a': q.pares[idx].a = t.value; break;
        case 'par-b': q.pares[idx].b = t.value; break;
        case 'item-texto': q.itens[idx] = t.value; break;
        case 'codigo-inicial': q.codigoInicial = t.value; break;
        case 'sql-gabarito': q.sql = t.value; break;
        case 'sql-inicial': q.consultaInicial = t.value; break;
        case 'teste-entrada': q.testes[idx].entrada = t.value; break;
        case 'teste-saida': q.testes[idx].saida = t.value; break;
    }
}

function onChange(e, container) {
    const t = e.target;
    const campo = t.dataset.campo;
    if (!campo) return;
    const q = editorQuestoes[qIdx(t)];
    const idx = Number(t.dataset.idx);
    switch (campo) {
        case 'tipo':
            q.tipo = t.value;
            renderEditor(container);
            break;
        case 'opcao-correta':
            if (t.type === 'radio') q.opcoes.forEach(o => { o.correta = false; });
            q.opcoes[idx].correta = t.checked;
            break;
        case 'afirm-valor':
            q.afirmacoes[idx].valor = t.value === 'true';
            break;
        case 'teste-oculto':
            q.testes[idx].oculto = t.checked;
            break;
        case 'imagem-questao':
            anexarImagem(t, container, (url) => { q.imagem = url; });
            break;
        case 'imagem-opcao':
            anexarImagem(t, container, (url) => { q.opcoes[idx].imagem = url; });
            break;
    }
}

function onClick(e, container) {
    const btn = e.target.closest('[data-acao]');
    if (!btn) return;
    const acao = btn.dataset.acao;
    const idx = Number(btn.dataset.idx);
    const q = btn.closest('[data-q]') ? editorQuestoes[qIdx(btn)] : null;

    switch (acao) {
        case 'add-questao': editorQuestoes.push(novaQuestao()); break;
        case 'rm-questao': editorQuestoes.splice(qIdx(btn), 1); break;
        case 'rm-imagem': q.imagem = ''; break;
        case 'rm-imagem-opcao': q.opcoes[idx].imagem = ''; break;
        case 'add-opcao': q.opcoes.push({ texto: '', correta: false, imagem: '' }); break;
        case 'rm-opcao': q.opcoes.splice(idx, 1); break;
        case 'add-afirm': q.afirmacoes.push({ texto: '', valor: true }); break;
        case 'rm-afirm': q.afirmacoes.splice(idx, 1); break;
        case 'add-par': q.pares.push({ a: '', b: '' }); break;
        case 'rm-par': q.pares.splice(idx, 1); break;
        case 'add-item': q.itens.push(''); break;
        case 'rm-item': q.itens.splice(idx, 1); break;
        case 'add-teste': q.testes.push({ entrada: '', saida: '', oculto: false }); break;
        case 'rm-teste': q.testes.splice(idx, 1); break;
        default: return;
    }
    renderEditor(container);
}

// ============================================================
// FIRESTORE (PROFESSOR)
// ============================================================
async function buscarQuestoesProfessor(avalId) {
    const snap = await getDocs(collection(doc(db, 'avaliacoes_digitais', avalId), 'questoes'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
}

async function buscarGabaritos(avalId) {
    const snap = await getDocs(collection(doc(db, 'avaliacoes_digitais', avalId), 'gabaritos'));
    const mapa = {};
    snap.forEach(d => { mapa[d.id] = d.data(); });
    return mapa;
}

export async function salvarQuestoes(avalId, lista) {
    const avalRef = doc(db, 'avaliacoes_digitais', avalId);
    const qCol = collection(avalRef, 'questoes');
    const gCol = collection(avalRef, 'gabaritos');
    const [antigasQ, antigasG] = await Promise.all([getDocs(qCol), getDocs(gCol)]);

    const batch = writeBatch(db);
    antigasQ.forEach(d => batch.delete(d.ref));
    antigasG.forEach(d => batch.delete(d.ref));
    for (const d of montarDocs(lista)) {
        batch.set(doc(qCol, d.id), d.questao);
        batch.set(doc(gCol, d.id), { gabarito: d.gabarito, explicacao: d.explicacao });
    }
    await batch.commit();
}

// ============================================================
// ALUNO: CONSENTIMENTO, PROVA E RESULTADO
// ============================================================
export async function buscarQuestoesAluno(avalId) {
    const snap = await getDocs(collection(doc(db, 'avaliacoes_digitais', avalId), 'questoes'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
}

export async function obterResultado(avalId) {
    const fn = httpsCallable(getFunctions(app), 'obterResultadoAvaliacao');
    const { data } = await fn({ avaliacaoId: avalId });
    return data;
}

export async function executarSql(avaliacaoId, sql) {
    const fn = httpsCallable(getFunctions(app), 'executarSql');
    const { data } = await fn({ avaliacaoId, sql });
    return data;
}

function tabelaSql(colunas, linhas) {
    if (!colunas || colunas.length === 0) return '<p class="text-xs text-slate-400">Consulta executada sem retorno de linhas.</p>';
    if (linhas.length === 0) return '<p class="text-xs text-slate-400">Nenhuma linha retornada.</p>';
    const cabecalho = colunas.map(c => `<th class="px-2 py-1 text-left text-blue-400 border border-slate-700">${esc(c)}</th>`).join('');
    const corpo = linhas.map(l => `<tr>${l.map(v => `<td class="px-2 py-1 border border-slate-800 text-slate-300">${esc(v === null ? 'NULL' : v)}</td>`).join('')}</tr>`).join('');
    return `<table class="text-xs font-mono border-collapse"><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>`;
}

function blocoEsquema(bases) {
    if (!bases || bases.length === 0) return '';
    const tabelas = bases.map(b => `
        <div class="text-xs font-mono"><span class="text-blue-400">${esc(b.tabela)}</span>
        <span class="text-slate-500">(${(b.colunas || []).map(esc).join(', ')})</span></div>`).join('');
    return `<div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1">
        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tabelas disponíveis</p>${tabelas}</div>`;
}

export async function executarPython(codigo, entrada) {
    const fn = httpsCallable(getFunctions(app), 'executarPython');
    const { data } = await fn({ codigo, entrada });
    return data;
}

async function enviarProva(avalId, respostas) {
    const fn = httpsCallable(getFunctions(app), 'corrigirAvaliacao');
    const { data } = await fn({ avaliacaoId: avalId, respostas });
    return data;
}

export function mostrarConsentimento(area, onAceitar) {
    area.innerHTML = `
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-4">
            <h4 class="text-amber-400 font-bold"><i class="fas fa-shield-alt mr-2"></i> Antes de começar</h4>
            <p class="text-sm text-slate-300">Durante a prova, o sistema registra quando você sai desta janela ou troca de aba. Esses registros ficam visíveis para o professor.</p>
            <p class="text-sm text-slate-300">A prova é feita uma questão por vez. Você pode voltar às questões já respondidas para revisar. Suas respostas são salvas automaticamente, e a prova só é enviada quando você clicar em "Enviar prova".</p>
            <label class="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
                <input type="checkbox" id="consent-prova" class="mt-1 w-4 h-4 accent-amber-500">
                <span>Li e concordo com o registro dessas saídas durante a prova.</span>
            </label>
            <div class="flex justify-end">
                <button type="button" id="btn-iniciar-prova" disabled class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Começar prova</button>
            </div>
        </div>`;
    const cb = area.querySelector('#consent-prova');
    const btn = area.querySelector('#btn-iniciar-prova');
    cb.addEventListener('change', () => { btn.disabled = !cb.checked; });
    btn.addEventListener('click', onAceitar);
}

function estadoInicial(q) {
    switch (q.tipo) {
        case 'multipla_selecao': return [];
        case 'verdadeiro_falso':
        case 'ligar_colunas': return {};
        case 'ordenar': return (q.itens || []).map(i => i.id);
        case 'python': return q.codigoInicial || '';
        case 'sql': return q.consultaInicial || '';
        case 'dissertativa': return '';
        default: return null;
    }
}

// Questão ainda sem resposta completa (usado só para avisar antes do envio).
function respostaPendente(q, r) {
    switch (q.tipo) {
        case 'multipla_escolha': return r === null || r === undefined || r === '';
        case 'multipla_selecao': return !Array.isArray(r) || r.length === 0;
        case 'verdadeiro_falso': return (q.afirmacoes || []).some(a => r?.[a.id] === undefined);
        case 'ligar_colunas': return (q.colunaA || []).some(a => !r?.[a.id]);
        case 'ordenar': return false;
        default: return !String(r ?? '').trim();
    }
}

const lerJson = (chave, padrao) => {
    try { return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao; } catch (_) { return padrao; }
};

let removerListenersProva = null;

export function renderProva(area, { avalId, uid, aval, questoes, onTroca, onEnviado }) {
    const chave = `prova_rascunho_${avalId}_${uid}`;
    const chaveNav = `prova_nav_${avalId}_${uid}`;
    const total = questoes.length;
    const ultimo = Math.max(total - 1, 0);

    const respostas = lerJson(chave, {});
    questoes.forEach(q => { if (respostas[q.id] === undefined) respostas[q.id] = estadoInicial(q); });

    const nav = lerJson(chaveNav, {});
    let atual = Math.min(Math.max(Number(nav.atual) || 0, 0), ultimo);
    let maxVisitada = Math.min(Math.max(Number(nav.maxVisitada) || 0, atual), ultimo);
    const saidas = nav.saidas && typeof nav.saidas === 'object' ? nav.saidas : {};

    let trocas = 0;
    let ultimoEvento = 0;
    let statusTxt = 'Respostas salvas automaticamente';

    const salvarNav = () => localStorage.setItem(chaveNav, JSON.stringify({ atual, maxVisitada, saidas }));

    const salvar = () => {
        localStorage.setItem(chave, JSON.stringify(respostas));
        const agora = new Date();
        statusTxt = `Salvo às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        const el = area.querySelector('#prova-status');
        if (el) el.textContent = statusTxt;
    };

    const irPara = (k) => {
        if (k < 0 || k > ultimo || k > maxVisitada + 1 || k === atual) return;
        atual = k;
        maxVisitada = Math.max(maxVisitada, k);
        salvarNav();
        pintar();
        area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const pintar = () => {
        destruirEditoresProva();
        const q = questoes[atual];
        const faltam = ultimo - maxVisitada;
        const vezesSaiu = saidas[q.id] || 0;

        const quadradinhos = questoes.map((item, k) => {
            const saiuAqui = saidas[item.id] ? ' ring-2 ring-red-500 ring-offset-2 ring-offset-slate-900' : '';
            const titulo = `Questão ${k + 1}${saidas[item.id] ? ' · saída da página registrada' : ''}`;
            if (k === atual) {
                return `<span title="${titulo}" class="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold bg-emerald-500 text-white shadow-lg shadow-emerald-500/30${saiuAqui}">${k + 1}</span>`;
            }
            if (k <= maxVisitada) {
                return `<button type="button" data-acao="ir" data-idx="${k}" title="${titulo}" class="w-9 h-9 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors${saiuAqui}">${k + 1}</button>`;
            }
            return `<span title="${titulo}" class="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold bg-slate-700 text-slate-400 cursor-not-allowed${saiuAqui}">${k + 1}</span>`;
        }).join('');

        const marca = vezesSaiu > 0
            ? `<div class="flex items-start gap-3 bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-200 text-sm font-bold">
                    <i class="fas fa-exclamation-triangle text-red-400 mt-0.5"></i>
                    <span>Aluno saiu da página da prova sem autorização.${vezesSaiu > 1 ? ` (${vezesSaiu} vezes nesta questão)` : ''}</span>
               </div>`
            : '';

        area.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-5">
                <div class="flex flex-wrap justify-between gap-3 items-center">
                    <h4 class="text-white font-bold"><i class="fas fa-pen-alt text-blue-500 mr-2"></i> Prova</h4>
                    <div class="text-xs text-slate-400">
                        <span id="prova-status">${statusTxt}</span> ·
                        <span id="prova-trocas" class="text-red-400 font-bold">Saídas da aba: ${trocas}</span>
                    </div>
                </div>
                ${blocoEsquema(aval.bases)}
                <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="text-sm font-bold text-white">Questão ${atual + 1} <span class="text-slate-400 font-normal">de ${total}</span></p>
                        <p class="text-xs font-bold ${faltam > 0 ? 'text-slate-300' : 'text-emerald-400'}">${faltam > 0 ? `Faltam ${faltam} questão(ões)` : 'Você chegou à última questão'}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">${quadradinhos}</div>
                    <div class="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <span><i class="fas fa-square text-emerald-500 mr-1"></i> Atual</span>
                        <span><i class="fas fa-square text-blue-600 mr-1"></i> Já passou</span>
                        <span><i class="fas fa-square text-slate-600 mr-1"></i> Faltam</span>
                        <span><i class="far fa-square text-red-500 mr-1"></i> Saída registrada</span>
                    </div>
                </div>
                <div class="space-y-4">
                    ${marca}
                    ${cardResposta(q, atual, respostas[q.id])}
                </div>
                <div class="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-700">
                    <button type="button" data-acao="anterior" ${atual === 0 ? 'disabled' : ''} class="${CLASSE_BTN_PROVA} bg-slate-700 hover:bg-slate-600 text-white"><i class="fas fa-arrow-left mr-2"></i> Anterior</button>
                    <div class="flex flex-wrap gap-3">
                        <button type="button" id="btn-enviar-prova" class="${CLASSE_BTN_PROVA} bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg">Enviar prova</button>
                        ${atual === ultimo ? '' : `<button type="button" data-acao="proxima" class="${CLASSE_BTN_PROVA} bg-blue-600 hover:bg-blue-500 text-white shadow-lg">Próxima <i class="fas fa-arrow-right ml-2"></i></button>`}
                    </div>
                </div>
            </div>`;

        const host = area.querySelector('[data-editor-host]');
        if (host && (q.tipo === 'python' || q.tipo === 'sql')) {
            editoresProva.push(criarEditorCodigo(host, {
                linguagem: q.tipo,
                valor: respostas[q.id] || '',
                onChange: (v) => { respostas[q.id] = v; salvar(); }
            }));
        }
    };

    area.onchange = (e) => {
        const t = e.target;
        const qid = t.dataset.qid;
        if (!qid || !t.dataset.tipo) return;
        switch (t.dataset.tipo) {
            case 'mc': respostas[qid] = t.value; break;
            case 'ms': {
                const atualResp = respostas[qid] || [];
                respostas[qid] = t.checked ? [...atualResp, t.value] : atualResp.filter(v => v !== t.value);
                break;
            }
            case 'vf': respostas[qid] = { ...(respostas[qid] || {}), [t.dataset.aid]: t.value === 'true' }; break;
            case 'ligar': respostas[qid] = { ...(respostas[qid] || {}), [t.dataset.aid]: t.value }; break;
            default: return;
        }
        salvar();
    };

    area.oninput = (e) => {
        const t = e.target;
        if (['texto', 'codigo', 'sql'].includes(t.dataset.tipo)) {
            respostas[t.dataset.qid] = t.value;
            salvar();
        }
    };

    area.onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn || btn.disabled) return;
        if (btn.id === 'btn-enviar-prova') return enviar(btn);
        const acao = btn.dataset.acao;
        if (acao === 'anterior') return irPara(atual - 1);
        if (acao === 'proxima') return irPara(atual + 1);
        if (acao === 'ir') return irPara(Number(btn.dataset.idx));
        if (acao === 'executar-sql') {
            const qid = btn.dataset.qid;
            const saidaEl = area.querySelector(`#exec-${qid}`);
            saidaEl.innerHTML = '<p class="text-xs text-slate-400">Executando...</p>';
            executarSql(avalId, respostas[qid] || '')
                .then(r => {
                    saidaEl.innerHTML = r.erro
                        ? `<pre class="text-xs text-red-400 whitespace-pre-wrap">${esc(r.erro)}</pre>`
                        : tabelaSql(r.colunas, r.linhas);
                })
                .catch(err => { saidaEl.innerHTML = `<pre class="text-xs text-red-400">${esc(err.message || 'Falha ao executar.')}</pre>`; });
            return;
        }
        if (acao === 'executar') {
            const qid = btn.dataset.qid;
            const saidaEl = area.querySelector(`#exec-${qid}`);
            const entrada = area.querySelector(`#entrada-${qid}`)?.value || '';
            saidaEl.textContent = 'Executando...';
            executarPython(respostas[qid] || '', entrada)
                .then(r => {
                    if (r.timeout) saidaEl.textContent = r.erro;
                    else saidaEl.textContent = (r.saida || '') + (r.erro ? '\n' + r.erro : '') || '(sem saída)';
                })
                .catch(err => { saidaEl.textContent = err.message || 'Falha ao executar.'; });
            return;
        }
        if (acao === 'sobe' || acao === 'desce') {
            const qid = btn.dataset.qid;
            const k = Number(btn.dataset.idx);
            const lista = [...respostas[qid]];
            const alvo = acao === 'sobe' ? k - 1 : k + 1;
            if (alvo < 0 || alvo >= lista.length) return;
            [lista[k], lista[alvo]] = [lista[alvo], lista[k]];
            respostas[qid] = lista;
            salvar();
            pintar();
        }
    };

    const aoSair = () => {
        if (!area.isConnected) {
            if (removerListenersProva) removerListenersProva();
            return;
        }
        if (!document.hidden && document.hasFocus()) return;
        const agora = Date.now();
        if (agora - ultimoEvento < 1500) return;
        ultimoEvento = agora;
        trocas++;
        const qid = questoes[atual]?.id;
        if (qid) {
            saidas[qid] = (saidas[qid] || 0) + 1;
            salvarNav();
        }
        if (onTroca) onTroca(qid);
        pintar();
    };

    if (removerListenersProva) removerListenersProva();
    removerListenersProva = () => {
        document.removeEventListener('visibilitychange', aoSair);
        window.removeEventListener('blur', aoSair);
    };
    document.addEventListener('visibilitychange', aoSair);
    window.addEventListener('blur', aoSair);

    async function enviar(btn) {
        const pendentes = questoes.filter(q => respostaPendente(q, respostas[q.id])).length;
        const aviso = pendentes > 0 ? `\n\nAtenção: ${pendentes} questão(ões) estão sem resposta completa.` : '';
        if (!confirm(`Enviar a prova?${aviso}\n\nDepois do envio as respostas não podem ser alteradas.`)) return;
        const textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
        try {
            const resultado = await enviarProva(avalId, respostas);
            localStorage.removeItem(chave);
            localStorage.removeItem(chaveNav);
            onEnviado(resultado);
        } catch (err) {
            alert(err.message || 'Não foi possível enviar a prova. Tente novamente.');
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }

    pintar();
}

function cardResposta(q, i, resp) {
    const imagemQuestao = q.imagem
        ? `<img src="${esc(q.imagem)}" alt="Imagem da questão ${i + 1}" class="max-h-96 max-w-full mx-auto rounded-lg border border-slate-700 bg-slate-950 object-contain">`
        : '';
    const imagemOpcao = (o) => o.imagem
        ? `<img src="${esc(o.imagem)}" alt="" class="max-h-48 max-w-full rounded border border-slate-700 bg-slate-950 object-contain">`
        : '';

    const cabecalho = `
        <span class="text-xs font-bold text-blue-400 uppercase tracking-widest">Questão ${i + 1} · ${q.pontos} pt(s)</span>
        <p class="text-slate-200 text-sm whitespace-pre-wrap">${esc(q.enunciado)}</p>
        ${imagemQuestao}`;

    let corpo = '';
    switch (q.tipo) {
        case 'multipla_escolha':
            corpo = (q.opcoes || []).map(o => `
                <label class="flex items-start gap-3 bg-slate-950/60 border border-slate-800 hover:border-blue-500/60 rounded-lg p-3 text-sm text-slate-300 cursor-pointer transition-colors">
                    <input type="radio" name="r-${q.id}" data-qid="${q.id}" data-tipo="mc" value="${esc(o.id)}" ${resp === o.id ? 'checked' : ''} class="w-4 h-4 mt-0.5 accent-blue-500 shrink-0">
                    <span class="flex-1 flex flex-col gap-2"><span>${esc(o.texto)}</span>${imagemOpcao(o)}</span>
                </label>`).join('');
            break;
        case 'multipla_selecao':
            corpo = (q.opcoes || []).map(o => `
                <label class="flex items-start gap-3 bg-slate-950/60 border border-slate-800 hover:border-blue-500/60 rounded-lg p-3 text-sm text-slate-300 cursor-pointer transition-colors">
                    <input type="checkbox" data-qid="${q.id}" data-tipo="ms" value="${esc(o.id)}" ${(resp || []).includes(o.id) ? 'checked' : ''} class="w-4 h-4 mt-0.5 accent-blue-500 shrink-0">
                    <span class="flex-1 flex flex-col gap-2"><span>${esc(o.texto)}</span>${imagemOpcao(o)}</span>
                </label>`).join('');
            break;
        case 'verdadeiro_falso':
            corpo = (q.afirmacoes || []).map(a => `
                <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                    <span class="text-sm text-slate-300">${esc(a.texto)}</span>
                    <div class="flex gap-4 text-xs font-bold uppercase tracking-widest">
                        <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="vf-${q.id}-${a.id}" data-qid="${q.id}" data-aid="${a.id}" data-tipo="vf" value="true" ${resp?.[a.id] === true ? 'checked' : ''} class="accent-emerald-500"> V</label>
                        <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="vf-${q.id}-${a.id}" data-qid="${q.id}" data-aid="${a.id}" data-tipo="vf" value="false" ${resp?.[a.id] === false ? 'checked' : ''} class="accent-red-500"> F</label>
                    </div>
                </div>`).join('');
            break;
        case 'ligar_colunas':
            corpo = (q.colunaA || []).map(a => `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                    <span class="text-sm text-slate-300">${esc(a.texto)}</span>
                    <select data-qid="${q.id}" data-aid="${a.id}" data-tipo="ligar" class="${CLASSE_INPUT}">
                        <option value="">Escolha...</option>
                        ${(q.colunaB || []).map(b => `<option value="${esc(b.id)}" ${resp?.[a.id] === b.id ? 'selected' : ''}>${esc(b.texto)}</option>`).join('')}
                    </select>
                </div>`).join('');
            break;
        case 'ordenar':
            corpo = (resp || []).map((id, k) => {
                const item = (q.itens || []).find(x => x.id === id);
                const total = resp.length;
                return `
                    <div class="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2">
                        <span class="text-xs text-slate-500 w-6 text-right">${k + 1}.</span>
                        <span class="flex-1 text-sm text-slate-300">${esc(item?.texto || '')}</span>
                        <button type="button" data-acao="sobe" data-qid="${q.id}" data-idx="${k}" ${k === 0 ? 'disabled' : ''} class="${CLASSE_BTN} disabled:opacity-30"><i class="fas fa-arrow-up"></i></button>
                        <button type="button" data-acao="desce" data-qid="${q.id}" data-idx="${k}" ${k === total - 1 ? 'disabled' : ''} class="${CLASSE_BTN} disabled:opacity-30"><i class="fas fa-arrow-down"></i></button>
                    </div>`;
            }).join('');
            break;
        case 'sql':
            corpo = `
                <div data-editor-host="${q.id}" data-linguagem="sql"></div>
                <div class="flex justify-end">
                    <button type="button" data-acao="executar-sql" data-qid="${q.id}" class="${CLASSE_BTN}"><i class="fas fa-play mr-1"></i> Executar consulta</button>
                </div>
                <div id="exec-${q.id}" class="overflow-x-auto"></div>`;
            break;
        case 'python': {
            const exemplos = (q.testesVisiveis || []).map(t => `
                <div class="text-xs font-mono bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-slate-400">
                    <div>entrada: <span class="text-slate-300">${esc(t.entrada || '(vazia)')}</span></div>
                    <div>saída esperada: <span class="text-emerald-400">${esc(t.saida)}</span></div>
                </div>`).join('');
            corpo = `
                ${exemplos ? `<p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Exemplos</p>${exemplos}` : ''}
                <div data-editor-host="${q.id}" data-linguagem="python"></div>
                <div class="flex flex-wrap items-start gap-2">
                    <textarea id="entrada-${q.id}" rows="2" placeholder="Entrada para testar (stdin)" class="${CLASSE_INPUT} font-mono md:w-1/2"></textarea>
                    <button type="button" data-acao="executar" data-qid="${q.id}" class="${CLASSE_BTN}"><i class="fas fa-play mr-1"></i> Executar</button>
                </div>
                <pre id="exec-${q.id}" class="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 whitespace-pre-wrap min-h-[2.5rem]"></pre>`;
            break;
        }
        default:
            corpo = `<textarea data-qid="${q.id}" data-tipo="texto" rows="6" placeholder="Escreva sua resposta" class="${CLASSE_INPUT}">${esc(resp || '')}</textarea>`;
    }

    return `<div class="space-y-3">${cabecalho}<div class="space-y-2">${corpo}</div></div>`;
}

function textoDoGabarito(q, g) {
    switch (q.tipo) {
        case 'multipla_escolha':
            return (q.opcoes || []).find(o => o.id === g)?.texto ?? '—';
        case 'multipla_selecao':
            return (q.opcoes || []).filter(o => (g || []).includes(o.id)).map(o => o.texto).join('; ') || '—';
        case 'verdadeiro_falso':
            return (q.afirmacoes || []).map(a => `${a.texto}: ${g?.[a.id] ? 'Verdadeiro' : 'Falso'}`).join(' | ');
        case 'ligar_colunas':
            return Object.entries(g || {}).map(([a, b]) => {
                const ta = (q.colunaA || []).find(x => x.id === a)?.texto;
                const tb = (q.colunaB || []).find(x => x.id === b)?.texto;
                return `${ta} → ${tb}`;
            }).join(' | ');
        case 'ordenar':
            return (g || []).map((id, k) => `${k + 1}. ${(q.itens || []).find(i => i.id === id)?.texto ?? ''}`).join('  ');
        case 'python':
            return `Programa avaliado por ${(g?.testes || []).length} teste(s). Veja a explicação do professor.`;
        case 'dissertativa':
            return g?.referencia ? g.referencia : 'Questão dissertativa: correção do professor.';
        default:
            return 'Questão dissertativa: correção do professor.';
    }
}

export function renderResultado(area, res, questoes, { treino = false, onRefazer = null } = {}) {
    const final = res.notaAtribuida !== null && res.notaAtribuida !== undefined;
    const nota = final ? res.notaAtribuida : res.notaParcial;
    const rotuloNota = treino
        ? `Treino: ${res.pontosObtidos} de ${res.pontosTotais} pts`
        : `${final ? 'Nota final' : 'Nota parcial'}: ${nota ?? '—'}`;
    const pendencia = res.pendentes > 0
        ? `<p class="text-amber-400 text-sm"><i class="fas fa-hourglass-half mr-1"></i> ${res.pendentes} questão(ões) aguardam correção do professor. A nota será atualizada quando ele concluir.</p>`
        : '';

    area.innerHTML = `
        <div class="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 space-y-4">
            <div class="flex flex-wrap justify-between items-center gap-3">
                <h4 class="text-emerald-400 font-bold"><i class="fas fa-check mr-2"></i> Prova enviada</h4>
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-sm font-bold">
                    ${rotuloNota}
                </span>
            </div>
            <p class="text-slate-300 text-sm">Pontos nas questões corrigidas: ${res.pontosObtidos} de ${res.pontosCorrigidos}.</p>
            ${pendencia}
            <div id="area-gabarito" class="space-y-4"></div>
        </div>`;

    if (treino && onRefazer) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.id = 'btn-refazer-treino';
        botao.className = `${CLASSE_BTN} self-start`;
        botao.innerHTML = '<i class="fas fa-redo mr-2"></i> Refazer exercício';
        botao.addEventListener('click', onRefazer);
        area.querySelector('#area-gabarito').insertAdjacentElement('beforebegin', botao);
    }

    if (!res.gabaritoLiberado || !res.questoes) {
        const aviso = area.querySelector('#area-gabarito');
        aviso.innerHTML = '<p class="text-slate-500 text-xs italic">O gabarito será liberado pelo professor após o prazo.</p>';
        return;
    }

    const docs = Object.fromEntries((questoes || []).map(q => [q.id, q]));
    const detalhes = Object.fromEntries((res.detalhes || []).map(d => [d.questaoId, d]));
    area.querySelector('#area-gabarito').innerHTML = `
        <h5 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Gabarito</h5>
        ${res.questoes.map((q, i) => {
            const d = detalhes[q.id];
            const testes = d && d.total !== undefined ? ` · ${d.aprovados} de ${d.total} testes` : '';
            const pts = d && d.obtidos !== undefined ? `${d.obtidos} de ${q.pontos}${testes}` : `${q.pontos} pt(s)`;
            return `
                <div class="bg-slate-900/80 border border-slate-700 rounded-xl p-4 space-y-2">
                    <div class="flex justify-between gap-3 text-xs font-bold uppercase tracking-widest">
                        <span class="text-blue-400">Questão ${i + 1}</span>
                        <span class="text-slate-400">${pts}</span>
                    </div>
                    <p class="text-sm text-slate-200">${esc(q.enunciado)}</p>
                    ${q.imagem ? `<img src="${esc(q.imagem)}" alt="Imagem da questão ${i + 1}" class="max-h-72 max-w-full rounded-lg border border-slate-700 bg-slate-950 object-contain">` : ''}
                    ${q.tipo === 'sql'
                        ? `<div class="space-y-1"><p class="text-xs text-emerald-400 font-bold uppercase tracking-widest">Consulta gabarito</p>${destacarCodigo(q.gabarito?.sql || '', 'sql')}</div>`
                        : `<p class="text-sm text-emerald-400"><b>Resposta:</b> ${esc(textoDoGabarito(docs[q.id] || { tipo: q.tipo }, q.gabarito))}</p>`}
                    ${q.explicacao ? `<p class="text-sm text-slate-400 whitespace-pre-line border-l-2 border-blue-500 pl-3">${esc(q.explicacao)}</p>` : ''}
                </div>`;
        }).join('')}`;
}
