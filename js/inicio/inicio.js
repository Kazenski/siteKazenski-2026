import { db } from '../core/firebase.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

// Imagem padrão do site do Professor Kazenski
const DEFAULT_BG = 'imagens/background/background-oficial.jpg';

let inicioState = {
    slides: [],
    currentIndex: 0,
    interval: null
};

export async function renderInicioTab() {
    const container = document.getElementById('inicio-content');
    if (!container) return;

    // Layout Imersivo: Fundo Absoluto, Gradientes Escuros e Carrossel na Base
    container.innerHTML = `
        <div class="relative w-full h-full flex flex-col justify-end bg-slate-950 overflow-hidden animate-fade-in">
            
            <div id="main-bg" class="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out scale-105" 
                 style="background-image: url('${DEFAULT_BG}');">
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-0"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/60 to-transparent z-0"></div>

            <div class="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 pb-10 pt-20 flex-grow flex flex-col justify-end">
                <div id="main-content" class="max-w-3xl transform transition-all duration-500 translate-y-0 opacity-100">
                    <h1 id="slide-title" class="text-4xl md:text-6xl font-bold text-white font-cinzel mb-4 drop-shadow-lg leading-tight">
                        Prof. Eduardo Kazenski
                    </h1>
                    <p id="slide-desc" class="text-lg md:text-xl text-blue-200 mb-8 drop-shadow-md leading-relaxed line-clamp-4">
                        Inovação, ensino e desenvolvimento de software. Acompanhe os projetos, artigos e ferramentas criadas para transformar a educação tecnológica.
                    </p>
                    <div id="slide-action" class="h-14">
                        </div>
                </div>
            </div>

            <div class="relative z-20 w-full bg-slate-950/80 backdrop-blur-md border-t border-blue-900/30 py-6 px-6 md:px-12 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-6">
                    
                    <div class="shrink-0">
                        <h3 class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Central de Novidades</h3>
                        <p class="text-[10px] text-slate-400">Selecione para expandir</p>
                    </div>
                    
                    <div class="w-px h-12 bg-slate-800 hidden md:block"></div>

                    <div id="thumbnails-container" class="flex gap-4 overflow-x-auto custom-scroll pb-2 pt-1 w-full snap-x">
                        <div class="flex items-center gap-3 text-slate-500 text-sm italic font-bold">
                            <i class="fas fa-spinner fa-spin text-blue-500"></i> Carregando banco de dados...
                        </div>
                    </div>

                </div>
            </div>

        </div>
    `;

    await fetchSlides();
}

async function fetchSlides() {
    try {
        const q = query(collection(db, "atualizacoes"), where('ativa', '==', true), orderBy('ordem'));
        const snapshot = await getDocs(q);
        
        inicioState.slides = snapshot.docs.map(doc => doc.data());
        
        if (inicioState.slides.length > 0) {
            renderThumbnails();
            window.kazInicio.selectSlide(0); // Força a primeira carta a abrir
            startAutoPlay();
        } else {
            document.getElementById('thumbnails-container').innerHTML = `
                <div class="text-slate-500 text-sm italic py-2">Nenhuma publicação ativa no momento. O sistema exibirá o perfil padrão.</div>
            `;
        }
    } catch (error) {
        console.error("Erro ao carregar atualizações:", error);
        document.getElementById('thumbnails-container').innerHTML = `
            <div class="text-red-500 text-sm font-bold py-2"><i class="fas fa-exclamation-triangle mr-2"></i> Falha ao carregar as notícias.</div>
        `;
    }
}

