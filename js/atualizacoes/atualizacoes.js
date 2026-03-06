import { db, storage } from '../core/firebase.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, 
    onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    ref, uploadBytesResumable, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const els = {
    formContainer: document.getElementById('upd-form-container'),
    form: document.getElementById('form-atualizacao'),
    formTitle: document.getElementById('upd-form-title'),
    btnToggleForm: document.getElementById('btn-toggle-upd-form'),
    btnSave: document.getElementById('btn-save-upd'),
    btnDelete: document.getElementById('btn-delete-upd'),
    
    id: document.getElementById('upd-id'),
    titulo: document.getElementById('upd-titulo'),
    subtitulo: document.getElementById('upd-subtitulo'),
    ordem: document.getElementById('upd-ordem'),
    link: document.getElementById('upd-link'),
    textoBotao: document.getElementById('upd-texto-botao'),
    ativa: document.getElementById('upd-ativa'),
    
    imagemInput: document.getElementById('upd-imagem'),
    preview: document.getElementById('upd-preview'),
    
    progressContainer: document.getElementById('upd-progress-container'),
    progressBar: document.getElementById('upd-progress-bar'),
    msg: document.getElementById('upd-msg'),
    
    tableBody: document.getElementById('upd-table-body'),
    emptyMsg: document.getElementById('upd-empty-msg')
};

let editingRecord = null;
let unsubscribeList = null;

// ==========================================
// PREVIEW DE IMAGEM
// ==========================================
els.imagemInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            els.preview.src = ev.target.result;
            els.preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else if (!editingRecord?.imagemURL) {
        els.preview.classList.add('hidden');
        els.preview.src = '';
    }
});

// ==========================================
// API EXPOSTA PARA O HTML
// ==========================================
window.atualizacoesAPI = {
    
    init: () => {
        const q = query(collection(db, "atualizacoes"), orderBy("ordem"));
        
        unsubscribeList = onSnapshot(q, (snapshot) => {
            els.tableBody.innerHTML = '';
            
            if (snapshot.empty) {
                els.emptyMsg.classList.remove('hidden');
                return;
            }
            
            els.emptyMsg.classList.add('hidden');
            
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const id = docSnap.id;
                
                const tr = document.createElement('tr');
                tr.className = `upd-row ${!data.ativa ? 'opacity-60' : ''}`;
                tr.innerHTML = `
                    <td class="p-4 text-center font-bold text-amber-500">${data.ordem}</td>
                    <td class="p-4">
                        <div class="w-16 h-10 rounded overflow-hidden bg-slate-950 border border-slate-700">
                            ${data.imagemURL ? `<img src="${data.imagemURL}" class="w-full h-full object-cover">` : '<div class="w-full h-full flex items-center justify-center text-[8px] text-slate-600 uppercase">Sem img</div>'}
                        </div>
                    </td>
                    <td class="p-4">
                        <div class="font-bold text-white text-sm">${data.titulo}</div>
                        ${data.subtitulo ? `<div class="text-[10px] text-slate-400 truncate max-w-[250px] mt-1">${data.subtitulo}</div>` : ''}
                    </td>
                    <td class="p-4 text-center">
                        <span class="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center">
                            <span class="upd-status-dot ${data.ativa ? 'upd-status-active' : 'upd-status-inactive'}"></span>
                            ${data.ativa ? 'Ativo' : 'Inativo'}
                        </span>
                    </td>
                    <td class="p-4 text-right">
                        <button class="btn-edit-record px-4 py-2 bg-slate-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors shadow-lg">Editar</button>
                    </td>
                `;
                
                tr.querySelector('.btn-edit-record').addEventListener('click', () => window.atualizacoesAPI.editRecord(id, data));
                els.tableBody.appendChild(tr);
            });
        }, (error) => {
            console.error("Erro ao escutar atualizações: ", error);
        });
    },

    toggleForm: () => {
        els.formContainer.classList.toggle('hidden');
        if(els.formContainer.classList.contains('hidden')) {
            window.atualizacoesAPI.resetForm();
            els.btnToggleForm.style.display = 'block';
        } else {
            els.btnToggleForm.style.display = 'none';
        }
    },

    resetForm: () => {
        els.form.reset();
        els.id.value = '';
        els.preview.src = '';
        els.preview.classList.add('hidden');
        els.btnDelete.classList.add('hidden');
        els.formTitle.innerHTML = '<i class="fas fa-edit mr-2"></i> Criar Atualização';
        els.btnSave.textContent = "Salvar Atualização";
        editingRecord = null;
        window.atualizacoesAPI.hideMessage();
        if(!els.formContainer.classList.contains('hidden')) {
            els.formContainer.scrollIntoView({ behavior: 'smooth' });
        }
    },

    editRecord: (id, data) => {
        editingRecord = data;
        els.id.value = id;
        els.titulo.value = data.titulo || '';
        els.subtitulo.value = data.subtitulo || '';
        els.ordem.value = data.ordem || 1;
        els.link.value = data.linkBotao || '';
        els.textoBotao.value = data.textoBotao || '';
        els.ativa.checked = data.ativa !== false; // Default true se não existir
        
        if(data.imagemURL) {
            els.preview.src = data.imagemURL;
            els.preview.classList.remove('hidden');
        } else {
            els.preview.src = '';
            els.preview.classList.add('hidden');
        }

        els.formTitle.innerHTML = '<i class="fas fa-edit mr-2"></i> Editando Atualização';
        els.btnSave.textContent = "Atualizar Registro";
        els.btnDelete.classList.remove('hidden');
        
        els.formContainer.classList.remove('hidden');
        els.btnToggleForm.style.display = 'none';
        els.formContainer.scrollIntoView({ behavior: 'smooth' });
    },

    deleteRecord: async () => {
        if(!els.id.value) return;
        
        if(confirm("Tem certeza que deseja excluir esta atualização permanentemente?")) {
            try {
                window.atualizacoesAPI.showMessage("Excluindo...", "success");
                await deleteDoc(doc(db, "atualizacoes", els.id.value));
                window.atualizacoesAPI.resetForm();
                els.formContainer.classList.add('hidden');
                els.btnToggleForm.style.display = 'block';
            } catch (error) {
                console.error("Erro ao excluir: ", error);
                window.atualizacoesAPI.showMessage("Erro ao excluir registro.", "error");
            }
        }
    },

    showMessage: (text, type) => {
        els.msg.textContent = text;
        els.msg.className = `text-xs font-bold flex items-center mr-auto px-4 py-2 rounded-lg ${type === 'success' ? 'upd-msg-success' : 'upd-msg-error'}`;
        els.msg.classList.remove('hidden');
    },

    hideMessage: () => {
        els.msg.classList.add('hidden');
    }
};

