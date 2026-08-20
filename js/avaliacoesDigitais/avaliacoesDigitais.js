import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { escapeHTML } from '../core/utils.js';

let currentUser = null;
let isStaff = false; // true se for Admin, Coordenacao ou Professor
let avaliacoesCache = [];

export async function renderAvaliacoesTab() {
    const container = document.getElementById('avaliacoes-content');
    if (!container) return;

    if (auth.currentUser) {
        try {
            const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (snap.exists()) {
                currentUser = { uid: snap.id, ...snap.data() };
                isStaff = currentUser.Admin === true || currentUser.Professor === true || currentUser.Coordenacao === true;
            }
        } catch (e) {
            console.error("Erro ao buscar usuário em Avaliações:", e);
        }
    } else {
        currentUser = null;
        isStaff = false;
    }

    construirEstruturaInterface(container);
    setupEventosIniciais();
}

function construirEstruturaInterface(container) {
    // Renderiza o botão "Nova Avaliação" apenas para Staff
    const btnNovaAvaliacao = isStaff 
        ? `<button id="btn-toggle-form-aval" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center shadow-lg"><i class="fas fa-plus mr-2"></i> Nova Avaliação</button>` 
        : '';

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl shrink-0">
            <div>
                <h2 class="text-2xl font-cinzel font-bold text-white flex items-center"><i class="fas fa-chalkboard-teacher text-blue-500 mr-3"></i> Central de Avaliações</h2>
                <p class="text-slate-400 text-xs mt-1 uppercase tracking-widest">Acompanhe e entregue suas atividades digitais</p>
            </div>
            ${btnNovaAvaliacao}
        </div>

        <div id="container-form-aval" class="hidden bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl fade-in shrink-0">
            <h3 class="text-lg font-cinzel font-bold text-blue-400 mb-4 border-b border-slate-800 pb-2">Registrar Nova Avaliação</h3>
            <form id="form-nova-aval" class="space-y-4">
                <input type="hidden" id="aval-id">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Título da Atividade</label>
                        <input type="text" id="aval-titulo" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Valor / Nota Máxima</label>
                        <input type="number" id="aval-nota" step="0.1" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none">
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Data de Abertura</label>
                        <input type="datetime-local" id="aval-abertura" onclick="this.showPicker()" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none cursor-pointer">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Prazo de Encerramento</label>
                        <input type="datetime-local" id="aval-fechamento" onclick="this.showPicker()" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none cursor-pointer">
                    </div>
                </div>

                <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-4">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-1">Selecione as Turmas Alvo</label>
                    <div id="container-check-turmas" class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="text-slate-600 text-[10px] animate-pulse">Carregando turmas...</div>
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Instruções / Descrição</label>
                    <textarea id="aval-descricao" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 min-h-[100px] focus:border-blue-500 outline-none custom-scroll"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-4 border-t border-slate-800">
                    <button type="button" id="btn-cancel-aval" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">Cancelar</button>
                    <button type="submit" id="btn-submit-aval" class="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-colors shadow-lg">Publicar Atividade</button>
                </div>
            </form>
        </div>

        <div id="grid-avaliacoes" class="flex-grow min-h-0 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-y-auto custom-scroll">
            <div class="flex flex-col items-center justify-center h-full text-slate-500">
                <i class="fas fa-layer-group text-4xl mb-4 opacity-50"></i>
                <p class="font-bold uppercase tracking-widest text-xs">Carregando quadro de atividades...</p>
            </div>
        </div>
    `;
}

function setupEventosIniciais() {
    const btnToggle = document.getElementById('btn-toggle-form-aval');
    const containerForm = document.getElementById('container-form-aval');
    const btnCancel = document.getElementById('btn-cancel-aval');
    const form = document.getElementById('form-nova-aval');

    if (btnToggle && containerForm) {
        btnToggle.addEventListener('click', () => {
            const isVisible = !containerForm.classList.contains('hidden');
            if (!isVisible) carregarTurmasDisponiveis(); // Recarrega as turmas ao abrir
            containerForm.classList.toggle('hidden');
        });
    }

    if (btnCancel && containerForm) {
        btnCancel.addEventListener('click', () => {
            form.reset();
            containerForm.classList.add('hidden');
        });
    }

    if (form) {
        form.addEventListener('submit', salvarAvaliacao);
    }
    
    // Inicia a listagem de avaliações existentes (Snapshot)
    ouvirAvaliacoes();
}

async function carregarTurmasDisponiveis() {
    const container = document.getElementById('container-check-turmas');
    if (!container) return;

    try {
        // Buscamos os usuários professores/admin para ver quais turmas eles atendem ou uma lista global
        // Aqui, busco os nomes de turmas únicos na coleção de usuários
        const q = query(collection(db, "users"), where("registroAtivo", "==", true));
        const snap = await getDocs(q);
        
        const turmasSet = new Set();
        snap.forEach(doc => {
            const t = doc.data().turma;
            if (t && t !== "Sem Turma") turmasSet.add(t);
        });

        const turmasOrdenadas = Array.from(turmasSet).sort();

        if (turmasOrdenadas.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-xs italic">Nenhuma turma ativa encontrada.</p>';
            return;
        }

        container.innerHTML = turmasOrdenadas.map(t => `
            <label class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2 rounded-lg cursor-pointer transition-colors group">
                <input type="checkbox" name="turmas-selecionadas" value="${t}" class="w-4 h-4 accent-blue-500">
                <span class="text-xs text-slate-300 group-hover:text-white">${t}</span>
            </label>
        `).join('');

    } catch (err) {
        console.error("Erro ao carregar turmas:", err);
        container.innerHTML = '<p class="text-red-500 text-xs">Erro ao carregar turmas.</p>';
    }
}

async function salvarAvaliacao(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-aval');
    const orig = btn.innerHTML;
    
    const turmas = Array.from(document.querySelectorAll('input[name="turmas-selecionadas"]:checked')).map(cb => cb.value);
    if (turmas.length === 0) { alert("Selecione pelo menos uma turma."); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Publicando...';
    btn.disabled = true;

    try {
        const idEdicao = document.getElementById('aval-id').value;
        const payload = {
            titulo: document.getElementById('aval-titulo').value,
            notaMaxima: parseFloat(document.getElementById('aval-nota').value),
            dataAbertura: new Date(document.getElementById('aval-abertura').value),
            dataFechamento: new Date(document.getElementById('aval-fechamento').value),
            turmasAlvo: turmas,
            descricao: document.getElementById('aval-descricao').value,
            criadoPor: currentUser.nome,
            professorUid: currentUser.uid,
            status: 'ativa'
        };

        if (idEdicao) {
            payload.dataAtualizacao = serverTimestamp();
            await updateDoc(doc(db, "avaliacoes_digitais", idEdicao), payload);
            alert("Avaliação atualizada!");
        } else {
            payload.dataCriacao = serverTimestamp();
            payload.oculta = false; // Por padrão, nasce visível
            await addDoc(collection(db, "avaliacoes_digitais"), payload);
            alert("Avaliação publicada com sucesso!");
        }
        
        e.target.reset();
        document.getElementById('aval-id').value = '';
        document.getElementById('container-form-aval').classList.add('hidden');
    } catch (err) {
        console.error("Erro ao publicar:", err);
        alert("Falha ao salvar no Grimório.");
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

let avaliacoesListener = null;

function ouvirAvaliacoes() {
    const grid = document.getElementById('grid-avaliacoes');
    if (!grid) return;

    const q = query(collection(db, "avaliacoes_digitais"), orderBy("dataCriacao", "desc"));
    avaliacoesListener = onSnapshot(q, (snapshot) => {
        avaliacoesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGridAvaliacoes(avaliacoesCache);
    }, (err) => {
        console.error("Erro ao ouvir avaliações:", err);
    });
}

async function renderGridAvaliacoes(avaliacoes) {
    const grid = document.getElementById('grid-avaliacoes');
    if (!grid) return;

    let visiveis = avaliacoes;
    let entregasAlunoIds = []; // Vai guardar as IDs das atividades que o aluno já fez
    
    // Filtro e Busca para o Aluno
    if (!isStaff && currentUser) {
        try {
            // Busca rapidinho as entregas apenas deste aluno
            const qEntregas = query(collection(db, "avaliacoes_entregas"), where("alunoUid", "==", currentUser.uid));
            const snapEntregas = await getDocs(qEntregas);
            entregasAlunoIds = snapEntregas.docs.map(d => d.data().avaliacaoId);
        } catch(e) {
            console.error("Erro ao buscar status de entregas:", e);
        }

        const turmaAluno = currentUser.turma;
        const agora = new Date();
        visiveis = avaliacoes.filter(a => {
            if (a.oculta) return false;
            if (!a.turmasAlvo || !a.turmasAlvo.includes(turmaAluno)) return false;
            if (a.dataAbertura && a.dataAbertura.toDate() > agora) return false;
            return true;
        });
    }

    if (visiveis.length === 0) {
        grid.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-500 mt-10"><i class="fas fa-box-open text-4xl mb-4 opacity-50"></i><p class="font-bold uppercase tracking-widest text-xs text-center">Nenhuma avaliação disponível.</p></div>`;
        return;
    }

    grid.innerHTML = visiveis.map(aval => {
        const dAberta = aval.dataAbertura ? aval.dataAbertura.toDate() : null;
        const dFecha = aval.dataFechamento ? aval.dataFechamento.toDate() : null;
        const strAbertura = dAberta ? `${dAberta.toLocaleDateString('pt-BR')} às ${dAberta.getHours().toString().padStart(2,'0')}:${dAberta.getMinutes().toString().padStart(2,'0')}` : 'N/A';
        const strFechamento = dFecha ? `${dFecha.toLocaleDateString('pt-BR')} às ${dFecha.getHours().toString().padStart(2,'0')}:${dFecha.getMinutes().toString().padStart(2,'0')}` : 'N/A';
        
        const expirou = dFecha && (dFecha < new Date());
        const opacidade = aval.oculta ? 'opacity-60 grayscale hover:grayscale-0' : '';
        
        // ESTILOS PADRÃO
        let bordaCard = 'border-slate-700';
        let badgeStatus = '';
        let corPrazo = expirou ? 'text-red-400' : 'text-emerald-400';
        let extraPt = 'pt-2'; // Padding top dinâmico

        // SISTEMA DE TAGS INTELIGENTES
        if (aval.oculta) {
            badgeStatus = `<div class="absolute top-0 left-0 bg-slate-950 text-slate-400 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-br-lg z-10 shadow-lg border-b border-r border-slate-700"><i class="fas fa-eye-slash"></i> Oculta</div>`;
            extraPt = 'pt-4';
        } else if (!isStaff) {
            // VISÃO DO ALUNO (Aqui a mágica da UX acontece)
            extraPt = 'pt-4'; // Abre espaço para a tag superior esquerda
            const estaEntregue = entregasAlunoIds.includes(aval.id);
            
            if (estaEntregue) {
                bordaCard = 'border-emerald-500/50 bg-emerald-900/10'; // Fica esverdeado
                badgeStatus = `<div class="absolute top-0 left-0 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-br-lg z-10 shadow-lg"><i class="fas fa-check-double mr-1"></i> Entregue</div>`;
                corPrazo = 'text-emerald-400'; // Se entregou, o prazo fica verde independente de ter vencido
            } else if (expirou) {
                bordaCard = 'border-red-500/30';
                badgeStatus = `<div class="absolute top-0 left-0 bg-red-600 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-br-lg z-10 shadow-lg"><i class="fas fa-exclamation-triangle mr-1"></i> Pendente / Encerrado</div>`;
            } else {
                bordaCard = 'border-amber-500/50 border-l-4 border-l-amber-500 shadow-amber-500/5'; // Chama atenção na borda esquerda
                badgeStatus = `<div class="absolute top-0 left-0 bg-amber-500 text-amber-950 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-br-lg z-10 shadow-lg"><i class="fas fa-clock mr-1"></i> Pendente</div>`;
            }
        } else {
            // VISÃO PROFESSOR
            if (expirou) {
                badgeStatus = `<div class="absolute top-0 right-0 bg-red-900/80 text-red-100 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-lg z-10 shadow-lg">Prazo Encerrado</div>`;
            }
        }

        // BOTÕES PROFESSOR
        let btnStaffHtml = '';
        if (isStaff) {
            const iconOc = aval.oculta ? 'fa-eye text-emerald-400' : 'fa-eye-slash text-amber-400';
            btnStaffHtml = `
                <div class="flex gap-2 ml-auto z-20 relative">
                    <button onclick="window.avaliacoesAPI.editar('${aval.id}')" class="w-8 h-8 flex items-center justify-center bg-slate-900 border border-slate-700 hover:border-blue-500 text-blue-400 rounded-lg transition-colors" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="window.avaliacoesAPI.toggleOcultar('${aval.id}', ${!!aval.oculta})" class="w-8 h-8 flex items-center justify-center bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-lg transition-colors" title="Visibilidade"><i class="fas ${iconOc}"></i></button>
                    <button onclick="window.avaliacoesAPI.excluir('${aval.id}')" class="w-8 h-8 flex items-center justify-center bg-slate-900 border border-slate-700 hover:border-red-500 text-red-400 rounded-lg transition-colors" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }

        return `
            <div class="bg-slate-800 border ${bordaCard} p-5 rounded-xl mb-4 shadow-md hover:border-blue-500 transition-all relative overflow-hidden group ${opacidade}">
                ${badgeStatus}
                
                <div class="flex justify-between items-start mb-3 ${extraPt}">
                    <h4 class="text-lg font-bold text-blue-400 font-cinzel leading-tight">${escapeHTML(aval.titulo)}</h4>
                    ${btnStaffHtml}
                </div>
                
                <div class="flex flex-wrap gap-2 mb-3">
                    <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i class="fas fa-star mr-1"></i> Valor: ${aval.notaMaxima}</span>
                    <span class="bg-slate-900 text-slate-400 border border-slate-700 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i class="fas fa-users mr-1"></i> ${(aval.turmasAlvo||[]).join(', ')}</span>
                </div>

                <div class="text-xs text-slate-400 mb-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-1.5">
                    <p><i class="far fa-calendar-alt w-4 text-emerald-400"></i> <span class="font-bold text-white">Abre:</span> ${strAbertura}</p>
                    <p class="${corPrazo}"><i class="far fa-clock w-4"></i> <span class="font-bold">Fecha:</span> ${strFechamento}</p>
                </div>
                
                <p class="text-sm text-slate-300 line-clamp-2">${escapeHTML(aval.descricao)}</p>
                
                <div class="mt-4 flex justify-end pt-3 border-t border-slate-700/50">
                    <button onclick="window.avaliacoesAPI.abrirPainel('${aval.id}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg flex items-center">
                        <i class="fas fa-folder-open mr-2"></i> Abrir Painel
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.avaliacoesAPI = {
    toggleOcultar: async (id, estadoAtual) => {
        try {
            await updateDoc(doc(db, "avaliacoes_digitais", id), { oculta: !estadoAtual });
        } catch(e) { console.error(e); alert("Erro ao alterar visibilidade."); }
    },
    
    excluir: async (id) => {
        if(confirm("ATENÇÃO: Deseja apagar esta avaliação permanentemente? As entregas dos alunos serão perdidas.")) {
            try { await deleteDoc(doc(db, "avaliacoes_digitais", id)); } 
            catch(e) { console.error(e); alert("Erro ao excluir."); }
        }
    },
    
    editar: async (id) => {
        const aval = avaliacoesCache.find(a => a.id === id);
        if(!aval) return;
        
        document.getElementById('aval-id').value = aval.id;
        document.getElementById('aval-titulo').value = aval.titulo;
        document.getElementById('aval-nota').value = aval.notaMaxima;
        document.getElementById('aval-descricao').value = aval.descricao;
        
        // Converte Firestore Timestamp para o formato do input datetime-local (YYYY-MM-DDTHH:MM)
        const formatData = (dataObj) => {
            if(!dataObj) return '';
            const d = dataObj.toDate();
            const tzoffset = (new Date()).getTimezoneOffset() * 60000; 
            return (new Date(d - tzoffset)).toISOString().slice(0, 16);
        };
        
        document.getElementById('aval-abertura').value = formatData(aval.dataAbertura);
        document.getElementById('aval-fechamento').value = formatData(aval.dataFechamento);
        
        // Abre e prepara turmas
        const formContainer = document.getElementById('container-form-aval');
        if(formContainer.classList.contains('hidden')) {
            await carregarTurmasDisponiveis();
            formContainer.classList.remove('hidden');
        }
        
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('input[name="turmas-selecionadas"]');
            checkboxes.forEach(cb => { cb.checked = (aval.turmasAlvo || []).includes(cb.value); });
        }, 500);

        document.getElementById('btn-submit-aval').innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Atualizar Avaliação';
        formContainer.scrollIntoView({ behavior: 'smooth' });
    },

    abrirPainel: async (id) => {
        const aval = avaliacoesCache.find(a => a.id === id);
        if(!aval) return;

        document.getElementById('painel-aval-meta').textContent = `${aval.disciplina || 'Geral'} | Prof. ${aval.criadoPor}`;
        document.getElementById('painel-aval-titulo').textContent = aval.titulo;
        
        const body = document.getElementById('painel-aval-body');
        body.innerHTML = '<div class="text-center text-slate-400 py-10"><i class="fas fa-circle-notch fa-spin text-3xl"></i></div>';
        document.getElementById('modal-painel-aval').classList.remove('hidden');

        try {
            const qEntregas = query(collection(db, "avaliacoes_entregas"), where("avaliacaoId", "==", id));
            const snap = await getDocs(qEntregas);
            const entregas = snap.docs.map(d => ({id: d.id, ...d.data()}));

            if(isStaff) {
                // VISÃO DO PROFESSOR (Com correção)
                let htmlProf = `<div class="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-6"><h4 class="text-white font-bold mb-2">Instruções Originais:</h4><p class="text-slate-400 text-sm whitespace-pre-wrap">${escapeHTML(aval.descricao)}</p></div>`;
                htmlProf += `<h3 class="text-lg font-bold text-blue-400 border-b border-slate-700 pb-2 mb-4">Entregas dos Alunos (${entregas.length})</h3>`;
                
                if(entregas.length === 0) {
                    htmlProf += '<p class="text-slate-500 italic text-sm">Nenhum aluno enviou arquivo ainda.</p>';
                } else {
                    htmlProf += '<div class="space-y-4">';
                    entregas.forEach(e => {
                        const dEnvio = e.dataEnvio ? e.dataEnvio.toDate().toLocaleString('pt-BR') : '';
                        const valorNota = e.notaAtribuida !== undefined ? e.notaAtribuida : '';
                        const valorFeed = e.feedbackProfessor || '';
                        const corStatus = e.status === 'avaliado' ? 'text-blue-400' : 'text-emerald-400';
                        const txtStatus = e.status === 'avaliado' ? 'Avaliado' : 'Entregue';

                        htmlProf += `
                            <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col gap-3 shadow-md">
                                <div class="flex flex-col md:flex-row justify-between md:items-center gap-3">
                                    <div>
                                        <h5 class="text-white font-bold text-sm">${escapeHTML(e.alunoNome)} <span class="text-slate-500 text-[10px] ml-2 uppercase tracking-widest">${escapeHTML(e.turmaAluno)}</span></h5>
                                        <p class="${corStatus} text-xs mt-1"><i class="fas fa-check-circle"></i> ${txtStatus} em: ${dEnvio}</p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="window.avaliacoesAPI.devolverAtividade('${e.id}', '${aval.id}')" class="px-4 py-2 bg-amber-600/20 text-amber-500 hover:bg-amber-600 hover:text-white border border-amber-500/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap text-center" title="Devolver para o aluno reenviar"><i class="fas fa-undo mr-1"></i> Devolver</button>
                                        <a href="${e.arquivoURL}" target="_blank" download class="px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap text-center"><i class="fas fa-download mr-1"></i> Baixar Arquivo</a>
                                    </div>
                                </div>
                                
                                <div class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                                    <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div class="md:col-span-1">
                                            <label class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1 block pl-1">Nota (Máx: ${aval.notaMaxima})</label>
                                            <input type="number" id="nota-${e.id}" step="0.1" max="${aval.notaMaxima}" value="${valorNota}" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500">
                                        </div>
                                        <div class="md:col-span-3">
                                            <label class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1 block pl-1">Feedback ao Aluno</label>
                                            <div class="flex gap-2">
                                                <input type="text" id="feed-${e.id}" value="${valorFeed}" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" placeholder="Comentário opcional...">
                                                <button onclick="window.avaliacoesAPI.salvarCorrecao('${e.id}', '${aval.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors shadow-lg" title="Salvar Avaliação"><i class="fas fa-save"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                    htmlProf += '</div>';
                }
                body.innerHTML = htmlProf;

            } else {
                // VISÃO DO ALUNO
                const minhaEntrega = entregas.find(e => e.alunoUid === currentUser.uid);
                let htmlAluno = `<div class="bg-slate-900 border border-slate-700 p-5 rounded-xl mb-6 shadow-inner"><h4 class="text-white font-bold mb-2 flex items-center"><i class="fas fa-book-open text-blue-500 mr-2"></i> Pauta da Atividade</h4><p class="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">${escapeHTML(aval.descricao)}</p></div>`;

                if(minhaEntrega && minhaEntrega.status !== 'devolvido') {
                    const dEnvio = minhaEntrega.dataEnvio ? minhaEntrega.dataEnvio.toDate().toLocaleString('pt-BR') : '';
                    
                    // Renderiza o Box de Sucesso
                    let conteudoStatus = `
                        <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"><i class="fas fa-check"></i></div>
                        <h3 class="text-xl font-bold text-emerald-400 mb-2">Atividade Entregue!</h3>
                        <p class="text-slate-300 text-sm mb-4">Você enviou o arquivo com sucesso em ${dEnvio}.</p>
                        <a href="${minhaEntrega.arquivoURL}" target="_blank" class="text-blue-400 hover:text-blue-300 text-sm font-bold underline"><i class="fas fa-file-alt mr-1"></i> Ver meu arquivo (${escapeHTML(minhaEntrega.arquivoNome)})</a>
                    `;

                    // Se foi corrigido, injeta a Nota e Feedback
                    if(minhaEntrega.notaAtribuida !== undefined && minhaEntrega.notaAtribuida !== null) {
                        conteudoStatus += `
                            <div class="mt-6 bg-slate-900/80 border border-slate-700 rounded-xl p-5 text-left shadow-inner">
                                <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                                    <h4 class="text-white font-bold"><i class="fas fa-clipboard-check text-emerald-500 mr-2"></i> Correção do Professor</h4>
                                    <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-sm font-bold">Nota: ${minhaEntrega.notaAtribuida} / ${aval.notaMaxima}</span>
                                </div>
                                <p class="text-slate-300 text-sm italic">"${escapeHTML(minhaEntrega.feedbackProfessor || 'Nenhum comentário adicional.')}"</p>
                            </div>
                        `;
                    }

                    htmlAluno += `<div class="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 text-center">${conteudoStatus}</div>`;

                } else {
                    const entregaIdParam = minhaEntrega ? minhaEntrega.id : '';
                    const alertaDevolucao = minhaEntrega && minhaEntrega.status === 'devolvido' 
                        ? `<div class="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm font-bold text-center"><i class="fas fa-exclamation-triangle mr-2"></i>Atividade devolvida. Corrija e reenvie o documento abaixo.</div>` 
                        : '';

                    htmlAluno += `
                        <div class="bg-slate-900 border border-slate-700 rounded-xl p-6">
                            <h3 class="text-lg font-bold text-white mb-4">Enviar Resolução</h3>
                            ${alertaDevolucao}
                            <div class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-blue-500 transition-colors bg-slate-950/50">
                                <i class="fas fa-cloud-upload-alt text-4xl text-blue-500 mb-4"></i>
                                <p class="text-slate-300 text-sm font-bold mb-2">Selecione seu documento</p>
                                <p class="text-slate-500 text-xs mb-6">São aceitos PDF, DOCX, ZIP, imagens, etc.</p>
                                <input type="file" id="aval-file-upload" class="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600 hover:file:text-white cursor-pointer mx-auto max-w-xs mb-4">
                                <button onclick="window.avaliacoesAPI.enviarAtividade(this, '${aval.id}', '${entregaIdParam}')" class="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-blue-500/30">Enviar Atividade</button>
                            </div>
                        </div>
                    `;
                }
                body.innerHTML = htmlAluno;
            }
        } catch(e) {
            console.error(e);
            body.innerHTML = '<p class="text-red-500 text-center">Erro ao carregar dados do painel.</p>';
        }
    },

    salvarCorrecao: async (entregaId, avalId) => {
        const inputNota = document.getElementById(`nota-${entregaId}`);
        const inputFeed = document.getElementById(`feed-${entregaId}`);
        
        if(!inputNota.value) {
            alert("Por favor, digite a nota antes de salvar.");
            return;
        }

        const notaNum = parseFloat(inputNota.value);
        if(isNaN(notaNum) || notaNum < 0) {
            alert("Nota inválida.");
            return;
        }

        try {
            // Atualiza o documento de entrega no Firestore
            await updateDoc(doc(db, "avaliacoes_entregas", entregaId), {
                notaAtribuida: notaNum,
                feedbackProfessor: inputFeed.value,
                status: 'avaliado',
                dataAvaliacao: serverTimestamp()
            });

            alert("Correção registrada com sucesso!");
            
            // Opcional: Recarregar o painel para refletir o status azul de "Avaliado"
            window.avaliacoesAPI.abrirPainel(avalId);

        } catch (err) {
            console.error("Erro ao salvar nota:", err);
            alert("Falha ao registrar a correção no banco de dados.");
        }
    },

    devolverAtividade: async (entregaId, avalId) => {
        if (!confirm("Deseja devolver a atividade? O aluno será liberado para enviar um novo documento.")) return;

        try {
            await updateDoc(doc(db, "avaliacoes_entregas", entregaId), {
                status: "devolvido",
                dataDevolucao: serverTimestamp()
            });
            alert("Atividade devolvida com sucesso!");
            window.avaliacoesAPI.abrirPainel(avalId); // Recarrega o modal para exibir status atualizado
            renderGridAvaliacoes(avaliacoesCache); // Atualiza os cards no fundo
        } catch (err) {
            console.error("Erro ao devolver atividade:", err);
            alert("Erro ao processar a devolução.");
        }
    },

    enviarAtividade: async (btnEl, avalId, entregaIdExistente = '') => {
        const fileInput = document.getElementById('aval-file-upload');
        const file = fileInput.files[0];
        
        if(!file) { alert("Por favor, selecione um arquivo primeiro."); return; }
        
        // Bloqueio de tamanho (Exemplo: máx 15MB)
        if(file.size > 15 * 1024 * 1024) { alert("O arquivo é muito pesado. O limite máximo é de 15MB."); return; }

        const originalText = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Transferindo...';
        btnEl.disabled = true;

        try {
            // Salva no Storage: avaliacoes_entregas / ID_AVALIACAO / UID_NOME-ARQUIVO
            const fileRef = ref(storage, `avaliacoes_entregas/${avalId}/${currentUser.uid}_${file.name}`);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);

            if (entregaIdExistente) {
                // Aluno está reenviando uma atividade devolvida (Faz Update invés de Add)
                await updateDoc(doc(db, "avaliacoes_entregas", entregaIdExistente), {
                    arquivoNome: file.name,
                    arquivoURL: url,
                    dataEnvio: serverTimestamp(),
                    status: 'entregue',
                    notaAtribuida: null, // Limpa nota anterior
                    feedbackProfessor: '' // Limpa feedback anterior
                });
            } else {
                // É o primeiro envio do aluno
                await addDoc(collection(db, "avaliacoes_entregas"), {
                    avaliacaoId: avalId,
                    alunoUid: currentUser.uid,
                    alunoNome: currentUser.nome,
                    turmaAluno: currentUser.turma || "Sem Turma",
                    arquivoNome: file.name,
                    arquivoURL: url,
                    dataEnvio: serverTimestamp(),
                    status: 'entregue'
                });
            }

            alert("Missão Cumprida! Arquivo enviado com sucesso.");
            window.avaliacoesAPI.abrirPainel(avalId); // Recarrega o painel interno
            renderGridAvaliacoes(avaliacoesCache); // Força a tela de fundo a desenhar a tag "Concluído" verde
            
        } catch(err) {
            console.error("Erro no upload:", err);
            alert("Erro ao enviar o arquivo. Tente novamente.");
            btnEl.innerHTML = originalText;
            btnEl.disabled = false;
        }
    }
};