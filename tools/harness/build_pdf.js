// Harness do PDF de frequência: extrai o bloco REAL de desenho de
// jsPDF/autoTable do professorTech.js e o executa contra as libs de CDN,
// com dados fictícios. Valida o visual/config sem depender de login.
const fs = require('fs');
const path = require('path');

const repo = process.argv[2] || '.';
const out = process.argv[3] || path.join(__dirname, 'harness_pdf.html');
const src = fs.readFileSync(path.join(repo, 'js/professorTech/professorTech.js'), 'utf-8');

// Bloco: da criação do pdf até o primeiro pdf.save (inclusive)
const ini = src.indexOf('        const totalFaltas = rows.reduce');
const fim = src.indexOf('        pdf.save(nomeArquivo);') + '        pdf.save(nomeArquivo);'.length;
if (ini < 0 || fim < 0) throw new Error('nao localizei o bloco do PDF');
let bloco = src.slice(ini, fim);
// remove indentacao de 8 espacos para deixar no mesmo nivel do harness
bloco = bloco.split('\n').map(l => l.startsWith('        ') ? l.slice(8) : l).join('\n');

const helpers = ['normalizarStatusPresenca', 'analisarAusentismo', 'renderAlertasAusentismo', 'corPctPresenca', 'criarJsPDF'];
function extrair(nome) {
    const i = src.indexOf(`function ${nome}(`);
    let j = src.indexOf('{', i), depth = 0, fim2 = -1;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') { depth--; if (depth === 0) { fim2 = k + 1; break; } }
    }
    return src.slice(i, fim2);
}

const harness = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Harness PDF Matriz</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js"></script>
</head>
<body>
<p id="pdf-msg" class="text-blue-400">aguardando</p>
<div id="out"></div>
<script>
const erros = [];
window.onerror = (m,s,l,c,e) => erros.push(String(m)+' @'+l+':'+c);
const REGRAS_AUSENTISMO = { SEQUENCIA: 5, ALTERNADAS: 7 };
${helpers.map(extrair).join('\n\n')}

function escapeHTML(s){ return String(s); }
const state = { cache: { disciplinesMap: new Map([['mat','Matemática'],['por','Português'],['his','História']]) } };
const school = 'EE Prof. Kazenski';
const els = { pdfMsg: document.getElementById('pdf-msg') };

function gerar(opts) {
  const { classId, disciplineId, cols, rows, startStr, endStr, emAlerta } = opts;
  try {
${bloco}
    return { ok: true };
  } catch (e) {
    erros.push('gerarPDF: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// interceptedor de download para inspecionar o PDF gerado
const baixados = [];
window.jspdf.jsPDF.API.save = function (nome) { baixados.push({ nome, paginas: this.internal.getNumberOfPages(), bytes: this.output('arraybuffer').byteLength }); };

function mkAlunos(n, cols) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = {
      nome: 'Aluno ' + String(i + 1).padStart(2, '0') + (i % 3 === 0 ? ' Nome Muito Longo Para Testar Truncamento da Coluna' : ' Silva'),
      cells: cols.map((_, j) => {
        const padrao = (i * 7 + j * 3) % 10;
        return padrao < 5 ? 'P' : padrao < 8 ? 'F' : padrao === 8 ? 'J' : '·';
      })
    };
    const seq = r.cells.map(c => ({ status: c === 'F' ? 'ausente' : c === 'P' ? 'presente' : c === 'J' ? 'justificado' : undefined, data: null }));
    r.analise = analisarAusentismo(seq);
    out.push(r);
  }
  return out;
}

const relatorio = [];
function cenario(nome, qtdCols, qtdAlunos, opts = {}) {
  const cols = Array.from({ length: qtdCols }, (_, i) => ({ label: String((i % 28) + 1).padStart(2,'0') + '/' + String(((i * 3) % 12) + 1).padStart(2,'0'), regs: {} }));
  const rows = mkAlunos(qtdAlunos, cols);
  const r = gerar({ classId: '7A', disciplineId: 'mat', cols, rows, startStr: '2026-08-01', endStr: '2026-09-30', emAlerta: rows.filter(x => x.analise.critico) });
  relatorio.push({ cenario: nome, ...r, paginas: baixados[baixados.length-1]?.paginas, nomeArquivo: baixados[baixados.length-1]?.nome, bytes: baixados[baixados.length-1]?.bytes, criticos: rows.filter(x=>x.analise.critico).length });
}

cenario('caso pequeno (6 aulas, 4 alunos)', 6, 4);
cenario('12 aulas, 20 alunos', 12, 20);
cenario('25 aulas, 40 alunos (multipagina)', 25, 40);
cenario('sem alunos (body vazio)', 8, 0);
cenario('1 aluno so', 10, 1);
cenario('muitas aulas (45 colunas)', 45, 8);
cenario('nome de disciplina com acento', 12, 6);

// --- conferencia de conteudo: gera sem compressao e procura os textos-chave ---
let conteudo = null;
try {
  const cols = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1).padStart(2,'0') + '/09', regs: {} }));
  const rows = mkAlunos(6, cols);
  const real = window.jspdf.jsPDF;
  const Ctor = function (opts) { return new real(Object.assign({ compress: false }, opts)); };
  window.jspdf.jsPDF = Ctor; window.jsPDF = Ctor;
  let capturado = null;
  const orig = real.API.save;
  real.API.save = function () { capturado = this.output(); };
  gerar({ classId: '7A', disciplineId: 'mat', cols, rows, startStr: '2026-08-01', endStr: '2026-09-30', emAlerta: rows.filter(x => x.analise.critico) });
  real.API.save = orig;
  const d = capturado || '';
  const procurar = (rot) => ({
    presente: d.includes(rot),
    ocorrencias: d.split(rot).length - 1
  });
  conteudo = {
    bytes: d.length,
    titulo: procurar('MATRIZ DE FREQU'),
    escola: procurar('Escola:'),
    periodo: procurar('Período:') || procurar('Periodo:'),
    legendaPresente: procurar('Presente'),
    legendaFalta: procurar('Falta'),
    legendaJustificado: procurar('Justificado'),
    legendaSemRegistro: procurar('Sem registro'),
    rodape: procurar('Página'),
    colunasP: d.split('(P)').length - 1,
    cores: {
      preenchimento: [...new Set(d.match(/[\\d.]+ [\\d.]+ [\\d.]+ rg/g) || [])],
      traco: [...new Set(d.match(/[\\d.]+ [\\d.]+ [\\d.]+ RG/g) || [])]
    }
  };
} catch (e) { erros.push('conteudo: ' + e.message); }

window.__RESULTADO__ = { relatorio, erros, conteudo };
</script>
</body></html>`;

fs.writeFileSync(out, harness, 'utf-8');
console.log('harness PDF gerado em', out, '-', harness.length, 'bytes');