# CHANGELOG — Site Prof. Kazenski 2026

> **REGRA DESTE ARQUIVO (NUNCA QUEBRAR):**
> Este arquivo é um **registro técnico cumulativo e SOMENTE DE ADICIONAÇÃO**.
> - **NUNCA** apague, trunque ou sobrescreva entradas anteriores.
> - **SEMPRE** adicione a nova entrada **no topo**, logo abaixo do separador `---`,
>   mantendo o separador `---` entre a entrada nova e o histórico.
> - **SEMPRE** incremente a versão. Use SemVer: `MAIOR.MENOR.PATCH`
>   - `MAIOR` → mudança quebrava/incompatível (ex.: refatoração de layout ou de API global)
>   - `MENOR` → funcionalidade nova ou melhoria visual relevante
>   - `PATCH` → correção de bug, ajuste fino ou documentação
> - **SEMPRE** preencha: versão, data, autor, escopo, arquivos tocados e detalhes técnicos.

---

## [v1.5.0] — 2026-10-02 — Autor: Equipe Kazenski (via assistente de IA)

### Escopo
Redesign estrutural dos módulos **Início** e **Conteúdos**, com correção de bugs
de layout e melhoria da imersão/responsividade.

### Arquivos tocados
- `index.html`
- `style.css`
- `js/inicio/inicio.js`
- `js/conteudos/conteudosAula.js`
- `CHANGELOG.md` (novo)

---

### 🐛 CORREÇÕES

#### 1. `[CRÍTICO]` Corte lateral direito que comprimia a tela em Conteúdos
- **Sintoma:** a coluna de conteúdo ocupava apenas ~53% da largura da viewport
  (ex.: `691px` de `1296px` úteis), deixando um vazio enorme à direita.
- **Causa raiz:** `#conteudos-content` é `.tab-content`, e a regra global
  `.tab-content.active { display: flex; }` aplica `display:flex` **sem**
  `flex-direction`. O padrão do CSS é `row`, então o wrapper interno
  (`div.h-full.flex.flex-col.pb-20`) virava um **flex item** e encolhia até o
  conteúdo (`flex: 0 1 auto`) em vez de ocupar `100%` da largura.
- **Correção:** `#conteudos-content` passou a declarar `flex-col` explicitamente
  e a remover o scroll externo (`overflow-hidden`), cedendo o controle de
  scroll aos painéis internos.

#### 2. `[CRÍTICO]` Sub-abas `Músicas` e `Podcasts` perdiam o layout `flex`
- **Causa raiz:** `style.css` tinha `.cont-tab-content.active { display: block; }`
  (especificidade `0,2,0`), que **vencia** as classes utilitárias do Tailwind
  `.flex` (especificidade `0,1,0`). Resultado: `display:block` era aplicado
  mesmo com `flex flex-col` no HTML, quebrando a altura e o
  `overflow-hidden` dos painéis.
- **Correção:** a regra passou a `.cont-tab-content.active { display: flex; }`
  e a remoção do `flex-col` redundante do HTML.

#### 3. `[ALTO]` Alturas fixas quebrando em telas baixas e em celular
- **Sintoma:** `h-[calc(100vh-220px)]` + `min-h-[600px]` estouravam a viewport
  em laptops de 768px de altura e em celulares, empurrando o player para fora.
- **Correção:** altura calculada por flexbox (`flex-1 min-h-0`), removendo
  qualquer dependência de `100vh`.

#### 4. `[MÉDIO]` Contêiner principal could `#player-master-container` como filho
  de `#app-main` (que é `position: relative`), o que criava um contexto de
  empilhamento desnecessário para o player flutuante.
- **Correção:** mantido, mas o player passou a usar `z-index` e
  `position: fixed` com classe própria `.kz-player-dock`.

#### 5. `[BAIXO]` Loop de eventos duplicado na aba Conteúdos
`setupSubTabs()` era chamado a cada `renderConteudosTab()` sem guardar a
instância, adicionando listeners duplicados aos botões de sub-aba.
- **Correção:** guarda com `data-listeners-bound`.

---

### ✨ NOVAS FUNCIONALIDADES

#### 6. `[INÍCIO]` Carrossel imersivo com zoom-in / zoom-out
- **Zoom-out (repouso):** a capa selecionada executa um `Ken Burns` contínuo
  (`@keyframes kz-kenburns`, 18s, `alternate`) sobre o fundo, criando
  profundidade.
- **Zoom-in (ao clicar):** clique no card dispara uma **transição FLIP**
  (*First-Last-Invert-Play*) de 900ms — o card literalmente "voa" da barra
  inferior e preenche a tela inteira, enquanto a imagem faz `scale(1.08)` e
  um segundo Ken Burns mais agressivo assume o fundo.
