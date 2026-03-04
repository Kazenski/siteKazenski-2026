import { db } from '../core/firebase.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

let slides = [];

// CAMINHO LOCAL DA IMAGEM PADRÃO
const defaultBg = "imagens/background/background-oficial.jpg"; 

let bgTimeout;
let isViewingCard = false;

export async function renderInicioTab() {
    const container = document.getElementById('inicio-content');
    if (!container) return;

    // Resetamos o estado ao entrar na aba
    isViewingCard = false;
    clearTimeout(bgTimeout);

    container.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-slate-950 fade-in">
            
            <div id="inicio-main-bg" class="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out opacity-0" style="background-image: url('${defaultBg}');">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-90"></div>
                <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/60 to-transparent opacity-80"></div>
            </div>

            <div id="inicio-default-text" class="relative z-10 flex flex-col justify-center h-[65%] px-10 md:px-24 transition-all duration-700">
                <h1 class="text-6xl md:text-8xl lg:text-[7rem] font-cinzel font-black text-blue-600 tracking-widest drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] leading-none">
                    PROF. <br> <span class="text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">KAZENSKI</span>
                </h1>
                <p class="text-lg md:text-2xl text-slate-300 mt-6 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] max-w-3xl leading-relaxed italic border-l-4 border-blue-600 pl-6">
                    "Código, lógica e educação tecnológica. Transformando o futuro através do desenvolvimento."
                </p>
            </div>

            <div id="inicio-news-info" class="absolute top-1/4 left-10 md:left-24 z-20 text-left max-w-2xl opacity-0 translate-y-10 transition-all duration-700 pointer-events-none">
                <h2 id="inicio-news-title" class="font-cinzel text-4xl md:text-6xl font-bold text-white drop-shadow-[0_4px_10px_rgba(0,0,0,1)] mb-4"></h2>
                <p id="inicio-news-subtitle" class="text-slate-200 text-lg md:text-xl drop-shadow-[0_2px_5px_rgba(0,0,0,1)] leading-relaxed"></p>
                <a id="inicio-news-btn" href="#" target="_blank" class="inline-block mt-8 px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all pointer-events-auto border border-blue-400">Ver Conteúdo</a>
            </div>

            <div class="absolute bottom-0 left-0 w-full z-30 pb-8 px-10 md:px-24 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pt-12">
                <div class="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                    <h3 class="text-blue-500 font-cinzel font-bold tracking-widest text-sm uppercase">
                        <i class="fas fa-thumbtack mr-2"></i> Destaques e Novidades
                    </h3>
                    <span class="text-[10px] text-slate-500 uppercase tracking-widest animate-pulse">Selecione para expandir</span>
                </div>
                
                <div id="inicio-cards-container" class="flex gap-6 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory no-scrollbar" style="scroll-behavior: smooth;">
                    <div class="flex items-center justify-center w-full h-32 text-blue-500">
                        <i class="fas fa-circle-notch fa-spin text-3xl"></i>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Ativa o background inicial
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
        // Buscamos na coleção de atualizações do professor
        const q = query(collection(db, "atualizacoes"), where('ativa', '==', true), orderBy('ordem'));
        const snapshot = await getDocs(q);
        
        slides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (slides.length > 0) {
            renderSmallCards();
        } else {
            container.innerHTML = `<div class="text-slate-500 italic text-sm">Nenhuma atualização disponível no momento.</div>`;
        }
    } catch (error) {
        console.error("Erro ao carregar banco:", error);
        container.innerHTML = `<div class="text-red-500 text-sm">Erro de conexão com o servidor.</div>`;
    }
}

function renderSmallCards() {
    const container = document.getElementById('inicio-cards-container');
    if (!container) return;

    container.innerHTML = slides.map((slide, index) => {
        const imgUrl = slide.imagemURL || 'https://placehold.co/600x400/1e293b/a1a1aa?text=Kazenski';
        
        return `
            <div class="shrink-0 snap-start cursor-pointer group w-64 md:w-[22rem] h-36 md:h-44 relative rounded-xl overflow-hidden border-2 border-slate-800 hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-1 shadow-2xl"
                 onclick="window.inicio.expandNews('${imgUrl}', ${index})">
                
                <img src="${imgUrl}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
                
                <div class="absolute bottom-3 left-4 right-4">
                    <h4 class="text-white font-cinzel font-bold text-sm md:text-base leading-tight drop-shadow-md line-clamp-2">${escapeHTML(slide.titulo)}</h4>
                </div>
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------------
// AÇÕES DE INTERATIVIDADE
// ---------------------------------------------------------------------------
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

        // 1. Esconde texto padrão e troca background
        defTxt.classList.add('opacity-0', 'pointer-events-none', '-translate-x-10');
        
        bgEl.classList.remove('opacity-100');
        setTimeout(() => {
            bgEl.style.backgroundImage = `url('${imgUrl}')`;
            bgEl.classList.add('opacity-100');
        }, 300);

        // 2. Preenche e mostra informações da notícia
        const slide = slides[index];
        if (slide) {
            titleEl.textContent = slide.titulo;
            subtitleEl.textContent = slide.subtitulo;
            btnEl.href = slide.linkBotao || "#";
            btnEl.style.display = slide.linkBotao ? 'inline-block' : 'none';

            infoEl.classList.remove('opacity-0', 'translate-y-10');
            infoEl.classList.add('opacity-100', 'translate-y-0');
        }

        // 3. Temporizador para retornar ao estado inicial (30 segundos)
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

        // Retorna background padrão
        if (bgEl) bgEl.style.backgroundImage = `url('${defaultBg}')`;
        
        // Retorna texto do Professor
        if (defTxt) defTxt.classList.remove('opacity-0', 'pointer-events-none', '-translate-x-10');

        // Esconde informações da notícia
        if (infoEl) {
            infoEl.classList.remove('opacity-100', 'translate-y-0');
            infoEl.classList.add('opacity-0', 'translate-y-10');
        }
    }
};