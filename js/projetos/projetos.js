import { db, auth } from '../core/firebase.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const storage = getStorage();

let unsubscribeProjetos = null;
let projetosMap = new Map();
let projetoExpandidoId = null;
let autoScrollInterval = null;
let favoritosUsuario = []; 

// Variáveis locais de permissão
let isAdminUser = false;
let isEditUser = false;

export async function renderProjetosTab() {
    const container = document.getElementById('projetos-content');
    if (!container) return;

    if (!document.getElementById('projetos-custom-style')) {
        const style = document.createElement('style');
        style.id = 'projetos-custom-style';
        style.innerHTML = `
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            .projeto-card { transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
            .projeto-card.expanded { min-width: 900px; max-width: 900px; z-index: 40; }
            @media (max-width: 1024px) {
                .projeto-card.expanded { min-width: 100%; max-width: 100%; flex-direction: column !important; }
            }
        `;
        document.head.appendChild(style);
    }

    if (auth.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                favoritosUsuario = data.projetosFavoritos || [];
                isAdminUser = data.Admin === true || data.Admin === "true";
                isEditUser = isAdminUser || data.Professor === true || data.Professor === "true" || data.Coordenacao === true || data.Coordenacao === "true";
            }
        } catch (e) { console.error("Erro ao buscar dados do usuario:", e); }
    } else {
        isAdminUser = false;
        isEditUser = false;
    }

    const containerBtnNovo = document.getElementById('btnNovoProjetoContainer');
    if (isEditUser && containerBtnNovo) {
        containerBtnNovo.innerHTML = `
            <button id="btnNovoProjeto" class="bg-indigo-600 hover:bg-indigo-500 text-white w-12 h-12 md:w-auto md:px-6 md:py-3 rounded-full md:rounded-xl font-bold shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2">
                <i class="fas fa-plus text-lg"></i> <span class="hidden md:inline uppercase tracking-widest text-xs">Projeto</span>
            </button>
        `;
    } else if (containerBtnNovo) {
        containerBtnNovo.innerHTML = '';
    }

    setupListeners();
    escutarProjetos();
}

