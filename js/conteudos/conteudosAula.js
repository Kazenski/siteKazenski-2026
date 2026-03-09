import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, getDocs, setDoc, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

let currentUser = null;
let materialsCache = [];
let filteredMaterials = [];
let musicasGrimorio = [];
let podcastsGrimorio = [];

let activeAudioList = [];
let currentIdx = -1;
let currentPlayingId = null;
let currentMaterialEditId = null;

let currentPage = 1;
const materialsPerPage = 12;
let disciplineMap = {};

// Mapeamento DOM dinâmico
let els = {};

export async function renderConteudosTab() {
    const container = document.getElementById('conteudos-content');
    if (!container) return;

    // Remove a trava restrita, permitindo acesso mesmo sem login
    if (auth.currentUser) {
        try {
            const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (snap.exists()) {
                currentUser = { uid: snap.id, ...snap.data() };
                // Garante que o array de favoritos exista na memória
                if (!currentUser.favoritos) currentUser.favoritos = [];
            }
        } catch(e) { console.error("Erro ao buscar usuário", e); }
    } else {
        currentUser = null;
    }

    mapearDOM();
    setupSubTabs();
    aplicarPermissoes(); // Esconderá os botões de edição/criação automaticamente pois currentUser é null
    await setupFiltros();
    
    // Inicia os Listeners do banco para carregar o acervo
    initMateriais();
    initMusicas();
    initPodcasts();
    setupPlayerEventListeners();
}

function mapearDOM() {
    els = {
        // Admin Panels
        adminMat: document.getElementById('cont-admin-mat'),
        adminMus: document.getElementById('cont-admin-mus'),
        adminPod: document.getElementById('cont-admin-pod'),
        
        // Botão Novo (Toggle)
        btnToggleAdmin: document.getElementById('btn-toggle-admin-cont'),
        
        // Formulários
        formMat: document.getElementById('form-material'),
        formMus: document.getElementById('form-music'),
        formPod: document.getElementById('form-podcast'),

        // Grids & Lists
        matGrid: document.getElementById('cont-mat-grid'),
        matPagination: document.getElementById('cont-mat-pagination'),
        musList: document.getElementById('music-list-ul'),
        podList: document.getElementById('podcast-list-ul'),

        // Filtros
        searchMat: document.getElementById('cont-search-mat'),
        filterDisc: document.getElementById('cont-filter-disc'),
        filterProf: document.getElementById('cont-filter-prof'),
        searchMus: document.getElementById('search-music-input'),
        searchPod: document.getElementById('search-podcast-input'),

        // Player
        playerBox: document.getElementById('global-audio-player'),
        audioEngine: document.getElementById('audio-engine'),
        btnPlayPause: document.getElementById('btn-play-pause'),
        progress: document.getElementById('player-progress'),
        volume: document.getElementById('player-volume'),
        timeCurr: document.getElementById('player-time-curr'),
        timeTotal: document.getElementById('player-time-total'),
        thumb: document.getElementById('player-thumb'),
        fallbackIcon: document.getElementById('player-fallback-icon'),
        title: document.getElementById('player-song-title'),
        artist: document.getElementById('player-song-artist')
    };
}

function aplicarPermissoes() {
    const isStaff = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.Coordenacao);
    if (isStaff) {
        // Ao invés de mostrar os painéis abertos, mostra APENAS o botão "+ Novo"
        els.btnToggleAdmin?.classList.remove('hidden');
    }
}

