import { db, storage, auth } from '../core/firebase.js';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
                        <input type="datetime-local" id="aval-abertura" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none style-calendar">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Prazo de Encerramento</label>
                        <input type="datetime-local" id="aval-fechamento" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none style-calendar">
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Turmas Alvo (separadas por vírgula)</label>
                    <input type="text" id="aval-turmas" required placeholder="Ex: Info1, Info2, Mec2" class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 focus:border-blue-500 outline-none">
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

    if (btnToggle && containerForm) {
        btnToggle.addEventListener('click', () => {
            containerForm.classList.toggle('hidden');
        });
    }

    if (btnCancel && containerForm) {
        btnCancel.addEventListener('click', () => {
            document.getElementById('form-nova-aval').reset();
            containerForm.classList.add('hidden');
        });
    }

    // Aqui adicionaremos o evento de submit do formulário no próximo passo
}