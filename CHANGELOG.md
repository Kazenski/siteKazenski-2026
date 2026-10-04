# Changelog

Todos as alterações relevantes neste projeto são documentadas neste arquivo (append-only).

## [Unreleased] - Em desenvolvimento

## [v1.6.3] — 2026-10-04
### Ajuste visual
- Avaliações Digitais: cards agora em no máximo 2 colunas lado a lado (em vez de 5 colunas estreitas), com espaçamento de `gap` sutil e cards de mesma altura; o modal de detalhes ("Abrir Painel") ficou mais largo (`max-w-6xl`) para aproveitar a largura da tela.
- Cards refatorados: padding maior (`p-5 md:p-6`), cantos mais arredondados (`rounded-2xl`), badges mais compactos, descrição com `line-clamp-2` e espaçamento melhor entre seções; botões de staff (editar/visibilidade/excluir) ficaram mais sutis e compactos para não sobrepor o conteúdo. Arquivos: `index.html`, `js/avaliacoesDigitais/avaliacoesDigitais.js`, `CHANGELOG.md`, `changelog.json`.

## [v1.6.2] — 2026-10-04
### Ajuste visual
- Avaliações Digitais (aba ao lado do Aluno Tech): antes era uma lista estreita em coluna única; agora usa um grid de cards lado a lado (`repeat(auto-fill, minmax(340px, 1fr))`) para aproveitar a largura da tela, com estados "carregando"/"vazio" ocupando a linha toda. Arquivos: `index.html`, `CHANGELOG.md`, `changelog.json`.

## [v1.6.1] — 2026-10-04
### Corrigido
- Conteúdos (Conteúdos > Músicas/Podcasts): o mini player flutuante, que era um pill pequeno e sem nome, foi redesenhado como um card quadrado estilo painel de mídia, exibindo a capa (ou ícone do conteúdo), o título e o artista da faixa, transporte (anterior, play/pausa, próxima), expandir e fechar. Arquivos: `index.html`, `js/conteudos/conteudosAula.js`, `CHANGELOG.md`, `changelog.json`.

## [v1.6.0] — 2026-10-04
### Adicionado
- Gestão de Contas (Professor Tech): nova subaba que lista contas criadas via login Google que ficaram como `role: 'Pendente'` (sem `Aluno: true`), e permite, por linha, **aprovar e vincular** (definindo o nome canônico usado em todo o sistema, escola, turma e disciplina) ou **rejeitar**. Antes era necessário ajustar manualmente o Firestore. Arquivos: `index.html`, `js/professorTech/professorTech.js`.
- Cores nas subabas do Professor Tech agrupando assuntos: verde (Chamada, Notas, Extras, Análise Aluno, Painel, Evolução, Visão Geral, Exportar Freq.), laranja (APOIA, Anotações), céu (Sorteios), roxo (Aplicar, Avaliação 360, Provas/Trabalhos), índigo (Ferramentas, Vincular, Gestão de Contas, Grade Horária, Avisos, Logs, Kaz IA, Forja TCG) e vermelho (Reset Anual). Arquivos: `index.html`, `js/professorTech/professorTech.js`.

## [v1.5.0] — 2026-10-04
### Adicionado
- Painel do Professor Tech: nova seção "Análise dos Moderadores" abaixo de "Diferenças por Trimestre", com cartões de moderadores, blogs criados, votações criadas, views e votos, resumo tabular por moderador e três gráficos de pizza (blogs, views e votos por moderador), tudo filtrado pelo período selecionado (7 / 30 / 90 dias ou todo o período). Arquivos: `index.html`, `js/professorTech/professorTech.js`.

## [v1.4.1] — 2026-10-04
### Corrigido
- Painel do Professor Tech: o gráfico "Média por Grupo" tinha altura ilimitada e esticava a página para baixo; agora tem altura fixa (`h-80`) e mensagem de estado vazio dedicada. Arquivos: `index.html`, `js/professorTech/professorTech.js`.

