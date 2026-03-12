import { db, auth } from '../core/firebase.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const storage = getStorage();

let unsubscribeProjetos = null;
let projetosMap = new Map();
let projetoExpandidoId = null;
let autoScrollInterval = null;
let favoritosUsuario = []; 

function isAdmin() { return window.userRoles?.Admin; }
function canEdit() { return window.userRoles?.Admin || window.userRoles?.Coordenacao || window.userRoles?.Professor; }

export async function renderProjetosTab() {
    const container = document.getElementById('projetos-content');
    if (!container) return;

    if (auth.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (userDoc.exists()) {
                favoritosUsuario = userDoc.data().projetosFavoritos || [];
            }
        } catch (e) { console.error("Erro ao buscar favoritos:", e); }
    }

    const containerBtnNovo = document.getElementById('btnNovoProjetoContainer');
    if (canEdit() && containerBtnNovo) {
        containerBtnNovo.innerHTML = `
            <button id="btnNovoProjeto" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all transform hover:-translate-y-1 flex items-center gap-2">
                <i class="fas fa-plus"></i> Cadastrar Projeto
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
            form.reset();
            document.getElementById('projIdEdit').value = '';
            document.getElementById('formProjetoTitulo').innerText = 'Novo Projeto';
            areaForm.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
                // CORREÇÃO: Pegando o valor para salvar como "conteudo"
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

                // CORREÇÃO: Salvando como "conteudo" para manter compatibilidade com o banco antigo
                const dados = { titulo, conteudo, link, imageUrl, atualizadoEm: serverTimestamp() };

                if (id) {
                    await updateDoc(doc(db, "projetos_site", id), dados);
                    alert("Projeto atualizado com sucesso!");
                } else {
                    dados.criadoEm = serverTimestamp();
                    dados.favoritosCount = 0;
                    await addDoc(collection(db, "projetos_site"), dados);
                    alert("Projeto cadastrado com sucesso!");
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
            if (projetoExpandidoId && !e.target.closest('.projeto-card') && !e.target.closest('.btn-acoes')) {
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
        const container = document.getElementById('carouselContainer');
        if(container) container.innerHTML = `<div class="text-center w-full text-red-500 py-20 italic">Erro de permissão no Firebase.</div>`;
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
        
        // CORREÇÃO AQUI: Trata tanto 'conteudo' (banco antigo) quanto fallback para evitar undefined
        const textoSeguro = proj.conteudo || proj.descricao || '';
        
        html += `
        <div data-id="${proj.id}" class="projeto-card relative shrink-0 w-[300px] h-[450px] bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl cursor-pointer snap-center group flex flex-col">
            
            <button data-id="${proj.id}" class="btn-favoritar absolute top-4 right-4 z-10 bg-slate-900/60 backdrop-blur hover:bg-slate-900 w-10 h-10 rounded-full flex items-center justify-center transition-all border border-slate-700/50 shadow-lg">
                <i class="${iconeFav} fa-heart ${corFav} text-lg transition-transform hover:scale-125"></i>
            </button>

            <div class="h-48 shrink-0 w-full relative overflow-hidden bg-slate-900 img-container transition-all duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-800 to-transparent z-0 opacity-80"></div>
                <img src="${proj.imageUrl || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1470&auto=format&fit=crop'}" alt="Capa" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            </div>

            <div class="p-6 flex flex-col flex-grow content-container transition-all duration-500">
                <div class="flex items-center gap-2 mb-2">
                    <span class="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-indigo-500/30">Destaque</span>
                    <span class="text-xs font-bold text-slate-500"><i class="fas fa-heart text-red-500/70 mr-1"></i> ${proj.favoritosCount || 0}</span>
                </div>
                
                <h3 class="text-xl font-black text-white leading-tight mb-2 line-clamp-2 title-elem">${proj.titulo}</h3>
                <p class="text-sm text-slate-400 line-clamp-3 mb-4 flex-grow desc-elem">${textoSeguro}</p>

                <div class="hidden extra-info-elem flex-col w-full h-full">
                    <p class="text-sm text-slate-300 leading-relaxed mb-6 overflow-y-auto custom-scroll pr-2" style="max-height: 200px;">
                        ${textoSeguro.replace(/\n/g, '<br>')}
                    </p>
                    <div class="mt-auto">
                        <a href="${proj.link}" target="_blank" class="inline-flex items-center justify-center w-full md:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-transform hover:-translate-y-1 gap-2">
                            <i class="fas fa-external-link-alt"></i> Acessar Projeto
                        </a>
                    </div>
                </div>

                <div class="btn-acoes mt-auto pt-4 border-t border-slate-700/50 flex justify-end gap-2 admin-panel-elem transition-opacity duration-300">
                    ${canEdit() ? `<button data-id="${proj.id}" class="btn-editar bg-yellow-600/20 hover:bg-yellow-600 text-yellow-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-yellow-600/30"><i class="fas fa-pen"></i> Editar</button>` : ''}
                    ${isAdmin() ? `<button data-id="${proj.id}" class="btn-excluir bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-red-600/30"><i class="fas fa-trash"></i> Excluir</button>` : ''}
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
    if (projetoExpandidoId) expandirCard(projetoExpandidoId, true);
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
            
            imgContainer.classList.replace('h-48', 'md:h-full');
            imgContainer.classList.replace('w-full', 'md:w-2/5');
            
            contentContainer.classList.replace('w-full', 'md:w-3/5');
            
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
    imgContainer.classList.replace('md:h-full', 'h-48');
    imgContainer.classList.replace('md:w-2/5', 'w-full');
    contentContainer.classList.replace('md:w-3/5', 'w-full');
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
                container.scrollBy({ left: 324, behavior: 'smooth' }); 
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
    // CORREÇÃO: Puxa o "conteudo" na hora de editar
    document.getElementById('projDescricao').value = proj.conteudo || proj.descricao || '';
    document.getElementById('projLink').value = proj.link;
    document.getElementById('projImageUrl').value = proj.imageUrl || '';
    document.getElementById('projImageFile').value = ''; 
    
    document.getElementById('formProjetoTitulo').innerHTML = `<i class="fas fa-pen text-indigo-400"></i> Editando: ${proj.titulo}`;
    
    const areaForm = document.getElementById('areaFormProjeto');
    areaForm.classList.remove('hidden');
    areaForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}