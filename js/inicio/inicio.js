import { db } from '../core/firebase.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

/* ============================================================================
   PÁGINA INICIAL — CARROSSEL IMERSIVO v2
   ----------------------------------------------------------------------------
   Recursos:
     • Zoom-out  : fundo em Ken Burns contínuo (movimento lento e infinito)
     • Zoom-in   : clique no card expande a capa para tela cheia (transição FLIP)
     • Navegação : arrasto (mouse/caneta/toque), roda do mouse/trackpad, teclado
     • Inércia   : o trilho "escorrega" após o soltar, como material físico
     • Snap      : alinha o card ativo com tolerância e elasticidade
   ========================================================================== */

const DEFAULT_BG = "imagens/background/background-oficial.jpg";
const PLACEHOLDER = "https://placehold.co/800x500/1e293b/94a3b8?text=Kazenski";

const AUTOPLAY_MS = 4200;
const IMMERSIVE_MS = 30000;   // tempo de tela cheia antes de voltar sozinho
const WHEEL_THROTTLE_MS = 130;
const FLICK_VELOCITY = 0.45;   // px/ms mínimo para contar como "flick"
const DRAG_RATIO = 0.15;       // 15% da largura do card = troca de slide

let slides = [];
let activeIndex = 0;
let isImmersive = false;
let immersiveIndex = null;   // índice do card realmente ampliado
let hoverPreview = false;
let prefersReducedMotion = false;

// Timers/RAF (guardados para poder ser cancelados ao trocar de aba)
let bgTimer = null;
let immersiveTimer = null;
let autoplayTimer = null;
let wheelLast = 0;
let rafInertia = null;
let rafCountdown = null;
let rafGeo = null;           // frame pendente da geometria do modo imersivo

// Um único clique do usuário gera pointerdown -> pointerup -> click.
// O `click` chega DEPOIS de o card já estar ampliado, então o mesmo gesto
// que abre o modo imersivo também o fecharia (piscar). Ignoramos a janela
// logo após a abertura para separar "abrir" de "fechar".
const GHOST_CLICK_MS = 350;
let immersiveOpenedAt = -Infinity;

const $ = (sel, root = document) => root.querySelector(sel);

function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ============================================================================
   RENDERIZAÇÃO DO ESQUELETO
   ========================================================================== */
export async function renderInicioTab() {
    const container = document.getElementById('inicio-content');
    if (!container) return;

    teardown();
    prefersReducedMotion = prefersReduced();

    container.innerHTML = `
        <section class="kz-hero" id="kz-hero" aria-roledescription="carrossel" aria-label="Atualizações em destaque">

            <!-- Pilha de fundos (zoom-out) -->
            <div class="kz-hero__bg" data-bg="0"></div>
            <div class="kz-hero__bg" data-bg="1"></div>

            <div class="kz-hero__scrim"></div>
            <div class="kz-hero__grain"></div>

            <!-- Título padrão (some no modo imersivo) -->
            <div class="kz-hero__intro" id="kz-intro">
                <h1 class="kz-hero__title">Prof. <em>Kazenski</em></h1>
                <p class="kz-hero__tagline">
                    "Código, lógica e educação tecnológica. Transformando o futuro através do desenvolvimento."
                </p>
            </div>

            <!-- Detalhes da notícia selecionada -->
            <article class="kz-news" id="kz-news" aria-live="polite">
                <span class="kz-news__eyebrow"><i class="fas fa-bolt"></i> <span id="kz-news-kind">Atualização</span></span>
                <h2 class="kz-news__title" id="kz-news-title"></h2>
                <p class="kz-news__text" id="kz-news-text"></p>
                <a class="kz-news__cta" id="kz-news-cta" href="#" target="_blank" rel="noopener noreferrer">
                    <span id="kz-news-cta-label">Ver Conteúdo</span> <i class="fas fa-arrow-up-right-from-square text-[.7em]"></i>
                </a>
            </article>

            <!-- Botão de sair do modo imersivo -->
            <button class="kz-exit" id="kz-exit" title="Voltar ao carrossel (Esc)" aria-label="Voltar ao carrossel">
                <i class="fas fa-xmark"></i>
            </button>

            <!-- Contador regressivo do modo imersivo (30s) -->
            <div class="kz-immersive-timer" id="kz-timer" aria-hidden="true">
                <div class="kz-immersive-timer__track">
                    <div class="kz-immersive-timer__fill" id="kz-timer-fill"></div>
                </div>
                <div class="kz-immersive-timer__label" id="kz-timer-label">Fechando em 30s</div>
            </div>

            <!-- Trilho inferior -->
            <div class="kz-rail" id="kz-rail">
                <div class="kz-rail__head">
                    <span class="kz-rail__title"><i class="fas fa-thumbtack"></i> Feed de Atualizações</span>

                    <div class="flex items-center gap-3">
                        <span class="kz-rail__hint hidden lg:flex">
                            Arraste <kbd>←</kbd><kbd>→</kbd> ou use a roda
                        </span>
                        <button class="kz-navbtn" id="kz-prev" aria-label="Anterior" title="Anterior">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <button class="kz-navbtn" id="kz-next" aria-label="Próxima" title="Próxima">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>

                <div class="kz-rail__viewport" id="kz-viewport">
                    <div class="kz-rail__track" id="kz-track" role="listbox" aria-label="Atualizações"></div>
                </div>
            </div>
        </section>
    `;

    requestAnimationFrame(() => {
        const bg0 = $('[data-bg="0"]');
        if (bg0) {
            bg0.style.backgroundImage = `url('${DEFAULT_BG}')`;
            bg0.classList.add('is-on', 'kz-kenburns');
        }
    });

    await fetchNoticias();
}

