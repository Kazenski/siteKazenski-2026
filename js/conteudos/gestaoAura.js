import { db } from '../core/firebase.js'; // Usa as instâncias do seu projeto
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";


const CATALOGO_LOJA = {
    // SKINS DE BORDA
    skins: [
        { id: 'borda_rainbow', nome: 'Borda Arco-Íris', preco: 50000, classe: 'border-rainbow', descricao: 'Efeito cromático animado.' },
        { id: 'borda_valiriano', nome: 'Fogo Valiriano', preco: 75000, classe: 'border-valiriano', descricao: 'Chamas esmeraldas pulsantes.' },
        { id: 'borda_cyberpunk', nome: 'Neon Cyberpunk', preco: 100000, classe: 'border-cyberpunk', descricao: 'Estética futurista instável.' }
    ],
    // TEMAS DE PERFIL
    temas: [
        { id: 'tema_hacker', nome: 'Terminal Hacker', preco: 40000, classe: 'theme-hacker', descricao: 'Fundo preto e texto verde neon.' },
        { id: 'tema_arcano', nome: 'Mestre Arcano', preco: 60000, classe: 'theme-arcano', descricao: 'Energia mística roxa e dourada.' }
    ],
    // CONSUMÍVEIS (MOCHILA PEDAGÓGICA)
    consumiveis: [
        { id: 'item_pergaminho', nome: 'Pergaminho da Sabedoria', preco: 25000, icone: 'fa-scroll', acao: '+0.5 na nota de um projeto' },
        { id: 'item_pocao_tempo', nome: 'Poção do Tempo', preco: 15000, icone: 'fa-hourglass-half', acao: '+2 dias de prazo em uma tarefa' },
        { id: 'item_escudo', nome: 'Escudo de Faltas', preco: 30000, icone: 'fa-shield-alt', acao: 'Justifica uma ausência específica' }
    ]
};

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

            if (pContainer) pContainer.innerHTML = '<div class="text-white w-full text-center">Invocando heróis da base... <i class="fas fa-spinner fa-spin"></i></div>';
            if (lContainer) lContainer.innerHTML = '';

            // Busca os dados da coleção 'users'
            const q = query(collection(db, "users"));
            const querySnapshot = await getDocs(q);

            this.listaCompleta = [];
            const turmasEncontradas = new Set(); // Para listar turmas únicas

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // RESTRIÇÃO ABSOLUTA E BLINDADA: Só alunos com registroAtivo verdadeiro
                const isAtivo = (data.registroAtivo === true || data.registroAtivo === "true");
                const isAluno = (data.Aluno === true || data.Aluno === "true" || data.turma);

                if (isAtivo && isAluno) {
                    const turma = data.turma || "Sem Turma";
                    turmasEncontradas.add(turma); // Adiciona a turma no Set para evitar duplicatas

                    this.listaCompleta.push({
                        id: doc.id,
                        nome: data.nome || "Anônimo",
                        turma: turma,
                        aura: parseInt(data.aura) || 0
                    });
                }
            });

            // Popula o select de turmas de forma única e ordenada
            const selTurma = document.getElementById('aura-filter-turma');
            if (selTurma) {
                selTurma.innerHTML = '<option value="">Todas as Turmas</option>';
                const turmasOrdenadas = Array.from(turmasEncontradas).sort();
                turmasOrdenadas.forEach(turma => {
                    selTurma.innerHTML += `<option value="${turma}">${turma}</option>`;
                });
            }

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
        // 1. Filtro de segurança
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

        // 4. Todos os outros vão para a lista
        const demais = ativos.filter(a => a.aura < top3Aura || (pontuacoesUnicas.length < 3 && a.aura < pontuacoesUnicas[pontuacoesUnicas.length - 1]));

        const pContainer = document.getElementById('aura-podium-container');
        const lContainer = document.getElementById('aura-lista-container');
        if (!pContainer || !lContainer) return;

        pContainer.innerHTML = '';
        lContainer.innerHTML = '';

        // Pódio (inalterado)
        const gerarNomesPodio = (grupo) => {
            return grupo.map(aluno => `
            <div class="py-1 border-b border-white/5 last:border-0 w-full text-center">
                <div class="font-bold text-white text-[11px] md:text-sm leading-tight">${this.formatarNomePrivacidade(aluno.nome)}</div>
                <div class="text-[9px] text-slate-400 uppercase tracking-tighter">${aluno.turma}</div>
            </div>
        `).join('');
        };

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

        // Lista da direita (Ajustado: removido o "DIVERSOS")
        demais.sort((a, b) => b.aura - a.aura).forEach((aluno, index) => {
            const auraFormatada = aluno.aura.toLocaleString('pt-BR');
            lContainer.innerHTML += `
            <div class="aura-list-item group">
                <div class="flex items-center gap-3 truncate">
                    <span class="text-slate-500 font-black text-sm w-6">#${index + 4}</span>
                    <div class="truncate">
                        <div class="font-bold text-slate-200 group-hover:text-white truncate">${this.formatarNomePrivacidade(aluno.nome)}</div>
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
    },

    comprarItem: async (itemId, preco, tipo) => {
        if (!currentUser) return;
        
        // 1. Verifica Saldo
        const saldoAtual = currentUser.aura || 0;
        if (saldoAtual < preco) {
            alert("Aura insuficiente para esta aquisição!");
            return;
        }

        // 2. Verifica se já possui (apenas para Skins e Temas)
        const colecao = currentUser.colecaoCosmeticos || [];
        if (tipo !== 'consumivel' && colecao.includes(itemId)) {
            alert("Você já possui este item em sua coleção!");
            return;
        }

        if (!confirm(`Confirmar troca de ${preco.toLocaleString()} Auras por este item?`)) return;

        try {
            const userRef = doc(db, "users", currentUser.uid);
            let updateData = { aura: saldoAtual - preco };

            if (tipo === 'consumivel') {
                // Adiciona na mochila (permite duplicatas)
                const mochila = currentUser.mochilaPedagogica || [];
                mochila.push({ id: itemId, dataCompra: new Date().toISOString(), usado: false });
                updateData.mochilaPedagogica = mochila;
            } else {
                // Adiciona na coleção de cosméticos
                colecao.push(itemId);
                updateData.colecaoCosmeticos = colecao;
            }

            await updateDoc(userRef, updateData);
            alert("Item adquirido com sucesso! Verifique seu Perfil Tech.");
            
            // Recarrega a UI da loja
            gestaoAuraAPI.renderLojaAlunos();

        } catch (error) {
            console.error("Erro na transação:", error);
            alert("Falha na comunicação com o Grimório.");
        }
    },

    abrirLojaPedagogica: async () => {
        const container = document.getElementById('gestao-aura-content');
        if (!container) return;

        // 1. Loading de Contabilidade
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 fade-in">
                <div class="relative w-20 h-20 mb-4">
                    <div class="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
                    <i class="fas fa-coins absolute inset-0 flex items-center justify-center text-blue-500 text-xl"></i>
                </div>
                <p class="text-blue-400 font-cinzel font-bold animate-pulse uppercase tracking-widest text-[10px]">Sincronizando Saldo Pedagógico...</p>
            </div>
        `;

        try {
            // 2. Busca histórico de gastos e dados do user
            const [userSnap, comprasSnap] = await Promise.all([
                getDoc(doc(db, "users", auth.currentUser.uid)),
                getDocs(query(collection(db, "historico_compras"), where("alunoUid", "==", auth.currentUser.uid)))
            ]);

            const userData = userSnap.data();
            let totalGasto = 0;
            comprasSnap.forEach(d => totalGasto += d.data().preco);

            const auraTotal = userData.aura || 0;
            const auraDisponivel = auraTotal - totalGasto;

            // 3. Chama a renderização da interface (Passando os valores calculados)
            window.gestaoAuraAPI.renderizarLojaUI(auraTotal, totalGasto, auraDisponivel);

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p class="text-red-500 text-center py-10">Erro ao carregar o mercado.</p>`;
        }
    },

    processarCompra: async (itemId, preco, tipo) => {
        if (!auth.currentUser) return;

        try {
            // 1. Recalcula o saldo disponível por segurança antes de cobrar
            const [userSnap, comprasSnap] = await Promise.all([
                getDoc(doc(db, "users", auth.currentUser.uid)),
                getDocs(query(collection(db, "historico_compras"), where("alunoUid", "==", auth.currentUser.uid)))
            ]);

            let totalGasto = 0;
            comprasSnap.forEach(d => totalGasto += d.data().preco);
            
            const data = userSnap.data();
            const auraTotal = data.aura || 0;
            const auraDisponivel = auraTotal - totalGasto;

            // 2. Valida se o aluno tem saldo
            if (auraDisponivel < preco) {
                alert("Você não possui Moedas Pedagógicas suficientes para esta troca.");
                return;
            }

            // 3. Valida se o aluno já tem o item (Cosméticos não podem ser comprados duas vezes)
            if (tipo !== 'mochila') {
                const colecao = data.colecaoCosmeticos || [];
                if (colecao.includes(itemId)) {
                    alert("Você já possui este item na sua coleção! Verifique seu Perfil.");
                    return;
                }
            }

            // 4. Pede confirmação
            if (!confirm(`Deseja investir ${preco.toLocaleString('pt-BR')} Auras neste item?`)) return;

            // 5. Registra o gasto no histórico (NÃO mexe na Aura Total)
            await addDoc(collection(db, "historico_compras"), {
                alunoUid: auth.currentUser.uid,
                itemId: itemId,
                preco: preco,
                tipo: tipo,
                timestamp: serverTimestamp()
            });

            // 6. Atualiza o inventário do usuário
            const userRef = doc(db, "users", auth.currentUser.uid);
            if (tipo === 'mochila') {
                const mochila = data.mochilaPedagogica || [];
                mochila.push({ id: itemId, usado: false, data: new Date().toISOString() });
                await updateDoc(userRef, { mochilaPedagogica: mochila });
            } else {
                const colecao = data.colecaoCosmeticos || [];
                colecao.push(itemId);
                await updateDoc(userRef, { colecaoCosmeticos: colecao });
            }

            alert("Aquisição bem-sucedida! O seu Saldo Histórico permanece intacto.");
            window.gestaoAuraAPI.abrirLojaPedagogica(); // Recarrega a loja para atualizar os números

        } catch (e) {
            console.error("Erro na transação:", e);
            alert("Erro de comunicação com o Grimório ao processar a compra.");
        }
    },

};

export { gestaoAuraAPI };