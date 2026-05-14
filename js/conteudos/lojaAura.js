import { db, auth } from '../core/firebase.js';
import { collection, arrayUnion, addDoc, getDocs, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const storage = getStorage();

export const lojaAuraAPI = {
    init() {
        this.checkPermissions();
        this.listenItens();
        this.setupEventListeners();
    },

    checkPermissions() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    const canManage = (data.Admin === true || data.Admin === "true" ||
                        data.Professor === true || data.Professor === "true" ||
                        data.Coordenacao === true || data.Coordenacao === "true");

                    if (canManage) {
                        document.getElementById('admin-loja-container').classList.remove('hidden');
                    }
                }
            }
        });
    },

    setupEventListeners() {
        const form = document.getElementById('form-loja-item');
        const selectTipo = document.getElementById('item-tipo');
        const containerDuracao = document.getElementById('container-duracao');

        selectTipo.onchange = (e) => {
            containerDuracao.classList.toggle('hidden', e.target.value !== 'temporario');
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            this.saveItem();
        };

        document.getElementById('btn-cancelar-item').onclick = () => this.resetForm();
    },

    async saveItem() {
        const id = document.getElementById('item-id').value;
        const nome = document.getElementById('item-nome').value;
        const custo = parseInt(document.getElementById('item-custo').value);
        const tipo = document.getElementById('item-tipo').value;
        const validade = document.getElementById('item-validade').value;
        const file = document.getElementById('item-imagem').files[0];
        const btnSubmit = document.querySelector('#form-loja-item button[type="submit"]');

        let duracao = null;
        if (tipo === 'temporario') {
            duracao = {
                valor: parseInt(document.getElementById('item-duracao-valor').value),
                unidade: document.getElementById('item-duracao-unidade').value
            };
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Forjando...';

        try {
            let imageUrl = document.getElementById('item-id').dataset.currentImg || '';

            if (file) {
                const storageRef = ref(storage, `loja/itens/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef);
            }

            const itemData = {
                nome, custo, tipo, validade, duracao, imageUrl,
                updatedAt: serverTimestamp()
            };

            if (id) {
                await updateDoc(doc(db, "loja_itens", id), itemData);
                alert("Artefato modificado com sucesso!");
            } else {
                itemData.createdAt = serverTimestamp();
                await addDoc(collection(db, "loja_itens"), itemData);
                alert("Novo artefato forjado e disponível na loja!");
            }

            this.resetForm();
        } catch (error) {
            console.error("Erro ao salvar item:", error);
            alert("Falha na forja: " + error.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fas fa-hammer mr-2"></i> Forjar Item';
        }
    },

    listenItens() {
        const q = query(collection(db, "loja_itens"), orderBy("custo", "asc"));
        onSnapshot(q, (snapshot) => {
            const grid = document.getElementById('loja-itens-grid');
            grid.innerHTML = '';

            if (snapshot.empty) {
                grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-500 italic">O mercado está vazio no momento.</div>`;
                return;
            }

            snapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const id = docSnap.id;
                grid.innerHTML += this.renderItemCard(id, item);
            });

            // Re-avalia visibilidade dos botões admin baseando-se no container admin
            const isAdminVisible = !document.getElementById('admin-loja-container').classList.contains('hidden');
            if (isAdminVisible) {
                document.querySelectorAll('.admin-loja-btn').forEach(btn => btn.classList.remove('hidden'));
            }
        });
    },

    renderItemCard(id, item) {
        const bgPlaceholder = "imagens/favicon/faviconKazenski.png";
        let badgeColor = "bg-blue-600";
        if (item.tipo === "permanente") badgeColor = "bg-purple-600";
        if (item.tipo === "temporario") badgeColor = "bg-amber-600";

        return `
            <div class="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden shadow-lg flex flex-col transition-all hover:-translate-y-1 hover:shadow-blue-900/20">
                <div class="h-48 bg-slate-900 relative flex items-center justify-center p-4">
                    <img src="${item.imageUrl || bgPlaceholder}" class="max-w-full max-h-full object-contain drop-shadow-2xl">
                    <div class="absolute top-3 right-3 ${badgeColor} px-3 py-1 rounded-full text-[10px] font-black uppercase text-white shadow-lg tracking-widest">
                        ${item.custo} Aura
                    </div>
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <h4 class="text-white font-cinzel font-black text-xl mb-1">${item.nome}</h4>
                    <p class="text-slate-400 text-[10px] uppercase tracking-widest mb-4 flex-grow">
                        <i class="fas fa-tag mr-1"></i> ${item.tipo} ${item.duracao ? `(${item.duracao.valor} ${item.duracao.unidade})` : ''}
                    </p>
                    
                    <div class="flex gap-2 mt-auto">
                        <button onclick="window.lojaAuraAPI.comprarItem('${id}', ${item.custo}, '${item.nome.replace(/'/g, "\\'")}')" 
                                class="flex-grow bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                            Adquirir
                        </button>
                        <button onclick="window.lojaAuraAPI.editItem('${id}')" 
                                class="admin-loja-btn hidden px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors" title="Editar Artefato">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.lojaAuraAPI.deleteItem('${id}')" 
                                class="admin-loja-btn hidden px-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-colors" title="Banir Artefato">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    async comprarItem(id, custo, nomeItem) {
        if (!confirm(`Deseja confirmar a compra de ${nomeItem} por ${custo.toLocaleString('pt-BR')} pts?`)) return;

        const userUid = auth.currentUser.uid;
        const userRef = doc(db, 'users', userUid);

        try {
            await runTransaction(db, async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("Usuário não encontrado.");

                const userData = userDoc.data();
                
                // Calcula o saldo em tempo real (Total bruta - Gasta)
                const auraAtualBruta = userData.aura || 0;
                const totalGastoAnterior = parseInt(userData.auraGasta || 0);
                const saldoDisponivel = auraAtualBruta - totalGastoAnterior;

                if (saldoDisponivel < custo) {
                    throw new Error(`Saldo insuficiente. Você possui ${saldoDisponivel.toLocaleString('pt-BR')} pts disponíveis.`);
                }

                const novoTotalGasto = totalGastoAnterior + custo;

                // Registra a transação na coleção de compras
                const compraRef = doc(collection(db, "loja_compras"));
                transaction.set(compraRef, {
                    alunoUid: userUid,
                    itemId: id,
                    nomeItem: nomeItem,
                    custo: custo,
                    dataCompra: serverTimestamp()
                });

                // --- LÓGICA CORRIGIDA: SOMA A QUANTIDADE SE O ITEM JÁ EXISTIR ---
                let mochila = userData.mochilaPedagogica || [];
                const itemIndex = mochila.findIndex(i => i.id === id);

                if (itemIndex > -1) {
                    // Item existe: Soma +1 na quantidade
                    mochila[itemIndex].quantidade = (mochila[itemIndex].quantidade || 1) + 1;
                } else {
                    // Item novo: Adiciona à mochila com quantidade 1
                    mochila.push({
                        id: id,
                        nome: nomeItem,
                        icone: 'fa-gift',
                        quantidade: 1,
                        usosRestantes: 1
                    });
                }

                // Atualiza o banco com o novo gasto e o array modificado
                transaction.update(userRef, {
                    auraGasta: novoTotalGasto,
                    mochilaPedagogica: mochila
                });
            });

            alert(`Sucesso! ${nomeItem} foi enviado para sua Mochila Tech.`);
            
            // Subtrai o valor na tela de forma reativa instantaneamente
            const saldoEl = document.getElementById('shop-user-aura-disponivel');
            if (saldoEl) {
                const saldoAtualNum = parseInt(saldoEl.textContent.replace(/\./g, ''));
                saldoEl.textContent = (saldoAtualNum - custo).toLocaleString('pt-BR');
            }

            // Atualiza a mochila se a API dela já estiver instanciada
            if (window.mochilaAPI) {
                window.mochilaAPI.init();
            }

        } catch (error) {
            alert(error.message);
        }
    },

    async deleteItem(id) {
        if (confirm("Deseja banir este artefato da loja para sempre? Esta ação não pode ser desfeita.")) {
            try {
                await deleteDoc(doc(db, "loja_itens", id));
            } catch (error) {
                console.error("Erro ao deletar:", error);
                alert("Erro ao remover o item da loja.");
            }
        }
    },

    async editItem(id) {
        try {
            const docSnap = await getDoc(doc(db, "loja_itens", id));
            if (docSnap.exists()) {
                const item = docSnap.data();

                document.getElementById('item-id').value = id;
                document.getElementById('item-id').dataset.currentImg = item.imageUrl || '';
                document.getElementById('item-nome').value = item.nome;
                document.getElementById('item-custo').value = item.custo;
                document.getElementById('item-tipo').value = item.tipo;
                document.getElementById('item-validade').value = item.validade || '';

                const containerDuracao = document.getElementById('container-duracao');
                if (item.tipo === 'temporario' && item.duracao) {
                    containerDuracao.classList.remove('hidden');
                    document.getElementById('item-duracao-valor').value = item.duracao.valor;
                    document.getElementById('item-duracao-unidade').value = item.duracao.unidade;
                } else {
                    containerDuracao.classList.add('hidden');
                }

                document.getElementById('btn-cancelar-item').classList.remove('hidden');
                document.querySelector('#form-loja-item button[type="submit"]').innerHTML = '<i class="fas fa-save mr-2"></i> Salvar Alterações';

                document.getElementById('gestao-aura-content').scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error("Erro ao carregar item para edição:", error);
            alert("Falha ao carregar pergaminhos do artefato.");
        }
    },

    resetForm() {
        document.getElementById('form-loja-item').reset();
        document.getElementById('item-id').value = '';
        document.getElementById('item-id').dataset.currentImg = '';
        document.getElementById('btn-cancelar-item').classList.add('hidden');
        document.getElementById('container-duracao').classList.add('hidden');
        document.querySelector('#form-loja-item button[type="submit"]').innerHTML = '<i class="fas fa-hammer mr-2"></i> Forjar Item';
    }
};

window.lojaAuraAPI = lojaAuraAPI;