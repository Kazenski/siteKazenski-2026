import { auth, db } from '../core/firebase.js';
import { GoogleAuthProvider, signInWithCredential, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Client ID do Google OAuth — substituído no CI/CD (mesmo padrão dos placeholders Firebase)
const GOOGLE_CLIENT_ID = "__GOOGLE_CLIENT_ID__";

let oneTapInicializado = false;
let onOneTapCallback = null;

function estaLogado() {
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            resolve(!!user);
        });
    });
}

function ehEmailInstitucional(email) {
    if (!email) return false;
    return email.endsWith('@kazenski.edu.br') || email.endsWith('@kazenski.com.br');
}

async function processarCredencialGoogle(credential) {
    const googleCredential = GoogleAuthProvider.credential(credential);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const user = userCredential.user;
    const isNewUser = userCredential.additionalUserInfo?.isNewUser === true;

    // Log de acesso
    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        await addDoc(collection(db, 'logs_usuarios'), {
            uid: user.uid,
            nome: (userDoc.exists() ? userDoc.data().nome : null) || 'Usuário',
            turma: (userDoc.exists() ? userDoc.data().turma : null) || 'SemTurma',
            acao: 'Realizou Login',
            detalhes: 'Acessou o portal com Google (One-Tap).',
            viaGoogle: true,
            institutional: ehEmailInstitucional(user.email),
            timestamp: serverTimestamp()
        });
    } catch { /* log é best-effort */ }

    // Usuário novo sem cadastro
    if (isNewUser) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', user.uid), {
                nome: user.displayName || user.email.split('@')[0],
                role: 'Pendente',
                origemCadastro: 'google-one-tap',
                emailInstitucional: ehEmailInstitucional(user.email),
                criadoEm: serverTimestamp(),
            });
        }
    }

    return user;
}

/**
 * Inicializa o One-Tap Sign-In do Google.
 * Mostra um widget discreto quando o usuário está logado no Google.
 * @param {Function} onSuccess - Chamado quando o login é bem-sucedido
 * @param {Function} onError - Chamado quando a conta não tem cadastro ou erro
 */
export async function iniciarOneTap(onSuccess, onError) {
    if (oneTapInicializado) return;
    oneTapInicializado = true;

    onOneTapCallback = { onSuccess, onError };

    // Se já está logado, não mostra o One-Tap
    if (await estaLogado()) return;

    // Se o client ID não foi substituído (ambiente dev/local), ignora
    if (GOOGLE_CLIENT_ID.startsWith('__')) {
        console.info('[One-Tap] Client ID não configurado. Pulando One-Tap.');
        return;
    }

    // Espera o GIS carregar
    if (!window.google?.accounts?.id) {
        const guiou = await new Promise((resolve) => {
            let tentativas = 0;
            const interval = setInterval(() => {
                tentativas++;
                if (window.google?.accounts?.id) {
                    clearInterval(interval);
                    resolve(true);
                } else if (tentativas > 30) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 100);
        });
        if (!guiou) {
            console.warn('[One-Tap] GIS não carregou a tempo.');
            return;
        }
    }

    try {
        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response) => {
                try {
                    const user = await processarCredencialGoogle(response.credential);
                    window.showTab('inicio');
                    onSuccess?.(user);
                } catch (error) {
                    console.error('[One-Tap] Erro ao autenticar:', error);

                    let msg = 'Não foi possível entrar. Tente novamente.';
                    if (error.code === 'auth/user-disabled') {
                        msg = 'Esta conta foi desativada. Contate um administrador.';
                    } else if (error.code === 'auth/invalid-credential') {
                        msg = 'Sessão expirada. Faça login novamente.';
                    } else if (error.code === 'auth/account-exists-with-different-credential') {
                        msg = 'Já existe uma conta com este e-mail usando senha. Faça login com e-mail e senha.';
                    } else if (error.code === 'auth/network-request-failed') {
                        msg = 'Falha de conexão. Verifique sua internet.';
                    }

                    onError?.(msg);
                }
            },
            auto_select: true,
            use_fedcm_for_prompt: true,
        });

        // Mostra o widget One-Tap
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.info('[One-Tap] Widget não exibido:', notification.getNotDisplayedReason());
            }
        });

        // Renderiza o botão "Entrar com Google" estilo GIS dentro da tela de login
        const containerGis = document.getElementById('gis_one_tap_button');
        if (containerGis) {
            containerGis.innerHTML = '';
            window.google.accounts.id.renderButton(containerGis, {
                theme: 'filled_blue',
                size: 'large',
                width: '100%',
                text: 'continue_with',
                locale: 'pt-BR',
            });
        }

    } catch (error) {
        console.warn('[One-Tap] Falha ao inicializar:', error);
    }
}

/**
 * Cancela o One-Tap (após logout).
 */
export function cancelarOneTap() {
    if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
    }
    oneTapInicializado = false;
}
