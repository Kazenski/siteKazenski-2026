import { auth, db, storage } from '../core/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
    query, where, orderBy, onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============================================================================
// VOTAÇÃO — Música Tema do Técnico
// Firestore:
//   config/votacao                 -> { ativa: bool, votacaoId: string }
//   votacoes/{id}                  -> { titulo, ano, musicasIds: [], status, criadoEm, criadoPor }
//   votacoes/{id}/votos/{uid}      -> { musicaId, nome, turma, criadoEm }
// ============================================================================

let votosCache = { totalVotos: 0, contagem: {} }; // vem do ranking calculado pela Cloud Function
let musicasCache = [];
let votacaoAtual = null;
let meuVoto = null;
let unsubVotos = null;
let unsubMusicas = null;

// Mini player compartilhado
let audioEl = null;
let currentPlayingMusicaId = null;

function getAudio() {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.addEventListener('ended', () => {
            currentPlayingMusicaId = null;
            document.querySelectorAll('[data-play-btn]').forEach(b => b.innerHTML = '<i class="fas fa-play"></i>');
            atualizarBarraPlayer();
        });
        audioEl.addEventListener('timeupdate', atualizarBarraPlayer);
        audioEl.addEventListener('loadedmetadata', atualizarBarraPlayer);
    }
    return audioEl;
}

async function carregarMusicas() {
    const snap = await getDocs(query(collection(db, 'musicas'), orderBy('createdAt', 'desc')));
    musicasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return musicasCache;
}

async function carregarVotacaoAtiva() {
    try {
        const cfg = await getDoc(doc(db, 'config', 'votacao'));
        const votacaoId = cfg.exists() ? cfg.data().votacaoId : null;
        if (!votacaoId) return null;
        const v = await getDoc(doc(db, 'votacoes', votacaoId));
        return v.exists() ? { id: v.id, ...v.data() } : null;
    } catch (e) {
        console.error('Erro ao buscar votação ativa:', e);
        return null;
    }
}

// ============================================================================
// PÁGINA DO ALUNO — VOTO
// ============================================================================
export async function renderVotacaoTab() {
    const container = document.getElementById('votacao-content');
    if (!container) return;

    container.innerHTML = `
        <div class="max-w-6xl mx-auto p-6 md:p-12 flex flex-col gap-8">
            <div class="text-center">
                <h2 class="text-3xl md:text-5xl font-cinzel font-black text-white tracking-widest uppercase"><i class="fas fa-vote-yea text-amber-400 mr-3"></i>Votação</h2>
                <p class="text-slate-400 mt-2">Escolha a trilha sonora do Técnico Tech</p>
            </div>
            <div id="votacao-body" class="text-center text-slate-500 py-20"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
        </div>`;

    // Parar player anterior ao sair
    const body = document.getElementById('votacao-body');

    try {
        const [musicas, votacao] = await Promise.all([carregarMusicas(), carregarVotacaoAtiva()]);
        votacaoAtual = votacao;

        if (!votacao) {
            body.innerHTML = `<div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-12"><i class="fas fa-music text-4xl text-slate-700 mb-4"></i><p>Nenhuma votação ativa no momento. Volte em breve!</p></div>`;
            return;
        }

        const usuario = auth.currentUser;

        if (usuario) {
            const meu = await getDoc(doc(db, 'votacoes', votacao.id, 'votos', usuario.uid));
            meuVoto = meu.exists() ? meu.data() : null;
        }

        // Live do ranking (calculado pela Cloud Function — alunos não leem votos brutos)
        if (unsubVotos) unsubVotos();
        unsubVotos = onSnapshot(doc(db, 'votacoes', votacao.id, 'ranking', 'atual'), (snap) => {
            votosCache = snap.exists() ? snap.data() : { totalVotos: 0, contagem: {} };
            renderPaginaVotacao(votacao, usuario);
        }, (err) => console.warn('Ranking indisponível:', err));

        renderPaginaVotacao(votacao, usuario);
    } catch (err) {
        console.error(err);
        body.innerHTML = '<p class="text-red-400">Erro ao carregar a votação.</p>';
    }
}