### Adicionado
- Painel: guia colapsável "Como interpretar os números (média, mediana, taxas e gráficos)". Arquivos: `index.html`.
- Painel: detalhes por faixa de notas e por faixa de frequência listando os alunos de cada subfaixa. Arquivos: `index.html`, `js/professorTech/professorTech.js`.
- Painel: ícone informativo com título explicativo em cada KPI e nos títulos dos gráficos. Arquivos: `index.html`, `js/professorTech/professorTech.js`.

## [v1.4.0] — 2026-10-04
### Adicionado
- Nova subaba **Evolução** no Professor Tech: progressão das notas no trimestre, dispersão geral, média por disciplina, frequência por aula no período e tabela de notas
- Relatório analítico de faltas com alertas: 5 faltas seguidas ou 7 alternadas
- Nova subaba **Painel** de Dados no Professor Tech: KPIs (total de alunos, frequência média, média geral, dispersão, alunos com APOIA e com anotações), gráficos no estilo da Evolução (progressão, dispersão, média por disciplina, frequência por aula), comparativos por faixa de nota e de frequência, média por escola/turma/disciplina e diferenças por trimestre
- APOIA em lote: encaminhamento à direção com a lista de alunos em alerta, registro automático em todos os listados e PDF com a mesma identidade visual do diário
- Sorteio individual sem reposição: o aluno sorteado sai da possibilidade de novo sorteio até o professor resetar, com lista de já sorteados
- Exclusão de alunos nas equipes do sorteio de grupos
- Exportação de grupos em TXT

### Alterado
- APOIA: botão "Novo Registro" ficou acessível apenas como "Documento individual (avançado)" no rodapé do modal de encaminhamento

### Corrigido
- Erro de referência (`ReferenceError`) em `abrirEncaminhamento` que derrubava toda a aba Professor Tech, com `window.profAPI` vazio
- Rodapé dos PDFs agora mostra "Página X de Y" correto em todas as páginas

### Verificado
- `tools/lint_colado.js` (+ self-test) pega palavra-chave colada em identificador, classe de erro que era invisível para o `node --check`
- `tools/harness/build_boot.js` valida que todo o módulo do Professor Tech inicializa sem erro

## [v1.3.0] — 2026-10-03
### Adicionado
- Login com Google ativado no fluxo de autenticação (link com conta existente via linkWithPopup, preservando UID)
- Registro da ativação do login com Google no histórico de atualizações
- Melhorias na votação pública (exibição e painel de moderação)

### Alterado
- Ajustes de configuração do Firebase e injeção de secrets no GitHub Pages
- Hardening do getter de variáveis de ambiente (compatibilidade com Vite/GitHub Pages)

### Corrigido
- Estabilização pós-migração de login
- Carregamento da página de Atualizações (robustez com estado vazio/carregando)

## [v1.2.0] — 2026-10-03
### Adicionado
- Migração de contas existentes para login com Google (fluxo guiado enquanto logado, mantendo UID)
- Página /migrar-conta com tutorial passo a passo e instrução sobre uso excepcional de email/senha até 31/12/2026
- Suporte a login duplo (Email+Senha + Google) até 31/12/2026
- Registro de aceite de Termos, LGPD e ECA Digital com versionamento
- Preferência/educação para uso de e-mail institucional (sem bloqueio na fase de migração)
- Coleta/validação de Nome e Sobrenome para garantir consistência em chamada/notas/boletins
- Botão "Termos e Políticas" na página inicial para releitura a qualquer momento
- Modo de manutenção ativável (flag Firestore) para validações com calma
- CHANGELOG.md, RELEASE-NOTES-DETALHADOS.md e UPDATE-LOG.md (append-only)

### Alterado
- Tela de login: botões lado a lado (Email+Senha | Google)
- Redirecionamentos pós-login conforme status de migração
- Configuração do Firebase movida para variáveis de ambiente (VITE_*) com fallback para compatibilidade local

### Segurança
- Instruções/workflow para injeção de secrets no GitHub Actions
- Orientação para restrição de API Key (HTTP referrers + APIs mínimas necessárias)

### Documentação
- Logs, changelog e informações de atualização detalhados (append-only)

### Observação
- Nenhum dado acadêmico foi alterado ou movido. Alterações aditivas, compatibilidade total mantida até 31/12/2026