/* ============================================================================
   CARREGAMENTO DOS DADOS
   ========================================================================== */
async function fetchNoticias() {
    const track = $('#kz-track');
    if (!track) return;

    // Gestos, roda, teclado e botões ficam ativos mesmo sem o feed carregar
    // (as funções de navegação já ignoram listas vazias).
    wireEvents();

    try {
        const q = query(collection(db, "atualizacoes"), where('ativa', '==', true), orderBy('ordem'));
        const snapshot = await getDocs(q);
        slides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (slides.length === 0) {
            track.innerHTML = `<p class="w-full text-center text-slate-600 text-xs uppercase tracking-widest py-6">
                Nenhuma atualização publicada ainda.
            </p>`;
            return;
        }

        buildCards();
        updateActive(0, { silent: true });
        if (slides.length > 1) startAutoplay();
    } catch (error) {
        console.error("[Início] Erro ao carregar atualizações:", error);
        track.innerHTML = `<p class="w-full text-center text-red-500/80 text-xs uppercase tracking-widest py-6">
            <i class="fas fa-triangle-exclamation mr-2"></i>Não foi possível carregar o feed.
        </p>`;
    }
}

function buildCards() {
    const track = $('#kz-track');
    track.innerHTML = slides.map((slide, i) => {
        const img = slide.imagemURL || PLACEHOLDER;
        const titulo = escapeHTML(slide.titulo || 'Sem título');
        return `
            <div class="kz-card" role="option" tabindex="-1"
                 aria-selected="false"
                 data-index="${i}"
                 data-img="${escapeHTML(img)}">
                <img class="kz-card__img" src="${escapeHTML(img)}" alt="" loading="lazy" draggable="false">
                <div class="kz-card__scrim"></div>
                <span class="kz-card__index">${String(i + 1).padStart(2, '0')}</span>
                <div class="kz-card__body">
                    <h3 class="kz-card__title">${titulo}</h3>
                </div>
                <div class="kz-card__progress"></div>
            </div>
        `;
    }).join('');

    $('#kz-rail')?.querySelector('.kz-rail__count')?.remove();
    const hintTitle = $('.kz-rail__title');
    if (hintTitle) {
        hintTitle.insertAdjacentHTML('afterend',
            `<span class="kz-rail__count" id="kz-count">01 / ${String(slides.length).padStart(2, '0')}</span>`);
    }
}

/* ============================================================================
   GEOMETRIA / POSICIONAMENTO
   ========================================================================== */
function cardStep() {
    const track = $('#kz-track');
    if (!track || track.children.length === 0) return 1;
    const card = track.children[0];
    const styles = getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap || '16') || 16;
    return card.getBoundingClientRect().width + gap;
}

