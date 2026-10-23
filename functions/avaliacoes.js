// ========================================================================
// === AVALIAÇÕES: correção oficial no servidor (questões objetivas) ===
// ========================================================================
// Gabaritos ficam em avaliacoes/{id}/gabaritos/{questaoId}, acessíveis só
// por staff pelas regras do Firestore. Quem corrige é esta função, então o
// aluno nunca lê o gabarito antes do fim da prova.

const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");

const DOMINIOS = ["https://www.profkazenski.com", "https://profkazenski.com"];
const TIPOS_OBJETIVOS = [
  "multipla_escolha",
  "multipla_selecao",
  "verdadeiro_falso",
  "ligar_colunas",
  "ordenar",
];

const round2 = (n) => Math.round(n * 100) / 100;

const toDate = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  return ts instanceof Date ? ts : null;
};

const isStaff = (user) =>
  ["Admin", "Professor", "Coordenacao"].some(
      (k) => user[k] === true || user[k] === "true",
  );

// Pura e testável: compara a resposta com o gabarito e devolve os pontos.
function pontuarQuestao(questao, gabarito, resposta) {
  const pontos = Number(questao.pontos) || 0;

  switch (questao.tipo) {
    case "multipla_escolha":
      return {obtidos: resposta === gabarito ? pontos : 0, pontos};

    case "multipla_selecao": {
      const r = Array.isArray(resposta) ? [...resposta].sort() : [];
      const g = [...(gabarito || [])].sort();
      const certo = r.length === g.length && r.every((v, i) => v === g[i]);
      return {obtidos: certo ? pontos : 0, pontos};
    }

    case "verdadeiro_falso":
    case "ligar_colunas": {
      const chaves = Object.keys(gabarito || {});
      if (chaves.length === 0) return {obtidos: 0, pontos};
      const r = resposta && typeof resposta === "object" ? resposta : {};
      const acertos = chaves.filter((k) => r[k] === gabarito[k]).length;
      return {obtidos: round2((pontos * acertos) / chaves.length), pontos};
    }

    case "ordenar": {
      const certo = Array.isArray(resposta) &&
        resposta.length === gabarito.length &&
        resposta.every((v, i) => v === gabarito[i]);
      return {obtidos: certo ? pontos : 0, pontos};
    }

    default:
      return {obtidos: 0, pontos, pendente: true};
  }
}

async function carregarAvaliacao(db, avaliacaoId) {
  const avalRef = db.collection("avaliacoes_digitais").doc(avaliacaoId);
  const [avalSnap, questoesSnap, gabaritosSnap] = await Promise.all([
    avalRef.get(),
    avalRef.collection("questoes").get(),
    avalRef.collection("gabaritos").get(),
  ]);
  if (!avalSnap.exists) {
    throw new HttpsError("not-found", "Avaliação não encontrada.");
  }
  const questoes = questoesSnap.docs
      .map((d) => ({id: d.id, ...d.data()}))
      .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const gabaritos = {};
  const explicacoes = {};
  gabaritosSnap.forEach((d) => {
    gabaritos[d.id] = d.data().gabarito;
    explicacoes[d.id] = d.data().explicacao || "";
  });
  return {avalRef, aval: avalSnap.data(), questoes, gabaritos, explicacoes};
}