function renderPaginaVotacao(votacao, usuario) {
    const body = document.getElementById('votacao-body');
    if (!body) return;

    const musicas = (votacao.musicasIds || [])
        .map(id => musicasCache.find(m => m.id === id))
        .filter(Boolean);

    const totalVotos = votosCache.totalVotos || 0;
    const contagem = votosCache.contagem || {};

    const isStaff = window.userRoles?.Admin || window.userRoles?.Professor || window.userRoles?.Coordenacao || window.userRoles?.Moderador;
    // Aluno só vê os resultados (pódio) DEPOIS de votar. Staff sempre vê.
    const podeVerResultados = isStaff || !!meuVoto;

    const ranking = [...musicas]
        .map(m => ({ ...m, votos: contagem[m.id] || 0, pct: totalVotos ? Math.round(((contagem[m.id] || 0) / totalVotos) * 100) : 0 }))
        .sort((a, b) => b.votos - a.votos);

    let podioHtml = '';
    if (podeVerResultados && totalVotos > 0) {
        const [p1, p2, p3] = ranking;
        const podItem = (m, lugar, cor, tamanho) => m ? `
            <div class="flex flex-col items-center ${lugar === 1 ? 'order-2' : lugar === 2 ? 'order-1' : 'order-3'}">
                <img src="${m.albumArtUrl || 'imagens/favicon/favicon-32x32.png'}" class="${tamanho} aspect-square object-cover rounded-2xl border-2 ${cor} mb-2">
                <span class="text-2xl">${lugar === 1 ? '🥇' : lugar === 2 ? '🥈' : '🥉'}</span>
                <p class="text-white font-bold text-sm text-center max-w-[140px] truncate">${m.titulo}</p>
                <p class="text-slate-500 text-[10px] uppercase">${m.votos} voto(s) · ${m.pct}%</p>
            </div>` : '';
        podioHtml = `
            <div class="bg-slate-900/60 border border-amber-500/30 rounded-3xl p-8 mt-6">
                <h4 class="text-center text-amber-400 font-cinzel font-bold uppercase tracking-widest text-sm mb-8"><i class="fas fa-trophy mr-2"></i> Pódio Atual</h4>
                <div class="flex justify-center items-end gap-8">
                    ${podItem(p2, 2, 'border-slate-400', 'w-20')}
                    ${podItem(p1, 1, 'border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.4)]', 'w-28')}
                    ${podItem(p3, 3, 'border-orange-700', 'w-16')}
                </div>
            </div>`;
    }

    body.innerHTML = `
        <div class="text-center mb-2">
            <h3 class="text-2xl md:text-3xl font-cinzel font-bold text-amber-400">${votacao.titulo}</h3>
            <p class="text-slate-500 text-xs uppercase tracking-widest mt-1">${isStaff ? `${totalVotos} voto(s) registrados` : (meuVoto ? 'Obrigado por votar! Confira o pódio:' : 'Vote para revelar o pódio')}</p>
        </div>

        ${!usuario ? `
        <div class="bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-2xl p-5 max-w-2xl mx-auto text-sm">
            <i class="fas fa-lock mr-2"></i> Faça login para votar. Você pode ouvir e ver os resultados abaixo.
        </div>` : ''}

        ${podioHtml}

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 text-left">
            ${musicas.map(m => {
                const votos = contagem[m.id] || 0;
                const pct = totalVotos ? Math.round((votos / totalVotos) * 100) : 0;
                const ehMeuVoto = meuVoto?.musicaId === m.id;
                const tocando = currentPlayingMusicaId === m.id;
                return `
                <div class="bg-slate-900/70 border ${ehMeuVoto ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.15)]' : 'border-slate-800'} rounded-3xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-1 hover:border-slate-600">
                    <div class="relative">
                        <img src="${m.albumArtUrl || 'imagens/favicon/favicon-32x32.png'}" onerror="this.src='imagens/favicon/favicon-32x32.png'" class="w-full aspect-square object-cover rounded-2xl" alt="Capa">
                        ${ehMeuVoto ? '<span class="absolute top-3 right-3 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">Seu voto</span>' : ''}
                    </div>
                    <div>
                        <h4 class="text-white font-bold leading-tight">${m.titulo}</h4>
                        <p class="text-slate-500 text-xs uppercase tracking-widest">${m.artista || 'Artista desconhecido'}</p>
                    </div>
                    <button data-play-btn onclick="window.votacaoAPI.togglePlay('${m.id}')" class="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl transition-colors">
                        <i class="fas ${tocando ? 'fa-pause' : 'fa-play'}"></i> ${tocando ? 'Pausar' : 'Ouvir prévia'}
                    </button>
                    ${isStaff ? `
                    <div>
                        <div class="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1"><span>${votos} voto(s)</span><span>${pct}%</span></div>
                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all" style="width:${pct}%"></div></div>
                    </div>` : ''}
                    ${usuario && !meuVoto ? `<button onclick="window.votacaoAPI.votar('${votacao.id}','${m.id}')" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-transform hover:scale-[1.02]">Votar</button>` : ''}
                    ${usuario && ehMeuVoto ? '<p class="text-center text-amber-400 text-xs font-black uppercase tracking-widest py-2"><i class="fas fa-check mr-1"></i> Voto registrado</p>' : ''}
                </div>`;
            }).join('')}
        </div>

        <!-- Mini player fixo dentro da página -->
        <div id="mini-player" class="hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-700 p-4 z-40">
            <div class="max-w-4xl mx-auto flex items-center gap-4">
                <button onclick="window.votacaoAPI.togglePlayAtual()" id="mp-toggle" class="w-10 h-10 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center"><i class="fas fa-pause"></i></button>
                <div class="flex-grow">
                    <p id="mp-titulo" class="text-white text-sm font-bold truncate"></p>
                    <div class="h-1.5 bg-slate-800 rounded-full mt-2 cursor-pointer" id="mp-progress-bar"><div id="mp-progress" class="h-full bg-amber-500 rounded-full" style="width:0%"></div></div>
                </div>
                <span id="mp-tempo" class="text-slate-500 text-xs font-mono">0:00</span>
                <button onclick="window.votacaoAPI.fecharPlayer()" class="text-slate-500 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
        </div>`;

    const bar = document.getElementById('mp-progress-bar');
    if (bar) bar.onclick = (e) => {
        const a = getAudio();
        if (a.duration) a.currentTime = (e.offsetX / bar.clientWidth) * a.duration;
    };
    atualizarBarraPlayer();
}

