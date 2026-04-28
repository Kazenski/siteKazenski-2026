import { db } from '../core/firebase.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

let slides = [];
const defaultBg = "imagens/background/background-oficial.jpg"; 
let bgTimeout;
let isViewingCard = false;

export async function renderInicioTab() {
    const container = document.getElementById('inicio-content');
    if (!container) return;

    isViewingCard = false;
    clearTimeout(bgTimeout);
    CarrosselInicio.pararAutoPlay();

    container.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-slate-950 fade-in">
            
            <div id="inicio-main-bg" class="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out opacity-0" style="background-image: url('${defaultBg}');">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-95"></div>
                <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/40 to-transparent opacity-80"></div>
            </div>

            <div id="inicio-default-text" class="relative z-10 flex flex-col justify-center h-[55%] px-10 md:px-24 transition-all duration-700">
                <h1 class="text-5xl md:text-7xl lg:text-8xl font-cinzel font-black text-blue-600 tracking-tighter drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] leading-none">
                    PROF. <br> <span class="text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">KAZENSKI</span>
                </h1>
                <p class="text-sm md:text-lg text-slate-400 mt-4 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] max-w-xl leading-relaxed italic border-l-2 border-blue-600/50 pl-4">
                    "Código, lógica e educação tecnológica. Transformando o futuro através do desenvolvimento."
                </p>
            </div>

            <div id="inicio-news-info" class="absolute top-[15%] left-10 md:left-24 z-20 text-left max-w-xl opacity-0 translate-y-6 transition-all duration-700 pointer-events-none">
                <h2 id="inicio-news-title" class="font-cinzel text-3xl md:text-5xl font-bold text-white drop-shadow-[0_4px_10px_rgba(0,0,0,1)] mb-3 leading-tight"></h2>
                <p id="inicio-news-subtitle" class="text-slate-300 text-sm md:text-base drop-shadow-[0_2px_5px_rgba(0,0,0,1)] leading-relaxed max-w-md"></p>
                <a id="inicio-news-btn" href="#" target="_blank" class="inline-block mt-6 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-[10px] rounded shadow-lg transition-all pointer-events-auto border border-blue-400/30">Ver Conteúdo</a>
            </div>

            <div class="absolute bottom-0 left-0 w-full z-30 pb-6 px-10 md:px-24 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent pt-10">
                <div class="flex items-center justify-between mb-3 border-b border-white/5 pb-1">
                    <h3 class="text-blue-500/80 font-cinzel font-bold tracking-widest text-[9px] uppercase">
                        <i class="fas fa-thumbtack mr-1"></i> Feed de Atualizações
                    </h3>
                </div>
                
                <div id="inicio-cards-container" class="flex gap-4 overflow-hidden pb-2 no-scrollbar">
                    <div class="flex items-center justify-center w-full h-24 text-blue-500">
                        <i class="fas fa-circle-notch fa-spin text-2xl"></i>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const bgEl = document.getElementById('inicio-main-bg');
        if (bgEl) bgEl.classList.replace('opacity-0', 'opacity-100');
    }, 50);

    await fetchNoticias();
}

async function fetchNoticias() {
    const container = document.getElementById('inicio-cards-container');
    if (!container) return;

    try {
        const q = query(collection(db, "atualizacoes"), where('ativa', '==', true), orderBy('ordem'));
        const snapshot = await getDocs(q);
        slides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (slides.length > 0) {
            renderSmallCards();
            CarrosselInicio.init(); 
        } else {
            container.innerHTML = `<div class="text-slate-500 italic text-xs">Nenhuma atualização disponível.</div>`;
        }
    } catch (error) {
        console.error("Erro ao carregar banco:", error);
        container.innerHTML = `<div class="text-red-500 text-xs">Erro de conexão.</div>`;
    }
}