// ==========================================
// SUBMIT DO FORMULÁRIO (SALVAR/EDITAR)
// ==========================================
els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    els.btnSave.disabled = true;
    els.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    window.atualizacoesAPI.hideMessage();
    
    const file = els.imagemInput.files[0];
    let imagemURL = editingRecord?.imagemURL || null;

    try {
        // Lógica de Upload de Imagem (Se houver nova imagem)
        if (file) {
            els.progressContainer.classList.remove('hidden');
            const timestamp = new Date().getTime();
            const filename = `${timestamp}_${file.name}`;
            const storageRef = ref(storage, `atualizacoes_imagens/${filename}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        els.progressBar.style.width = progress + '%';
                    }, 
                    (error) => reject(error), 
                    async () => {
                        imagemURL = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve();
                    }
                );
            });
        }

        // Monta o objeto de dados
        const data = {
            titulo: els.titulo.value,
            subtitulo: els.subtitulo.value,
            ordem: parseInt(els.ordem.value) || 1,
            linkBotao: els.link.value || null,
            textoBotao: els.textoBotao.value || null,
            imagemURL: imagemURL,
            ativa: els.ativa.checked
        };

        // Salva ou Atualiza no Firestore
        if (els.id.value) {
            data.atualizadoEm = serverTimestamp();
            await updateDoc(doc(db, "atualizacoes", els.id.value), data);
            window.atualizacoesAPI.showMessage("Atualização editada com sucesso!", "success");
        } else {
            data.criadoEm = serverTimestamp();
            await addDoc(collection(db, "atualizacoes"), data);
            window.atualizacoesAPI.showMessage("Atualização publicada com sucesso!", "success");
        }
        
        setTimeout(() => {
            window.atualizacoesAPI.resetForm();
            els.formContainer.classList.add('hidden');
            els.btnToggleForm.style.display = 'block';
        }, 1500);

    } catch (error) {
        console.error("Erro ao salvar: ", error);
        window.atualizacoesAPI.showMessage("Erro ao salvar. Verifique o console.", "error");
    } finally {
        els.btnSave.disabled = false;
        els.btnSave.textContent = els.id.value ? "Atualizar Registro" : "Salvar Atualização";
        els.progressContainer.classList.add('hidden');
        els.progressBar.style.width = '0%';
    }
});

// Inicializa a escuta de dados ao carregar o arquivo
window.atualizacoesAPI.init();