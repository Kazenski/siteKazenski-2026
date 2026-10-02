import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, getDocs, setDoc, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

/* ==========================================================================
   ACERVO ACADÊMICO — redesign "Spotify" (materiais / músicas / podcasts)
   --------------------------------------------------------------------------
   Regras estruturais do novo layout (index.html + style.css):

   • Cada sub-categoria vive em `.kz-panel` (coluna flex, 100% da largura,
     `min-height: 0` + `overflow: hidden`). É ESSENCIAL que tudo dentro
     respeite `min-width: 0`, senão o painel cresce e corta a lateral direita.
   • Músicas e Podcasts usam `.kz-split`:
       <aside class="kz-list-pane"> lista compacta (canônico Spotify)
       <div class="kz-now">           painel "tocando agora" (capa + letra)
     Em >=1024px ficam lado a lado; abaixo disso empilham.
   • O player global virou um DOCK de largura total (`.kz-player-dock`), com
     barra de progresso fina no topo (`--kz-dock-progress`).

   Nenhuma API pública foi removida: `window.conteudosAPI` continua com os
   mesmos métodos usados por index.html e pelos demais módulos.
   ========================================================================== */

let currentUser = null;
let materialsCache = [];
let filteredMaterials = [];
let musicasGrimorio = [];
let podcastsGrimorio = [];

let activeAudioList = [];
let activeType = null;              // 'musica' | 'podcast' (fonte da fila atual)
let currentIdx = -1;
let currentPlayingId = null;
let currentMaterialEditId = null;

let isShuffle = false;
let repeatMode = 0;                // 0 = off, 1 = repetir tudo, 2 = repetir 1

let currentPage = 1;
const materialsPerPage = 21;
let disciplineMap = {};

let els = {};
let listenersBound = false;        // evita duplicar listeners em re-renders

/* ---- Utilidades internas ------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

/** Agrupa chamadas em um único quadro de animação (evita reflow por tecla digitada). */
function rafThrottle(fn) {
    let queued = false, lastArgs = null;
    return (...args) => {
        lastArgs = args;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
    };
}

function normalize(v) { return String(v == null ? '' : v).trim(); }

/** Remove acentos para que a busca por texto funcione sem diacriticos. */
function deburr(v) {
    return normalize(v)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function formatSeg(s) {
    if (isNaN(s) || s < 0) return "0:00";
    const min = Math.floor(s / 60);
    const seg = Math.floor(s % 60);
    return `${min}:${seg.toString().padStart(2, '0')}`;
}

/* ==========================================================================
   BOOT
   ========================================================================== */

export async function renderConteudosTab() {
    mapearDOM();

    setupSubTabs();                 // abas + botão "+ Novo"
    setupToolbar();                 // busca/filtros (debounce)
    setupPlayerEventListeners();    // dock (idempotente)
    injetarChipFavoritos();

    // Listeners do banco já disparam: a aba fica utilizável imediatamente.
    initMateriais();
    initMusicas();
    initPodcasts();

    // Perfil + listas de disciplina/professor são Complementares e podem
    // demorar: não bloqueiam a renderização.
    carregarUsuarioEComplementos();

    syncPlayButtons();
}

async function carregarUsuarioEComplementos() {
    if (auth.currentUser) {
        try {
            const snap = await comTimeout(getDoc(doc(db, "users", auth.currentUser.uid)), 8000);
            if (snap.exists()) {
                currentUser = { uid: snap.id, ...snap.data() };
                if (!currentUser.favoritos) currentUser.favoritos = [];
            }
        } catch (e) {
            console.warn("Perfil não carregado; entrando como visitante.", e?.message || e);
        }
    } else {
        currentUser = null;
    }

    aplicarPermissoes();
    renderMaterials();
    await setupFiltros();
}

function mapearDOM() {
    els = {
        // Painéis de administração
        adminMat: $('cont-admin-mat'),
        adminMus: $('cont-admin-mus'),
        adminPod: $('cont-admin-pod'),

        btnToggleAdmin: $('btn-toggle-admin-cont'),

        // Formulários
        formMat: $('form-material'),
        formMus: $('form-music'),
        formPod: $('form-podcast'),

        // Grades / listas
        matGrid: $('cont-mat-grid'),
        matPagination: $('cont-mat-pagination'),
        musList: $('music-list-ul'),
        podList: $('podcast-list-ul'),

        // Filtros
        searchMat: $('cont-search-mat'),
        filterDisc: $('cont-filter-disc'),
        filterProf: $('cont-filter-prof'),
        filterFav: $('cont-filter-fav'),
        searchMus: $('search-music-input'),
        searchPod: $('search-podcast-input'),

        // Contadores
        musicCount: $('music-count'),
        musicCountSm: $('music-count-sm'),
        podcastCount: $('podcast-count'),
        podcastCountSm: $('podcast-count-sm'),

        // Áreas "tocando agora"
        musicNow: $('music-now-pane'),
        podNow: $('podcast-now-pane'),
        musicPlaceholder: $('music-placeholder'),
        musicDetails: $('music-details-view'),
        podPlaceholder: $('podcast-placeholder'),
        podDetails: $('podcast-details-view'),

        // Player (dock)
        playerBox: $('global-audio-player'),
        audioEngine: $('audio-engine'),
        btnPlayPause: $('btn-play-pause'),
        progressBar: $('player-progress-bar'),
        progressFill: $('player-progress-fill'),
        progress: $('player-progress'),
        volume: $('player-volume'),
        timeCurr: $('player-time-curr'),
        timeTotal: $('player-time-total'),
        thumb: $('player-thumb'),
        fallbackIcon: $('player-fallback-icon'),
        title: $('player-song-title'),
        artist: $('player-song-artist'),
        btnRepeat: $('btn-repeat'),
        btnShuffle: $('btn-shuffle'),

        // Pílula flutuante
        miniPlayerBox: $('mini-audio-player'),
        btnPlayPauseMini: $('btn-play-pause-mini'),
        miniPlayerThumb: $('mini-player-thumb'),
        miniPlayerIcon: $('mini-player-icon')
    };
}

function aplicarPermissoes() {
    const isStaff = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.Coordenacao);
    els.btnToggleAdmin?.classList.toggle('hidden', !isStaff);
}

