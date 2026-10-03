/**
 * ============================================================================
 *  MANUTENÇÃO  +  PÁGINA DE ATUALIZAÇÕES
 * ============================================================================
 *  Objetivo
 *  --------
 *  1. Bloquear o site inteiro (sem interação com menus) quando a manutenção
 *     estiver ativa — exceto para quem é Admin ou Moderador.
 *  2. Permitir que o Admin ligue/desligue a manutenção sem editar código.
 *  3. Publicar, para alunos e professores, o registro técnico do que mudou
 *     (leitura do `changelog.json`, gerado a partir do `CHANGELOG.md`).
 *  4. Quando um novo deploy é detectado por um usuário privileged, o site
 *     **fecha sozinho** para todo mundo que não é Admin/Moderador.
 *
 *  Modelo de dados (Firestore)
 *  ---------------------------
 *  `site_status` / `maintenance`   (documento único — flag global)
 *      ativa        boolean
 *      titulo       string
 *      mensagem     string
 *      previsao     string
 *      imagemURL    string  (opcional; vazio = usa a imagem local do HTML)
 *      versaoDeploy string  (última versão do changelog já registrada)
 *      atualizadoEm Timestamp
 *      atualizadoPor string
 *
 *  `site_changelog` / {id}         (entradas publicadas pelo Admin)
 *      versao, data, titulo, escopo, secoes[], publicado, publicadoEm, publicadoPor
 *
 *  Fonte da verdade
 *  ----------------
 *  O `CHANGELOG.md` é a fonte da verdade (append-only). O `changelog.json` é
 *  apenas a versão estruturada dele, gerada por `tools/build_changelog.py`.
 *  As entradas do Firestore são um complemento opcional para quem não tem
 *  acesso ao repositório — as duas fontes são mescladas por versão.
 *
 *  Regra de segurança importante
 *  -----------------------------
 *  Se a leitura do Firestore falhar (regras de segurança, offline, etc.), o
 *  módulo assume **fail-open** (não bloqueia o site). Travar todo mundo por
 *  causa de um erro de rede seria pior do que o contrário.
 * ============================================================================
 */

import { db } from '../core/firebase.js';
import {
    doc, setDoc, onSnapshot, serverTimestamp,
    collection, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

// ============================================================================
//  CONSTANTES
// ============================================================================

const REF_MANUTENCAO = doc(db, 'site_status', 'maintenance');
const REF_CHANGELOG = collection(db, 'site_changelog');
const ARQ_CHANGELOG = './changelog.json';

const CHAVE_PAUSA = 'kz_mnt_pausa_login'; // sessão: login aberto a partir da capa
const NIVEL_CLASSE = {
    'CRÍTICO': 'critico', 'CRITICO': 'critico',
    'ALTO': 'alto',
    'MÉDIO': 'medio', 'MEDIO': 'medio',
    'BAIXO': 'baixo',
};

// ============================================================================
//  ESTADO
// ============================================================================

const estado = {
    // permissões (preenchidas por `aplicarPermissoes`, vindas do main.js)
    staff: false,
    rolesSalvos: null,       // cópia das permissões, para sair do preview
    logado: false,
    uid: null,
    email: null,
    nome: null,

    // configuração da manutenção
    ativa: false,
    config: null,
    erroLeitura: false,
    temDados: false,       // já veio alguma leitura válida do Firestore?

    // histórico
    versaoDeploy: null,      // `changelog.json` (o que está no ar agora)
    changelog: null,         // documento completo do changelog.json
    entradas: [],            // entradas mescladas (JSON + Firestore)
    verificado: false,       // já tentamos ler o Firestore?

    // ui
    pausaLogin: false,
    previewStaff: false,
    filtro: '',
    expandirTudo: false,
    renderizado: false,
    obsBarra: null,
};

let unsubManutencao = null;
let avisadoNovoDeploy = false;

// ============================================================================
//  HELPERS
// ============================================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** Escapa + aplica um subconjunto seguro de Markdown (negrito, itálico, código, link). */
function mdInline(bruto) {
    if (!bruto) return '';
    let s = escapeHTML(String(bruto));

    // ```código```
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // **negrito**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *itálico* / _itálico_
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    // [texto](https://...)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    return s;
}

/** Versão segura do DOMPurify, quando disponível no index.html. */
function sanitizar(html) {
    const purify = window.DOMPurify;
    if (!purify || typeof purify.sanitize !== 'function') return html;
    return purify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
}

/** 2026-10-02 -> 02/10/2026 */
function dataBR(iso) {
    if (!iso) return '';
    const p = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!p) return String(iso);
    return `${p[3]}/${p[2]}/${p[1]}`;
}