function setupSubTabs() {
    const btns = document.querySelectorAll('.cont-tab-btn');
    const contents = document.querySelectorAll('.cont-tab-content');

    // MAGIA DO BOTÃO "+ NOVO"
    els.btnToggleAdmin?.addEventListener('click', () => {
        const activeTab = document.querySelector('.cont-tab-content.active');
        if (!activeTab) return;
        
        const adminPanel = activeTab.querySelector('[id^="cont-admin-"]');
        if (adminPanel) {
            adminPanel.classList.toggle('hidden');
            if(!adminPanel.classList.contains('hidden')) {
                adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Estilo dos botões
            btns.forEach(b => {
                b.classList.remove('active', 'bg-blue-600', 'text-white');
                b.classList.add('bg-slate-800', 'text-slate-400', 'hover:bg-slate-700', 'hover:text-white');
            });
            btn.classList.add('active', 'bg-blue-600', 'text-white');
            btn.classList.remove('bg-slate-800', 'text-slate-400', 'hover:bg-slate-700', 'hover:text-white');

            // FIX: Remove a classe 'active' e esconde todas as abas
            contents.forEach(c => {
                c.classList.remove('active');
                c.classList.replace('flex', 'hidden'); 
                c.classList.replace('block', 'hidden'); 
            });

            // Ativa a aba correta
            const targetId = btn.getAttribute('data-target');
            const targetContent = document.getElementById(`ctab-${targetId}`);
            
            targetContent.classList.add('active'); // <--- ISSO CONSERTA O BOTÃO DE NOVO
            targetContent.classList.replace('hidden', 'flex');

            // Esconde os formulários ao trocar de aba
            els.adminMat?.classList.add('hidden');
            els.adminMus?.classList.add('hidden');
            els.adminPod?.classList.add('hidden');

            // Regra do Player flutuante
            if(targetId === 'materiais') {
                els.playerBox.classList.add('hidden');
            } else if (els.audioEngine.src) {
                els.playerBox.classList.remove('hidden');
            }
        });
    });
}

// ==========================================
// MÓDULO 1: MATERIAIS DIDÁTICOS
// ==========================================

async function setupFiltros() {
    let discHtml = '<option value="">Todas as Disciplinas</option>';
    let profHtml = '<option value="">Todos os Professores</option>';

    try {
        const dSnap = await getDocs(collection(db, "disciplinasCadastradas"));
        dSnap.forEach(d => {
            const nome = d.data().nomeExibicao || d.data().nome;
            disciplineMap[d.data().identificador] = nome;
            discHtml += `<option value="${nome}">${nome}</option>`;
        });
        
        const pSnap = await getDocs(query(collection(db, "users"), where("Professor", "==", true)));
        pSnap.forEach(p => { profHtml += `<option value="${p.data().nome}">${p.data().nome}</option>`; });
    } catch(e) { console.warn("Modo Visitante: Filtros restritos."); }

    if(els.filterDisc) els.filterDisc.innerHTML = discHtml;
    const selectAdd = document.getElementById('mat-disciplina');
    if(selectAdd) selectAdd.innerHTML = discHtml.replace('<option value="">Todas as Disciplinas</option>', '');
    if(els.filterProf) els.filterProf.innerHTML = profHtml;

    // INJEÇÃO DO BOTÃO DE FAVORITOS
    const filterContainer = els.filterDisc?.parentElement;
    if (filterContainer && !document.getElementById('cont-filter-fav')) {
        const favBtn = document.createElement('button');
        favBtn.id = 'cont-filter-fav';
        favBtn.className = 'bg-slate-900 border border-slate-700 text-slate-400 rounded-xl px-4 py-3 text-sm outline-none hover:text-amber-400 transition-colors shrink-0 flex items-center gap-2 font-bold uppercase tracking-widest';
        favBtn.innerHTML = '<i class="far fa-star"></i> Favoritos';
        favBtn.onclick = () => {
            if (!currentUser) { alert('Faça login no portal para acessar seus favoritos.'); return; }
            const isActive = favBtn.dataset.active === 'true';
            favBtn.dataset.active = isActive ? 'false' : 'true';
            
            // Alterna o visual do botão
            if (!isActive) {
                favBtn.classList.add('text-amber-400', 'border-amber-500', 'bg-amber-500/10');
                favBtn.innerHTML = '<i class="fas fa-star"></i> Favoritos';
            } else {
                favBtn.classList.remove('text-amber-400', 'border-amber-500', 'bg-amber-500/10');
                favBtn.innerHTML = '<i class="far fa-star"></i> Favoritos';
            }
            
            currentPage = 1; 
            renderMaterials();
        };
        filterContainer.appendChild(favBtn);
        els.filterFav = favBtn; // Guarda a referência
    }

    els.searchMat?.addEventListener('input', () => { currentPage = 1; renderMaterials(); });
    els.filterDisc?.addEventListener('change', () => { currentPage = 1; renderMaterials(); });
    els.filterProf?.addEventListener('change', () => { currentPage = 1; renderMaterials(); });
}

