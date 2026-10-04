# Changelog

Todos as alterações relevantes neste projeto são documentadas neste arquivo (append-only).

## [Unreleased] - Em desenvolvimento

## [v1.6.1] — 2026-10-04
### Corrigido
- Conteúdos: mini player redesenhado em formato quadrado (estilo player de painel) com título/artista sincronizados — antes era um pill pequeno sem nome da faixa

## [v1.6.0] — 2026-10-04
### Adicionado
- Gestão de Contas (Professor Tech): subaba para aprovar e vincular contas criadas via login Google que ficaram pendentes — permite definir o nome que o site todo usa, escola, turma e disciplina. Antes disso o aluno se cadastrava como `Pendente` e precisava de ajuste manual no Firestore.
- Cores nas subabas do Professor Tech, agrupando assuntos: verde (aula/frequência), laranja (APOIA/anotações), céu (sorteios), roxo (avaliações), índigo (gestão/cadastro) e vermelho (reset).

## [v1.5.0] — 2026-10-04
### Adicionado
- Painel (Professor Tech): análise dos moderadores — seção "Análise dos Moderadores" abaixo de Diferenças por Trimestre, com a equipe de moderadores, blogs criados, votações criadas, views e votos, filtrada pelo período selecionado (7/30/90 dias ou todo o período), com gráficos de pizza por moderador e tabela de resumo

## [v1.4.1] — 2026-10-04
### Corrigido
- Tela do Painel: gráfico "Média por Grupo" agora tem altura fixa (h-80), sem esticar a página ao crescer

### Adicionado
- Painel: guia "Como interpretar os números (média, mediana, taxas e gráficos)" e ícones informativos em cada KPI e título de gráfico
- Painel: detalhes por faixa de nota e de frequência, listando os alunos em cada grupo

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
