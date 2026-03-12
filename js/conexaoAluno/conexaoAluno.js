import { db, auth } from '../core/firebase.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, runTransaction, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { validarConteudo, encontrarPalavrasBloqueadas } from '../core/validacao.js';

let unsubscribeGeral = null;
let postsMap = new Map();
const autoresCache = new Map();

// Variável global segura para a sessão atual nesta página
let currentLoggedInUser = null; 

// Filtros Globais
let termoPesquisa = ''; 
let filtroStatusMod = 'aprovados'; 
let ordenacaoAtiva = 'recentes';
let postAtivoId = null;

function hexToRgb(hex) {
    if (!hex) return '51, 89, 140'; 
    const bigint = parseInt(hex.replace('#',''), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}

// Transformado em async para garantir que o usuário seja carregado antes
export async function renderConexaoAlunoTab() {
    const container = document.getElementById('conexao-aluno-content');
    if (!container) return;

    const isModerador = window.userRoles?.Admin || window.userRoles?.Moderador;

    // Busca o usuário logado e popula a variável segura antes de renderizar
    if (auth.currentUser) {
        try {
            const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (snap.exists()) {
                currentLoggedInUser = { uid: auth.currentUser.uid, ...snap.data() };
            }
        } catch (e) { console.error("Erro ao buscar usuário logado:", e); }
    }

    container.innerHTML = `
        <div class="w-full flex h-full relative gap-6 transition-all duration-300">
            
            <div id="mainFeedArea" class="flex-1 w-full transition-all duration-300">
                <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div>
                        <h1 class="text-3xl font-black text-white tracking-tight">Conexão Aluno</h1>
                        <p class="text-slate-400 text-sm mt-1">Compartilhe ideias e projetos com a comunidade</p>
                    </div>
                    <button id="btnNovoPost" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-1">
                        <i class="fas fa-pen-nib mr-2"></i> Criar Publicação
                    </button>
                </div>

                <div id="areaCriarPost" class="hidden bg-slate-800/50 backdrop-blur-md border border-slate-700 p-6 rounded-2xl mb-8 shadow-xl">
                    <h2 class="text-xl font-bold text-white mb-4">Nova Publicação</h2>
                    <input type="text" id="postTitulo" placeholder="Título da publicação" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-blue-500">
                    <textarea id="postConteudo" placeholder="Escreva seu conteúdo aqui..." rows="4" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-blue-500"></textarea>
                    <div class="flex items-center gap-2 mb-4">
                        <input type="checkbox" id="postPublico" class="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded">
                        <label for="postPublico" class="text-sm text-slate-300">Tornar público (Visitantes podem ver após aprovação)</label>
                    </div>
                    <div class="flex justify-end gap-3">
                        <button id="btnCancelarPost" class="px-5 py-2 rounded-lg font-semibold text-slate-300 hover:bg-slate-700 transition-colors">Cancelar</button>
                        <button id="btnSalvarPost" class="px-5 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors">Publicar</button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-4 mb-8 bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                    <input type="text" id="filtroPesquisa" placeholder="Pesquisar..." class="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    <select id="filtroOrdenacao" class="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none">
                        <option value="recentes">Mais Recentes</option>
                        <option value="elogios">Mais Elogiados</option>
                    </select>
                    ${isModerador ? `
                    <select id="filtroModeracao" class="bg-indigo-900 border border-indigo-500 text-indigo-100 rounded-lg px-4 py-2 text-sm outline-none font-semibold">
                        <option value="todos">Moderação: Todos</option>
                        <option value="aprovados" selected>Apenas Aprovados</option>
                        <option value="aguardando">⚠️ Aguardando Aprovação</option>
                        <option value="ocultos">🚫 Ocultados</option>
                    </select>
                    ` : ''}
                </div>

                <div id="feedPosts" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 transition-all duration-300">
                    <div class="col-span-full text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i><br>Carregando...</div>
                </div>
            </div>

            <div id="sidePanelPost" class="hidden fixed inset-0 z-[100] lg:static lg:z-auto lg:block lg:w-[450px] shrink-0 transform translate-x-full lg:translate-x-0 transition-transform duration-300 h-[calc(100vh-6rem)] sticky top-24">
                <div class="bg-slate-800/90 backdrop-blur-xl border border-slate-700 h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                    <button id="btnFecharPainel" class="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-900 rounded-full w-8 h-8 flex items-center justify-center transition-colors z-10">
                        <i class="fas fa-times"></i>
                    </button>
                    <div id="sidePanelContent" class="p-6 overflow-y-auto h-full flex flex-col pt-12">
                        <div class="text-center text-slate-500 mt-20">Selecione uma publicação para ler os detalhes.</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Oculta o botão se o usuário tiver 3 cartões
    if (currentLoggedInUser && currentLoggedInUser.cartaoAmareloPosts >= 3) {
        const btnNovoPost = document.getElementById('btnNovoPost');
        if (btnNovoPost) btnNovoPost.style.display = 'none';
    }

    setupListeners(isModerador);
    carregarPostsListener(isModerador);
}

function setupListeners(isModerador) {
    const areaPost = document.getElementById('areaCriarPost');
    
    document.getElementById('btnNovoPost').addEventListener('click', () => areaPost.classList.toggle('hidden'));
    document.getElementById('btnCancelarPost').addEventListener('click', () => {
        areaPost.classList.add('hidden');
        document.getElementById('postTitulo').value = '';
        document.getElementById('postConteudo').value = '';
    });

    document.getElementById('btnFecharPainel').addEventListener('click', fecharPainelPost);

    document.getElementById('btnSalvarPost').addEventListener('click', async () => {
        const titulo = document.getElementById('postTitulo').value.trim();
        const conteudo = document.getElementById('postConteudo').value.trim();
        const isPublico = document.getElementById('postPublico').checked;
        const btnSalvar = document.getElementById('btnSalvarPost');

        if (!titulo || !conteudo) return alert("Preencha título e conteúdo.");

        // Encontra as palavras proibidas em vez de apenas bloquear
        const palavrasNoTitulo = encontrarPalavrasBloqueadas(titulo);
        const palavrasNoConteudo = encontrarPalavrasBloqueadas(conteudo);

        // Junta todas as palavras encontradas sem repetir
        const todasPalavrasProibidas = [...new Set([...palavrasNoTitulo, ...palavrasNoConteudo])];

        // Usa a variável corrigida
        if (!currentLoggedInUser) return alert("Você precisa estar logado para publicar.");

        if (currentLoggedInUser.cartaoAmareloPosts >= 3) {
            return alert("🚫 AÇÃO BLOQUEADA: Você acumulou 3 cartões amarelos e está proibido de fazer novas postagens na rede.");
        }

        btnSalvar.disabled = true;
        btnSalvar.textContent = "Publicando...";

        try {
            await addDoc(collection(db, "posts"), {
                titulo, 
                conteudo, 
                postPublico: isPublico,
                criadoEm: serverTimestamp(),
                autorUID: currentLoggedInUser.uid, 
                autorNome: currentLoggedInUser.nome || 'Membro',
                autorTurma: currentLoggedInUser.turma || null, 
                autorRole: window.userRoles?.Admin ? 'admin' : (window.userRoles?.Moderador ? 'moderador' : (currentLoggedInUser.Professor ? 'professor' : (currentLoggedInUser.Coordenacao ? 'coordenacao' : 'aluno'))),
                elogios: 0, 
                elogiosDetalhados: {}, 
                exibir: false, 
                oculto: false,
                aprovado: false,
                palavrasProibidas: todasPalavrasProibidas 
            });
            
            document.getElementById('areaCriarPost').classList.add('hidden');
            document.getElementById('postTitulo').value = '';
            document.getElementById('postConteudo').value = '';
            dispararConfetes();
            alert("Sucesso! Seu post foi enviado e aguarda aprovação da moderação.");
        } catch (e) {
            alert("Erro ao publicar.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Publicar";
        }
    });

    document.getElementById('filtroPesquisa').addEventListener('input', (e) => { termoPesquisa = e.target.value.toLowerCase(); renderizarFeed(isModerador); });
    document.getElementById('filtroOrdenacao').addEventListener('change', (e) => { ordenacaoAtiva = e.target.value; renderizarFeed(isModerador); });
    
    if (isModerador) {
        document.getElementById('filtroModeracao').addEventListener('change', (e) => { filtroStatusMod = e.target.value; renderizarFeed(isModerador); });
    }

    document.getElementById('feedPosts').addEventListener('click', async (e) => {
        const postCard = e.target.closest('.post-card');
        if (!postCard) return;
        const postId = postCard.dataset.id;

        if (e.target.closest('.btn-aprovar')) {
            e.stopPropagation();
            if(confirm("Aprovar e exibir este post?")) await updateDoc(doc(db, "posts", postId), { exibir: true, oculto: false, aprovado: true });
            return;
        }
        if (e.target.closest('.btn-ocultar')) {
            e.stopPropagation();
            if(confirm("Ocultar este post de todos?")) await updateDoc(doc(db, "posts", postId), { exibir: false, oculto: true });
            return;
        }
        if (e.target.closest('.btn-deletar')) {
            e.stopPropagation();
            if(confirm("EXCLUIR DEFINITIVAMENTE este post?")) {
                await deleteDoc(doc(db, "posts", postId));
                if(postAtivoId === postId) fecharPainelPost();
            }
            return;
        }

        abrirPostNoPainel(postId, isModerador);
    });

    const modalPerfil = document.getElementById('modalPerfilUsuario');
    if(modalPerfil) {
        modalPerfil.addEventListener('click', (e) => {
            if(e.target === modalPerfil && typeof fecharModalPerfil === 'function') fecharModalPerfil();
        });
    }
}

function carregarPostsListener(isModerador) {
    if (unsubscribeGeral) unsubscribeGeral();
    postsMap.clear();

    const q = isModerador 
        ? query(collection(db, "posts"), orderBy("criadoEm", "desc"))
        : query(collection(db, "posts"), where("exibir", "==", true), where("oculto", "==", false), orderBy("criadoEm", "desc"));

    unsubscribeGeral = onSnapshot(q, async (snapshot) => {
        const fetchPromises = [];
        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            postsMap.set(docSnap.id, data);
            
            if (data.autorUID && !autoresCache.has(data.autorUID)) {
                autoresCache.set(data.autorUID, 'loading');
                fetchPromises.push(getDoc(doc(db, "users", data.autorUID)).then(u => {
                    if (u.exists()) autoresCache.set(data.autorUID, u.data());
                }));
            }
        });
        await Promise.all(fetchPromises);
        renderizarFeed(isModerador);
        
        if (postAtivoId && postsMap.has(postAtivoId)) {
            abrirPostNoPainel(postAtivoId, isModerador, true);
        }
    });
}

function renderizarFeed(isModerador) {
    const feed = document.getElementById('feedPosts');
    if (!feed) return;

    let arrayPosts = Array.from(postsMap.values());
    const user = currentLoggedInUser;

    arrayPosts = arrayPosts.filter(post => {
        if (termoPesquisa && !(post.titulo?.toLowerCase().includes(termoPesquisa) || post.conteudo?.toLowerCase().includes(termoPesquisa))) return false;
        if (isModerador) {
            if (filtroStatusMod === 'aprovados' && (!post.exibir || post.oculto)) return false;
            if (filtroStatusMod === 'aguardando' && (post.exibir || post.oculto)) return false;
            if (filtroStatusMod === 'ocultos' && !post.oculto) return false;
        } else {
            if (!post.postPublico && post.autorTurma !== user?.turma && post.autorUID !== user?.uid) return false;
        }
        return true;
    });

    if (ordenacaoAtiva === 'elogios') {
        arrayPosts.sort((a, b) => (b.elogios || 0) - (a.elogios || 0));
    } else {
        arrayPosts.sort((a, b) => (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0));
    }

    feed.innerHTML = '';
    if (arrayPosts.length === 0) {
        feed.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 bg-slate-800/30 rounded-xl border border-slate-700/50">Nenhuma publicação encontrada.</div>`;
        return;
    }

    arrayPosts.forEach(post => {
        const autor = autoresCache.get(post.autorUID) || {};
        const corBase = getComputedStyle(document.documentElement).getPropertyValue(`--cor-${post.autorRole || 'default'}`).trim() || '#bdc3c7';
        const avatarUrl = autor.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.autorNome || 'U')}&background=${corBase.replace('#','')}&color=fff`;
        const neon = `0 0 8px rgba(${hexToRgb(corBase)}, 0.6)`;
        
        const isAtivo = post.id === postAtivoId ? 'ring-2 ring-blue-500 bg-slate-800/90' : 'bg-slate-800/60 hover:bg-slate-800/80';

        let statusTag = '';
        if (isModerador) {
            if (post.oculto) statusTag = `<span class="absolute -top-3 right-4 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">🚫 OCULTO</span>`;
            else if (!post.exibir) statusTag = `<span class="absolute -top-3 right-4 bg-yellow-500 text-black text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">⚠️ AGUARDANDO</span>`;
            else statusTag = `<span class="absolute -top-3 right-4 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">✅ APROVADO</span>`;
        }

        feed.innerHTML += `
            <div class="post-card ${isAtivo} backdrop-blur-sm border border-slate-700 rounded-2xl p-5 cursor-pointer relative flex flex-col min-h-[180px] transition-all" data-id="${post.id}" data-uid="${post.autorUID}" data-role="${post.autorRole || 'default'}">
                ${statusTag}
                
                <div class="flex items-center gap-3 mb-4">
                    <img src="${avatarUrl}" class="w-10 h-10 rounded-full border-2 border-slate-700 object-cover avatar-click hover:scale-110 transition-transform" style="box-shadow: ${neon}; border-color: ${corBase}" title="Ver Perfil">
                    <div class="flex-1">
                        <p class="text-white text-sm font-bold flex items-center gap-1">${post.autorNome || 'Usuário'} <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 uppercase tracking-wider">${post.autorRole || 'Aluno'}</span></p>
                        <p class="text-slate-400 text-xs">${new Date(post.criadoEm?.toDate() || Date.now()).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div class="flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-lg shrink-0">
                        <i class="fas fa-star text-xs text-yellow-500"></i>
                        <span class="text-white font-bold text-sm">${post.elogios || 0}</span>
                    </div>
                </div>

                <h3 class="font-bold text-white text-lg line-clamp-2 leading-tight mb-2">${post.titulo}</h3>
                <p class="text-slate-300 text-sm line-clamp-3 mb-4 leading-relaxed">${DOMPurify.sanitize(post.conteudo)}</p>

                ${isModerador ? `
                <div class="mt-auto pt-3 border-t border-slate-700/50 flex justify-end gap-2">
                    ${!post.exibir || post.oculto ? `<button class="btn-aprovar text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg shadow"><i class="fas fa-check"></i></button>` : ''}
                    ${!post.oculto ? `<button class="btn-ocultar text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg shadow"><i class="fas fa-eye-slash"></i></button>` : ''}
                    <button class="btn-deletar text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg shadow"><i class="fas fa-trash"></i></button>
                </div>
                ` : ''}
            </div>
        `;
    });
}

async function abrirPostNoPainel(postId, isModerador, isUpdate = false) {
    const post = postsMap.get(postId);
    if (!post) return;

    postAtivoId = postId;
    const panel = document.getElementById('sidePanelPost');
    const content = document.getElementById('sidePanelContent');
    const feedGrid = document.getElementById('feedPosts');

    feedGrid.classList.remove('xl:grid-cols-3');
    feedGrid.classList.add('xl:grid-cols-2');

    panel.classList.remove('hidden');
    setTimeout(() => panel.classList.remove('translate-x-full'), 10);

    if(!isUpdate) renderizarFeed(isModerador); 

    let autor = autoresCache.get(post.autorUID);
    if (!autor || autor === 'loading') {
        content.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-slate-400"><i class="fas fa-spinner fa-spin text-4xl mb-4 text-blue-500"></i> Carregando postagem...</div>';
        try {
            const docSnap = await getDoc(doc(db, "users", post.autorUID));
            autor = docSnap.exists() ? docSnap.data() : {};
            autoresCache.set(post.autorUID, autor);
        } catch(e) {
            autor = {};
        }
    }

    // Corrige a checagem de visitante usando a variável certa
    const isVisitante = !currentLoggedInUser; 

    const corBase = getComputedStyle(document.documentElement).getPropertyValue(`--cor-${post.autorRole || 'default'}`).trim() || '#bdc3c7';
    
    // Fallbacks visuais corrigidos para pegar Banner/Cover Image
    const avatarUrl = isVisitante 
        ? `https://ui-avatars.com/api/?name=Oculto&background=333&color=fff` 
        : (autor.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.autorNome || 'U')}&background=${corBase.replace('#','')}&color=fff`);
    
    const coverUrl = isVisitante ? null : (autor.coverImageURL || autor.bannerURL || autor.photoCapa || null);
    const neon = isVisitante ? 'none' : `0 0 15px rgba(${hexToRgb(corBase)}, 0.5)`;
    const nomeExibicao = isVisitante ? 'Membro Oculto' : post.autorNome;
    
    // VITRINE DE TÍTULOS 
    let listaTitulosHtml = '';
    if (!isVisitante) {
        if (autor.titulosConquistados && Object.keys(autor.titulosConquistados).length > 0) {
            listaTitulosHtml = '<div class="flex flex-wrap gap-1.5 mt-3">';
            for (const [id, dados] of Object.entries(autor.titulosConquistados)) {
                const isFaIcon = dados.icone && dados.icone.includes('fa-');
                const iconeHtml = isFaIcon ? `<i class="${dados.icone} mr-1"></i>` : `${dados.icone || '🏆'} `;
                const classeAtivo = dados.tituloAtivadoUser ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-sm border-orange-400' : 'bg-slate-800/80 text-slate-300 border-slate-600';
                listaTitulosHtml += `<div class="${classeAtivo} px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center">${iconeHtml} ${dados.nome}</div>`;
            }
            listaTitulosHtml += '</div>';
        } else {
            listaTitulosHtml = `<div class="mt-3 inline-block bg-gradient-to-r from-slate-600 to-slate-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border border-slate-800">🏆 Aspirante</div>`;
        }
    }

    const coverStyle = coverUrl ? `background-image: url('${coverUrl}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${corBase}88, #0f172a);`;

    const jaElogiou = (currentLoggedInUser && post.elogiosDetalhados?.[currentLoggedInUser.uid]) ? 'text-yellow-500' : 'text-slate-400';
    const btnElogioClass = jaElogiou.includes('yellow') ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-slate-700 hover:bg-slate-600 border-slate-600';
    
    const isEquipe = window.userRoles?.Admin || window.userRoles?.Moderador || window.userRoles?.Professor || window.userRoles?.Coordenacao;
    let acoesEquipeHtml = '';
    if (isEquipe) {
        acoesEquipeHtml = `
            <div class="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex gap-2 justify-center">
                <button id="btnAplicarCartao" class="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded-lg font-bold shadow transition-colors"><i class="fas fa-square text-yellow-300"></i> Aplicar Cartão</button>
                <button id="btnExcluirPost" class="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg font-bold shadow transition-colors"><i class="fas fa-trash"></i> Excluir</button>
            </div>
        `;
    }

    content.className = "overflow-y-auto h-full flex flex-col relative w-full p-0"; 
    
    content.innerHTML = `
        <div class="w-full shrink-0 border-b border-slate-700 pb-5 mb-5 block">
            <div class="w-full h-28 relative block" style="${coverStyle}">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-800 to-transparent opacity-90"></div>
            </div>
            <div class="px-6 relative -mt-12 flex flex-col block">
                <div class="flex items-end gap-3 block">
                    <div class="w-24 h-24 rounded-full border-4 object-cover overflow-hidden bg-slate-800 shrink-0 inline-block" style="border-color: ${corBase}; box-shadow: ${neon}">
                        <img src="${avatarUrl}" class="w-full h-full object-cover">
                    </div>
                    <div class="pb-1 inline-block">
                        <h3 class="text-white font-black text-xl leading-none shadow-sm drop-shadow-md">${nomeExibicao}</h3>
                        ${!isVisitante ? `<p class="text-[10px] font-bold uppercase tracking-widest mt-1.5 inline-block px-2 py-0.5 rounded-full" style="background-color: ${corBase}40; color: ${corBase}">${post.autorRole || 'Aluno'}</p>` : ''}
                    </div>
                </div>
                ${!isVisitante ? `<p class="text-blue-400 text-xs mt-3 font-semibold block"><i class="fas fa-users mr-1"></i> Turma: ${post.autorTurma || 'Geral'}</p>` : ''}
                ${listaTitulosHtml}
            </div>
        </div>

        <div class="px-6 flex-1 flex flex-col block">
            <h2 class="text-2xl font-black text-white mb-4 leading-tight">${post.titulo}</h2>
            <div class="prose prose-invert prose-slate max-w-none text-slate-300 text-base leading-relaxed mb-4">
                ${DOMPurify.sanitize(post.conteudo).replace(/\n/g, '<br>')}
            </div>
            
            ${acoesEquipeHtml}

            <div class="mt-auto pt-6 border-t border-slate-700 flex justify-between items-center pb-6">
                <button id="btnElogiarPainel" class="flex items-center gap-2 px-6 py-3 rounded-xl border transition-all ${btnElogioClass}">
                    <i class="fas fa-star ${jaElogiou} text-lg"></i>
                    <span class="text-white font-bold text-sm">Elogiar Post (${post.elogios || 0})</span>
                </button>
            </div>
        </div>
    `;

    if (isEquipe) {
        document.getElementById('btnAplicarCartao').addEventListener('click', async () => {
            if(confirm("Aplicar Cartão Amarelo? O post será oculto e o autor receberá 1 advertência.")) {
                try {
                    await updateDoc(doc(db, "posts", postId), { exibir: false, oculto: true, cartaoAplicado: true });
                    await updateDoc(doc(db, "users", post.autorUID), { cartaoAmareloPosts: increment(1) });
                    alert("Cartão aplicado com sucesso!");
                    fecharPainelPost();
                } catch(e) { alert("Erro ao aplicar cartão."); }
            }
        });

        document.getElementById('btnExcluirPost').addEventListener('click', async () => {
            if(confirm("Excluir DEFINITIVAMENTE este post?")) {
                await deleteDoc(doc(db, "posts", postId));
                fecharPainelPost();
            }
        });
    }

    // CORREÇÃO DOS ELOGIOS: Usa a variável segura verificada na renderização da tela
    document.getElementById('btnElogiarPainel').addEventListener('click', async () => {
        if(!currentLoggedInUser) return alert("Faça login para elogiar.");
        try {
            await runTransaction(db, async (t) => {
                const ref = doc(db, "posts", postId);
                const docSnap = await t.get(ref);
                if (docSnap.data().elogiosDetalhados?.[currentLoggedInUser.uid]) throw "Já elogiado";
                t.update(ref, { elogios: increment(1), [`elogiosDetalhados.${currentLoggedInUser.uid}`]: true });
            });
            
            // Reação Visual Imediata para o Usuário
            const btn = document.getElementById('btnElogiarPainel');
            const icone = btn.querySelector('.fa-star');
            icone.classList.replace('text-slate-400', 'text-yellow-500');
            icone.classList.add('elogio-animado');
            btn.classList.replace('border-slate-600', 'border-yellow-500/50');
            btn.classList.replace('bg-slate-700', 'bg-yellow-500/10');
            
        } catch(e) { 
            if (e !== "Já elogiado") console.error(e); 
        }
    });
}

function fecharPainelPost() {
    postAtivoId = null;
    const panel = document.getElementById('sidePanelPost');
    const feedGrid = document.getElementById('feedPosts');
    
    panel.classList.add('translate-x-full');
    setTimeout(() => panel.classList.add('hidden'), 300); 
    
    feedGrid.classList.remove('xl:grid-cols-2');
    feedGrid.classList.add('xl:grid-cols-3');
    
    renderizarFeed(window.userRoles?.Admin || window.userRoles?.Moderador);
}

function dispararConfetes() {
    const container = document.createElement('div');
    container.className = 'fixed inset-0 pointer-events-none z-[9999] overflow-hidden';
    document.body.appendChild(container);
    const cores = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    
    for (let i = 0; i < 60; i++) {
        const confete = document.createElement('div');
        confete.className = 'absolute w-3 h-3 opacity-0';
        confete.style.left = Math.random() * 100 + 'vw';
        confete.style.backgroundColor = cores[Math.floor(Math.random() * cores.length)];
        confete.style.animation = `confetti-fall ${3 + Math.random() * 2}s ease-out forwards`;
        confete.style.animationDelay = Math.random() * 0.5 + 's';
        container.appendChild(confete);
    }
    setTimeout(() => container.remove(), 6000);
}