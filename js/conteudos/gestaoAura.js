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
            
            pContainer.innerHTML = '<div class="text-white w-full text-center">Carregando heróis da base... <i class="fas fa-spinner fa-spin"></i></div>';
            lContainer.innerHTML = '';

            // Busca os dados da coleção 'users'
            const q = query(collection(db, "users"));
            const querySnapshot = await getDocs(q);

            this.listaCompleta = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                
                // Mapeia quem entra no ranking: tem que ser aluno (ex: tem turma) e ter aura definida (ou default 0)
                if (data.Aluno === true || data.Aluno === "true" || data.turma) {
                    this.listaCompleta.push({
                        id: doc.id,
                        nome: data.nome || "Anônimo",
                        turma: data.turma || "Sem Turma",
                        disc: data.disciplina || "Diversos", // Ajuste se seu DB tiver outro campo para disciplina
                        aura: parseInt(data.aura) || 0 // Converte para INT com segurança
                    });
                }
            });

            // Aplica os filtros na tela
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
                if(tabAtiva) {
                    tabAtiva.classList.remove('hidden');
                    tabAtiva.classList.add('active');
                }
            });
        });
    },

    configurarFiltros() {
        const inputNome = document.getElementById('aura-search-nome');
        const selTurma = document.getElementById('aura-filter-turma');
        const selDisc = document.getElementById('aura-filter-disc');

        // Adiciona os event listeners apenas uma vez na inicialização
        if(inputNome) inputNome.addEventListener('input', () => this.aplicarFiltros());
        if(selTurma) selTurma.addEventListener('change', () => this.aplicarFiltros());
        if(selDisc) selDisc.addEventListener('change', () => this.aplicarFiltros());
    },

    formatarNomePrivacidade(nomeCompleto) {
        if (!nomeCompleto) return "";
        const partes = nomeCompleto.trim().split(" ");
        if (partes.length === 1) return partes[0];
        
        const primeiro = partes[0];
        const iniciais = partes.slice(1).map(p => {
            if(p.length <= 2) return ""; 
            return p.charAt(0).toUpperCase() + ".";
        }).filter(p => p !== "").join(" ");
        
        return `${primeiro} ${iniciais}`;
    },

    aplicarFiltros() {
        const txtNome = document.getElementById('aura-search-nome')?.value.toLowerCase() || "";
        const txtTurma = document.getElementById('aura-filter-turma')?.value || "";
        const txtDisc = document.getElementById('aura-filter-disc')?.value || "";

        const filtrados = this.listaCompleta.filter(a => {
            const matchNome = a.nome.toLowerCase().includes(txtNome);
            const matchTurma = txtTurma === "" || a.turma === txtTurma;
            const matchDisc = txtDisc === "" || a.disc === txtDisc;
            return matchNome && matchTurma && matchDisc;
        });

        this.renderRanking(filtrados);
    },

    renderRanking(lista) {
        const ranking = [...lista].sort((a, b) => b.aura - a.aura);
        
        const pContainer = document.getElementById('aura-podium-container');
        const lContainer = document.getElementById('aura-lista-container');
        
        if (!pContainer || !lContainer) return;

        pContainer.innerHTML = '';
        lContainer.innerHTML = '';

        if(ranking.length === 0) {
            lContainer.innerHTML = '<div class="text-center text-slate-500 italic py-10 font-bold w-full">O mercado de aura está vazio no momento.</div>';
            return;
        }

        const top3 = ranking.slice(0, 3);
        const demais = ranking.slice(3);

        const ordemPodio = [];
        if(top3[1]) ordemPodio.push({ pos: 2, obj: top3[1], class: 'podium-2' }); 
        if(top3[0]) ordemPodio.push({ pos: 1, obj: top3[0], class: 'podium-1' }); 
        if(top3[2]) ordemPodio.push({ pos: 3, obj: top3[2], class: 'podium-3' }); 

        ordemPodio.forEach(item => {
            // Formata o número (ex: 32500 vira 32.500)
            const auraFormatada = item.obj.aura.toLocaleString('pt-BR');
            
            pContainer.innerHTML += `
                <div class="podium-card ${item.class}">
                    <div class="podium-pos">${item.pos}</div>
                    <div class="mt-8 text-xs md:text-sm font-bold text-white break-words w-full px-1" title="${item.obj.nome}">
                        ${this.formatarNomePrivacidade(item.obj.nome)}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold truncate w-full px-1">${item.obj.turma}</div>
                    
                    <div class="mt-auto mb-2 flex flex-col xl:flex-row items-center justify-center gap-1 xl:gap-2 bg-slate-950/50 px-2 py-1.5 rounded-lg border border-slate-700/50 w-full overflow-hidden">
                        <span class="font-black font-cinzel text-blue-400 text-xs md:text-sm truncate">${auraFormatada}</span>
                        <img src="${this.ICONE_AURA}" class="w-3 h-3 md:w-4 md:h-4 object-contain animate-pulse shrink-0" alt="Aura">
                    </div>
                </div>
            `;
        });

        demais.forEach((aluno, index) => {
            const posicaoReal = index + 4;
            const auraFormatada = aluno.aura.toLocaleString('pt-BR');

            lContainer.innerHTML += `
                <div class="aura-list-item group">
                    <div class="flex items-center gap-2 md:gap-4 overflow-hidden pr-2">
                        <span class="text-slate-500 font-black text-lg md:text-xl w-6 md:w-8 text-center shrink-0 group-hover:text-blue-500 transition-colors">#${posicaoReal}</span>
                        <div class="truncate">
                            <div class="font-bold text-sm md:text-base text-slate-200 group-hover:text-white transition-colors truncate">${this.formatarNomePrivacidade(aluno.nome)}</div>
                            <div class="text-[9px] md:text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-0.5 truncate">${aluno.turma} • ${aluno.disc}</div>
                        </div>
                    </div>
                    
                    <!-- SELO IDÊNTICO AO DO PERFIL DO ALUNO TECH -->
                    <div class="flex items-center gap-2 bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)] shrink-0">
                        <span class="font-black font-cinzel text-sm md:text-base text-blue-400">${auraFormatada}</span>
                        <img src="${this.ICONE_AURA}" class="w-4 h-4 object-contain" alt="Aura">
                    </div>
                </div>
            `;
        });
    }
    
};

export { gestaoAuraAPI };