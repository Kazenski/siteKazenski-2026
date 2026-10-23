import { collection, doc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { app, db } from '../core/firebase.js';
import { escapeHTML } from '../core/utils.js';
import { TIPOS, novaQuestao, montarDocs, estadoDeQuestao } from './questoesCore.js';

const CLASSE_INPUT = 'w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 text-sm outline-none focus:border-blue-500';
const CLASSE_BTN = 'text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-blue-500 transition-colors';
const esc = (s) => escapeHTML(String(s ?? ''));

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
    container.innerHTML = `
        <div class="space-y-4">
            ${cards || '<p class="text-slate-500 text-xs italic">Sem questões: a avaliação funciona como atividade com envio de arquivo.</p>'}
            <button type="button" data-acao="add-questao" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Adicionar questão</button>
        </div>`;
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
            ${corpoTipo(q, i)}
            <textarea data-campo="explicacao" rows="2" placeholder="Explicação da resposta (o aluno só vê se você liberar o gabarito)" class="${CLASSE_INPUT}">${esc(q.explicacao)}</textarea>
        </div>`;
}

function corpoTipo(q, i) {
    switch (q.tipo) {
        case 'multipla_escolha':
        case 'multipla_selecao': {
            const tipoInput = q.tipo === 'multipla_escolha' ? 'radio' : 'checkbox';
            const linhas = q.opcoes.map((o, k) => `
                <div class="flex items-center gap-2">
                    <input type="${tipoInput}" name="corr-${i}" data-campo="opcao-correta" data-idx="${k}" ${o.correta ? 'checked' : ''} class="accent-emerald-500 w-4 h-4" title="Correta">
                    <input type="text" data-campo="opcao-texto" data-idx="${k}" value="${esc(o.texto)}" placeholder="Opção ${k + 1}" class="${CLASSE_INPUT}">
                    <button type="button" data-acao="rm-opcao" data-idx="${k}" class="${CLASSE_BTN}" title="Remover opção"><i class="fas fa-times"></i></button>
                </div>`).join('');
            return `<div class="space-y-2">${linhas}
                <button type="button" data-acao="add-opcao" class="${CLASSE_BTN}"><i class="fas fa-plus mr-1"></i> Opção</button>
                <p class="text-[10px] text-slate-500">Marque a(s) opção(ões) correta(s).</p></div>`;
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
        default:
            return `<p class="text-[10px] text-slate-500">Correção manual: você atribui a nota no painel da entrega.</p>`;
    }
}

const qIdx = (t) => Number(t.closest('[data-q]').dataset.q);

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
        case 'opcao-texto': q.opcoes[idx].texto = t.value; break;
        case 'afirm-texto': q.afirmacoes[idx].texto = t.value; break;
        case 'par-a': q.pares[idx].a = t.value; break;
        case 'par-b': q.pares[idx].b = t.value; break;
        case 'item-texto': q.itens[idx] = t.value; break;
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
        case 'add-opcao': q.opcoes.push({ texto: '', correta: false }); break;
        case 'rm-opcao': q.opcoes.splice(idx, 1); break;
        case 'add-afirm': q.afirmacoes.push({ texto: '', valor: true }); break;
        case 'rm-afirm': q.afirmacoes.splice(idx, 1); break;
        case 'add-par': q.pares.push({ a: '', b: '' }); break;
        case 'rm-par': q.pares.splice(idx, 1); break;
        case 'add-item': q.itens.push(''); break;
        case 'rm-item': q.itens.splice(idx, 1); break;
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
            <p class="text-sm text-slate-300">Suas respostas são salvas automaticamente. A prova só é enviada quando você clicar em "Enviar prova".</p>
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
        case 'dissertativa': return '';
        default: return null;
    }
}

export function renderProva(area, { avalId, uid, aval, questoes, onTroca, onEnviado }) {
    const chave = `prova_rascunho_${avalId}_${uid}`;
    let respostas = {};
    try { respostas = JSON.parse(localStorage.getItem(chave) || '{}'); } catch (_) { respostas = {}; }
    questoes.forEach(q => { if (respostas[q.id] === undefined) respostas[q.id] = estadoInicial(q); });

    let trocas = 0;
    let ultimoEvento = 0;
    let statusTxt = 'Respostas salvas automaticamente';

    const salvar = () => {
        localStorage.setItem(chave, JSON.stringify(respostas));
        const agora = new Date();
        statusTxt = `Salvo às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        const el = area.querySelector('#prova-status');
        if (el) el.textContent = statusTxt;
    };

    const pintar = () => {
        area.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-6">
                <div class="flex flex-wrap justify-between gap-3 items-center">
                    <h4 class="text-white font-bold"><i class="fas fa-pen-alt text-blue-500 mr-2"></i> Prova</h4>
                    <div class="text-xs text-slate-400">
                        <span id="prova-status">${statusTxt}</span> ·
                        <span id="prova-trocas" class="text-red-400 font-bold">Saídas da aba: ${trocas}</span>
                    </div>
                </div>
                <div class="space-y-6">${questoes.map((q, i) => cardResposta(q, i, respostas[q.id])).join('')}</div>
                <div class="flex justify-end pt-4 border-t border-slate-700">
                    <button type="button" id="btn-enviar-prova" class="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg">Enviar prova</button>
                </div>
            </div>`;
    };

    area.onchange = (e) => {
        const t = e.target;
        const qid = t.dataset.qid;
        if (!qid || !t.dataset.tipo) return;
        switch (t.dataset.tipo) {
            case 'mc': respostas[qid] = t.value; break;
            case 'ms': {
                const atual = respostas[qid] || [];
                respostas[qid] = t.checked ? [...atual, t.value] : atual.filter(v => v !== t.value);
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
        if (t.dataset.tipo === 'texto') {
            respostas[t.dataset.qid] = t.value;
            salvar();
        }
    };

    area.onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'btn-enviar-prova') return enviar(btn);
        const acao = btn.dataset.acao;
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
            document.removeEventListener('visibilitychange', aoSair);
            window.removeEventListener('blur', aoSair);
            return;
        }
        if (!document.hidden && document.hasFocus()) return;
        const agora = Date.now();
        if (agora - ultimoEvento < 1500) return;
        ultimoEvento = agora;
        trocas++;
        const el = area.querySelector('#prova-trocas');
        if (el) el.textContent = `Saídas da aba: ${trocas}`;
        if (onTroca) onTroca();
    };
    document.addEventListener('visibilitychange', aoSair);
    window.addEventListener('blur', aoSair);

    async function enviar(btn) {
        if (!confirm('Enviar a prova? Depois do envio as respostas não podem ser alteradas.')) return;
        const textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
        try {
            const resultado = await enviarProva(avalId, respostas);
            localStorage.removeItem(chave);
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
    const cabecalho = `
        <div class="flex justify-between gap-3 items-start">
            <span class="text-xs font-bold text-blue-400 uppercase tracking-widest">Questão ${i + 1} · ${q.pontos} pt(s)</span>
        </div>
        <p class="text-slate-200 text-sm whitespace-pre-wrap">${esc(q.enunciado)}</p>`;

    let corpo = '';
    switch (q.tipo) {
        case 'multipla_escolha':
            corpo = (q.opcoes || []).map(o => `
                <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="r-${q.id}" data-qid="${q.id}" data-tipo="mc" value="${esc(o.id)}" ${resp === o.id ? 'checked' : ''} class="w-4 h-4 accent-blue-500">
                    <span>${esc(o.texto)}</span>
                </label>`).join('');
            break;
        case 'multipla_selecao':
            corpo = (q.opcoes || []).map(o => `
                <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" data-qid="${q.id}" data-tipo="ms" value="${esc(o.id)}" ${(resp || []).includes(o.id) ? 'checked' : ''} class="w-4 h-4 accent-blue-500">
                    <span>${esc(o.texto)}</span>
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
        default:
            corpo = `<textarea data-qid="${q.id}" data-tipo="texto" rows="4" placeholder="Escreva sua resposta" class="${CLASSE_INPUT}">${esc(resp || '')}</textarea>`;
    }

    return `<div class="space-y-3 border-b border-slate-800 pb-5 last:border-0">${cabecalho}<div class="space-y-2">${corpo}</div></div>`;
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
        default:
            return 'Questão dissertativa: correção do professor.';
    }
}

