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
const WHEEL_THROTTLE_MS = 130;
const FLICK_VELOCITY = 0.45;   // px/ms mínimo para contar como "flick"
const DRAG_RATIO = 0.15;       // 15% da largura do card = troca de slide

let slides = [];
let activeIndex = 0;
let isImmersive = false;
let hoverPreview = false;
let prefersReducedMotion = false;

// Timers/RAF (guardados para poder ser cancelados ao trocar de aba)
let bgTimer = null;
let immersiveTimer = null;
let autoplayTimer = null;
let wheelLast = 0;
let rafInertia = null;

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

/** Coloca o card ativo centralizado (com peek nas bordas) */
function centerIndex(i, animate = true) {
    const track = $('#kz-track');
    const viewport = $('#kz-viewport');
    if (!track || !viewport || track.children.length === 0) return;

    const card = track.children[i];
    if (!card) return;

    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    // Centro do card alvo relativo ao trilho
    const cardCenter = (cardRect.left + cardRect.width / 2) - track.getBoundingClientRect().left;
    const target = (viewportRect.width / 2) - cardCenter;

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

    const url = slide.imagemURL || DEFAULT_BG;
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
    isImmersive = true;
    stopAutoplay();

    const card = $('#kz-track')?.children[index];
    const hero = $('#kz-hero');
    const rail = $('#kz-rail');
    const intro = $('#kz-intro');
    const news = $('#kz-news');
    const exit = $('#kz-exit');
    const slide = slides[index];
    if (!card || !hero || !slide) return;

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

    // Estado final: cobre o hero inteiro
    const to = { left: heroRect.left, top: heroRect.top, width: heroRect.width, height: heroRect.height };

    requestAnimationFrame(() => {
        card.style.left = `${to.left}px`;
        card.style.top = `${to.top}px`;
        card.style.width = `${to.width}px`;
        card.style.height = `${to.height}px`;
    });

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

    // Fecha sozinho após 30s (comportamento original)
    clearTimeout(immersiveTimer);
    immersiveTimer = setTimeout(() => exitImmersive(), 30000);
}

function exitImmersive() {
    if (!isImmersive) return;
    isImmersive = false;
    clearTimeout(immersiveTimer);

    const card = $('#kz-track')?.children[activeIndex];
    const rail = $('#kz-rail');
    const intro = $('#kz-intro');
    const news = $('#kz-news');
    const exit = $('#kz-exit');

    news?.classList.remove('is-on');
    exit?.classList.remove('is-visible');
    document.getElementById('kz-hero')?.classList.remove('is-zoom');

    if (card) {
        // Recalcula a posição original do card dentro do trilho
        const railRect = rail.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        card.style.left = `${cardRect.left - railRect.left}px`;
        card.style.top = `${cardRect.top - railRect.top}px`;
        card.style.width = `${cardRect.width}px`;
        card.style.height = `${cardRect.height}px`;
        card.classList.add('is-zoom');

        requestAnimationFrame(() => {
            card.classList.remove('is-zoom');
            card.style.position = '';
            card.style.left = '';
            card.style.top = '';
            card.style.width = '';
            card.style.height = '';
        });
    }

    rail?.classList.remove('is-immersive', 'opacity-0');
    rail?.classList.add('opacity-100');
    intro?.classList.remove('opacity-0', '-translate-x-4');

    // Volta o fundo padrão
    swapBackground(-1);
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

    let startX = 0, startY = 0, startOffset = 0, dragging = false, movedEnough = false;
    let pointerId = null, axisLocked = null;
    let lastX = 0, lastT = 0, velocity = 0;

    const offsetNow = () => {
        const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
        return m.m41;
    };

    /* ---- ARRASTO (1:1 com o ponteiro) ---- */
    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target.closest('.kz-navbtn')) return;

        dragging = true;
        movedEnough = false;
        axisLocked = null;
        pointerId = e.pointerId;

        startX = lastX = e.clientX;
        startY = e.clientY;
        lastT = performance.now();
        velocity = 0;
        startOffset = offsetNow();

        stopAutoplay();
        viewport.classList.add('is-dragging');
        track.style.transition = 'none';
        try { viewport.setPointerCapture(pointerId); } catch (_) { /* ignora */ }
    };

    const onMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Trava o eixo no primeiro movimento dominante (evita roubar o scroll vertical)
        if (!axisLocked) {
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
            axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (axisLocked === 'y') {
                dragging = false;
                viewport.classList.remove('is-dragging');
                track.style.transition = '';
                try { viewport.releasePointerCapture(pointerId); } catch (_) { /* ignora */ }
                startAutoplay();
                return;
            }
            viewport.setPointerCapture?.(pointerId);
        }

        if (Math.abs(dx) > 6) movedEnough = true;

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
        viewport.classList.remove('is-dragging');
        track.style.transition = '';
        try { viewport.releasePointerCapture(pointerId); } catch (_) { /* ignora */ }
        pointerId = null;

        const dx = e.clientX - startX;
        const step = cardStep();

        let target = activeIndex;
        if (Math.abs(dx) > step * DRAG_RATIO || Math.abs(velocity) > FLICK_VELOCITY) {
            // Direção do flick tem prioridade sobre o deslocamento bruto
            const flickDir = Math.abs(velocity) > FLICK_VELOCITY
                ? (velocity < 0 ? 1 : -1)
                : (dx < 0 ? 1 : -1);
            target = activeIndex + flickDir;
        } else if (Math.abs(dx) > 4) {
            // Arrasto curto sem troca: devolve elásticamente ao lugar
            springBackToActive();
            startAutoplay();
            return;
        }

        if (target === activeIndex) {
            centerIndex(activeIndex);
        } else {
            goTo(target);
        }
    };

    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove, { passive: false });
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', () => {
        dragging = false;
        viewport.classList.remove('is-dragging');
        track.style.transition = '';
        startAutoplay();
    });

    /* ---- CLIQUE NO CARD -> ZOOM IN ---- */
    track.addEventListener('click', (e) => {
        const card = e.target.closest('.kz-card');
        if (!card) return;
        if (movedEnough) return;              // foi arrasto, não clique
        const idx = Number(card.dataset.index);
        if (idx === activeIndex) {
            enterImmersive(idx);
        } else {
            goTo(idx);
        }
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

    /* ---- CLIQUE NO FUNDO PARA SAIR (modo imersivo) ---- */
    hero.addEventListener('click', (e) => {
        if (!isImmersive) return;
        if (e.target.closest('.kz-card') || e.target.closest('.kz-news')) return;
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
    expandNews: function (imgUrl, index) {
        enterImmersive(Number(index));
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
    clearTimeout(bgTimer);
    clearTimeout(immersiveTimer);

    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);

    window.isDraggingCard = false;
    isImmersive = false;
    hoverPreview = false;
    bgTimer = null;
    immersiveTimer = null;
    rafInertia = null;
    wheelLast = 0;
}