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
let currentMaterialEditId = null;

let currentPage = 1;
const materialsPerPage = 12;
let disciplineMap = {};

// Mapeamento DOM dinâmico
let els = {};

export async function renderConteudosTab() {
    const container = document.getElementById('conteudos-content');
    if (!container) return;

    if (!auth.currentUser) {
        container.innerHTML = '<div class="text-center text-slate-500 mt-20">Você precisa estar logado para acessar o acervo.</div>';
        return;
    }

    try {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (snap.exists()) currentUser = { uid: snap.id, ...snap.data() };
    } catch(e) { console.error("Erro ao buscar usuário", e); }

    mapearDOM();
    setupSubTabs();
    aplicarPermissoes();
    await setupFiltros();
    
    // Inicia os Listeners do banco
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
        title: document.getElementById('player-song-title'),
        artist: document.getElementById('player-song-artist')
    };
}

function aplicarPermissoes() {
    const isStaff = currentUser && (currentUser.Admin || currentUser.Professor || currentUser.Coordenacao);
    if (isStaff) {
        els.adminMat?.classList.remove('hidden');
        els.adminMus?.classList.remove('hidden');
        els.adminPod?.classList.remove('hidden');
    }
}

function setupSubTabs() {
    const btns = document.querySelectorAll('.cont-tab-btn');
    const contents = document.querySelectorAll('.cont-tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Estilização dos botões
            btns.forEach(b => {
                b.classList.remove('active', 'text-blue-400', 'border-blue-500');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            btn.classList.add('active', 'text-blue-400', 'border-blue-500');
            btn.classList.remove('text-slate-500', 'border-transparent');

            // Troca de conteúdo
            contents.forEach(c => c.classList.replace('block', 'hidden'));
            const targetId = btn.getAttribute('data-target');
            document.getElementById(`ctab-${targetId}`).classList.replace('hidden', 'block');

            // Lógica do Player (Esconder nos materiais, mostrar nas trilhas se houver src)
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
    const dSnap = await getDocs(collection(db, "disciplinasCadastradas"));
    const pSnap = await getDocs(query(collection(db, "users"), where("Professor", "==", true)));
    
    let discHtml = '<option value="">Todas as Disciplinas</option>';
    dSnap.forEach(d => {
        const nome = d.data().nomeExibicao || d.data().nome;
        disciplineMap[d.data().identificador] = nome;
        discHtml += `<option value="${nome}">${nome}</option>`;
    });
    
    let profHtml = '<option value="">Todos os Professores</option>';
    pSnap.forEach(p => { profHtml += `<option value="${p.data().nome}">${p.data().nome}</option>`; });

    if(els.filterDisc) els.filterDisc.innerHTML = discHtml;
    const selectAdd = document.getElementById('mat-disciplina');
    if(selectAdd) selectAdd.innerHTML = discHtml.replace('<option value="">Todas as Disciplinas</option>', '');
    if(els.filterProf) els.filterProf.innerHTML = profHtml;

    // Listeners de Busca
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

    filteredMaterials = materialsCache.filter(m => {
        const matchText = m.titulo.toLowerCase().includes(search) || (m.texto || '').toLowerCase().includes(search);
        return matchText && (fDisc === "" || m.disciplina === fDisc) && (fProf === "" || m.autorNome === fProf);
    });

    const totalPages = Math.ceil(filteredMaterials.length / materialsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const paginatedItems = filteredMaterials.slice((currentPage - 1) * materialsPerPage, currentPage * materialsPerPage);

    els.matGrid.innerHTML = paginatedItems.map(mat => {
        const thumb = mat.urlImage || 'https://placehold.co/400x200/1e293b/a1a1aa?text=Sem+Capa';
        return `
            <div id="mat-card-${mat.id}" onclick="window.conteudosAPI.expandir('${mat.id}')" class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:-translate-y-1 hover:border-blue-500 transition-all shadow-lg cursor-pointer flex flex-col group">
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
        const thumb = m.albumArtUrl ? `<img src="${m.albumArtUrl}" class="w-10 h-10 rounded object-cover border border-slate-700">` : `<div class="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded flex items-center justify-center"><i class="fas fa-music"></i></div>`;
        return `<li onclick="window.conteudosAPI.tocarMedia(${idx}, 'musica')" class="flex items-center gap-3 p-3 cursor-pointer rounded-xl hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
            ${thumb}
            <div class="overflow-hidden"><h4 class="text-white text-sm font-bold truncate">${escapeHTML(m.titulo)}</h4><p class="text-[9px] text-slate-500 uppercase tracking-widest truncate">${escapeHTML(m.artista)}</p></div>
        </li>`;
    }).join('');
}

function renderPodcastsList() {
    if(!els.podList) return;
    const term = els.searchPod.value.toLowerCase();
    const filtered = podcastsGrimorio.filter(p => p.titulo.toLowerCase().includes(term) || (p.criador || p.professor).toLowerCase().includes(term));
    
    els.podList.innerHTML = filtered.map((p, idx) => {
        const thumb = p.coverArtUrl ? `<img src="${p.coverArtUrl}" class="w-10 h-10 rounded object-cover border border-slate-700">` : `<div class="w-10 h-10 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded flex items-center justify-center"><i class="fas fa-microphone"></i></div>`;
        return `<li onclick="window.conteudosAPI.tocarMedia(${idx}, 'podcast')" class="flex items-center gap-3 p-3 cursor-pointer rounded-xl hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
            ${thumb}
            <div class="overflow-hidden"><h4 class="text-white text-sm font-bold truncate">${escapeHTML(p.titulo)}</h4><p class="text-[9px] text-slate-500 uppercase tracking-widest truncate">${escapeHTML(p.criador || p.professor)}</p></div>
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
    els.volume.addEventListener('input', (e) => els.audioEngine.volume = e.target.value);
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
    // Ações de Materiais
    mudarPaginaMat: (dir) => { currentPage += dir; renderMaterials(); },
    
    expandir: (id) => {
        document.querySelectorAll('.expanded-mat-wrapper').forEach(e => e.remove());
        const mat = materialsCache.find(m => m.id === id);
        if(!mat) return;
        
        const card = document.getElementById(`mat-card-${id}`);
        const wrapper = document.createElement('div');
        wrapper.className = 'expanded-mat-wrapper col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 bg-slate-900 border border-blue-500 rounded-2xl p-6 shadow-2xl shadow-blue-900/20 mt-2 mb-6 fade-in';
        
        const canEdit = currentUser && (currentUser.Admin || currentUser.uid === mat.autorUID);
        
        let linksHtml = (mat.links || []).map((l, i) => `<a href="${l}" target="_blank" class="px-4 py-2 border border-blue-500/50 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/10 transition-colors"><i class="fas fa-external-link-alt mr-1"></i> Link ${i+1}</a>`).join('');

        wrapper.innerHTML = `
            <div class="flex justify-between items-start mb-6">
                <div>
                    <div class="text-blue-400 text-xs font-bold tracking-widest uppercase mb-1">${mat.disciplina} | Prof. ${mat.autorNome}</div>
                    <h3 class="text-white font-cinzel font-black text-2xl">${escapeHTML(mat.titulo)}</h3>
                </div>
                <button onclick="this.closest('.expanded-mat-wrapper').remove()" class="text-slate-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
            </div>
            <div class="text-slate-300 whitespace-pre-wrap leading-relaxed mb-8">${escapeHTML(mat.texto || '')}</div>
            <div class="flex flex-wrap gap-3 pt-4 border-t border-slate-800">
                ${mat.urlPdf ? `<a href="${mat.urlPdf}" target="_blank" class="px-5 py-2 bg-red-600/20 border border-red-500 text-red-400 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"><i class="fas fa-file-pdf mr-1"></i> Ler PDF</a>` : ''}
                ${linksHtml}
                ${canEdit ? `<div class="ml-auto flex gap-2"><button onclick="window.conteudosAPI.editarMat('${mat.id}')" class="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors"><i class="fas fa-edit"></i></button><button onclick="window.conteudosAPI.excluirMat('${mat.id}')" class="px-4 py-2 bg-red-900/50 text-red-400 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"><i class="fas fa-trash"></i></button></div>` : ''}
            </div>
        `;
        card.insertAdjacentElement('afterend', wrapper);
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    
    editarMat: (id) => {
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
            document.querySelectorAll('.expanded-mat-wrapper').forEach(e => e.remove());
        }
    },

    // Ações de Áudio (Player)
    tocarMedia: (idx, tipo) => {
        const lista = tipo === 'musica' ? musicasGrimorio : podcastsGrimorio;
        const term = tipo === 'musica' ? els.searchMus.value.toLowerCase() : els.searchPod.value.toLowerCase();
        
        // Aplica o filtro atual para tocar a música correta da lista filtrada
        activeAudioList = lista.filter(item => {
            if(tipo === 'musica') return item.titulo.toLowerCase().includes(term) || item.artista.toLowerCase().includes(term);
            return item.titulo.toLowerCase().includes(term) || (item.criador || item.professor).toLowerCase().includes(term);
        });

        currentIdx = idx;
        const item = activeAudioList[idx];
        if(!item) return;

        // Atualiza a View Principal
        const isMus = tipo === 'musica';
        const placeholder = document.getElementById(isMus ? 'music-placeholder' : 'podcast-placeholder');
        const view = document.getElementById(isMus ? 'music-details-view' : 'podcast-details-view');
        
        placeholder.classList.add('hidden');
        view.classList.remove('hidden');
        view.classList.add('flex');

        const cor = isMus ? 'emerald' : 'purple';
        const iconeDL = isMus ? '<i class="fas fa-file-alt"></i> Baixar Letra' : '<i class="fas fa-file-alt"></i> Resumo';

        view.innerHTML = `
            <div class="flex flex-col h-full fade-in">
                <div class="flex items-end gap-6 mb-8 shrink-0">
                    <img src="${item.albumArtUrl || item.coverArtUrl || ''}" class="w-40 h-40 rounded-xl object-cover shadow-2xl border border-slate-700 hidden md:block" onerror="this.style.display='none'">
                    <div>
                        <div class="text-[10px] text-${cor}-500 font-bold uppercase tracking-widest mb-2">${isMus ? 'Trilha Sonora' : 'Podcast Episódio'}</div>
                        <h1 class="text-4xl md:text-5xl font-cinzel font-black text-white leading-tight mb-2">${escapeHTML(item.titulo)}</h1>
                        <p class="text-slate-400 font-bold">${escapeHTML(item.artista || item.criador || item.professor)}</p>
                    </div>
                </div>
                
                <div class="flex gap-3 mb-6 shrink-0 border-b border-slate-800 pb-6">
                    <a href="${item.audioURL}" target="_blank" download class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"><i class="fas fa-download"></i> MP3</a>
                    <button onclick="window.conteudosAPI.dlTexto('${escapeHTML(item.titulo)}', '${escapeHTML(item.letra || item.descricao || '')}')" class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">${iconeDL}</button>
                </div>
                
                <div class="flex-grow bg-slate-900/50 border border-slate-800 rounded-xl p-6 overflow-y-auto custom-scroll">
                    <pre class="font-inter text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHTML(item.letra || item.descricao || 'Nenhum registro detalhado fornecido.')}</pre>
                </div>
            </div>
        `;

        // Inicia o Player Global
        els.playerBox.classList.remove('hidden');
        els.thumb.src = item.albumArtUrl || item.coverArtUrl || '';
        els.thumb.classList.remove('hidden');
        els.title.textContent = item.titulo;
        els.artist.textContent = item.artista || item.criador || item.professor;
        
        els.audioEngine.src = item.audioURL;
        els.audioEngine.play();
        els.btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
    },

    togglePlay: () => {
        if(!els.audioEngine.src) return;
        if(els.audioEngine.paused) { els.audioEngine.play(); els.btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>'; }
        else { els.audioEngine.pause(); els.btnPlayPause.innerHTML = '<i class="fas fa-play ml-1"></i>'; }
    },
    
    prevAudio: () => { if(currentIdx > 0) window.conteudosAPI.tocarMedia(currentIdx - 1, activeAudioList[0].letra !== undefined ? 'musica' : 'podcast'); },
    nextAudio: () => { if(currentIdx < activeAudioList.length - 1) window.conteudosAPI.tocarMedia(currentIdx + 1, activeAudioList[0].letra !== undefined ? 'musica' : 'podcast'); },
    
    dlTexto: (titulo, texto) => {
        const b = new Blob([`${titulo}\n\n${texto}`], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${titulo}.txt`; a.click();
    }
};