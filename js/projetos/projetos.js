import { db, auth } from '../core/firebase.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const storage = getStorage();

let unsubscribeProjetos = null;
let projetosMap = new Map();
let autoScrollInterval = null;
let favoritosUsuario = []; 

let isAdminUser = false;
let isEditUser = false;

export async function renderProjetosTab() {
    const container = document.getElementById('projetos-content');
    if (!container) return;

    if (auth.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                favoritosUsuario = data.projetosFavoritos || [];
                isAdminUser = data.Admin === true || data.Admin === "true";
                isEditUser = isAdminUser || data.Professor === true || data.Professor === "true" || data.Coordenacao === true || data.Coordenacao === "true";
            }
        } catch (e) { console.error("Erro:", e); }
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
            if (areaForm.classList.contains('hidden')) {
                form.reset();
                document.getElementById('projIdEdit').value = '';
                document.getElementById('formProjetoTitulo').innerHTML = '<i class="fas fa-rocket text-indigo-400"></i> Novo Projeto';
                areaForm.classList.remove('hidden');
                // Rola para o topo (onde o form está)
                document.getElementById('projetos-content').scrollTo({ top: 0, behavior: 'smooth' });
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
                            (snap) => { barra.style.width = (snap.bytesTransferred / snap.totalBytes) * 100 + '%'; }, 
                            (err) => reject(err), 
                            async () => { imageUrl = await getDownloadURL(uploadTask.snapshot.ref); resolve(); }
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
                alert("Erro ao salvar: " + error.message);
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Projeto';
            }
        };
    }

    if (!window.carouselListenerAdded) {
        carouselContainer.addEventListener('click', async (e) => {
            
            // AÇÃO: Ler Projeto Completo
            const btnLer = e.target.closest('.btn-ler-projeto');
            if (btnLer) {
                e.stopPropagation();
                abrirTelaLeituraProjeto(btnLer.dataset.id);
                return;
            }

            // AÇÃO: Favoritar
            if (e.target.closest('.btn-favoritar')) {
                e.stopPropagation();
                alternarFavorito(e.target.closest('.btn-favoritar').dataset.id);
                return;
            }

            // AÇÃO: Editar
            if (e.target.closest('.btn-editar')) {
                e.stopPropagation();
                abrirEdicao(e.target.closest('.btn-editar').dataset.id);
                return;
            }

            // AÇÃO: Excluir
            if (e.target.closest('.btn-excluir')) {
                e.stopPropagation();
                if(confirm("Tem certeza que deseja EXCLUIR DEFINITIVAMENTE este projeto?")) {
                    await deleteDoc(doc(db, "projetos_site", e.target.closest('.btn-excluir').dataset.id));
                }
                return;
            }
        });

        carouselContainer.addEventListener('mouseenter', pararAutoScroll);
        carouselContainer.addEventListener('mouseleave', iniciarAutoScroll);

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
        
        const rawContent = proj.conteudo || proj.descricao || '';
        // MÁGICA AQUI: Remove todas as tags HTML para gerar o resumo do card sem quebrar o layout
        const plainTextPreview = rawContent.replace(/<[^>]*>?/gm, '');
        
        html += `
        <div class="projeto-card relative shrink-0 w-[320px] h-[480px] bg-slate-800 border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-2xl snap-center group flex flex-col transition-all duration-500 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(79,70,229,0.15)]">
            
            <div class="btn-acoes-admin absolute top-4 left-4 z-30 flex flex-col gap-2 opacity-90">
                ${isEditUser ? `<button data-id="${proj.id}" class="btn-editar bg-slate-900/80 hover:bg-yellow-500 text-slate-300 hover:text-white backdrop-blur border border-slate-600 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110" title="Editar"><i class="fas fa-pen text-xs"></i></button>` : ''}
                ${isAdminUser ? `<button data-id="${proj.id}" class="btn-excluir bg-slate-900/80 hover:bg-red-500 text-slate-300 hover:text-white backdrop-blur border border-slate-600 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110" title="Excluir"><i class="fas fa-trash text-xs"></i></button>` : ''}
            </div>

            <button data-id="${proj.id}" class="btn-favoritar absolute top-4 right-4 z-30 bg-slate-900/80 backdrop-blur hover:bg-slate-900 w-10 h-10 rounded-full flex items-center justify-center transition-all border border-slate-600 shadow-lg group/fav">
                <i class="${iconeFav} fa-heart ${corFav} text-lg transition-transform group-hover/fav:scale-125"></i>
            </button>

            <div class="h-[250px] shrink-0 w-full relative overflow-hidden bg-slate-900 transition-all duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-800 to-transparent z-10 opacity-90"></div>
                <img src="${proj.imageUrl || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1470&auto=format&fit=crop'}" alt="Capa" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            </div>

            <div class="p-6 flex flex-col flex-grow relative z-20 -mt-10">
                <div class="flex items-center gap-2 mb-3">
                    <span class="bg-indigo-500 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-indigo-500/30">Destaque</span>
                    <span class="text-xs font-bold text-slate-300 bg-slate-900/50 px-2.5 py-1 rounded-full border border-slate-700 backdrop-blur"><i class="fas fa-heart text-red-500 mr-1"></i> ${proj.favoritosCount || 0}</span>
                </div>
                
                <h3 class="text-xl font-black text-white leading-tight mb-2 line-clamp-2 drop-shadow-md">${proj.titulo}</h3>
                <p class="text-sm text-slate-400 line-clamp-3 flex-grow leading-relaxed">${plainTextPreview}</p>

                <div class="mt-auto pt-4 border-t border-slate-700/50">
                    <button data-id="${proj.id}" class="btn-ler-projeto w-full bg-gradient-to-r from-slate-700 to-slate-600 hover:from-blue-600 hover:to-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest group/btn">
                        <i class="fas fa-book-open text-slate-400 group-hover/btn:text-white transition-colors"></i> Ler Projeto
                    </button>
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

// ==========================================
// TELA DE LEITURA (ROLA PARA BAIXO)
// ==========================================
window.abrirTelaLeituraProjeto = function(id) {
    const proj = projetosMap.get(id);
    if (!proj) return;

    const view = document.getElementById('projeto-detalhes-view');
    const tituloEl = document.getElementById('detalheProjTitulo');
    const imgContainer = document.getElementById('detalheProjImagemContainer');
    const imgEl = document.getElementById('detalheProjImagem');
    const conteudoEl = document.getElementById('detalheProjConteudo');
    const linkContainer = document.getElementById('detalheProjLinkContainer');
    const linkEl = document.getElementById('detalheProjLink');

    // Popula Título e Capa
    tituloEl.textContent = proj.titulo;
    if (proj.imageUrl && !proj.imageUrl.includes('placeholder')) {
        imgEl.src = proj.imageUrl;
        imgContainer.classList.remove('hidden');
    } else {
        imgContainer.classList.add('hidden');
    }

    // Processa Conteúdo (HTML ou Texto Puro)
    const rawContent = proj.conteudo || proj.descricao || 'Sem conteúdo disponível.';
    if (!rawContent.includes('<') && !rawContent.includes('>')) {
        conteudoEl.innerHTML = rawContent.replace(/\n/g, '<br>');
    } else {
        conteudoEl.innerHTML = rawContent;
    }

    // Processa Link Externo
    if (proj.link && proj.link.trim() !== '') {
        linkEl.href = proj.link;
        linkContainer.classList.remove('hidden');
    } else {
        linkContainer.classList.add('hidden');
    }

    // Mostra a View
    view.classList.remove('hidden');

    // Scroll automático para a área de leitura (Atraso mínimo para garantir que o DOM renderizou o display block)
    setTimeout(() => {
        const container = document.getElementById('projetos-content');
        const offset = view.offsetTop - 20; // 20px de margem respiratória no topo
        container.scrollTo({ top: offset, behavior: 'smooth' });
    }, 50);
}

function iniciarAutoScroll() {
    pararAutoScroll(); 
    if (projetosMap.size < 2) return; 
    autoScrollInterval = setInterval(() => {
        const container = document.getElementById('carouselContainer');
        if (container) {
            if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
                container.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                container.scrollBy({ left: 344, behavior: 'smooth' }); 
            }
        }
    }, 15000); 
}

function pararAutoScroll() {
    if (autoScrollInterval) { clearInterval(autoScrollInterval); autoScrollInterval = null; }
}

async function alternarFavorito(projectId) {
    if (!auth.currentUser) return alert("Você precisa fazer login para favoritar!");
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
                if (!favsArray.includes(projectId)) { favsArray.push(projectId); currentCount++; }
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
    document.getElementById('projLink').value = proj.link || '';
    document.getElementById('projImageUrl').value = proj.imageUrl || '';
    document.getElementById('projImageFile').value = ''; 
    document.getElementById('formProjetoTitulo').innerHTML = `<i class="fas fa-pen text-indigo-400"></i> Editando: ${proj.titulo}`;
    const areaForm = document.getElementById('areaFormProjeto');
    areaForm.classList.remove('hidden');
    document.getElementById('projetos-content').scrollTo({ behavior: 'smooth', top: 0 });
}