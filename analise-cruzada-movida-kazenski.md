# Cruzamento de Análises — Movida Analytics Jira × Prof. Kazenski

## 1. Resumo do cruzamento

| Aspecto | Movida Analytics Jira | Prof. Kazenski (professor) |
|---|---|---|
| Framework | Next.js (App Router) | Site estático (HTML + JS módulos) + Firebase |
| Estilo | Tailwind + CSS vars (tokens) | Tailwind (CDN) + style.css |
| Gráficos | Recharts (interativos) | Chart.js (+ datalabels) |
| Tema | Claro/escuro com toggle | Dark fixo |
| Métricas | DORA proxy, velocity, score de devs, GMUD, sprints | Notas, frequência, evolução, painel, visão geral |
| Interatividade | Filtros, views salvas, drag no Gantt, paginação | Filtros, atalhos, PDF |
| Exportação | CSV, imprimir | PDF (jsPDF) |

## 2. O que foi implementado agora (código)
- Adicionado **ECharts 5** via CDN (gráficos mais poderosos e interativos).
- Nova aba **"Dashboard Unificado"** que consolida as 4 abas de métricas (Análise do Aluno, Evolução, Painel, Visão Geral) em uma única visão, com reparenting automático do DOM (sem duplicar ids).
- **Design tokens** estilo Movida adicionados em `style.css` (CSS variables `--kz-*`, classes `.kz-card`, `.kz-kpi`, `.kz-chart-host`, `.kz-section-title`, `.kz-btn-ghost`) com radius 14px, sombra suave e accent âmbar.
- **Toggle de tema claro/escuro** com persistência em localStorage (botão no header) + overrides CSS.
- **Score do Aluno (0–100)** com notas A/B/C/D (40% volume + 30% conclusão + 30% evolução) exibido como KPI na Análise do Aluno.
- **KPIs/cards migrados** para classes `.kz-kpi`/`.kz-chart-host` (7 KPIs + 4 chart hosts).
- **Paginação e ordenação** na tabela de notas (10/25/50 por página, navegação, ordenação por coluna).
- **Views salvas** (filtros) em localStorage com dropdown de carregamento.
- **Indicador de sync** (última atualização) no topo.
- **Gráficos ECharts poderosos**: Ranking de Alunos por Média (barras horizontais com gradiente), Dispersão Notas × Faltas (scatter interativo com tooltip rico) e **Heatmap de Frequência (Alunos × Aulas)** com escala de cores (vermelho=falta, azul=justificado, verde=presente).
- **Métricas DORA da Turma (proxy)**: Taxa de Falha, Frequência de Avaliações, Lead Time, MTTR + **Aging/WIP** (alunos com média <6 ou faltas ≥20%).

## 3. Sugestões de melhorias (priorizadas)

### A. Visual / UX (alto impacto)
1. **KPIs no estilo Movida**: substituir os blocos atuais por `.kz-kpi` com label uppercase tracking, valor grande e hint; adicionar barra de cor no topo (como nos cards do Movida).
2. **Cards de gráfico**: envolver cada canvas em `.kz-chart-host` com título `.kz-section-title` e tooltip de ajuda (atributo `title`), como no Painel.
3. **Tema claro/escuro**: adicionar toggle e persistência em localStorage, seguindo o padrão Movida (detecção de preferência do sistema).
4. **Micro-interações**: hover com brightness, active:scale-97, transições 150ms (já parcialmente).

### B. Gráficos (interatividade)
5. **Migrar gradualmente Chart.js → ECharts** para gráficos mais poderosos: heatmap de frequência (alunos × datas), scatter de notas × faltas, ranking horizontal de alunos por média, funnel de desempenho.
6. **Tooltips ricos**: mostrar valor, percentual e comparação com média da turma.
7. **Zoom/brush**: permitir zoom em séries temporais (frequência por aula) como no Movida (drag no Gantt).
8. **Exportar gráfico como imagem** (ECharts getDataURL) além do PDF.

### C. Consolidação e arquitetura
9. **Unificar filtros**: um único painel de filtros no topo do Dashboard Unificado (Escola/Turma/Disciplina/Trimestre/Período) aplicado a todos os gráficos, como no Movida.
10. **Views salvas**: persistir combinações de filtros em Firestore (como `/api/prefs/views` do Movida) para o professor reutilizar.
11. **Sincronização de dados**: indicador de "sync" (última atualização) e botão de refresh, como o Movida.
12. **Paginação e ordenação** nas tabelas de alunos (como o Movida nas issues recentes).

### D. Métricas novas (inspiradas no Movida)
13. **Score do aluno (0–100)**: 40% volume (entregas) + 30% conclusão + 30% velocidade (cycle vs mediana da turma), com notas A/B/C/D.
14. **DORA-like para a turma**: lead time (tempo entre aplicação e correção), frequência de avaliações, taxa de "falha" (notas < 6), MTTR (tempo para recuperar nota).
15. **Aging/WIP**: alunos com pendências há ≥14 dias (atividades não entregues).
16. **Previsibilidade da turma**: % do planejado entregue por trimestre.
17. **Ranking de alunos** com barra horizontal (pontos e issues concluídas → notas e frequência).

### E. Acessibilidade e performance
18. **Lighthouse**: rodar auditoria de a11y/SEO/best practices (o Movida usa Lighthouse).
19. **Lazy loading** dos gráficos (IntersectionObserver) para não renderizar abas ocultas.
20. **Reduzir re-render**: destruir instâncias Chart.js ao trocar de aba (já parcial).

## 4. Cruzamento de fórmulas (Movida → Kazenski)

| Fórmula Movida | Adaptação Kazenski |
|---|---|
| Score dev = 40% volume + 30% conclusão + 30% velocidade | Score aluno = 40% entregas + 30% conclusão de atividades + 30% evolução de notas |
| DORA Lead time = média created→execution | Tempo médio entre aplicação da avaliação e lançamento da nota |
| Deploy frequency = deploys/semana | Avaliações aplicadas por semana |
| CFR = rollbacks ÷ (encerradas+rollback) | Taxa de notas < 6 ÷ total de notas |
| MTTR = tempo em status de falha | Tempo médio para recuperar nota (reavaliação) |
| Aging = cards abertos ≥14 dias | Alunos com atividades pendentes ≥14 dias |
| Previsibilidade = entregue/planejado | % do conteúdo programado concluído no trimestre |

## 5. Próximos passos sugeridos
1. Aplicar as classes `.kz-kpi`/`.kz-chart-host` nos 4 painéis existentes (refactor incremental).
2. Criar um heatmap ECharts de frequência (alunos × datas) no Painel.
3. Implementar o Score do Aluno (0–100) com notas A/B/C/D.
4. Adicionar toggle de tema claro/escuro.
5. Persistir views salvas em Firestore.