function initMateriais() {
    onSnapshot(query(collection(db, "materiaisDidaticos"), orderBy("dataCriacao", "desc")), (snap) => {
        materialsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMaterials();
    });

    // Evento Form Material
    document.getElementById('btn-add-link')?.addEventListener('click', () => {
        const container = document.getElementById('mat-link-inputs-container');
        const input = document.createElement('input');
        input.type = 'url'; input.className = 'link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none mt-2';
        input.placeholder = 'https://...';
        container.appendChild(input);
    });

    els.formMat?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-mat');
        const originalText = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const titulo = document.getElementById('mat-titulo').value;
            const disciplina = document.getElementById('mat-disciplina').value;
            const texto = document.getElementById('mat-texto').value;
            const fileImg = document.getElementById('mat-file-image').files[0];
            const filePdf = document.getElementById('mat-file-pdf').files[0];
            const links = Array.from(document.querySelectorAll('.link-input')).map(i => i.value).filter(v => v !== "");

            let urlImage = null, urlPdf = null;
            const idDoc = Date.now().toString();

            if (fileImg) { const r = ref(storage, `materiais/${idDoc}_img`); await uploadBytes(r, fileImg); urlImage = await getDownloadURL(r); }
            if (filePdf) { const r = ref(storage, `materiais/${idDoc}_pdf`); await uploadBytes(r, filePdf); urlPdf = await getDownloadURL(r); }

            const dataToSave = { titulo, disciplina, texto, links, dataAtualizacao: serverTimestamp() };
            if (urlImage) dataToSave.urlImage = urlImage;
            if (urlPdf) dataToSave.urlPdf = urlPdf;

            if (currentMaterialEditId) {
                await setDoc(doc(db, "materiaisDidaticos", currentMaterialEditId), dataToSave, { merge: true });
                alert("Atualizado!");
            } else {
                dataToSave.autorNome = currentUser.nome; dataToSave.autorUID = currentUser.uid; dataToSave.dataCriacao = serverTimestamp();
                await addDoc(collection(db, "materiaisDidaticos"), dataToSave);
                alert("Salvo no Grimório!");
            }

            e.target.reset(); currentMaterialEditId = null; btn.innerHTML = originalText;
            document.getElementById('mat-link-inputs-container').innerHTML = '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Fontes Externas (Links)</label><input type="url" class="link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none" placeholder="https://...">';
        } catch (err) { alert("Erro ao salvar."); console.error(err); btn.innerHTML = originalText; btn.disabled = false; }
    });
}

