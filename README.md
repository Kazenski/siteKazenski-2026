# Site Prof. Kazenski 2026

> Plataforma educacional e portfólio do Prof. Kazenski — cursos, projetos, gestão escolar e permissões por perfil.

---

## Visão Geral

Plataforma educacional completa (SPA) com gestão de cursos, projetos, notas, frequência, caderno digital, avaliações e painéis administrativos. Suporte a múltiplos perfis com permissões granulares via Firebase.

---

## Estrutura do Projeto

```text
/
├── index.html                 # SPA principal (Single Page Application)
├── style.css                  # Estilos globais + customizações Tailwind
├── README.md                  # Esta documentação
├── CHANGELOG.md               # Histórico de versões (append-only)
├── changelog.json             # Versão estruturada do changelog
│
├── js/                        # Lógica da aplicação (ES6 Modules)
│   ├── main.js                # Roteamento, auth, menu dinâmico
│   │
│   ├── core/                  # Núcleo do sistema
│   │   ├── firebase.js        # Config Firebase (Auth/Firestore/RTDB)
│   │   ├── utils.js           # Utilitários compartilhados
│   │   └── validacao.js       # Validações globais
│   │
│   ├── inicio/                # Aba "Início"
│   │   └── inicio.js
│   │
│   ├── conteudos/             # Aba "Conteúdos"
│   │   └── conteudosAula.js   # Acervo, músicas, podcasts
│   │
│   ├── moderadorTech/         # Aba "Moderador Tech"
│   │   ├── cadastroTitulos.js
│   │   └── blogTecnico.js
│   │
│   ├── pesquisasTech/         # Pesquisas técnicas
│   │   └── pesquisasTech.js
│   │
│   ├── projetos/              # Aba "Projetos"
│   │   └── projetos.js
│   │
│   ├── atualizacoes/          # Aba "Atualizações"
│   │   └── atualizacoes.js
│   │
│   ├── conexaoAluno/          # (Oculta) Rede social alunos
│   │   └── conexaoAluno.js
│   │
│   ├── alunoTech/             # Área do Aluno
│   │   └── perfilTech.js      # Dashboard: notas, caderno, kanban, calendário
│   │
│   ├── moderadorTech/         # Painel moderação
│   │   ├── cadastroTitulos.js
│   │   └── blogTecnico.js
│   │
│   └── professorTech/         # Painel Professor
│       └── professorTech.js   # Chamada, notas, APOIA, sorteios, relatórios
│
├── images/                    # Assets visuais
│   ├── background/
│   │   └── background-oficial.jpg
│   ├── favicon/
│   │   └── faviconKazenski.png
│   └── aura/
│       └── aura.png
│
└── tools/                     # Ferramentas de build/validação
    ├── build_changelog.py
    ├── check_all.ps1
    ├── check_syntax.ps1
    ├── lint_colado.js
    ├── html_balance.py
    └── harness/               # Testes visuais (PDF, charts, PDFs)
```

---

## Stack Tecnológico

| Categoria | Tecnologias |
|-----------|-------------|
| **Frontend** | HTML5, CSS3 (Tailwind via CDN), JS ES6 Modules |
| **Backend/BaaS** | Firebase 10.8.1 (Auth, Firestore, Realtime DB, Storage) |
| **Gráficos** | Chart.js |
| **PDF** | jsPDF + autoTable |
| **Imagens** | Cropper.js |
| **Ícones** | FontAwesome 6 |
| **Fonts** | Google Fonts: `Cinzel` (títulos) + `Inter` (corpo) |
| **Build/Validação** | Python 3, PowerShell, Node.js |

---

## Sistema de Permissões (`MENU_ARCHITECTURE`)

O menu e o acesso são reconstruídos dinamicamente no `main.js` com base nos **roles** do Firebase (`users/{uid}`).

| Rota / Aba | Visitantes | Alunos | Moderadores | Professores | Coordenação | Admin |
|------------|:----------:|:------:|:-----------:|:-----------:|:-----------:|:-----:|
| **Início / Conteúdos / Projetos / Atualizações** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Aluno Tech** (dashboard do aluno) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Moderador Tech** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Professor Tech** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Admin Tech** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Conexão Aluno** | Oculta do menu | | | | | |