- **Zoom-out (ao sair):** `revertToDefault()` inverte a transformação,
  devolvendo o card à barra inferior com `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Indicador de progresso:** cada card exibe índice (`01`, `02`…) e barra de
  progresso do autoplay, sincronizada via `--kz-progress`.

#### 7. `[INÍCIO]` Navegação completa por mouse, caneta e toque
Um único conjunto de handlers baseado em **Pointer Events** cobre todos os
dispositivos (substituiu os listeners duplicados `mousedown/mouseup/touchstart`):

| Gesto | Ação |
|---|---|
| Arrastar horizontal | Move o carrossel em tempo real (1:1 com o dedo/mouse) |
| Arrastar > 15% da largura | Avança/retrocede com *snap* e inércia |
| Arrastar < limiar | Volta elastically à posição de origem |
| Arrastar e soltar rápido | *Flick* — detecta velocidade e avança 1 card |
| **Roda do mouse horizontal / trackpad** | Avança e retrocede (com *throttle* de 120ms) |
| **Roda do mouse vertical** | Também navega (fallback para notebooks sem scroll horizontal) |
| Clique/toque no card | Zoom-in imersivo |
| Teclado `←` / `→` | Avança / retrocede |
| Teclado `Esc` | Fecha o modo imersivo (zoom-out) |

- **Inércia física:** o deslocamento residual (`velocity × 0.92`) é aplicado
  em `requestAnimationFrame`, decaindo a cada quadro até zerar — o carrossel
  "escorrega" como material físico.
- **Snap elástico:** posições calculadas a partir das larguras reais
  (`offsetWidth` + gap via `getComputedStyle`), mantendo o alinhamento correto
  em qualquer largura de tela.
- **Acessibilidade:** `role="listbox"`, `aria-selected`, foco visível e
  `prefers-reduced-motion` respeitado (desliga Ken Burns e encurta transições).

#### 8. `[CONTEÚDOS]` Layout inspirado no Spotify para Músicas e Podcasts
- **Lista lateral compacta** (`280px`): linhas de 48px com capa 40×40, título,
  artista e **botão de play que aparece no hover** (canônico do Spotify).
- **Área "Tocando agora":** capa grande com *glow* dinâmico na cor da trilha,
  título em `Cinzel`, artista, e botão de play circular sobreposto à capa.
- **Letra/Resumo:** painel próprio com rolagem independente, fonte ampliada
  (`1.05rem`) e `line-height: 1.9` para leitura confortável, com barra de
  rolagem fina.
- **Barra de reprodutor em tela cheia:** o player deixou de ser uma caixa
  flutuante centralizada (`max-w-4xl`) e virou uma **dock inferior de largura
  total**, com barra de progresso fina no topo, como no Spotify.
- **Correção do corte lateral:** o painel agora usa `flex-1 min-w-0`, o que
  elimina o corte e faz a área de detalhe ocupar **100% do espaço restante**.
- **Bordas e respiro:** `rounded-3xl`, `border-slate-800`, sombra profunda e
  gradientes sutis — sem "corte duro" na lateral direita.

#### 9. `[CONTEÚDOS]` Materiais (arquivos) com grade responsiva real
- Substituição das colunas fixas (`md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
  por `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`, que
  preenche **qualquer** largura de tela sem colunas órfãs.
- Filtros em barra única que rewrapa em telas estreitas.
- Estado vazio ilustrado quando a busca não retorna resultados.

#### 10. `[CONTEÚDOS]` Busca e filtro em tempo real com *debounce*
- `input` dos campos de busca agora usa `debounce` de 180ms + `requestAnimationFrame`,
  evitando re-renderizações a cada tecla digitada em acervos grandes.

#### 11. `[GLOBAL]` Barra de rolagem unificada
- A scrollbar global foi unificada em **6px**, cor `slate-700`, com *hover* em
  `slate-500`, e `scrollbar-width: thin` para navegadores Firefox.

---

### ♿ ACESSIBILIDADE E RESPONSIVIDADE

- `prefers-reduced-motion: reduce` — desativa Ken Burns, inércia e encurta todas
  as transições para `0.01ms`.
- Breakpoint de **768px**: em tablet/celular o carrossel passa a exibir **peek**
  (o próximo card aparece parcialmente), sinalizando visualmente que há mais
  conteúdo arrastável.
- Alvos de toque (hit area) de no mínimo **44px** nos controles do carrossel e
  da barra de reprodutor.
- Foco visível com `:focus-visible` (anel azul de 2px) em todos os controles
  novos.

---

### 🔧 INTERNOS

- `escapeHTML` aplicado consistently em todos os títulos e artistas renderizados
  via `innerHTML` (prevenção de XSS nos cards do carrossel).
- `prefers-reduced-motion` centralizado em `@media` único no `style.css`.
- Limpeza de `setTimeout` órfãos no `renderInicioTab()` (`bgTimeout`,
  `modoImersivoTimeout`, `rafInertia`) para evitar vazamento de timers ao
  trocar de aba.

---