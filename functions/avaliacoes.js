// ========================================================================
// === AVALIAÇÕES: correção oficial no servidor (questões objetivas) ===
// ========================================================================
// Gabaritos ficam em avaliacoes/{id}/gabaritos/{questaoId}, acessíveis só
// por staff pelas regras do Firestore. Quem corrige é esta função, então o
// aluno nunca lê o gabarito antes do fim da prova.

const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {GoogleAuth} = require("google-auth-library");
const {PGlite} = require("@electric-sql/pglite");
const {parsearBase, inferirTipos, identificadorSeguro, resultadosIguais} = require("./sql-csv");

const DOMINIOS = ["https://www.profkazenski.com", "https://profkazenski.com"];
const runnerToken = defineSecret("RUNNER_TOKEN");
const RUNNER_URL = "https://runner-python-986432086342.us-central1.run.app/run";
const MAX_CODIGO = 20000;
const MAX_TESTES = 20;
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

const normalizarSaida = (texto) =>
  String(texto ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim();

let clienteRunner = null;

// Chama o serviço Python no Cloud Run (autenticado com a identidade do Google
// e com o token compartilhado).
async function executarNoRunner(codigo, entrada) {
  if (!clienteRunner) {
    clienteRunner = await new GoogleAuth().getIdTokenClient(RUNNER_URL);
  }
  const resposta = await clienteRunner.request({
    url: RUNNER_URL,
    method: "POST",
    data: {codigo, entrada},
    headers: {"X-Runner-Token": runnerToken.value()},
    timeout: 15000,
  });
  return resposta.data;
}

// Bases de prova SQL: carregadas dos CSVs no Storage e mantidas em memória.
// Cada consulta roda dentro de BEGIN/ROLLBACK, e uma fila por base impede que
// duas correções misturem transações.
const cacheBases = new Map();
const LIMITE_CACHE_BASES = 5;

async function criarBancoProva(bases) {
  const db = new PGlite();
  const bucket = admin.storage().bucket();
  for (const base of bases) {
    const [conteudo] = await bucket.file(base.caminho).download();
    const {colunas, linhas} = parsearBase(conteudo.toString("utf8"));
    const tipos = inferirTipos(colunas, linhas);
    const tabela = identificadorSeguro(base.tabela, "tabela");
    const definicoes = colunas.map((c, i) => `${identificadorSeguro(c, `coluna_${i + 1}`)} ${tipos[i]}`);
    await db.exec(`CREATE TABLE ${tabela} (${definicoes.join(", ")})`);
    for (const linha of linhas) {
      const valores = linha.map((v) => (v === "" ? null : v));
      await db.query(
          `INSERT INTO ${tabela} VALUES (${valores.map((_, i) => `$${i + 1}`).join(", ")})`,
          valores,
      );
    }
  }
  return {db, fila: Promise.resolve()};
}

async function obterBancoProva(avaliacaoId, bases) {
  const chave = `${avaliacaoId}:${bases.map((b) => b.caminho).join("|")}`;
  if (cacheBases.has(chave)) return cacheBases.get(chave);
  const banco = await criarBancoProva(bases);
  if (cacheBases.size >= LIMITE_CACHE_BASES) {
    cacheBases.delete(cacheBases.keys().next().value);
  }
  cacheBases.set(chave, banco);
  return banco;
}

function executarNaBase(banco, sql) {
  const tarefa = banco.fila.then(async () => {
    await banco.db.exec("BEGIN");
    try {
      return await banco.db.query(sql);
    } finally {
      await banco.db.exec("ROLLBACK");
    }
  });
  banco.fila = tarefa.catch(() => {});
  return tarefa;
}

const linhasDoResultado = (r) => ({
  colunas: r.fields.map((f) => f.name),
  linhas: r.rows.map((row) => Object.values(row)),
});

// SQL vale tudo ou nada: o resultado da consulta do aluno precisa bater com o
// do gabarito, com as mesmas linhas (e na mesma ordem, se o gabarito pede ORDER BY).
async function pontuarSql(questao, gabarito, resposta, banco) {
  const pontos = Number(questao.pontos) || 0;
  const sqlAluno = typeof resposta === "string" ? resposta.trim() : "";
  if (!sqlAluno) return {obtidos: 0, pontos, correta: false};

  const esperado = linhasDoResultado(await executarNaBase(banco, gabarito.sql));
  let obtido;
  try {
    obtido = linhasDoResultado(await executarNaBase(banco, sqlAluno));
  } catch (erro) {
    return {obtidos: 0, pontos, correta: false, erroSql: erro.message};
  }
  const correta = resultadosIguais(obtido, esperado, gabarito.ordenada === true);
  return {obtidos: correta ? pontos : 0, pontos, correta};
}

// Cada teste vale uma fração da questão: pontos × testes aprovados ÷ total.
async function pontuarPython(questao, gabarito, codigo) {
  const pontos = Number(questao.pontos) || 0;
  const testes = ((gabarito && gabarito.testes) || []).slice(0, MAX_TESTES);
  if (!codigo || testes.length === 0) {
    return {obtidos: 0, pontos, aprovados: 0, total: testes.length};
  }
  let aprovados = 0;
  for (const t of testes) {
    const r = await executarNoRunner(codigo, t.entrada || "");
    if (!r.timeout && r.codigo === 0 && normalizarSaida(r.saida) === normalizarSaida(t.saida)) {
      aprovados++;
    }
  }
  return {
    obtidos: round2((pontos * aprovados) / testes.length),
    pontos,
    aprovados,
    total: testes.length,
  };
}

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
  memory: "512MiB",
  timeoutSeconds: 180,
  secrets: [runnerToken],
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
  let bancoProva = null;

  for (const q of questoes) {
    const pontos = Number(q.pontos) || 0;
    pontosTotais += pontos;
    const temGabarito = gabaritos[q.id] !== undefined;

    if (q.tipo === "python" && temGabarito) {
      try {
        const r = await pontuarPython(q, gabaritos[q.id], respostas[q.id]);
        obtidos += r.obtidos;
        pontosCorrigidos += pontos;
        detalhes.push({
          questaoId: q.id,
          tipo: q.tipo,
          pontos,
          obtidos: round2(r.obtidos),
          aprovados: r.aprovados,
          total: r.total,
          correta: r.obtidos === pontos,
        });
      } catch (erro) {
        console.error(`Falha ao corrigir Python da questão ${q.id}:`, erro);
        pendentes++;
        detalhes.push({questaoId: q.id, tipo: q.tipo, pontos, pendente: true, erroCorrecao: true});
      }
      continue;
    }

    if (q.tipo === "sql" && temGabarito) {
      try {
        if (!bancoProva) bancoProva = await obterBancoProva(avaliacaoId, aval.bases || []);
        const r = await pontuarSql(q, gabaritos[q.id], respostas[q.id], bancoProva);
        obtidos += r.obtidos;
        pontosCorrigidos += pontos;
        detalhes.push({
          questaoId: q.id,
          tipo: q.tipo,
          pontos,
          obtidos: round2(r.obtidos),
          correta: r.correta,
          erroSql: r.erroSql || null,
        });
      } catch (erro) {
        console.error(`Falha ao corrigir SQL da questão ${q.id}:`, erro);
        pendentes++;
        detalhes.push({questaoId: q.id, tipo: q.tipo, pontos, pendente: true, erroCorrecao: true});
      }
      continue;
    }

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

// ------------------------------------------------------------------------
// Execução de teste do aluno (Python): roda o código no runner sem nota.
// ------------------------------------------------------------------------
exports.executarPython = onCall({
  cors: DOMINIOS,
  memory: "256MiB",
  timeoutSeconds: 60,
  secrets: [runnerToken],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para executar o código.");
  }
  const {codigo, entrada} = request.data || {};
  if (typeof codigo !== "string" || codigo.length > MAX_CODIGO) {
    throw new HttpsError("invalid-argument", "Código inválido ou muito grande.");
  }
  try {
    const r = await executarNoRunner(codigo, typeof entrada === "string" ? entrada : "");
    return {saida: r.saida || "", erro: r.erro || "", codigo: r.codigo ?? null, timeout: !!r.timeout};
  } catch (erro) {
    console.error("Falha ao executar Python:", erro);
    throw new HttpsError("unavailable", "O executor de código está indisponível. Tente novamente.");
  }
});

// ------------------------------------------------------------------------
// Teste de consulta SQL do aluno contra a base da prova (sem nota).
// ------------------------------------------------------------------------
exports.executarSql = onCall({
  cors: DOMINIOS,
  memory: "512MiB",
  timeoutSeconds: 60,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para executar a consulta.");
  }
  const {avaliacaoId, sql} = request.data || {};
  if (!avaliacaoId || typeof sql !== "string" || sql.length > MAX_CODIGO) {
    throw new HttpsError("invalid-argument", "Consulta inválida.");
  }
  const avalSnap = await admin.firestore().collection("avaliacoes_digitais").doc(avaliacaoId).get();
  if (!avalSnap.exists || !(avalSnap.data().bases || []).length) {
    throw new HttpsError("failed-precondition", "Esta prova não tem base de dados.");
  }
  const aval = avalSnap.data();
  try {
    const banco = await obterBancoProva(avaliacaoId, aval.bases);
    const r = await executarNaBase(banco, sql);
    const linhas = linhasDoResultado(r);
    const paraJson = (v) => (typeof v === "bigint" ? Number(v) : v);
    return {
      colunas: linhas.colunas,
      linhas: linhas.linhas.slice(0, 200).map((l) => l.map(paraJson)),
      erro: null,
    };
  } catch (erro) {
    return {colunas: [], linhas: [], erro: erro.message};
  }
});
