// Harness do Encaminhamento em Lote (APOIA): extrai as funções REAIS do
// professorTech.js e roda contra o jsPDF/autoTable de CDN, com dados fictícios.
// Cobre o PDF, a tabela de preview e as duas telas de sorteios.
const fs = require('fs');
const path = require('path');

const repo = process.argv[2] || '.';
const out = process.argv[3] || path.join(__dirname, 'harness_apoia.html');
const src = fs.readFileSync(path.join(repo, 'js/professorTech/professorTech.js'), 'utf-8');

function extrair(nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`nao encontrei ${nome}`);
    const j = src.indexOf('{', i);
    let depth = 0, fim = -1;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') { depth--; if (depth === 0) { fim = k + 1; break; } }
    }
    return src.slice(i, fim);
}

const helpers = [
    'normalizarStatusPresenca', 'analisarAusentismo', 'formatarDatasFalta',
    'textoDiagnostico', 'parecerEncaminhamento', 'criarJsPDF', 'dataParaInput',
    'pintarRodapePaginas', 'gerarPdfEncaminhamento', 'renderListaEncaminhamento',
    'renderJaSorteados', 'renderExclusoesGrupos'
].map(extrair).join('\n\n');

const harness = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Harness APOIA + Sorteios</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js"></script>
</head>
<body>
<div id="apoia-encaminhar-sub"></div>
<table><tbody id="apoia-encaminhar-body"></tbody></table>
<div id="sorteio-ja-sorteados"></div>
<span id="sorteio-pendentes"></span>
<div id="sorteio-pendentes-lista"></div>
<div id="grupos-exclusoes"></div>
<div id="grupos-resumo"></div>
<div id="group-size" value="3"></div>

<script>
const erros = [];
const avisosLargura = [];
let cenarioAtual = 'inicio';
window.onerror = (m,s,l,c,e) => erros.push(String(m)+' @'+l+':'+c);
const origErr = console.error.bind(console);
console.error = (...a) => { const t = a.join(' '); if (/could not fit page/.test(t)) avisosLargura.push(cenarioAtual + ': ' + t); else origErr(...a); };

// Registra quantas páginas a tabela ocupou, para saber se o bloco de
// assinaturas depois precisou criar uma página nova.
const _API = window.jspdf.jsPDF.API;
const _origAutoTable = _API.autoTable;
let paginasDaTabela = 0;
_API.autoTable = function (...a) {
  const r = _origAutoTable.apply(this, a);
  paginasDaTabela = this.internal.getNumberOfPages();
  return r;
};
const REGRAS_AUSENTISMO = { SEQUENCIA: 5, ALTERNADAS: 7 };

const state = {
  filters: { classId: '7A', disciplineId: 'mat', quarter: '2' },
  cache: { students: [], disciplinesMap: new Map([['mat','Matemática']]) },
  sorteioIndividual: { pool: [], sorteados: [], winner: null },
  sorteioGrupos: { excluidos: new Set(), classId: '7A' }
};
let apoiaEncaminharPendente = [];
const els = {
  apoiaEncaminharSub: document.getElementById('apoia-encaminhar-sub'),
  apoiaEncaminharBody: document.getElementById('apoia-encaminhar-body'),
  btnApoiaConfirmar: { disabled: false },
  sorteioJaSorteados: document.getElementById('sorteio-ja-sorteados'),
  sorteioPendentes: document.getElementById('sorteio-pendentes'),
  sorteioPendentesLista: document.getElementById('sorteio-pendentes-lista'),
  gruposExclusoes: document.getElementById('grupos-exclusoes'),
  gruposResumo: document.getElementById('grupos-resumo'),
  groupSizeInput: document.getElementById('group-size')
};
function escapeHTML(s){ return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }
function renderAlertasAusentismo(a){
  const p = [];
  if (a.alertaSequencial) p.push('<b>SEQ</b>');
  if (a.alertaAlternado) p.push('<b>ALT</b>');
  return p.join(' ');
}

