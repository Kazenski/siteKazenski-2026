import { db, auth } from '../core/firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc, getDocs, where, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const els = {
    // Formulário Títulos
    formTitulo: document.getElementById('form-titulo'),
    formTitleLabel: document.getElementById('titulo-form-title'),
    docId: document.getElementById('titulo-doc-id'),
    nome: document.getElementById('titulo-nome'),
    descricao: document.getElementById('titulo-descricao'),
    explicacao: document.getElementById('titulo-explicacao'),
    icone: document.getElementById('titulo-icone'),
    ativo: document.getElementById('titulo-ativo'),
    listUl: document.getElementById('titulos-list'),
    searchInput: document.getElementById('search-titles-input'),
    
    // Condecorações
    turmaSelect: document.getElementById('award-turma-select'),
    alunoSelect: document.getElementById('award-aluno-select'),
    awardArea: document.getElementById('award-area'),
    awardList: document.getElementById('award-titles-list'),
    awardSearch: document.getElementById('search-award-titles-input'),
    btnSaveAwards: document.getElementById('save-awards-btn'),

    // Modal Exclusão
    delModal: document.getElementById('delete-title-modal'),
    delTitle: document.getElementById('delete-title-modal-title'),
    delInfo: document.getElementById('delete-title-modal-info'),
    delUserList: document.getElementById('delete-title-user-list'),
    delSelectAllCont: document.getElementById('delete-select-all-container'),
    delSelectAllBtn: document.getElementById('delete-title-select-all'),
    delConfirmBtn: document.getElementById('confirm-delete-title-btn')
};

let currentUserMod = null;
let titulosCache = [];
let turmasCache = [];
let usersCache = [];
let unsubTitulos = null;

