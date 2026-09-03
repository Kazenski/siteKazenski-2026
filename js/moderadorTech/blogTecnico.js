import { db, storage, auth } from '../core/firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

window.blogAPI = {
    categoriasCache: [],
    postsCache: [],
    currentBlob: null,
    currentUserMod: null,

    // =====================================
    // 1. INICIALIZAÇÃO DA ÁREA DO MODERADOR
    // =====================================
    initMod: async () => {
        if (!auth.currentUser) return;
        const uSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (uSnap.exists()) window.blogAPI.currentUserMod = { uid: uSnap.id, ...uSnap.data() };

        window.blogAPI.loadCategories();
        window.blogAPI.listenPosts();

        // Listener do formulário
        const form = document.getElementById('form-blog');
        if (form) {
            // Remove listener antigo para evitar duplicação em re-renders
            const novoForm = form.cloneNode(true);
            form.parentNode.replaceChild(novoForm, form);
            novoForm.addEventListener('submit', window.blogAPI.savePost);
        }

        // Listeners de filtro
        document.getElementById('blog-filter-title')?.addEventListener('input', window.blogAPI.renderAdminGrid);
        document.getElementById('blog-filter-cat')?.addEventListener('change', window.blogAPI.renderAdminGrid);
        document.getElementById('blog-filter-status')?.addEventListener('change', window.blogAPI.renderAdminGrid);

        // Imagem Upload & Compressão
        document.getElementById('blog-imagem')?.addEventListener('change', window.blogAPI.handleImageUpload);
    },

    loadCategories: async () => {
        const snap = await getDocs(query(collection(db, "blog_categorias"), orderBy("nome")));
        window.blogAPI.categoriasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const selAdmin = document.getElementById('blog-categoria');
        const selFilter = document.getElementById('blog-filter-cat');
        
        let opts = '<option value="">Selecione...</option>';
        window.blogAPI.categoriasCache.forEach(c => opts += `<option value="${c.nome}">${c.nome}</option>`);
        
        if (selAdmin) selAdmin.innerHTML = opts;
        if (selFilter) selFilter.innerHTML = '<option value="">Todas Categorias</option>' + opts;
    },

    addCategory: async () => {
        const cat = prompt("Digite o nome da nova Categoria:");
        if (!cat) return;
        try {
            await addDoc(collection(db, "blog_categorias"), { nome: cat, criadoEm: serverTimestamp() });
            window.blogAPI.loadCategories();
        } catch(e) { alert("Erro ao criar categoria"); }
    },

    toggleForm: () => {
        const container = document.getElementById('blog-form-container');
        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            document.getElementById('form-blog').reset();
            document.getElementById('blog-id').value = '';
            document.getElementById('blog-preview-img').src = '';
            document.getElementById('blog-preview-img').classList.add('hidden');
            document.getElementById('blog-form-title').innerHTML = '<i class="fas fa-pen-nib mr-2"></i> Redigir Artigo';
            window.blogAPI.currentBlob = null;
        } else {
            container.classList.add('hidden');
        }
    },

    handleImageUpload: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const MAX_WIDTH = 1200; // Resolução boa para capa
                let scale = 1;
                if (img.width > MAX_WIDTH) scale = MAX_WIDTH / img.width;

                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    window.blogAPI.currentBlob = blob;
                    const preview = document.getElementById('blog-preview-img');
                    preview.src = URL.createObjectURL(blob);
                    preview.classList.remove('hidden');
                }, 'image/webp', 0.85); // Compressão WEBP
            };
        };
        reader.readAsDataURL(file);
    },

    savePost: async (e) => {
        e.preventDefault();
        const id = document.getElementById('blog-id').value;
        const titulo = document.getElementById('blog-titulo').value.trim();
        const conteudo = document.getElementById('blog-conteudo').value.trim();
        const categoria = document.getElementById('blog-categoria').value;

        if (!titulo || !conteudo || !categoria) return alert("Preencha título, conteúdo e categoria.");
        if (!id && !window.blogAPI.currentBlob) return alert("Obrigatório enviar uma imagem de capa.");

        const btn = document.getElementById('btn-save-blog');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        try {
            let imageUrl = null;
            if (window.blogAPI.currentBlob) {
                const imgRef = ref(storage, `blog_images/${Date.now()}.webp`);
                const snap = await uploadBytes(imgRef, window.blogAPI.currentBlob);
                imageUrl = await getDownloadURL(snap.ref);
            }

            const isProfOrAdmin = window.blogAPI.currentUserMod.Admin || window.blogAPI.currentUserMod.Professor;

            const payload = {
                titulo, conteudo, categoria,
                dataAlteracao: serverTimestamp(),
                editadoPor: window.blogAPI.currentUserMod.nome
            };

            if (imageUrl) payload.imagemUrl = imageUrl;

            if (id) {
                await updateDoc(doc(db, "blog_posts"), payload);
            } else {
                // Novos campos base
                payload.autorId = window.blogAPI.currentUserMod.uid;
                payload.autorNome = window.blogAPI.currentUserMod.nome;
                payload.turma = window.blogAPI.currentUserMod.turma || "Geral";
                payload.escola = window.blogAPI.currentUserMod.escola || "Geral";
                payload.dataCriacao = serverTimestamp();
                payload.views = 0;
                payload.aprovacoes = isProfOrAdmin ? ['admin_bypass1', 'admin_bypass2'] : []; // Admin publica direto
                payload.rejeicoes = [];
                payload.visivel = isProfOrAdmin; // Só fica visível direto se for staff superior

                await addDoc(collection(db, "blog_posts"), payload);
            }

            window.blogAPI.toggleForm();
            alert("Post submetido com sucesso!");
        } catch (error) {
            alert("Erro ao salvar: " + error.message);
        } finally {
            btn.innerHTML = 'Submeter para Revisão';
            btn.disabled = false;
        }
    },

    listenPosts: () => {
        const q = query(collection(db, "blog_posts"), orderBy("dataCriacao", "desc"));
        onSnapshot(q, (snap) => {
            window.blogAPI.postsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.blogAPI.renderAdminGrid();
            window.blogAPI.updateMetrics();
        });
    },

    renderAdminGrid: () => {
        const grid = document.getElementById('blog-admin-grid');
        if (!grid) return;

        const termo = (document.getElementById('blog-filter-title')?.value || '').toLowerCase();
        const cat = document.getElementById('blog-filter-cat')?.value;
        const statusFilter = document.getElementById('blog-filter-status')?.value;

        const filtered = window.blogAPI.postsCache.filter(p => {
            const tituloMatch = p.titulo.toLowerCase().includes(termo);
            const catMatch = cat ? p.categoria === cat : true;
            
            let statusStr = "Aguardando";
            if (p.rejeicoes && p.rejeicoes.length > 0) statusStr = "Recusado";
            else if (p.visivel) statusStr = "Publicado";
            else if (p.aprovacoes && p.aprovacoes.length === 1) statusStr = "Em Revisao";

            const statusMatch = statusFilter ? statusStr === statusFilter : true;
            return tituloMatch && catMatch && statusMatch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="text-center text-slate-500 py-10 italic">Nenhum artigo encontrado.</div>';
            return;
        }

        grid.innerHTML = filtered.map(p => {
            const aprovCount = p.aprovacoes ? p.aprovacoes.length : 0;
            const rejCount = p.rejeicoes ? p.rejeicoes.length : 0;
            
            let statusBadge = '';
            if (rejCount > 0) {
                statusBadge = '<span class="bg-red-500/20 text-red-400 border border-red-500/50 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest"><i class="fas fa-times mr-1"></i> Recusado</span>';
            } else if (p.visivel) {
                statusBadge = '<span class="bg-green-500/20 text-green-400 border border-green-500/50 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest"><i class="fas fa-check-double mr-1"></i> Publicado</span>';
            } else {
                statusBadge = `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/50 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest"><i class="fas fa-clock mr-1"></i> Aguardando (${aprovCount}/2)</span>`;
            }

            const podeExcluir = window.blogAPI.currentUserMod.Admin || window.blogAPI.currentUserMod.Professor;
            const euAprovei = p.aprovacoes?.includes(window.blogAPI.currentUserMod.uid);
            const souAutor = p.autorId === window.blogAPI.currentUserMod.uid;

            let acoes = `<button onclick="window.blogAPI.editPost('${p.id}')" class="text-blue-400 hover:text-white bg-slate-800 p-2 rounded transition-colors" title="Editar"><i class="fas fa-edit"></i></button>`;
            
            if (podeExcluir) {
                acoes += `<button onclick="window.blogAPI.deletePost('${p.id}')" class="text-red-500 hover:text-white bg-slate-800 p-2 rounded transition-colors ml-2" title="Excluir Definitivamente"><i class="fas fa-trash"></i></button>`;
            }

            // Ações de Aprovação/Recusa para outros moderadores
            if (!souAutor && !p.visivel && rejCount === 0) {
                if (!euAprovei) {
                    acoes += `<button onclick="window.blogAPI.approvePost('${p.id}')" class="text-green-400 hover:text-white bg-slate-800 p-2 rounded transition-colors ml-2" title="Aprovar"><i class="fas fa-thumbs-up"></i></button>`;
                }
                acoes += `<button onclick="window.blogAPI.rejectPost('${p.id}')" class="text-red-400 hover:text-white bg-slate-800 p-2 rounded transition-colors ml-2" title="Recusar/Solicitar Alteração"><i class="fas fa-thumbs-down"></i></button>`;
            }

            // Renderiza as justificativas de recusa se houver
            let recusaHtml = '';
            if (rejCount > 0) {
                recusaHtml = `<div class="mt-3 bg-red-950/40 p-3 rounded-lg border border-red-900/50">
                    <span class="text-xs font-bold text-red-400 block mb-1">Motivos da Recusa:</span>
                    <ul class="text-[10px] text-red-300 list-disc list-inside ml-2">
                        ${p.rejeicoes.map(r => `<li><b>${r.nome}:</b> ${r.motivo}</li>`).join('')}
                    </ul>
                </div>`;
            }

            return `
            <div class="bg-slate-900 border border-slate-700 p-5 rounded-2xl flex flex-col md:flex-row gap-5 items-start transition-all hover:border-slate-500">
                <img src="${p.imagemUrl}" class="w-full md:w-40 h-28 object-cover rounded-xl border border-slate-700 shrink-0">
                <div class="flex-grow w-full">
                    <div class="flex justify-between items-start gap-2 mb-2">
                        <h4 class="text-white font-bold text-lg leading-tight">${p.titulo}</h4>
                        <div class="shrink-0">${statusBadge}</div>
                    </div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3">
                        <i class="fas fa-user-edit text-indigo-400 mr-1"></i> Autor: <span class="text-slate-200">${p.autorNome}</span>
                        <span class="mx-2">|</span> <i class="fas fa-tag text-indigo-400 mr-1"></i> ${p.categoria}
                        <span class="mx-2">|</span> <i class="fas fa-eye text-indigo-400 mr-1"></i> ${p.views || 0} Views
                    </div>
                    <p class="text-xs text-slate-500 line-clamp-2">${p.conteudo.replace(/<[^>]*>?/gm, '')}</p>
                    ${recusaHtml}
                </div>
                <div class="flex md:flex-col gap-2 shrink-0 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    ${acoes}
                </div>
            </div>`;
        }).join('');
    },

    editPost: (id) => {
        const p = window.blogAPI.postsCache.find(x => x.id === id);
        if(!p) return;
        
        window.blogAPI.toggleForm();
        document.getElementById('blog-form-title').innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Artigo';
        document.getElementById('blog-id').value = p.id;
        document.getElementById('blog-titulo').value = p.titulo;
        document.getElementById('blog-categoria').value = p.categoria;
        document.getElementById('blog-conteudo').value = p.conteudo;
        
        const preview = document.getElementById('blog-preview-img');
        preview.src = p.imagemUrl;
        preview.classList.remove('hidden');

        document.getElementById('blog-form-container').scrollIntoView({behavior: 'smooth'});
    },

    deletePost: async (id) => {
        if (!confirm("Excluir este post permanentemente do sistema?")) return;
        try { await deleteDoc(doc(db, "blog_posts", id)); } 
        catch(e) { alert("Erro ao excluir."); }
    },

    approvePost: async (id) => {
        const p = window.blogAPI.postsCache.find(x => x.id === id);
        if(!p) return;

        try {
            const novasAprovs = [...(p.aprovacoes || []), window.blogAPI.currentUserMod.uid];
            const updates = { aprovacoes: novasAprovs };
            
            // Se atingir 2 aprovações, publica!
            if (novasAprovs.length >= 2) updates.visivel = true;

            await updateDoc(doc(db, "blog_posts", id), updates);
        } catch(e) { alert("Erro ao aprovar."); }
    },

    rejectPost: async (id) => {
        const motivo = prompt("Descreva o motivo da recusa ou o que o autor deve alterar:");
        if (!motivo) return;

        const p = window.blogAPI.postsCache.find(x => x.id === id);
        try {
            const ref = { uid: window.blogAPI.currentUserMod.uid, nome: window.blogAPI.currentUserMod.nome, motivo, data: new Date().toISOString() };
            const novasRej = [...(p.rejeicoes || []), ref];
            
            await updateDoc(doc(db, "blog_posts", id), { 
                rejeicoes: novasRej,
                visivel: false // Garante que não vá pro ar
            });
        } catch(e) { alert("Erro ao recusar."); }
    },

    updateMetrics: () => {
        if (!window.blogAPI.currentUserMod) return;
        const myUid = window.blogAPI.currentUserMod.uid;

        let meusCriados = 0;
        let equipeAprovados = 0;
        let recusados = 0;
        let totalViews = 0;

        window.blogAPI.postsCache.forEach(p => {
            if (p.autorId === myUid) meusCriados++;
            if (p.visivel) equipeAprovados++;
            if (p.rejeicoes && p.rejeicoes.length > 0) recusados++;
            if (p.views) totalViews += p.views;
        });

        document.getElementById('metric-meus-posts').textContent = meusCriados;
        document.getElementById('metric-aprovados').textContent = equipeAprovados;
        document.getElementById('metric-recusados').textContent = recusados;
        document.getElementById('metric-views').textContent = totalViews;
    },

    // =====================================
    // 2. INICIALIZAÇÃO DA ÁREA DO LEITOR (TEHNOBLOG STYLE)
    // =====================================
    initReader: async () => {
        const container = document.getElementById('blog-tech-content');
        if (!container) return;

        // Estrutura Principal do Leitor (Top Menu de Categorias + Destaque + Grid)
        container.innerHTML = `
            <div class="max-w-7xl mx-auto w-full flex flex-col min-h-full pb-20 fade-in">
                <!-- Header / Logo -->
                <div class="flex flex-col md:flex-row justify-between items-center py-8 border-b border-slate-800 mb-8 shrink-0">
                    <h1 class="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase" style="font-family: 'Inter', sans-serif;">
                        KAZENSKI <span class="text-indigo-500">TECH</span>
                    </h1>
                    
                    <!-- Search e Categorias -->
                    <div class="flex items-center gap-4 mt-6 md:mt-0 w-full md:w-auto overflow-x-auto no-scrollbar pb-2 md:pb-0">
                        <div class="relative min-w-[200px]">
                            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                            <input type="text" id="reader-search" placeholder="Pesquisar artigos..." class="w-full bg-slate-900 border border-slate-700 rounded-full py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-indigo-500 transition-colors">
                        </div>
                        <div id="reader-categories" class="flex gap-2 shrink-0">
                            <!-- Categorias injetadas -->
                        </div>
                    </div>
                </div>

                <!-- Conteúdo -->
                <div id="reader-content" class="flex-grow flex flex-col gap-10">
                    <div class="text-center py-20 text-indigo-400"><i class="fas fa-spinner fa-spin text-4xl"></i></div>
                </div>
            </div>

            <!-- Modal de Leitura do Artigo -->
            <div id="modal-read-post" class="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[3000] hidden overflow-y-auto custom-scroll p-4 md:p-8">
                <div class="max-w-4xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative flex flex-col fade-in my-10 overflow-hidden">
                    <button onclick="window.blogAPI.closeReaderModal()" class="absolute top-6 right-6 w-12 h-12 bg-slate-950/50 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-all z-20 backdrop-blur-sm"><i class="fas fa-times text-xl"></i></button>
                    
                    <div id="read-header-img" class="w-full h-[400px] bg-cover bg-center relative">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
                        <div class="absolute bottom-0 left-0 w-full p-8 md:p-12 z-10">
                            <span id="read-categoria" class="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded shadow-lg mb-4 inline-block">Categoria</span>
                            <h1 id="read-titulo" class="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg mb-4">Título</h1>
                            <div class="flex items-center gap-4 text-xs text-slate-300 font-bold uppercase tracking-widest">
                                <span><i class="fas fa-user-edit text-indigo-400 mr-1"></i> <span id="read-autor">Autor</span></span>
                                <span><i class="far fa-calendar-alt text-indigo-400 mr-1"></i> <span id="read-data">Data</span></span>
                            </div>
                        </div>
                    </div>

                    <div class="p-8 md:p-12 bg-slate-900">
                        <div id="read-conteudo" class="custom-html-content text-slate-300 text-lg leading-relaxed font-serif"></div>
                        
                        <!-- Avaliação -->
                        <div class="mt-16 pt-8 border-t border-slate-800 flex flex-col items-center">
                            <h4 class="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-4">Avalie este artigo</h4>
                            <div id="read-stars" class="flex gap-2 text-2xl cursor-pointer text-slate-600 transition-colors">
                                <i class="fas fa-star hover:text-amber-400" onclick="window.blogAPI.ratePost(1)"></i>
                                <i class="fas fa-star hover:text-amber-400" onclick="window.blogAPI.ratePost(2)"></i>
                                <i class="fas fa-star hover:text-amber-400" onclick="window.blogAPI.ratePost(3)"></i>
                                <i class="fas fa-star hover:text-amber-400" onclick="window.blogAPI.ratePost(4)"></i>
                                <i class="fas fa-star hover:text-amber-400" onclick="window.blogAPI.ratePost(5)"></i>
                            </div>
                            <p id="read-rating-msg" class="text-xs text-slate-500 mt-2 h-4"></p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('reader-search')?.addEventListener('input', window.blogAPI.renderReaderContent);

        // Busca dados
        const snapCat = await getDocs(query(collection(db, "blog_categorias"), orderBy("nome")));
        window.blogAPI.categoriasCache = snapCat.docs.map(d => ({ id: d.id, ...d.data() }));

        const q = query(collection(db, "blog_posts"), where("visivel", "==", true), orderBy("dataCriacao", "desc"));
        onSnapshot(q, (snap) => {
            window.blogAPI.postsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.blogAPI.renderReaderContent();
        });
    },

    renderReaderContent: () => {
        const container = document.getElementById('reader-content');
        if (!container) return;

        // Renderiza botões de categoria
        const catContainer = document.getElementById('reader-categories');
        if (catContainer && catContainer.children.length === 0) {
            let catHtml = `<button onclick="window.blogAPI.filterReaderCat('')" class="bg-indigo-600 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-lg">Tudo</button>`;
            window.blogAPI.categoriasCache.forEach(c => {
                catHtml += `<button onclick="window.blogAPI.filterReaderCat('${c.nome}')" class="bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border border-slate-700">${c.nome}</button>`;
            });
            catContainer.innerHTML = catHtml;
        }

        const termo = (document.getElementById('reader-search')?.value || '').toLowerCase();
        const catFilter = window.blogAPI.readerActiveCat || '';

        const posts = window.blogAPI.postsCache.filter(p => {
            const matchTitle = p.titulo.toLowerCase().includes(termo);
            const matchCat = catFilter ? p.categoria === catFilter : true;
            return matchTitle && matchCat;
        });

        if (posts.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-500 py-20 italic">Nenhum artigo encontrado.</div>';
            return;
        }

        const destaque = posts[0];
        const gridPosts = posts.slice(1);

        let html = `
            <!-- Destaque Principal (Estilo Tecnoblog) -->
            <div onclick="window.blogAPI.openReaderModal('${destaque.id}')" class="w-full h-[400px] md:h-[500px] relative rounded-3xl overflow-hidden cursor-pointer group shadow-2xl transition-all hover:ring-4 hover:ring-indigo-500/50">
                <img src="${destaque.imagemUrl}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent"></div>
                <div class="absolute bottom-0 left-0 w-full p-8 md:p-12 z-10 flex flex-col items-start">
                    <span class="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded shadow-lg mb-4">${destaque.categoria}</span>
                    <h2 class="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg mb-3 group-hover:text-indigo-300 transition-colors">${destaque.titulo}</h2>
                    <div class="text-[10px] md:text-xs text-slate-300 font-bold uppercase tracking-widest flex items-center gap-3">
                        <span><i class="fas fa-user-edit text-indigo-500"></i> ${destaque.autorNome}</span>
                        <span class="text-slate-600">|</span>
                        <span><i class="far fa-clock text-indigo-500"></i> ${destaque.dataCriacao?.toDate().toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            </div>

            <!-- Grid de Artigos Secundários -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        `;

        gridPosts.forEach(p => {
            html += `
                <div onclick="window.blogAPI.openReaderModal('${p.id}')" class="bg-slate-900 rounded-3xl overflow-hidden cursor-pointer group shadow-lg border border-slate-800 transition-all hover:-translate-y-2 hover:border-indigo-500 hover:shadow-[0_15px_30px_rgba(99,102,241,0.2)] flex flex-col h-full">
                    <div class="w-full h-48 relative overflow-hidden shrink-0">
                        <img src="${p.imagemUrl}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                        <span class="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-sm text-indigo-400 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border border-indigo-500/30">${p.categoria}</span>
                    </div>
                    <div class="p-6 flex flex-col flex-grow">
                        <h3 class="text-xl font-bold text-white leading-snug mb-3 group-hover:text-indigo-400 transition-colors">${p.titulo}</h3>
                        <p class="text-sm text-slate-400 line-clamp-3 leading-relaxed flex-grow">${p.conteudo.replace(/<[^>]*>?/gm, '')}</p>
                        
                        <div class="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center shrink-0">
                            <span class="text-[9px] text-slate-500 font-bold uppercase tracking-widest"><i class="fas fa-user text-indigo-500 mr-1"></i> ${p.autorNome}</span>
                            <span class="text-[9px] text-slate-500 font-bold uppercase tracking-widest">${p.dataCriacao?.toDate().toLocaleDateString('pt-BR')}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    },

    readerActiveCat: '',
    filterReaderCat: (cat) => {
        window.blogAPI.readerActiveCat = cat;
        // Atualiza botões
        const btns = document.getElementById('reader-categories').querySelectorAll('button');
        btns.forEach(b => {
            if (b.textContent === (cat || 'TUDO')) {
                b.className = 'bg-indigo-600 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-lg';
            } else {
                b.className = 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border border-slate-700';
            }
        });
        window.blogAPI.renderReaderContent();
    },

    openReaderModal: async (id) => {
        const p = window.blogAPI.postsCache.find(x => x.id === id);
        if(!p) return;

        window.blogAPI.activeReadId = id; // Para a avaliação

        document.getElementById('read-header-img').style.backgroundImage = `url('${p.imagemUrl}')`;
        document.getElementById('read-categoria').textContent = p.categoria;
        document.getElementById('read-titulo').textContent = p.titulo;
        document.getElementById('read-autor').textContent = p.autorNome;
        document.getElementById('read-data').textContent = p.dataCriacao?.toDate().toLocaleDateString('pt-BR');
        
        // Renderiza o HTML com segurança (usa o DOMPurify que já existe no seu projeto)
        const safeHTML = window.DOMPurify ? window.DOMPurify.sanitize(p.conteudo) : p.conteudo;
        document.getElementById('read-conteudo').innerHTML = safeHTML;

        // Limpa estrelas
        document.getElementById('read-rating-msg').textContent = '';
        window.blogAPI.paintStars(0);

        document.getElementById('modal-read-post').classList.remove('hidden');

        // Incrementa view no Firebase
        if (auth.currentUser) {
            try { await updateDoc(doc(db, "blog_posts", id), { views: (p.views || 0) + 1 }); } 
            catch(e) {}
        }
    },

    closeReaderModal: () => {
        document.getElementById('modal-read-post').classList.add('hidden');
    },

    activeReadId: null,
    
    paintStars: (num) => {
        const stars = document.getElementById('read-stars').querySelectorAll('i');
        stars.forEach((s, idx) => {
            if (idx < num) {
                s.classList.replace('text-slate-600', 'text-amber-400');
            } else {
                s.classList.replace('text-amber-400', 'text-slate-600');
            }
        });
    },

    ratePost: async (estrelas) => {
        if (!auth.currentUser || !window.blogAPI.activeReadId) return;
        
        window.blogAPI.paintStars(estrelas);
        const msg = document.getElementById('read-rating-msg');
        msg.textContent = 'Enviando avaliação...';

        try {
            const uid = auth.currentUser.uid;
            
            // Tenta pegar o nome do usuário logado de forma rápida
            let nomeAval = "Estudante";
            try {
                const uSnap = await getDoc(doc(db, "users", uid));
                if(uSnap.exists()) nomeAval = uSnap.data().nome;
            } catch(e){}

            const avaliacao = {
                uid: uid,
                nome: nomeAval,
                estrelas: estrelas,
                data: new Date().toISOString()
            };

            await updateDoc(doc(db, "blog_posts", window.blogAPI.activeReadId), {
                avaliacoes: arrayUnion(avaliacao)
            });

            msg.className = "text-xs text-green-400 mt-2 font-bold";
            msg.textContent = "Avaliação registrada com sucesso! Obrigado.";
        } catch(e) {
            msg.className = "text-xs text-red-500 mt-2 font-bold";
            msg.textContent = "Erro ao registrar avaliação.";
        }
    }
};