> **Roles no Firestore (`users/{uid}`)**: `Admin`, `Professor`, `Coordenacao`, `Moderador`, `Aluno`, `Visitante` (booleans).

---

## Principais Funcionalidades por Módulo

### **Aluno Tech** (`perfilTech.js`)
- Dashboard: notas, frequência, dispersão, evolução
- **Caderno Digital** estilo Evernote (sidebar, tags, busca, pin, cores)
- Kanban de atividades, Calendário, Mochila, Coleção TCG
- **Perfil**: foto maior, banner personalizável (posição/cor), título editável

### **Professor Tech** (`professorTech.js`)
- Chamada digital com status (P/F/J) + observações
- Notas por disciplina/trimestre (N1–N4 + extras)
- **APOIA**: encaminhamento em lote à direção + PDF oficial
- **Sorteios**: individual (sem reposição) + equipes (exclusões)
- **Painel de Dados**: grid responsivo, gráficos (progressão, dispersão, frequência), KPIs
- **Análise de Moderadores**: blogs, votações, views, votos + gráficos de pizza
- Relatórios de frequência (PDF profissional), Avaliação 360°, Grade horária, Avisos, Logs, Reset Anual

### **Avaliações Digitais** (`avaliacoesDigitais.js`)
- Criação de provas/trabalhos com banner, anexos, links
- Entrega pelo aluno (texto + arquivos)
- Correção com nota + devolutiva + histórico de comentários
- Grid responsivo de cards (2 colunas), modal amplo (`max-w-6xl`)

### **Conteúdos** (`conteudosAula.js`)
- Acervo: Materiais, Músicas (player global), Podcasts
- **Mini-player** quadrado (estilo YouTube) com capa, título, artista, controles
- Admin: upload de banner/capa, cropper, cores

### **Moderador Tech**
- Blog técnico com aprovação de pares
- Cadastro de títulos/condecorações
- Métricas de moderação (posts, aprovações, views)

---

## Segurança & Sessão

- **Auth**: Firebase Auth (Email/Senha + Google OAuth + linkWithPopup)
- **Sessão**: Realtime DB expira após **15 min** de inatividade
- **Regras Firestore**: Por role + ownership (leitura/escrita própria)
- **CSP**: Tailwind via CDN + FontAwesome/Google Fonts permitidos

---

## Deploy & CI/CD

| Ambiente | Branch | URL |
|----------|--------|-----|
| **Produção** | `main` | `https://kazenski.github.io/siteKazenski-2026/` |
| **Sandbox/Teste** | `test-prof-impr` | `https://kazenski.github.io/siteKazenski-test/` |

- **GitHub Actions**: `deploy.yml` (produção) + `deploy-sandbox.yml` (testes)
- **Secrets**: `VITE_FIREBASE_*` injetados no `js/core/firebase.js` via `sed` no build
- **Cache**: GitHub Pages `max-age=600` (10 min) → use `Ctrl+Shift+R` após deploy

---

## Qualidade & Validação

```powershell
# Suite completa (PowerShell)
.\tools\check_all.ps1
```

| Check | Ferramenta | O que valida |
|-------|------------|--------------|
| Sintaxe JS | `tools/check_syntax.ps1` | Todos os `.js` validados como **ES Module de verdade** |
| Lint "palavra colada" | `tools/lint_colado.js` | `letvar`, `constvar`, `returnvalor`... |
| Testes unitários | `tools/test_*.js` | Absenteísmo, estatísticas, PDFs |
| Referências DOM | `tools/check_refs.py` | `els.*` sem declaração, `getElementById` sem ID no HTML |
| Balanceamento HTML | `tools/html_balance.py` | Tags abertas/fechadas |
| Sanitização PDF | `tools/harness/` | jsPDF + autoTable (rodapé, largura, páginas) |