window.titulosAPI = {
    init: async () => {
        // 1. Busca o usuário atual logado e suas permissões
        if(!auth.currentUser) return;
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if(!snap.exists()) return;
        currentUserMod = { uid: snap.id, ...snap.data() };

        // 2. Prepara Eventos das Abas (Navegação interna da moderação)
        document.querySelectorAll('.mod-subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mod-subtab-btn').forEach(b => {
                    b.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-blue-900/30');
                    b.classList.add('bg-slate-800', 'text-slate-400');
                });
                btn.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-blue-900/30');
                btn.classList.remove('bg-slate-800', 'text-slate-400');
                
                document.querySelectorAll('.mod-tab-content').forEach(c => c.classList.add('hidden'));
                document.getElementById(`mtab-${btn.dataset.target}`).classList.remove('hidden');
                document.getElementById(`mtab-${btn.dataset.target}`).classList.add('flex');
            });
        });

        // 3. Inicializa os Listeners do Banco
        window.titulosAPI.listenTitulos();
        await window.titulosAPI.loadAwardData();
    },

    // =======================================
    // MÓDULO: GESTÃO DE TÍTULOS
    // =======================================
    listenTitulos: () => {
        if(unsubTitulos) unsubTitulos();
        const q = query(collection(db, "titulosCadastrados"), orderBy("nome"));
        unsubTitulos = onSnapshot(q, (snap) => {
            titulosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            window.titulosAPI.renderTitulos(els.searchInput.value);
        });
    },

    renderTitulos: (searchTerm = '') => {
        const lowerSearch = searchTerm.toLowerCase().trim();
        const filtered = lowerSearch ? titulosCache.filter(t => t.nome.toLowerCase().includes(lowerSearch)) : titulosCache;

        els.listUl.innerHTML = filtered.length === 0 
            ? '<div class="text-center text-slate-500 italic p-6 text-sm">Nenhum título cadastrado ou encontrado.</div>' 
            : filtered.map(t => {
                const isAdmin = currentUserMod.Admin;
                const isCreator = t.idCriador === currentUserMod.uid;
                const canEdit = isAdmin || currentUserMod.Coordenacao || currentUserMod.Professor || isCreator;
                const canDelete = isAdmin; // Somente Admin pode excluir

                let btns = '';
                if(canEdit) btns += `<button onclick='window.titulosAPI.edit("${t.id}")' class="px-4 py-2 bg-slate-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold uppercase transition-colors"><i class="fas fa-edit"></i></button>`;
                if(canDelete) btns += `<button onclick='window.titulosAPI.reqDelete("${t.id}", "${t.nome}")' class="px-4 py-2 bg-red-900/30 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 hover:border-transparent rounded-lg text-xs font-bold uppercase transition-all"><i class="fas fa-trash"></i></button>`;

                return `
                <li class="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors gap-4">
                    <div class="flex-grow">
                        <div class="font-bold text-white text-base flex items-center gap-2">
                            <span>${t.icone || '🏅'}</span> ${t.nome} 
                            <span class="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${t.ativo ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}">${t.ativo ? 'Ativo' : 'Inativo'}</span>
                        </div>
                        <div class="text-xs text-slate-400 mt-1">${t.descricao}</div>
                    </div>
                    <div class="flex gap-2 shrink-0">${btns}</div>
                </li>`;
            }).join('');
    },

    resetForm: () => {
        els.formTitulo.reset();
        els.docId.value = '';
        els.formTitleLabel.innerHTML = '<i class="fas fa-medal mr-2"></i> Cadastrar Novo Título';
        els.ativo.checked = true;
    },

    edit: (id) => {
        const t = titulosCache.find(x => x.id === id);
        if(!t) return;
        els.formTitleLabel.innerHTML = '<i class="fas fa-edit mr-2 text-blue-400"></i> Editando Título';
        els.docId.value = t.id;
        els.nome.value = t.nome;
        els.descricao.value = t.descricao;
        els.explicacao.value = t.explicacaoDeUso || '';
        els.icone.value = t.icone || '';
        els.ativo.checked = t.ativo;
        els.nome.focus();
    },

    reqDelete: async (id, nome) => {
        try {
            const q = query(collection(db, "users"), where(`titulosConquistados.${id}`, "!=", null));
            const snap = await getDocs(q);
            const affected = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            els.delTitle.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i> Excluir: "${nome}"`;
            els.delConfirmBtn.dataset.id = id;

            if(affected.length === 0) {
                els.delInfo.textContent = "Nenhum aluno possui este título no momento. Será feita apenas a exclusão do registro oficial.";
                els.delSelectAllCont.classList.add('hidden');
                els.delUserList.innerHTML = '<div class="text-slate-500 italic text-xs">Ação segura para exclusão.</div>';
            } else {
                els.delInfo.textContent = `ATENÇÃO: Este título já foi concedido a ${affected.length} aluno(s). Marque abaixo de quais alunos você também deseja remover a medalha do perfil:`;
                els.delSelectAllCont.classList.remove('hidden');
                els.delSelectAllBtn.checked = false;
                els.delUserList.innerHTML = affected.map(u => `
                    <label class="flex items-center gap-3 p-2 hover:bg-slate-800 rounded cursor-pointer transition-colors">
                        <input type="checkbox" class="user-to-clear w-4 h-4 accent-red-500" value="${u.id}">
                        <span class="text-sm text-slate-300">${u.nome} <span class="text-[10px] text-slate-500 ml-2">(Turma: ${u.turma || 'N/A'})</span></span>
                    </label>
                `).join('');
            }
            els.delModal.classList.remove('hidden');
            els.delModal.classList.add('flex');
        } catch(e) {
            console.error("Erro exclusão:", e); alert("Erro ao preparar exclusão.");
        }
    },

    closeDeleteModal: () => {
        els.delModal.classList.add('hidden');
        els.delModal.classList.remove('flex');
    },

    // =======================================
    // MÓDULO: CONDECORAR ALUNOS
    // =======================================
    loadAwardData: async () => {
        try {
            // Turmas
            const tSnap = await getDocs(query(collection(db, "turmasCadastradas"), orderBy("nomeExibicao")));
            turmasCache = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Users
            const uSnap = await getDocs(query(collection(db, "users"), orderBy("nome")));
            usersCache = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            let allowedTurmas = [];
            if(currentUserMod.Admin || currentUserMod.Coordenacao) {
                allowedTurmas = turmasCache;
            } else if (currentUserMod.Professor || currentUserMod.Moderador) {
                // Filtra apenas a turma vinculada ao perfil (campo 'turma')
                const myTurma = turmasCache.find(t => t.identificador === currentUserMod.turma);
                if(myTurma) allowedTurmas = [myTurma];
            }

            els.turmaSelect.innerHTML = '<option value="">-- Selecione a Turma --</option>' + allowedTurmas.map(t => `<option value="${t.identificador}">${t.nomeExibicao}</option>`).join('');
            
        } catch(e) { console.error("Erro carregando condecorações:", e); }
    },

    renderAwardTitles: () => {
        if(!els.alunoSelect.value) { els.awardArea.classList.add('hidden'); els.awardArea.classList.remove('flex'); return; }
        
        const aluno = usersCache.find(u => u.id === els.alunoSelect.value);
        const owned = aluno?.titulosConquistados || {};
        const search = els.awardSearch.value.toLowerCase();
        
        const valid = titulosCache.filter(t => t.ativo && t.nome.toLowerCase().includes(search));

        els.awardList.innerHTML = valid.length === 0 ? '<div class="text-slate-500 italic text-sm p-4 col-span-2 text-center">Nenhuma medalha ativa encontrada.</div>' : valid.map(t => {
            const checked = owned[t.id] ? 'checked' : '';
            return `
            <label class="flex items-start gap-3 p-4 bg-slate-800 rounded-xl border border-slate-700 cursor-pointer hover:border-green-500/50 transition-colors group">
                <input type="checkbox" id="award-${t.id}" data-id="${t.id}" class="w-5 h-5 accent-green-500 mt-0.5" ${checked}>
                <div>
                    <div class="font-bold text-slate-200 text-sm group-hover:text-green-400 transition-colors">${t.icone || '🏅'} ${t.nome}</div>
                    <div class="text-[10px] text-slate-500 mt-1 italic leading-tight">${t.explicacaoDeUso || 'Sem requisitos especificados.'}</div>
                </div>
            </label>`;
        }).join('');
        
        els.awardArea.classList.remove('hidden');
        els.awardArea.classList.add('flex');
    }
};

// =======================================
// EVENT LISTENERS DOM
// =======================================
els.formTitulo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = els.docId.value;
    const btn = document.getElementById('btn-save-titulo');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const data = {
        nome: els.nome.value.trim(), descricao: els.descricao.value.trim(),
        explicacaoDeUso: els.explicacao.value.trim(), icone: els.icone.value.trim(),
        ativo: els.ativo.checked, dataAtualizacao: serverTimestamp()
    };

    try {
        if(id) { await updateDoc(doc(db, "titulosCadastrados", id), data); } 
        else {
            data.idCriador = currentUserMod.uid; 
            data.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "titulosCadastrados"), data);
        }
        window.titulosAPI.resetForm();
    } catch(err) { alert("Erro ao salvar título!"); console.error(err); }
    finally { btn.innerHTML = 'Salvar Título'; btn.disabled = false; }
});

els.searchInput.addEventListener('input', () => window.titulosAPI.renderTitulos(els.searchInput.value));

els.delSelectAllBtn.addEventListener('change', (e) => {
    document.querySelectorAll('.user-to-clear').forEach(chk => chk.checked = e.target.checked);
});

els.delConfirmBtn.addEventListener('click', async (e) => {
    const titleId = e.target.dataset.id;
    els.delConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "titulosCadastrados", titleId));

        document.querySelectorAll('.user-to-clear:checked').forEach(chk => {
            batch.update(doc(db, "users", chk.value), { [`titulosConquistados.${titleId}`]: deleteField() });
        });
        await batch.commit();
        window.titulosAPI.closeDeleteModal();
    } catch(err) { alert("Erro na exclusão!"); }
    finally { els.delConfirmBtn.innerHTML = '<i class="fas fa-trash mr-2"></i> Confirmar Exclusão'; }
});

els.turmaSelect.addEventListener('change', () => {
    const tid = els.turmaSelect.value;
    els.awardArea.classList.add('hidden'); els.awardArea.classList.remove('flex');
    els.alunoSelect.innerHTML = '<option value="">-- Selecione o Aluno --</option>';
    
    if(!tid) { els.alunoSelect.disabled = true; return; }
    
    const alunos = usersCache.filter(u => u.turma === tid && u.Aluno === true);
    if(alunos.length > 0) {
        els.alunoSelect.disabled = false;
        els.alunoSelect.innerHTML += alunos.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
    } else {
        els.alunoSelect.disabled = true;
        els.alunoSelect.innerHTML = '<option value="">Turma sem alunos registrados</option>';
    }
});

els.alunoSelect.addEventListener('change', window.titulosAPI.renderAwardTitles);
els.awardSearch.addEventListener('input', window.titulosAPI.renderAwardTitles);

els.btnSaveAwards.addEventListener('click', async () => {
    const aid = els.alunoSelect.value;
    if(!aid) return alert("Selecione um aluno!");
    
    const originalBtn = els.btnSaveAwards.innerHTML;
    els.btnSaveAwards.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    els.btnSaveAwards.disabled = true;

    try {
        const snap = await getDoc(doc(db, "users", aid));
        const titulosAtuais = snap.exists() ? (snap.data().titulosConquistados || {}) : {};
        const novos = { ...titulosAtuais };

        document.querySelectorAll('#award-titles-list input[type=checkbox]').forEach(chk => {
            const id = chk.dataset.id;
            const tData = titulosCache.find(x => x.id === id);
            if(!tData) return;

            if(chk.checked && !novos[id]) {
                novos[id] = { nome: tData.nome, icone: tData.icone || '', concedidoPor: currentUserMod.uid, concedidoEm: serverTimestamp(), tituloAtivadoUser: false };
            } else if(!chk.checked && novos[id]) {
                delete novos[id];
            }
        });

        await updateDoc(doc(db, "users", aid), { titulosConquistados: novos });
        
        // Atualiza cache local para refletir caso clique de novo
        const uIdx = usersCache.findIndex(u => u.id === aid);
        if(uIdx > -1) usersCache[uIdx].titulosConquistados = novos;
        
        // Efeito visual de sucesso no botão
        els.btnSaveAwards.innerHTML = '<i class="fas fa-check"></i> Salvo!';
        els.btnSaveAwards.classList.replace('bg-green-600', 'bg-emerald-500');
        setTimeout(() => {
            els.btnSaveAwards.innerHTML = originalBtn;
            els.btnSaveAwards.classList.replace('bg-emerald-500', 'bg-green-600');
            els.btnSaveAwards.disabled = false;
        }, 2000);
    } catch(err) { alert("Erro ao salvar condecorações!"); els.btnSaveAwards.disabled = false; els.btnSaveAwards.innerHTML = originalBtn; }
});

// Ao carregar este script, iniciar validações de permissões e listeners
auth.onAuthStateChanged(user => { if(user) window.titulosAPI.init(); });