function setupListeners() {
    const btnNovo = document.getElementById('btnNovoProjeto');
    const areaForm = document.getElementById('areaFormProjeto');
    const form = document.getElementById('formProjeto');
    const btnCancelar = document.getElementById('btnCancelarForm');
    const carouselContainer = document.getElementById('carouselContainer');
    const btnPrev = document.getElementById('btnPrevSlide');
    const btnNext = document.getElementById('btnNextSlide');

    if (btnPrev && btnNext) {
        const newBtnPrev = btnPrev.cloneNode(true);
        const newBtnNext = btnNext.cloneNode(true);
        btnPrev.parentNode.replaceChild(newBtnPrev, btnPrev);
        btnNext.parentNode.replaceChild(newBtnNext, btnNext);

        newBtnPrev.addEventListener('click', () => carouselContainer.scrollBy({ left: -400, behavior: 'smooth' }));
        newBtnNext.addEventListener('click', () => carouselContainer.scrollBy({ left: 400, behavior: 'smooth' }));
    }

    if (btnNovo && areaForm) {
        btnNovo.onclick = () => {
            // Lógica de Toggle: Abre se estiver fechado, fecha se estiver aberto
            if (areaForm.classList.contains('hidden')) {
                form.reset();
                document.getElementById('projIdEdit').value = '';
                document.getElementById('formProjetoTitulo').innerHTML = '<i class="fas fa-rocket text-indigo-400"></i> Novo Projeto';
                areaForm.classList.remove('hidden');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                areaForm.classList.add('hidden');
            }
        };

        btnCancelar.onclick = () => areaForm.classList.add('hidden');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const btnSalvar = document.getElementById('btnSalvarForm');
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

            try {
                const id = document.getElementById('projIdEdit').value;
                const titulo = document.getElementById('projTitulo').value.trim();
                const conteudo = document.getElementById('projDescricao').value.trim();
                const link = document.getElementById('projLink').value.trim();
                const fileInput = document.getElementById('projImageFile');
                let imageUrl = document.getElementById('projImageUrl').value; 

                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const storageRef = ref(storage, `projetos_capas/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);
                    
                    document.getElementById('uploadProgress').classList.remove('hidden');
                    const barra = document.getElementById('uploadProgress').firstElementChild;

                    await new Promise((resolve, reject) => {
                        uploadTask.on('state_changed', 
                            (snapshot) => {
                                const progresso = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                barra.style.width = progresso + '%';
                            }, 
                            (error) => reject(error), 
                            async () => {
                                imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve();
                            }
                        );
                    });
                    document.getElementById('uploadProgress').classList.add('hidden');
                }

                if (!imageUrl) imageUrl = 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1470&auto=format&fit=crop';

                const dados = { titulo, conteudo, link, imageUrl, atualizadoEm: serverTimestamp() };

                if (id) {
                    await updateDoc(doc(db, "projetos_site", id), dados);
                } else {
                    dados.criadoEm = serverTimestamp();
                    dados.favoritosCount = 0;
                    await addDoc(collection(db, "projetos_site"), dados);
                }

                areaForm.classList.add('hidden');
                form.reset();
            } catch (error) {
                console.error("Erro ao salvar projeto:", error);
                alert("Erro ao salvar: " + error.message);
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Projeto';
            }
        };
    }

    if (!window.carouselListenerAdded) {
        document.addEventListener('click', (e) => {
            if (projetoExpandidoId && !e.target.closest('.projeto-card') && !e.target.closest('.btn-acoes-admin')) {
                fecharCardExpandido();
                iniciarAutoScroll(); 
            }
        });

        carouselContainer.addEventListener('click', async (e) => {
            const card = e.target.closest('.projeto-card');
            
            if (e.target.closest('.btn-favoritar')) {
                e.stopPropagation();
                const id = e.target.closest('.btn-favoritar').dataset.id;
                alternarFavorito(id);
                return;
            }

            if (e.target.closest('.btn-editar')) {
                e.stopPropagation();
                const id = e.target.closest('.btn-editar').dataset.id;
                abrirEdicao(id);
                return;
            }

            if (e.target.closest('.btn-excluir')) {
                e.stopPropagation();
                const id = e.target.closest('.btn-excluir').dataset.id;
                if(confirm("Tem certeza que deseja EXCLUIR DEFINITIVAMENTE este projeto?")) {
                    await deleteDoc(doc(db, "projetos_site", id));
                }
                return;
            }

            if (card) {
                e.stopPropagation();
                const id = card.dataset.id;
                if (projetoExpandidoId === id) {
                    fecharCardExpandido(); 
                    iniciarAutoScroll();
                } else {
                    expandirCard(id);
                }
            }
        });

        carouselContainer.addEventListener('mouseenter', pararAutoScroll);
        carouselContainer.addEventListener('mouseleave', () => {
            if(!projetoExpandidoId) iniciarAutoScroll();
        });

        window.carouselListenerAdded = true;
    }
}

function escutarProjetos() {
    if (unsubscribeProjetos) unsubscribeProjetos();
    const q = query(collection(db, "projetos_site"), orderBy("criadoEm", "desc"));
    
    unsubscribeProjetos = onSnapshot(q, (snapshot) => {
        projetosMap.clear();
        snapshot.forEach(doc => projetosMap.set(doc.id, { id: doc.id, ...doc.data() }));
        renderizarCards();
        iniciarAutoScroll();
    }, (error) => {
        console.error("Erro ao carregar projetos:", error);
    });
}

function renderizarCards() {
    const container = document.getElementById('carouselContainer');
    if (!container) return;

    if (projetosMap.size === 0) {
        container.innerHTML = `<div class="text-center w-full text-slate-500 py-20 italic">Nenhum projeto cadastrado ainda.</div>`;
        return;
    }

    let html = '';
    const arrayProjetos = Array.from(projetosMap.values());

    arrayProjetos.forEach(proj => {
        const isFav = favoritosUsuario.includes(proj.id);
        const corFav = isFav ? 'text-red-500' : 'text-slate-400';
        const iconeFav = isFav ? 'fas' : 'far';
        const textoSeguro = proj.conteudo || proj.descricao || '';
        
        html += `
        <div data-id="${proj.id}" class="projeto-card relative shrink-0 w-[320px] h-[550px] bg-slate-800 border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-2xl cursor-pointer snap-center group flex flex-col transition-all duration-500 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(79,70,229,0.15)]">
            
            <div class="btn-acoes-admin absolute top-4 left-4 z-30 flex flex-col gap-2 opacity-90 transition-opacity duration-300">
                ${isEditUser ? `<button data-id="${proj.id}" class="btn-editar bg-slate-900/80 hover:bg-yellow-500 text-slate-300 hover:text-white backdrop-blur border border-slate-600 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110" title="Editar"><i class="fas fa-pen text-xs"></i></button>` : ''}
                ${isAdminUser ? `<button data-id="${proj.id}" class="btn-excluir bg-slate-900/80 hover:bg-red-500 text-slate-300 hover:text-white backdrop-blur border border-slate-600 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110" title="Excluir"><i class="fas fa-trash text-xs"></i></button>` : ''}
            </div>

            <button data-id="${proj.id}" class="btn-favoritar absolute top-4 right-4 z-30 bg-slate-900/80 backdrop-blur hover:bg-slate-900 w-10 h-10 rounded-full flex items-center justify-center transition-all border border-slate-600 shadow-lg group/fav">
                <i class="${iconeFav} fa-heart ${corFav} text-lg transition-transform group-hover/fav:scale-125"></i>
            </button>

            <div class="h-[320px] shrink-0 w-full relative overflow-hidden bg-slate-900 img-container transition-all duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-800 via-slate-800/40 to-transparent z-10"></div>
                <img src="${proj.imageUrl || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1470&auto=format&fit=crop'}" alt="Capa" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            </div>

            <div class="p-6 flex flex-col flex-grow content-container transition-all duration-500 relative z-20 -mt-10">
                
                <div class="flex items-center gap-2 mb-3">
                    <span class="bg-indigo-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-indigo-500/30">Destaque</span>
                    <span class="text-xs font-bold text-slate-300 bg-slate-900/50 px-2.5 py-1 rounded-full border border-slate-700 backdrop-blur"><i class="fas fa-heart text-red-500 mr-1"></i> ${proj.favoritosCount || 0}</span>
                </div>
                
                <h3 class="text-2xl font-black text-white leading-tight mb-2 line-clamp-2 title-elem drop-shadow-md">${proj.titulo}</h3>
                <p class="text-sm text-slate-400 line-clamp-4 flex-grow desc-elem leading-relaxed">${textoSeguro}</p>

                <div class="hidden extra-info-elem flex-col w-full h-full pt-2">
                    <p class="text-sm text-slate-300 leading-relaxed mb-6 overflow-y-auto custom-scroll pr-2" style="max-height: 250px;">
                        ${textoSeguro.replace(/\n/g, '<br>')}
                    </p>
                    <div class="mt-auto">
                        <button data-id="${proj.id}" class="btn-ler-projeto inline-flex items-center justify-center w-full md:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-transform hover:-translate-y-1 gap-2 uppercase tracking-wide text-xs">
                            <i class="fas fa-book-open"></i> Ler Projeto Completo
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
    if (projetoExpandidoId) expandirCard(projetoExpandidoId, true);
}

// ==========================================
// TELA DE LEITURA COMPLETA DO PROJETO
// ==========================================
document.addEventListener('click', (e) => {
    // Abrir a tela de leitura
    const btnLer = e.target.closest('.btn-ler-projeto');
    if (btnLer) {
        e.preventDefault();
        const id = btnLer.dataset.id;
        abrirTelaLeituraProjeto(id);
    }

    // Fechar a tela de leitura e voltar ao carrossel
    const btnVoltar = e.target.closest('#btnVoltarProjetos');
    if (btnVoltar) {
        document.getElementById('projeto-detalhes-view').classList.add('hidden');
        document.getElementById('projetos-content').classList.remove('hidden');
    }
});

function abrirTelaLeituraProjeto(id) {
    const proj = projetosMap.get(id);
    if (!proj) return;

    // Preenche o Cabeçalho
    document.getElementById('detalheProjTitulo').innerHTML = proj.titulo;
    document.getElementById('detalheFavCount').innerHTML = `<i class="fas fa-heart text-red-500 mr-1"></i> ${proj.favoritosCount || 0}`;

    // Preenche Imagem de Capa (se existir)
    const imgContainer = document.getElementById('detalheProjImagemContainer');
    if (proj.imageUrl && !proj.imageUrl.includes('placeholder')) {
        document.getElementById('detalheProjImagem').src = proj.imageUrl;
        imgContainer.classList.remove('hidden');
    } else {
        imgContainer.classList.add('hidden');
    }

    // Preenche o Conteúdo (Aceita texto puro ou HTML direto do banco)
    // Usamos o campo 'conteudoHTML' se ele existir (para projetos ricos), ou fallback pro 'conteudo'
    const textoRenderizado = proj.conteudoHTML || proj.conteudo || proj.descricao || "Conteúdo não disponível.";
    
    // Se for texto puro (sem tags HTML), quebra as linhas. Se já tiver HTML (como o que você mandou), insere direto.
    if (!textoRenderizado.includes('<') && !textoRenderizado.includes('>')) {
        document.getElementById('detalheProjConteudo').innerHTML = textoRenderizado.replace(/\n/g, '<br><br>');
    } else {
        document.getElementById('detalheProjConteudo').innerHTML = textoRenderizado;
    }

    // Oculta o carrossel e Mostra a tela de leitura
    document.getElementById('projetos-content').classList.add('hidden');
    
    const telaDetalhes = document.getElementById('projeto-detalhes-view');
    telaDetalhes.classList.remove('hidden');
    
    // Rola a janela para o topo
    window.scrollTo({ top: 0, behavior: 'instant' });
    telaDetalhes.scrollTo({ top: 0, behavior: 'instant' });
}

function expandirCard(id, reRendendo = false) {
    projetoExpandidoId = id;
    pararAutoScroll();

    const container = document.getElementById('carouselContainer');
    const cards = container.querySelectorAll('.projeto-card');

    cards.forEach(card => {
        const imgContainer = card.querySelector('.img-container');
        const contentContainer = card.querySelector('.content-container');
        const descElem = card.querySelector('.desc-elem');
        const extraInfo = card.querySelector('.extra-info-elem');

        if (card.dataset.id === id) {
            card.classList.add('expanded');
            card.classList.replace('flex-col', 'md:flex-row');
            
            imgContainer.classList.replace('h-[320px]', 'md:h-full');
            imgContainer.classList.replace('w-full', 'md:w-[45%]');
            
            contentContainer.classList.replace('w-full', 'md:w-[55%]');
            contentContainer.classList.remove('-mt-10'); 
            
            descElem.classList.add('hidden');
            extraInfo.classList.remove('hidden');
            extraInfo.classList.add('flex');
            
            if (!reRendendo) {
                setTimeout(() => card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 100);
            }
        } else {
            card.classList.remove('expanded');
            card.style.opacity = '0.5';
            card.style.transform = 'scale(0.95)';
            resetarLayoutCard(card, imgContainer, contentContainer, descElem, extraInfo);
        }
    });
}

function fecharCardExpandido() {
    projetoExpandidoId = null;
    const cards = document.querySelectorAll('.projeto-card');

    cards.forEach(card => {
        card.classList.remove('expanded');
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
        
        const imgContainer = card.querySelector('.img-container');
        const contentContainer = card.querySelector('.content-container');
        const descElem = card.querySelector('.desc-elem');
        const extraInfo = card.querySelector('.extra-info-elem');
        
        resetarLayoutCard(card, imgContainer, contentContainer, descElem, extraInfo);
    });
}

function resetarLayoutCard(card, imgContainer, contentContainer, descElem, extraInfo) {
    card.classList.replace('md:flex-row', 'flex-col');
    
    imgContainer.classList.replace('md:h-full', 'h-[320px]');
    imgContainer.classList.replace('md:w-[45%]', 'w-full');
    
    contentContainer.classList.replace('md:w-[55%]', 'w-full');
    contentContainer.classList.add('-mt-10');
    
    descElem.classList.remove('hidden');
    extraInfo.classList.add('hidden');
    extraInfo.classList.remove('flex');
}

function iniciarAutoScroll() {
    pararAutoScroll(); 
    if (projetosMap.size < 2) return; 
    
    autoScrollInterval = setInterval(() => {
        const container = document.getElementById('carouselContainer');
        if (container && !projetoExpandidoId) {
            if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
                container.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                container.scrollBy({ left: 344, behavior: 'smooth' }); 
            }
        }
    }, 15000); 
}

function pararAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

async function alternarFavorito(projectId) {
    if (!auth.currentUser) return alert("Você precisa fazer login para favoritar um projeto!");

    const userRef = doc(db, "users", auth.currentUser.uid);
    const projetoRef = doc(db, "projetos_site", projectId);
    const isFavoritado = favoritosUsuario.includes(projectId);

    try {
        await runTransaction(db, async (t) => {
            const userDoc = await t.get(userRef);
            const projDoc = await t.get(projetoRef);
            
            let favsArray = userDoc.exists() ? (userDoc.data().projetosFavoritos || []) : [];
            let currentCount = projDoc.exists() ? (projDoc.data().favoritosCount || 0) : 0;

            if (isFavoritado) {
                favsArray = favsArray.filter(id => id !== projectId);
                currentCount = Math.max(0, currentCount - 1);
            } else {
                if (!favsArray.includes(projectId)) {
                    favsArray.push(projectId);
                    currentCount++;
                }
            }

            favoritosUsuario = favsArray; 
            t.update(userRef, { projetosFavoritos: favsArray });
            t.update(projetoRef, { favoritosCount: currentCount });
        });
    } catch (error) { console.error("Erro ao favoritar:", error); }
}

function abrirEdicao(id) {
    const proj = projetosMap.get(id);
    if (!proj) return;

    document.getElementById('projIdEdit').value = proj.id;
    document.getElementById('projTitulo').value = proj.titulo;
    document.getElementById('projDescricao').value = proj.conteudo || proj.descricao || '';
    document.getElementById('projLink').value = proj.link;
    document.getElementById('projImageUrl').value = proj.imageUrl || '';
    document.getElementById('projImageFile').value = ''; 
    
    document.getElementById('formProjetoTitulo').innerHTML = `<i class="fas fa-pen text-indigo-400"></i> Editando: ${proj.titulo}`;
    
    const areaForm = document.getElementById('areaFormProjeto');
    areaForm.classList.remove('hidden');
    areaForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}