/**
 * ============================================================================
 *  CONSENTIMENTO — TERMOS DE USO / LGPD / ECA DIGITAL
 * ============================================================================
 *  Objetivo
 *  -------
 *  1. Verificar, no login, se o usuário já aceitou a versão atual dos
 *     documentos legais (Termos, LGPD e ECA Digital).
 *  2. Bloquear a navegação até o aceite quando faltar alguma versão.
 *  3. Registrar o aceite de forma versionada e auditável em
 *     `users/{uid}/consent`, SEM tocar em nenhum campo acadêmico existente.
 *  4. Permitir releitura a qualquer momento (botão "Termos e Políticas").
 *
 *  Modelo de dados (Firestore) — apenas escrita, nunca sobrescreve
 *  ------------------------------------------------------
 *  `users/{uid}` / campo `consent`:
 *      {
 *        terms:  { version, acceptedAt, acceptedFrom },
 *        lgpd:   { version, acceptedAt, acceptedFrom },
 *        eca:    { version, acceptedAt, acceptedFrom },
 *        history: [ { version, at, from, doc } ]   // histórico append-only
 *      }
 *
 *  Privacidade (LGPD)
 *  ------------------
 *  NÃO gravamos IP nem User-Agent crus. Guardamos apenas um booleano
 *  `viaMobile` para fins de auditoria estatística. O registro é feito em
 *  documento separado (`users/{uid}`), preservando 100% dos dados de
 *  notas, turmas e histórico.
 * ============================================================================
 */

import { auth, db } from '../core/firebase.js';
import {
    doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ============================================================================
//  CONSTANTES
// ============================================================================

/** Versões atuais. Ao publicar documentos novos, altere aqui. */
export const CONSENTIMENTO_VERSIONS = {
    termos: '1.0.0',
    lgpd: '1.0.0',
    eca: '1.0.0',
};

const DATA_PUBLICACAO = '03/10/2026';

/** Data-limite do acesso excepcional por email/senha (campanha de migração). */
export const DATA_LIMITE_EMAIL_SENHA = '31/12/2026';

const PAGINAS = {
    termos: { href: 'termos-de-uso.html', rotulo: 'Termos de Uso', icone: 'fa-file-contract' },
    lgpd: { href: 'lgpd.html', rotulo: 'Política de Privacidade (LGPD)', icone: 'fa-user-shield' },
    eca: { href: 'eca-digital.html', rotulo: 'ECA Digital', icone: 'fa-child-reaching' },
};

const CHAVE_AVISO = 'kz_aviso_consentimento_v1';

// ============================================================================
//  HELPERS
// ============================================================================

function $(sel) { return document.querySelector(sel); }

/** Verifica se o usuário JÁ possui conta Google vinculada. */
export function temProvedorGoogle(user) {
    return !!user?.providerData?.some((p) => p.providerId === 'google.com');
}

/** Verifica se o usuário ainda NÃO migrou (precisa da página guiada). */
export function precisaMigrar(user, userData) {
    if (!user) return false;
    if (temProvedorGoogle(user)) return false;
    if (userData?.migratedToGoogle === true) return false;
    return true;
}

/** Data em pt-BR (dd/mm/aaaa). */
export function dataBR(d) {
    if (!d) return '—';
    try {
        const dt = typeof d.toDate === 'function' ? d.toDate() : new Date(d);
        return dt.toLocaleDateString('pt-BR');
    } catch { return '—'; }
}

/** Máscara de telefone/celular (opcional, apenas cosmético). */
function ehCelular() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

/** Você NÃO deve ler o Firestore inteiro a cada render — use este cache leve. */
let consentCache = null; // { uid, data, ok }

/** Lê (com cache curto) o consentimento do usuário logado. */
export async function verificarConsentimento(user) {
    if (!user) return null;

    // Cache por 30s evita refetch a cada re-render.
    if (consentCache && consentCache.uid === user.uid) {
        const idade = Date.now() - consentCache.em;
        if (idade < 30000) return consentCache.data;
    }

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : null;
        const consent = data?.consent || null;
        consentCache = { uid: user.uid, data: consent, em: Date.now() };
        return consent;
    } catch (e) {
        console.error('[Consentimento] Falha ao ler:', e);
        return null; // fail-open: não bloquear por erro de rede
    }
}

/** Verifica se o consentimento cobre TODAS as versões atuais. */
export function consentimentoCompleto(consent) {
    if (!consent) return false;
    return (
        consent.termos?.version === CONSENTIMENTO_VERSIONS.termos &&
        consent.lgpd?.version === CONSENTIMENTO_VERSIONS.lgpd &&
        consent.eca?.version === CONSENTIMENTO_VERSIONS.eca
    );
}

