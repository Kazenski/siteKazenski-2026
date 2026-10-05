/*
 * test_filtros_caderno.js
 * -----------------------
 * Testa o filtro rápido do Caderno Digital (Todas / Fixadas / Recentes).
 *
 * IMPORTANTE: o bloco de código é EXTRAÍDO de `js/alunoTech/perfilTech.js`
 * e executado num sandbox — não copiamos a lógica. Se alguém editar o
 * `renderNotes` e quebrar o filtro, este teste quebra junto.
 *
 * Rode: node tools/test_filtros_caderno.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'alunoTech', 'perfilTech.js');
const src = fs.readFileSync(SRC, 'utf8');

let ok = 0;
let falhas = 0;

function okCase(nome, cond, extra = '') {
  if (cond) { ok++; console.log(`  ok   ${nome}`); }
  else { falhas++; console.log(`  FALHA ${nome} ${extra}`); }
}

function extrair(inicio, fim) {
  const a = src.indexOf(inicio);
  if (a < 0) throw new Error(`não encontrei o início: ${inicio}`);
  const b = src.indexOf(fim, a);
  if (b < 0) throw new Error(`não encontrei o fim: ${fim}`);
  return src.slice(a, b + fim.length);
}

// ------------------------------------------------- extração do fonte real
const COD_MS = extrair('function msDaNota(n)', '\n}');
const COD_FILTRO = extrair(
  'let visiveis = filtered;',
  'const paginated = visiveis.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);'
);

const msDaNota = new Function(`${COD_MS}\nreturn msDaNota;`)();

const DIA = 24 * 60 * 60 * 1000;
const JANELA = 7 * DIA;
const AGORA = Date.now();

/**
 * Executa o bloco real do filtro. `notas` entra como `filtered`.
 * Devolve os IDs visíveis, na ordem final (após filtro + ordenação).
 */
function visiveis(notas, filtro, itensPorPagina = 100) {
  const corpo = `
    let currentPage = 1;
    ${COD_FILTRO}
    return { ids: paginated.map(n => n.id), totalPages };
  `;
  const fn = new Function('filtered', 'currentNoteFilter', 'itemsPerPage',
    'RECENT_WINDOW_MS', 'msDaNota', corpo);
  return fn(notas, filtro, itensPorPagina, JANELA, msDaNota);
}

function criarNota(id, { favorita = false, diasAtras = 30, userId = 'eu' } = {}) {
  return {
    id,
    titulo: 'nota ' + id,
    conteudo: 'conteudo',
    favorita,
    userId,
    updatedAt: { toMillis: () => AGORA - diasAtras * DIA },
  };
}

// ------------------------------------------------------------------ testes
console.log('msDaNota (normaliza updatedAt)');
{
  okCase('Timestamp do Firestore (.toMillis)', msDaNota({ updatedAt: { toMillis: () => 1234 } }) === 1234);
  okCase('number puro', msDaNota({ updatedAt: 99 }) === 99);
  okCase('sem updatedAt', msDaNota({}) === 0);
  okCase('updatedAt nulo', msDaNota({ updatedAt: null }) === 0);
  okCase('objeto sem toMillis', msDaNota({ updatedAt: {} }) === 0);
}

console.log('\nFiltro "Todas"');
{
  const notas = [
    criarNota('a', { favorita: true }),
    criarNota('b', { favorita: false }),
    criarNota('c', { favorita: true, diasAtras: 1 }),
  ];
  const { ids } = visiveis(notas, 'all');
  okCase('mantém todas as notas', ids.length === 3, `obtido ${JSON.stringify(ids)}`);
  okCase('fixadas vêm primeiro', ids[0] === 'a' && ids[1] === 'c', `obtido ${JSON.stringify(ids)}`);
}

console.log('\nFiltro "Fixadas"');
{
  const notas = [
    criarNota('a', { favorita: true }),
    criarNota('b', { favorita: false }),
    criarNota('c', { favorita: true, diasAtras: 1 }),
  ];
  const { ids } = visiveis(notas, 'pinned');
  okCase('só retorna notas fixadas', ids.length === 2, `obtido ${JSON.stringify(ids)}`);
  okCase('exclui as não fixadas', !ids.includes('b'), `obtido ${JSON.stringify(ids)}`);
}

console.log('\nFiltro "Fixadas" sem nenhuma fixada');
{
  const { ids } = visiveis([criarNota('a'), criarNota('b')], 'pinned');
  okCase('lista vazia', ids.length === 0, `obtido ${JSON.stringify(ids)}`);
}

console.log('\nFiltro "Recentes" (janela de 7 dias)');
{
  const notas = [
    criarNota('hoje', { diasAtras: 0 }),
    criarNota('ontem', { diasAtras: 1 }),
    criarNota('semana', { diasAtras: 6 }),
    criarNota('velha', { diasAtras: 30 }),
  ];
  const { ids } = visiveis(notas, 'recent');
  okCase('mantém só o que está dentro da janela', ids.length === 3, `obtido ${JSON.stringify(ids)}`);
  okCase('exclui nota antiga', !ids.includes('velha'), `obtido ${JSON.stringify(ids)}`);
  okCase('ordena da mais nova para a mais antiga',
    ids[0] === 'hoje' && ids[1] === 'ontem' && ids[2] === 'semana', `obtido ${JSON.stringify(ids)}`);
}

console.log('\nFiltro "Recentes" com nada recente');
{
  const { ids } = visiveis(
    [criarNota('a', { diasAtras: 40 }), criarNota('b', { diasAtras: 90 })], 'recent');
  okCase('lista vazia', ids.length === 0, `obtido ${JSON.stringify(ids)}`);
}

console.log('\nFiltro "Recentes" é independente de "favorita"');
{
  const notas = [
    criarNota('fixada-antiga', { favorita: true, diasAtras: 60 }),
    criarNota('normal-nova', { favorita: false, diasAtras: 1 }),
  ];
  const { ids } = visiveis(notas, 'recent');
  okCase('não traz fixada antiga', !ids.includes('fixada-antiga'), `obtido ${JSON.stringify(ids)}`);
  okCase('traz normal nova', ids.includes('normal-nova'), `obtido ${JSON.stringify(ids)}`);
}

console.log('\nPaginação continua valendo com o filtro');
{
  const notas = Array.from({ length: 25 }, (_, i) =>
    criarNota('n' + i, { favorita: i % 2 === 0 }));
  const todas = visiveis(notas, 'all', 12);
  const fixadas = visiveis(notas, 'pinned', 12);
  okCase('"Todas" pagina em 12 (25 notas -> 3 páginas)',
    todas.ids.length === 12 && todas.totalPages === 3,
    `ids=${todas.ids.length} paginas=${todas.totalPages}`);
  okCase('"Fixadas" também pagina', fixadas.totalPages === 2,
    `ids=${fixadas.ids.length} paginas=${fixadas.totalPages}`);
}

console.log('\nO array original não é reordenado');
{
  const notas = [criarNota('a'), criarNota('b', { favorita: true })];
  const antes = notas.map(n => n.id).join(',');
  visiveis(notas, 'all');
  okCase('ordem original preservada', notas.map(n => n.id).join(',') === antes,
    `antes=${antes} depois=${notas.map(n => n.id).join(',')}`);
}

console.log('');
if (falhas > 0) {
  console.log(`${falhas} FALHA(S) — filtro do caderno quebrado`);
  process.exit(1);
}
console.log(`TODOS OS ${ok} TESTES PASSARAM`);