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

## [v1.6.0] — 2026-10-02 — Autor: Equipe Kazenski (via assistente de IA)

### Escopo
Tela de **manutenção** com bloqueio real do site, página pública de
**Atualizações** alimentada pelo próprio changelog, e correção de três bugs
latentes no carrossel da página Início.

### Arquivos tocados
- `index.html` (nova aba Atualizações, capa `#kz-mantencao`, faixa `#kz-mntbar`)
- `style.css` (bloco `kz-mnt-*` e `kz-upd-*`)
- `js/manutencao/manutencao.js` (novo)
- `js/main.js` (menu, roteador, boot, permissões)
- `js/inicio/inicio.js` (correções)
- `tools/build_changelog.py` (novo)
- `changelog.json` (novo, gerado)
- `imagens/manutencao/LEIA-ME.md` (novo)
- `CHANGELOG.md`

### 🔒 MANUTENÇÃO

#### 1. `[CRÍTICO]` Tela de manutenção com bloqueio real
- **O que era:** não existia nenhuma forma de fechar o site. Qualquer mudança
  no ar era visível — e quebrada — para todos os alunos ao mesmo tempo.
- **Solução:** capa de tela cheia `#kz-mantencao` (`position: fixed`,
  `inset: 0`, `z-index: 4000` — acima do header `z-50` e do dock do player
  `z-2000`).
- **Bloqueio em duas camadas:**
  1. `pointer-events: none` + `filter` em `#app-main`, `header`,
     `#player-master-container` e `#mobile-menu-container`;
  2. atributo **`inert`** nos mesmos elementos (via JS), que tira o elemento
     da ordem de tabulação e do `focus` — o CSS sozinho não impede navegação
     por teclado.
- **Administrador e Moderador não são bloqueados:** eles veem uma faixa
  âmbar não bloqueante (`#kz-mntbar`) e continuam usando o site normalmente.
- **Fim do deadlock de login:** a capa tem o botão “Acessar Portal”, que
  pausa a trava e leva ao formulário de login. Só quem for staff de fato
  permanece com acesso depois de autenticar (a pausa é limpa em toda mudança
  de sessão). O roteador também desvia qualquer tentativa de navegação para
  a aba `inicio`.
- **Imagem de fundo:** `imagens/manutencao/imagem_manutencao.jpg`, lida do
  atributo `data-img`. Um `Image()` de sondagem verifica a existência do
  arquivo e, se faltar, mantém o gradiente do CSS — a página nunca quebra.

#### 2. `[ALTO]` Ligar e desligar pelo Admin, sem mexer em código
- Documento único `site_status` / `maintenance` com `ativa`, `titulo`,
  `mensagem`, `previsao`, `versaoDeploy`, `atualizadoEm` e `atualizadoPor`.
- Painel de controle na própria página de Atualizações, visível apenas para
  Admin/Moderador: switch liga/desliga, campos de título, previsão e mensagem,
  botão “Pré-visualizar” e “Salvar textos”.
- Escrita com `setDoc(..., { merge: true })`, então não apaga campos que a
  edição não tocou.
- **Estado compartilhado ao vivo:** `onSnapshot` em `site_status/maintenance`
  empurra a mudança para **todos os clientes conectados no mesmo instante** —
  não há F5 nem cache.

#### 3. `[ALTO]` Gatilho automático: publicar uma versão fecha o site
- **Fluxo pedido:** ao mandar uma nova atualização, o site fecha sozinho para
  quem não é Moderador nem Admin.
- **Como funciona:** `tools/build_changelog.py` converte o `CHANGELOG.md` em
  `changelog.json` (`versaoAtual` no topo). Quando um usuário staff abre o
  site e detecta que `versaoAtual` é **diferente** da `versaoDeploy`
  registrada no Firestore, o módulo grava `ativa = true` imediatamente.
  O painel mostra o aviso “Deploy novo detectado” para não ser mágica.
