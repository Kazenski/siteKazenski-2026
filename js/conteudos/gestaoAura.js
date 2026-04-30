// js/conteudos/gestaoAura.js

const gestaoAuraAPI = {
    // Ícone da aura
    ICONE_AURA: 'imagens/aura/aura.png',

    // Mock estático de dados (futuramente Firebase)
    alunosStaticos: [
        { id: 1, nome: "Christian Roriz de Medeiros", turma: "112_ds", disc: "Programação", aura: 32500 },
        { id: 2, nome: "Eduardo Kazenski Requião", turma: "112_ds", disc: "Banco de Dados", aura: 35000 },
        { id: 3, nome: "Murilo Hasckel Back", turma: "113_ds", disc: "Redes", aura: 28000 },
        { id: 4, nome: "Nicolas Araujo", turma: "112_ds", disc: "Programação", aura: 25000 },
        { id: 5, nome: "Leticia Silva Souza", turma: "113_ds", disc: "Banco de Dados", aura: 22000 },
        { id: 6, nome: "Jordânia Alves", turma: "112_ds", disc: "Redes", aura: 19500 },
        { id: 7, nome: "João Pedro Santos", turma: "113_ds", disc: "Programação", aura: 15000 },
        { id: 8, nome: "Ana Clara Lima", turma: "112_ds", disc: "Programação", aura: 12000 },
        { id: 9, nome: "Carlos Eduardo Costa", turma: "113_ds", disc: "Banco de Dados", aura: 11000 },
        { id: 10, nome: "Beatriz Ferreira", turma: "112_ds", disc: "Redes", aura: 9000 }
    ],

    // Função de inicialização
    init() {
        this.configurarAbas();
        this.configurarFiltros();
        this.renderRanking(this.alunosStaticos);
    },

    // Lida com os botões (Ranking / Loja) da página
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

    // Anexa os Listeners aos inputs de filtro
    configurarFiltros() {
        const inputNome = document.getElementById('aura-search-nome');
        const selTurma = document.getElementById('aura-filter-turma');
        const selDisc = document.getElementById('aura-filter-disc');

        if(inputNome) inputNome.addEventListener('input', () => this.aplicarFiltros());
        if(selTurma) selTurma.addEventListener('change', () => this.aplicarFiltros());
        if(selDisc) selDisc.addEventListener('change', () => this.aplicarFiltros());
    },

    // Lógica para privacidade: Eduardo Kazenski Requião -> Eduardo K. R.
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

    // Aplica os filtros sobre o array estático
    aplicarFiltros() {
        const txtNome = document.getElementById('aura-search-nome')?.value.toLowerCase() || "";
        const txtTurma = document.getElementById('aura-filter-turma')?.value || "";
        const txtDisc = document.getElementById('aura-filter-disc')?.value || "";

        const filtrados = this.alunosStaticos.filter(a => {
            const matchNome = a.nome.toLowerCase().includes(txtNome);
            const matchTurma = txtTurma === "" || a.turma === txtTurma;
            const matchDisc = txtDisc === "" || a.disc === txtDisc;
            return matchNome && matchTurma && matchDisc;
        });

        this.renderRanking(filtrados);
    },

    // Monta o DOM (Pódio e Lista)
    renderRanking(lista) {
        // Ordena da maior aura para a menor
        const ranking = [...lista].sort((a, b) => b.aura - a.aura);
        
        const pContainer = document.getElementById('aura-podium-container');
        const lContainer = document.getElementById('aura-lista-container');
        
        if (!pContainer || !lContainer) return; // Segurança

        pContainer.innerHTML = '';
        lContainer.innerHTML = '';

        if(ranking.length === 0) {
            lContainer.innerHTML = '<div class="text-center text-slate-500 italic py-10 font-bold">Nenhuma Aura encontrada nesta busca.</div>';
            return;
        }

        const top3 = ranking.slice(0, 3);
        const demais = ranking.slice(3);

        // Renderiza PÓDIO (Ordem no DOM: 2º Esquerda, 1º Centro, 3º Direita)
        const ordemPodio = [];
        if(top3[1]) ordemPodio.push({ pos: 2, obj: top3[1], class: 'podium-2' }); 
        if(top3[0]) ordemPodio.push({ pos: 1, obj: top3[0], class: 'podium-1' }); 
        if(top3[2]) ordemPodio.push({ pos: 3, obj: top3[2], class: 'podium-3' }); 

        ordemPodio.forEach(item => {
            pContainer.innerHTML += `
                <div class="podium-card ${item.class}">
                    <div class="podium-pos">${item.pos}</div>
                    <div class="mt-8 text-sm font-bold text-white break-words w-full px-1" title="${item.obj.nome}">
                        ${this.formatarNomePrivacidade(item.obj.nome)}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">${item.obj.turma}</div>
                    
                    <div class="mt-auto mb-2 flex items-center justify-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-700/50 w-full">
                        <span class="font-black font-cinzel text-blue-400 text-sm">${item.obj.aura}</span>
                        <img src="${this.ICONE_AURA}" class="w-4 h-4 object-contain animate-pulse" alt="Aura">
                    </div>
                </div>
            `;
        });

        // Renderiza LISTA
        demais.forEach((aluno, index) => {
            const posicaoReal = index + 4; // Porque já tem 3 no pódio
            lContainer.innerHTML += `
                <div class="aura-list-item group">
                    <div class="flex items-center gap-4">
                        <span class="text-slate-500 font-black text-xl w-8 text-center group-hover:text-blue-500 transition-colors">#${posicaoReal}</span>
                        <div>
                            <div class="font-bold text-slate-200 group-hover:text-white transition-colors">${this.formatarNomePrivacidade(aluno.nome)}</div>
                            <div class="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-0.5">${aluno.turma} • ${aluno.disc}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
                        <span class="font-black font-cinzel text-blue-400">${aluno.aura}</span>
                        <img src="${this.ICONE_AURA}" class="w-5 h-5 object-contain" alt="Aura">
                    </div>
                </div>
            `;
        });
    }
};

export { gestaoAuraAPI };