function renderMaterials() {
    if(!els.matGrid) return;
    const search = els.searchMat.value.toLowerCase();
    const fDisc = els.filterDisc.value;
    const fProf = els.filterProf.value;
    const showFavs = els.filterFav?.dataset.active === 'true';

    filteredMaterials = materialsCache.filter(m => {
        const matchText = m.titulo.toLowerCase().includes(search) || (m.texto || '').toLowerCase().includes(search);
        const matchDisc = (fDisc === "" || m.disciplina === fDisc);
        const matchProf = (fProf === "" || m.autorNome === fProf);
        
        // Lógica do Filtro de Favoritos
        const matchFav = !showFavs || (currentUser && currentUser.favoritos && currentUser.favoritos.includes(m.id));
        
        return matchText && matchDisc && matchProf && matchFav;
    });

    const totalPages = Math.ceil(filteredMaterials.length / materialsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const paginatedItems = filteredMaterials.slice((currentPage - 1) * materialsPerPage, currentPage * materialsPerPage);

    els.matGrid.innerHTML = paginatedItems.map(mat => {
        const thumb = mat.urlImage || 'https://placehold.co/400x200/1e293b/a1a1aa?text=Sem+Capa';
        
        // Verifica se é favorito para botar a estrela no canto
        const isFav = currentUser && currentUser.favoritos && currentUser.favoritos.includes(mat.id);
        const favIcon = isFav ? '<div class="absolute top-2 right-2 bg-slate-900/80 p-1.5 rounded-lg border border-amber-500/50 backdrop-blur-sm z-10"><i class="fas fa-star text-amber-400 drop-shadow-md text-sm"></i></div>' : '';

        return `
            <div id="mat-card-${mat.id}" onclick="window.conteudosAPI.expandir('${mat.id}')" class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:-translate-y-1 hover:border-blue-500 transition-all shadow-lg cursor-pointer flex flex-col group relative">
                ${favIcon}
                <div class="h-32 w-full overflow-hidden border-b border-slate-800"><img src="${thumb}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div>
                <div class="p-4 flex-grow flex flex-col">
                    <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate">${mat.disciplina} | Prof. ${mat.autorNome}</div>
                    <h4 class="text-blue-400 font-cinzel font-bold text-base leading-tight mb-2 line-clamp-2">${escapeHTML(mat.titulo)}</h4>
                </div>
            </div>
        `;
    }).join('');

    renderMatPagination(totalPages);
}

function renderMatPagination(totalPages) {
    if (totalPages <= 1) { els.matPagination.classList.replace('flex', 'hidden'); return; }
    els.matPagination.classList.replace('hidden', 'flex');
    els.matPagination.innerHTML = `
        <button onclick="window.conteudosAPI.mudarPaginaMat(-1)" ${currentPage === 1 ? 'disabled class="opacity-50"' : 'class="hover:text-blue-400"'}><i class="fas fa-chevron-left"></i></button>
        <span class="font-bold text-xs uppercase tracking-widest text-slate-400">Pág ${currentPage} de ${totalPages}</span>
        <button onclick="window.conteudosAPI.mudarPaginaMat(1)" ${currentPage === totalPages ? 'disabled class="opacity-50"' : 'class="hover:text-blue-400"'}><i class="fas fa-chevron-right"></i></button>
    `;
}

// ==========================================
// MÓDULOS 2 e 3: MÚSICAS E PODCASTS
// ==========================================

function initMusicas() {
    onSnapshot(query(collection(db, "musicas"), orderBy("createdAt", "desc")), (snap) => {
        musicasGrimorio = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMusicasList();
    });
    els.searchMus?.addEventListener('input', renderMusicasList);
    
    els.formMus?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-mus');
        const orig = btn.innerHTML; btn.innerHTML = "Gravando..."; btn.disabled = true;
        try {
            const audio = document.getElementById('mus-file-audio').files[0];
            const capa = document.getElementById('mus-file-image').files[0];
            const id = Date.now().toString();
            const rAudio = ref(storage, `musicas/${id}_audio`); const rCapa = ref(storage, `musicas/${id}_capa`);
            await uploadBytes(rAudio, audio); await uploadBytes(rCapa, capa);
            await addDoc(collection(db, "musicas"), {
                titulo: document.getElementById('mus-titulo').value, artista: document.getElementById('mus-artista').value,
                letra: document.getElementById('mus-letra').value, audioURL: await getDownloadURL(rAudio),
                albumArtUrl: await getDownloadURL(rCapa), createdAt: serverTimestamp()
            });
            alert("Trilha registrada!"); e.target.reset();
        } catch(err) { alert("Falha no registro."); } finally { btn.innerHTML = orig; btn.disabled = false; }
    });
}

function initPodcasts() {
    onSnapshot(query(collection(db, "podcasts_kazenski"), orderBy("createdAt", "desc")), (snap) => {
        podcastsGrimorio = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPodcastsList();
    });
    els.searchPod?.addEventListener('input', renderPodcastsList);

    els.formPod?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-pod');
        const orig = btn.innerHTML; btn.innerHTML = "Transmitindo..."; btn.disabled = true;
        try {
            const audio = document.getElementById('pod-file-audio').files[0];
            const capa = document.getElementById('pod-file-image').files[0];
            const id = Date.now().toString();
            const rAudio = ref(storage, `podcasts/${id}_audio`); const rCapa = ref(storage, `podcasts/${id}_capa`);
            await uploadBytes(rAudio, audio); await uploadBytes(rCapa, capa);
            await addDoc(collection(db, "podcasts_kazenski"), {
                titulo: document.getElementById('pod-titulo').value, criador: document.getElementById('pod-professor').value,
                descricao: document.getElementById('pod-descricao').value, audioURL: await getDownloadURL(rAudio),
                coverArtUrl: await getDownloadURL(rCapa), createdAt: serverTimestamp()
            });
            alert("Episódio Publicado!"); e.target.reset();
        } catch(err) { alert("Erro no envio."); } finally { btn.innerHTML = orig; btn.disabled = false; }
    });
}

