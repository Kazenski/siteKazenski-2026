// Teste isolado da lógica de absenteísmo (extraída do professorTech.js)
const fs = require('fs');
const src = fs.readFileSync('js/professorTech/professorTech.js', 'utf-8');

function extrair(nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`não encontrei ${nome}`);
    let i = src.indexOf('{', ini), depth = 0, fim = -1;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { fim = j + 1; break; } }
    }
    return src.slice(ini, fim);
}

const REGRAS_AUSENTISMO = { SEQUENCIA: 5, ALTERNADAS: 7 };
const codigo = [
    extrair('normalizarStatusPresenca'),
    extrair('analisarAusentismo'),
    extrair('formatarDatasFalta'),
    extrair('textoDiagnostico')
].join('\n\n');
const mod = new Function('REGRAS_AUSENTISMO', codigo + '\nreturn { analisarAusentismo, normalizarStatusPresenca, formatarDatasFalta, textoDiagnostico };')(REGRAS_AUSENTISMO);
const { analisarAusentismo } = mod;

let falhas = 0;
function check(nome, cond, extra) {
    if (cond) console.log(`  ok   ${nome}`);
    else { console.log(`  FAIL ${nome} ${extra ?? ''}`); falhas++; }
}
const A = (n) => Array(n).fill('ausente');
const P = (n) => Array(n).fill('presente');
const seq = (...parts) => parts.flatMap(p => p.map(s => ({ status: s, data: null })));

console.log('normalização de status');
check("'falta' vira ausente", mod.normalizarStatusPresenca('falta') === 'ausente');
check("'ausente' mantido", mod.normalizarStatusPresenca('ausente') === 'ausente');
check("'justificado' mantido", mod.normalizarStatusPresenca('justificado') === 'justificado');
check("vazio = sem registro", mod.normalizarStatusPresenca('') === 'sem-registro');

console.log('\ncálculo básico');
{
    const r = analisarAusentismo(seq(A(3), P(2), A(1)));
    check('total = 4', r.total === 4, `-> ${r.total}`);
    check('presencas = 2', r.presencas === 2, `-> ${r.presencas}`);
    check('registradas = 6', r.registradas === 6, `-> ${r.registradas}`);
    check('maior sequencia = 3', r.maxSequencia === 3, `-> ${r.maxSequencia}`);
    check('blocos = 2', r.blocos === 2, `-> ${r.blocos}`);
    check('sem alerta', r.critico === false);
}

console.log('\nregra: 5 faltas seguidas');
{
    const r = analisarAusentismo(seq(P(2), A(4), P(1)));
    check('4 seguidas NAO alerta', r.critico === false, `-> seq=${r.maxSequencia}`);
    check('alertaSequencial false', r.alertaSequencial === false);
}
{
    const r = analisarAusentismo(seq(P(2), A(5), P(1)));
    check('5 seguidas ALERTA', r.critico === true);
    check('alertaSequencial true', r.alertaSequencial === true);
    check('maxSequencia = 5', r.maxSequencia === 5, `-> ${r.maxSequencia}`);
}
{
    const r = analisarAusentismo(seq(P(1), A(9)));
    check('9 seguidas ALERTA', r.critico === true && r.maxSequencia === 9);
}

console.log('\nregra: 7 faltas alternadas');
{
    const r = analisarAusentismo(seq(P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1)));
    check('6 alternadas NAO alerta', r.alertaAlternado === false, `-> blocos=${r.blocos}`);
}
{
    const r = analisarAusentismo(seq(P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1)));
    check('7 alternadas ALERTA', r.alertaAlternado === true, `-> blocos=${r.blocos}`);
    check('maxSequencia = 1', r.maxSequencia === 1, `-> ${r.maxSequencia}`);
    check('nao dispara sequencial', r.alertaSequencial === false);
    check('critico true', r.critico === true);
}
{
    // 7 blocos intercalados mesmo com algumas duplas: A1 P A2 P A1 P A1 P A1 P A1 P A1
    const r = analisarAusentismo(seq(A(1), P(1), A(2), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1)));
    check('7 blocos com duplas ALERTA', r.alertaAlternado === true, `-> blocos=${r.blocos}`);
    check('maxSequencia = 2', r.maxSequencia === 2, `-> ${r.maxSequencia}`);
}

console.log('\nreset por justificativa');
{
    const r = analisarAusentismo(seq(A(3), [{ status: 'justificado', data: null }], A(3)));
    check('justificado quebra a sequencia', r.maxSequencia === 3, `-> ${r.maxSequencia}`);
    check('nao alerta com 3+just+3', r.critico === false);
    check('total conta so ausentes', r.total === 6, `-> ${r.total}`);
}

console.log('\nreset do APOIA (aulas anteriores ignoradas)');
{
    // 6 faltas antes do corte + presencas depois => ignoradas no filtro
    const antes = seq(A(3), A(3));
    const depois = seq(P(5));
    const filtrado = antes.concat(depois).slice(6); // equivale a filtrar por data
    const r = analisarAusentismo(filtrado);
    check('apos corte nao ha faltas', r.total === 0, `-> ${r.total}`);
    check('sem alerta apos reset', r.critico === false);
}

