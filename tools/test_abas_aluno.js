/*
 * test_abas_aluno.js
 * -----------------
 * Guarda a estrutura das sub-abas do Aluno Tech.
 *
 * Bug que este teste existe para impedir (v1.6.7):
 * o `index.html` tinha `<div <div id="atab-caderno" ...>` e, no fim do
 * bloco, `</div>id="atab-kanban" ...>`. O `<div ` faltante fazia o
 * navegador enxergar `id="atab-kanban" class="...">` como TEXTO na tela
 * e o Kanban inteiro vazava para dentro do container pai — aparecendo em
 * TODAS as abas, inclusive na Visão Geral.
 *
 * O que verificamos:
 *   1. cada `id="atab-*"` existe exatamente uma vez
 *   2. cada `<div id="atab-*"` está realmente precedido por `<div`
 *      (ou seja: é uma tag de verdade, não texto solto)
 *   3. o conteúdo de cada aba é balanceado em <div>
 *   4. nenhum id de elemento aparece em duas abas diferentes
 *   5. nenhum texto literal `id="atab-` vaza para o corpo da página
 *
 * Rode: node tools/test_abas_aluno.js
 */

const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');
const linhas = src.split('\n');

const ABAS = ['geral', 'caderno', 'kanban', 'horario', 'calendario', 'mochila', 'tcg'];

let ok = 0;
let falhas = 0;
function okCase(nome, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok   ${nome}`); }
  else { falhas++; console.log(`  FALHA ${nome} ${extra}`); }
}

function contarDivs(texto) {
  const m = texto.match(/<\/?div\b/gi);
  if (!m) return { abre: 0, fecha: 0 };
  return {
    abre: m.filter(t => !t.startsWith('</')).length,
    fecha: m.filter(t => t.startsWith('</')).length,
  };
}

console.log('1. Cada aba existe exatamente uma vez');
const inicio = {};
ABAS.forEach(t => {
  const re = new RegExp(`id="atab-${t}"`, 'g');
  const n = (src.match(re) || []).length;
  okCase(`atab-${t} aparece 1x`, n === 1, `apareceu ${n}x`);
});

console.log('\n2. Cada atab-* é uma tag de verdade (não texto solto)');
ABAS.forEach(t => {
  // procura uma linha onde o id aparece e confere que ela começa com <div
  const idx = src.indexOf(`id="atab-${t}"`);
  const iniLinha = src.lastIndexOf('\n', idx) + 1;
  const linha = src.slice(iniLinha, src.indexOf('\n', idx));
  const abreTag = /<div\b[^>]*$/.test(linha.slice(0, linha.indexOf(`id="atab-${t}"`)));
  okCase(`atab-${t} começa com <div`, abreTag, `linha: ${linha.trim().slice(0, 70)}`);
  okCase(`atab-${t} não tem "<div <div"`,
    !/<div\s+<div\b/.test(linha), `linha: ${linha.trim().slice(0, 70)}`);
});

console.log('\n3. Conteúdo de cada aba é balanceado em <div>');
{
  // localiza a linha de abertura de cada aba
  ABAS.forEach(t => {
    const i = linhas.findIndex(l => l.includes(`id="atab-${t}"`));
    if (i < 0) { okCase(`atab-${t} localizado`, false); return; }
    inicio[t] = i;
  });

  for (let k = 0; k < ABAS.length - 1; k++) {
    const a = ABAS[k], b = ABAS[k + 1];
    if (inicio[a] === undefined || inicio[b] === undefined) continue;
    const bloco = linhas.slice(inicio[a], inicio[b]).join('\n');
    const { abre, fecha } = contarDivs(bloco);
    okCase(`${a} -> ${b} balanceado (${abre} abre / ${fecha} fecha)`,
      abre === fecha, `delta ${abre - fecha}`);
  }
  // última aba: do seu início até o fim do arquivo
  const ult = ABAS[ABAS.length - 1];
  if (inicio[ult] !== undefined) {
    const bloco = linhas.slice(inicio[ult]).join('\n');
    const { abre, fecha } = contarDivs(bloco);
    // o resto do arquivo contém outras abas/containers; reportamos sem exigir zero
    okCase(`${ult} presente no fim do arquivo`, abre > 0, `abre=${abre} fecha=${fecha}`);
  }
}

console.log('\n4. Nenhum id de elemento vive em duas abas');
{
  const dono = {};
  const dups = [];
  ABAS.forEach(t => {
    if (inicio[t] === undefined) return;
    const prox = ABAS.map(x => inicio[x]).filter(v => v > inicio[t]).sort((a, b) => a - b)[0];
    const bloco = linhas.slice(inicio[t], prox === undefined ? linhas.length : prox).join('\n');
    const ids = [...bloco.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    new Set(ids).forEach(id => {
      if (id.startsWith('atab-')) return;
      if (dono[id] && dono[id] !== t) dups.push(`${id} (${dono[id]} e ${t})`);
      dono[id] = t;
    });
  });
  okCase('nenhum id duplicado entre abas', dups.length === 0, dups.slice(0, 5).join(', '));
}

console.log('\n5. Nenhum id de aba sobrevive no corpo da página como texto');
{
  // o teste real disso é no DOM; aqui checamos o markup-fonte
  const Maus = src.match(/<\/div>\s*id="atab-/g);
  okCase('nenhum `</div>id="atab-` (marca do bug original)',
    !Maus, Maus ? `encontrado: ${Maus[0]}` : '');
  const Maus2 = src.match(/<div\s+<div/g);
  okCase('nenhum `<div <div` (marca do bug original)',
    !Maus2, Maus2 ? `encontrado: ${Maus2[0]}` : '');
}

