# Gabarito · Exercícios de SQL

**Base:** tabelas `colegios`, `pesquisas_lista`, `perguntas_formulario` e `respostas_pesquisa` do projeto Supabase (Diagnóstico de Convivência Digital). Os resultados abaixo foram executados sobre os dados reais no momento da geração.

Versão interativa com verificação automática: `exercicios-sql/index.html`.

---


## Nível 1 · Consultas básicas

### 01 · Conhecendo a tabela

**Enunciado:** Mostre todas as colunas e todas as linhas da tabela colegios.

**Gabarito:**

```sql
SELECT * FROM colegios;
```

**Resultado esperado:**

| id | nome | logo_path |
| --- | --- | --- |
| 1 | EEB Prof. Ângelo Cascaes Tancredo | img/logo.png |
| 5 | EEB Colégio Dom Jaime | img/colegio_dom_jaime.jpg |
_2 linha(s)._

**Explicação:**

O asterisco (*) significa "todas as colunas". Como não há WHERE, o banco devolve todas as linhas da tabela.
Use SELECT * para explorar a estrutura. Em sistemas reais evite-o, pois ele traz colunas desnecessárias e quebra o código se a tabela mudar.

---

### 02 · Escolhendo colunas

**Enunciado:** Liste o id, a série e a idade de todas as respostas.

**Gabarito:**

```sql
SELECT id, serie, idade FROM respostas_pesquisa;
```

**Resultado esperado:**

| id | serie | idade |
| --- | --- | --- |
| 9 | 2º Série Técnico | 16 |
| 10 | 1ª Série EM | 17 |
| 11 | 1º Série Técnico | 15 |
| 12 | 2ª Série EM | 16 |
| 13 | 1º Série Técnico | 16 |
| 14 | 1º Série Técnico | 15 |
_… 247 linhas no total._

**Explicação:**

Listar as colunas explicitamente retorna só o necessário. Em álgebra relacional, escolher colunas é a operação de projeção.
A ordem das colunas no SELECT é a ordem em que elas aparecem no resultado.

---

### 03 · Filtro com texto

**Enunciado:** Mostre id, serie e turno apenas das respostas do turno Matutino.

**Gabarito:**

```sql
SELECT id, serie, turno FROM respostas_pesquisa WHERE turno = 'Matutino';
```

**Resultado esperado:**

| id | serie | turno |
| --- | --- | --- |
| 131 | 2ª Série EM | Matutino |
| 245 | 1ª Série EM | Matutino |
_2 linha(s)._

**Explicação:**

