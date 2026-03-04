import { db } from '../core/firebase.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

let slides = [];

// CAMINHO LOCAL DA IMAGEM PADRÃO DO PROFESSOR
const defaultBg = "imagens/background/background-oficial.jpg"; 

let bgTimeout;
let isViewingCard = false;

export async function renderInicioTab() {
    const container = document.getElementById('inicio-content');
    if (!container) return;

    // Renderização do esqueleto HTML da página principal
    // Ajustado para tons azuis/profissionais (blue-500, sky-300, etc.)
    container.innerHTML = `
        <div class="relative w-full h-full overflow-hidden bg-slate-950 fade-in">
            
            <div id="inicio-main-bg" class="absolute inset-0 bg-cover transition-all duration-1000 ease-in-out opacity-0" style="background-image: url('${defaultBg}'); background-position: center 20%;">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-95"></div>
                <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent opacity-80"></div>
            </div>

            <div id="inicio-default-text" class="relative z-10 flex flex-col justify-center h-[65%] px-10 md:px-24 transition-opacity duration-700">
                <h1 class="text-5xl md:text-7xl lg:text-[7rem] font-cinzel font-black text-blue-500 tracking-widest drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] leading-none">
                    PROF. <br> <span class="text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">KAZENSKI</span>
                </h1>
                <p class="text-lg md:text-2xl text-slate-300 mt-6 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] max-w-3xl leading-relaxed italic border-l-4 border-blue-500 pl-4">
                    "Código, lógica e educação. Forjando a nova geração de desenvolvedores."
                </p>
            </div>

            <div id="inicio-news-info" class="absolute top-[20%] md:top-1/3 left-10 md:left-24 z-20 text-left max-w-2xl opacity-0 translate-y-4 transition-all duration-700 pointer-events-none">
                <h2 id="inicio-news-title" class="font-cinzel text-4xl md:text-5xl font-bold text-white drop-shadow-[0_4px_10px_rgba(0,0,0,1)] mb-4"></h2>
                <p id="inicio-news-subtitle" class="text-slate-200 text-base md:text-lg drop-shadow-[0_2px_5px_rgba(0,0,0,1)] leading-relaxed"></p>
                <a id="inicio-news-btn" href="#" target="_blank" class="inline-block mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded-lg transition-colors pointer-events-auto shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400">Ver Mais</a>
            </div>

            <div class="absolute bottom-0 left-0 w-full z-30 pb-6 px-10 md:px-24 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pt-12">
                <div class="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                    <h3 class="text-blue-500 font-cinzel font-bold tracking-widest text-sm md:text-base uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                        <i class="fas fa-newspaper mr-2"></i> Últimas Atualizações
                    </h3>
                    <span class="text-xs text-slate-400 italic drop-shadow-md">Selecione para expandir</span>
                </div>
                
                <div id="inicio-cards-container" class="flex gap-6 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style="scroll-behavior: smooth;">
                    <div class="flex items-center justify-center w-full h-32">
                        <div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Animação de entrada suave do Background inicial
    setTimeout(() => {
        const bgEl = document.getElementById('inicio-main-bg');
        if (bgEl && !isViewingCard) {
            bgEl.classList.remove('opacity-0');
            bgEl.classList.add('opacity-100');
        }
    }, 50);

    // Busca dados
    await fetchNoticias();
}

async function fetchNoticias() {
    const cardsContainer = document.getElementById('inicio-cards-container');
    if (!cardsContainer) return;

    try {
        const q = query(collection(db, "atualizacoes"), where('ativa', '==', true), orderBy('ordem'));
        const snapshot = await getDocs(q);
        
        slides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (slides.length > 0) {
            renderSmallCards();
        } else {
            cardsContainer.innerHTML = `<div class="text-slate-400 italic text-sm drop-shadow-md">Nenhuma novidade registrada no momento.</div>`;
        }
    } catch (error) {
        console.error("Erro ao buscar atualizações: ", error);
        cardsContainer.innerHTML = `<div class="text-red-500 text-sm"><i class="fas fa-exclamation-triangle"></i> Falha ao acessar os arquivos do servidor.</div>`;
    }
}

function renderSmallCards() {
    const container = document.getElementById('inicio-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    slides.forEach((slide, index) => {
        // Se não tiver imagem, carrega um placeholder de código/tecnologia
        const imgUrl = slide.imagemURL || 'https://placehold.co/600x400/1e293b/a1a1aa?text=Atualizacao';
        
        const cardHTML = `
            <div class="shrink-0 snap-start cursor-pointer group w-64 md:w-[22rem] h-36 md:h-44 relative rounded-xl overflow-hidden shadow-[0_5px_15px_rgba(0,0,0,0.8)] border-2 border-slate-700 hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_10px_30px_rgba(59,130,246,0.3)]"
                 onclick="window.inicio.changeBackground('${imgUrl}', ${index})">
                
                <img src="${imgUrl}" class="w-full h-full object-cover object-[center_20%] group-hover:scale-110 transition-transform duration-700">
                
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>
                
                <div class="absolute bottom-3 left-4 right-4">
                    <span class="text-blue-400 text-[10px] font-bold tracking-widest uppercase mb-1 block drop-shadow-md">Novidade</span>
                    <h4 class="text-white font-cinzel font-bold text-sm md:text-base leading-tight drop-shadow-md line-clamp-2">${escapeHTML(slide.titulo || 'Nova Atualização')}</h4>
                </div>
            </div>
        `;
        
        container.innerHTML += cardHTML;
    });
}

// ---------------------------------------------------------------------------
// AÇÕES EXPOSTAS NO WINDOW (OnClick do HTML)
// ---------------------------------------------------------------------------
window.inicio = {
    changeBackground: function(imgUrl, index) {
        const bgEl = document.getElementById('inicio-main-bg');
        const defaultTextEl = document.getElementById('inicio-default-text');
        const infoEl = document.getElementById('inicio-news-info');
        const titleEl = document.getElementById('inicio-news-title');
        const subtitleEl = document.getElementById('inicio-news-subtitle');
        const btnEl = document.getElementById('inicio-news-btn');

        if (!bgEl) return;

        isViewingCard = true;

        // Oculta o título grande padrão da página
        if (defaultTextEl) {
            defaultTextEl.classList.remove('opacity-100');
            defaultTextEl.classList.add('opacity-0', 'pointer-events-none');
        }

        // Troca o Background para a imagem da Notícia
        bgEl.style.backgroundImage = `url('${imgUrl}')`;
        bgEl.style.backgroundPosition = 'center 20%';
        bgEl.classList.remove('opacity-0');
        bgEl.classList.add('opacity-100');
        
        // Povoa os dados da notícia na lateral esquerda
        const slide = slides[index];
        if (slide) {
            titleEl.textContent = slide.titulo || '';
            subtitleEl.textContent = slide.subtitulo || '';
            if (slide.linkBotao) {
                btnEl.href = slide.linkBotao;
                btnEl.textContent = slide.textoBotao || 'Ler Mais';
                btnEl.style.display = 'inline-block';
            } else {
                btnEl.style.display = 'none';
            }
            
            // Animação de entrada do painel de notícias
            infoEl.classList.remove('opacity-0', 'translate-y-4');
            infoEl.classList.add('opacity-100', 'translate-y-0');
        }

        // Reseta o temporizador que volta o fundo ao normal
        clearTimeout(bgTimeout);

        bgTimeout = setTimeout(() => {
            isViewingCard = false;
            
            // Volta à imagem original
            if (bgEl) {
                bgEl.style.backgroundImage = `url('${defaultBg}')`;
                bgEl.style.backgroundPosition = 'center 20%';
            }
            
            // Volta a mostrar o texto padrão "Prof. Kazenski"
            if (defaultTextEl) {
                defaultTextEl.classList.remove('opacity-0', 'pointer-events-none');
                defaultTextEl.classList.add('opacity-100');
            }

            // Oculta as informações da notícia
            if (infoEl) {
                infoEl.classList.remove('opacity-100', 'translate-y-0');
                infoEl.classList.add('opacity-0', 'translate-y-4');
            }
        }, 20000); // 20 segundos e volta ao normal
    }
};