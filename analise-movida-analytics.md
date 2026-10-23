# Análise — Movida Analytics Jira

Site: https://analytics-for-devs-jira.dev.movidacloud.com.br/
Data da análise: 2026-10-23
Modo: somente leitura (nenhuma alteração no site).

## 1. Visão geral
Aplicação web (PWA) de consolidação de desempenho Jira para devs, squads e QA da Movida.
Autenticação via Atlassian OAuth (escopos de leitura: jira-work, jira-user, board-scope, sprint, project).
App Router (Next.js) com Server Components (RSC) e client-side navigation.
Idioma pt-BR. Tema claro/escuro com toggle manual + detecção de preferência do sistema.

## 2. Stack e bibliotecas identificadas
- Framework: Next.js (App Router, Turbopack) — chunks em `/_next/static/chunks/*`.
- Linguagem: TypeScript/React (inferido pelos chunks e classes).
- Estilização: Tailwind CSS (utility classes) + CSS custom properties (design tokens).
- Gráficos: Recharts (classes `recharts-*`, containers responsivos, tooltips, legendas, grids).
- Fonte: Plus Jakarta Sans (via `next/font`, variável `--font-jakarta`).
- Ícones: SVG inline (sem lib externa detectada — não há lucide/radix/heroicons).
- PWA: manifest.webmanifest, ícones 192/512, display standalone.
- Observabilidade: Sentry (referência no login Atlassian; não confirmado no app principal).
- Integrações: Jira Cloud REST (via OAuth), GitLab (configurável, via token no .env).

Bibliotecas NÃO detectadas (busca no DOM/JS): Radix, shadcn/ui, Tremor, TanStack Query, SWR, Zod, Zustand, Jotai, Redux, Axios, date-fns, dayjs, framer-motion (apenas menção framer no bundle, sem uso visível), cmdk, vaul, embla.

## 3. Design tokens (CSS variables)
Arquivo CSS único: `/_next/static/chunks/0_y6s7su9ywfi.css`.

Tema claro (`:root`):
- --bg: #f7f5f3
- --bg-elevated: #fff
- --surface: #fff
- --surface-2: #f3ebe6
- --border: #e8ddd6
- --fg: #1a1410
- --fg-muted: #6b5e56
- --accent: #ff5000 (laranja Movida)
- --accent-soft: #ffe5d6
- --accent-fg: #c43d00
- --chart-1: #ff5000
- --chart-2: #ff8a3d
- --chart-3: #1a1410
- --chart-grid: #ebe4df
- --danger: #b91c1c
- --shadow: 0 1px 2px #1a14100a, 0 8px 24px #1a14100d
- --radius: 14px
- --font-sans: var(--font-jakarta), "Segoe UI", sans-serif

Tema escuro (`.dark`):
- --bg: #120e0c
- --bg-elevated: #1a1410
- --surface: #211a15
- --surface-2: #2a211b
- --border: #3d3129
- --fg: #f7f0eb
- --fg-muted: #b0a097
- --accent: #ff5000 (mantém)
- --accent-soft: #3d1f12
- --accent-fg: #ffb089
- --chart-1: #ff5000
- --chart-2: #ff8a3d
- --chart-3: #fbbf24
- --chart-grid: #2f261f
- --danger: #f87171
- --shadow: 0 1px 2px #00000059, 0 12px 32px #00000047

Manifest: background_color #f7f5f3, theme_color #ff5000, lang pt-BR, display standalone.

## 4. Rotas/páginas (App Router)
- `/` → Resumo (KPIs, DORA, velocity, desempenho)
- `/people` → Desenvolvedores (score, ranking, aging)
- `/git` → Git (métricas de código, requer config GitLab)
- `/epics` → Cronograma (épicos, Gantt, SP, risco)
- `/gmud` → GMUD (mudanças, score, sistemas, BU/área)
- `/sprints` → Sprints (kanban, histórico, previsibilidade, ROI IA)
- `/setup/boards` → Configurar boards (seleção de boards Jira)
- `/api/sync` → status de sincronização
- `/api/prefs/views` → views salvas do usuário

Navegação principal: Resumo, Devs, Git, Cronograma, GMUD, Sprints + "Configurar boards", "Baixar app", "Sair".

## 5. Métricas por página