WHERE filtra linhas antes de devolvê-las. Valores de texto vão entre aspas simples (').
A comparação com = é exata e diferencia maiúsculas de minúsculas: 'matutino' não encontra 'Matutino'.
Esse é um erro muito comum com dados digitados por pessoas.

---

### 04 · Filtro booleano

**Enunciado:** Mostre id, serie e ambiente_risco apenas das respostas de alunos que já foram vítimas (foi_vitima verdadeiro).

**Gabarito:**

```sql
SELECT id, serie, ambiente_risco FROM respostas_pesquisa WHERE foi_vitima = true;
```

**Resultado esperado:**

| id | serie | ambiente_risco |
| --- | --- | --- |
| 9 | 2º Série Técnico | TikTok |
| 12 | 2ª Série EM | Jogos Online |
| 14 | 1º Série Técnico | Outro |
| 16 | 1ª Série EM | Outro |
| 20 | 3ª Série EM | Instagram |
| 22 | 2ª Série EM | Instagram |
_… 65 linhas no total._

**Explicação:**

Colunas do tipo boolean guardam true ou false, sem aspas. Como a própria coluna já é booleana, WHERE foi_vitima produz o mesmo resultado.
Repare que aqui o "Sim/Não" do formulário já foi convertido para booleano, o que deixa os filtros mais simples.

---

### 05 · Faixa de valores

**Enunciado:** Mostre id e idade das respostas de alunos com idade entre 16 e 17 anos, incluindo os extremos.

**Gabarito:**

```sql
SELECT id, idade FROM respostas_pesquisa WHERE idade BETWEEN 16 AND 17;
```

**Resultado esperado:**

| id | idade |
| --- | --- |
| 9 | 16 |
| 10 | 17 |
| 12 | 16 |
| 13 | 16 |
| 15 | 16 |
| 16 | 17 |
_… 160 linhas no total._

**Explicação:**

BETWEEN é inclusivo nos dois extremos. Equivale a idade >= 16 AND idade <= 17.
Cuidado com datas que têm hora: BETWEEN '2026-08-01' AND '2026-08-31' deixa de fora tudo após 00:00 do dia 31. Nesses casos use >= e <.

---

### 06 · Lista de valores

**Enunciado:** Mostre id e ambiente_risco das respostas em que o ambiente citado é TikTok, Instagram ou WhatsApp.

**Gabarito:**

```sql
SELECT id, ambiente_risco FROM respostas_pesquisa WHERE ambiente_risco IN ('TikTok', 'Instagram', 'WhatsApp');
```

**Resultado esperado:**

| id | ambiente_risco |
| --- | --- |
| 9 | TikTok |
| 15 | TikTok |
| 19 | TikTok |
| 20 | Instagram |
| 21 | TikTok |
| 22 | Instagram |
_… 108 linhas no total._

**Explicação:**

IN substitui vários OR encadeados: ambiente_risco = 'TikTok' OR ambiente_risco = 'Instagram' OR ambiente_risco = 'WhatsApp'.
A versão com IN é mais curta e mais fácil de manter. Ela também aceita uma subconsulta no lugar da lista (veja o exercício 27).

---

### 07 · Busca por padrão

**Enunciado:** Mostre id e serie das respostas de alunos de cursos técnicos, ou seja, quando a série contém a palavra "Técnico".

**Gabarito:**

```sql
SELECT id, serie FROM respostas_pesquisa WHERE serie LIKE '%Técnico%';
```

**Resultado esperado:**

| id | serie |
| --- | --- |
| 9 | 2º Série Técnico |
| 11 | 1º Série Técnico |
| 13 | 1º Série Técnico |
| 14 | 1º Série Técnico |
| 17 | 1º Série Técnico |
| 18 | 1º Série Técnico |
_… 84 linhas no total._

**Explicação:**

LIKE compara com padrões. % significa "qualquer sequência de caracteres, inclusive nenhuma", e _ significa "exatamente um caractere".
No PostgreSQL, LIKE diferencia maiúsculas de minúsculas. Para ignorar essa diferença, use ILIKE.

---

### 08 · Condições combinadas

**Enunciado:** Mostre id, serie e idade das respostas de alunos que já foram vítimas E que NÃO sabem a quem pedir ajuda na escola.

**Gabarito:**

```sql
SELECT id, serie, idade FROM respostas_pesquisa WHERE foi_vitima = true AND sabe_pedir_ajuda = false;
```

**Resultado esperado:**

| id | serie | idade |
| --- | --- | --- |
| 9 | 2º Série Técnico | 16 |
| 12 | 2ª Série EM | 16 |
| 14 | 1º Série Técnico | 15 |
| 16 | 1ª Série EM | 17 |
| 20 | 3ª Série EM | 17 |
| 22 | 2ª Série EM | 17 |
_… 37 linhas no total._

**Explicação:**

AND exige que todas as condições sejam verdadeiras. OR basta que uma seja.
A condição sabe_pedir_ajuda = false também pode ser escrita como NOT sabe_pedir_ajuda.
Esse tipo de cruzamento responde à pergunta da pesquisa: quem está em situação de maior vulnerabilidade?

---

### 09 · Ordenação e limite

**Enunciado:** Mostre id e data_resposta das 5 respostas mais recentes, ordenadas da mais recente para a mais antiga.

**Gabarito:**

```sql
SELECT id, data_resposta FROM respostas_pesquisa ORDER BY data_resposta DESC LIMIT 5;
```

**Resultado esperado:**

| id | data_resposta |
| --- | --- |
| 255 | 18/09/2026, 01:08:03 |
| 254 | 26/08/2026, 23:16:29 |
| 253 | 22/08/2026, 00:59:07 |
| 252 | 22/08/2026, 00:37:25 |
| 251 | 22/08/2026, 00:35:17 |
_5 linha(s)._

**Explicação:**

ORDER BY ordena o resultado. DESC coloca os maiores valores (as datas mais recentes) primeiro. LIMIT 5 mantém só as 5 primeiras linhas.
A ordem das cláusulas importa: ORDER BY vem antes de LIMIT. Sem ORDER BY, o banco não garante ordem nenhuma, então LIMIT pode trazer linhas diferentes a cada execução.

---

### 10 · Valores distintos

**Enunciado:** Liste os diferentes valores de motivo_frequente, sem repetição, em ordem alfabética.

**Gabarito:**

```sql
SELECT DISTINCT motivo_frequente FROM respostas_pesquisa ORDER BY motivo_frequente;
```

**Resultado esperado:**

| motivo_frequente |
| --- |
| Aparência física |
| Apenas "brincadeira" para se enturmar |
| Condição financeira |
| Opiniões pessoais |
| Orientação/Identidade |
| Outro |
_6 linha(s)._

**Explicação:**

DISTINCT devolve cada valor uma única vez. Ele age sobre o conjunto de colunas do SELECT: com mais colunas, a combinação inteira é que precisa ser diferente.
ORDER BY por último organiza a saída em ordem alfabética.

---

### 11 · Concatenação e alias

**Enunciado:** Mostre somente uma coluna chamada perfil, com o gênero e a série separados por " - " (exemplo: Masculino - 3ª Série EM), apenas para as 3 respostas de menor id.

**Gabarito:**

```sql
SELECT genero || ' - ' || serie AS perfil FROM respostas_pesquisa ORDER BY id LIMIT 3;
```

**Resultado esperado:**

| perfil |
| --- |
| Masculino - 2º Série Técnico |
| Masculino - 1ª Série EM |
| Masculino - 1º Série Técnico |
_3 linha(s)._

**Explicação:**

|| concatena textos. AS cria um apelido (alias) para a coluna do resultado.
Para escolher "as 3 primeiras", é preciso ordenar antes com ORDER BY id. Sem essa ordenação, o LIMIT escolheria linhas de forma arbitrária.

---


## Nível 2 · Agregação e agrupamento

### 12 · Contagem total

**Enunciado:** Quantas respostas existem no total? Retorne uma coluna chamada total.

**Gabarito:**

```sql
SELECT COUNT(*) AS total FROM respostas_pesquisa;
```

**Resultado esperado:**

| total |
| --- |
| 247 |
_1 linha(s)._

**Explicação:**

COUNT(*) conta todas as linhas, inclusive as que têm campos nulos. Uma função de agregação transforma muitas linhas em um único valor.

---

### 13 · Valores distintos na contagem

**Enunciado:** Quantas séries diferentes aparecem nas respostas? Retorne uma coluna chamada qtd_series.

**Gabarito:**

```sql
SELECT COUNT(DISTINCT serie) AS qtd_series FROM respostas_pesquisa;
```

**Resultado esperado:**

| qtd_series |
| --- |
| 6 |
_1 linha(s)._

**Explicação:**

COUNT(DISTINCT serie) conta quantos valores diferentes existem na coluna, ignorando repetições e valores nulos.
Isso é diferente de COUNT(serie), que conta todas as linhas com valor preenchido, repetições incluídas.

---

### 14 · Média

**Enunciado:** Qual é a média de idade dos respondentes, arredondada com 2 casas decimais? Retorne uma coluna chamada media_idade.

**Gabarito:**

```sql
SELECT ROUND(AVG(idade), 2) AS media_idade FROM respostas_pesquisa;
```

**Resultado esperado:**

| media_idade |
| --- |
| 16.63 |
_1 linha(s)._

**Explicação:**

AVG calcula a média ignorando valores nulos (a soma dividida pela quantidade de valores não nulos). ROUND(valor, 2) arredonda para 2 casas decimais.

---

### 15 · Mínimo e máximo

**Enunciado:** Qual é a menor e a maior idade informadas? Retorne as colunas idade_min e idade_max.

**Gabarito:**

```sql
SELECT MIN(idade) AS idade_min, MAX(idade) AS idade_max FROM respostas_pesquisa;
```

**Resultado esperado:**

| idade_min | idade_max |
| --- | --- |
| 15 | 20 |
_1 linha(s)._

**Explicação:**

MIN e MAX devolvem o menor e o maior valor de um conjunto. Podem ser usados com números, textos e datas.

---

### 16 · Respostas por série

**Enunciado:** Quantas respostas há em cada série? Retorne serie e total, ordenado do maior total para o menor.

**Gabarito:**

```sql
SELECT serie, COUNT(*) AS total FROM respostas_pesquisa GROUP BY serie ORDER BY total DESC;
```

**Resultado esperado:**

| serie | total |
| --- | --- |
| 3ª Série EM | 72 |
| 2ª Série EM | 63 |
| 1º Série Técnico | 55 |
| 1ª Série EM | 28 |
| 2º Série Técnico | 19 |
| 3º Série Técnico | 10 |
_6 linha(s)._

**Explicação:**

GROUP BY cria um grupo para cada valor distinto de serie, e a função COUNT(*) é calculada dentro de cada grupo.
Regra fundamental: toda coluna do SELECT que não está dentro de uma função de agregação precisa estar no GROUP BY.

---

### 17 · Filtrando grupos (HAVING)

**Enunciado:** Quais motivos_frequente foram citados mais de 30 vezes? Retorne motivo_frequente e total, ordenado do maior total para o menor.

**Gabarito:**

```sql
SELECT motivo_frequente, COUNT(*) AS total FROM respostas_pesquisa GROUP BY motivo_frequente HAVING COUNT(*) > 30 ORDER BY total DESC;
```

**Resultado esperado:**

| motivo_frequente | total |
| --- | --- |
| Aparência física | 107 |
| Apenas "brincadeira" para se enturmar | 48 |
| Opiniões pessoais | 33 |
_3 linha(s)._

**Explicação:**

WHERE filtra linhas antes do agrupamento. HAVING filtra grupos depois dele, e por isso aceita funções de agregação como COUNT(*).
Escrever WHERE COUNT(*) > 30 gera erro, porque a contagem ainda não existe nesse momento.

---

### 18 · Percentual com CASE

**Enunciado:** Qual é o percentual de respondentes que disseram ter presenciado cyberbullying ("Sim")? Use 1 casa decimal. Retorne uma coluna chamada percentual.

**Gabarito:**

```sql
SELECT ROUND(100.0 * SUM(CASE WHEN presenciou_bullying = 'Sim' THEN 1 ELSE 0 END) / COUNT(*), 1) AS percentual FROM respostas_pesquisa;
```

**Resultado esperado:**

| percentual |
| --- |
| 41.3 |
_1 linha(s)._

**Explicação:**

Técnica: CASE transforma "Sim" em 1 e o restante em 0. A soma desses valores é a quantidade de "Sim", e dividir pelo total dá a proporção.
Armadilha da divisão inteira: 100 * 102 / 247 com inteiros resulta em 41. Com 100.0 o cálculo passa a ser decimal e o resultado correto é 41.3.

---

### 19 · Várias agregações por grupo

**Enunciado:** Para cada genero, mostre o total de respostas e a média de idade com 1 casa decimal. Retorne genero, total e media_idade, ordenado por genero.

**Gabarito:**

```sql
SELECT genero, COUNT(*) AS total, ROUND(AVG(idade), 1) AS media_idade FROM respostas_pesquisa GROUP BY genero ORDER BY genero;
```

**Resultado esperado:**

| genero | total | media_idade |
| --- | --- | --- |
| Feminino | 112 | 16.4 |
| Masculino | 126 | 16.7 |
| Outro | 2 | 16.5 |
| Prefiro não informar | 7 | 17.4 |
_4 linha(s)._

**Explicação:**

Cada grupo recebe todas as agregações do SELECT. Um único GROUP BY serve para calcular várias métricas ao mesmo tempo.

---

### 20 · WHERE antes do GROUP BY

**Enunciado:** Considerando apenas respostas de alunos com 17 anos ou mais, quantas há em cada série? Retorne serie e total, ordenado por serie.

**Gabarito:**

```sql
SELECT serie, COUNT(*) AS total FROM respostas_pesquisa WHERE idade >= 17 GROUP BY serie ORDER BY serie;
```

**Resultado esperado:**

| serie | total |
| --- | --- |
| 1ª Série EM | 7 |
| 1º Série Técnico | 8 |
| 2ª Série EM | 25 |
| 2º Série Técnico | 11 |
| 3ª Série EM | 70 |
| 3º Série Técnico | 10 |
_6 linha(s)._

**Explicação:**

Aqui o filtro reduz as linhas antes do agrupamento. Compare com o exercício 17: lá o filtro era sobre o grupo (HAVING), aqui é sobre a linha (WHERE).
Use WHERE sempre que possível, porque ele reduz o trabalho do banco antes de agrupar.

---


## Nível 3 · Junções (JOIN)

### 21 · JOIN simples

**Enunciado:** Mostre o id e a série de cada resposta, junto com o nome do colégio (coluna colegio). Ordene por id e mostre apenas as 5 primeiras linhas.

**Gabarito:**

```sql
SELECT r.id, r.serie, c.nome AS colegio FROM respostas_pesquisa r JOIN colegios c ON c.id = r.colegio_id ORDER BY r.id LIMIT 5;
```

**Resultado esperado:**

| id | serie | colegio |
| --- | --- | --- |
| 9 | 2º Série Técnico | EEB Prof. Ângelo Cascaes Tancredo |
| 10 | 1ª Série EM | EEB Prof. Ângelo Cascaes Tancredo |
| 11 | 1º Série Técnico | EEB Prof. Ângelo Cascaes Tancredo |
| 12 | 2ª Série EM | EEB Prof. Ângelo Cascaes Tancredo |
| 13 | 1º Série Técnico | EEB Prof. Ângelo Cascaes Tancredo |
_5 linha(s)._

**Explicação:**

JOIN combina duas tabelas pela chave: colegios.id = respostas_pesquisa.colegio_id. Os apelidos r e c evitam repetir o nome da tabela e deixam claro de onde vem cada coluna.
Um JOIN comum (INNER) só mantém linhas que têm correspondência nas duas tabelas.

---

### 22 · LEFT JOIN com contagem

**Enunciado:** Liste todos os colégios cadastrados com a quantidade de respostas de cada um, inclusive os que não têm nenhuma resposta. Retorne id, nome e respostas, ordenado por id.

**Gabarito:**

```sql
SELECT c.id, c.nome, COUNT(r.id) AS respostas FROM colegios c LEFT JOIN respostas_pesquisa r ON r.colegio_id = c.id GROUP BY c.id, c.nome ORDER BY c.id;
```

**Resultado esperado:**

| id | nome | respostas |
| --- | --- | --- |
| 1 | EEB Prof. Ângelo Cascaes Tancredo | 247 |
| 5 | EEB Colégio Dom Jaime | 0 |
_2 linha(s)._

**Explicação:**

LEFT JOIN mantém todas as linhas da tabela da esquerda (colegios). Quando não há correspondência, as colunas da direita vêm como NULL.
COUNT(r.id) conta somente valores não nulos, então um colégio sem respostas recebe 0. Se fosse COUNT(*), a linha do colégio (com NULLs) seria contada e apareceria 1. Esse é um erro clássico.

---

### 23 · Pesquisa sem vínculo

**Enunciado:** Quantas perguntas do formulário NÃO estão vinculadas a nenhuma pesquisa (pesquisa_id vazio)? Retorne uma coluna chamada total.

**Gabarito:**

```sql
SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id IS NULL;
```

**Resultado esperado:**

| total |
| --- |
| 10 |
_1 linha(s)._

**Explicação:**

NULL significa ausência de valor. Não se compara NULL com = ou <>, porque o resultado é "desconhecido" e o WHERE não o aceita.
Por isso se usa IS NULL e IS NOT NULL. O exercício 24 mostra o erro desse tipo de comparação.

---

### 24 · Armadilha do NULL

**Enunciado:** Execute: SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id = NULL; O resultado surpreende, pois há perguntas sem pesquisa. Escreva a consulta correta, que conte essas perguntas, e explique a diferença.

**Gabarito:**

```sql
SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id = NULL;
```

**Resultado esperado:**

| total |
| --- |
| 0 |
_1 linha(s)._

**Explicação:**

A consulta do enunciado retorna 0, mas existem perguntas com pesquisa_id nulo. Isso acontece porque "NULL = NULL" não é verdadeiro, é desconhecido, e o WHERE só mantém linhas em que a condição é verdadeira.
A consulta correta é a do exercício 23 (WHERE pesquisa_id IS NULL), que retorna 10.

---

### 25 · Registros órfãos

**Enunciado:** Liste o campo_chave de todas as perguntas cuja pesquisa_id não corresponde a nenhuma pesquisa existente em pesquisas_lista. Inclua também as perguntas sem pesquisa. Ordene por campo_chave.

**Gabarito:**

```sql
SELECT pf.campo_chave FROM perguntas_formulario pf LEFT JOIN pesquisas_lista pl ON pl.id = pf.pesquisa_id WHERE pl.id IS NULL ORDER BY pf.campo_chave;
```

**Resultado esperado:**

| campo_chave |
| --- |
| ambiente_risco |
| app_mais_usado |
| foi_vitima |
| genero |
| idade |
| motivo_frequente |
_… 11 linhas no total._

**Explicação:**

Este é o padrão "anti-join": o LEFT JOIN traz todas as perguntas e, se não existir pesquisa correspondente, pl.id fica NULL. Filtrar por pl.id IS NULL mostra só essas perguntas.
Nesta base, há 11 perguntas sem pesquisa válida: 10 com pesquisa_id NULL e uma (app_mais_usado) apontando para a pesquisa 4, que não existe. Esse é o tipo de problema de integridade que uma chave estrangeira evitaria.

---


## Nível 4 · Subconsultas, CTE, CASE e Window

### 26 · Subconsulta escalar

**Enunciado:** Mostre id e idade das respostas de alunos com idade acima da média geral de idade. Ordene por id.

**Gabarito:**

```sql
SELECT id, idade FROM respostas_pesquisa WHERE idade > (SELECT AVG(idade) FROM respostas_pesquisa) ORDER BY id;
```

**Resultado esperado:**

| id | idade |
| --- | --- |
| 10 | 17 |
| 16 | 17 |
| 20 | 17 |
| 22 | 17 |
| 23 | 17 |
| 25 | 17 |
_… 131 linhas no total._

**Explicação:**

A subconsulta devolve um único valor (a média), que é comparado com cada linha. Ela é executada uma vez, porque não depende da linha externa.
Atenção: a média não é inteira. Com média de 16,63 anos, "acima da média" significa idade 17 ou mais.

---

### 27 · Subconsulta com IN

**Enunciado:** Mostre id e serie das respostas de séries que têm mais de 50 respostas. Ordene por id.

**Gabarito:**

```sql
SELECT id, serie FROM respostas_pesquisa WHERE serie IN (SELECT serie FROM respostas_pesquisa GROUP BY serie HAVING COUNT(*) > 50) ORDER BY id;
```

**Resultado esperado:**

| id | serie |
| --- | --- |
| 11 | 1º Série Técnico |
| 12 | 2ª Série EM |
| 13 | 1º Série Técnico |
| 14 | 1º Série Técnico |
| 15 | 2ª Série EM |
| 17 | 1º Série Técnico |
_… 190 linhas no total._

**Explicação:**

A subconsulta devolve uma lista de séries (as que têm mais de 50 respostas), e IN verifica se a série de cada linha está nessa lista.
Esse mesmo resultado pode ser obtido com um JOIN com a subconsulta, que costuma ser mais rápido em tabelas grandes.

---

### 28 · CTE com WITH

**Enunciado:** Usando WITH, calcule para cada série o total de respostas e o percentual sobre o total geral (1 casa decimal). Retorne serie, total e percentual, ordenado por total decrescente.

**Gabarito:**

```sql
WITH por_serie AS (
    SELECT serie, COUNT(*) AS total
    FROM respostas_pesquisa
    GROUP BY serie
)
SELECT serie, total,
       ROUND(100.0 * total / (SELECT COUNT(*) FROM respostas_pesquisa), 1) AS percentual
FROM por_serie
ORDER BY total DESC;
```

**Resultado esperado:**

| serie | total | percentual |
| --- | --- | --- |
| 3ª Série EM | 72 | 29.1 |
| 2ª Série EM | 63 | 25.5 |
| 1º Série Técnico | 55 | 22.3 |
| 1ª Série EM | 28 | 11.3 |
| 2º Série Técnico | 19 | 7.7 |
| 3º Série Técnico | 10 | 4.0 |
_6 linha(s)._

**Explicação:**

WITH cria uma tabela temporária nomeada (CTE) que existe só durante a consulta. Ela deixa o raciocínio em etapas: primeiro agrega, depois calcula o percentual.
A subconsulta (SELECT COUNT(*) ...) no cálculo é o total geral, que é 247 respostas.

---

### 29 · Window function

**Enunciado:** Sem usar WITH, mostre para cada série o total de respostas e o percentual sobre o total geral (1 casa decimal), usando uma window function. Retorne serie, total e percentual, ordenado por total decrescente.

**Gabarito:**

```sql
SELECT serie, COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentual
FROM respostas_pesquisa
GROUP BY serie
ORDER BY total DESC;
```

**Resultado esperado:**

| serie | total | percentual |
| --- | --- | --- |
| 3ª Série EM | 72 | 29.1 |
| 2ª Série EM | 63 | 25.5 |
| 1º Série Técnico | 55 | 22.3 |
| 1ª Série EM | 28 | 11.3 |
| 2º Série Técnico | 19 | 7.7 |
| 3º Série Técnico | 10 | 4.0 |
_6 linha(s)._

**Explicação:**

Window functions (funções de janela) calculam sobre um conjunto de linhas sem reduzi-las como o GROUP BY faz. OVER () significa "sobre todas as linhas do resultado".
SUM(COUNT(*)) OVER () soma os totais de todos os grupos, e esse é o denominador do percentual. O resultado é igual ao do exercício 28, com uma consulta mais curta.

---

### 30 · CASE para classificar

**Enunciado:** Classifique as respostas em 3 faixas: "Até 15 anos" (idade menor que 16), "16 a 17 anos" e "18 anos ou mais". Retorne faixa e total, ordenado por faixa.

**Gabarito:**

```sql
SELECT CASE WHEN idade < 16 THEN 'Até 15 anos'
            WHEN idade <= 17 THEN '16 a 17 anos'
            ELSE '18 anos ou mais' END AS faixa,
       COUNT(*) AS total
FROM respostas_pesquisa
GROUP BY faixa
ORDER BY faixa;
```

**Resultado esperado:**

| faixa | total |
| --- | --- |
| 16 a 17 anos | 160 |
| 18 anos ou mais | 48 |
| Até 15 anos | 39 |
_3 linha(s)._

**Explicação:**

CASE funciona como um "se ... senão se ... senão" dentro do SQL. As condições são testadas em ordem e a primeira verdadeira define o valor.
GROUP BY faixa usa o apelido da coluna, o que funciona no PostgreSQL. Em outros bancos, repita a expressão CASE no GROUP BY.
A ordenação é alfabética: "16 a 17" vem antes de "18" e "Até" vem por último.

---


## Teoria · Modelagem de dados

### T1 · Redundância de colegio_nome _(teoria)_

**Enunciado:** A tabela respostas_pesquisa guarda colegio_id e também colegio_nome. Explique por que isso é uma redundância e como resolver usando a normalização (3ª Forma Normal).

**Resposta explicada:**

O nome do colégio depende do colégio, não de cada resposta. Ele é repetido em todas as linhas de um mesmo colégio, o que gera dependência transitiva: id da resposta → colegio_id → colegio_nome.
Isso viola a 3FN. Se o nome mudar, é preciso atualizar várias linhas (anomalia de atualização). A solução é manter só colegio_id como chave estrangeira e buscar o nome com JOIN na tabela colegios.

---

### T2 · Chave estrangeira _(teoria)_

**Enunciado:** Identifique, nas tabelas desta base, uma chave primária e uma chave estrangeira. O que a chave estrangeira garante?

**Resposta explicada:**

colegios.id é chave primária: identifica cada colégio de forma única e não nula.
respostas_pesquisa.colegio_id é chave estrangeira: deve existir em colegios.id. A restrição de integridade referencial impede, por exemplo, uma resposta apontando para um colégio inexistente.
O exercício 25 mostra o problema oposto: sem essa garantia, uma pergunta pode apontar para uma pesquisa que não existe.

---

