# Harnesses de teste (Professor Tech)

Estes scripts **não** fazem parte do site. Eles extraem o código real de
`js/professorTech/professorTech.js` e geram uma página HTML isolada que roda os
renderizadores contra as mesmas libs de CDN usadas em produção. Isso permite
validar partes que só quebram em runtime (configs do Chart.js, do jsPDF) sem
depender de login e de dados reais.

## Como usar

```bash
# 1. Gera as paginas de teste
node tools/harness/build_evolucao.js . /tmp/h_evolucao.html
node tools/harness/build_pdf.js       . /tmp/h_pdf.html

# 2. Sobe um servidor local na pasta dos arquivos gerados
python -m http.server 8791 --bind 127.0.0.1

# 3. Abre no navegador e le o resultado em window.__RESULTADO__
```

## O que cada um cobre

| Harness | Alvo | Cenários |
|---|---|---|
| `build_evolucao.js` | KPIs, gráficos de progressão/dispersão/disciplinas e tabela da aba Evolução | alta, queda, avaliações parciais, nulos, zero notas, dispersão 0, dispersão alta, 8 disciplinas |
| `build_pdf.js` | Bloco de desenho do PDF da Matriz de Frequência (jsPDF + autoTable) | 1 a 45 colunas, 0 a 40 alunos, multipágina, nome de disciplina com acento |

Ambos harnesses interceptam `pdf.save()` / leem `window.__RESULTADO__` e
falham alto quando qualquer renderizador lança exceção.

## Testes sem navegador

Para a lógica pura (regras de absenteísmo e estatísticas), prefira os testes
de Node, que são mais rápidos:

```bash
node tools/test_ausentismo.js
node tools/test_evolucao.js
python tools/check_refs.py    # els.* sem declaracao + getElementById sem id no HTML
python tools/html_balance.py  # tags do index.html desbalanceadas
node --check js/professorTech/professorTech.js
```