/** Calcula (sem aplicar) o translateX que centraliza o card `i` no trilho. */
function centerOffsetFor(i) {
    const track = $('#kz-track');
    const viewport = $('#kz-viewport');
    if (!track || !viewport || track.children.length === 0) return 0;

    const card = track.children[i];
    if (!card) return 0;

    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    // Centro do card alvo relativo ao trilho
    const cardCenter = (cardRect.left + cardRect.width / 2) - track.getBoundingClientRect().left;
    return (viewportRect.width / 2) - cardCenter;
}

/**
 * Aplica a geometria final do card no modo imersivo.
 * Com `prefers-reduced-motion` fazemos na hora: sem animação não há motivo
 * para esperar um `requestAnimationFrame` — e o estado final fica preso
 * enquanto o frame não chega (aba em segundo plano, renderização suspensa).
 *
 * O id do frame é guardado para que `exitImmersive` consiga CANCELAR a
 * escrita: se o usuário fechasse antes do frame rodar, a escrita pendente
 * reaplicava left/top/width/height depois da limpeza e deixava o card
 * travado em tela cheia (exatamente o sintoma de "não dá para voltar").
 */
function aplicarGeometria(card, geo) {
    const escrever = () => {
        rafGeo = null;
        card.style.left = `${geo.left}px`;
        card.style.top = `${geo.top}px`;
        card.style.width = `${geo.width}px`;
        card.style.height = `${geo.height}px`;
    };
    cancelPendingGeo();
    if (semFrames()) escrever();
    else rafGeo = requestAnimationFrame(escrever);
}

/** Cancela uma escrita de geometria que ainda não saiu no próximo frame. */
function cancelPendingGeo() {
    if (rafGeo !== null) {
        cancelAnimationFrame(rafGeo);
        rafGeo = null;
    }
}

/**
 * `true` quando não devemos esperar um `requestAnimationFrame`.
 *
 * Navegador NÃO dispara rAF em aba oculta/segundo plano. Se o usuário clicar
 * num card e trocar de aba antes do próximo frame, a escrita pendente ficava
 * parada e o card permanecia pequeno, "colado" no trilho, enquanto o modo
 * imersivo já estava ativo. Escrevemos na hora nesses casos.
 */
function semFrames() {
    return prefersReducedMotion || document.hidden;
}

/** Coloca o card ativo centralizado (com peek nas bordas) */
function centerIndex(i, animate = true) {
    const track = $('#kz-track');
    if (!track || track.children.length === 0) return;

    const target = centerOffsetFor(i);
    if (!animate || prefersReducedMotion) {
        track.style.transition = 'none';
    } else {
        track.style.transition = 'transform 750ms cubic-bezier(.16,1,.3,1)';
    }
    track.style.transform = `translate3d(${target}px, 0, 0)`;
}

/** Aplica as classes visuais (is-active / is-near) e o Ken Burns do fundo */
function updateActive(index, { silent = false } = {}) {
    activeIndex = (index + slides.length) % slides.length;
    const track = $('#kz-track');
    if (!track) return;

    Array.from(track.children).forEach((card, i) => {
        const active = i === activeIndex;
        card.classList.toggle('is-active', active);
        card.classList.toggle('is-near', !active);
        card.setAttribute('aria-selected', active ? 'true' : 'false');
        if (!active) card.style.removeProperty('--kz-progress');
    });

    centerIndex(activeIndex, !silent);
    swapBackground(activeIndex, { instant: silent });
    updateCounters();
    startAutoplay();
}