/* ==========================================================================
   NAVEGAÇÃO ENTRE SUBCATEGORIAS
   ========================================================================== */

function setupSubTabs() {
    const btns = document.querySelectorAll('.cont-tab-btn');

    // Botão "+ Novo": abre/fecha o painel do formulário da aba ativa.
    els.btnToggleAdmin?.addEventListener('click', () => {
        const panelAtivo = document.querySelector('.cont-tab-content.active');
        if (!panelAtivo) return;
        const form = panelAtivo.querySelector('[id^="cont-admin-"]');
        if (!form) return;
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            form.querySelector('input, textarea, select')?.focus({ preventScroll: true });
        }
    });

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            ativarSubTab(targetId);
            fecharFormularios();
            ajustarPlayerParaAba(targetId);
        });
    });

    // Estado inicial coerente com o HTML.
    const inicial = document.querySelector('.cont-tab-btn.is-active')?.dataset.target
        || document.querySelector('.cont-tab-content.active')?.id?.replace('ctab-', '');
    if (inicial) ativarSubTab(inicial);
}

function ativarSubTab(targetId) {
    document.querySelectorAll('.cont-tab-btn').forEach(b => {
        const on = b.dataset.target === targetId;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.querySelectorAll('.cont-tab-content').forEach(p => {
        const on = p.id === `ctab-${targetId}`;
        // Usa a classe .active (display:flex vem do CSS, não de utilitário
        // Tailwind) para não conflitar com a especificidade do stylesheet.
        p.classList.toggle('active', on);
        p.classList.toggle('hidden', !on);
        p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
}

function fecharFormularios() {
    els.adminMat?.classList.add('hidden');
    els.adminMus?.classList.add('hidden');
    els.adminPod?.classList.add('hidden');
}

/** O dock só faz sentido quando há áudio; materiais nunca tocam nada. */
function ajustarPlayerParaAba(targetId) {
    if (!els.playerBox) return;
    if (targetId === 'materiais') {
        els.playerBox.classList.add('hidden');
    } else if (els.audioEngine?.src) {
        els.playerBox.classList.remove('hidden');
    }
    syncDockHeight();
}

/* ==========================================================================
   BARRA DE FERRAMENTAS (favoritos + listeners de busca)
   ========================================================================== */

function setupToolbar() {
    if (listenersBound) return;

    els.searchMat?.addEventListener('input', debounce(() => { currentPage = 1; renderMaterials(); }, 180));
    els.filterDisc?.addEventListener('change', () => { currentPage = 1; renderMaterials(); });
    els.filterProf?.addEventListener('change', () => { currentPage = 1; renderMaterials(); });
    els.searchMus?.addEventListener('input', debounce(renderMusicasList, 180));
    els.searchPod?.addEventListener('input', debounce(renderPodcastsList, 180));

    listenersBound = true;
}

/* ==========================================================================
   MÓDULO 1 — MATERIAIS DIDÁTICOS
   ========================================================================== */

/** Injeta o chip de favoritos na toolbar. Roda ANTES de qualquer rede,
    para que a aba ja fique utilizavel mesmo com Firestore lento/offline. */
function injetarChipFavoritos() {
    const toolbar = els.searchMat?.closest('.kz-toolbar');
    if (!toolbar || els.filterFav || $('cont-filter-fav')) return;

    const favBtn = document.createElement('button');
    favBtn.id = 'cont-filter-fav';
    favBtn.type = 'button';
    favBtn.className = 'kz-chip';
    favBtn.dataset.active = 'false';
    favBtn.innerHTML = '<i class="far fa-star"></i> Favoritos';
    favBtn.title = 'Mostrar apenas os materiais que você favoritou';
    favBtn.addEventListener('click', () => {
        if (!currentUser) { alert('Faça login no portal para acessar seus favoritos.'); return; }
        const on = favBtn.dataset.active !== 'true';
        favBtn.dataset.active = on ? 'true' : 'false';
        favBtn.classList.toggle('is-on', on);
        favBtn.innerHTML = on ? '<i class="fas fa-star"></i> Favoritos' : '<i class="far fa-star"></i> Favoritos';
        currentPage = 1;
        renderMaterials();
    });
    toolbar.appendChild(favBtn);
    els.filterFav = favBtn;
}

/** Nao deixa uma promessa travada (rede morta) bloquear a renderizacao. */
function comTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
}

async function setupFiltros() {
    injetarChipFavoritos();

    let discHtml = '<option value="">Todas as Disciplinas</option>';
    let profHtml = '<option value="">Todos os Professores</option>';

    try {
        const dSnap = await comTimeout(getDocs(collection(db, "disciplinasCadastradas")), 7000);
        dSnap.forEach(d => {
            const nome = d.data().nomeExibicao || d.data().nome;
            disciplineMap[d.data().identificador] = nome;
            discHtml += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
        });
    } catch (e) {
        console.warn("Disciplinas indisponíveis (visitante ou rede lenta).", e?.message || e);
    }

    try {
        const pSnap = await comTimeout(getDocs(query(collection(db, "users"), where("Professor", "==", true))), 7000);
        pSnap.forEach(p => {
            const nome = p.data().nome;
            profHtml += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
        });
    } catch (e) {
        console.warn("Professores indisponíveis (visitante ou rede lenta).", e?.message || e);
    }

    if (els.filterDisc) els.filterDisc.innerHTML = discHtml;
    const selectAdd = $('mat-disciplina');
    if (selectAdd) selectAdd.innerHTML = discHtml.replace('<option value="">Todas as Disciplinas</option>', '');
    if (els.filterProf) els.filterProf.innerHTML = profHtml;
}

function initMateriais() {
    onSnapshot(query(collection(db, "materiaisDidaticos"), orderBy("dataCriacao", "desc")), (snap) => {
        materialsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMaterials();
    }, (err) => {
        console.error("Falha ao ler materiaisDidaticos:", err);
        if (els.matGrid && !materialsCache.length) {
            els.matGrid.innerHTML = `<div class="kz-empty">
                <i class="fas fa-wifi"></i>
                <p>Não foi possível carregar o acervo</p>
                <p style="text-transform:none;letter-spacing:0;font-weight:600;color:#1e293b">Verifique sua conexão e recarregue a página.</p>
            </div>`;
        }
    });

    // Campos extras de link
    $('btn-add-link')?.addEventListener('click', () => {
        const container = $('mat-link-inputs-container');
        if (!container) return;
        const input = document.createElement('input');
        input.type = 'url';
        input.className = 'link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none';
        input.placeholder = 'https://...';
        container.appendChild(input);
        input.focus();
    });

    els.formMat?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('btn-submit-mat');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const titulo = $('mat-titulo').value;
            const disciplina = $('mat-disciplina').value;
            const texto = $('mat-texto').value;
            const fileImg = $('mat-file-image').files[0];
            const filePdf = $('mat-file-pdf').files[0];
            const links = Array.from(document.querySelectorAll('.link-input')).map(i => i.value).filter(Boolean);

            let urlImage = null, urlPdf = null;
            const idDoc = currentMaterialEditId || Date.now().toString();

            if (fileImg) {
                const r = ref(storage, `materiais/${idDoc}_img`);
                await uploadBytes(r, fileImg);
                urlImage = await getDownloadURL(r);
            }
            if (filePdf) {
                const r = ref(storage, `materiais/${idDoc}_pdf`);
                await uploadBytes(r, filePdf);
                urlPdf = await getDownloadURL(r);
            }

            const dataToSave = { titulo, disciplina, texto, links, dataAtualizacao: serverTimestamp() };
            if (urlImage) dataToSave.urlImage = urlImage;
            if (urlPdf) dataToSave.urlPdf = urlPdf;

            if (currentMaterialEditId) {
                await setDoc(doc(db, "materiaisDidaticos", currentMaterialEditId), dataToSave, { merge: true });
                alert("Atualizado!");
            } else {
                dataToSave.autorNome = currentUser.nome;
                dataToSave.autorUID = currentUser.uid;
                dataToSave.dataCriacao = serverTimestamp();
                await addDoc(collection(db, "materiaisDidaticos"), dataToSave);
                alert("Salvo no Grimório!");
            }

            e.target.reset();
            currentMaterialEditId = null;
            btn.innerHTML = originalText;
            resetLinkInputs();
        } catch (err) {
            alert("Erro ao salvar.");
            console.error(err);
            btn.innerHTML = originalText;
        } finally {
            btn.disabled = false;
        }
    });
}