export function renderResultado(area, res, questoes) {
    const final = res.notaAtribuida !== null && res.notaAtribuida !== undefined;
    const nota = final ? res.notaAtribuida : res.notaParcial;
    const pendencia = res.pendentes > 0
        ? `<p class="text-amber-400 text-sm"><i class="fas fa-hourglass-half mr-1"></i> ${res.pendentes} questão(ões) aguardam correção do professor. A nota será atualizada quando ele concluir.</p>`
        : '';

    area.innerHTML = `
        <div class="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 space-y-4">
            <div class="flex flex-wrap justify-between items-center gap-3">
                <h4 class="text-emerald-400 font-bold"><i class="fas fa-check mr-2"></i> Prova enviada</h4>
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-sm font-bold">
                    ${final ? 'Nota final' : 'Nota parcial'}: ${nota ?? '—'}
                </span>
            </div>
            <p class="text-slate-300 text-sm">Pontos nas questões corrigidas: ${res.pontosObtidos} de ${res.pontosCorrigidos}.</p>
            ${pendencia}
            <div id="area-gabarito" class="space-y-4"></div>
        </div>`;

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
            const pts = d && d.obtidos !== undefined ? `${d.obtidos} de ${q.pontos}` : `${q.pontos} pt(s)`;
            return `
                <div class="bg-slate-900/80 border border-slate-700 rounded-xl p-4 space-y-2">
                    <div class="flex justify-between gap-3 text-xs font-bold uppercase tracking-widest">
                        <span class="text-blue-400">Questão ${i + 1}</span>
                        <span class="text-slate-400">${pts}</span>
                    </div>
                    <p class="text-sm text-slate-200">${esc(q.enunciado)}</p>
                    <p class="text-sm text-emerald-400"><b>Resposta:</b> ${esc(textoDoGabarito(docs[q.id] || { tipo: q.tipo }, q.gabarito))}</p>
                    ${q.explicacao ? `<p class="text-sm text-slate-400 whitespace-pre-line border-l-2 border-blue-500 pl-3">${esc(q.explicacao)}</p>` : ''}
                </div>`;
        }).join('')}`;
}