### Resumo (/)
KPIs: TOTAL ISSUES, ABERTAS, EM PROGRESSO, DONE, CYCLE MÉDIO.
Filtros: Ano, Data de, Data até, Busca, Projeto, Pessoa, Sprint, Épico, Squad, Status + atalhos Hoje/Esta semana/Este mês.
DORA (proxy, não certificação): base 18537 eventos ~659 dias; prefere GMUD quando houver cache.
- LEAD TIME (HIGH): 3.3 d — proxy GMUD: média created → executionDate.
- DEPLOY FREQUENCY (ELITE): 196.9/sem — GMUDs com data de execução por semana.
- CHANGE FAILURE RATE (ELITE): 5% — rollbacks ÷ (ENCERRADA + ROLLBACK) no cache GMUD.
- MTTR (N/A): tempo médio em status de falha/rework/rollback no statusHistory.
WIP/aging: cards abertos com ≥14 dias (idade desde started/created); lista com key, título, dias.
Tendência semanal: 1 semana · velocity, horas e GMUD; gráfico CFR GMUD %, Horas, Velocity (pts); tabs por projeto (PDM, GEDC, SGTF, GAM, AGTF, SNPSM, FRSN, ADCGTF) com pts/sprint ou issues/sprint.
Histórico de sprints: entregas por sprint · 8 projetos; métricas SPRINTS, TOTAL (PTS), MÉDIA POR SPRINT, melhor sprint, ÚLTIMA SPRINT e delta vs média; gráfico de barras por sprint.
Desempenho dos devs: pontos e issues concluídas (bar horizontal por dev).
Desempenho por squad: componentes do Jira · pontos e issues concluídas.
Issues recentes: tabela Key, Resumo, Status, Cycle (paginada).

### Desenvolvedores (/people)
Filtros: Ano, Mês, Data de, Data até, Busca, Projeto, Pessoa, Sprint, Épico, Squad, Status + atalhos.
Score por entregas (0–100): 40% volume · 30% conclusão · 30% velocidade (cycle vs mediana da equipe). Volume compara entregas ao topo do time no período. Sem cycle time, score usa só volume e conclusão.
Notas: A ≥80, B ≥65, C ≥50, D <50.
Tabela ranking: #, Desenvolvedor, Score, Nota, Pts done, Issues done, Conclusão %, Cycle.
Ranking de desempenho: pontos e issues concluídas por pessoa (bar).
Tempo parado por status: maior ofensor (ex.: GMUD 84878.8d, 53.3%); total em dias; stacked bar por status.
Tempo parado por desenvolvedor: stack de dias em cada status (exclui Done).
Tabela por desenvolvedor: Score, Total, Abertas, Em prog., Done, Cycle.
Issues (tabela completa).

### Git (/git)
Métricas de código dos repositórios selecionados.
Filtros: Ano, Mês, DE, ATÉ, Aplicar + atalhos Este mês/Mês passado/Ano atual.
Sync Git por período (cache acumula recortes: março + abril etc.); commits e MRs respeitam período.
Configuração em 4 passos: (1) Token GitLab no .env, (2) Repositórios selecionados, (3) Time definido (opcional), (4) Sync Git executado.
Sem dados quando não configurado (0 repo(s)).

### Cronograma (/epics)
116 épicos · 57% done · 594 SP restantes · T4 2026 · 25 sprints.
KPIs: ÉPICOS, 919 cards no recorte, % DONE, SP RESTANTES, EM RISCO (sprint no fim com trabalho aberto).
Gantt interativo: arrastar barra para mover prazo, pontas para alongar/encurtar; alterações ficam só no Analytics. Exportar foto.
Filtros: Ano, Trimestre, Data de, Data até, Busca, Projeto, Pessoa, Sprint, Épico, Status + atalhos.

### GMUD (/gmud)
Board GMUD · ano 2026 · sync há 15 min.
KPIs: NO FILTRO, EXECUÇÃO HOJE, EM ANDAMENTO, EMERGENCIAIS, ROLLBACKS, REPROVADAS, ENCERRADAS, CANCELADAS, SCORE (94.5).
Filtros: Dia/Mês/Ano, operação (Hoje/Ontem/Esta semana/Este mês), Em andamento, alertas.
Análise e gráficos: alertas operacionais (CFR ≥15%, área com rollback ≥25% mín.3, aberta ≥14 dias); GMUDs abertas ≥14 dias.
Score de saúde GMUD: parte de 100; rollbacks/emergenciais pioram. Fórmula: 100 −1.3 por rollbacks (2.6%) −2.6 por emergenciais (6.5%) −1.6 por reprovadas (16.1%) = 94.5. Faixas: Excelente ≥90, Bom ≥75, Atenção ≥50, Crítico <50.
Planejadas vs Emergenciais: PLANEJADAS 8050 (93.5%, 5752 encerradas), EMERGENCIAIS 564 (6.5%, 466 encerradas), ROLLBACK 225 (2.6%), CANCELADAS 699 (8.1%), REPROVADAS 1390 (16.1%), ABERTAS PLANEJ. 80, ABERTAS EMERG. 2.
Sucesso vs Rollback: 6443 concluídas · 96.5% ENCERRADA · 3.5% ROLLBACK.
Rankings: sistemas (ambientes afetados), por BU (TI, GTF, RAC, FIN, OP, ZERO KM, SN, SAC, Outros), emergenciais por BU, rollbacks por BU, por área solicitante (TI - Infraestrutura, GTF - Experiência do Cliente, TI - Arquitetura, FIN - Arrecadação, etc.), emergenciais por área, rollbacks por área.
Tabela de GMUDs com colunas: Key, Resumo, Tipo, Status, Criador, Banco de Dados, Var. ambiente, Ambiente afetado, Histórias relacionadas, Criação, Execução. Agrupamento por squad colapsável.