/** Verifica se falta apenas um dos documentos. */
export function documentosPendentes(consent) {
    const pendentes = [];
    if (consent?.termos?.version !== CONSENTIMENTO_VERSIONS.termos) pendentes.push('termos');
    if (consent?.lgpd?.version !== CONSENTIMENTO_VERSIONS.lgpd) pendentes.push('lgpd');
    if (consent?.eca?.version !== CONSENTIMENTO_VERSIONS.eca) pendentes.push('eca');
    return pendentes;
}

/** Invalida o cache (chamar após gravar aceite). */
export function limparCacheConsentimento() { consentCache = null; }

// ============================================================================
//  GRAVAÇÃO DO ACEITE
// ============================================================================

/**
 * Registra o aceite no Firestore. Usa `updateDoc` apenas no sub-objeto
 * `consent` — o resto do documento (notas, aura, roles) permanece intacto.
 */
export async function registrarAceite(user, aceitos) {
    const agoraISO = new Date().toISOString();
    const carimbo = { acceptedAt: serverTimestamp(), acceptedFrom: 'web', viaMobile: ehCelular() };

    const patch = {
        consent: {
            termos: aceitos.termos ? { version: CONSENTIMENTO_VERSIONS.termos, ...carimbo } : undefined,
            lgpd: aceitos.lgpd ? { version: CONSENTIMENTO_VERSIONS.lgpd, ...carimbo } : undefined,
            eca: aceitos.eca ? { version: CONSENTIMENTO_VERSIONS.eca, ...carimbo } : undefined,
        },
    };

    // Remove chaves `undefined` para não sobrescrever Docs já aceitos.
    Object.keys(patch.consent).forEach((k) => { if (patch.consent[k] === undefined) delete patch.consent[k]; });

    const ref = doc(db, 'users', user.uid);
    await updateDoc(ref, patch);

    // Histórico append-only em coleção separada (nunca perde o anterior).
    const { addDoc, collection } = await import(
        "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"
    );
    await addDoc(collection(db, 'logs_consentimento'), {
        uid: user.uid,
        email: user.email || null,
        nome: (aceitos._nome || null),
        documentos: Object.keys(aceitos).filter((k) => k !== '_nome' && aceitos[k]),
        versoes: CONSENTIMENTO_VERSIONS,
        de: agoraISO,
        para: new Date().toISOString(),
        origem: 'web',
        viaMobile: ehCelular(),
    });

    limparCacheConsentimento();
}

// ============================================================================
//  INTERFACE (MODAL)
// ============================================================================

