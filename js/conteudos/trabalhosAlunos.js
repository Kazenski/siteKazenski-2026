import { db, auth } from '../core/firebase.js';
import { collection, addDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from '../core/utils.js';

let currentUser = null;
let isStaff = false;
let trabalhosCache = [];

export async function initTrabalhosAlunos() {
    const container = document.getElementById('ctab-trabalhos');
    if (!container) return;

    if (auth.currentUser) {
        try {
            const snap = await (await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js")).getDoc((await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js")).doc(db, 'users', auth.currentUser.uid));
            if (snap.exists()) {
                currentUser = { uid: snap.id, ...snap.data() };
                isStaff = currentUser.Admin === true || currentUser.Admin === "true" || currentUser.Professor === true || currentUser.Professor === "true" || currentUser.Coordenacao === true || currentUser.Coordenacao === "true";
            }
        } catch (e) { console.error(e); }
    }

    const btnToggle = container.querySelector('#cont-admin-trabalhos')?.previousElementSibling;
    // Form submit
    const form = container.querySelector('#form-trabalho-aluno');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await salvarTrabalho(form);
        });
    }

    // Toggle admin form
    const btnNovo = document.querySelector('.cont-tab-btn[data-target="trabalhos"]')?.closest('header')?.querySelector('[id^="btn-toggle"]') || document.getElementById('btn-toggle-trabalhos');
    // Fallback: any button with onclick toggle? We'll rely on generic + Novo button which toggles [id^="cont-admin-"]
    
    ouvirTrabalhos();
}

async function salvarTrabalho(form) {
    const titulo = form.querySelector('#trab-titulo')?.value?.trim();
    const tipo = form.querySelector('#trab-tipo')?.value;
    const url = form.querySelector('#trab-url')?.value?.trim();
    const descricao = form.querySelector('#trab-descricao')?.value?.trim();
    const alunoNome = form.querySelector('#trab-aluno')?.value?.trim();
    const thumb = form.querySelector('#trab-thumb')?.value?.trim();

    if (!titulo || !url) { alert('Informe título e URL.'); return; }

    try {
        await addDoc(collection(db, 'trabalhos_alunos'), {
            titulo,
            tipo: tipo || 'link',
            url,
            descricao: descricao || '',
            alunoNome: alunoNome || (currentUser?.nome || 'Aluno'),
            thumbnail: thumb || '',
            criadoPor: currentUser?.nome || 'Professor',
            criadoEm: serverTimestamp(),
        });
        form.reset();
        const panel = document.getElementById('cont-admin-trabalhos');
        if (panel) panel.classList.add('hidden');
        alert('Trabalho cadastrado com sucesso!');
    } catch (e) {
        console.error(e);
        alert('Erro ao cadastrar: ' + e.message);
    }
}

function ouvirTrabalhos() {
    const grid = document.getElementById('trab-grid');
    if (!grid) return;
    const q = query(collection(db, 'trabalhos_alunos'), orderBy('criadoEm', 'desc'));
    onSnapshot(q, (snap) => {
        trabalhosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGrid(grid);
    }, (err) => console.error(err));
}

function renderGrid(grid) {
    if (trabalhosCache.length === 0) {
        grid.innerHTML = '<div class="text-center text-slate-500 italic p-10 col-span-full">Nenhum trabalho cadastrado ainda.</div>';
        return;
    }
    grid.innerHTML = trabalhosCache.map(t => {
        const thumb = t.thumbnail ? `<img src="${escapeHTML(t.thumbnail)}" class="w-full h-40 object-cover rounded-t-xl">` : `<div class="w-full h-40 bg-slate-900 flex items-center justify-center rounded-t-xl"><i class="fas fa-${t.tipo === 'video' ? 'video' : t.tipo === 'musica' ? 'music' : 'file'} text-4xl text-slate-600"></i></div>`;
        const badge = t.tipo === 'video' ? 'Vídeo' : t.tipo === 'musica' ? 'Música' : t.tipo === 'material' ? 'Material' : 'Link';
        return `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-lg hover:border-blue-500/60 transition-all">
                ${thumb}
                <div class="p-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">${badge}</span>
                        ${isStaff ? `<button onclick="window.trabalhosAlunosAPI.excluir('${t.id}')" class="text-red-400 hover:text-red-300 text-xs"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                    <h4 class="text-white font-bold text-sm mb-1 line-clamp-2">${escapeHTML(t.titulo)}</h4>
                    <p class="text-slate-400 text-xs mb-2">por ${escapeHTML(t.alunoNome || '-')}</p>
                    <p class="text-slate-500 text-xs line-clamp-2 mb-3">${escapeHTML(t.descricao || '')}</p>
                    <a href="${escapeHTML(t.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-bold"><i class="fas fa-external-link-alt"></i> Abrir</a>
                </div>
            </div>
        `;
    }).join('');
}

window.trabalhosAlunosAPI = {
    excluir: async (id) => {
        if (!confirm('Excluir este trabalho?')) return;
        try { await deleteDoc(doc(db, 'trabalhos_alunos', id)); }
        catch (e) { alert('Erro ao excluir: ' + e.message); }
    }
};