function atualizarBarraPlayer() {
    const a = getAudio();
    const mp = document.getElementById('mini-player');
    const prog = document.getElementById('mp-progress');
    const tempo = document.getElementById('mp-tempo');
    if (!a.src || a.paused && !currentPlayingMusicaId) return;
    if (mp && currentPlayingMusicaId) mp.classList.remove('hidden');
    if (prog && a.duration) prog.style.width = `${(a.currentTime / a.duration) * 100}%`;
    if (tempo) {
        const s = Math.floor(a.currentTime);
        tempo.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
}

window.votacaoAPI = {
    togglePlay(musicaId) {
        const a = getAudio();
        const m = musicasCache.find(x => x.id === musicaId);
        if (!m) return;
        if (currentPlayingMusicaId === musicaId && !a.paused) {
            a.pause();
            document.querySelectorAll('[data-play-btn]').forEach(b => b.innerHTML = '<i class="fas fa-play"></i> Ouvir prévia');
            const t = document.getElementById('mp-toggle'); if (t) t.innerHTML = '<i class="fas fa-play"></i>';
            return;
        }
        if (!a.src.endsWith(m.audioURL || '')) a.src = m.audioURL || '';
        currentPlayingMusicaId = musicaId;
        a.play();
        const mpTitulo = document.getElementById('mp-titulo'); if (mpTitulo) mpTitulo.textContent = m.titulo;
        document.getElementById('mini-player')?.classList.remove('hidden');
        const t2 = document.getElementById('mp-toggle'); if (t2) t2.innerHTML = '<i class="fas fa-pause"></i>';
        document.querySelectorAll('[data-play-btn]').forEach(b => {
            const ehEste = b.getAttribute('onclick')?.includes(musicaId);
            b.innerHTML = ehEste ? '<i class="fas fa-pause"></i> Pausar' : '<i class="fas fa-play"></i> Ouvir prévia';
        });
        // Re-renderiza para marcar o botão correto
        if (votacaoAtual) renderPaginaVotacao(votacaoAtual, auth.currentUser);
    },
    togglePlayAtual() {
        const a = getAudio();
        if (a.paused) { a.play(); document.getElementById('mp-toggle').innerHTML = '<i class="fas fa-pause"></i>'; }
        else { a.pause(); document.getElementById('mp-toggle').innerHTML = '<i class="fas fa-play"></i>'; }
    },
    fecharPlayer() {
        const a = getAudio();
        a.pause();
        currentPlayingMusicaId = null;
        document.getElementById('mini-player')?.classList.add('hidden');
        if (votacaoAtual) renderPaginaVotacao(votacaoAtual, auth.currentUser);
    },
    async votar(votacaoId, musicaId) {
        const u = auth.currentUser;
        if (!u) { alert('Você precisa estar logado para votar.'); return; }
        try {
            // Voto é definitivo: se já existe, não permite trocar
            const existente = await getDoc(doc(db, 'votacoes', votacaoId, 'votos', u.uid));
            if (existente.exists()) {
                meuVoto = existente.data();
                alert('Você já votou! Seu voto não pode ser alterado.');
                if (votacaoAtual) renderPaginaVotacao(votacaoAtual, u);
                return;
            }
            const snap = await getDoc(doc(db, 'users', u.uid));
            const dados = snap.exists() ? snap.data() : {};
            await setDoc(doc(db, 'votacoes', votacaoId, 'votos', u.uid), {
                musicaId,
                nome: dados.nome || u.displayName || 'Aluno',
                turma: dados.turma || '',
                criadoEm: serverTimestamp()
            });
            meuVoto = { musicaId };
            const m = musicasCache.find(x => x.id === musicaId);
            alert(`✅ Voto registrado em "${m?.titulo}"! Confira o pódio abaixo.`);
            if (votacaoAtual) renderPaginaVotacao(votacaoAtual, u);
        } catch (e) {
            console.error(e);
            alert('Erro ao registrar voto.');
        }
    }
};

// ============================================================================
// MODERADOR TECH — GESTÃO DA VOTAÇÃO
// ============================================================================
window.votacaoModAPI = {
    init() {
        window.votacaoModAPI.renderPainel();
    },

    renderPainel() {
        const el = document.getElementById('votacoes-mod-content');
        if (!el) return;
        el.innerHTML = `
            <div class="bg-slate-800 p-6 rounded-2xl border-l-4 border-amber-500 shadow-xl mb-6">
                <h3 class="text-amber-400 font-cinzel font-bold text-xl mb-1"><i class="fas fa-vote-yea mr-2"></i> Música Tema do Técnico</h3>
                <p class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Crie a votação, escolha as músicas e ative o menu público.</p>
            </div>
            <div id="votacao-mod-body"></div>`;
        window.votacaoModAPI.carregarPainel();
    },

    async carregarPainel() {
        const body = document.getElementById('votacao-mod-body');
        if (!body) return;
        const [cfg, votacoesSnap, musicas] = await Promise.all([
            getDoc(doc(db, 'config', 'votacao')),
            getDocs(query(collection(db, 'votacoes'), orderBy('criadoEm', 'desc'))),
            carregarMusicas()
        ]);
        const ativa = cfg.exists() ? cfg.data().ativa === true : false;
        const votacaoIdAtiva = cfg.exists() ? cfg.data().votacaoId : null;
        const votacoes = votacoesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const isAdmin = window.userRoles?.Admin === true;

        body.innerHTML = `
            <div class="bg-slate-900 border ${ativa ? 'border-emerald-500/50' : 'border-slate-700'} rounded-2xl p-6 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h4 class="text-white font-bold">Status da página de votação</h4>
                    <p class="text-slate-500 text-xs">${ativa ? 'A aba de votação está visível no menu superior.' : 'A aba de votação está oculta.'}</p>
                </div>
                <button id="btn-toggle-votacao" class="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${ativa ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}">
                    <i class="fas ${ativa ? 'fa-eye-slash' : 'fa-eye'} mr-2"></i> ${ativa ? 'Desativar página' : 'Ativar página'}
                </button>
            </div>

            <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl mb-6">
                <h4 class="text-amber-400 font-cinzel font-bold mb-4"><i class="fas fa-plus-circle mr-2"></i> Nova Votação</h4>
                <div class="space-y-4">
                    <input id="vt-titulo" placeholder="Ex: Música Tema do Técnico 2027" class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 outline-none focus:border-amber-500">
                    <input id="vt-busca" placeholder="Buscar música..." class="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 outline-none focus:border-amber-500">
                    <div id="vt-lista-musicas" class="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-72 overflow-y-auto custom-scroll">
                        ${musicas.map(m => `
                            <label class="cursor-pointer bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col gap-2 hover:border-amber-500/50 transition-colors voto-item">
                                <input type="checkbox" value="${m.id}" class="accent-amber-500">
                                <img src="${m.albumArtUrl || 'imagens/favicon/favicon-32x32.png'}" class="w-full aspect-square object-cover rounded-lg">
                                <span class="text-white text-xs font-bold truncate">${m.titulo}</span>
                                <span class="text-slate-500 text-[10px] truncate">${m.artista || ''}</span>
                            </label>`).join('')}
                    </div>
                    <button id="btn-criar-votacao" class="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-widest transition-transform hover:scale-105">Criar votação</button>
                </div>
            </div>

            <h4 class="text-slate-400 text-xs uppercase tracking-widest font-bold mb-3">Votações cadastradas</h4>
            <div class="space-y-3">
                ${votacoes.length === 0 ? '<p class="text-slate-600 italic text-sm">Nenhuma votação criada.</p>' : votacoes.map(v => `
                    <div class="bg-slate-900 border ${v.id === votacaoIdAtiva ? 'border-emerald-500/50' : 'border-slate-800'} rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <p class="text-white font-bold text-sm">${v.titulo} ${v.id === votacaoIdAtiva ? '<span class="text-emerald-400 text-[10px] uppercase ml-2">(vinculada)</span>' : ''}</p>
                            <p class="text-slate-500 text-[10px] uppercase">${(v.musicasIds || []).length} música(s)</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.votacaoModAPI.vincular('${v.id}')" class="text-emerald-400 bg-emerald-400/10 px-3 py-2 rounded-lg text-xs font-bold uppercase">Vincular</button>
                            ${isAdmin ? `<button onclick="window.votacaoModAPI.excluir('${v.id}')" class="text-red-400 bg-red-400/10 px-3 py-2 rounded-lg text-xs font-bold uppercase"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </div>`).join('')}
            </div>`;

        document.getElementById('vt-busca')?.addEventListener('input', (e) => {
            const t = e.target.value.toLowerCase();
            document.querySelectorAll('.voto-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(t) ? '' : 'none');
        });

        document.getElementById('btn-toggle-votacao')?.addEventListener('click', async () => {
            const novo = !ativa;
            await setDoc(doc(db, 'config', 'votacao'), { ativa: novo }, { merge: true });
            window.votacaoModAPI.carregarPainel();
        });

        document.getElementById('btn-criar-votacao')?.addEventListener('click', async () => {
            const titulo = document.getElementById('vt-titulo').value.trim();
            const ids = [...document.querySelectorAll('#vt-lista-musicas input:checked')].map(i => i.value);
            if (!titulo || ids.length < 2) { alert('Defina o título e selecione ao menos 2 músicas.'); return; }
            try {
                const ref = await addDoc(collection(db, 'votacoes'), {
                    titulo, musicasIds: ids, status: 'ativa',
                    criadoEm: serverTimestamp(),
                    criadoPor: auth.currentUser?.uid || null
                });
                await setDoc(doc(db, 'config', 'votacao'), { ativa: true, votacaoId: ref.id }, { merge: true });
                alert('Votação criada e ativada!');
                window.votacaoModAPI.carregarPainel();
            } catch (e) { console.error(e); alert('Erro ao criar votação.'); }
        });
    },

    async vincular(id) {
        await setDoc(doc(db, 'config', 'votacao'), { votacaoId: id, ativa: true }, { merge: true });
        alert('Votação vinculada e menu ativado!');
        window.votacaoModAPI.carregarPainel();
    },

    async excluir(id) {
        if (window.userRoles?.Admin !== true) { alert('Apenas Admin pode excluir.'); return; }
        if (!confirm('Excluir esta votação e todos os votos?')) return;
        try {
            const votos = await getDocs(collection(db, 'votacoes', id, 'votos'));
            const b = writeBatch(db);
            votos.docs.forEach(d => b.delete(d.ref));
            b.delete(doc(db, 'votacoes', id));
            await b.commit();
            window.votacaoModAPI.carregarPainel();
        } catch (e) { console.error(e); alert('Erro ao excluir.'); }
    }
};

// Auto-init do painel quando o usuário logar
onAuthStateChanged(auth, () => {
    if (document.getElementById('votacoes-mod-content')) window.votacaoModAPI.renderPainel();
});