function resetLinkInputs() {
    const container = $('mat-link-inputs-container');
    if (!container) return;
    container.innerHTML = '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Fontes Externas (Links)</label>'
        + '<input type="url" class="link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none" placeholder="https://...">';
}

function renderMaterials() {
    if (!els.matGrid) return;

    const term = deburr(els.searchMat?.value);
    const fDisc = els.filterDisc?.value || '';
    const fProf = els.filterProf?.value || '';
    const showFavs = els.filterFav?.dataset.active === 'true';

    filteredMaterials = materialsCache.filter(m => {
        const matchText = !term
            || deburr(m.titulo).includes(term)
            || deburr(m.texto).includes(term)
            || deburr(m.disciplina).includes(term)
            || deburr(m.autorNome).includes(term);
        const matchDisc = !fDisc || m.disciplina === fDisc;
        const matchProf = !fProf || m.autorNome === fProf;
        const matchFav = !showFavs || !!(currentUser?.favoritos?.includes(m.id));
        return matchText && matchDisc && matchProf && matchFav;
    });

    const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / materialsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const items = filteredMaterials.slice((currentPage - 1) * materialsPerPage, currentPage * materialsPerPage);

    if (!items.length) {
        els.matGrid.innerHTML = `
            <div class="kz-empty">
                <i class="fas fa-box-open"></i>
                <p>Nenhum conhecimento encontrado</p>
                <p style="text-transform:none;letter-spacing:0;font-weight:600;color:#1e293b">
                    Ajuste a busca ou os filtros para ver mais resultados.
                </p>
            </div>`;
    } else {
        els.matGrid.innerHTML = items.map(mat => {
            const thumb = mat.urlImage
                ? `<img src="${escapeHTML(mat.urlImage)}" alt="" loading="lazy" decoding="async">`
                : `<i class="fas fa-scroll" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#1e293b;font-size:2rem"></i>`;
            const isFav = !!currentUser?.favoritos?.includes(mat.id);

            return `
            <button type="button" class="kz-mcard" data-mat="${escapeHTML(mat.id)}"
                aria-label="${escapeHTML(mat.titulo)}">
                <div class="kz-mcard__cover">
                    ${thumb}
                    ${isFav ? '<span class="kz-mcard__star"><i class="fas fa-star"></i></span>' : ''}
                </div>
                <div class="kz-mcard__body">
                    <span class="kz-mcard__meta">${escapeHTML(mat.disciplina || 'Geral')} · Prof. ${escapeHTML(mat.autorNome || '—')}</span>
                    <h4 class="kz-mcard__title">${escapeHTML(mat.titulo)}</h4>
                </div>
            </button>`;
        }).join('');
    }

    renderMatPagination(totalPages);
}

function renderMatPagination(totalPages) {
    const pag = els.matPagination;
    if (!pag) return;
    if (totalPages <= 1) {
        pag.classList.add('hidden');
        pag.classList.remove('flex');
        pag.innerHTML = '';
        return;
    }
    pag.classList.remove('hidden');
    pag.classList.add('flex');
    pag.innerHTML = `
        <div class="flex items-center justify-center gap-3 px-5 py-2 rounded-full bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-sm">
            <button type="button" onclick="window.conteudosAPI.mudarPaginaMat(-1)"
                ${currentPage === 1 ? 'disabled class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 cursor-not-allowed"' : 'class="w-8 h-8 rounded-lg flex items-center justify-center text-blue-400 hover:text-white hover:bg-blue-600/30 transition-all active:scale-95"'}
                aria-label="Página anterior">
                <i class="fas fa-chevron-left text-xs"></i>
            </button>
            <span class="text-[11px] font-black uppercase tracking-[.2em] text-slate-300 font-mono px-3 select-none">
                PÁG <span class="text-blue-400 font-bold">${currentPage}</span> / ${totalPages}
            </span>
            <button type="button" onclick="window.conteudosAPI.mudarPaginaMat(1)"
                ${currentPage === totalPages ? 'disabled class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 cursor-not-allowed"' : 'class="w-8 h-8 rounded-lg flex items-center justify-center text-blue-400 hover:text-white hover:bg-blue-600/30 transition-all active:scale-95"'}
                aria-label="Próxima página">
                <i class="fas fa-chevron-right text-xs"></i>
            </button>
        </div>`;
}