/** Troca o fundo com cross-fade entre as duas camadas (double buffering) */
function swapBackground(index, { instant = false } = {}) {
    const slide = slides[index];
    if (!slide) return;

    const layers = Array.from(document.querySelectorAll('.kz-hero__bg'));
    if (layers.length < 2) return;

    const current = layers.find(l => l.classList.contains('is-on')) || layers[0];
    const next = layers.find(l => l !== current);

    const url = DEFAULT_BG; // fundo nativo fixo: só os cards se movem; expansão troca a imagem (enterImmersive)
    if (current.style.backgroundImage.includes(url) && current.classList.contains('is-on')) return;

    next.style.backgroundImage = `url('${url}')`;

    if (instant || prefersReducedMotion) {
        current.classList.remove('is-on', 'kz-kenburns');
        next.classList.add('is-on');
        if (!prefersReducedMotion) next.classList.add('kz-kenburns');
        return;
    }

    next.style.transition = 'opacity 900ms cubic-bezier(.4,0,.2,1), transform 1400ms cubic-bezier(.4,0,.2,1)';
    next.style.transform = 'scale(1)';
    next.classList.add('is-on');
    if (!prefersReducedMotion) next.classList.add('kz-kenburns');
    requestAnimationFrame(() => {
        next.style.transform = '';
        current.classList.remove('is-on', 'kz-kenburns');
        current.style.transition = 'opacity 900ms cubic-bezier(.4,0,.2,1), transform 1400ms cubic-bezier(.4,0,.2,1)';
        current.style.transform = '';
    });
}