function renderThumbnails() {
    const container = document.getElementById('thumbnails-container');
    if (!container) return;

    container.innerHTML = inicioState.slides.map((slide, index) => {
        const bg = slide.imagemURL || DEFAULT_BG;
        return `
            <div id="thumb-${index}" onclick="window.kazInicio.selectSlide(${index})" class="thumb-card shrink-0 w-48 h-28 rounded-xl border-2 border-slate-800 opacity-50 hover:opacity-100 cursor-pointer overflow-hidden relative transition-all duration-300 snap-start group bg-slate-900">
                <div class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style="background-image: url('${bg}');"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent"></div>
                <div class="absolute bottom-0 w-full p-3 border-t border-blue-500/0 group-hover:border-blue-500/50 transition-colors">
                    <p class="text-slate-200 text-xs font-bold truncate drop-shadow-lg">${escapeHTML(slide.titulo)}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------------
// AÇÕES EXPOSTAS NO WINDOW (Para serem chamadas pelos eventos onClick do HTML)
// ---------------------------------------------------------------------------
window.kazInicio = {
    selectSlide: (index) => {
        inicioState.currentIndex = index;
        const slide = inicioState.slides[index];
        if (!slide) return;

        // 1. Atualizar Imagem de Fundo (com efeito de zoom out suave)
        const bgEl = document.getElementById('main-bg');
        if (bgEl) {
            bgEl.classList.remove('scale-105');
            bgEl.classList.add('scale-110', 'opacity-80'); // Cria um "piscar" e esticar
            
            setTimeout(() => {
                bgEl.style.backgroundImage = `url('${slide.imagemURL || DEFAULT_BG}')`;
                bgEl.classList.remove('scale-110', 'opacity-80');
                bgEl.classList.add('scale-105');
            }, 300); // Sincronizado com o CSS
        }

        // 2. Animar a troca de Textos
        const contentEl = document.getElementById('main-content');
        if (contentEl) {
            contentEl.classList.remove('translate-y-0', 'opacity-100');
            contentEl.classList.add('translate-y-4', 'opacity-0');

            setTimeout(() => {
                const titleEl = document.getElementById('slide-title');
                const descEl = document.getElementById('slide-desc');
                const actionEl = document.getElementById('slide-action');
                
                if (titleEl) titleEl.innerHTML = escapeHTML(slide.titulo || '');
                if (descEl) descEl.innerHTML = escapeHTML(slide.subtitulo || '');
                
                if (actionEl) {
                    if (slide.linkBotao && slide.textoBotao) {
                        actionEl.innerHTML = `<a href="${escapeHTML(slide.linkBotao)}" target="_blank" class="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:scale-105 uppercase tracking-widest text-sm border border-blue-400"><i class="fas fa-external-link-alt"></i> ${escapeHTML(slide.textoBotao)}</a>`;
                    } else {
                        actionEl.innerHTML = '';
                    }
                }

                contentEl.classList.remove('translate-y-4', 'opacity-0');
                contentEl.classList.add('translate-y-0', 'opacity-100');
            }, 300);
        }

        // 3. Atualizar Estado das Thumbnails no rodapé
        document.querySelectorAll('.thumb-card').forEach((el, i) => {
            if (i === index) {
                el.classList.add('border-blue-500', 'shadow-[0_0_15px_rgba(59,130,246,0.5)]', 'opacity-100');
                el.classList.remove('border-slate-800', 'opacity-50');
            } else {
                el.classList.remove('border-blue-500', 'shadow-[0_0_15px_rgba(59,130,246,0.5)]', 'opacity-100');
                el.classList.add('border-slate-800', 'opacity-50');
            }
        });

        // 4. Resetar o relógio automático
        resetAutoPlay();
    }
};

// Lógica de Autoplay
function nextSlide() {
    if (inicioState.slides.length <= 1) return;
    const next = (inicioState.currentIndex + 1) % inicioState.slides.length;
    window.kazInicio.selectSlide(next);
}

function startAutoPlay() {
    if (inicioState.slides.length > 1) {
        clearInterval(inicioState.interval);
        inicioState.interval = setInterval(nextSlide, 8000); // 8 segundos por slide
    }
}

function resetAutoPlay() {
    clearInterval(inicioState.interval);
    startAutoPlay();
}