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
node tools/harness/build_apoia.js     . /tmp/h_apoia.html
node tools/harness/build_boot.js      .          # gera ./_boot.html

# 2. Sobe um servidor local na pasta dos arquivos gerados
python -m http.server 8791 --bind 127.0.0.1

# 3. Abre no navegador e le o resultado em window.__RESULTADO__
```

`build_boot.js` é a exceção: a página tem que ficar **na raiz do repo**, senão os
imports relativos de `js/` não resolvem. Sirva a raiz (`python -m http.server
8791 --bind 127.0.0.1`) e abra `/_boot.html`. O arquivo gerado está no
`.gitignore`.

## O que cada um cobre

| Harness | Alvo | Cenários |
|---|---|---|
| `build_boot.js` | Avaliação do módulo inteiro do `professorTech.js` | piso de chaves em `window.profAPI` + erros de console não filtrados |
| `build_evolucao.js` | KPIs, gráficos de progressão/dispersão/disciplinas e tabela da aba Evolução | alta, queda, avaliações parciais, nulos, zero notas, dispersão 0, dispersão alta, 8 disciplinas |
| `build_pdf.js` | Bloco de desenho do PDF da Matriz de Frequência (jsPDF + autoTable) | 1 a 45 colunas, 0 a 40 alunos, multipágina, nome de disciplina com acento |
| `build_apoia.js` | Encaminhamento em lote à direção (PDF + tabela de preview) e as duas telas de sorteios | lista vazia, 1 a 55 alunos, 24 alunos com assinaturas em página nova, multipágina, contexto sem turma, chips de já sorteados e de exclusão |

Ambos harnesses interceptam `pdf.save()` / leem `window.__RESULTADO__` e
falham alto quando qualquer renderizador lança exceção.

### Por que existe o `build_boot.js`

Um erro de digitação matou a aba Professor inteira sem o `node --check`
reclamar. A linha 23 ficou `letapoiaEncaminharPendente = []` (sem espaço).
Como módulo ES é **sempre** modo strict, atribuir a identificador não
declarado lança `ReferenceError` — e isso aborta a avaliação do módulo
inteiro na linha 23. O `window.profAPI = { ... }` do fim do arquivo nunca roda,
então `window.profAPI` fica com **0 chaves** e nenhuma aba do professor
funciona.

O sintoma é silencioso e enganoso: o console mostra só o ReferenceError, sem
dizer que a aba inteira caiu. Por isso o harness mede a coisa simples que
indica saúde — quantas chaves `window.profAPI` publica — em vez de exercitar
comportamento (que exigiria login e dados reais).

O piso vive em `_boot_baseline.json` e é um **piso**, não uma igualdade:
adicionar uma API não exige mexer nele, e só uma regressão real reprova.
Confirmado nos dois sentidos:

```
saudavel   { ok: true,  piso: 125, obtido: 125, erros: [] }
com o bug  { ok: false, piso: 125, obtido: 0,
             erros: [{ tipo: 'import', texto: 'letapoiaEncaminharPendente is not defined' }] }
```

Erros de Firebase/Auth são filtrados: sem as credenciais injetadas pelo deploy
o SDK cai no placeholder e reclama, mas isso não impede o módulo de se
publicar.

O outro guardião dessa classe de erro é o `lint_colado.js` (Node, sem
navegador), que pega a palavra-chave colada na hora da escrita.

### O que `build_apoia.js` verifica além da geração

- **Rodapé paginado.** Descomprime os streams do PDF e exige
  `Página X de Y` em todas as páginas, com `Y` igual ao total real. O
  `didDrawPage` do autoTable roda *antes* do total existir, então desenhá-lo
  ali produz `Página 1 de 1` em todas as páginas — bug que o helper
  `pintarRodapePaginas` corrige.
- **Largura da tabela.** Redireciona o `console.error` para caçar o aviso
  `Of the table content, N units width could not fit page`, que aparece
  quando a soma das larguras fixas deixa espaço em branco na página.
- **Página extra de assinaturas.** Varre de 18 a 46 alunos com linhas altas
  para mapear quando o bloco de assinaturas não cabe e precisa criar página.

## Testes sem navegador

Para a lógica pura (regras de absenteísmo e estatísticas), prefira os testes
de Node, que são mais rápidos:

```bash
node tools/test_ausentismo.js
node tools/test_evolucao.js
node tools/test_lint_colado.js
node tools/lint_colado.js js\professorTech\professorTech.js
python tools/check_refs.py    # els.* sem declaracao + getElementById sem id no HTML
python tools/html_balance.py  # tags do index.html desbalanceadas
node --check js/professorTech/professorTech.js
```

`lint_colado.js` pega palavra-chave colada em identificador (`letapoiaX`,
`constassunto`, `returnvalor`, `newDate`), que o `node --check` **não** pega: no
modo sloppy vira atribuição a global implícito e só quebra em runtime.
`test_lint_colado.js` trava os dois sentidos com 20 casos.

Tudo junto: `powershell -ExecutionPolicy Bypass -File tools\check_all.ps1`
