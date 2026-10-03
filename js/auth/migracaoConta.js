import { auth, db } from '../core/firebase.js';
import {
  linkWithPopup,
  GoogleAuthProvider,
  fetchSignInMethodsForEmail,
  reauthenticateWithPopup,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const provider = new GoogleAuthProvider();

let currentUserData = null;
let currentUser = null;

function escapeHtml(text = "") {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export async function renderMigrarContaTab() {
  const container = document.getElementById("migrar-conta-content");
  if (!container) return;

  if (!auth.currentUser) {
    window.showTab("login");
    return;
  }

  currentUser = auth.currentUser;
  let userDoc = null;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    userDoc = snap.exists() ? snap.data() : {};
  } catch (e) {
    userDoc = {};
  }

  currentUserData = userDoc;

  const migrated = userDoc.migratedToGoogle === true;
  const hasGoogle = Array.isArray(currentUser.providerData)
    ? currentUser.providerData.some((p) => p.providerId === "google.com")
    : false;

  if (migrated || hasGoogle) {
    container.innerHTML = `
      <div class="w-full max-w-2xl bg-slate-800 p-8 md:p-10 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden fade-in">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>
        <div class="text-center mb-6 pt-2">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 border border-slate-700 mb-4 shadow-inner">
            <i class="fas fa-check-circle text-3xl text-emerald-500"></i>
          </div>
          <h2 class="text-2xl md:text-3xl font-cinzel font-bold text-white">Conta já migrada</h2>
          <p class="text-slate-400 text-sm mt-2">Sua conta já está vinculada ao Google.</p>
        </div>
        <div class="bg-slate-900/70 border border-slate-700 rounded-xl p-4 text-sm space-y-2">
          <div class="flex justify-between"><span class="text-slate-400">E-mail atual (cadastrado):</span><span class="text-slate-300">${escapeHtml(currentUser.email || "-")}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Google vinculado:</span><span class="text-slate-300">${escapeHtml(userDoc.googleEmail || currentUser.providerData.find(p=>p.providerId==='google.com')?.email || "-")}</span></div>
        </div>
        <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button onclick="window.showTab('inicio')" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg">Ir para Início</button>
          <button onclick="window.showTab('login')" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all">Voltar ao Login</button>
        </div>
        <p class="mt-6 text-[11px] text-slate-500 text-center">Mesmo após migrado, em casos excepcionais o acesso por email/senha antigo poderá ser usado até 31/12/2026.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="w-full max-w-3xl bg-slate-800 p-6 md:p-10 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden fade-in">
      <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>
      <div class="mb-6 pt-2">
        <h2 class="text-2xl md:text-3xl font-cinzel font-bold text-white">Migração guiada: vincular conta Google</h2>
        <p class="text-slate-400 text-sm mt-2">Passo a passo para manter todos os seus dados (notas, turmas e histórico) intactos.</p>
      </div>

      <div class="bg-slate-900/70 border border-slate-700 rounded-xl p-4 mb-6 text-sm space-y-2">
        <div class="flex flex-col sm:flex-row sm:justify-between gap-1"><span class="text-slate-400">Nome atual no sistema:</span><span class="text-slate-300">${escapeHtml(userDoc.nome || currentUser.displayName || "-")}</span></div>
        <div class="flex flex-col sm:flex-row sm:justify-between gap-1"><span class="text-slate-400">E-mail cadastrado (atual):</span><span class="text-slate-300">${escapeHtml(currentUser.email || "-")}</span></div>
        <div class="flex flex-col sm:flex-row sm:justify-between gap-1"><span class="text-slate-400">Matrícula/Código:</span><span class="text-slate-300">${escapeHtml(userDoc.matricula || userDoc.codigo || userDoc.ra || "-")}</span></div>
        <div class="flex flex-col sm:flex-row sm:justify-between gap-1"><span class="text-slate-400">Turma:</span><span class="text-slate-300">${escapeHtml(userDoc.turma || "-")}</span></div>
      </div>

      <div class="space-y-4 text-sm text-slate-300">
        <div class="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
          <div class="flex items-start gap-3">
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/80 text-white text-xs font-bold">1</span>
            <div>
              <p class="font-semibold text-white">Confirme seus dados</p>
              <p class="text-slate-400 mt-1">Abaixo, confirme Nome e Sobrenome para manter chamada, notas e boletins corretos.</p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Nome (obrigatório)</label>
                  <input id="mig-firstName" type="text" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" value="${escapeHtml(userDoc.firstName || userDoc.nome || "")}">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Sobrenome (obrigatório)</label>
                  <input id="mig-lastName" type="text" class="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" value="${escapeHtml(userDoc.lastName || "")}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
          <div class="flex items-start gap-3">
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/80 text-white text-xs font-bold">2</span>
            <div>
              <p class="font-semibold text-white">Vincule com sua conta Google</p>
              <p class="text-slate-400 mt-1">Recomendamos usar seu <strong class="text-slate-300">e-mail institucional</strong> (@estudante.sed.sc.gov.br ou @profe.sed.sc.gov.br). Caso ainda não tenha acesso, pode usar sua conta Google pessoal temporariamente.</p>
              <p class="text-slate-400 mt-1">Selecione <strong class="text-slate-300">SEMPRE</strong> a mesma conta Google que pretende usar daqui em diante.</p>
              <button id="btn-link-google" class="mt-3 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center gap-2">
                <i class="fab fa-google"></i>
                <span>Vincular com minha conta Google</span>
              </button>
              <div id="link-msg" class="mt-2 text-xs"></div>
            </div>
          </div>
        </div>

        <div class="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
          <div class="flex items-start gap-3">
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/80 text-white text-xs font-bold">3</span>
            <div>
              <p class="font-semibold text-white">Finalize</p>
              <p class="text-slate-400 mt-1">Após vincular com sucesso, todos os seus dados permanecem no mesmo local. Mesmo após migrado, em casos excepcionais o acesso por email/senha antigo poderá ser usado até <strong class="text-slate-300">31/12/2026</strong>.</p>
              <div id="link-success" class="hidden mt-3 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 rounded-lg p-3 text-xs">
                <i class="fas fa-check-circle mr-1"></i> Migração concluída com sucesso! Google vinculado: <span id="linked-email" class="font-semibold"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-between">
        <button onclick="window.showTab('inicio')" class="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all">Voltar para Início</button>
        <div class="flex gap-3">
          <a href="termos-de-uso.html" target="_blank" rel="noopener noreferrer" class="px-5 py-2.5 bg-slate-900/70 border border-slate-700 hover:border-blue-500 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center gap-2"><i class="fas fa-file-contract"></i> Ver Termos</a>
          <button id="btn-go-home" class="hidden px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg">Ir para página inicial</button>
        </div>
      </div>
    </div>
  `;

  const btnLink = container.querySelector("#btn-link-google");
  const msg = container.querySelector("#link-msg");
  const successBox = container.querySelector("#link-success");
  const linkedEmailEl = container.querySelector("#linked-email");
  const btnGoHome = container.querySelector("#btn-go-home");

  btnGoHome.addEventListener("click", () => window.showTab("inicio"));

  btnLink.addEventListener("click", async () => {
    if (!auth.currentUser) {
      window.showTab("login");
      return;
    }

    const firstName = container.querySelector("#mig-firstName").value.trim();
    const lastName = container.querySelector("#mig-lastName").value.trim();
    if (!firstName || !lastName) {
      msg.innerHTML = '<span class="text-amber-400"><i class="fas fa-exclamation-triangle mr-1"></i> Preencha Nome e Sobrenome para continuar.</span>';
      return;
    }

    msg.innerHTML = "";
    btnLink.disabled = true;
    btnLink.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Vinculando...</span>';

    try {
      const result = await linkWithPopup(auth.currentUser, provider);
      const googleUser = result.user || auth.currentUser;
      const googleEmail = googleUser.providerData.find((p) => p.providerId === "google.com")?.email || googleUser.email;

      const fullName = `${firstName} ${lastName}`.trim();

      const userRef = doc(db, "users", googleUser.uid);
      await setDoc(
        userRef,
        {
          nome: fullName,
          firstName,
          lastName,
          fullName,
          googleEmail: googleEmail ? googleEmail.toLowerCase() : null,
          migratedToGoogle: true,
          migrationMethod: "link-while-logged",
          googleLinkedAt: serverTimestamp(),
          linkedProviders: ["password", "google.com"],
          authEmailFake: currentUser.email || null,
          nameVerifiedAt: serverTimestamp(),
        },
        { merge: true }
      );

      msg.innerHTML = "";
      linkedEmailEl.textContent = googleEmail || "-";
      successBox.classList.remove("hidden");
      btnGoHome.classList.remove("hidden");
      btnLink.innerHTML = '<i class="fas fa-check"></i><span>Vinculado com sucesso</span>';
      btnLink.classList.remove("bg-blue-600", "hover:bg-blue-500");
      btnLink.classList.add("bg-emerald-600", "cursor-default");
    } catch (error) {
      console.error(error);
      let text = "Erro ao vincular conta Google. Tente novamente.";
      if (error.code === "auth/provider-already-linked") {
        text = "Esta conta já possui vínculo com Google.";
      } else if (error.code === "auth/credential-already-in-use") {
        text = "Esta conta Google já está vinculada a outra conta neste sistema. Entre em contato com o suporte informando sua matrícula/código e anexando um print.";
      } else if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
        text = "Popup fechado pelo usuário. Você pode tentar novamente.";
      } else if (error.code === "auth/popup-blocked") {
        text = "Popup bloqueado pelo navegador. Permita popups para este site ou tente novamente.";
      }
      msg.innerHTML = `<span class="text-amber-400"><i class="fas fa-exclamation-triangle mr-1"></i> ${escapeHtml(text)}</span>`;
      btnLink.disabled = false;
      btnLink.innerHTML = '<i class="fab fa-google"></i><span>Vincular com minha conta Google</span>';
    }
  });
}