- A detecção é feita **por um usuário staff**, porque só ele tem permissão de
  escrita — é o que torna o gatilho confiável em vez de depender de uma
  Cloud Function.

#### 4. `[ALTO]` Página de Atualizações (histórico técnico público)
- Nova aba **Atualizações**, visível para todos os papéis, inclusive visitante.
- Lê `changelog.json` (o que está no ar) e mescla com a coleção
  `site_changelog` do Firestore, removendo versões repetidas e ordenando por
  SemVer.
- Cada entrada abre em acordeão e mostra: escopo, seções, nível de
  criticidade por bloco (`CRÍTICO` / `ALTO` / `MÉDIO` / `BAIXO`), itens com
  `**negrito**` e `` `código` `` renderizados, e a lista de arquivos tocados.
- Busca instantânea (filtra sobre o JSON inteiro) e botão de expandir tudo.
- Markdown inline montado por um renderizador próprio e passado no
  `DOMPurify` — nenhum HTML do changelog é injetado cru.

#### 5. `[ALTO]` `fail-open` só enquanto o estado é desconhecido
- Erro de permissão ou de rede **não pode derrubar o site**… mas também não
  pode **destravá-lo** depois de uma leitura válida.
- Regra implementada: enquanto nunca houve snapshot válido (`temDados ===
  false`), qualquer falha libera o site. Depois da primeira leitura válida, a
  falha passa a **preservar o último estado conhecido**. Sem isso, uma queda
  de rede de dois segundos abriria o site durante a manutenção.
- `definirManutencao()` marca `temDados = true` ao gravar com sucesso.

### 🐛 CORREÇÕES

#### 1. `[CRÍTICO]` `springBackToActive()` chamava função inexistente
- **Sintoma:** qualquer arraste curto terminava em erro e o trilho ficava
  deslocado, sem voltar ao lugar.
- **Causa raiz:** `springBackToActive()` usava `centerOffsetFor(activeIndex)`,
  que **nunca foi definida** — o cálculo vivia embutido dentro de
  `centerIndex()`.
- **Correção:** `centerOffsetFor(i)` foi extraído para função própria e
  `centerIndex(i, animate)` passou a consumi-la. Como o cálculo é relativo ao
  trilho e a `getBoundingClientRect()` já desconta a transformação atual, o
  offset é o mesmo com o trilho parado ou arrastado.

#### 2. `[CRÍTICO]` Zoom-out devolvia o card errado ao trilho
- **Sintoma:** ampliar um card e voltar deixava o card **preso em
  `position: fixed`**, ocupando a tela, sem nenhum botão para sair.
- **Causa raiz:** `exitImmersive()` restaurava
  `$('#kz-track').children[activeIndex]`, mas o card ampliado pode ser outro
  (`expandNews(i)`, clique em card não-ativo). O estado interno `activeIndex`
  e o card visualmente ampliado divergiam.
- **Correção:** o índice ampliado passa a ser guardado em `immersiveIndex` no
  momento da entrada e é o alvo da saída. `margin` e `z-index` — aplicados
  só no modo imersivo — também passaram a ser limpos na volta.

#### 3. `[ALTO]` `enterImmersive()` marcava estado antes de validar
- **Causa raiz:** `isImmersive = true` era atribuído antes do guard
  `if (!card || !hero || !slide) return;`. Uma chamada com slide inexistente
  deixava o módulo travado no modo imersivo sem nada renderizado — e sem
  caminho de volta, porque `exitImmersive()` agora confia em `immersiveIndex`.
- **Correção:** o guard vem antes de qualquer mutação de estado.

#### 4. `[ALTO]` `expandNews(imgUrl, index)` ignorava a imagem
- O parâmetro `imgUrl` existia na assinatura e era descartado: a imagem
  exibida podia ser outra. Agora ele passa a valer como imagem do slide
  naquele índice (injetando o slide se ele ainda não existir), o que também
  torna a chamada útil antes de o feed carregar.

