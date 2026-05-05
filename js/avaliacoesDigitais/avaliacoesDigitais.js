import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

let currentUser = null;
let isStaff = false; // true se for Admin, Coordenacao ou Professor

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
    
    // Coleta as turmas selecionadas
    const turmas = Array.from(document.querySelectorAll('input[name="turmas-selecionadas"]:checked')).map(cb => cb.value);
    
    if (turmas.length === 0) {
        alert("Selecione pelo menos uma turma para esta avaliação.");
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Publicando...';
    btn.disabled = true;

    try {
        const payload = {
            titulo: document.getElementById('aval-titulo').value,
            notaMaxima: parseFloat(document.getElementById('aval-nota').value),
            dataAbertura: new Date(document.getElementById('aval-abertura').value),
            dataFechamento: new Date(document.getElementById('aval-fechamento').value),
            turmasAlvo: turmas,
            descricao: document.getElementById('aval-descricao').value,
            criadoPor: currentUser.nome,
            professorUid: currentUser.uid,
            dataCriacao: serverTimestamp(),
            status: 'ativa'
        };

        await addDoc(collection(db, "avaliacoes_digitais"), payload);
        
        alert("Avaliação publicada com sucesso!");
        e.target.reset();
        document.getElementById('container-form-aval').classList.add('hidden');
        
    } catch (err) {
        console.error("Erro ao publicar avaliação:", err);
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

    // Traz todas as avaliações ordenadas pela mais recente
    const q = query(collection(db, "avaliacoes_digitais"), orderBy("dataCriacao", "desc"));

    avaliacoesListener = onSnapshot(q, (snapshot) => {
        const avaliacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGridAvaliacoes(avaliacoes);
    }, (err) => {
        console.error("Erro ao ouvir avaliações:", err);
        grid.innerHTML = '<p class="text-red-500 text-xs font-bold text-center mt-10">Erro ao carregar o quadro de atividades.</p>';
    });
}

function renderGridAvaliacoes(avaliacoes) {
    const grid = document.getElementById('grid-avaliacoes');
    if (!grid) return;

    let visiveis = avaliacoes;
    
    // Regra de Ocultação para Alunos
    if (!isStaff && currentUser) {
        const turmaAluno = currentUser.turma;
        const agora = new Date();
        visiveis = avaliacoes.filter(a => {
            if (!a.turmasAlvo || !a.turmasAlvo.includes(turmaAluno)) return false;
            if (a.dataAbertura && a.dataAbertura.toDate() > agora) return false; // Ainda não abriu
            return true;
        });
    }

    if (visiveis.length === 0) {
        grid.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-500 mt-10">
                <i class="fas fa-box-open text-4xl mb-4 opacity-50"></i>
                <p class="font-bold uppercase tracking-widest text-xs text-center">Nenhuma avaliação disponível no momento.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = visiveis.map(aval => {
        // Formata as Datas (Firestore Timestamp -> Leitura humana)
        const dAberta = aval.dataAbertura ? aval.dataAbertura.toDate() : null;
        const dFecha = aval.dataFechamento ? aval.dataFechamento.toDate() : null;
        
        const strAbertura = dAberta ? `${dAberta.toLocaleDateString('pt-BR')} às ${dAberta.getHours().toString().padStart(2,'0')}:${dAberta.getMinutes().toString().padStart(2,'0')}` : 'N/A';
        const strFechamento = dFecha ? `${dFecha.toLocaleDateString('pt-BR')} às ${dFecha.getHours().toString().padStart(2,'0')}:${dFecha.getMinutes().toString().padStart(2,'0')}` : 'N/A';
        const turmas = (aval.turmasAlvo || []).join(', ');

        // Verificação visual se a data já passou (para colocar vermelho)
        const expirou = dFecha && (dFecha < new Date());
        const corPrazo = expirou ? 'text-red-400' : 'text-amber-400';
        const iconePrazo = expirou ? 'fa-calendar-times' : 'fa-clock';

        return `
            <div class="bg-slate-800 border border-slate-700 p-5 rounded-xl mb-4 shadow-md hover:border-blue-500 transition-colors relative overflow-hidden group">
                ${expirou ? '<div class="absolute top-0 right-0 bg-red-900/80 text-red-100 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-lg z-10 shadow-lg">Prazo Encerrado</div>' : ''}
                
                <div class="flex justify-between items-start mb-3 pr-24">
                    <h4 class="text-lg font-bold text-blue-400 font-cinzel leading-tight">${escapeHTML(aval.titulo)}</h4>
                </div>
                
                <div class="flex flex-wrap gap-2 mb-3">
                    <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i class="fas fa-star mr-1"></i> Valor: ${aval.notaMaxima}</span>
                    <span class="bg-slate-900 text-slate-400 border border-slate-700 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i class="fas fa-users mr-1"></i> ${turmas}</span>
                </div>

                <div class="text-xs text-slate-400 mb-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-1.5">
                    <p><i class="far fa-calendar-alt w-4 text-emerald-400"></i> <span class="font-bold">Abertura:</span> ${strAbertura}</p>
                    <p class="${corPrazo}"><i class="far ${iconePrazo} w-4"></i> <span class="font-bold">Encerramento:</span> ${strFechamento}</p>
                </div>
                
                <p class="text-sm text-slate-300 line-clamp-2">${escapeHTML(aval.descricao)}</p>
                
                <div class="mt-4 flex justify-end gap-2 pt-3 border-t border-slate-700/50">
                    <button class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg flex items-center">
                        <i class="fas fa-folder-open mr-2"></i> Abrir Painel
                    </button>
                </div>
            </div>
        `;
    }).join('');
}