/* ==========================================================================
   MÓDULOS 2 e 3 — MÚSICAS E PODCASTS
   ========================================================================== */

function initMusicas() {
    onSnapshot(query(collection(db, "musicas"), orderBy("createdAt", "desc")), (snap) => {
        musicasGrimorio = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMusicasList();
    }, (err) => console.error("Falha ao ler musicas:", err));

    els.formMus?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('btn-submit-mus');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;
        try {
            const idDoc = $('mus-id').value;
            const audio = $('mus-file-audio').files[0];
            const capa = $('mus-file-image').files[0];
            const idStorage = idDoc || Date.now().toString();

            const updateData = {
                titulo: $('mus-titulo').value,
                artista: $('mus-artista').value,
                letra: $('mus-letra').value,
                updatedAt: serverTimestamp()
            };

            if (audio) {
                const rAudio = ref(storage, `musicas/${idStorage}_audio`);
                await uploadBytes(rAudio, audio);
                updateData.audioURL = await getDownloadURL(rAudio);
            }
            if (capa) {
                const rCapa = ref(storage, `musicas/${idStorage}_capa`);
                await uploadBytes(rCapa, capa);
                updateData.albumArtUrl = await getDownloadURL(rCapa);
            }

            if (idDoc) {
                await setDoc(doc(db, "musicas", idDoc), updateData, { merge: true });
                alert("Trilha atualizada!");
            } else {
                updateData.createdAt = serverTimestamp();
                await addDoc(collection(db, "musicas"), updateData);
                alert("Trilha registrada!");
            }
            window.conteudosAPI.cancelarEdicaoMedia('musica');
        } catch (err) {
            alert("Falha no registro.");
            console.error(err);
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    });

    $('btn-cancel-mus')?.addEventListener('click', () => window.conteudosAPI.cancelarEdicaoMedia('musica'));
    $('btn-delete-mus')?.addEventListener('click', () => {
        const id = $('mus-id').value;
        if (id) window.conteudosAPI.excluirMedia(id, 'musica');
    });
}

function initPodcasts() {
    onSnapshot(query(collection(db, "podcasts_kazenski"), orderBy("createdAt", "desc")), (snap) => {
        podcastsGrimorio = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPodcastsList();
    }, (err) => console.error("Falha ao ler podcasts_kazenski:", err));

    els.formPod?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('btn-submit-pod');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
        btn.disabled = true;
        try {
            const idDoc = $('pod-id').value;
            const audio = $('pod-file-audio').files[0];
            const capa = $('pod-file-image').files[0];
            const idStorage = idDoc || Date.now().toString();

            const updateData = {
                titulo: $('pod-titulo').value,
                criador: $('pod-professor').value,
                descricao: $('pod-descricao').value,
                updatedAt: serverTimestamp()
            };

            if (audio) {
                const rAudio = ref(storage, `podcasts/${idStorage}_audio`);
                await uploadBytes(rAudio, audio);
                updateData.audioURL = await getDownloadURL(rAudio);
            }
            if (capa) {
                const rCapa = ref(storage, `podcasts/${idStorage}_capa`);
                await uploadBytes(rCapa, capa);
                updateData.coverArtUrl = await getDownloadURL(rCapa);
            }

            if (idDoc) {
                await setDoc(doc(db, "podcasts_kazenski", idDoc), updateData, { merge: true });
                alert("Podcast atualizado!");
            } else {
                updateData.createdAt = serverTimestamp();
                await addDoc(collection(db, "podcasts_kazenski"), updateData);
                alert("Episódio Publicado!");
            }
            window.conteudosAPI.cancelarEdicaoMedia('podcast');
        } catch (err) {
            alert("Erro no envio.");
            console.error(err);
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    });

    $('btn-cancel-pod')?.addEventListener('click', () => window.conteudosAPI.cancelarEdicaoMedia('podcast'));
    $('btn-delete-pod')?.addEventListener('click', () => {
        const id = $('pod-id').value;
        if (id) window.conteudosAPI.excluirMedia(id, 'podcast');
    });
}

/** Fila filtrada do tipo pedido — é a lista que o player navega. */
function filaFiltrada(tipo) {
    const source = tipo === 'musica' ? musicasGrimorio : podcastsGrimorio;
    const input = tipo === 'musica' ? els.searchMus : els.searchPod;
    const term = deburr(input?.value);
    if (!term) return source.slice();

    return source.filter(item => {
        if (tipo === 'musica') {
            return deburr(item.titulo).includes(term)
                || deburr(item.artista).includes(term)
                || deburr(item.letra).includes(term);
        }
        return deburr(item.titulo).includes(term)
            || deburr(item.criador || item.professor).includes(term)
            || deburr(item.descricao).includes(term);
    });
}

/** Monta uma linha `.kz-track` (canônico Spotify: capa + hover play + eq). */
function trackRowHTML(item, idx, tipo, playingId) {
    const isMus = tipo === 'musica';
    const art = isMus ? item.albumArtUrl : item.coverArtUrl;
    const sub = isMus ? item.artista : (item.criador || item.professor);
    const isPlaying = item.id === playingId;

    const artHTML = art
        ? `<img src="${escapeHTML(art)}" alt="" loading="lazy" decoding="async">`
        : `<i class="${isMus ? 'fas fa-music' : 'fas fa-microphone'} no-art"></i>`;

    return `
    <li>
        <div class="kz-track${isPlaying ? ' is-playing' : ''}" role="button" tabindex="0"
             data-idx="${idx}" data-tipo="${tipo}"
             aria-label="Tocar ${escapeHTML(item.titulo)}">
            <div class="kz-track__art">
                ${artHTML}
                <div class="kz-eq" aria-hidden="true"><span></span><span></span><span></span></div>
                <span class="kz-track__play"><i class="fas fa-play"></i></span>
            </div>
            <div class="kz-track__meta">
                <div class="kz-track__title">${escapeHTML(item.titulo)}</div>
                <div class="kz-track__sub">${escapeHTML(sub || 'Autor desconhecido')}</div>
            </div>
            <span class="kz-track__dur">${isMus ? '' : 'EP'}</span>
        </div>
    </li>`;
}

