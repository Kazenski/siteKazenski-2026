// Gera um harness HTML que executa os renderizadores REAIS da aba Evolução
// contra o Chart.js, usando dados fictícios. Permite validar os configs dos
// gráficos (que só falham em runtime) sem depender de login.
const fs = require('fs');
const path = require('path');

const repo = process.argv[2] || '.';
const out = process.argv[3] || path.join(__dirname, 'harness_evolucao.html');
const src = fs.readFileSync(path.join(repo, 'js/professorTech/professorTech.js'), 'utf-8');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf-8');

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

// Pega o bloco real da aba no index.html para o harness ter o mesmo DOM
function blocoAba(id) {
    const marker = `id="${id}"`;
    const p = html.indexOf(marker);
    if (p < 0) throw new Error(`aba ${id} nao encontrada`);
    // recua até a tag <div que abre a aba
    const abre = html.lastIndexOf('<div', p);
    // avança contando <div ...> e </div>
    let i = abre, depth = 0, fim = -1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = abre;
    let m;
    while ((m = re.exec(html))) {
        if (m[0] === '</div>') {
            depth--;
            if (depth === 0) { fim = m.index + 6; break; }
        } else {
            // ignora o </div> de divs auto-fechados é inexistente em HTML; conta tudo
            depth++;
        }
    }
    return html.slice(abre, fim);
}

const abas = blocoAba('ptab-evolucao');

const funcoes = [
    'estatisticasNotas', 'corNota', 'corNotaBg', 'mostrarOculto',
    'renderEvolucaoKpis', 'renderEvolucaoProgressao',
    'renderEvolucaoDispersao', 'renderEvolucaoDisciplinas', 'renderEvolucaoTabela'
].map(extrair).join('\n\n');

const harness = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Harness - Evolução do Aluno</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  body { background:#0f172a; color:#e2e8f0; font-family: system-ui, sans-serif; padding:16px; }
  #relatorio { display:flex; flex-direction:column; height:auto; }
</style>
</head>
<body>
<h1 style="font-size:14px">Harness: ${abas.length} bytes de DOM real copiado de index.html</h1>
<div id="wrap">${abas}</div>
<script>
const erros = [];
window.onerror = (m, s, l, c, e) => { erros.push(String(m) + ' @' + l + ':' + c); };
const chartInstances = {};
const els = {
  evolKpis: document.getElementById('evol-kpis'),
  evolAlertas: document.getElementById('evol-alertas'),
  evolTabelaNotas: document.getElementById('evol-tabela-notas'),
};
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

${funcoes}

function dados(qtdDisciplinas, notas, aulas) {
  const nomes = ['Matemática','Português','História','Geografia','Ciências','Artes','Ed. Física','Inglês'];
  const porDisciplina = [];
  for (let d = 0; d < qtdDisciplinas; d++) {
    const brutos = [notas[d][0], notas[d][1], notas[d][2], notas[d][3]].map(v => v === null ? null : v);
    const vals = brutos.filter(v => v !== null);
    porDisciplina.push({
      discId: 'd' + d, nome: nomes[d],
      brutos, vals,
      media: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null
    });
  }
  return { porDisciplina, aulas };
}

function cenario(nome, notas, qtdDisciplinas, aulas) {
  const errosAntes = erros.length;
  const { porDisciplina } = dados(qtdDisciplinas, notas, aulas);
  const itens = [];
  porDisciplina.forEach(d => d.brutos.forEach((b, i) => {
    const v = (b === null || b === undefined || b === '') ? null : parseFloat(b);
    if (Number.isFinite(v)) itens.push({ pos: i, rotulo: 'N'+(i+1), nota: v, disciplina: d.nome });
  }));
  const stats = estatisticasNotas(itens.map(i => i.nota));
  const mediasPos = [0,1,2,3].map(pos => {
    const vals = itens.filter(i => i.pos === pos).map(i => i.nota);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  });
  const progStats = estatisticasNotas(mediasPos.filter(v => v !== null));
  try {
    renderEvolucaoKpis(stats, progStats, porDisciplina);
    renderEvolucaoProgressao(mediasPos, stats);
    renderEvolucaoDispersao(itens, stats);
    renderEvolucaoDisciplinas(porDisciplina);
    renderEvolucaoTabela(porDisciplina);
  } catch (e) {
    erros.push(nome + ' -> ' + e.message);
  }
  return { cenario: nome, errosNovos: erros.length - errosAntes,
           media: stats.media === null ? null : +stats.media.toFixed(2),
           desvio: stats.desvio === null ? null : +stats.desvio.toFixed(2),
           faixa: stats.faixa,
           prog: progStats.slope === null ? null : +progStats.slope.toFixed(2),
           kpis: document.getElementById('evol-kpis').innerText.replace(/\\n+/g, ' | '),
           linhaTabela: document.getElementById('evol-tabela-notas').innerText.split('\\n')[0] };
}

const cenarios = [];
cenarios.push(cenario('aluno em alta (3 disciplines)', [[5,6,7,8],[6,7,8,9],[7,8,9,10]], 3, []));
cenarios.push(cenario('aluno em queda', [[9,8,7,5],[8,7,6,5],[9,8,7,6]], 3, []));
cenarios.push(cenario('apenas N1 e N2 lancados', [[7,8,null,null],[null,null,null,null]], 2, []));
cenarios.push(cenario('muitos nulls', [[null,null,null,null],[8,null,9,null]], 2, []));
cenarios.push(cenario('zero notas', [[null,null,null,null]], 1, []));
cenarios.push(cenario('notas iguais (dispersao 0)', [[7,7,7,7],[7,7,7,7]], 2, []));
cenarios.push(cenario('dispersao alta', [[1,3,5,10],[2,2,9,10]], 2, []));
cenarios.push(cenario('8 disciplines', [[5,5,5,5],[6,6,6,6],[7,7,7,7],[8,8,8,8],[9,9,9,9],[4,4,4,4],[null,7,null,8],[10,2,null,6]], 8, []));

window.__RESULTADO__ = { cenarios, erros, chartVivos: Object.keys(chartInstances) };
</script>
</body>
</html>`;

fs.writeFileSync(out, harness, 'utf-8');
console.log('harness gerado em', out, '-', harness.length, 'bytes');