### Sprints (/sprints)
Todos os sprints do filtro.
Histórico de sprints: entregas por sprint · 8 projetos; PDM 84.6 pts/sprint, GEDC 34.4, GAM 28.8, SGTF 35.3, AGTF 113 issues/sprint, SNPSM 1 pts/sprint, FRSN 1 issues/sprint, ADCGTF 0.1 pts/sprint.
Métricas: SPRINTS, TOTAL (PTS), MÉDIA POR SPRINT, melhor sprint, ÚLTIMA SPRINT, delta vs média.
Concluídas por projeto: tarefas com status done no filtro (2.458 done).
Métricas da equipe: previsibilidade (0% = Investigar; 85–100% Saudável, 70–84% Atenção, <70% Investigar); cycle time mediano.
ROI de IA: painel oculto (Exibir).
KPIs globais (TOTAL ISSUES 3095, ABERTAS 398, EM PROGRESSO 239, DONE 2458, CYCLE MÉDIO 55.2d).
Kanban por status (A Fazer, etc.) com cards: key, pontos, título, responsável, tipo, subtarefas, dias neste status.
Tabela de issues (Key, Resumo, Status, Cycle) paginada.

## 6. API endpoints observados
- GET /api/sync → { ok, progress: { status, phase, message, percent } } (status de sincronização idle).
- GET /api/prefs/views → { ok, views: [] } (views salvas do usuário).
- Rotas RSC (Next.js) `?_rsc=...` para navegação client-side (sprints, gmud, epics, git, people, etc.) — falham quando acessadas diretamente fora do fluxo SPA.
- Auth: /api/auth/callback (callback OAuth Atlassian).

## 7. Lógicas de métricas (inferidas)
- Score dev (0–100) = 40% volume + 30% conclusão + 30% velocidade (cycle vs mediana da equipe). Volume = entregas comparadas ao topo do time no período. Sem cycle time, usa apenas volume e conclusão.
- Notas: A≥80, B≥65, C≥50, D<50.
- Cycle time: mediano por dev/equipe; aging usa idade desde started/created (≥14 dias = WIP envelhecido).
- DORA (proxy): Lead time = média created→executionDate (GMUD); Deploy frequency = GMUDs com data de execução por semana; CFR = rollbacks ÷ (ENCERRADA+ROLLBACK); MTTR = tempo médio em status de falha/rework/rollback no statusHistory.
- Score GMUD = 100 −1.3×%rollbacks −2.6×%emergenciais −1.6×%reprovadas; faixas Excelente/Bom/Atenção/Crítico.
- Previsibilidade (sprint) = entregue/planejado (85–100% saudável).
- Aging/WIP: cards abertos com ≥14 dias.
- Histórico de sprints: média de pontos por sprint, melhor sprint, última sprint e delta vs média.

## 8. Observações de design
- Layout: container max-w, grid responsivo (1/2/3/4/5 colunas), cards com borda, sombra suave, radius 14px.
- Tipografia: Plus Jakarta Sans; hierarquia com text-xs uppercase tracking para labels de KPI.
- Cores: accent laranja Movida (#ff5000) sobre fundo off-white (#f7f5f3); dark mode com superfícies marrons escuras.
- Gráficos Recharts com paleta chart-1/2/3 e grid claro.
- Interações: filtros colapsáveis, views salvas, exportar CSV, imprimir relatório, paginação 10/25/50/100, drag no Gantt.
- Acessibilidade: labels, aria; Lighthouse não executado (modelo não suporta imagem, mas DOM analisado).
- Sem erros no console (apenas warning de preload de fonte).

## 9. Conclusão
Aplicação robusta de analytics Jira com métricas de DORA (proxy), velocity, aging, score de devs, GMUD e sprints. Stack enxuta: Next.js + Tailwind + Recharts + Plus Jakarta Sans, sem UI kit externo. Design consistente via tokens CSS e tema claro/escuro. Integração Jira via OAuth e GitLab opcional.
Nenhuma alteração foi realizada no site (conforme solicitado).