function emptyRowHTML(icon, msg) {
    return `<li><div class="kz-empty" style="padding:2.2rem 1rem"><i class="fas ${icon}"></i><p>${escapeHTML(msg)}</p></div></li>`;
}

/** Delegação: um único listener por lista cobre linhas criadas dinamicamente. */
function wireTrackList(listEl) {
    if (!listEl || listEl.dataset.wired === 'true') return;
    listEl.dataset.wired = 'true';
    const activate = (target) => {
        const row = target.closest('.kz-track');
        if (!row) return;
        window.conteudosAPI.tocarMedia(Number(row.dataset.idx), row.dataset.tipo);
    };
    listEl.addEventListener('click', (e) => activate(e.target));
    listEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e.target); }
    });
}

const renderMusicasList = rafThrottle(() => {
    if (!els.musList) return;
    const filtered = filaFiltrada('musica');

    if (els.musicCount) els.musicCount.textContent = filtered.length;
    if (els.musicCountSm) els.musicCountSm.textContent = filtered.length;

    els.musList.innerHTML = filtered.length
        ? filtered.map((m, idx) => trackRowHTML(m, idx, 'musica', currentPlayingId)).join('')
        : emptyRowHTML('fa-music', 'Nenhuma trilha encontrada');

    wireTrackList(els.musList);
});

const renderPodcastsList = rafThrottle(() => {
    if (!els.podList) return;
    const filtered = filaFiltrada('podcast');

    if (els.podcastCount) els.podcastCount.textContent = filtered.length;
    if (els.podcastCountSm) els.podcastCountSm.textContent = filtered.length;

    els.podList.innerHTML = filtered.length
        ? filtered.map((p, idx) => trackRowHTML(p, idx, 'podcast', currentPlayingId)).join('')
        : emptyRowHTML('fa-microphone', 'Nenhum episódio encontrado');

    wireTrackList(els.podList);
});

/* ==========================================================================
   PAINEL "TOCANDO AGORA"
   ========================================================================== */

function renderNowPane(item, idx, tipo) {
    const isMus = tipo === 'musica';
    const placeholder = isMus ? els.musicPlaceholder : els.podPlaceholder;
    const view = isMus ? els.musicDetails : els.podDetails;
    if (!view) return;

    const art = isMus ? item.albumArtUrl : item.coverArtUrl;
    const sub = isMus ? item.artista : (item.criador || item.professor);
    const texto = isMus ? item.letra : item.descricao;

    const canEdit = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.Coordenacao);
    const label = isMus ? 'Trilha Sonora' : 'Podcast';
    const eyebrowIcon = isMus ? 'fa-compact-disc' : 'fa-broadcast-tower';

    const coverHTML = art
        ? `<div class="kz-now__cover"><img src="${escapeHTML(art)}" alt="" decoding="async"></div>`
        : `<div class="kz-now__cover kz-now__cover--none"><i class="fas ${isMus ? 'fa-music' : 'fa-microphone'}"></i></div>`;

    view.innerHTML = `
        <div class="kz-now__head">
            ${coverHTML}
            <div class="kz-now__info">
                <div class="kz-now__eyebrow"><i class="fas ${eyebrowIcon}"></i> ${label}</div>
                <h2 class="kz-now__title">${escapeHTML(item.titulo)}</h2>
                <p class="kz-now__artist">${escapeHTML(sub || 'Autor desconhecido')}</p>
            </div>
        </div>

        <div class="kz-now__actions">
            <button type="button" class="kz-btn kz-btn--accent" data-act="toggle" data-now-play>
                <i class="fas fa-play"></i> <span data-now-label>Reproduzir</span>
            </button>
            <a class="kz-btn" href="${escapeHTML(item.audioURL || '#')}" target="_blank" rel="noopener" download>
                <i class="fas fa-download"></i> MP3
            </a>
            <button type="button" class="kz-btn" data-act="download-text">
                <i class="fas fa-file-alt"></i> ${isMus ? 'Baixar letra' : 'Resumo'}
            </button>
            ${canEdit ? `<button type="button" class="kz-btn kz-btn--ml" data-act="edit"><i class="fas fa-edit"></i> Editar</button>` : ''}
        </div>

        <div class="kz-lyrics custom-scroll">
            ${texto
                ? `<pre class="kz-lyrics__text">${escapeHTML(texto)}</pre>`
                : `<p class="kz-lyrics__text kz-lyrics__empty">${isMus ? 'Nenhuma letra foi enviada para esta trilha.' : 'Nenhum resumo foi enviado para este episódio.'}</p>`}
        </div>`;

    placeholder?.classList.add('hidden');
    view.classList.remove('hidden');

    view.querySelector('[data-act="toggle"]')?.addEventListener('click', () => window.conteudosAPI.togglePlay());
    view.querySelector('[data-act="download-text"]')?.addEventListener('click', () => window.conteudosAPI.dlTextoAtual());
    view.querySelector('[data-act="edit"]')?.addEventListener('click', () => window.conteudosAPI.editarMedia(idx, tipo));

    syncNowPaneButton();
}

/** Mantém o botão grande do painel coerente com o estado real do <audio>.
    Usa data-attributes (não ids) porque as duas visões coexistem no DOM. */
function syncNowPaneButton() {
    const paused = !els.audioEngine || els.audioEngine.paused;
    document.querySelectorAll('[data-now-play]').forEach(btn => {
        const icon = btn.querySelector('i');
        const label = btn.querySelector('[data-now-label]');
        if (icon) icon.className = paused ? 'fas fa-play' : 'fas fa-pause';
        if (label) label.textContent = paused ? 'Reproduzir' : 'Pausar';
    });
}

/* ==========================================================================
   PLAYER GLOBAL (dock)
   ========================================================================== */

/** Mede a altura real do dock para reservar espaco no acervo,
    evitando que a barra fixa tape o conteudo. */
function syncDockHeight() {
    const visivel = els.playerBox && !els.playerBox.classList.contains('hidden');
    const h = visivel ? els.playerBox.offsetHeight : 0;
    document.documentElement.style.setProperty('--kz-dock-h', `${h}px`);
}