function dataHoraBR(ts) {
    try {
        const d = typeof ts?.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : null);
        if (!d || isNaN(d)) return '';
        return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ''; }
}

function comTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
}

/** Prévias da imagem local: some com a camada se o arquivo não existir. */
function validarImagemLocal() {
    const el = $('#kz-mnt-bg');
    if (!el) return;
    const src = el.dataset.img;
    if (!src) { el.style.display = 'none'; return; }

    const teste = new Image();
    teste.onload = () => { el.style.backgroundImage = `url("${src}")`; };
    teste.onerror = () => {
        // Sem imagem: mantém o gradiente do próprio CSS e avisa no console.
        el.style.display = 'none';
        console.warn(`[Manutenção] Imagem "${src}" não encontrada. Usando o fundo padrão.`);
    };
    teste.src = src;
}

// ============================================================================
//  LEITURA DO CHANGELOG
// ============================================================================

async function carregarChangelogLocal() {
    try {
        const resp = await comTimeout(fetch(ARQ_CHANGELOG, { cache: 'no-cache' }), 8000);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const docJson = await resp.json();

        estado.changelog = docJson;
        estado.versaoDeploy = docJson?.versaoAtual || null;
        mesclarEntradas();
        return docJson;
    } catch (e) {
        console.warn('[Manutenção] Não foi possível ler o changelog.json:', e.message);
        estado.changelog = null;
        estado.versaoDeploy = null;
        mesclarEntradas();
        return null;
    }
}

async function carregarChangelogFirestore() {
    try {
        const snap = await comTimeout(getDocs(query(REF_CHANGELOG, orderBy('data', 'desc'))), 8000);
        estado.entradasFirestore = snap.docs
            .map(d => ({ id: d.id, origem: 'firestore', ...d.data() }))
            .filter(e => e.publicado !== false);
        mesclarEntradas();
    } catch (e) {
        // Sem permissão ou offline: seguimos só com o changelog.json.
        console.warn('[Manutenção] Coleção site_changelog indisponível:', e.message);
        estado.entradasFirestore = [];
    }
}

/** Junta as duas fontes removendo versões repetidas (JSON tem prioridade). */
function mesclarEntradas() {
    const doJson = (estado.changelog?.entradas || []).map(e => ({ ...e, origem: 'deploy' }));
    const doFs = estado.entradasFirestore || [];

    const mapa = new Map();
    doJson.forEach(e => mapa.set(String(e.versao), e));
    doFs.forEach(e => { if (!mapa.has(String(e.versao))) mapa.set(String(e.versao), e); });

    estado.entradas = [...mapa.values()].sort((a, b) => semver(b.versao) - semver(a.versao));
}