function renderSmallCards() {
    const container = document.getElementById('inicio-cards-container');
    if (!container) return;

    container.innerHTML = slides.map((slide, index) => {
        const imgUrl = slide.imagemURL || 'https://placehold.co/400x300/1e293b/a1a1aa?text=Eduardo';
        
        // Cards reduzidos: w-48 (mobile) e w-64 (desktop) com altura discreta
        return `
            <div class="card-carrossel shrink-0 cursor-pointer group w-48 md:w-64 h-28 md:h-36 relative rounded-lg overflow-hidden border border-white/10 hover:border-blue-500/50 transition-all duration-500 shadow-xl"
                 onclick="window.inicio.expandNews('${imgUrl}', ${index})">
                
                <img src="${imgUrl}" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent"></div>
                
                <div class="absolute bottom-2 left-3 right-3">
                    <h4 class="text-white font-cinzel font-bold text-[10px] md:text-xs leading-tight drop-shadow-md line-clamp-2 uppercase tracking-wide">${escapeHTML(slide.titulo)}</h4>
                </div>
            </div>
        `;
    }).join('');
}

window.inicio = {
    expandNews: function(imgUrl, index) {
        const bgEl = document.getElementById('inicio-main-bg');
        const defTxt = document.getElementById('inicio-default-text');
        const infoEl = document.getElementById('inicio-news-info');
        const titleEl = document.getElementById('inicio-news-title');
        const subtitleEl = document.getElementById('inicio-news-subtitle');
        const btnEl = document.getElementById('inicio-news-btn');

        if (!bgEl) return;
        isViewingCard = true;

        defTxt.classList.add('opacity-0', 'pointer-events-none', '-translate-x-4');
        
        bgEl.classList.remove('opacity-100');
        setTimeout(() => {
            bgEl.style.backgroundImage = `url('${imgUrl}')`;
            bgEl.classList.add('opacity-100');
        }, 300);

        const slide = slides[index];
        if (slide) {
            titleEl.textContent = slide.titulo;
            subtitleEl.textContent = slide.subtitulo;
            btnEl.href = slide.linkBotao || "#";
            btnEl.style.display = slide.linkBotao ? 'inline-block' : 'none';

            infoEl.classList.remove('opacity-0', 'translate-y-6');
            infoEl.classList.add('opacity-100', 'translate-y-0');
        }

        clearTimeout(bgTimeout);
        bgTimeout = setTimeout(() => {
            this.revertToDefault();
        }, 30000);
    },

    revertToDefault: function() {
        const bgEl = document.getElementById('inicio-main-bg');
        const defTxt = document.getElementById('inicio-default-text');
        const infoEl = document.getElementById('inicio-news-info');

        isViewingCard = false;
        if (bgEl) bgEl.style.backgroundImage = `url('${defaultBg}')`;
        if (defTxt) defTxt.classList.remove('opacity-0', 'pointer-events-none', '-translate-x-4');
        if (infoEl) {
            infoEl.classList.remove('opacity-100', 'translate-y-0');
            infoEl.classList.add('opacity-0', 'translate-y-6');
        }
    }
};

const CarrosselInicio = {
    container: null,
    cards: [],
    intervalo: null,
    velocidade: 4000, // Um pouco mais lento para ficar mais suave

    init() {
        this.container = document.getElementById('inicio-cards-container');
        if (!this.container) return;
        this.cards = Array.from(this.container.querySelectorAll('.card-carrossel'));
        if (this.cards.length <= 1) return;

        this.container.style.display = 'flex';
        this.container.style.alignItems = 'center';
        this.container.style.transition = 'transform 1s ease-in-out';
        this.iniciarAutoPlay();
        this.configurarEventos();
    },

    moverProximo() {
        if (!this.container || isViewingCard) return;

        const primeiroCard = this.container.firstElementChild;
        if (!primeiroCard) return;
        
        // Gap de 16px (gap-4)
        const larguraCard = primeiroCard.offsetWidth + 16; 
        
        this.container.style.transition = 'transform 1s ease-in-out';
        this.container.style.transform = `translateX(-${larguraCard}px)`;

        setTimeout(() => {
            this.container.style.transition = 'none';
            this.container.appendChild(primeiroCard);
            this.container.style.transform = `translateX(0)`;
        }, 1000);
    },

    iniciarAutoPlay() {
        this.pararAutoPlay();
        this.intervalo = setInterval(() => this.moverProximo(), this.velocidade);
    },

    pararAutoPlay() {
        if (this.intervalo) clearInterval(this.intervalo);
    },

    configurarEventos() {
        if(!this.container) return;
        this.container.addEventListener('mouseenter', () => this.pararAutoPlay());
        this.container.addEventListener('mouseleave', () => this.iniciarAutoPlay());
    }
};