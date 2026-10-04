// Teste isolado das estatísticas da aba Evolução do Aluno
// (extrai as funções puras do professorTech.js e valida sem navegador)
const fs = require('fs');
const src = fs.readFileSync('js/professorTech/professorTech.js', 'utf-8');

function extrair(nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`nao encontrei ${nome}`);
    let i = src.indexOf('{', ini), depth = 0, fim = -1;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { fim = j + 1; break; } }
    }
    return src.slice(ini, fim);
}

const codigo = [extrair('estatisticasNotas'), extrair('dataParaInput')].join('\n\n');
const mod = new Function(codigo + '\nreturn { estatisticasNotas, dataParaInput };')();
const { estatisticasNotas, dataParaInput } = mod;

let falhas = 0;
function check(nome, cond, extra) {
    if (cond) console.log(`  ok   ${nome}`);
    else { console.log(`  FAIL ${nome} ${extra ?? ''}`); falhas++; }
}
const perto = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('sem notas');
{
    const r = estatisticasNotas([]);
    check('n = 0', r.n === 0);
    check('media null', r.media === null);
    check('desvio null', r.desvio === null);
    check('faixa sem-dados', r.faixa === 'sem-dados');
    check('slope null', r.slope === null);
}

console.log('\nvalores invalidos sao ignorados');
{
    const r = estatisticasNotas([7, NaN, 9, undefined, Infinity]);
    check('n = 2', r.n === 2, `-> ${r.n}`);
    check('media = 8', perto(r.media, 8), `-> ${r.media}`);
}

console.log('\ncaso feliz');
{
    const r = estatisticasNotas([6, 7, 8, 9]);
    check('media = 7.5', perto(r.media, 7.5), `-> ${r.media}`);
    check('min = 6', r.min === 6);
    check('max = 9', r.max === 9);
    // desvio populacional de [6,7,8,9] = sqrt(1.25)
    check('desvio = 1.118', perto(r.desvio, Math.sqrt(1.25)), `-> ${r.desvio}`);
    check('faixa baixa (<1.5)', r.faixa === 'baixa', `-> ${r.faixa}`);
    // reta perfeitamente crescente: slope = 1 por avaliacao
    check('slope = +1', perto(r.slope, 1), `-> ${r.slope}`);
}

console.log('\nprogressao');
{
    const subindo = estatisticasNotas([5, 6, 7, 8]);
    const caindo = estatisticasNotas([8, 7, 6, 5]);
    const parado = estatisticasNotas([7, 7, 7, 7]);
    check('subindo slope > 0', subindo.slope > 0, `-> ${subindo.slope}`);
    check('caindo slope < 0', caindo.slope < 0, `-> ${caindo.slope}`);
    check('estavel slope = 0', perto(parado.slope, 0), `-> ${parado.slope}`);
    check('estavel desvio = 0', perto(parado.desvio, 0), `-> ${parado.desvio}`);
    const uma = estatisticasNotas([7]);
    check('nota unica slope null', uma.slope === null);
}

console.log('\nfaixas de dispersao');
{
    check('baixa (<1.5)', estatisticasNotas([7, 7.2, 6.8, 7.1]).faixa === 'baixa');
    check('media (1.5-2.5)', estatisticasNotas([5, 6, 8, 9]).faixa === 'media', `-> ${estatisticasNotas([5, 6, 8, 9]).faixa}`);
    check('alta (>2.5)', estatisticasNotas([1, 5, 9, 10]).faixa === 'alta', `-> ${estatisticasNotas([1, 5, 9, 10]).faixa}`);
}

console.log('\nfronteiras das faixas (n=2: desvio = |b-a|/2)');
{
    const exato15 = estatisticasNotas([5, 8]);
    check('desvio 1.50 -> media', perto(exato15.desvio, 1.5) && exato15.faixa === 'media', `-> ${exato15.desvio}/${exato15.faixa}`);
    const abaixo15 = estatisticasNotas([5, 7.99]);
    check('desvio 1.495 -> baixa', abaixo15.faixa === 'baixa', `-> ${abaixo15.faixa}`);

    const exato25 = estatisticasNotas([2.5, 7.5]);
    check('desvio 2.50 -> alta', perto(exato25.desvio, 2.5) && exato25.faixa === 'alta', `-> ${exato25.desvio}/${exato25.faixa}`);
    const abaixo25 = estatisticasNotas([2.5, 7.49]);
    check('desvio 2.495 -> media', abaixo25.faixa === 'media', `-> ${abaixo25.faixa}`);
}

console.log('\ndataParaInput nao escorrega de fuso');
{
    const d = new Date(2026, 0, 5, 23, 59); // 5 de janeiro, fim do dia
    check('5/1/2026', dataParaInput(d) === '2026-01-05', `-> ${dataParaInput(d)}`);
    const d2 = new Date(2026, 11, 31, 0, 5);
    check('31/12/2026', dataParaInput(d2) === '2026-12-31', `-> ${dataParaInput(d2)}`);
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);