function renderMusicasList() {
    if(!els.musList) return;
    const term = els.searchMus.value.toLowerCase();
    const filtered = musicasGrimorio.filter(m => m.titulo.toLowerCase().includes(term) || m.artista.toLowerCase().includes(term));
    
    els.musList.innerHTML = filtered.map((m, idx) => {
        // HIGHLIGHT SE ESTIVER TOCANDO
        const isActive = m.id === currentPlayingId ? 'bg-slate-800 ring-2 ring-emerald-500' : 'border-transparent hover:bg-slate-800';
        // SHRINK-0 NA THUMB PARA NÃO SER ESMAGADA
        const thumb = m.albumArtUrl ? `<img src="${m.albumArtUrl}" class="w-10 h-10 rounded object-cover border border-slate-700 shrink-0">` : `<div class="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded flex items-center justify-center shrink-0"><i class="fas fa-music"></i></div>`;
        
        return `<li onclick="window.conteudosAPI.tocarMedia(${idx}, 'musica')" class="flex items-center gap-3 p-3 cursor-pointer rounded-xl transition-all border ${isActive}">
            ${thumb}
            <div class="flex-grow min-w-0 overflow-hidden">
                <h4 class="text-white text-sm font-bold truncate">${escapeHTML(m.titulo)}</h4>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest truncate">${escapeHTML(m.artista)}</p>
            </div>
        </li>`;
    }).join('');
}

function renderPodcastsList() {
    if(!els.podList) return;
    const term = els.searchPod.value.toLowerCase();
    const filtered = podcastsGrimorio.filter(p => p.titulo.toLowerCase().includes(term) || (p.criador || p.professor).toLowerCase().includes(term));
    
    els.podList.innerHTML = filtered.map((p, idx) => {
        const isActive = p.id === currentPlayingId ? 'bg-slate-800 ring-2 ring-purple-500' : 'border-transparent hover:bg-slate-800';
        const thumb = p.coverArtUrl ? `<img src="${p.coverArtUrl}" class="w-10 h-10 rounded object-cover border border-slate-700 shrink-0">` : `<div class="w-10 h-10 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded flex items-center justify-center shrink-0"><i class="fas fa-microphone"></i></div>`;
        
        return `<li onclick="window.conteudosAPI.tocarMedia(${idx}, 'podcast')" class="flex items-center gap-3 p-3 cursor-pointer rounded-xl transition-all border ${isActive}">
            ${thumb}
            <div class="flex-grow min-w-0 overflow-hidden">
                <h4 class="text-white text-sm font-bold truncate">${escapeHTML(p.titulo)}</h4>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest truncate">${escapeHTML(p.criador || p.professor)}</p>
            </div>
        </li>`;
    }).join('');
}

// ==========================================
// AUDIO PLAYER GLOABAL
// ==========================================
function setupPlayerEventListeners() {
    els.audioEngine.addEventListener('timeupdate', () => {
        if (els.audioEngine.duration) {
            els.progress.value = (els.audioEngine.currentTime / els.audioEngine.duration) * 100 || 0;
            els.timeCurr.textContent = formatSeg(els.audioEngine.currentTime);
            els.timeTotal.textContent = formatSeg(els.audioEngine.duration);
        }
    });
    els.audioEngine.addEventListener('ended', () => window.conteudosAPI.nextAudio());
    els.progress.addEventListener('input', (e) => {
        if(els.audioEngine.duration) els.audioEngine.currentTime = (e.target.value / 100) * els.audioEngine.duration;
    });
    
    // FIX DO VOLUME: Adicionado o ? para não falhar caso o DOM atrase
    els.volume?.addEventListener('input', (e) => {
        els.audioEngine.volume = e.target.value;
    });
}

function formatSeg(s) {
    if(isNaN(s) || s < 0) return "0:00";
    const min = Math.floor(s / 60); const seg = Math.floor(s % 60);
    return `${min}:${seg.toString().padStart(2, '0')}`;
}

