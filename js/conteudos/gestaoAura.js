import { db } from '../core/firebase.js'; // Usa as instâncias do seu projeto
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const gestaoAuraAPI = {
    // Array para armazenar os dados puxados
    listaCompleta: [],
    ICONE_AURA: 'imagens/aura/aura.png',

    init() {
        this.configurarAbas();
        this.configurarFiltros();
        this.carregarDadosFirebase();
    },

    async carregarDadosFirebase() {
        try {
            const pContainer = document.getElementById('aura-podium-container');
            const lContainer = document.getElementById('aura-lista-container');

            if (pContainer) pContainer.innerHTML = '<div class="text-white w-full text-center">Carregando dados ... <i class="fas fa-spinner fa-spin"></i></div>';
            if (lContainer) lContainer.innerHTML = '';

            // Busca os dados da coleção 'users' diretamente
            const q = query(collection(db, "users"));
            const querySnapshot = await getDocs(q);

            this.listaCompleta = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // RESTRIÇÃO ABSOLUTA E BLINDADA
                const isAtivo = (data.registroAtivo === true || data.registroAtivo === "true");
                const isAluno = (data.Aluno === true || data.Aluno === "true" || data.turma);

                if (isAtivo && isAluno) {
                    this.listaCompleta.push({
                        id: doc.id,
                        nome: data.nome || "Anônimo",
                        turma: data.turma || "Sem Turma",
                        aura: parseInt(data.aura) || 0
                    });
                }
            });

            this.aplicarFiltros();

        } catch (error) {
            console.error("Erro ao buscar Auras do Firebase:", error);
            const pContainer = document.getElementById('aura-podium-container');
            if (pContainer) pContainer.innerHTML = '<div class="text-red-500 w-full text-center font-bold">Erro de conexão ao forjar o ranking.</div>';
        }
    },

    configurarAbas() {
        const botoes = document.querySelectorAll('.aura-subtab-btn');
        botoes.forEach(btn => {
            btn.addEventListener('click', (e) => {
                botoes.forEach(b => b.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-900/30'));
                botoes.forEach(b => b.classList.add('bg-slate-800', 'text-slate-400'));

                const target = e.currentTarget;
                target.classList.remove('bg-slate-800', 'text-slate-400');
                target.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-900/30');

                const tabId = target.getAttribute('data-target');
                document.querySelectorAll('.aura-tab-content').forEach(content => {
                    content.classList.remove('active');
                    content.classList.add('hidden');
                });

                const tabAtiva = document.getElementById(`aura-tab-${tabId}`);
                if (tabAtiva) {
                    tabAtiva.classList.remove('hidden');
                    tabAtiva.classList.add('active');
                }
            });
        });
    },

    configurarFiltros() {
        const inputNome = document.getElementById('aura-search-nome');
        const selTurma = document.getElementById('aura-filter-turma');

        if (inputNome) inputNome.addEventListener('input', () => this.aplicarFiltros());
        if (selTurma) selTurma.addEventListener('change', () => this.aplicarFiltros());
    },

    formatarNomePrivacidade(nomeCompleto) {
        if (!nomeCompleto) return "";
        const partes = nomeCompleto.trim().split(" ");
        if (partes.length === 1) return partes[0];

        const primeiro = partes[0];
        const iniciais = partes.slice(1).map(p => {
            if (p.length <= 2) return "";
            return p.charAt(0).toUpperCase() + ".";
        }).filter(p => p !== "").join(" ");

        return `${primeiro} ${iniciais}`;
    },

    aplicarFiltros() {
        const txtNome = document.getElementById('aura-search-nome')?.value.toLowerCase() || "";
        const txtTurma = document.getElementById('aura-filter-turma')?.value || "";

        const filtrados = this.listaCompleta.filter(a => {
            const matchNome = a.nome.toLowerCase().includes(txtNome);
            const matchTurma = txtTurma === "" || a.turma === txtTurma;
            return matchNome && matchTurma;
        });

        this.renderRanking(filtrados);
    },

    renderRanking(lista) {
        // 1. Filtro de segurança (redundante, mas importante)
        const ativos = lista.filter(aluno => aluno.aura > 0);

        // 2. Descobrir quais são as 3 maiores pontuações únicas
        const pontuacoesUnicas = [...new Set(ativos.map(a => a.aura))].sort((a, b) => b - a);

        const top1Aura = pontuacoesUnicas[0];
        const top2Aura = pontuacoesUnicas[1];
        const top3Aura = pontuacoesUnicas[2];

        // 3. Separar grupos do pódio
        const grupo1 = ativos.filter(a => a.aura === top1Aura);
        const grupo2 = ativos.filter(a => a.aura === top2Aura);
        const grupo3 = ativos.filter(a => a.aura === top3Aura);

        // 4. Todos os outros vão para a lista (quem não está nos 3 maiores valores)
        const demais = ativos.filter(a => a.aura < top3Aura || (pontuacoesUnicas.length < 3 && a.aura < pontuacoesUnicas[pontuacoesUnicas.length - 1]));

        const pContainer = document.getElementById('aura-podium-container');
        const lContainer = document.getElementById('aura-lista-container');
        if (!pContainer || !lContainer) return;

        pContainer.innerHTML = '';
        lContainer.innerHTML = '';

        // Função auxiliar para gerar o HTML de múltiplos nomes dentro de um pódio
        const gerarNomesPodio = (grupo) => {
            return grupo.map(aluno => `
            <div class="py-1 border-b border-white/5 last:border-0 w-full text-center">
                <div class="font-bold text-white text-[11px] md:text-sm leading-tight">${this.formatarNomePrivacidade(aluno.nome)}</div>
                <div class="text-[9px] text-slate-400 uppercase tracking-tighter">${aluno.turma}</div>
            </div>
        `).join('');
        };

        // Ordem visual do Pódio: 2º | 1º | 3º
        const ordens = [
            { rank: 2, grupo: grupo2, aura: top2Aura, classe: 'podium-2' },
            { rank: 1, grupo: grupo1, aura: top1Aura, classe: 'podium-1' },
            { rank: 3, grupo: grupo3, aura: top3Aura, classe: 'podium-3' }
        ];

        ordens.forEach(item => {
            if (item.grupo.length > 0) {
                const auraFormatada = item.aura.toLocaleString('pt-BR');
                pContainer.innerHTML += `
                <div class="podium-card ${item.classe} flex flex-col items-center">
                    <div class="podium-pos">${item.rank}</div>
                    
                    <!-- Container de Nomes com Scroll caso haja muitos empates -->
                    <div class="mt-8 mb-2 w-full px-2 max-h-[120px] overflow-y-auto custom-scroll flex flex-col items-center">
                        ${gerarNomesPodio(item.grupo)}
                    </div>
                    
                    <div class="mt-auto mb-2 flex items-center gap-2 bg-blue-900/40 px-3 py-1 rounded-full border border-blue-400/30 shadow-lg">
                        <span class="font-black font-cinzel text-[11px] md:text-xs text-blue-300">${auraFormatada}</span>
                        <img src="${this.ICONE_AURA}" class="w-3 h-3 object-contain animate-pulse" alt="Aura">
                    </div>
                </div>
            `;
            }
        });

        // Renderiza o restante da lista normalmente
        demais.sort((a, b) => b.aura - a.aura).forEach((aluno, index) => {
            const auraFormatada = aluno.aura.toLocaleString('pt-BR');
            lContainer.innerHTML += `
                <div class="aura-list-item group">
                    <div class="flex items-center gap-3 truncate">
                        <span class="text-slate-500 font-black text-sm w-6">#${index + 4}</span>
                        <div class="truncate">
                            <div class="font-bold text-slate-200 group-hover:text-white truncate">${this.formatarNomePrivacidade(aluno.nome)}</div>
                            <!-- Exibe apenas a turma, removendo o ponto e a disciplina conforme solicitado -->
                            <div class="text-[10px] uppercase text-slate-500">${aluno.turma}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700">
                        <span class="font-black font-cinzel text-blue-400 text-sm">${auraFormatada}</span>
                        <img src="${this.ICONE_AURA}" class="w-4 h-4 object-contain" alt="Aura">
                    </div>
                </div>
            `;
        });
    }

};

export { gestaoAuraAPI };