function semver(v) {
    const p = String(v || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    return (p[0] || 0) * 1e6 + (p[1] || 0) * 1e3 + (p[2] || 0);
}

// ============================================================================
//  APLICAÇÃO DE ESTADO (overlay, trava, faixa)
// ============================================================================

/** O site está bloqueado para este usuário? */
function bloqueado() {
    return estado.ativa && !estado.staff && !estado.pausaLogin;
}

/** Deve existir overlay visível agora? */
function overlayVisivel() {
    return estado.ativa && !estado.staff;
}

function aplicarEstado() {
    const body = document.body;
    const overlay = $('#kz-mantencao');
    const barra = $('#kz-mntbar');
    const mostrarOverlay = overlayVisivel();
    const mostrarBarra = estado.ativa && estado.staff;
    const travado = mostrarOverlay && !estado.pausaLogin;

    body.classList.toggle('kz-locked', travado);
    body.classList.toggle('kz-mntbar-on', mostrarBarra);
    overlay?.classList.toggle('is-on', mostrarOverlay && !estado.pausaLogin);
    overlay?.setAttribute('aria-hidden', mostrarOverlay ? 'false' : 'true');
    barra?.classList.toggle('is-on', mostrarBarra);

    // `inert` é atributo, não propriedade CSS. Sem ele, o Tab ainda alcançaria
    // os menus por baixo do overlay (o pointer já é cortado pelo CSS).
    ['#app-main', 'header', '#player-master-container', '#mobile-menu-container']
        .forEach(sel => $$(sel).forEach(el => el.toggleAttribute('inert', travado)));

    if (mostrarOverlay && !estado.pausaLogin) montarOverlay();
    if (mostrarBarra) { montarBarra(); medirBarra(); }
    atualizarPainelAdmin();
}

/**
 * A faixa quebra em duas linhas no celular, então a altura precisa ser
 * medida de verdade. Publicamos em `--kz-mntbar-h`, consumido pelo CSS,
 * e re-medimos em toda troca de conteúdo e em qualquer redimensionamento.
 */
function medirBarra() {
    const barra = $('#kz-mntbar');
    if (!barra) return;
    const aplicar = () => {
        const h = Math.round(barra.getBoundingClientRect().height);
        if (h > 0) document.documentElement.style.setProperty('--kz-mntbar-h', h + 'px');
    };
    aplicar();
    if (!estado.obsBarra && typeof ResizeObserver !== 'undefined') {
        estado.obsBarra = new ResizeObserver(aplicar);
        estado.obsBarra.observe(barra);
    }
}

function montarOverlay() {
    const cfg = estado.config || {};
    const versaoAtual = estado.versaoDeploy;
    const entry = versaoAtual ? estado.entradas.find(e => String(e.versao) === String(versaoAtual)) : null;

    setTexto('#kz-mnt-titulo', cfg.titulo || 'Site em manutenção');
    setTexto('#kz-mnt-texto', cfg.mensagem ||
        'Estamos aplicando melhorias no site. Tudo voltará ao normal em instantes — ' +
        'seus dados e seu histórico estão intactos.');

    // Chips: versão em andamento + previsão
    const meta = $('#kz-mnt-meta');
    if (meta) {
        const chips = [];
        if (versaoAtual) chips.push(`<span class="kz-chip kz-chip--live">v${escapeHTML(versaoAtual)} em andamento</span>`);
        if (cfg.previsao) chips.push(`<span class="kz-chip">Previsão: ${escapeHTML(cfg.previsao)}</span>`);
        if (cfg.atualizadoPor) chips.push(`<span class="kz-chip">Publicado por ${escapeHTML(cfg.atualizadoPor)}</span>`);
        if (cfg.atualizadoEm) chips.push(`<span class="kz-chip">${escapeHTML(dataHoraBR(cfg.atualizadoEm))}</span>`);
        meta.innerHTML = chips.join('');
    }

    // Resumo técnico do que está sendo feito (espelha o changelog.json)
    const corpo = $('#kz-mnt-upd-body');
    if (corpo) {
        if (entry) {
            corpo.innerHTML = sanitizar(resumoEntrada(entry, true));
        } else {
            corpo.innerHTML = `<p class="kz-upd__p">Detalhes técnicos completos na página de Atualizações.</p>`;
        }
    }
}

/** Versão enxuta de uma entrada, usada dentro da capa de manutenção. */
function resumoEntrada(entry, curto = false) {
    const out = [];
    if (entry.escopo) out.push(`<p class="kz-upd__escopo">${mdInline(entry.escopo)}</p>`);

    const secoes = (entry.secoes || []).filter(s => s.chave !== 'escopo' && s.chave !== 'arquivos tocados');
    const limite = curto ? 3 : 99;

    for (const s of secoes.slice(0, limite)) {
        const linhas = [];
        for (const b of (s.blocos || [])) {
            const tagNivel = b.nivel && NIVEL_CLASSE[b.nivel]
                ? `<span class="kz-upd__lvl kz-upd__lvl--${NIVEL_CLASSE[b.nivel]}">${escapeHTML(b.nivel)}</span>` : '';
            linhas.push(
                `<div class="kz-upd__block">
                    ${b.titulo || tagNivel ? `<h4 class="kz-upd__blocktitle">${tagNivel}<span>${mdInline(b.titulo)}</span></h4>` : ''}
                    ${b.linhas?.length ? `<ul class="kz-upd__ul">${b.linhas.map(([t, txt]) =>
                        `<li class="kz-upd__li">${t === 'li' ? mdInline(txt) : mdInline(txt)}</li>`).join('')}</ul>` : ''}
                    ${(b.codigo || []).map(c => `<pre class="kz-upd__pre">${escapeHTML(c)}</pre>`).join('')}
                </div>`
            );
        }
        if (!linhas.length && s.linhas?.length) {
            linhas.push(`<ul class="kz-upd__ul">${s.linhas.map(([, txt]) =>
                `<li class="kz-upd__li">${mdInline(txt)}</li>`).join('')}</ul>`);
        }
        if (linhas.length) {
            out.push(`<section class="kz-upd__sec">
                <h3 class="kz-upd__sectitle">${escapeHTML(s.titulo)}</h3>
                ${linhas.join('')}
            </section>`);
        }
    }
    return out.join('');
}

function montarBarra() {
    const barra = $('#kz-mntbar');
    if (!barra) return;
    const v = estado.versaoDeploy;
    const aviso = avisadoNovoDeploy
        ? `<span class="kz-mntbar__label"><span class="kz-mntbar__dot"></span> Manutenção ligada automaticamente — deploy v${escapeHTML(v)}</span>`
        : `<span class="kz-mntbar__label"><span class="kz-mntbar__dot"></span> Modo manutenção ativo — você tem acesso normal</span>`;

    barra.innerHTML = sanitizar(`
        ${aviso}
        <button type="button" class="kz-mntbar__btn kz-mntbar__btn--off" data-mnt-act="off">
            <i class="fas fa-lock-open"></i> Encerrar manutenção
        </button>
        <button type="button" class="kz-mntbar__btn" data-mnt-act="preview">
            <i class="fas fa-eye"></i> Ver como visitante
        </button>
        <button type="button" class="kz-mntbar__btn" data-mnt-act="goto">
            <i class="fas fa-list-ul"></i> Atualizações
        </button>
    `);
}

function setTexto(sel, txt) {
    const el = $(sel);
    if (el) el.textContent = txt;
}

// ============================================================================
//  PÁGINA DE ATUALIZAÇÕES
// ============================================================================

export function renderAtualizacoesTab() {
    const host = $('#atualizacoes-content');
    if (!host) return;

    if (!estado.renderizado) {
        host.innerHTML = `
            <div class="kz-upd__shell">
                <div class="kz-panel" style="padding:0;flex:0 0 auto">
                    <div class="kz-toolbar" style="border:0;padding:clamp(.7rem,2vw,1.1rem) clamp(.8rem,2.4vw,1.4rem)">
                        <div class="min-w-0">
                            <h2 class="kz-upd__headtitle" style="font-size:.9rem">
                                <i class="fas fa-code-branch text-blue-500 mr-2"></i>Registro de Atualizações
                            </h2>
                            <p class="kz-upd__p" style="margin:.15rem 0 0" id="kz-upd-sub"></p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <label class="kz-search" style="width:min(15rem,42vw)">
                                <i class="kz-search__icon fas fa-magnifying-glass"></i>
                                <input type="search" id="kz-upd-busca" placeholder="Buscar no histórico…"
                                    aria-label="Buscar no histórico de atualizações">
                            </label>
                            <button type="button" class="kz-btn shrink-0" id="kz-upd-expandir"
                                title="Expandir ou recolher todas as entradas">
                                <i class="fas fa-list-ul"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <!-- Slot próprio do painel do Admin: NÃO pode ficar dentro de
                     #kz-upd-feed, porque renderFeed() reescreve o innerHTML dele. -->
                <div id="kz-upd-admin-slot" class="shrink-0"></div>
                <div class="kz-upd__feed" id="kz-upd-feed"></div>
            </div>
        `;

        host.querySelector('#kz-upd-busca')?.addEventListener('input', (ev) => {
            estado.filtro = ev.target.value.trim().toLowerCase();
            renderFeed();
        });
        host.querySelector('#kz-upd-expandir')?.addEventListener('click', () => {
            estado.expandirTudo = !estado.expandirTudo;
            renderFeed();
        });

        estado.renderizado = true;
    }

    renderFeed();
    renderSubtitulo();
    atualizarPainelAdmin();
}

function renderSubtitulo() {
    const el = $('#kz-upd-sub');
    if (!el) return;
    const n = estado.entradas.length;
    el.textContent = estado.versaoDeploy
        ? `Versão no ar: v${estado.versaoDeploy} · ${n} ${n === 1 ? 'entrada' : 'entradas'} no histórico técnico`
        : `${n} ${n === 1 ? 'entrada' : 'entradas'} no histórico técnico`;
}

function renderFeed() {
    const feed = $('#kz-upd-feed');
    if (!feed) return;

    renderSubtitulo();

    const todas = estado.entradas;
    const termo = estado.filtro;
    const lista = termo
        ? todas.filter(e => JSON.stringify(e).toLowerCase().includes(termo))
        : todas;

    const partes = [];

    if (termo) {
        partes.push(`<div class="kz-upd__p" style="padding:.35rem 0">
            ${lista.length} resultado(s) para <strong>${escapeHTML(termo)}</strong>
            &nbsp;·&nbsp; <button type="button" class="kz-btn" data-upd-limpar>limpar</button>
        </div>`);
    }

    if (!lista.length) {
        partes.push(termo
            ? `<div class="kz-empty"><i class="fas fa-magnifying-glass"></i><p>Nada encontrado</p></div>`
            : `<div class="kz-empty"><i class="fas fa-book-open"></i><p>Histórico ainda vazio</p></div>`);
    } else {
        lista.forEach((e, i) => {
            const aberta = termo ? true : (estado.expandirTudo || i === 0);
            const ehAtual = estado.versaoDeploy && String(e.versao) === String(estado.versaoDeploy);
            partes.push(`
                <article class="kz-upd__entry${aberta ? ' is-open' : ''}${ehAtual ? ' is-current' : ''}"
                    data-versao="${escapeHTML(String(e.versao))}">
                    <button type="button" class="kz-upd__head" aria-expanded="${aberta}">
                        <span class="kz-upd__ver">v${escapeHTML(String(e.versao))}</span>
                        ${ehAtual ? '<span class="kz-chip is-on">no ar</span>' : ''}
                        <span class="kz-upd__headtitle truncate">${mdInline(e.titulo || 'Atualização')}</span>
                        <span class="kz-upd__date">${escapeHTML(dataBR(e.data))}</span>
                        <i class="fas fa-chevron-down kz-upd__chev"></i>
                    </button>
                    <div class="kz-upd__body">
                        ${resumoEntrada(e)}
                        ${(e.arquivos || []).length ? `<div class="kz-upd__files">${e.arquivos.map(f =>
                            `<span class="kz-upd__file">${escapeHTML(f)}</span>`).join('')}</div>` : ''}
                    </div>
                </article>
            `);
        });
    }

    feed.innerHTML = sanitizar(partes.join(''));

    // acordeões
    feed.querySelectorAll('.kz-upd__head').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.kz-upd__entry');
            const aberto = card.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', String(aberto));
        });
    });
    feed.querySelector('[data-upd-limpar]')?.addEventListener('click', () => {
        estado.filtro = '';
        const busca = $('#kz-upd-busca');
        if (busca) busca.value = '';
        renderFeed();
    });
}