${helpers}

// ---------- fixtures ----------
function mkData(dia, status){ return { data: new Date(2026, 2, dia) , status }; }
function aluno(nome, faltas) {
  return { nome, analise: analisarAusentismo(faltas) };
}
const relatorio = [];

/** Descomprime os streams do PDF e devolve o texto, para conferir o rodapé. */
async function textoDoPdf(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const dec = new TextDecoder('latin1');
  const bruto = dec.decode(buf);
  const partes = [];
  // (?<!end) evita casar o "stream" dentro de "endstream", que criaria
  // streams fantasmas e poderia engolir conteudo real.
  const re = /(?<!end)stream\\r?\\n/g;
  let m;
  while ((m = re.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf('endstream', ini);
    if (fim < 0) continue;
    const bytes = buf.slice(ini, fim);
    try {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      partes.push(dec.decode(await new Response(st).arrayBuffer()));
    } catch (e) {
      partes.push(dec.decode(bytes));
    }
  }
  return partes.join(String.fromCharCode(10));
}

async function cenarioPdf(nome, lista, ctx = {}) {
  cenarioAtual = nome;
  const c = { escolaNome: 'EE Prof. Kazenski', turmaId: '7A', turmaNome: '7º A', disciplinaNome: 'Matemática', trimestre: '2', ...ctx };
  const orig = window.jspdf.jsPDF.API.save;
  let cap = null;
  window.jspdf.jsPDF.API.save = function (nome) {
    cap = { nome, paginas: this.internal.getNumberOfPages(), buf: this.output('arraybuffer') };
  };
  try {
    const info = gerarPdfEncaminhamento(lista, c);
    const texto = await textoDoPdf(cap.buf);

    // Todo PDF tem que trazer o rodapé de cada página, com o total correto.
    const faltando = [];
    for (let i = 1; i <= cap.paginas; i++) {
      if (!texto.includes('Página ' + i + ' de ' + cap.paginas)) faltando.push(i);
    }
    // "Página 1 de 1" num documento de N>1 páginas é o bug clássico do
    // didDrawPage: prova que o rodapé foi pintado antes do total existir.
    const totalFalso = cap.paginas > 1 && /Página 1 de 1[^0-9]/.test(texto);

    relatorio.push({
      harness: 'pdf', cenario: nome,
      ok: faltando.length === 0 && !totalFalso,
      ...info, paginasReal: cap.paginas, bytes: cap.buf.byteLength, arquivo: cap.nome,
      rodapeOK: cap.paginas - faltando.length, rodapeEsperado: cap.paginas,
      rodapeTotalErrado: totalFalso,
      paginasTabela: paginasDaTabela, paginasExtra: cap.paginas - paginasDaTabela
    });
  } catch (e) {
    relatorio.push({ harness: 'pdf', cenario: nome, ok: false, erro: e.message });
  } finally {
    window.jspdf.jsPDF.API.save = orig;
  }
}

const A = (n, ini) => Array.from({length: n}, (_, i) => mkData((ini||1) + i, 'ausente'));
const P = (n, ini) => Array.from({length: n}, (_, i) => mkData((ini||1) + i, 'presente'));
const alt = (k, ini) => Array.from({length: k}, (_, i) => [mkData((ini||1) + i*2, 'ausente'), mkData((ini||1) + i*2 + 1, 'presente')]).flat();

const listaPequena = [aluno('Maria Silva Santos', A(6, 2)), aluno('João Pereira', alt(8, 1))];
const listaMedia  = Array.from({length: 14}, (_, i) => aluno('Aluno Teste ' + String(i+1).padStart(2,'0'), A(5 + (i % 4), 1)));
const listaGrande = Array.from({length: 45}, (_, i) => aluno('Nome Bem Longo Para Testar Quebra de Linha ' + i, alt(7, 1)));

async function rodarCenarios() {
await cenarioPdf('vazio (deve falhar)', []);
await cenarioPdf('1 aluno, 5 seguidas', listaPequena.slice(0, 1));
await cenarioPdf('2 alunos (1 seq + 1 alternado)', listaPequena);
await cenarioPdf('14 alunos (1 pagina)', listaMedia);
await cenarioPdf('45 alunos (multipagina)', listaGrande);
await cenarioPdf('55 alunos', Array.from({length: 55}, (_, i) => aluno('Aluno ' + (i+1), alt(7, 1))));
// 24 alunos com linhas altas: a tabela termina em y=786 (quase o limite de
// 790) e o bloco de assinaturas precisa de uma página nova.
await cenarioPdf('24 alunos (assinaturas em pagina nova)', Array.from({length: 24}, (_, i) => aluno('Nome Longo ' + (i+1), alt(9 + (i % 7), 1))));

// Procura um tamanho de lista em que o bloco de assinaturas precise de uma
// página nova (a tabela termina rente ao fim da última página).
// Instrumenta autoTable (não addPage) para saber quantas páginas a tabela
// ocupou: se o PDF final tiver mais, foi o bloco de assinaturas que menambah.
{
  cenarioAtual = 'varredura pagina extra';
  const API = window.jspdf.jsPDF.API;
  const origSave = API.save;
  const tabela = [];

  for (let n = 18; n <= 46; n++) {
    // Listas com muitas faltas geram células de "dias de falta" altas, o que
    // faz as linhas variarem de altura e facilita cair no limite da página.
    const lista = Array.from({ length: n }, (_, i) =>
      aluno('Nome Longo ' + (i + 1), alt(9 + (i % 7), 1)));
    let pag = 0, fimY = 0;
    API.save = function () {
      pag = this.internal.getNumberOfPages();
      fimY = Math.round((this.lastAutoTable && this.lastAutoTable.finalY) || -1);
    };
    try {
      gerarPdfEncaminhamento(lista, { escolaNome: 'E', turmaId: '7A', turmaNome: '7A', disciplinaNome: 'Mat', trimestre: '1' });
      tabela.push({ n, pag, pagTabela: paginasDaTabela, pagExtra: pag - paginasDaTabela, fimY });
    } catch (e) { tabela.push({ n, erro: e.message }); }
  }

  API.save = origSave;

  const comExtra = tabela.filter(x => x.pagExtra > 0);
  relatorio.push({
    harness: 'pdf-extra', cenario: 'varredura 18..46 com linhas altas',
    ok: comExtra.length > 0,
    totalComPaginaExtra: comExtra.length,
    exemplos: comExtra.slice(0, 6),
    maisPertoDoLimite: tabela.filter(x => x.fimY > 0).sort((a, b) => b.fimY - a.fimY).slice(0, 4)
  });
}
await cenarioPdf('nome de disciplina com acento', listaMedia.slice(0,3), { disciplinaNome: 'História/Geografia' });
await cenarioPdf('turma ausente no contexto', listaMedia.slice(0,3), { turmaNome: '', turmaId: '' });

// ---------- preview da tabela ----------
apoiaEncaminharPendente = listaMedia;
try { renderListaEncaminhamento(); relatorio.push({ harness: 'tabela', cenario: '14 alunos', ok: true, linhas: els.apoiaEncaminharBody.querySelectorAll('tr').length, sub: els.apoiaEncaminharSub.textContent, confirmLiberado: !els.btnApoiaConfirmar.disabled }); }
catch (e) { relatorio.push({ harness: 'tabela', cenario: '14 alunos', ok: false, erro: e.message }); }

apoiaEncaminharPendente = [];
try { renderListaEncaminhamento(); relatorio.push({ harness: 'tabela', cenario: 'vazio', ok: true, texto: els.apoiaEncaminharBody.textContent.trim().slice(0, 90), confirmBloqueado: els.btnApoiaConfirmar.disabled }); }
catch (e) { relatorio.push({ harness: 'tabela', cenario: 'vazio', ok: false, erro: e.message }); }

// ---------- sorteios ----------
try {
  state.cache.students = Array.from({length: 8}, (_, i) => ({ id: 'u' + i, nome: 'Aluno ' + (i+1) }));

  // sorteados
  state.sorteioIndividual.pool = state.cache.students.slice(0, 5).map(s => ({id: s.id, nome: s.nome}));
  state.sorteioIndividual.sorteados = [state.cache.students[0], state.cache.students[3]];
  renderJaSorteados();
  const chips = els.sorteioPendentesLista.children.length;
  const nomes = [...els.sorteioPendentesLista.children].map(c => c.textContent.trim().replace(/\\s+/g, ' '));
  relatorio.push({ harness: 'sorteio', cenario: '2 ja sorteados de 8', ok: chips === 2 && !els.sorteioJaSorteados.classList.contains('hidden'), chips, nomes, pendentes: els.sorteioPendentes.textContent, visivel: !els.sorteioJaSorteados.classList.contains('hidden') });

  // nenhum sorteado -> escondido
  state.sorteioIndividual.sorteados = [];
  renderJaSorteados();
  relatorio.push({ harness: 'sorteio', cenario: 'nenhum sorteado', ok: els.sorteioJaSorteados.classList.contains('hidden'), visivel: !els.sorteioJaSorteados.classList.contains('hidden') });

  // pool zerado
  state.sorteioIndividual.pool = []; state.sorteioIndividual.sorteados = [{id:'u1',nome:'X'}];
  renderJaSorteados();
  relatorio.push({ harness: 'sorteio', cenario: 'todos sorteados', ok: els.sorteioPendentes.textContent === 'todos sorteados', texto: els.sorteioPendentes.textContent });

  // exclusoes
  renderExclusoesGrupos();
  const antes = els.gruposExclusoes.querySelectorAll('button').length;
  state.sorteioGrupos.excluidos.add('u0'); state.sorteioGrupos.excluidos.add('u1');
  renderExclusoesGrupos();
  const marcados = els.gruposExclusoes.querySelectorAll('.line-through').length;
  relatorio.push({ harness: 'sorteio', cenario: 'exclusoes', ok: antes === 8 && marcados === 2, chips: antes, marcados, resumo: els.gruposResumo.textContent });

  // exclusoes limpas
  state.sorteioGrupos.excluidos = new Set();
  renderExclusoesGrupos();
  relatorio.push({ harness: 'sorteio', cenario: 'limpo', ok: els.gruposExclusoes.querySelectorAll('.line-through').length === 0, resumo: els.gruposResumo.textContent });

  // sem alunos
  state.cache.students = [];
  renderExclusoesGrupos();
  relatorio.push({ harness: 'sorteio', cenario: 'sem alunos', ok: /Carregue a turma/.test(els.gruposExclusoes.textContent), texto: els.gruposExclusoes.textContent.trim().slice(0,60) });
} catch (e) { relatorio.push({ harness: 'sorteio', cenario: 'erro', ok: false, erro: e.message }); }

// ---------- parecer ----------
try {
  const p = parecerEncaminhamento(listaPequena[0], { turmaNome: '7º A', disciplinaNome: 'Matemática' });
  relatorio.push({ harness: 'parecer', cenario: 'aluno com 6 seguidas', ok: p.includes('Diagnóstico:') && p.includes('Matemática') && p.includes('05/03'), amostra: p.split(String.fromCharCode(10)).slice(0, 3).join(' / ').slice(0, 160) });
} catch (e) { relatorio.push({ harness: 'parecer', cenario: 'erro', ok: false, erro: e.message }); }

}
window.__RESULTADO__ = { relatorio, erros, avisosLargura };
rodarCenarios().catch(e => {
  relatorio.push({ harness: 'pdf', cenario: 'erro fatal', ok: false, erro: e.message });
  window.__RESULTADO__ = { relatorio, erros, avisosLargura };
});
</script>
</body></html>`;

fs.writeFileSync(out, harness, 'utf-8');
console.log('harness APOIA gerado em', out, '-', harness.length, 'bytes');