// ------------------------------------------------------------------------
// Envio da prova: valida janela e turma, corrige as objetivas e salva.
// ------------------------------------------------------------------------
exports.corrigirAvaliacao = onCall({
  cors: DOMINIOS,
  memory: "256MiB",
  timeoutSeconds: 60,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para enviar a avaliação.");
  }
  const {avaliacaoId, respostas} = request.data || {};
  if (!avaliacaoId || typeof respostas !== "object" || respostas === null) {
    throw new HttpsError("invalid-argument", "Dados da avaliação inválidos.");
  }

  const db = admin.firestore();
  const uid = request.auth.uid;

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "Perfil não encontrado.");
  }
  const user = userSnap.data();
  if (isStaff(user)) {
    throw new HttpsError("permission-denied", "Professores não enviam respostas de prova.");
  }

  const {aval, questoes, gabaritos} = await carregarAvaliacao(db, avaliacaoId);

  const agora = new Date();
  const abertura = toDate(aval.dataAbertura);
  const fechamento = toDate(aval.dataFechamento);
  if (abertura && agora < abertura) {
    throw new HttpsError("failed-precondition", "Esta avaliação ainda não está aberta.");
  }
  if (fechamento && agora > fechamento) {
    throw new HttpsError("failed-precondition", "O prazo desta avaliação já encerrou.");
  }
  if (!(aval.turmasAlvo || []).includes(user.turma)) {
    throw new HttpsError("permission-denied", "Esta avaliação não é da sua turma.");
  }
  if (questoes.length === 0) {
    throw new HttpsError("failed-precondition", "Esta avaliação ainda não tem questões.");
  }

  const entregasSnap = await db.collection("avaliacoes_entregas")
      .where("alunoUid", "==", uid)
      .where("avaliacaoId", "==", avaliacaoId)
      .limit(1)
      .get();
  const entregaRef = entregasSnap.empty ?
    db.collection("avaliacoes_entregas").doc() :
    entregasSnap.docs[0].ref;
  if (!entregasSnap.empty && entregasSnap.docs[0].data().finalizada === true) {
    throw new HttpsError("already-exists", "Você já enviou esta avaliação.");
  }

  const detalhes = [];
  let obtidos = 0;
  let pontosCorrigidos = 0;
  let pontosTotais = 0;
  let pendentes = 0;

  for (const q of questoes) {
    const pontos = Number(q.pontos) || 0;
    pontosTotais += pontos;
    const temGabarito = gabaritos[q.id] !== undefined;

    if (!TIPOS_OBJETIVOS.includes(q.tipo) || !temGabarito) {
      pendentes++;
      detalhes.push({questaoId: q.id, tipo: q.tipo, pontos, pendente: true});
      continue;
    }

    const r = pontuarQuestao(q, gabaritos[q.id], respostas[q.id]);
    obtidos += r.obtidos;
    pontosCorrigidos += pontos;
    detalhes.push({
      questaoId: q.id,
      tipo: q.tipo,
      pontos,
      obtidos: round2(r.obtidos),
      correta: r.obtidos === pontos,
    });
  }

  const notaMaxima = Number(aval.notaMaxima) || 0;
  const notaParcial = pontosCorrigidos > 0 ?
    round2((obtidos / pontosCorrigidos) * notaMaxima) :
    0;
  const completa = pendentes === 0;

  const dados = {
    avaliacaoId,
    alunoUid: uid,
    alunoNome: user.nome || "",
    turmaAluno: user.turma || "Sem Turma",
    finalizada: true,
    status: completa ? "avaliado" : "entregue",
    respostas,
    detalhes,
    pontosObtidos: round2(obtidos),
    pontosCorrigidos: round2(pontosCorrigidos),
    pontosTotais: round2(pontosTotais),
    pendentes,
    notaParcial,
    notaAtribuida: completa ? notaParcial : null,
    dataEnvio: admin.firestore.FieldValue.serverTimestamp(),
  };
  await entregaRef.set(dados, {merge: true});

  return {
    status: dados.status,
    notaParcial,
    notaAtribuida: dados.notaAtribuida,
    pendentes,
    pontosObtidos: dados.pontosObtidos,
    pontosCorrigidos: dados.pontosCorrigidos,
    pontosTotais: dados.pontosTotais,
    detalhes,
  };
});

// ------------------------------------------------------------------------
// Resultado do aluno. O gabarito só volta se o professor liberou e o prazo
// já terminou.
// ------------------------------------------------------------------------
exports.obterResultadoAvaliacao = onCall({
  cors: DOMINIOS,
  memory: "256MiB",
  timeoutSeconds: 60,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para ver o resultado.");
  }
  const {avaliacaoId} = request.data || {};
  if (!avaliacaoId) {
    throw new HttpsError("invalid-argument", "Avaliação não informada.");
  }

  const db = admin.firestore();
  const uid = request.auth.uid;

  const entregasSnap = await db.collection("avaliacoes_entregas")
      .where("alunoUid", "==", uid)
      .where("avaliacaoId", "==", avaliacaoId)
      .limit(1)
      .get();
  if (entregasSnap.empty) {
    throw new HttpsError("not-found", "Você ainda não enviou esta avaliação.");
  }
  const e = entregasSnap.docs[0].data();

  const {aval, questoes, gabaritos, explicacoes} = await carregarAvaliacao(db, avaliacaoId);
  const fechamento = toDate(aval.dataFechamento);
  const liberado = aval.mostrarGabarito === true &&
    fechamento !== null && new Date() >= fechamento;

  const resumo = {
    status: e.status || "entregue",
    notaParcial: e.notaParcial ?? null,
    notaAtribuida: e.notaAtribuida ?? null,
    pendentes: e.pendentes ?? 0,
    pontosObtidos: e.pontosObtidos ?? 0,
    pontosCorrigidos: e.pontosCorrigidos ?? 0,
    pontosTotais: e.pontosTotais ?? 0,
    detalhes: e.detalhes || [],
  };

  if (!liberado) {
    return {...resumo, gabaritoLiberado: false};
  }

  return {
    ...resumo,
    gabaritoLiberado: true,
    questoes: questoes.map((q) => ({
      id: q.id,
      tipo: q.tipo,
      enunciado: q.enunciado || "",
      pontos: Number(q.pontos) || 0,
      explicacao: explicacoes[q.id] || "",
      gabarito: gabaritos[q.id] ?? null,
    })),
  };
});