console.log('\naluno sem registro algum');
{
    const r = analisarAusentismo([{ status: undefined, data: null }]);
    check('registradas = 0', r.registradas === 0);
    check('pct = 0 (sem NaN)', r.pctPresenca === 0, `-> ${r.pctPresenca}`);
}

console.log('\nlista vazia');
{
    const r = analisarAusentismo([]);
    check('total = 0', r.total === 0);
    check('pct = 0', r.pctPresenca === 0);
    check('sem erro', r.critico === false);
}

console.log('\ndata de corte não vaza para trás');
{
    const d = (n) => ({ status: 'ausente', data: new Date(2026, 2, n) });
    const p = (n) => ({ status: 'presente', data: new Date(2026, 2, n) });
    const r = analisarAusentismo([d(2), d(3), p(4), d(5), { status: 'justificado', data: new Date(2026, 2, 6) }, d(7)]);
    check('total = 4', r.total === 4, `-> ${r.total}`);
    check('4 datas coletadas', r.datasFalta.length === 4, `-> ${r.datasFalta.length}`);
    check('ultimaFalta = dia 7', r.ultimaFalta.getDate() === 7, `-> ${r.ultimaFalta}`);
    check('justificado NAO entra como falta', r.datasFalta.every(x => x.getDate() !== 6));
    check('3 blocos de falta', r.sequencias.length === 3, `-> ${r.sequencias.length}`);
    check('bloco 1 tem 2 datas', r.sequencias[0].length === 2, `-> ${r.sequencias[0].length}`);
    check('bloco 3 tem 1 data', r.sequencias[2].length === 1);
}

console.log('\nsequencias fecham no fim da lista');
{
    const d = (n) => ({ status: 'ausente', data: new Date(2026, 2, n) });
    const r = analisarAusentismo([d(1), d(2)]);
    check('1 bloco mesmo sem presenca depois', r.sequencias.length === 1, `-> ${r.sequencias.length}`);
    check('bloco com 2 datas', r.sequencias[0].length === 2);
    check('ultimaFalta = dia 2', r.ultimaFalta.getDate() === 2);
}

console.log('\nsem data: nao quebra e nao inventa data');
{
    const r = analisarAusentismo(seq(A(3)));
    check('3 faltas', r.total === 3);
    check('nenhuma data (todas null)', r.datasFalta.every(x => x === null), `-> ${r.datasFalta.length}`);
    check('ultimaFalta null', r.ultimaFalta === null);
}

console.log('\nformatarDatasFalta');
{
    const fmt = mod.formatarDatasFalta;
    check('vazio -> "-"', fmt([]) === '-');
    check('null -> "-"', fmt(null) === '-');
    check('filtra nulls', fmt([null, new Date(2026, 2, 5)]) === '05/03', `-> ${fmt([null, new Date(2026, 2, 5)])}`);
    check('dois dias', fmt([new Date(2026, 2, 5), new Date(2026, 2, 6)]) === '05/03, 06/03');
    const muitos = Array.from({ length: 20 }, (_, i) => new Date(2026, 2, i + 1));
    check('limita e mostra resto', fmt(muitos, 3).endsWith('+17'), `-> ${fmt(muitos, 3)}`);
    check('aceita Timestamp numérico', fmt([new Date(1772582400000)]) === '03/03', `-> ${fmt([new Date(1772582400000)])}`);
}

console.log('\ntextoDiagnostico');
{
    const t = mod.textoDiagnostico;
    const seq5 = analisarAusentismo(seq(A(6)));
    check('5 seguidas', t(seq5) === '6 faltas seguidas (limite: 5)', `-> ${t(seq5)}`);
    const alt7 = analisarAusentismo(seq(A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1)));
    check('7 alternadas', t(alt7) === '7 faltas alternadas (limite: 7)', `-> ${t(alt7)}`);
    const ambos = analisarAusentismo(seq(A(6), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1), P(1), A(1)));
    check('os dois juntos', t(ambos) === '6 faltas seguidas (limite: 5) e 7 faltas alternadas (limite: 7)', `-> ${t(ambos)}`);
    const nenhum = analisarAusentismo(seq(P(4)));
    check('sem alerta mostra total', t(nenhum) === '0 faltas', `-> ${t(nenhum)}`);
}

console.log('\ngetter critico coerente');
{
    const r = analisarAusentismo(seq(A(6)));
    check('critico true', r.critico === true);
    check('ambos os flags ligados', r.alertaSequencial === true && r.alertaAlternado === false);
    const s = analisarAusentismo(seq(P(3)));
    check('sem alerta: critico false', s.critico === false);
    check('sem alerta: datas vazias', s.datasFalta.length === 0 && s.ultimaFalta === null);
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