function updateCounters() {
    const counter = $('#kz-count');
    if (counter) counter.textContent =
        `${String(activeIndex + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
}

/* ============================================================================
   AUTOPLAY COM BARRA DE PROGRESSO (sincronizada via --kz-progress)
   ========================================================================== */
function startAutoplay() {
    stopAutoplay();
    if (slides.length <= 1 || isImmersive || hoverPreview) return;

    const card = $('#kz-track')?.children[activeIndex];
    const progressBar = card?.querySelector('.kz-card__progress');
    const startedAt = performance.now();

    if (progressBar && !prefersReducedMotion) {
        const tick = (now) => {
            if (!card.classList.contains('is-active')) return;
            if (isImmersive) {          // não repinta a barra em modo imersivo
                card.style.removeProperty('--kz-progress');
                return;
            }
            const pct = Math.min(1, (now - startedAt) / AUTOPLAY_MS);
            card.style.setProperty('--kz-progress', pct.toFixed(4));
            if (pct < 1 && autoplayTimer) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    autoplayTimer = setTimeout(() => {
        if (!isImmersive) updateActive(activeIndex + 1);
    }, AUTOPLAY_MS);
}

function stopAutoplay() {
    if (autoplayTimer) {
        clearTimeout(autoplayTimer);
        autoplayTimer = null;
    }
    const card = $('#kz-track')?.children[activeIndex];
    card?.style.removeProperty('--kz-progress');
}

/* ============================================================================
   NAVEGAÇÃO
   ========================================================================== */
function go(delta) {
    if (slides.length <= 1) return;
    updateActive(activeIndex + delta);
}

function goTo(index) {
    if (index === activeIndex) return;
    updateActive(index);
}

/* ============================================================================
   MODO IMERSIVO (ZOOM-IN / ZOOM-OUT)
   ========================================================================== */
function enterImmersive(index) {
    if (isImmersive) return;

    // Valida ANTES de mexer em qualquer estado: se o slide não existir, marcar
    // `isImmersive = true` primeiro deixava o módulo travado no modo imersivo
    // sem nada renderizado e sem caminho de volta.
    const card = $('#kz-track')?.children[index];
    const hero = $('#kz-hero');
    const rail = $('#kz-rail');
    const intro = $('#kz-intro');
    const news = $('#kz-news');
    const exit = $('#kz-exit');
    const slide = slides[index];
    if (!card || !hero || !slide) return;

    isImmersive = true;
    stopAutoplay();
    // o card ampliado não deve exibir a barra de progresso do autoplay
    card.style.removeProperty('--kz-progress');

    // Guarda a posição atual para o cálculo do FLIP
    const from = card.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();

    // Move o card para o topo do hero (position:fixed) e inverte a transformação
    card.style.position = 'fixed';
    card.style.left = `${from.left}px`;
    card.style.top = `${from.top}px`;
    card.style.width = `${from.width}px`;
    card.style.height = `${from.height}px`;
    card.style.margin = '0';
    card.style.zIndex = '100';
    card.classList.add('is-zoom');
    immersiveIndex = index;

    // Estado final: cobre o hero inteiro
    const to = { left: heroRect.left, top: heroRect.top, width: heroRect.width, height: heroRect.height };
    aplicarGeometria(card, to);

    // O fundo assume a imagem com Ken Burns mais agressivo
    const layers = Array.from(document.querySelectorAll('.kz-hero__bg'));
    const current = layers.find(l => l.classList.contains('is-on')) || layers[0];
    if (current) {
        current.style.backgroundImage = `url('${slide.imagemURL || DEFAULT_BG}')`;
    }

    // Esconde elementos concorrentes
    intro?.classList.add('opacity-0', '-translate-x-4');
    rail?.classList.add('is-immersive');
    rail?.classList.remove('opacity-100');
    rail?.classList.add('opacity-0');
    document.getElementById('kz-hero')?.classList.add('is-zoom');

    // Preenche o painel de detalhes
    $('#kz-news-kind').textContent = 'Atualização em destaque';
    $('#kz-news-title').textContent = slide.titulo || '';
    $('#kz-news-text').textContent = slide.subtitulo || 'Clique fora da imagem ou pressione Esc para voltar.';

    const cta = $('#kz-news-cta');
    const ctaLabel = $('#kz-news-cta-label');
    if (slide.linkBotao) {
        cta.href = slide.linkBotao;
        ctaLabel.textContent = slide.textoBotao || 'Ver Conteúdo';
        cta.classList.remove('hidden');
    } else {
        cta.classList.add('hidden');
    }
    news?.classList.add('is-on');
    exit?.classList.add('is-visible');
    immersiveOpenedAt = performance.now();

    // Fecha sozinho após 30s (comportamento original) + barra de contagem
    clearTimeout(immersiveTimer);
    startImmersiveCountdown();
    immersiveTimer = setTimeout(() => exitImmersive(), IMMERSIVE_MS);
}

/** Barra regressiva: mostra visualmente que o modo imersivo dura 30s. */
function startImmersiveCountdown() {
    cancelAnimationFrame(rafCountdown);

    const box = $('#kz-timer');
    const fill = $('#kz-timer-fill');
    const label = $('#kz-timer-label');
    if (!box || !fill || !label) return;

    const startedAt = performance.now();

    const paint = (now) => {
        const elapsed = now - startedAt;
        const remaining = Math.max(0, IMMERSIVE_MS - elapsed);
        const pct = remaining / IMMERSIVE_MS;

        fill.style.transform = `scaleX(${pct.toFixed(4)})`;
        label.textContent = `Fechando em ${Math.ceil(remaining / 1000)}s`;
        return remaining;
    };

    const tick = (now) => {
        if (!isImmersive) return;
        const remaining = paint(now);
        if (remaining > 0 && immersiveTimer) {
            rafCountdown = requestAnimationFrame(tick);
        }
    };

    box.classList.add('is-visible');
    // Primeiro desenho síncrono: em aba oculta o rAF não roda e a barra
    // ficaria vazia (0%) enquanto o texto nem apareceria.
    paint(startedAt);
    if (!semFrames()) requestAnimationFrame(tick);
}

function stopImmersiveCountdown() {
    cancelAnimationFrame(rafCountdown);
    rafCountdown = null;
    $('#kz-timer')?.classList.remove('is-visible');
}

function exitImmersive() {
    if (!isImmersive) return;
    isImmersive = false;
    clearTimeout(immersiveTimer);
    immersiveTimer = null;
    stopImmersiveCountdown();
    // Se a geometria final ainda não foi escrita, cancela: senão ela roda
    // depois da limpeza e deixa o card preso em tela cheia.
    cancelPendingGeo();

    // O card ampliado NÃO é necessariamente o `activeIndex` (a chamada pode
    // vir de `expandNews(i)` ou de um clique). Guardamos o índice na entrada
    // — usar `activeIndex` aqui deixava o card ampliado preso em
    // `position: fixed` e restaurava outro card sem querer.
    const idx = Number.isInteger(immersiveIndex) ? immersiveIndex : activeIndex;
    immersiveIndex = null;

    const card = $('#kz-track')?.children[idx];
    const rail = $('#kz-rail');
    const intro = $('#kz-intro');
    const news = $('#kz-news');
    const exit = $('#kz-exit');

    news?.classList.remove('is-on');
    exit?.classList.remove('is-visible');
    document.getElementById('kz-hero')?.classList.remove('is-zoom');

    if (card) {
        // REFATORADO: antes eram calculados left/top/width/height e em seguida
        // sobrescritos por `limparGeometria` no rAF seguinte — trabalho
        // descartado que ainda produzia um salto de 1 frame (o card ficava
        // deslocado até o rAF rodar). Basta devolver o card ao fluxo do trilho.
        card.classList.remove('is-zoom');
        card.style.cssText = '';
    }

    rail?.classList.remove('is-immersive', 'opacity-0');
    rail?.classList.add('opacity-100');
    intro?.classList.remove('opacity-0', '-translate-x-4');

    // Volta o fundo padrão (nativo)
    const layers = Array.from(document.querySelectorAll('.kz-hero__bg'));
    layers.forEach((l, i) => {
        l.style.backgroundImage = `url('${DEFAULT_BG}')`;
        l.classList.toggle('is-on', i === 0);
        l.classList.toggle('kz-kenburns', i === 0 && !prefersReducedMotion);
    });
    startAutoplay();
}

/* ============================================================================
   EVENTOS (mouse + caneta + toque via Pointer Events, roda, teclado)
   ========================================================================== */
function wireEvents() {
    const hero = $('#kz-hero');
    const viewport = $('#kz-viewport');
    const track = $('#kz-track');
    if (!hero || !viewport || !track) return;

    let startX = 0, startY = 0, startOffset = 0, dragging = false, isRealDrag = false;
    let downCard = null, downIdx = null;
    let pointerId = null, axisLocked = null;
    let lastX = 0, lastT = 0, velocity = 0;
    let lastHandledClickTime = 0;

    const offsetNow = () => {
        const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
        return m.m41;
    };

    /* ---- ARRASTO (1:1 com o ponteiro) E CLIQUE ROBUSTO ---- */
    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target.closest('.kz-navbtn')) return;

        // Captura o card no momento exato em que o ponteiro encosta
        downCard = e.target.closest('.kz-card');
        downIdx = downCard ? Number(downCard.dataset.index) : null;

        dragging = true;
        isRealDrag = false;
        axisLocked = null;
        pointerId = e.pointerId;

        startX = lastX = e.clientX;
        startY = e.clientY;
        lastT = performance.now();
        velocity = 0;
        startOffset = offsetNow();

        stopAutoplay();
    };

    const onMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Enquanto o deslocamento for menor que 8px, consideramos tolerância de clique (não arrasto)
        if (!isRealDrag) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

            // Se o movimento dominante for vertical, permite scroll da página
            if (Math.abs(dy) > Math.abs(dx)) {
                dragging = false;
                startAutoplay();
                return;
            }

            // Confirmado arrasto horizontal real
            isRealDrag = true;
            axisLocked = 'x';
            viewport.classList.add('is-dragging');
            track.style.transition = 'none';
            try { viewport.setPointerCapture(pointerId); } catch (_) { /* ignora */ }
        }

        // Flick detection
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        velocity = (e.clientX - lastX) / dt;
        lastX = e.clientX;
        lastT = now;

        track.style.transform = `translate3d(${startOffset + dx}px, 0, 0)`;
        e.preventDefault();
    };

    const onUp = (e) => {
        if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
        dragging = false;

        // 1. SE FOI ARRASTO REAL: finaliza o movimento no trilho
        if (isRealDrag) {
            viewport.classList.remove('is-dragging');
            track.style.transition = '';
            try { viewport.releasePointerCapture(pointerId); } catch (_) { /* ignora */ }
            pointerId = null;

            const dx = e.clientX - startX;
            const step = cardStep();

            let target = activeIndex;
            if (Math.abs(dx) > step * DRAG_RATIO || Math.abs(velocity) > FLICK_VELOCITY) {
                const flickDir = Math.abs(velocity) > FLICK_VELOCITY
                    ? (velocity < 0 ? 1 : -1)
                    : (dx < 0 ? 1 : -1);
                target = activeIndex + flickDir;
            } else if (Math.abs(dx) > 6) {
                springBackToActive();
                startAutoplay();
                lastHandledClickTime = Date.now();
                return;
            }

            if (target === activeIndex) {
                centerIndex(activeIndex);
            } else {
                goTo(target);
            }
            lastHandledClickTime = Date.now();
            return;
        }

        // 2. SE NÃO FOI ARRASTO: É UM CLIQUE LEGÍTIMO NO CARD!
        pointerId = null;
        if (downCard && !isNaN(downIdx) && downIdx !== null) {
            lastHandledClickTime = Date.now();
            const targetIdx = downIdx;
            downCard = null;
            downIdx = null;

            // Se não for o slide ativo, atualiza para ele e abre em tela cheia na hora
            if (targetIdx !== activeIndex) updateActive(targetIdx, { silent: true });
            enterImmersive(targetIdx);
            return;
        }

        startAutoplay();
    };

    const onCancel = () => {
        dragging = false;
        isRealDrag = false;
        downCard = null;
        downIdx = null;
        viewport.classList.remove('is-dragging');
        track.style.transition = '';
        startAutoplay();
    };

    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove, { passive: false });
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onCancel);

    /* ---- CLIQUE NO CARD -> ZOOM IN (FALLBACK MOUSE/TECLADO) ---- */
    track.addEventListener('click', (e) => {
        if (isRealDrag || Date.now() - lastHandledClickTime < 400) return;
        const card = e.target.closest?.('.kz-card');
        if (!card) return;
        const idx = Number(card.dataset.index);
        if (isNaN(idx)) return;
        lastHandledClickTime = Date.now();
        if (idx !== activeIndex) updateActive(idx, { silent: true });
        enterImmersive(idx);
    });

    /* ---- RODA DO MOUSE / TRACKPAD ---- */
    const onWheel = (e) => {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 2) return;

        const now = performance.now();
        if (now - wheelLast < WHEEL_THROTTLE_MS) return;
        wheelLast = now;

        e.preventDefault();
        hoverPreview = true;
        go(delta > 0 ? 1 : -1);
        clearTimeout(bgTimer);
        bgTimer = setTimeout(() => { hoverPreview = false; startAutoplay(); }, 260);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    hero.addEventListener('wheel', onWheel, { passive: false });

    /* ---- HOVER / FOCUS ---- */
    viewport.addEventListener('mouseenter', () => { hoverPreview = true; stopAutoplay(); });
    viewport.addEventListener('mouseleave', () => { hoverPreview = false; startAutoplay(); });

    /* ---- BOTÕES ---- */
    $('#kz-prev')?.addEventListener('click', () => go(-1));
    $('#kz-next')?.addEventListener('click', () => go(1));
    $('#kz-exit')?.addEventListener('click', () => exitImmersive());

    /* ---- CLIQUE PARA SAIR (modo imersivo) ----
           Dois bugs corrigidos aqui:
           1) Antes excluíamos `.kz-card` do "sai ao clicar". Como o card
              ampliado é `position: fixed` cobrindo o hero INTEIRO,
              `closest('.kz-card')` era sempre verdadeiro e `exitImmersive()`
              nunca era chamado — impossível voltar ao carrossel clicando.
              Agora só o painel de detalhes (que contém o botão) é ignorado.
           2) O `click` do mesmo gesto que ABRIU o modo imersivo chegaria aqui
              já com o card ampliado e fecharia tudo na hora (piscar).
              A janela GHOST_CLICK_MS separa "abrir" de "fechar". */
    hero.addEventListener('click', (e) => {
        if (!isImmersive) return;
        if (e.target.closest('.kz-news')) return;   // painel: não fecha aqui
        if (e.target.closest('.kz-exit')) return;    // o próprio X cuida do exit
        if (performance.now() - immersiveOpenedAt < GHOST_CLICK_MS) return;
        e.preventDefault();
        exitImmersive();
    });

    /* ---- TECLADO ---- */
    document.addEventListener('keydown', onKeydown);

    /* ---- REDIMENSIONAMENTO ---- */
    window.addEventListener('resize', onResize);

    /* ---- CONTROLE POR SCROLL (setas do teclado) ---- */
    viewport.addEventListener('focusin', () => { hoverPreview = true; stopAutoplay(); });
    viewport.addEventListener('focusout', () => { hoverPreview = false; startAutoplay(); });
}

function onKeydown(e) {
    if ($('#kz-hero')?.closest('.hidden')) return;   // aba inativa

    switch (e.key) {
        case 'ArrowRight':
            e.preventDefault(); go(1); break;
        case 'ArrowLeft':
            e.preventDefault(); go(-1); break;
        case 'Escape':
            if (isImmersive) { e.preventDefault(); exitImmersive(); }
            break;
        case 'Enter':
        case ' ':
            if (document.activeElement?.classList.contains('kz-card')) {
                e.preventDefault();
                enterImmersive(activeIndex);
            }
            break;
    }
}

/** Inércia: aplica um deslocamento residual que decai quadro a quadro */
function applyInertia(initialDelta, initialVelocity) {
    cancelAnimationFrame(rafInertia);
    if (prefersReducedMotion) { centerIndex(activeIndex); return; }

    let delta = initialDelta;
    let vel = initialVelocity;
    let last = performance.now();
    const track = $('#kz-track');
    if (!track) return;

    const step = () => {
        const now = performance.now();
        const dt = Math.min(32, now - last);
        last = now;

        vel *= 0.92;
        delta += vel * dt;

        const current = offsetNow();
        track.style.transition = 'none';
        track.style.transform = `translate3d(${current + delta}px, 0, 0)`;
        delta *= 0.86;

        if (Math.abs(vel) > 0.02 || Math.abs(delta) > 0.5) {
            rafInertia = requestAnimationFrame(step);
        } else {
            centerIndex(activeIndex);
        }
    };
    rafInertia = requestAnimationFrame(step);
}

/** Volta elásticamente ao card ativo após um arrasto curto demais.
    Mola amortecida: passa um pouco do alvo e reassenta — evita o "salto"
    seco e dá a sensação de pegada física. */
function springBackToActive() {
    cancelAnimationFrame(rafInertia);

    const track = $('#kz-track');
    if (!track) return;
    if (prefersReducedMotion) { centerIndex(activeIndex); return; }

    const start = offsetNow();
    const home = centerOffsetFor(activeIndex);
    if (Math.abs(home - start) < 0.5) { centerIndex(activeIndex); return; }

    const K = 0.16;   // rigidez
    const D = 0.78;   // amortecimento
    let pos = 0;     // deslocamento relativo ao ponto de partida
    let vel = 0;

    const step = () => {
        const target = home - (start + pos);
        vel = (vel + target * K) * D;
        pos += vel;

        track.style.transition = 'none';
        track.style.transform = `translate3d(${start + pos}px, 0, 0)`;

        if (Math.abs(vel) > 0.05 || Math.abs(target) > 0.4) {
            rafInertia = requestAnimationFrame(step);
        } else {
            track.style.transition = '';
            centerIndex(activeIndex);
        }
    };
    rafInertia = requestAnimationFrame(step);
}

function onResize() {
    clearTimeout(bgTimer);
    bgTimer = setTimeout(() => {
        centerIndex(activeIndex, false);
        updateCounters();
    }, 90);
}

/* ============================================================================
   API GLOBAL (compatibilidade com index.html e outros módulos)
   ========================================================================== */
window.inicio = {
    /**
     * Abre o zoom em um card. `imgUrl` é opcional: se informado, passa a valer
     * como imagem do slide naquele índice (o parâmetro existia na assinatura mas
     * era descartado — a imagem exibida podia ser outra).
     */
    expandNews: function (imgUrl, index) {
        const i = Number(index);
        if (imgUrl) {
            if (slides[i]) slides[i] = { ...slides[i], imagemURL: imgUrl };
            else slides[i] = { id: 'api', titulo: '', imagemURL: imgUrl, subtitulo: '', texto: '' };
        }
        enterImmersive(i);
    },
    revertToDefault: function () {
        exitImmersive();
    }
};

/* ============================================================================
   LIMPEZA
   ========================================================================== */
function teardown() {
    stopAutoplay();
    cancelAnimationFrame(rafInertia);
    stopImmersiveCountdown();
    cancelPendingGeo();
    clearTimeout(bgTimer);
    clearTimeout(immersiveTimer);

    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);

    window.isDraggingCard = false;
    isImmersive = false;
    immersiveIndex = null;
    hoverPreview = false;
    bgTimer = null;
    immersiveTimer = null;
    rafInertia = null;
    rafCountdown = null;
    rafGeo = null;
    immersiveOpenedAt = -Infinity;
    wheelLast = 0;
}