function setupPlayerEventListeners() {
    const audio = els.audioEngine;
    if (!audio || audio.dataset.wired === 'true') return;
    audio.dataset.wired = 'true';

    if (els.playerBox && 'ResizeObserver' in window) {
        new ResizeObserver(syncDockHeight).observe(els.playerBox);
    }
    window.addEventListener('resize', syncDockHeight);
    syncDockHeight();

    const updateProgress = () => {
        const dur = audio.duration;
        if (!dur || !isFinite(dur)) return;
        const pct = (audio.currentTime / dur) * 100;
        if (els.progress) els.progress.value = pct;
        if (els.progressFill) els.progressFill.style.setProperty('--kz-dock-progress', (pct / 100).toFixed(4));
        if (els.progressBar) els.progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
        if (els.timeCurr) els.timeCurr.textContent = formatSeg(audio.currentTime);
        if (els.timeTotal) els.timeTotal.textContent = formatSeg(dur);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('play', () => { syncPlayButtons(); syncNowPaneButton(); });
    audio.addEventListener('pause', () => { syncPlayButtons(); syncNowPaneButton(); });

    audio.addEventListener('ended', () => {
        if (repeatMode === 2) {                       // repetir a atual
            audio.currentTime = 0;
            audio.play();
        } else {
            window.conteudosAPI.nextAudio(true);      // avanço automático
        }
    });

    els.progress?.addEventListener('input', (e) => {
        if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
    });

    // Barra fina do topo do dock: clique/arrasta para procurar.
    const seekFromPointer = (e) => {
        if (!audio.duration) return;
        const rect = els.progressBar.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
    };
    if (els.progressBar) {
        let seeking = false;
        els.progressBar.addEventListener('pointerdown', (e) => {
            seeking = true;
            els.progressBar.setPointerCapture?.(e.pointerId);
            seekFromPointer(e);
        });
        els.progressBar.addEventListener('pointermove', (e) => { if (seeking) seekFromPointer(e); });
        els.progressBar.addEventListener('pointerup', (e) => {
            seeking = false;
            els.progressBar.releasePointerCapture?.(e.pointerId);
        });
        els.progressBar.addEventListener('keydown', (e) => {
            if (!audio.duration) return;
            if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
            else return;
            e.preventDefault();
        });
    }

    els.volume?.addEventListener('input', (e) => { audio.volume = Number(e.target.value); });
}

/** Espelha o estado real do <audio> nos botoes (dock, pilula e painel). */
function syncPlayButtons() {
    const audio = els.audioEngine;
    if (!audio) return;
    const isPaused = audio.paused;

    if (els.btnPlayPause) {
        els.btnPlayPause.innerHTML = isPaused
            ? '<i class="fas fa-play"></i>'
            : '<i class="fas fa-pause"></i>';
    }
    if (els.btnPlayPauseMini) {
        els.btnPlayPauseMini.innerHTML = isPaused
            ? '<i class="fas fa-play"></i>'
            : '<i class="fas fa-pause"></i>';
    }
    syncNowPaneButton();
}

function paintPlayerArt(item, tipo) {
    const isMus = tipo === 'musica';
    const art = isMus ? item?.albumArtUrl : item?.coverArtUrl;

    if (els.thumb) {
        if (art) {
            els.thumb.src = art;
            els.thumb.classList.remove('hidden');
        } else {
            els.thumb.removeAttribute('src');
            els.thumb.classList.add('hidden');
        }
    }
    if (els.fallbackIcon) {
        els.fallbackIcon.className = `fas ${isMus ? 'fa-music text-emerald-400' : 'fa-microphone text-purple-400'}`;
        els.fallbackIcon.classList.toggle('hidden', !!art);
    }

    if (els.miniPlayerThumb) {
        if (art) { els.miniPlayerThumb.src = art; els.miniPlayerThumb.classList.remove('hidden'); }
        else els.miniPlayerThumb.classList.add('hidden');
    }
    if (els.miniPlayerIcon) {
        els.miniPlayerIcon.className = `fas ${isMus ? 'fa-music text-emerald-400' : 'fa-microphone text-purple-400'}`;
    }
}

/* ==========================================================================
   API GLOBAL (injetada em window para os botões do HTML e outros módulos)
   ========================================================================== */

window.conteudosAPI = {

    mudarPaginaMat: (dir) => {
        currentPage = Math.max(1, currentPage + dir);
        renderMaterials();
        els.matGrid?.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /* ---------- Materiais ---------- */

    expandir: (id) => {
        const mat = materialsCache.find(m => m.id === id);
        if (!mat) return;

        $('mat-det-meta').textContent = `${mat.disciplina || 'Geral'} | Prof. ${mat.autorNome || '—'}`;
        $('mat-det-title').textContent = mat.titulo || '';

        let bodyHtml = '';
        if (mat.urlImage) {
            bodyHtml += `<img src="${escapeHTML(mat.urlImage)}" alt="" class="w-full h-48 md:h-64 object-cover rounded-xl mb-6 shadow-lg border border-slate-700 shrink-0">`;
        }
        bodyHtml += `<div class="text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHTML(mat.texto || 'Nenhum conteúdo textual fornecido.')}</div>`;

        if (mat.urlPdf) {
            bodyHtml += `
            <a href="${escapeHTML(mat.urlPdf)}" target="_blank" rel="noopener"
               class="mt-8 p-4 bg-slate-900/50 border border-red-500/30 rounded-xl flex items-center gap-4 hover:bg-slate-800 transition-colors group shadow-md">
                <div class="w-12 h-12 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <i class="fas fa-file-pdf text-2xl"></i>
                </div>
                <div class="flex-grow min-w-0">
                    <h4 class="text-white font-bold text-sm truncate">Documento Anexo</h4>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest">Clique para ler o PDF completo</p>
                </div>
                <i class="fas fa-external-link-alt text-slate-500"></i>
            </a>`;
        }

        $('mat-det-body').innerHTML = bodyHtml;

        let footerHtml = '';
        if (currentUser) {
            const isFav = !!currentUser.favoritos?.includes(mat.id);
            const favClass = isFav
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-600 hover:text-white'
                : 'bg-slate-800 text-slate-300 border border-transparent hover:bg-amber-600 hover:text-white';
            const favText = isFav ? '<i class="fas fa-star mr-1"></i> Desfavoritar' : '<i class="far fa-star mr-1"></i> Favoritar';
            footerHtml += `<button id="btn-modal-fav" onclick="window.conteudosAPI.toggleFavorito('${mat.id}')" class="px-5 py-2.5 rounded-xl text-xs font-bold transition-colors ${favClass}">${favText}</button>`;
        }

        (mat.links || []).forEach((l, i) => {
            footerHtml += `<a href="${escapeHTML(l)}" target="_blank" rel="noopener" class="px-5 py-2.5 border border-blue-500/50 text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-500 hover:text-white transition-colors"><i class="fas fa-external-link-alt mr-1"></i> Link ${i + 1}</a>`;
        });

        const canEdit = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.Coordenacao || currentUser.uid === mat.autorUID);
        if (canEdit) {
            footerHtml += `<div class="ml-auto flex gap-2">
                <button onclick="window.conteudosAPI.editarMat('${mat.id}')" class="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors" aria-label="Editar"><i class="fas fa-edit"></i></button>
                <button onclick="window.conteudosAPI.excluirMat('${mat.id}')" class="px-4 py-2 bg-red-900/30 text-red-400 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors" aria-label="Excluir"><i class="fas fa-trash"></i></button>
            </div>`;
        }

        $('mat-det-footer').innerHTML = footerHtml;

        const modal = $('cont-modal-mat');
        const panel = $('cont-modal-panel');
        modal.classList.remove('hidden');
        requestAnimationFrame(() => panel.classList.remove('translate-x-full'));
    },

    fecharMat: () => {
        const modal = $('cont-modal-mat');
        const panel = $('cont-modal-panel');
        if (!modal || !panel) return;
        panel.classList.add('translate-x-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    },

    editarMat: (id) => {
        window.conteudosAPI.fecharMat();
        const mat = materialsCache.find(m => m.id === id);
        if (!mat) return;
        currentMaterialEditId = id;

        $('mat-titulo').value = mat.titulo || '';
        $('mat-disciplina').value = mat.disciplina || '';
        $('mat-texto').value = mat.texto || '';

        const container = $('mat-link-inputs-container');
        container.innerHTML = '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Fontes Externas (Links)</label>';
        if (mat.links && mat.links.length) {
            mat.links.forEach(l => {
                const i = document.createElement('input');
                i.type = 'url';
                i.value = l;
                i.className = 'link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none';
                container.appendChild(i);
            });
        } else {
            const i = document.createElement('input');
            i.type = 'url';
            i.className = 'link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none';
            i.placeholder = 'https://...';
            container.appendChild(i);
        }

        ativarSubTab('materiais');
        els.adminMat.classList.remove('hidden');
        els.adminMat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        $('btn-submit-mat').textContent = "Atualizar Conhecimento";
    },

    excluirMat: async (id) => {
        if (!confirm("Apagar permanentemente este conhecimento?")) return;
        await deleteDoc(doc(db, "materiaisDidaticos", id));
        window.conteudosAPI.fecharMat();
    },

    toggleFavorito: async (id) => {
        if (!currentUser) return;
        if (!currentUser.favoritos) currentUser.favoritos = [];

        const idx = currentUser.favoritos.indexOf(id);
        if (idx > -1) currentUser.favoritos.splice(idx, 1);
        else currentUser.favoritos.push(id);

        try {
            await setDoc(doc(db, "users", currentUser.uid), { favoritos: currentUser.favoritos }, { merge: true });

            const btnFav = $('btn-modal-fav');
            if (btnFav) {
                const isFav = idx === -1;
                btnFav.innerHTML = isFav ? '<i class="fas fa-star mr-1"></i> Desfavoritar' : '<i class="far fa-star mr-1"></i> Favoritar';
                btnFav.className = isFav
                    ? 'px-5 py-2.5 rounded-xl text-xs font-bold transition-colors bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-600 hover:text-white'
                    : 'px-5 py-2.5 rounded-xl text-xs font-bold transition-colors bg-slate-800 text-slate-300 border border-transparent hover:bg-amber-600 hover:text-white';
            }

            renderMaterials();
        } catch (err) {
            console.error("Erro ao favoritar: ", err);
            alert("Erro de comunicação com o Grimório ao favoritar.");
        }
    },

    /* ---------- Músicas / Podcasts ---------- */

    editarMedia: (idx, tipo) => {
        const item = activeAudioList[idx];
        if (!item) return;

        const isMus = tipo === 'musica';
        if (isMus) {
            $('mus-id').value = item.id;
            $('mus-titulo').value = item.titulo || '';
            $('mus-artista').value = item.artista || '';
            $('mus-letra').value = item.letra || '';
            $('btn-submit-mus').textContent = "Atualizar Trilha";
            $('btn-cancel-mus').classList.remove('hidden');
            $('btn-delete-mus').classList.remove('hidden');
            $('mus-file-audio').removeAttribute('required');
            $('mus-file-image').removeAttribute('required');

            ativarSubTab('musicas');
            els.adminMus.classList.remove('hidden');
            els.adminMus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            $('pod-id').value = item.id;
            $('pod-titulo').value = item.titulo || '';
            $('pod-professor').value = item.criador || item.professor || '';
            $('pod-descricao').value = item.descricao || '';
            $('btn-submit-pod').textContent = "Atualizar Podcast";
            $('btn-cancel-pod').classList.remove('hidden');
            $('btn-delete-pod').classList.remove('hidden');
            $('pod-file-audio').removeAttribute('required');
            $('pod-file-image').removeAttribute('required');

            ativarSubTab('podcasts');
            els.adminPod.classList.remove('hidden');
            els.adminPod.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    cancelarEdicaoMedia: (tipo) => {
        if (tipo === 'musica') {
            els.formMus?.reset();
            $('mus-id').value = '';
            $('btn-submit-mus').textContent = "Registrar Trilha";
            $('btn-cancel-mus').classList.add('hidden');
            $('btn-delete-mus').classList.add('hidden');
            $('mus-file-audio').setAttribute('required', 'true');
            $('mus-file-image').setAttribute('required', 'true');
            els.adminMus?.classList.add('hidden');
        } else {
            els.formPod?.reset();
            $('pod-id').value = '';
            $('btn-submit-pod').textContent = "Publicar Podcast";
            $('btn-cancel-pod').classList.add('hidden');
            $('btn-delete-pod').classList.add('hidden');
            $('pod-file-audio').setAttribute('required', 'true');
            $('pod-file-image').setAttribute('required', 'true');
            els.adminPod?.classList.add('hidden');
        }
    },

    excluirMedia: async (id, tipo) => {
        if (!confirm("Deseja apagar permanentemente este conteúdo?")) return;
        const isMus = tipo === 'musica';
        const colecao = isMus ? "musicas" : "podcasts_kazenski";
        try {
            await deleteDoc(doc(db, colecao, id));
            window.conteudosAPI.cancelarEdicaoMedia(tipo);

            if (currentPlayingId === id) {
                (isMus ? els.musicDetails : els.podDetails)?.classList.add('hidden');
                (isMus ? els.musicPlaceholder : els.podPlaceholder)?.classList.remove('hidden');
                window.conteudosAPI.closePlayer();
            }
        } catch (e) {
            console.error("Erro ao excluir", e);
            alert("Erro ao excluir conteúdo.");
        }
    },

    tocarMedia: (idx, tipo) => {
        const lista = filaFiltrada(tipo);
        const item = lista[idx];
        if (!item) return;

        activeAudioList = lista;
        activeType = tipo;
        currentIdx = idx;
        currentPlayingId = item.id;

        renderMusicasList();
        renderPodcastsList();

        const isMus = tipo === 'musica';
        ativarSubTab(isMus ? 'musicas' : 'podcasts');
        renderNowPane(item, idx, tipo);

        const sub = isMus ? item.artista : (item.criador || item.professor);
        paintPlayerArt(item, tipo);
        els.title.textContent = item.titulo || '';
        els.artist.textContent = sub || 'Autor desconhecido';

        if (item.audioURL) {
            els.audioEngine.src = item.audioURL;
            els.audioEngine.play().catch(() => { /* bloqueado pelo navegador: mantém pausado */ });
        } else {
            els.audioEngine.removeAttribute('src');
        }

        if (els.progressFill) els.progressFill.style.setProperty('--kz-dock-progress', '0');
        if (els.progress) els.progress.value = 0;
        if (els.timeCurr) els.timeCurr.textContent = '0:00';
        if (els.timeTotal) els.timeTotal.textContent = '0:00';

        window.conteudosAPI.maximizePlayer();
        syncPlayButtons();
    },

    togglePlay: () => {
        if (!els.audioEngine) return;
        if (!els.audioEngine.src) return;
        if (els.audioEngine.paused) els.audioEngine.play().catch(() => { });
        else els.audioEngine.pause();
        syncPlayButtons();
    },

    prevAudio: () => {
        if (currentIdx > 0) window.conteudosAPI.tocarMedia(currentIdx - 1, activeType);
    },

    nextAudio: (autoAdvance = false) => {
        if (!activeAudioList.length || !activeType) return;

        if (isShuffle) {
            let nextIdx = currentIdx;
            while (nextIdx === currentIdx && activeAudioList.length > 1) {
                nextIdx = Math.floor(Math.random() * activeAudioList.length);
            }
            window.conteudosAPI.tocarMedia(nextIdx, activeType);
            return;
        }

        if (currentIdx < activeAudioList.length - 1) {
            window.conteudosAPI.tocarMedia(currentIdx + 1, activeType);
        } else if (autoAdvance && repeatMode === 1) {
            window.conteudosAPI.tocarMedia(0, activeType);
        } else if (autoAdvance && repeatMode === 0 && activeAudioList.length) {
            // Chegou ao fim: volta ao estado de parado no início.
            els.audioEngine.pause();
            els.audioEngine.currentTime = 0;
        }
    },

    toggleShuffle: () => {
        isShuffle = !isShuffle;
        els.btnShuffle?.classList.toggle('is-on', isShuffle);
        els.btnShuffle?.classList.toggle('text-blue-500', isShuffle);
        els.btnShuffle?.classList.toggle('text-slate-400', !isShuffle);
    },

    toggleRepeat: () => {
        repeatMode = (repeatMode + 1) % 3;
        const btn = els.btnRepeat;
        if (!btn) return;
        btn.classList.toggle('is-on', repeatMode > 0);
        btn.setAttribute('aria-label', ['Repetição desligada', 'Repetir tudo', 'Repetir faixa'][repeatMode]);
        if (repeatMode === 0) btn.innerHTML = '<i class="fas fa-redo"></i>';
        else if (repeatMode === 1) btn.innerHTML = '<i class="fas fa-repeat"></i>';
        else btn.innerHTML = '<i class="fas fa-repeat"></i><span style="position:absolute;right:-2px;bottom:-2px;font-size:8px;font-weight:900;line-height:1;background:#0f172a;border-radius:99px;padding:1px 3px;border:1px solid #1e293b">1</span>';
    },

    dlTextoAtual: () => {
        const item = activeAudioList[currentIdx];
        if (!item) return;
        const texto = item.letra || item.descricao || 'Sem registros';
        const b = new Blob([`${item.titulo}\n\n${texto}`], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${(item.titulo || 'registro').replace(/[^\w\- ]+/g, '')}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    minimizePlayer: () => {
        els.playerBox?.classList.add('hidden');
        els.miniPlayerBox?.classList.remove('hidden');
        syncDockHeight();
    },

    maximizePlayer: () => {
        els.miniPlayerBox?.classList.add('hidden');
        els.playerBox?.classList.remove('hidden');
        syncDockHeight();
    },

    closePlayer: () => {
        els.audioEngine?.pause();
        if (els.audioEngine) els.audioEngine.currentTime = 0;
        els.playerBox?.classList.add('hidden');
        els.miniPlayerBox?.classList.add('hidden');
        syncDockHeight();

        // Limpa as duas áreas "tocando agora"
        [els.musicDetails, els.podDetails].forEach(v => v?.classList.add('hidden'));
        els.musicPlaceholder?.classList.remove('hidden');
        els.podPlaceholder?.classList.remove('hidden');

        currentPlayingId = null;
        renderMusicasList();
        renderPodcastsList();
    },

    syncPlayButtons: () => syncPlayButtons()
};

/* Clique nos cards de material (delegação — evita 1 listener por card) */
document.addEventListener('click', (e) => {
    const card = e.target.closest('.kz-mcard');
    if (card && card.dataset.mat) window.conteudosAPI.expandir(card.dataset.mat);
});