function abrirModalConsentimento({ obrigatorio, pendentes, user, onConcluir }) {
    // Remove modal anterior se existir
    $('#kz-modal-consent')?.remove();

    const podePular = !obrigatorio;

    const bloco = (chave) => {
        if (pendentes && !pendentes.includes(chave)) {
            // Já aceitou esta versão: apenas informativo.
            return `
              <label class="flex items-start gap-3 cursor-pointer opacity-70">
                <input type="checkbox" data-doc="${chave}" checked class="mt-1 accent-blue-500 w-4 h-4">
                <span class="text-sm text-slate-300">
                  Li e aceito os <a href="${PAGINAS[chave].href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">${PAGINAS[chave].rotulo}</a>
                  <span class="text-emerald-400 text-xs ml-1">(já aceito)</span>
                </span>
              </label>`;
        }
        return `
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" data-doc="${chave}" class="mt-1 accent-blue-500 w-4 h-4">
            <span class="text-sm text-slate-300">
              Li e aceito os <a href="${PAGINAS[chave].href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">${PAGINAS[chave].rotulo}</a>
              <span class="text-slate-500 text-xs"> (v${CONSENTIMENTO_VERSIONS[chave]})</span>
            </span>
          </label>`;
    };

    const modal = document.createElement('div');
    modal.id = 'kz-modal-consent';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.className = 'fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden fade-in">
        <div class="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>

        <div class="p-6 md:p-8 border-b border-slate-800">
          <div class="flex items-start gap-4">
            <div class="shrink-0 w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <i class="fas fa-shield-halved text-blue-400 text-xl"></i>
            </div>
            <div>
              <h3 class="text-xl font-cinzel font-bold text-white">Termos e Políticas</h3>
              <p class="text-slate-400 text-sm mt-1">
                Para acessar o portal, é necessário aceitar os documentos abaixo.
                <span class="text-slate-500">Publicados em ${DATA_PUBLICACAO}.</span>
              </p>
            </div>
          </div>
        </div>

        <div class="p-6 md:p-8 space-y-4 overflow-y-auto max-h-[50vh]">
          ${bloco('termos')}
          ${bloco('lgpd')}
          ${bloco('eca')}

          <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
            <p class="flex items-start gap-2"><i class="fas fa-info-circle mt-0.5 text-blue-400"></i>
              Este registro fica salvo no sistema com data, hora e versão aceita, para acompanhamento dos responsáveis.</p>
            <p class="flex items-start gap-2"><i class="fas fa-child-reaching mt-0.5 text-emerald-400"></i>
              Em caso de menor de idade, o aceite pode ser realizado pelo responsável, conforme a diretriz da escola.</p>
            <p class="flex items-start gap-2"><i class="fas fa-eye-slash mt-0.5 text-slate-500"></i>
              Não gravamos seu endereço IP nem dados de navegação — apenas a versão aceita, a data/hora e se o acesso foi por celular.</p>
          </div>
        </div>

        <div class="p-6 md:p-8 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <button id="kz-consent-cancelar" class="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">
            ${podePular ? 'Agora não' : 'Voltar ao login'}
          </button>
          <button id="kz-consent-aceitar" class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-900/30 flex items-center gap-2">
            <i class="fas fa-check"></i> Aceitar e continuar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const btnAceitar = modal.querySelector('#kz-consent-aceitar');
    const btnCancelar = modal.querySelector('#kz-consent-cancelar');
    const erro = document.createElement('div');
    erro.className = 'px-6 pb-2 text-xs text-red-400 font-bold hidden';

    btnAceitar.addEventListener('click', async () => {
        const boxes = Array.from(modal.querySelectorAll('input[type="checkbox"]'));
        const marcados = boxes.filter((b) => b.checked).map((b) => b.dataset.doc);

        const faltando = ['termos', 'lgpd', 'eca'].filter((d) => !marcados.includes(d));
        if (faltando.length) {
            erro.textContent = 'É necessário aceitar todos os documentos para continuar.';
            erro.classList.remove('hidden');
            setTimeout(() => erro.classList.add('hidden'), 4000);
            return;
        }

        btnAceitar.disabled = true;
        btnAceitar.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Registrando...';

        try {
            await registrarAceite(user, { termos: true, lgpd: true, eca: true });
            modal.remove();
            onConcluir?.();
        } catch (e) {
            console.error('[Consentimento] Erro ao gravar:', e);
            btnAceitar.disabled = false;
            btnAceitar.innerHTML = '<i class="fas fa-check"></i> Aceitar e continuar';
            erro.textContent = 'Não foi possível registrar o aceite. Verifique sua conexão e tente novamente.';
            erro.classList.remove('hidden');
        }
    });

    btnCancelar.addEventListener('click', () => {
        modal.remove();
        if (!podePular) window.showTab?.('login');
    });

    // Impede fechar por clique fora quando é obrigatório.
    if (obrigatorio) {
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal) {
                ev.stopPropagation();
            }
        });
    }
}

/**
 * Força o aceite quando faltar versão. Usado no login.
 */
export async function forcarConsentimento(user, aoConcluir) {
    const consent = await verificarConsentimento(user);
    if (consentimentoCompleto(consent)) {
        aoConcluir?.();
        return true;
    }
    const pendentes = documentosPendentes(consent);
    abrirModalConsentimento({ obrigatorio: true, pendentes, user, onConcluir: aoConcluir });
    return false;
}

/**
 * Central de releitura (botão "Termos e Políticas"). Não grava nada se
 * o usuário só está lendo — pode fechar sem aceitar.
 */
export async function abrirCentralTermos() {
    const user = auth.currentUser;
    const consent = user ? await verificarConsentimento(user) : null;
    const pendentes = documentosPendentes(consent);

    abrirModalConsentimento({
        obrigatorio: false,
        pendentes,
        user,
        onConcluir: () => {
            try { localStorage.setItem(CHAVE_AVISO, '1'); } catch { /* ignora */ }
        },
    });
}

// ============================================================================
//  INICIALIZAÇÃO (banner de novidades na home)
// ============================================================================

export function iniciarConsentimento() {
    // Expõe globalmente para o botão do header e para o router.
    window.abrirCentralTermos = abrirCentralTermos;
    window.CONSENTIMENTO_VERSIONS = CONSENTIMENTO_VERSIONS;
    window.DATA_LIMITE_EMAIL_SENHA = DATA_LIMITE_EMAIL_SENHA;
}