// Funções puras para bases CSV usadas em provas SQL (sem dependências).

// Lê CSV no padrão RFC 4180: campos entre aspas, vírgulas e quebras de linha
// dentro de aspas, e aspas escapadas com "".
function lerCsv(texto) {
  const linhas = [];
  let linha = [];
  let campo = "";
  let emAspas = false;
  const s = String(texto ?? "").replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (emAspas) {
      if (c === "\"") {
        if (s[i + 1] === "\"") {
          campo += "\"";
          i++;
        } else {
          emAspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === "\"") {
      emAspas = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => !(l.length === 1 && l[0] === ""));
}

// Gera {colunas, linhas} a partir do texto. A primeira linha é o cabeçalho.
function parsearBase(texto) {
  const [cabecalho, ...dados] = lerCsv(texto);
  if (!cabecalho || cabecalho.length === 0) {
    throw new Error("CSV sem cabeçalho.");
  }
  const colunas = cabecalho.map((c) => c.trim());
  const linhas = dados.map((d) => colunas.map((_, i) => (d[i] ?? "").trim()));
  return {colunas, linhas};
}

const ehInteiro = (v) => /^-?\d+$/.test(v);
const ehNumero = (v) => /^-?\d+(\.\d+)?$/.test(v);
const ehBooleano = (v) => /^(true|false)$/i.test(v);
const ehData = (v) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(v);

// Detecta o tipo SQL de cada coluna olhando todos os valores não vazios.
function inferirTipos(colunas, linhas) {
  return colunas.map((_, i) => {
    const valores = linhas.map((l) => l[i]).filter((v) => v !== "");
    if (valores.length === 0) return "TEXT";
    if (valores.every(ehInteiro)) return "INTEGER";
    if (valores.every(ehNumero)) return "NUMERIC";
    if (valores.every(ehBooleano)) return "BOOLEAN";
    if (valores.every(ehData)) return "TIMESTAMP";
    return "TEXT";
  });
}

// Nome de tabela e coluna seguro: letras, números e underline.
function identificadorSeguro(nome, fallback) {
  const limpo = String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  if (!limpo) return fallback;
  return /^[0-9]/.test(limpo) ? `t_${limpo}` : limpo;
}

// Valor de uma célula para comparação: mesmo formato em qualquer banco.
function normalizarValor(v) {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" || typeof v === "bigint") return String(Number(v));
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return String(Number(v));
  return String(v);
}

// Compara dois resultados {colunas, linhas}. Sem ordem exigida, as linhas são
// ordenadas antes de comparar.
function resultadosIguais(a, b, ordenada) {
  if (a.colunas.length !== b.colunas.length) return false;
  if (a.linhas.length !== b.linhas.length) return false;
  let la = a.linhas.map((l) => JSON.stringify(l.map(normalizarValor)));
  let lb = b.linhas.map((l) => JSON.stringify(l.map(normalizarValor)));
  if (!ordenada) {
    la = la.sort();
    lb = lb.sort();
  }
  return la.every((linha, i) => linha === lb[i]);
}

module.exports = {
  lerCsv,
  parsearBase,
  inferirTipos,
  identificadorSeguro,
  normalizarValor,
  resultadosIguais,
};