> ⚠️ **Não use `node --check *.js` neste projeto.** Todos os arquivos começam com
> `import`, e nesse caso o Node detecta sintaxe de módulo, **sai com código 0 sem
> verificar nada** — foi assim que um `SyntaxError` real chegou em produção.
> Use sempre `tools/check_syntax.ps1`, que copia o arquivo para `.mjs` antes de validar.

---

## Histórico de Versões (Changelog)

| Versão | Data | Destaques |
|--------|------|-----------|
| **v1.6.7** | 2026-10-04 | Aluno Tech volta a carregar (erro de sintaxe crítico), validador de sintaxe real, README restaurado |
| **v1.6.6** | 2026-10-04 | Aluno Tech: Caderno Digital estilo Evernote, foto maior, banner 3 ações |
| **v1.6.5** | 2026-10-04 | Feed de Atualizações redesenhado (acordeão fluido, grid 2-col, modal largo) |
| **v1.6.4** | 2026-10-04 | Avaliações: cards refatorados, modal `max-w-6xl` |
| **v1.6.3** | 2026-10-04 | Avaliações: grid de 2 colunas |
| **v1.6.2** | 2026-10-04 | Avaliações: grid 2-col + layout largo |
| **v1.6.1** | 2026-10-04 | Mini-player quadrado (YouTube style) |
| **v1.6.0** | 2026-10-04 | Gestão de Contas + Cores subabas Professor |
| **v1.5.0** | 2026-10-04 | Painel: Análise Moderadores (pizza, período) |
| **v1.4.1** | 2026-10-04 | Painel: gráfico altura fixa + guia/ícones/tooltips |
| **v1.4.0** | 2026-10-04 | Evolução, Painel, APOIA lote, Sorteios, Export TXT |
| **v1.3.0** | 2026-10-03 | Login Google, migração contas, votação |
| **v1.2.0** | 2026-10-03 | Migração Google, LGPD/ECA, manutenção |

>  **Completo**: `CHANGELOG.md` | `changelog.json` (gerado via `python tools/build_changelog.py`)

---

##  Testes & Harnesses

| Harness | Comando | O que testa |
|---------|---------|-------------|
| **Boot** | `node tools/harness/build_boot.js` | `window.profAPI` ≥ 125 chaves, 0 erros console |
| **Evolução** | `node tools/harness/build_evolucao.js` | KPIs, gráficos (progressão, dispersão, freq) |
| **PDF** | `node tools/harness/build_pdf.js` | jsPDF+autoTable: rodapé, largura, multipágina |
| **APOIA/Sorteios** | `node tools/harness/build_apoia.js` | PDF encaminhamento, preview, chips, exclusões |

> Execute: `python -m http.server 8791` → abra `http://localhost:8791/h_*.html`

---

## Convenções de Commit

```
<tipo>(escopo): descrição curta

Corpo explicativo (opcional)

Arquivos: arquivo1, arquivo2
```

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudança de comportamento |
| `chore` | Manutenção (deps, configs, CI) |
| `docs` | Documentação |
| `style` | Formatação, CSS |
| `test` | Testes |

---

## 🔧 Comandos Úteis

```bash
# Validação completa
powershell -ExecutionPolicy Bypass -File tools/check_all.ps1

# Sintaxe ESM de todos os .js (NÃO usar `node --check` aqui)
powershell -ExecutionPolicy Bypass -File tools/check_syntax.ps1

# Regenerar changelog.json
python tools/build_changelog.py

# Verificar HTML
python tools/html_balance.py

# Verificar referências JS/DOM
python tools/check_refs.py

# Lint "palavra colada"
node tools/lint_colado.js js/professorTech/professorTech.js

# Servidor local para harnesses
python -m http.server 8791
```

---

## Licença

Projeto educacional privado — Prof. Kazenski 2026.  
Uso interno da instituição. Não redistribuir sem autorização.

---

> **Última atualização**: 2026-10-04 | **Versão atual**: `v1.6.7`  
> **Deploy**: `https://kazenski.github.io/siteKazenski-2026/` | **Sandbox**: `https://kazenski.github.io/siteKazenski-test/`