#### 5. `[MÉDIO]` Estado final do FLIP dependia do `requestAnimationFrame`
- Com `prefers-reduced-motion` ligado, o zoom continuava esperando um quadro
  para aplicar o estado final. Em aba em segundo plano (ou renderização
  suspensa) esse quadro não chega e o card fica no meio do caminho.
- **Correção:** `aplicarGeometria()` e `limparGeometria()` aplicam tudo
  **sincronamente** quando o movimento é reduzido; nos demais casos seguem
  pelo `rAF` como antes.

#### 6. `[BAIXO]` `inert` escrito como propriedade CSS
- `inert` é atributo, não propriedade. A regra `inert: -webkit-fill-available`
  não fazia nada e ainda poluía o `style.css`. O atributo agora é aplicado
  via JS em `aplicarEstado()`.

#### 7. `[BAIXO]` Painel do Admin sumia ao buscar no histórico
- O painel era inserido com `prepend` dentro de `#kz-upd-feed`, e
  `renderFeed()` reescreve o `innerHTML` do feed — ou seja, qualquer busca,
  expandir/recolher ou recarga apagava o painel de controle.
- **Correção:** slot próprio `#kz-upd-admin-slot` entre a barra de busca e o
  feed, reconstruído por `aplicarEstado()` (fonte única de mudança de estado).

#### 8. `[BAIXO]` Altura fixa da faixa de manutenção
- A faixa empurrava o header com `margin-top: 2.4rem` fixo, mas ela quebra em
  duas linhas no celular e ficava com 57px — o header ficava **por baixo**
  dela.
- **Correção:** a altura é medida por `ResizeObserver` e publicada em
  `--kz-mntbar-h`. Também foi removido o `height: calc(100% - 2.4rem)` do
  `#app-main`, que somava a altura do header e cortava 64px do rodapé.

#### 9. `[BAIXO]` Parser do changelog perdia informação
- `#### 1. \`[CRÍTICO]\` Título` produzia `nivel: null` e mantinha as crases
  no título (o regex de nível não ignorava o prefixo `1. `).
- Bullets quebrados em várias linhas viravam fragmentos `li` / `p` / `p`
  separados, deixando frases truncadas na tela.
- **Correção:** extração do nível após remover crases e numeração, e
  `fundir_linhas()` reagrupa as continuações de volta ao bullet original.

### 🔧 INTERNOS

#### 1. `tools/build_changelog.py` (novo)
- Conversor `CHANGELOG.md` → `changelog.json`, sem dependências externas
  (só biblioteca padrão do Python).
- Preserva a hierarquia: versão/data/autor, escopo, arquivos tocados, seções
  com blocos e nível de criticidade, e blocos de código literais.
- Ordena entradas, remove campos vazios e é **idempotente**: rodar de novo
  com o mesmo Markdown gera o mesmo conteúdo.
- Rodar: `python tools/build_changelog.py`

#### 2. `imagens/manutencao/LEIA-ME.md` (novo)
- Documenta o caminho exato da imagem da manutenção e o que fazer se o
  arquivo não for encontrado.

### ✅ VERIFICAÇÃO
- Chrome 1296×886: capa, faixa e página de Atualizações sem overflow
  horizontal; painel do Admin preservado após busca.
- Trava: `#app-main`, `header` e `#mobile-menu-container` com `pointer-events:
  none` e atributo `inert`; navegação para `conteudos` desviada; login
  liberado; sessão não-staff volta a ficar bloqueada.
- Staff: faixa exibida, `--kz-mntbar-h` medido corretamente (43px em tablet,
  57px em celular), sem sobreposição com o header e sem corte no rodapé.
- Cycle completo: Admin → site fechado → “Ver como visitante” → capa → “Sair do
  preview” → faixa restaurada.
- Tablet 820×900 e celular 390×780: capa e Atualizações sem estouro de tela.
- Carrossel (com `slides` populados): mola do arraste curto, flick para a
  frente e para trás com centralização correta; zoom cobre o hero e volta ao
  tamanho do card sem props inline residuais.
- Console sem erros de aplicação.

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