console.log('\n6. Cada aba tem conteúdo próprio (ids esperados)');
{
  const ESPERADO = {
    geral: ['al-freq-perc', 'al-chart-freq', 'al-avisos-list', 'al-boletim-body', 'al-chart-scatter'],
    caderno: ['al-notebook-list', 'al-notes-list', 'btn-filter-all', 'btn-filter-pinned', 'btn-filter-recent'],
    kanban: ['al-kanban-form', 'al-col-todo', 'al-col-doing', 'al-col-done'],
    horario: ['al-horario-msg'],
    calendario: ['al-cal-grid', 'btn-cal-prev', 'btn-cal-next'],
    mochila: ['al-mochila-itens'],
    tcg: ['tcg-collection-grid'],
  };
  ABAS.forEach(t => {
    if (inicio[t] === undefined) return;
    const prox = ABAS.map(x => inicio[x]).filter(v => v > inicio[t]).sort((a, b) => a - b)[0];
    const bloco = linhas.slice(inicio[t], prox === undefined ? linhas.length : prox).join('\n');
    const faltando = (ESPERADO[t] || []).filter(id => !bloco.includes(`id="${id}"`));
    okCase(`${t} contém seus elementos`, faltando.length === 0, `faltando: ${faltando.join(', ')}`);
  });
}

console.log('\n7. O Kanban NÃO pode estar dentro de outra aba');
{
  const kanbanIds = ['al-col-todo', 'al-col-doing', 'al-col-done', 'al-kanban-form'];
  ABAS.filter(t => t !== 'kanban').forEach(t => {
    if (inicio[t] === undefined || inicio.kanban === undefined) return;
    const bloco = linhas.slice(inicio[t], Math.min(inicio[t] + 4000, inicio.kanban)).join('\n');
    const vazou = kanbanIds.filter(id => bloco.includes(`id="${id}"`));
    okCase(`${t} não contém elementos do Kanban`, vazou.length === 0, `vazou: ${vazou.join(', ')}`);
  });
}

console.log('');
if (falhas > 0) {
  console.log(`${falhas} FALHA(S) — estrutura das abas do Aluno Tech quebrada`);
  process.exit(1);
}
console.log(`TODOS OS ${ok} TESTES PASSARAM`);