// ============================================================================
//  PAINEL DO ADMIN
// ============================================================================

/**
 * O painel depende de `staff`, `ativa` e `config`, que mudam fora do ciclo de
 * render da página. `aplicarEstado()` chama esta função sempre que o estado
 * muda; se o usuário não estiver na aba de Atualizações, o slot nem existe e
 * nada acontece.
 */
function atualizarPainelAdmin() {
    const slot = $('#kz-upd-admin-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (!estado.staff) return;   // só Admin/Moderador enxergam o painel
    renderPainelAdmin(slot);
}

function renderPainelAdmin(slot) {
    const cfg = estado.config || {};
    const detectado = estado.versaoDeploy &&
        String(cfg.versaoDeploy || '') !== String(estado.versaoDeploy);

    const painel = document.createElement('section');
    painel.id = 'kz-adm';
    painel.className = 'kz-adm';
    painel.innerHTML = sanitizar(`
        <div class="kz-adm__status ${estado.ativa ? 'kz-adm__status--on' : 'kz-adm__status--off'}">
            <i class="fas ${estado.ativa ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
            ${estado.ativa ? 'Site fechado para alunos e professores' : 'Site aberto para todos'}
        </div>

        ${detectado ? `
        <div class="kz-adm__hint" style="border-left:3px solid #f59e0b;padding-left:.7rem;color:#fcd34d">
            <strong>Deploy novo detectado:</strong> o site no ar está na versão
            <strong>v${escapeHTML(estado.versaoDeploy)}</strong>, mas a última versão registrada aqui é
            <strong>${cfg.versaoDeploy ? 'v' + escapeHTML(String(cfg.versaoDeploy)) : 'nenhuma'}</strong>.
            A manutenção é <strong>ligada automaticamente</strong> assim que você abrir o site.
        </div>` : ''}

        <label class="kz-switch">
            <input type="checkbox" id="kz-adm-switch" ${estado.ativa ? 'checked' : ''}
                aria-label="Ativar manutenção">
            <span class="kz-switch__track"></span>
            <span class="text-xs font-extrabold uppercase tracking-widest ${estado.ativa ? 'text-amber-400' : 'text-emerald-400'}">
                ${estado.ativa ? 'Manutenção ligada' : 'Manutenção desligada'}
            </span>
        </label>

        <div class="kz-adm__row">
            <label class="sr-only" for="kz-adm-titulo">Título</label>
            <input class="kz-select" style="flex:1 1 14rem" id="kz-adm-titulo" placeholder="Título (ex.: Atualizando o Conteúdos)"
                value="${escapeHTML(cfg.titulo || '')}" maxlength="90">
            <label class="sr-only" for="kz-adm-previsao">Previsão</label>
            <input class="kz-select" style="flex:0 1 11rem" id="kz-adm-previsao" placeholder="Previsão (ex.: 20 min)"
                value="${escapeHTML(cfg.previsao || '')}" maxlength="40">
        </div>

        <label class="sr-only" for="kz-adm-msg">Mensagem</label>
        <textarea id="kz-adm-msg" rows="2" maxlength="400"
            placeholder="Mensagem exibida aos alunos (opcional)"
            style="width:100%;background:#020617;border:1px solid #1e293b;border-radius:.7rem;color:#e2e8f0;padding:.65rem .8rem;font-size:.76rem;resize:vertical">${escapeHTML(cfg.mensagem || '')}</textarea>

        <div class="kz-adm__row">
            <button type="button" class="kz-btn kz-btn--accent" data-adm-act="salvar">
                <i class="fas fa-floppy-disk"></i> Salvar textos
            </button>
            <button type="button" class="kz-btn" data-adm-act="preview">
                <i class="fas fa-eye"></i> Pré-visualizar página
            </button>
            <span class="kz-adm__hint kz-btn--ml" id="kz-adm-status"></span>
        </div>

        <p class="kz-adm__hint">
            O que já está no ar (v${escapeHTML(estado.versaoDeploy || '—')}) vem do arquivo
            <code>changelog.json</code>, gerado de <code>CHANGELOG.md</code> pelo script
            <code>python tools/build_changelog.py</code>. Depois do deploy, a primeira pessoa
            Admin/Moderador que abrir o site registra a nova versão e fecha a manutenção
            para todo mundo — é esse o gatilho automático.
        </p>
    `);

    slot.appendChild(painel);

    painel.querySelector('#kz-adm-switch')?.addEventListener('change', async (ev) => {
        await definirManutencao(ev.target.checked);
    });
    painel.querySelectorAll('[data-adm-act]').forEach(btn => {
        btn.addEventListener('click', () => acaoAdmin(btn.dataset.admAct));
    });
}

async function acaoAdmin(acao) {
    const status = $('#kz-adm-status');
    const dizer = (t, erro = false) => {
        if (status) {
            status.textContent = t;
            status.style.color = erro ? '#fca5a5' : '#4ade80';
        }
    };

    try {
        if (acao === 'salvar') {
            await updateDoc(REF_MANUTENCAO, {
                titulo: $('#kz-adm-titulo')?.value.trim() || 'Site em manutenção',
                previsao: $('#kz-adm-previsao')?.value.trim() || '',
                mensagem: $('#kz-adm-msg')?.value.trim() || '',
                versaoDeploy: estado.versaoDeploy || null,
                atualizadoEm: serverTimestamp(),
                atualizadoPor: estado.nome || estado.email || 'Admin',
            });
            dizer('Textos salvos.');
        }
        else if (acao === 'preview') {
            if (estado.previewStaff) return;
            estado.previewStaff = true;
            estado.staff = false;
            estado.pausaLogin = false;
            aplicarEstado();
            mostrarBotaoSairPreview();
        }
    } catch (e) {
        console.error('[Manutenção]', e);
        dizer('Falha ao salvar: ' + e.message, true);
    }
}

// ============================================================================
//  ESCRITA NO FIRESTORE
// ============================================================================

/** Liga/desliga a manutenção (chave global do site). */
export async function definirManutencao(ativa, extra = {}) {
    try {
        await setDoc(REF_MANUTENCAO, {
            ativa: !!ativa,
            titulo: extra.titulo ?? (estado.config?.titulo ?? 'Site em manutenção'),
            mensagem: extra.mensagem ?? (estado.config?.mensagem ?? ''),
            previsao: extra.previsao ?? (estado.config?.previsao ?? ''),
            versaoDeploy: estado.versaoDeploy ?? null,
            atualizadoEm: serverTimestamp(),
            atualizadoPor: estado.nome || estado.email || 'Admin',
            ...(extra.patch || {}),
        }, { merge: true });

        // A gravação é uma leitura garantida: a partir daqui, falhas de rede
        // passam a preservar o estado em vez de destravar o site.
        estado.temDados = true;
        estado.erroLeitura = false;
        avisadoNovoDeploy = false;
        return true;
    } catch (e) {
        console.error('[Manutenção] Falha ao gravar o estado:', e);
        return false;
    }
}

/**
 * Registra a versão que está no ar. É o "gatilho automático": quando um
 * usuário privileged detecta que o `changelog.json` é mais novo do que a
 * versão registrada, a manutenção é ligada na hora.
 */
async function sincronizarDeployDetectado() {
    if (!estado.staff) return;
    if (!estado.versaoDeploy || !estado.verificado) return;

    const registrada = estado.config?.versaoDeploy;
    if (String(registrada || '') === String(estado.versaoDeploy)) return;

    console.info(`[Manutenção] Deploy v${estado.versaoDeploy} detectado (registrado: ${registrada || 'nenhum'}). Fechando o site.`);
    await definirManutencao(true);
    avisadoNovoDeploy = true;
}

// ============================================================================
//  OBSERVADORES
// ============================================================================

function observarManutencao() {
    if (unsubManutencao) return;
    unsubManutencao = onSnapshot(
        REF_MANUTENCAO,
        (snap) => {
            estado.verificado = true;
            estado.temDados = true;
            estado.erroLeitura = false;
            estado.config = snap.exists() ? snap.data() : null;
            estado.ativa = estado.config?.ativa === true;

            aplicarEstado();
            sincronizarDeployDetectado();
        },
        (err) => {
            estado.erroLeitura = true;
            estado.verificado = true;

            // Fail-open **só enquanto o estado é desconhecido**. Depois que veio
            // uma leitura válida, manter o último estado conhecido é o certo:
            // uma queda de rede não pode destravar o site nem alargar o acesso.
            if (estado.temDados) {
                console.warn('[Manutenção] Leitura interrompida; mantendo o último estado conhecido:', err.message);
                return;
            }

            estado.ativa = false;
            console.warn('[Manutenção] Não foi possível ler site_status/maintenance. Site liberado (fail-open):', err.message);
            aplicarEstado();
        }
    );
}

// ============================================================================
//  API PÚBLICA / BOOT
// ============================================================================

/**
 * Chamado pelo `js/main.js` a cada mudança de estado de autenticação.
 * `roles` é o objeto `userRoles` do main.js (Admin/Professor/Coordenacao/
 * Moderador/Aluno/Visitante) — é a única fonte de verdade de permissão.
 */
export function aplicarPermissoes(roles, info = {}) {
    estado.staff = !!(roles?.Admin || roles?.Moderador);
    estado.rolesSalvos = roles ? { ...roles } : null;
    estado.logado = !!info?.logado;
    estado.uid = info?.uid || null;
    estado.email = info?.email || null;
    estado.nome = info?.nome || info?.email || null;

    // Sai do modo "ver como visitante" assim que a sessão muda.
    estado.pausaLogin = false;
    try { sessionStorage.removeItem(CHAVE_PAUSA); } catch { /* ignora */ }

    if (estado.staff) {
        if (estado.verificado) sincronizarDeployDetectado();
        else observarManutencao();
    }

    aplicarEstado();
    if (estado.renderizado) renderFeed();
}

/**
 * Usado pelo roteador do `main.js`: decide se a navegação deve ser
 * desviada. Retorna `true` quando o usuário tentou sair da tela de login
 * enquanto o site está fechado — aí o overlay volta imediatamente.
 */
export function bloqueiaNavegacao(tabId) {
    if (!estado.ativa || estado.staff) return false;
    if (tabId === 'login') {
        // Permite entrar para verificar se é Admin/Moderador.
        estado.pausaLogin = true;
        try { sessionStorage.setItem(CHAVE_PAUSA, '1'); } catch { /* ignora */ }
        aplicarEstado();
        return false;
    }
    return true;
}

/** Encerra o modo de login aberto a partir da capa. */
export function fecharPausa() {
    estado.pausaLogin = false;
    try { sessionStorage.removeItem(CHAVE_PAUSA); } catch { /* ignora */ }
    aplicarEstado();
}

/** Ponto de entrada. Deve ser chamado uma vez, no boot do `main.js`. */
export async function iniciarManutencao() {
    try { estado.pausaLogin = sessionStorage.getItem(CHAVE_PAUSA) === '1'; } catch { /* ignora */ }

    validarImagemLocal();
    ligarEventosCapa();
    await carregarChangelogLocal();
    observarManutencao();
    await carregarChangelogFirestore();

    aplicarEstado();
    console.info(`[Manutenção] v${estado.versaoDeploy || '—'} · ${estado.entradas.length} entrada(s) · ` +
        `staff=${estado.staff}${estado.erroLeitura ? ' · falha de leitura (fail-open)' : ''}`);
}

function ligarEventosCapa() {
    const capa = $('#kz-mantencao');
    if (capa && !capa.dataset.wired) {
        capa.dataset.wired = '1';
        capa.querySelector('[data-mnt-act="login"]')?.addEventListener('click', () => {
            estado.pausaLogin = true;
            try { sessionStorage.setItem(CHAVE_PAUSA, '1'); } catch { /* ignora */ }
            aplicarEstado();
            window.showTab?.('login');
        });
        capa.querySelector('[data-mnt-act="atualizacoes"]')?.addEventListener('click', () => {
            window.showTab?.('atualizacoes');
        });
    }

    // A faixa do Admin/Moderador é reconstruída a cada estado, então delegamos.
    const barra = $('#kz-mntbar');
    if (barra && !barra.dataset.wired) {
        barra.dataset.wired = '1';
        barra.addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-mnt-act]');
            if (!btn) return;
            const acao = btn.dataset.mntAct;

            if (acao === 'off') {
                await definirManutencao(false);
                avisadoNovoDeploy = false;
            } else if (acao === 'preview') {
                if (estado.previewStaff) return;      // já está no preview
                estado.previewStaff = true;
                estado.staff = false;
                estado.pausaLogin = false;
                aplicarEstado();
                mostrarBotaoSairPreview();
            } else if (acao === 'goto') {
                window.showTab?.('atualizacoes');
            }
        });
    }
}

/** Botão de saída do modo "ver como visitante" (restrito ao Admin/Moderador). */
function mostrarBotaoSairPreview() {
    if (document.querySelector('[data-mnt-sair]')) return;

    const sair = document.createElement('button');
    sair.className = 'kz-mntbar__btn kz-mntbar__sair';
    sair.dataset.mntSair = '1';
    sair.innerHTML = '<i class="fas fa-arrow-left"></i> Sair do preview';
    sair.addEventListener('click', () => {
        sair.remove();
        estado.previewStaff = false;
        aplicarPermissoes(estado.rolesSalvos || { Moderador: true }, {
            logado: estado.logado,
            uid: estado.uid,
            email: estado.email,
            nome: estado.nome,
        });
    });

    document.body.appendChild(sair);
}

// API exposta para o HTML e para o roteador do main.js
window.manutencaoAPI = {
    iniciarManutencao,
    aplicarPermissoes,
    renderAtualizacoesTab,
    definirManutencao,
    bloqueiaNavegacao,
    fecharPausa,
    get estado() { return estado; },
};