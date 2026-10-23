export const NIVEIS = {
    1: 'Nível 1 · Consultas básicas',
    2: 'Nível 2 · Agregação e agrupamento',
    3: 'Nível 3 · Junções (JOIN)',
    4: 'Nível 4 · Subconsultas, CTE, CASE e Window',
    5: 'Teoria · Modelagem de dados'
};

export const EXERCICIOS = [
    // ---------- NÍVEL 1 ----------
    {
        id: '01', nivel: 1, titulo: 'Conhecendo a tabela',
        enunciado: 'Mostre todas as colunas e todas as linhas da tabela colegios.',
        dica: 'Use SELECT * para trazer todas as colunas.',
        gabarito: `SELECT * FROM colegios;`,
        explicacao: `O asterisco (*) significa "todas as colunas". Como não há WHERE, o banco devolve todas as linhas da tabela.
Use SELECT * para explorar a estrutura. Em sistemas reais evite-o, pois ele traz colunas desnecessárias e quebra o código se a tabela mudar.`
    },
    {
        id: '02', nivel: 1, titulo: 'Escolhendo colunas',
        enunciado: 'Liste o id, a série e a idade de todas as respostas.',
        dica: 'Liste os nomes das colunas separados por vírgula, logo depois do SELECT.',
        gabarito: `SELECT id, serie, idade FROM respostas_pesquisa;`,
        explicacao: `Listar as colunas explicitamente retorna só o necessário. Em álgebra relacional, escolher colunas é a operação de projeção.
A ordem das colunas no SELECT é a ordem em que elas aparecem no resultado.`
    },
    {
        id: '03', nivel: 1, titulo: 'Filtro com texto',
        enunciado: 'Mostre id, serie e turno apenas das respostas do turno Matutino.',
        dica: 'Textos ficam entre aspas simples. Use WHERE coluna = valor.',
        gabarito: `SELECT id, serie, turno FROM respostas_pesquisa WHERE turno = 'Matutino';`,
        explicacao: `WHERE filtra linhas antes de devolvê-las. Valores de texto vão entre aspas simples (').
A comparação com = é exata e diferencia maiúsculas de minúsculas: 'matutino' não encontra 'Matutino'.
Esse é um erro muito comum com dados digitados por pessoas.`
    },
    {
        id: '04', nivel: 1, titulo: 'Filtro booleano',
        enunciado: 'Mostre id, serie e ambiente_risco apenas das respostas de alunos que já foram vítimas (foi_vitima verdadeiro).',
        dica: 'Colunas booleanas aceitam true e false, sem aspas.',
        gabarito: `SELECT id, serie, ambiente_risco FROM respostas_pesquisa WHERE foi_vitima = true;`,
        explicacao: `Colunas do tipo boolean guardam true ou false, sem aspas. Como a própria coluna já é booleana, WHERE foi_vitima produz o mesmo resultado.
Repare que aqui o "Sim/Não" do formulário já foi convertido para booleano, o que deixa os filtros mais simples.`
    },
    {
        id: '05', nivel: 1, titulo: 'Faixa de valores',
        enunciado: 'Mostre id e idade das respostas de alunos com idade entre 16 e 17 anos, incluindo os extremos.',
        dica: 'Procure pelo operador BETWEEN.',
        gabarito: `SELECT id, idade FROM respostas_pesquisa WHERE idade BETWEEN 16 AND 17;`,
        explicacao: `BETWEEN é inclusivo nos dois extremos. Equivale a idade >= 16 AND idade <= 17.
Cuidado com datas que têm hora: BETWEEN '2026-08-01' AND '2026-08-31' deixa de fora tudo após 00:00 do dia 31. Nesses casos use >= e <.`
    },
    {
        id: '06', nivel: 1, titulo: 'Lista de valores',
        enunciado: 'Mostre id e ambiente_risco das respostas em que o ambiente citado é TikTok, Instagram ou WhatsApp.',
        dica: 'O operador IN verifica se o valor está em uma lista.',
        gabarito: `SELECT id, ambiente_risco FROM respostas_pesquisa WHERE ambiente_risco IN ('TikTok', 'Instagram', 'WhatsApp');`,
        explicacao: `IN substitui vários OR encadeados: ambiente_risco = 'TikTok' OR ambiente_risco = 'Instagram' OR ambiente_risco = 'WhatsApp'.
A versão com IN é mais curta e mais fácil de manter. Ela também aceita uma subconsulta no lugar da lista (veja o exercício 27).`
    },
    {
        id: '07', nivel: 1, titulo: 'Busca por padrão',
        enunciado: 'Mostre id e serie das respostas de alunos de cursos técnicos, ou seja, quando a série contém a palavra "Técnico".',
        dica: 'Use LIKE com o caractere % como coringa.',
        gabarito: `SELECT id, serie FROM respostas_pesquisa WHERE serie LIKE '%Técnico%';`,
        explicacao: `LIKE compara com padrões. % significa "qualquer sequência de caracteres, inclusive nenhuma", e _ significa "exatamente um caractere".
No PostgreSQL, LIKE diferencia maiúsculas de minúsculas. Para ignorar essa diferença, use ILIKE.`
    },
    {
        id: '08', nivel: 1, titulo: 'Condições combinadas',
        enunciado: 'Mostre id, serie e idade das respostas de alunos que já foram vítimas E que NÃO sabem a quem pedir ajuda na escola.',
        dica: 'Use AND para exigir que as duas condições sejam verdadeiras ao mesmo tempo.',
        gabarito: `SELECT id, serie, idade FROM respostas_pesquisa WHERE foi_vitima = true AND sabe_pedir_ajuda = false;`,
        explicacao: `AND exige que todas as condições sejam verdadeiras. OR basta que uma seja.
A condição sabe_pedir_ajuda = false também pode ser escrita como NOT sabe_pedir_ajuda.
Esse tipo de cruzamento responde à pergunta da pesquisa: quem está em situação de maior vulnerabilidade?`
    },
    {
        id: '09', nivel: 1, titulo: 'Ordenação e limite',
        enunciado: 'Mostre id e data_resposta das 5 respostas mais recentes, ordenadas da mais recente para a mais antiga.',
        dica: 'ORDER BY ordena; DESC é decrescente; LIMIT corta a quantidade de linhas.',
        gabarito: `SELECT id, data_resposta FROM respostas_pesquisa ORDER BY data_resposta DESC LIMIT 5;`,
        explicacao: `ORDER BY ordena o resultado. DESC coloca os maiores valores (as datas mais recentes) primeiro. LIMIT 5 mantém só as 5 primeiras linhas.
A ordem das cláusulas importa: ORDER BY vem antes de LIMIT. Sem ORDER BY, o banco não garante ordem nenhuma, então LIMIT pode trazer linhas diferentes a cada execução.`
    },
    {
        id: '10', nivel: 1, titulo: 'Valores distintos',
        enunciado: 'Liste os diferentes valores de motivo_frequente, sem repetição, em ordem alfabética.',
        dica: 'DISTINCT remove as linhas repetidas do resultado.',
        gabarito: `SELECT DISTINCT motivo_frequente FROM respostas_pesquisa ORDER BY motivo_frequente;`,
        explicacao: `DISTINCT devolve cada valor uma única vez. Ele age sobre o conjunto de colunas do SELECT: com mais colunas, a combinação inteira é que precisa ser diferente.
ORDER BY por último organiza a saída em ordem alfabética.`
    },
    {
        id: '11', nivel: 1, titulo: 'Concatenação e alias',
        enunciado: 'Mostre somente uma coluna chamada perfil, com o gênero e a série separados por " - " (exemplo: Masculino - 3ª Série EM), apenas para as 3 respostas de menor id.',
        dica: 'O operador || junta textos. AS dá um nome à coluna. Use ORDER BY id e LIMIT 3.',
        gabarito: `SELECT genero || ' - ' || serie AS perfil FROM respostas_pesquisa ORDER BY id LIMIT 3;`,
        explicacao: `|| concatena textos. AS cria um apelido (alias) para a coluna do resultado.
Para escolher "as 3 primeiras", é preciso ordenar antes com ORDER BY id. Sem essa ordenação, o LIMIT escolheria linhas de forma arbitrária.`
    },

    // ---------- NÍVEL 2 ----------
    {
        id: '12', nivel: 2, titulo: 'Contagem total',
        enunciado: 'Quantas respostas existem no total? Retorne uma coluna chamada total.',
        dica: 'COUNT(*) conta linhas.',
        gabarito: `SELECT COUNT(*) AS total FROM respostas_pesquisa;`,
        explicacao: `COUNT(*) conta todas as linhas, inclusive as que têm campos nulos. Uma função de agregação transforma muitas linhas em um único valor.`
    },
    {
        id: '13', nivel: 2, titulo: 'Valores distintos na contagem',
        enunciado: 'Quantas séries diferentes aparecem nas respostas? Retorne uma coluna chamada qtd_series.',
        dica: 'Combine COUNT com DISTINCT dentro dos parênteses.',
        gabarito: `SELECT COUNT(DISTINCT serie) AS qtd_series FROM respostas_pesquisa;`,
        explicacao: `COUNT(DISTINCT serie) conta quantos valores diferentes existem na coluna, ignorando repetições e valores nulos.
Isso é diferente de COUNT(serie), que conta todas as linhas com valor preenchido, repetições incluídas.`
    },
    {
        id: '14', nivel: 2, titulo: 'Média',
        enunciado: 'Qual é a média de idade dos respondentes, arredondada com 2 casas decimais? Retorne uma coluna chamada media_idade.',
        dica: 'AVG calcula a média. ROUND(valor, 2) arredonda.',
        gabarito: `SELECT ROUND(AVG(idade), 2) AS media_idade FROM respostas_pesquisa;`,
        explicacao: `AVG calcula a média ignorando valores nulos (a soma dividida pela quantidade de valores não nulos). ROUND(valor, 2) arredonda para 2 casas decimais.`
    },
    {
        id: '15', nivel: 2, titulo: 'Mínimo e máximo',
        enunciado: 'Qual é a menor e a maior idade informadas? Retorne as colunas idade_min e idade_max.',
        dica: 'MIN e MAX.',
        gabarito: `SELECT MIN(idade) AS idade_min, MAX(idade) AS idade_max FROM respostas_pesquisa;`,
        explicacao: `MIN e MAX devolvem o menor e o maior valor de um conjunto. Podem ser usados com números, textos e datas.`
    },
    {
        id: '16', nivel: 2, titulo: 'Respostas por série',
        enunciado: 'Quantas respostas há em cada série? Retorne serie e total, ordenado do maior total para o menor.',
        dica: 'Use GROUP BY serie junto com COUNT(*).',
        gabarito: `SELECT serie, COUNT(*) AS total FROM respostas_pesquisa GROUP BY serie ORDER BY total DESC;`,
        explicacao: `GROUP BY cria um grupo para cada valor distinto de serie, e a função COUNT(*) é calculada dentro de cada grupo.
Regra fundamental: toda coluna do SELECT que não está dentro de uma função de agregação precisa estar no GROUP BY.`
    },
    {
        id: '17', nivel: 2, titulo: 'Filtrando grupos (HAVING)',
        enunciado: 'Quais motivos_frequente foram citados mais de 30 vezes? Retorne motivo_frequente e total, ordenado do maior total para o menor.',
        dica: 'Para filtrar depois de agrupar, use HAVING, não WHERE.',
        gabarito: `SELECT motivo_frequente, COUNT(*) AS total FROM respostas_pesquisa GROUP BY motivo_frequente HAVING COUNT(*) > 30 ORDER BY total DESC;`,
        explicacao: `WHERE filtra linhas antes do agrupamento. HAVING filtra grupos depois dele, e por isso aceita funções de agregação como COUNT(*).
Escrever WHERE COUNT(*) > 30 gera erro, porque a contagem ainda não existe nesse momento.`
    },
    {
        id: '18', nivel: 2, titulo: 'Percentual com CASE',
        enunciado: 'Qual é o percentual de respondentes que disseram ter presenciado cyberbullying ("Sim")? Use 1 casa decimal. Retorne uma coluna chamada percentual.',
        dica: 'Use CASE para transformar cada resposta em 1 ou 0, depois SUM e COUNT. Multiplique por 100.0 (com ponto).',
        gabarito: `SELECT ROUND(100.0 * SUM(CASE WHEN presenciou_bullying = 'Sim' THEN 1 ELSE 0 END) / COUNT(*), 1) AS percentual FROM respostas_pesquisa;`,
        explicacao: `Técnica: CASE transforma "Sim" em 1 e o restante em 0. A soma desses valores é a quantidade de "Sim", e dividir pelo total dá a proporção.
Armadilha da divisão inteira: 100 * 102 / 247 com inteiros resulta em 41. Com 100.0 o cálculo passa a ser decimal e o resultado correto é 41.3.`
    },
    {
        id: '19', nivel: 2, titulo: 'Várias agregações por grupo',
        enunciado: 'Para cada genero, mostre o total de respostas e a média de idade com 1 casa decimal. Retorne genero, total e media_idade, ordenado por genero.',
        dica: 'Você pode colocar várias funções de agregação no mesmo SELECT.',
        gabarito: `SELECT genero, COUNT(*) AS total, ROUND(AVG(idade), 1) AS media_idade FROM respostas_pesquisa GROUP BY genero ORDER BY genero;`,
        explicacao: `Cada grupo recebe todas as agregações do SELECT. Um único GROUP BY serve para calcular várias métricas ao mesmo tempo.`
    },
    {
        id: '20', nivel: 2, titulo: 'WHERE antes do GROUP BY',
        enunciado: 'Considerando apenas respostas de alunos com 17 anos ou mais, quantas há em cada série? Retorne serie e total, ordenado por serie.',
        dica: 'Filtre com WHERE antes de agrupar.',
        gabarito: `SELECT serie, COUNT(*) AS total FROM respostas_pesquisa WHERE idade >= 17 GROUP BY serie ORDER BY serie;`,
        explicacao: `Aqui o filtro reduz as linhas antes do agrupamento. Compare com o exercício 17: lá o filtro era sobre o grupo (HAVING), aqui é sobre a linha (WHERE).
Use WHERE sempre que possível, porque ele reduz o trabalho do banco antes de agrupar.`
    },

    // ---------- NÍVEL 3 ----------
    {
        id: '21', nivel: 3, titulo: 'JOIN simples',
        enunciado: 'Mostre o id e a série de cada resposta, junto com o nome do colégio (coluna colegio). Ordene por id e mostre apenas as 5 primeiras linhas.',
        dica: 'Use JOIN ... ON ligando colegios.id com respostas_pesquisa.colegio_id. Dê apelidos às tabelas (r e c).',
        gabarito: `SELECT r.id, r.serie, c.nome AS colegio FROM respostas_pesquisa r JOIN colegios c ON c.id = r.colegio_id ORDER BY r.id LIMIT 5;`,
        explicacao: `JOIN combina duas tabelas pela chave: colegios.id = respostas_pesquisa.colegio_id. Os apelidos r e c evitam repetir o nome da tabela e deixam claro de onde vem cada coluna.
Um JOIN comum (INNER) só mantém linhas que têm correspondência nas duas tabelas.`
    },
    {
        id: '22', nivel: 3, titulo: 'LEFT JOIN com contagem',
        enunciado: 'Liste todos os colégios cadastrados com a quantidade de respostas de cada um, inclusive os que não têm nenhuma resposta. Retorne id, nome e respostas, ordenado por id.',
        dica: 'Use LEFT JOIN a partir da tabela colegios. Para contar, use a coluna da tabela da direita (r.id).',
        gabarito: `SELECT c.id, c.nome, COUNT(r.id) AS respostas FROM colegios c LEFT JOIN respostas_pesquisa r ON r.colegio_id = c.id GROUP BY c.id, c.nome ORDER BY c.id;`,
        explicacao: `LEFT JOIN mantém todas as linhas da tabela da esquerda (colegios). Quando não há correspondência, as colunas da direita vêm como NULL.
COUNT(r.id) conta somente valores não nulos, então um colégio sem respostas recebe 0. Se fosse COUNT(*), a linha do colégio (com NULLs) seria contada e apareceria 1. Esse é um erro clássico.`
    },
    {
        id: '23', nivel: 3, titulo: 'Pesquisa sem vínculo',
        enunciado: 'Quantas perguntas do formulário NÃO estão vinculadas a nenhuma pesquisa (pesquisa_id vazio)? Retorne uma coluna chamada total.',
        dica: 'Para verificar valor vazio (NULL), use IS NULL.',
        gabarito: `SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id IS NULL;`,
        explicacao: `NULL significa ausência de valor. Não se compara NULL com = ou <>, porque o resultado é "desconhecido" e o WHERE não o aceita.
Por isso se usa IS NULL e IS NOT NULL. O exercício 24 mostra o erro desse tipo de comparação.`
    },
    {
        id: '24', nivel: 3, titulo: 'Armadilha do NULL',
        enunciado: 'Execute: SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id = NULL; O resultado surpreende, pois há perguntas sem pesquisa. Escreva a consulta correta, que conte essas perguntas, e explique a diferença.',
        dica: 'A consulta do enunciado usa = NULL. Troque por IS NULL e compare os resultados.',
        gabarito: `SELECT COUNT(*) AS total FROM perguntas_formulario WHERE pesquisa_id = NULL;`,
        explicacao: `A consulta do enunciado retorna 0, mas existem perguntas com pesquisa_id nulo. Isso acontece porque "NULL = NULL" não é verdadeiro, é desconhecido, e o WHERE só mantém linhas em que a condição é verdadeira.
A consulta correta é a do exercício 23 (WHERE pesquisa_id IS NULL), que retorna 10.`
    },
    {
        id: '25', nivel: 3, titulo: 'Registros órfãos',
        enunciado: 'Liste o campo_chave de todas as perguntas cuja pesquisa_id não corresponde a nenhuma pesquisa existente em pesquisas_lista. Inclua também as perguntas sem pesquisa. Ordene por campo_chave.',
        dica: 'LEFT JOIN de perguntas_formulario para pesquisas_lista e depois WHERE da coluna da direita IS NULL.',
        gabarito: `SELECT pf.campo_chave FROM perguntas_formulario pf LEFT JOIN pesquisas_lista pl ON pl.id = pf.pesquisa_id WHERE pl.id IS NULL ORDER BY pf.campo_chave;`,
        explicacao: `Este é o padrão "anti-join": o LEFT JOIN traz todas as perguntas e, se não existir pesquisa correspondente, pl.id fica NULL. Filtrar por pl.id IS NULL mostra só essas perguntas.
Nesta base, há 11 perguntas sem pesquisa válida: 10 com pesquisa_id NULL e uma (app_mais_usado) apontando para a pesquisa 4, que não existe. Esse é o tipo de problema de integridade que uma chave estrangeira evitaria.`
    },

    // ---------- NÍVEL 4 ----------
    {
        id: '26', nivel: 4, titulo: 'Subconsulta escalar',
        enunciado: 'Mostre id e idade das respostas de alunos com idade acima da média geral de idade. Ordene por id.',
        dica: 'Use uma subconsulta entre parênteses dentro do WHERE: (SELECT AVG(idade) FROM respostas_pesquisa).',
        gabarito: `SELECT id, idade FROM respostas_pesquisa WHERE idade > (SELECT AVG(idade) FROM respostas_pesquisa) ORDER BY id;`,
        explicacao: `A subconsulta devolve um único valor (a média), que é comparado com cada linha. Ela é executada uma vez, porque não depende da linha externa.
Atenção: a média não é inteira. Com média de 16,63 anos, "acima da média" significa idade 17 ou mais.`
    },
    {
        id: '27', nivel: 4, titulo: 'Subconsulta com IN',
        enunciado: 'Mostre id e serie das respostas de séries que têm mais de 50 respostas. Ordene por id.',
        dica: 'Crie primeiro a lista de séries com GROUP BY e HAVING dentro de uma subconsulta, e use IN.',
        gabarito: `SELECT id, serie FROM respostas_pesquisa WHERE serie IN (SELECT serie FROM respostas_pesquisa GROUP BY serie HAVING COUNT(*) > 50) ORDER BY id;`,
        explicacao: `A subconsulta devolve uma lista de séries (as que têm mais de 50 respostas), e IN verifica se a série de cada linha está nessa lista.
Esse mesmo resultado pode ser obtido com um JOIN com a subconsulta, que costuma ser mais rápido em tabelas grandes.`
    },
    {
        id: '28', nivel: 4, titulo: 'CTE com WITH',
        enunciado: 'Usando WITH, calcule para cada série o total de respostas e o percentual sobre o total geral (1 casa decimal). Retorne serie, total e percentual, ordenado por total decrescente.',
        dica: 'Crie um WITH com o agrupamento por série. No SELECT final, calcule o percentual dividindo pelo total de todas as respostas.',
        gabarito: `WITH por_serie AS (
    SELECT serie, COUNT(*) AS total
    FROM respostas_pesquisa
    GROUP BY serie
)
SELECT serie, total,
       ROUND(100.0 * total / (SELECT COUNT(*) FROM respostas_pesquisa), 1) AS percentual
FROM por_serie
ORDER BY total DESC;`,
        explicacao: `WITH cria uma tabela temporária nomeada (CTE) que existe só durante a consulta. Ela deixa o raciocínio em etapas: primeiro agrega, depois calcula o percentual.
A subconsulta (SELECT COUNT(*) ...) no cálculo é o total geral, que é 247 respostas.`
    },
    {
        id: '29', nivel: 4, titulo: 'Window function',
        enunciado: 'Sem usar WITH, mostre para cada série o total de respostas e o percentual sobre o total geral (1 casa decimal), usando uma window function. Retorne serie, total e percentual, ordenado por total decrescente.',
        dica: 'SUM(COUNT(*)) OVER () soma os totais de todos os grupos sem colapsar as linhas.',
        gabarito: `SELECT serie, COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentual
FROM respostas_pesquisa
GROUP BY serie
ORDER BY total DESC;`,
        explicacao: `Window functions (funções de janela) calculam sobre um conjunto de linhas sem reduzi-las como o GROUP BY faz. OVER () significa "sobre todas as linhas do resultado".
SUM(COUNT(*)) OVER () soma os totais de todos os grupos, e esse é o denominador do percentual. O resultado é igual ao do exercício 28, com uma consulta mais curta.`
    },
    {
        id: '30', nivel: 4, titulo: 'CASE para classificar',
        enunciado: 'Classifique as respostas em 3 faixas: "Até 15 anos" (idade menor que 16), "16 a 17 anos" e "18 anos ou mais". Retorne faixa e total, ordenado por faixa.',
        dica: 'CASE WHEN condição THEN valor ... ELSE valor END. Agrupe pela mesma faixa.',
        gabarito: `SELECT CASE WHEN idade < 16 THEN 'Até 15 anos'
            WHEN idade <= 17 THEN '16 a 17 anos'
            ELSE '18 anos ou mais' END AS faixa,
       COUNT(*) AS total
FROM respostas_pesquisa
GROUP BY faixa
ORDER BY faixa;`,
        explicacao: `CASE funciona como um "se ... senão se ... senão" dentro do SQL. As condições são testadas em ordem e a primeira verdadeira define o valor.
GROUP BY faixa usa o apelido da coluna, o que funciona no PostgreSQL. Em outros bancos, repita a expressão CASE no GROUP BY.
A ordenação é alfabética: "16 a 17" vem antes de "18" e "Até" vem por último.`
    },

    // ---------- TEORIA ----------
    {
        id: 'T1', nivel: 5, tipo: 'teoria', titulo: 'Redundância de colegio_nome',
        enunciado: 'A tabela respostas_pesquisa guarda colegio_id e também colegio_nome. Explique por que isso é uma redundância e como resolver usando a normalização (3ª Forma Normal).',
        dica: 'Pergunte: o nome do colégio depende da resposta (id) ou do colégio?',
        gabarito: null,
        explicacao: `O nome do colégio depende do colégio, não de cada resposta. Ele é repetido em todas as linhas de um mesmo colégio, o que gera dependência transitiva: id da resposta → colegio_id → colegio_nome.
Isso viola a 3FN. Se o nome mudar, é preciso atualizar várias linhas (anomalia de atualização). A solução é manter só colegio_id como chave estrangeira e buscar o nome com JOIN na tabela colegios.`
    },
    {
        id: 'T2', nivel: 5, tipo: 'teoria', titulo: 'Chave estrangeira',
        enunciado: 'Identifique, nas tabelas desta base, uma chave primária e uma chave estrangeira. O que a chave estrangeira garante?',
        dica: 'Observe as colunas id e colegio_id.',
        gabarito: null,
        explicacao: `colegios.id é chave primária: identifica cada colégio de forma única e não nula.
respostas_pesquisa.colegio_id é chave estrangeira: deve existir em colegios.id. A restrição de integridade referencial impede, por exemplo, uma resposta apontando para um colégio inexistente.
O exercício 25 mostra o problema oposto: sem essa garantia, uma pergunta pode apontar para uma pesquisa que não existe.`
    }
];