// ==========================================
// API GLOBAL (Injetada no Window para os botões do HTML)
// ==========================================
window.conteudosAPI = {
    mudarPaginaMat: (dir) => { currentPage += dir; renderMaterials(); },
    
    expandir: (id) => {
        const mat = materialsCache.find(m => m.id === id);
        if(!mat) return;
        
        document.getElementById('mat-det-meta').textContent = `${mat.disciplina} | Prof. ${mat.autorNome}`;
        document.getElementById('mat-det-title').textContent = mat.titulo;
        
        let bodyHtml = '';
        
        // 1. IMAGEM DA CAPA (Grande e no topo)
        if (mat.urlImage) {
            bodyHtml += `<img src="${mat.urlImage}" class="w-full h-48 md:h-64 object-cover rounded-xl mb-6 shadow-lg border border-slate-700 shrink-0">`;
        }
        
        // 2. TEXTO DO CONTEÚDO
        bodyHtml += `<div class="text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHTML(mat.texto || 'Nenhum conteúdo textual fornecido.')}</div>`;
        
        // 3. CARD DE PDF (Substituto da miniatura, imitando um anexo interativo)
        if (mat.urlPdf) {
            bodyHtml += `
            <div class="mt-8 p-4 bg-slate-900/50 border border-red-500/30 rounded-xl flex items-center gap-4 hover:bg-slate-800 transition-colors cursor-pointer group shadow-md" onclick="window.open('${mat.urlPdf}', '_blank')">
                <div class="w-12 h-12 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <i class="fas fa-file-pdf text-2xl"></i>
                </div>
                <div class="flex-grow min-w-0">
                    <h4 class="text-white font-bold text-sm truncate">Documento Anexo</h4>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest">Clique para ler o PDF completo</p>
                </div>
                <i class="fas fa-external-link-alt text-slate-500"></i>
            </div>`;
        }

        document.getElementById('mat-det-body').innerHTML = bodyHtml;
        
        // RODAPÉ: Links Externos e Botões de Ação
        // RODAPÉ: Botão Favorito, Links Externos e Botões de Ação
        let footerHtml = '';

        if (currentUser) {
            const isFav = currentUser.favoritos && currentUser.favoritos.includes(mat.id);
            const favClass = isFav ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-600 hover:text-white' : 'bg-slate-800 text-slate-300 border border-transparent hover:bg-amber-600 hover:text-white';
            const favText = isFav ? '<i class="fas fa-star mr-1"></i> Desfavoritar' : '<i class="far fa-star mr-1"></i> Favoritar';
            
            footerHtml += `<button id="btn-modal-fav" onclick="window.conteudosAPI.toggleFavorito('${mat.id}')" class="px-5 py-2.5 rounded-xl text-xs font-bold transition-colors ${favClass}">${favText}</button>`;
        }

        (mat.links || []).forEach((l, i) => {
            footerHtml += `<a href="${l}" target="_blank" class="px-5 py-2.5 border border-blue-500/50 text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-500 hover:text-white transition-colors"><i class="fas fa-external-link-alt mr-1"></i> Link ${i+1}</a>`;
        });
        
        const canEdit = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.uid === mat.autorUID);
        if(canEdit) {
            footerHtml += `<div class="ml-auto flex gap-2">
                <button onclick="window.conteudosAPI.editarMat('${mat.id}')" class="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors"><i class="fas fa-edit"></i></button>
                <button onclick="window.conteudosAPI.excluirMat('${mat.id}')" class="px-4 py-2 bg-red-900/30 text-red-400 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"><i class="fas fa-trash"></i></button>
            </div>`;
        }
        
        document.getElementById('mat-det-footer').innerHTML = footerHtml;
        
        // Abertura da Gaveta
        const modal = document.getElementById('cont-modal-mat');
        const panel = document.getElementById('cont-modal-panel');
        modal.classList.remove('hidden');
        setTimeout(() => panel.classList.remove('translate-x-full'), 10);
    },

    fecharMat: () => {
        const modal = document.getElementById('cont-modal-mat');
        const panel = document.getElementById('cont-modal-panel');
        panel.classList.add('translate-x-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    },
    
    editarMat: (id) => {
        window.conteudosAPI.fecharMat();
        const mat = materialsCache.find(m => m.id === id);
        if(!mat) return;
        currentMaterialEditId = id;
        document.getElementById('mat-titulo').value = mat.titulo;
        document.getElementById('mat-disciplina').value = mat.disciplina;
        document.getElementById('mat-texto').value = mat.texto || '';
        
        const container = document.getElementById('mat-link-inputs-container');
        container.innerHTML = '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Fontes Externas (Links)</label>';
        if (mat.links && mat.links.length > 0) {
            mat.links.forEach(l => {
                const i = document.createElement('input'); i.type='url'; i.value=l; i.className='link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none mb-2';
                container.appendChild(i);
            });
        } else { container.innerHTML += '<input type="url" class="link-input w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none" placeholder="https://...">'; }
        
        els.adminMat.classList.remove('hidden');
        els.adminMat.scrollIntoView({behavior: 'smooth'});
        document.getElementById('btn-submit-mat').textContent = "Atualizar Conhecimento";
    },

    excluirMat: async (id) => {
        if(confirm("Apagar permanentemente este conhecimento?")) {
            await deleteDoc(doc(db, "materiaisDidaticos", id));
            window.conteudosAPI.fecharMat();
        }
    },

    toggleFavorito: async (id) => {
        if (!currentUser) return;
        if (!currentUser.favoritos) currentUser.favoritos = [];
        
        const idx = currentUser.favoritos.indexOf(id);
        if (idx > -1) {
            currentUser.favoritos.splice(idx, 1); // Remove
        } else {
            currentUser.favoritos.push(id); // Adiciona
        }
        
        try {
            // Atualiza direto na conta do usuário no Firebase
            await setDoc(doc(db, "users", currentUser.uid), { favoritos: currentUser.favoritos }, { merge: true });
            
            // Atualiza a visualização do botão no Modal aberto
            const btnFav = document.getElementById('btn-modal-fav');
            if (btnFav) {
                const isFav = idx === -1; // Se era -1, acabou de ser adicionado
                btnFav.innerHTML = isFav ? '<i class="fas fa-star mr-1"></i> Desfavoritar' : '<i class="far fa-star mr-1"></i> Favoritar';
                btnFav.className = isFav ? 'px-5 py-2.5 rounded-xl text-xs font-bold transition-colors bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-600 hover:text-white' : 'px-5 py-2.5 rounded-xl text-xs font-bold transition-colors bg-slate-800 text-slate-300 border border-transparent hover:bg-amber-600 hover:text-white';
            }

            // Re-renderiza a grade de fundo para atualizar a estrelinha no card e o filtro
            renderMaterials();
            
        } catch(err) {
            console.error("Erro ao favoritar: ", err);
            alert("Erro de comunicação com o Grimório ao favoritar.");
        }
    },

    tocarMedia: (idx, tipo) => {
        const lista = tipo === 'musica' ? musicasGrimorio : podcastsGrimorio;
        const term = tipo === 'musica' ? els.searchMus.value.toLowerCase() : els.searchPod.value.toLowerCase();
        
        activeAudioList = lista.filter(item => {
            if(tipo === 'musica') return item.titulo.toLowerCase().includes(term) || item.artista.toLowerCase().includes(term);
            return item.titulo.toLowerCase().includes(term) || (item.criador || item.professor).toLowerCase().includes(term);
        });

        currentIdx = idx;
        const item = activeAudioList[idx];
        if(!item) return;

        currentPlayingId = item.id;
        renderMusicasList();
        renderPodcastsList();

        const isMus = tipo === 'musica';
        const placeholder = document.getElementById(isMus ? 'music-placeholder' : 'podcast-placeholder');
        const view = document.getElementById(isMus ? 'music-details-view' : 'podcast-details-view');
        
        placeholder.classList.add('hidden');
        view.classList.remove('hidden');
        view.classList.add('flex');

        const cor = isMus ? 'emerald' : 'purple';
        const iconeDL = isMus ? '<i class="fas fa-file-alt mr-2"></i> Baixar Letra' : '<i class="fas fa-file-alt mr-2"></i> Resumo';
        const imgUrl = item.albumArtUrl || item.coverArtUrl || '';

        // 1. GERA A CAPA PRINCIPAL (Ou a Imagem, ou o Ícone Grande)
        const mainThumbHtml = imgUrl 
            ? `<img src="${imgUrl}" class="w-32 h-32 md:w-40 md:h-40 rounded-xl object-cover shadow-2xl border border-slate-700 shrink-0 hidden md:block">` 
            : `<div class="w-32 h-32 md:w-40 md:h-40 rounded-xl shadow-2xl border border-${cor}-500/30 bg-${cor}-500/10 text-${cor}-400 shrink-0 hidden md:flex items-center justify-center text-5xl"><i class="fas ${isMus ? 'fa-music' : 'fa-microphone'}"></i></div>`;

        view.innerHTML = `
            <div class="flex flex-col h-full fade-in overflow-hidden">
                <div class="flex items-end gap-6 mb-6 shrink-0">
                    ${mainThumbHtml}
                    <div class="flex-grow min-w-0">
                        <div class="text-[10px] text-${cor}-500 font-bold uppercase tracking-widest mb-2">${isMus ? 'Trilha Sonora' : 'Podcast Episódio'}</div>
                        <h1 class="text-3xl md:text-5xl font-cinzel font-black text-white leading-tight mb-2 truncate">${escapeHTML(item.titulo)}</h1>
                        <p class="text-slate-400 font-bold truncate">${escapeHTML(item.artista || item.criador || item.professor)}</p>
                    </div>
                </div>
                
                <div class="flex gap-3 mb-4 shrink-0 border-b border-slate-800 pb-4">
                    <a href="${item.audioURL}" target="_blank" download class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center"><i class="fas fa-download mr-2"></i> MP3</a>
                    <button onclick="window.conteudosAPI.dlTextoAtual()" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center">${iconeDL}</button>
                </div>
                
                <div class="flex-grow min-h-0 bg-slate-900/50 border border-slate-800 rounded-xl p-6 overflow-y-auto custom-scroll relative">
                    <pre class="font-inter text-sm text-slate-300/90 whitespace-pre-wrap leading-relaxed">${escapeHTML(item.letra || item.descricao || 'Nenhum registro detalhado fornecido.')}</pre>
                </div>
            </div>
        `;

        // 2. GERA A CAPA DO PLAYER FLUTUANTE (Alterna entre Img e Ícone)
        els.playerBox.classList.remove('hidden');
        if (imgUrl) {
            els.thumb.src = imgUrl;
            els.thumb.classList.remove('hidden');
            if(els.fallbackIcon) els.fallbackIcon.classList.add('hidden');
        } else {
            els.thumb.classList.add('hidden');
            if(els.fallbackIcon) {
                els.fallbackIcon.className = `fas ${isMus ? 'fa-music text-emerald-400' : 'fa-microphone text-purple-400'} text-lg`;
                els.fallbackIcon.classList.remove('hidden');
            }
        }

        els.title.textContent = item.titulo;
        els.artist.textContent = item.artista || item.criador || item.professor;
        
        els.audioEngine.src = item.audioURL;
        els.audioEngine.play();
        els.btnPlayPause.innerHTML = '<i class="fas fa-pause ml-0"></i>';
    },

    togglePlay: () => {
        if(!els.audioEngine.src) return;
        if(els.audioEngine.paused) { els.audioEngine.play(); els.btnPlayPause.innerHTML = '<i class="fas fa-pause ml-0"></i>'; }
        else { els.audioEngine.pause(); els.btnPlayPause.innerHTML = '<i class="fas fa-play ml-1"></i>'; }
    },
    
    prevAudio: () => { if(currentIdx > 0) window.conteudosAPI.tocarMedia(currentIdx - 1, activeAudioList[0].letra !== undefined ? 'musica' : 'podcast'); },
    nextAudio: () => { if(currentIdx < activeAudioList.length - 1) window.conteudosAPI.tocarMedia(currentIdx + 1, activeAudioList[0].letra !== undefined ? 'musica' : 'podcast'); },
    
    // NOVA FUNÇÃO DE DOWNLOAD: Busca direto do Objeto em vez do HTML
    dlTextoAtual: () => {
        const item = activeAudioList[currentIdx];
        if(!item) return;
        const texto = item.letra || item.descricao || 'Sem registros';
        const b = new Blob([`${item.titulo}\n\n${texto}`], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${item.titulo}.txt`; a.click();
    }
};