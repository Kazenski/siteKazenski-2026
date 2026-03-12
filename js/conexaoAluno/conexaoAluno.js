import { db } from '../core/firebase.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, runTransaction, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let unsubscribeGeral = null;
let postsMap = new Map();
const autoresCache = new Map();

// Filtros Globais
let termoPesquisa = ''; 
let filtroStatusMod = 'aprovados'; // Usado pelo moderador: todos, aprovados, aguardando, ocultos
let ordenacaoAtiva = 'recentes';

const palavrasBloqueadas = ["otário", "imbecil", "idiota", "burro", "mané", "palhaço", "retardado", "demente", "babaca", "ridículo", "lixo", "nojento", "corno", "canalha", "vagabundo", "safado", "desgraçado", "porra", "merda", "burro", "buceta", "caralho", "fdp", "vsf", "vtnc"];

function validarConteudo(texto) {
    if (!texto) return false;
    const textoLimpo = texto.toLowerCase().replace(/[\W_]+/g, ' ').trim();
    return palavrasBloqueadas.some(palavra => {
        const regex = new RegExp(`\\b${palavra.replace(/\*/g, '[a-zA-Z]*')}\\b`, 'g');
        return regex.test(textoLimpo);
    });
}

function hexToRgb(hex) {
    if (!hex) return '51, 89, 140'; 
    const bigint = parseInt(hex.replace('#',''), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}

export function renderConexaoAlunoTab() {
    const container = document.getElementById('conexao-aluno-content');
    if (!container) return;

    const isModerador = window.userRoles?.Admin || window.userRoles?.Moderador;

    // Estrutura HTML da Tela
    container.innerHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
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

            <div id="feedPosts" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <div class="col-span-full text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i><br>Carregando publicações...</div>
            </div>
        </div>
    `;

    setupListeners(isModerador);
    carregarPostsListener(isModerador);
}

function setupListeners(isModerador) {
    const btnNovo = document.getElementById('btnNovoPost');
    const btnCancelar = document.getElementById('btnCancelarPost');
    const btnSalvar = document.getElementById('btnSalvarPost');
    const areaPost = document.getElementById('areaCriarPost');
    
    btnNovo.addEventListener('click', () => areaPost.classList.toggle('hidden'));
    btnCancelar.addEventListener('click', () => {
        areaPost.classList.add('hidden');
        document.getElementById('postTitulo').value = '';
        document.getElementById('postConteudo').value = '';
    });

    btnSalvar.addEventListener('click', async () => {
        const titulo = document.getElementById('postTitulo').value.trim();
        const conteudo = document.getElementById('postConteudo').value.trim();
        const isPublico = document.getElementById('postPublico').checked;

        if (!titulo || !conteudo) return alert("Preencha título e conteúdo.");
        if (validarConteudo(titulo) || validarConteudo(conteudo)) return alert("Conteúdo bloqueado pelas diretrizes de moderação.");

        const user = window.currentUser;
        if (!user) return alert("Você precisa estar logado.");

        btnSalvar.disabled = true;
        btnSalvar.textContent = "Publicando...";

        try {
            await addDoc(collection(db, "posts"), {
                titulo, conteudo, postPublico: isPublico,
                criadoEm: serverTimestamp(),
                autorUID: user.uid, autorNome: user.nome || 'Membro',
                autorTurma: user.turma || null, autorRole: window.userRoles?.Admin ? 'admin' : (window.userRoles?.Moderador ? 'moderador' : 'aluno'),
                elogios: 0, elogiosDetalhados: {}, exibir: false, oculto: false
            });
            
            areaPost.classList.add('hidden');
            document.getElementById('postTitulo').value = '';
            document.getElementById('postConteudo').value = '';
            dispararConfetes();
            alert("Sucesso! Seu post foi enviado e aguarda aprovação da moderação.");
        } catch (e) {
            console.error(e);
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

    // Delegação de eventos para o Feed (Ações do Post)
    document.getElementById('feedPosts').addEventListener('click', async (e) => {
        const postCard = e.target.closest('.post-card');
        if (!postCard) return;
        const postId = postCard.dataset.id;

        // Ações de Moderação
        if (e.target.closest('.btn-aprovar')) {
            if(confirm("Aprovar e exibir este post?")) await updateDoc(doc(db, "posts", postId), { exibir: true, oculto: false });
            return;
        }
        if (e.target.closest('.btn-ocultar')) {
            if(confirm("Ocultar este post de todos os alunos?")) await updateDoc(doc(db, "posts", postId), { exibir: false, oculto: true });
            return;
        }
        if (e.target.closest('.btn-deletar')) {
            if(confirm("EXCLUIR DEFINITIVAMENTE este post?")) await deleteDoc(doc(db, "posts", postId));
            return;
        }

        // Elogiar
        if (e.target.closest('.btn-elogiar')) {
            const userUID = window.currentUser?.uid;
            if(!userUID) return;
            const postRef = doc(db, "posts", postId);
            try {
                await runTransaction(db, async (t) => {
                    const postDoc = await t.get(postRef);
                    if (postDoc.data().elogiosDetalhados?.[userUID]) throw "Já elogiado";
                    t.update(postRef, { elogios: increment(1), [`elogiosDetalhados.${userUID}`]: true });
                });
            } catch (err) { if(err !== "Já elogiado") console.error(err); }
            return;
        }

        // Abrir Modal de Leitura (Se não clicou em nenhum botão de ação)
        abrirPostCompleto(postsMap.get(postId));
    });
}

function carregarPostsListener(isModerador) {
    if (unsubscribeGeral) unsubscribeGeral();
    postsMap.clear();

    const q = isModerador 
        ? query(collection(db, "posts"), orderBy("criadoEm", "desc")) // Moderador escuta TUDO
        : query(collection(db, "posts"), where("exibir", "==", true), where("oculto", "==", false), orderBy("criadoEm", "desc")); // Aluno escuta apenas aprovados

    unsubscribeGeral = onSnapshot(q, async (snapshot) => {
        const fetchPromises = [];
        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            postsMap.set(docSnap.id, data);
            
            // Busca dados do autor se não estiver no cache
            if (data.autorUID && !autoresCache.has(data.autorUID)) {
                autoresCache.set(data.autorUID, 'loading');
                fetchPromises.push(getDoc(doc(db, "users", data.autorUID)).then(u => {
                    if (u.exists()) autoresCache.set(data.autorUID, u.data());
                }));
            }
        });
        await Promise.all(fetchPromises);
        renderizarFeed(isModerador);
    });
}

function renderizarFeed(isModerador) {
    const feed = document.getElementById('feedPosts');
    if (!feed) return;

    let arrayPosts = Array.from(postsMap.values());
    const user = window.currentUser;

    // Aplicação de Filtros
    arrayPosts = arrayPosts.filter(post => {
        // Filtro de Texto
        if (termoPesquisa && !(post.titulo?.toLowerCase().includes(termoPesquisa) || post.conteudo?.toLowerCase().includes(termoPesquisa))) return false;
        
        // Filtros Especiais de Moderador
        if (isModerador) {
            if (filtroStatusMod === 'aprovados' && (!post.exibir || post.oculto)) return false;
            if (filtroStatusMod === 'aguardando' && (post.exibir || post.oculto)) return false;
            if (filtroStatusMod === 'ocultos' && !post.oculto) return false;
        } else {
            // Regra Aluno: Só vê da própria turma ou se for público (A query já garante que só chegam aprovados)
            if (!post.postPublico && post.autorTurma !== user?.turma && post.autorUID !== user?.uid) return false;
        }
        return true;
    });

    // Ordenação
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
        const jaElogiou = post.elogiosDetalhados?.[user?.uid] ? 'text-yellow-500' : 'text-slate-400 hover:text-yellow-500';

        // Tag de Status para o Moderador
        let statusTag = '';
        if (isModerador) {
            if (post.oculto) statusTag = `<span class="absolute -top-3 right-4 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">🚫 OCULTO</span>`;
            else if (!post.exibir) statusTag = `<span class="absolute -top-3 right-4 bg-yellow-500 text-black text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">⚠️ AGUARDANDO</span>`;
            else statusTag = `<span class="absolute -top-3 right-4 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">✅ APROVADO</span>`;
        }

        feed.innerHTML += `
            <div class="post-card bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl p-5 cursor-pointer relative flex flex-col h-[280px]" data-id="${post.id}" data-role="${post.autorRole || 'default'}">
                ${statusTag}
                
                <div class="flex justify-between items-start mb-3 gap-2">
                    <h3 class="font-bold text-white text-lg line-clamp-2 leading-tight">${post.titulo}</h3>
                    <div class="flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-lg shrink-0">
                        <i class="fas fa-star text-sm elogio-animado"></i>
                        <span class="text-white font-bold text-sm">${post.elogios || 0}</span>
                    </div>
                </div>

                <p class="text-slate-300 text-sm line-clamp-4 flex-grow mb-4 leading-relaxed">${DOMPurify.sanitize(post.conteudo)}</p>

                <div class="mt-auto border-t border-slate-700/50 pt-4 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <img src="${avatarUrl}" class="w-10 h-10 rounded-full border-2 border-slate-700 object-cover" style="box-shadow: ${neon}; border-color: ${corBase}">
                        <div>
                            <p class="text-white text-xs font-bold">${post.autorNome || 'Usuário'}</p>
                            <p class="text-slate-400 text-[10px] capitalize">${post.autorRole || 'Aluno'}</p>
                        </div>
                    </div>
                    
                    <button class="btn-elogiar flex items-center gap-1 bg-slate-700/50 hover:bg-slate-700 p-2 rounded-lg transition-colors">
                        <i class="fas fa-star ${jaElogiou}"></i>
                    </button>
                </div>

                ${isModerador ? `
                <div class="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-700 p-2 flex justify-center gap-2 rounded-b-xl opacity-0 hover:opacity-100 transition-opacity">
                    ${!post.exibir || post.oculto ? `<button class="btn-aprovar text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded shadow"><i class="fas fa-check"></i> Aprovar</button>` : ''}
                    ${!post.oculto ? `<button class="btn-ocultar text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1 rounded shadow"><i class="fas fa-eye-slash"></i> Ocultar</button>` : ''}
                    <button class="btn-deletar text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded shadow"><i class="fas fa-trash"></i></button>
                </div>
                ` : ''}
            </div>
        `;
    });
}

function abrirPostCompleto(post) {
    if(!post) return;
    // Utiliza os modais globais já criados no seu main.js, ou cria um dinâmico via SweetAlert (Recomendado criar um dinâmico simples aqui)
    const modalHtml = `
        <div id="modal-leitura-post" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div class="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
                <button onclick="document.getElementById('modal-leitura-post').remove()" class="absolute top-4 right-4 text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
                <h2 class="text-2xl font-black text-white mb-4 pr-8">${post.titulo}</h2>
                <div class="text-slate-300 whitespace-pre-wrap text-base leading-relaxed mb-8">${DOMPurify.sanitize(post.conteudo)}</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function dispararConfetes() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const cores = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    
    for (let i = 0; i < 60; i++) {
        const confete = document.createElement('div');
        confete.className = 'confetti';
        confete.style.left = Math.random() * 100 + 'vw';
        confete.style.backgroundColor = cores[Math.floor(Math.random() * cores.length)];
        confete.style.animationDelay = Math.random() * 0.5 + 's';
        container.appendChild(confete);
    }
    setTimeout(() => container.remove(), 5000);
}