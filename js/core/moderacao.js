/**
 * moderacao.js — Barreira central de conteúdo do aluno.
 *
 * Objetivo: validar TODO texto digitado por aluno antes de chegar ao Firestore,
 * bloqueando insultos, profanidade e discurso de ódio, além de tentativas de
 * injeção (XSS, HTML, javascript:, prototype pollution, path traversal).
 *
 * Decisões de projeto:
 *  - Lista de termos embutida (sempre ativa) + lista remota em
 *    `site_status/moderacao`, que Admin/Moderador edita pelo painel, sem deploy.
 *  - Bloqueio é DURO: nada com termo bloqueado sai do navegador.
 *  - Falha de rede nunca derruba o site: sem Firestore, vale a lista embutida.
 *  - Discurso de ódio é categoria separada, ligável/desligável pelo painel.
 *  - Sem lookbehind e sem named groups: funciona em Safari antigo.
 *
 * Exposto em window.moderacaoAPI para o console e para os módulos.
 */

import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { escapeHTML } from './utils.js';

/* ============================================================================
 * 1. LISTAS EMBUTIDAS
 *    Chaves = categoria. `*` é curinga na verificação.
 *    Pode escrever com acento e maiúscula aqui: todo termo passa por
 *    `normalizarTermo()` antes de virar regex. Termos que quebram palavra
 *    legítima do dia a dia escolar (verme de biologia, pão francês, "invasão"
 *    em história...) ficaram de fora de propósito: falso positivo em site de
 *    escola custa mais caro do que um termo solto escapar.
 * ==========================================================================*/

const LISTA_EMBUTIDA = {
  insulto: [
    'idiota', 'imbecil', 'burro', 'burra', 'babaca', 'babacao', 'cretino', 'cretina',
    'retardado', 'retardada', 'demente', 'palhaco', 'ridiculo', 'ridicula',
    'nojento', 'nojenta', 'canalha', 'desgraçado', 'desgraçada', 'otario', 'otaria',
    'tonto', 'tonta', 'estúpido', 'estupida', 'inutil', 'incompetente',
    'fracassado', 'fracassada', 'covarde', 'marmota',
    'cabeça de pau', 'cabeça de banana', 'tapete', 'tapetes', 'sacanagem'
  ],

  profanidade: [
    'porra', 'porras', 'merda', 'merdas', 'caralho', 'caralhos',
    'buceta', 'bucetas', 'foda', 'fodase', 'fudido', 'fudida', 'fuder',
    'pqp', 'fdp', 'fdpz', 'vsf', 'vtnc', 'vtmnc', 'vtc', 'pqpz',
    'puta', 'puto', 'putas', 'putos', 'puto a venda',
    'escrota', 'escrotas',
    'chupet*', 'masturba*', 'pussy', 'dick', 'bitch', 'slut', 'dickhead',
    'asshole', 'bastard', 'motherfucker', 'blowjob'
  ],

  odio: [
    // ---- racismo / regional ----
    'negro', 'negra', 'negros', 'negras', 'negrada', 'negragem',
    'mulato', 'mulata', 'mestiço', 'macaco', 'macaca',
    'nigger', 'nigg*', 'fuzz*', 'coon', 'wetback', 'spigg*', 'chav',
    // ---- ableismo ----
    'deficiente', 'deficitente', 'surdo', 'mongo', 'cretinho',
    // ---- religiosa ----
    'satan*', 'demonio', 'inferno', 'judeu', 'judia', 'islamista sujo',
    // ---- homofobia / transfobia ----
    'viado', 'viadao', 'viados', 'bicha', 'bichas', 'bichao', 'travesti',
    'travestis', 'faggot', 'faggots', 'tranny', 'trannies', 'dyke',
    // ---- odio generico ----
    'homofob*', 'homofobia', 'xenofob*', 'xenofobia',
    'racista', 'racismo', 'racistas', 'preconceituoso', 'preconceito',
    'antissemita', 'islamofob*', 'cristofob*', 'supremacist*', 'supremacista'
  ],

  ameaca: [
    'vou te matar', 'vou matar voce', 'vou matar vc', 'quero te matar',
    'te mato', 'te vou matar', 'vou te destruir', 'vou te explodir',
    'bombear', 'vou te empurrar', 'vou te lynchar'
  ]
};

/* Frases que existem em contexto escolar legítimo.
 * Não são ignoradas por igualdade: são REMOVIDAS do texto normalizado antes da
 * busca de termos, para que "lixo eletronico" não dispare nada no meio de um
 * texto maior do aluno. */
const FRASES_SEM_RISCO = [
  'lixo eletronico', 'lixeiro', 'lixao', 'reciclagem',
  'cafe da manha', 'cafe com leite',
  'abacaxi', 'abacaxizeiro',
  'matar o tempo', 'matar aula', 'matou a aula', 'matar a aula',
  'idiota do capitao', 'burro de carga',
  'palhaco do circo',
  'viagem da historia', 'idade media', 'reforma protestante',
  'espiritismo', 'candomble', 'umbanda'
];

/* ============================================================================
 * 2. NORMALIZAÇÃO — é aqui que a maioria dos bypasses morre.
 * ==========================================================================*/

/* Zero-width puro some SEM espaço: costuma estar no meio da palavra
 * (i<U+200B>diota) e apagar preserva a palavra. */
const ZEROWIDTH = new RegExp('[\\u00AD\\u034F\\u061C\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]', 'g');

/* Controles de direção/bidirecionais viram ESPAÇO, não string vazia: senão
 * "vou<RLO>te matar" viraria "voute matar" e o termo composto escaparia. */
const ehDirecional = (cp) => (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069);
const limparInvisiveis = (t) => t.replace(ZEROWIDTH, (ch) => (ehDirecional(ch.codePointAt(0)) ? ' ' : ''));

const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
/* \n (0x0A) e \r (0x0D) ficam de fora de propósito: texto multi-linha é normal. */
const CONTROLE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');
const LIMITE_ALFA = /[a-z0-9]/;

/* Dobramentos SEMPRE seguros (dígitos e homóglifos raros). Vale para o texto E
 * para o termo, então os dois lados dobram igual e continuam casando. */
const LEET = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g',
  '7': 't', '8': 'b', '9': 'g', '\\u00A1': 'i', '\\u0131': 'i', '\\u0142': 'l'
};

/* Dobramentos ARRISCADOS (@ $ ! | + ~): "@" e "$" aparecem em e-mail e nome de
 * usuário, e "!" é pontuação. Se dobrassem sempre, "Idiota!" viraria "idiotai"
 * e "@prof.kazenski" viraria "aprof.kazenski". Então só valem numa segunda
 * passada, feita exclusivamente para caçar termo bloqueado. */
const LEET_AGRESSIVO = { '@': 'a', '$': 's', '|': 'i', '+': 't', '~': 'o' };

/** Converte entidades HTML para os caracteres reais.
 *  Sem isso, `<script>` escrito como `&lt;script&gt;` passa pelo filtro e
 *  explode quando algum renderer decodifica a entidade. */
function decodirEntidades(txt) {
  return txt
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&lt;?/gi, '<')
    .replace(/&gt;?/gi, '>')
    .replace(/&quot;?/gi, '"')
    .replace(/&apos;?/gi, "'")
    .replace(/&#0*39;?/g, "'")
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&colon;?/gi, ':')
    .replace(/&NewLine;?/gi, '\n');
}

function safeFromCodePoint(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try { return String.fromCodePoint(cp); } catch (_) { return ''; }
}

/** Pipeline completo. Devolve a forma "comparável" do texto.
 *  NÃO use o resultado para medir tamanho: a dobra de letras reduz o comprimento. */
export function normalizar(texto) {
  if (texto === null || texto === undefined) return '';
  let t = String(texto);

  t = limparInvisiveis(t);                                 // invisíveis
  t = decodirEntidades(t);                                 // &lt;script&gt; -> <script>
  t = t.normalize('NFD').replace(COMBINING, '');           // sem acento
  t = t.toLowerCase();

  t = t.replace(/[0-9\\u00A1\\u0131\\u0142]/g, (c) => LEET[c] || c);         // leetspeak

  t = t.replace(/(.)\1+/g, '$1');                          // mmmmeerrrda -> merda, porra -> pora (termo tbm dobra)
  t = t.replace(/[.\-_+*~^]/g, '');                        // m.e.r.d.a -> merda
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

/**
 * Segunda passada, só para caça de termo: dobra @ $ ! | + ~ sobre o texto já
 * normalizado. Nunca é usada para medir tamanho nem para exibir nada.
 */
export function normalizarAgressivo(texto) {
  return normalizar(texto).replace(/[@$|+~]/g, (c) => LEET_AGRESSIVO[c] || c);
}

/**
 * Normaliza um TERMO DA LISTA (não um texto do aluno).
 * Diferença crítica para `normalizar`: NÃO remove `*`, senão o curinga
 * ('chupet*') viraria ('chupet') e o filtro pararia de pegar as variações.
 * Dobra letras igual ao texto, senão 'asshole' (letra dupla) nunca casaria.
 */
export function normalizarTermo(termo) {
  let t = String(termo === null || termo === undefined ? '' : termo).toLowerCase();
  t = t.normalize('NFD').replace(COMBINING, '');
  t = t.replace(/[0-9\\u00A1\\u0131\\u0142]/g, (c) => LEET[c] || c);
  t = t.replace(/[.\-_+^]/g, '');          // sem mexer no '*'
  t = t.replace(/(.)\1+/g, '$1');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Versão só para padrões perigosos: preserva case, remove invisíveis/controle. */
function normalizarPadroes(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto).replace(ZEROWIDTH, '').replace(CONTROLE, ' ');
}

/* ============================================================================
 * 3. PADRÕES DE INJEÇÃO
 *    Equivalentes reais de "SQL injection" num banco de documentos:
 *    XSS/HTML injection, javascript:, prototype pollution, path traversal,
 *    injeção de cabeçalho e template injection.
 * ==========================================================================*/

const PADROES_PERIGOSOS = [
  { cod: 'tag_script',      rot: 'código executável (tag de script)',   re: /<\s*\/?\s*(script|iframe|object|embed|applet|svg|math|style|link|meta|base|form|frame|frameset|template)\b/i },
  { cod: 'event_handler',   rot: 'manipulador de evento HTML',          re: /\bon[a-z]{3,20}\s*=/i },
  { cod: 'uri_script',      rot: 'link com javascript:',                re: /javascript\s*:|vbscript\s*:|livescript\s*:|mocha\s*:/i },
  { cod: 'uri_data',        rot: 'conteúdo data: embutido',              re: /data\s*:\s*(text\/html|image\/svg|application\/xhtml|application\/javascript)/i },
  { cod: 'srcdoc',          rot: 'atributo srcdoc / formaction',        re: /\bsrcdoc\s*=|\bformaction\s*=/i },
  { cod: 'css_expr',        rot: 'CSS com expression()',                re: /expression\s*\(|@import\s+|-moz-binding|behaviou?r\s*:\s*url/i },
  { cod: 'meta_refresh',    rot: 'redirecionamento via meta',           re: /http-equiv\s*=\s*["']?refresh/i },
  { cod: 'proto_pollution', rot: 'tentativa de prototype pollution',    re: /__proto__|prototype\s*\[|constructor\s*\.\s*prototype|constructor\s*\[/i },
  { cod: 'traversal',       rot: 'caminho com ../',                     re: /\.\.[\/\\]|%2e%2e|\.\.%2f|\.\.%5c/i },
  { cod: 'null_byte',       rot: 'caractere nulo',                      re: new RegExp('\\u0000') },
  { cod: 'header_inj',      rot: 'injeção de cabeçalho (CRLF)',         re: /(\r\n|\r|%0d%0a|%0a)\s*[a-z-]{2,20}\s*:/i },
  { cod: 'template_inj',    rot: 'injeção de template',                 re: /\{\{[^}]{0,40}(constructor|__proto__|\w+\s*:)|\$\{[^}]{0,60}\}|<%=?[^%]{0,60}%>/ },
  { cod: 'segredo_exposto', rot: 'chave/credencial exposta',            re: /\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_\-]{30,}\b|\bsk-[A-Za-z0-9]{20,}\b|\bghp_[A-Za-z0-9]{30,}\b/ },
  { cod: 'chave_privada',   rot: 'certificado/chave privada',           re: /-----BEGIN[^-]{0,40}(PRIVATE KEY|RSA|OPENSSH|PGP)/i },
  { cod: 'cmd_inj',         rot: 'comando de sistema',                  re: /(rm\s+-[rf]|del\s+\/|format\s+c:|curl\s+[a-z]+:\/\/|wget\s+[a-z]+:\/\/|powershell|cmd\.exe|bash\s+-c|sh\s+-c|eval\s*\(|atob\s*\(|fromCharCode)/i },
  { cod: 'sql_where',       rot: 'expressão de banco de dados',         re: /(union\s+(all\s+)?select|drop\s+(table|database)|truncate\s+table|insert\s+into|\bor\b\s+['"]?1['"]?\s*=\s*['"]?1|sleep\s*\(\d|benchmark\s*\(|waitfor\s+delay|xp_cmdshell|information_schema)/i },
  { cod: 'no_sql_op',       rot: 'operador de banco NoSQL',             re: /\.\$where\s*[\w.]|\$where\s*[:=]|__lt__|__gt__|db\.collection\s*\(\s*['"`]/i }
];

/* ============================================================================
 * 4. ESTADO
 * ==========================================================================*/

const DOC_REMOTO = 'site_status/moderacao';
const TTL_CACHE_MS = 5 * 60 * 1000;

const estado = {
  pronto: false,
  listaRemota: { extras: [], desativados: [], hateSpeechAtivo: true },
  limites: { titulo: 120, texto: 8000, comentario: 1000, tag: 40, url: 500, nome: 60 },
  cacheEm: 0,
  staff: false,
  uid: null,
  nome: null,
  historicoTentativas: []
};

/* ============================================================================
 * 5. VERIFICAÇÃO DE TERMOS
 * ==========================================================================*/

/**
 * Monta a regex do termo. `*` vira [a-z0-9\s._-]{0,6}.
 * Sem lookbehind de propósito: Safari < 16.4 quebraria o módulo inteiro.
 * O termo entra JÁ normalizado por `normalizarTermo`.
 */
function compilarPadrao(termo) {
  const bruto = String(termo || '').trim();
  if (!bruto) return null;
  const partes = bruto.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const corpo = partes.length === 1 ? partes[0] : partes.join('[a-z0-9\\s._-]{0,6}');
  try {
    return new RegExp(corpo, 'gi');
  } catch (_) {
    return null;
  }
}

let cachePadroes = null;
let cacheChave = '';

function padroesAtuais() {
  const extras = (estado.listaRemota.extras || []).filter((t) => typeof t === 'string' && t.length <= 40);
  const chave = extras.join('|') + '#' + estado.listaRemota.hateSpeechAtivo;
  if (cachePadroes && cacheChave === chave) return cachePadroes;

  const desativados = new Set((estado.listaRemota.desativados || []).map((t) => normalizarTermo(t)));
  const hateAtivo = estado.listaRemota.hateSpeechAtivo !== false;

  const lista = [];
  for (const [categoria, termos] of Object.entries(LISTA_EMBUTIDA)) {
    if (categoria === 'odio' && !hateAtivo) continue;
    for (const bruto of termos) {
      const termo = normalizarTermo(bruto);
      if (!termo || desativados.has(termo)) continue;
      const re = compilarPadrao(termo);
      if (re) lista.push({ termo, categoria, re });
    }
  }
  for (const bruto of extras) {
    const termo = normalizarTermo(bruto);
    if (!termo || desativados.has(termo)) continue;
    const re = compilarPadrao(termo);
    if (re) lista.push({ termo, categoria: 'extras', re });
  }

  cachePadroes = lista;
  cacheChave = chave;
  return lista;
}

/** Casa o termo respeitando fronteira de palavra, sem lookbehind. */
function casarComFronteira(re, texto) {
  const g = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
  let m;
  while ((m = g.exec(texto)) !== null) {
    if (m[0].length === 0) { g.lastIndex++; continue; }
    const ini = m.index;
    const fim = ini + m[0].length;
    const antes = ini > 0 ? texto[ini - 1] : ' ';
    const depois = fim < texto.length ? texto[fim] : ' ';
    if (!LIMITE_ALFA.test(antes) && !LIMITE_ALFA.test(depois)) return { achou: true, pos: ini };
  }
  return { achou: false };
}

/** Remove do texto normalizado as frases de contexto legítimo. */
function semFrasesSeguras(norm) {
  let t = norm;
  for (const frase of FRASES_SEM_RISCO) t = t.split(frase).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

function acharTermos(texto, categoriasAtivas) {
  // Duas variantes: a normal e a agressiva (@ $ ! | + ~ dobrados).
  // Achar em qualquer uma das duas bloqueia.
  const variantes = [semFrasesSeguras(texto)];
  const agressiva = semFrasesSeguras(normalizarAgressivo(texto));
  if (agressiva && agressiva !== variantes[0]) variantes.push(agressiva);
  if (!variantes.some((v) => v)) return [];

  const pool = padroesAtuais().filter((p) => categoriasAtivas.has(p.categoria));
  // frases compostas primeiro: "vou te matar" tem que ganhar de "matar"
  const ordenados = pool.slice().sort((a, b) => b.termo.length - a.termo.length);

  const encontrados = [];
  const vistos = new Set();
  const trechosOcupados = [];
  const sobrepoe = (ini, fim) => trechosOcupados.some(([a, b]) => ini < b && a < fim);

  for (const p of ordenados) {
    if (vistos.has(p.termo)) continue;
    for (const alvo of variantes) {
      const r = casarComFronteira(p.re, alvo);
      if (r.achou && !sobrepoe(r.pos, r.pos + p.termo.length)) {
        const frase = alvo.substr(r.pos, p.termo.length).replace(/\s+/g, ' ');
        encontrados.push({ termo: p.termo, categoria: p.categoria, pos: r.pos, trecho: frase });
        trechosOcupados.push([r.pos, r.pos + frase.length]);
        vistos.add(p.termo);
        break;
      }
    }
  }
  return encontrados;
}

function mascarar(termo) {
  const t = String(termo);
  if (t.indexOf(' ') !== -1) {
    return t.split(' ').map((p) => (p.length <= 2 ? p[0] + '•' : p[0] + '•'.repeat(Math.max(1, p.length - 1)))).join(' ');
  }
  return t.length <= 2 ? t[0] + '•' : t[0] + '•'.repeat(Math.min(6, t.length - 1));
}

/* ============================================================================
 * 6. VALIDAÇÃO — API principal
 * ==========================================================================*/

/**
 * @param {Array<{nome:string, valor:string, rotulo?:string, obrigatorio?:boolean,
 *                min?:number, max?:number, semTermo?:boolean}>} campos
 * @param {object} opts { origem, contexto, ignorarTermos, ignorarPadroes, permitirStaff }
 * @returns {{ok:boolean, nivel:string, staff:boolean, motivos:Array, campos:object}}
 */
export function validar(campos, opts = {}) {
  const origem = opts.origem || 'desconhecido';
  const contexto = opts.contexto === undefined ? null : opts.contexto;
  // Staff (Moderador/Admin) precisa escrever coisas que o filtro barra — por
  // exemplo, citar um termo para explicar a norma. Staff pula o filtro de TERMO
  // mas NUNCA pula o de injeção: `<script>` é código, não linguagem.
  const ignorarTermos = opts.ignorarTermos === true || (estado.staff && opts.permitirStaff !== false);
  const ignorarPadroes = opts.ignorarPadroes === true;
  const motivos = [];

  const categorias = new Set(['insulto', 'profanidade', 'extras', 'ameaca']);
  if (estado.listaRemota.hateSpeechAtivo !== false) categorias.add('odio');

  const saida = {};

  for (const campo of campos) {
    const bruto = campo.valor === null || campo.valor === undefined ? '' : String(campo.valor);
    saida[campo.nome] = bruto;

    const rotulo = campo.rotulo || campo.nome;
    const norm = normalizar(bruto);
    const pad = normalizarPadroes(bruto);

    // 6.1 Presença e tamanho.
    //     O tamanho é medido no texto CRU, nunca no normalizado: o
    //     normalizador dobra letras repetidas, então "aaa..." vira "a" e um
    //     limite de 120 nunca dispararia.
    const tamanho = bruto.trim().length;
    const max = campo.max ?? estado.limites[campo.nome] ?? estado.limites.texto;
    const min = campo.min ?? 0;

    if (campo.obrigatorio !== false && !bruto.trim()) {
      motivos.push({ cod: 'vazio', campo: campo.nome, rotulo, tipo: 'campo', detalhe: 'Este campo é obrigatório.' });
      continue;
    }
    if (tamanho > max) {
      motivos.push({
        cod: 'longo', campo: campo.nome, rotulo, tipo: 'campo',
        detalhe: 'Máximo de ' + max + ' caracteres. Você digitou ' + tamanho + '.'
      });
    }
    if (min && tamanho < min) {
      motivos.push({ cod: 'curto', campo: campo.nome, rotulo, tipo: 'campo', detalhe: 'Mínimo de ' + min + ' caracteres.' });
    }

    // 6.2 Texto invisível (burlar filtro / spam de SEO)
    const visivel = bruto.replace(ZEROWIDTH, '').length;   // conta no cru de propósito
    if (bruto.length > 4 && bruto.length - visivel > Math.max(2, bruto.length * 0.3)) {
      motivos.push({
        cod: 'invisivel', campo: campo.nome, rotulo, tipo: 'abuso',
        detalhe: 'O texto tem caracteres invisíveis demais — isso esconde conteúdo.'
      });
    }

    if (CONTROLE.test(bruto)) {
      motivos.push({
        cod: 'controle', campo: campo.nome, rotulo, tipo: 'abuso',
        detalhe: 'O texto tem caracteres de controle não permitidos.'
      });
    }

    // 6.3 Padrões de injeção
    if (!ignorarPadroes) {
      for (const p of PADROES_PERIGOSOS) {
        if (p.re.test(pad) || p.re.test(norm)) {
          motivos.push({
            cod: p.cod, campo: campo.nome, rotulo, tipo: 'inseguro',
            detalhe: 'Foi encontrado ' + p.rot + '.'
          });
        }
      }
    }

    // 6.4 Termos bloqueados
    if (!ignorarTermos && !campo.semTermo && norm) {
      const achados = acharTermos(norm, categorias).slice(0, 6);
      for (const a of achados) {
        motivos.push({
          cod: 'termo', campo: campo.nome, rotulo, tipo: a.categoria,
          detalhe: 'Termo bloqueado encontrado: “' + mascarar(a.termo) + '”.'
        });
      }
    }
  }

  const ok = motivos.length === 0;
  return { ok, nivel: ok ? 'livre' : 'bloqueado', staff: estado.staff, motivos, campos: saida, origem, contexto };
}

/** Atalho para um único texto. */
export function validarTexto(texto, opts = {}) {
  return validar([{
    nome: opts.nome || 'texto', valor: texto, rotulo: opts.rotulo,
    max: opts.max, min: opts.min, obrigatorio: opts.obrigatorio
  }], opts);
}

/* ============================================================================
 * 7. LOG DE TENTATIVAS (auditoria para o Moderador)
 * ==========================================================================*/

async function registrarTentativa(resultado, origem) {
  if (!resultado.motivos.length) return;
  const registro = {
    em: serverTimestamp(),
    uid: estado.uid,
    autor: estado.nome || 'desconhecido',
    origem,
    staff: resultado.staff,
    motivos: resultado.motivos.slice(0, 8).map((m) => ({ cod: m.cod, tipo: m.tipo, campo: m.campo, detalhe: m.detalhe })),
    agente: navigator.userAgent.slice(0, 180)
  };
  estado.historicoTentativas.push(registro);
  if (estado.historicoTentativas.length > 40) estado.historicoTentativas.shift();
  try {
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
    await addDoc(collection(db, 'moderacao_logs'), registro);
  } catch (_) {
    // silencioso: auditoria nunca pode atrapalhar o aluno
  }
}

/* ============================================================================
 * 8. UI — painel de bloqueio
 * ==========================================================================*/

const CSS_MOD = [
  '#kz-mod-backdrop{position:fixed;inset:0;z-index:99980;display:none;align-items:center;justify-content:center;',
  'padding:1.25rem;background:rgba(2,6,23,.9);backdrop-filter:blur(6px);font-family:inherit}',
  '#kz-mod-backdrop[data-aberto="1"]{display:flex}',
  '#kz-mod-backdrop[data-fechando="1"]{animation:kzModFade .16s ease-out}',
  '.kz-mod__box{width:100%;max-width:34rem;max-height:88vh;overflow-y:auto;',
  'background:linear-gradient(160deg,#111c33,#0a1224);border:1px solid rgba(239,68,68,.45);',
  'border-radius:1.25rem;padding:1.5rem;box-shadow:0 24px 70px rgba(0,0,0,.6)}',
  '.kz-mod__top{display:flex;align-items:flex-start;gap:.85rem;margin-bottom:1rem}',
  '.kz-mod__icone{flex:0 0 auto;width:2.75rem;height:2.75rem;border-radius:.85rem;display:grid;place-items:center;',
  'background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4);color:#fca5a5}',
  '.kz-mod__icone svg{width:1.3rem;height:1.3rem;display:block}',
  '.kz-mod__titulo{margin:0;font-weight:800;color:#f1f5f9;letter-spacing:.02em;font-size:1.05rem}',
  '.kz-mod__sub{margin:.2rem 0 0;font-size:.78rem;color:#94a3b8;line-height:1.55}',
  '.kz-mod__lista{list-style:none;margin:0 0 1rem;padding:0;display:flex;flex-direction:column;gap:.5rem}',
  '.kz-mod__item{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.18);',
  'border-left:3px solid #ef4444;border-radius:.7rem;padding:.6rem .75rem}',
  '.kz-mod__item b{display:block;color:#e2e8f0;font-size:.79rem;font-weight:700}',
  '.kz-mod__item span{display:block;color:#94a3b8;font-size:.75rem;line-height:1.5;margin-top:.1rem}',
  '.kz-mod__item[data-tipo="campo"]{border-left-color:#f59e0b}',
  '.kz-mod__item[data-tipo="abuso"]{border-left-color:#f59e0b}',
  '.kz-mod__item[data-tipo="inseguro"]{border-left-color:#38bdf8}',
  '.kz-mod__acoes{display:flex;gap:.6rem;flex-wrap:wrap}',
  '.kz-mod__btn{flex:1 1 10rem;padding:.7rem 1rem;border-radius:.75rem;font-weight:800;font-size:.73rem;',
  'letter-spacing:.13em;text-transform:uppercase;cursor:pointer;border:1px solid transparent;',
  'transition:.18s;font-family:inherit}',
  '.kz-mod__btn:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}',
  '.kz-mod__btn--voltar{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.5);color:#fecaca}',
  '.kz-mod__btn--voltar:hover{background:rgba(239,68,68,.32);color:#fff}',
  '.kz-mod__btn--ajuda{background:transparent;border-color:rgba(148,163,184,.35);color:#94a3b8}',
  '.kz-mod__btn--ajuda:hover{border-color:#60a5fa;color:#bfdbfe}',
  '.kz-mod__nota{font-size:.72rem;color:#64748b;margin-top:.9rem;line-height:1.55}',
  '@keyframes kzModFade{from{opacity:1}to{opacity:0}}',
  '@media (max-width:420px){.kz-mod__box{padding:1.15rem}.kz-mod__btn{flex:1 1 100%}}',
  '@media (prefers-reduced-motion:reduce){#kz-mod-backdrop{backdrop-filter:none;animation:none}}'
].join('\n');

let uiInjetada = false;
let ultimoFoco = null;

function garantirUI() {
  if (uiInjetada || typeof document === 'undefined') return;
  if (!document.getElementById('kz-mod-style')) {
    const s = document.createElement('style');
    s.id = 'kz-mod-style';
    s.textContent = CSS_MOD;
    (document.head || document.documentElement).appendChild(s);
  }
  if (!document.getElementById('kz-mod-backdrop')) {
    const d = document.createElement('div');
    d.id = 'kz-mod-backdrop';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'kz-mod-titulo');
    d.setAttribute('data-aberto', '0');
    d.innerHTML = [
      '<div class="kz-mod__box">',
      '  <div class="kz-mod__top">',
      '    <div class="kz-mod__icone" aria-hidden="true">',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
      '           stroke-linecap="round" stroke-linejoin="round">',
      '        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
      '        <path d="M12 8v5"></path><path d="M12 16h.01"></path>',
      '      </svg>',
      '    </div>',
      '    <div>',
      '      <h3 class="kz-mod__titulo" id="kz-mod-titulo">Não foi possível publicar</h3>',
      '      <p class="kz-mod__sub">O texto não foi enviado. Nada foi gravado no banco de dados.</p>',
      '    </div>',
      '  </div>',
      '  <ul class="kz-mod__lista" id="kz-mod-lista"></ul>',
      '  <div class="kz-mod__acoes">',
      '    <button type="button" class="kz-mod__btn kz-mod__btn--voltar" id="kz-mod-voltar">Voltar e corrigir</button>',
      '    <button type="button" class="kz-mod__btn kz-mod__btn--ajuda" id="kz-mod-ajuda">Onde reclamar?</button>',
      '  </div>',
      '  <p class="kz-mod__nota" id="kz-mod-nota" hidden></p>',
      '</div>'
    ].join('\n');
    document.body.appendChild(d);

    d.querySelector('#kz-mod-voltar').addEventListener('click', fecharUI);
    d.querySelector('#kz-mod-ajuda').addEventListener('click', () => {
      const n = d.querySelector('#kz-mod-nota');
      n.hidden = !n.hidden;
      if (!n.hidden) {
        n.textContent = 'Se você acha que o sistema foi injusto, fale com a coordenação. '
          + 'Este aviso não guarda cópia do seu texto.';
      }
    });
    d.addEventListener('mousedown', (e) => { if (e.target === d) fecharUI(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && d.getAttribute('data-aberto') === '1') fecharUI();
    });
  }
  uiInjetada = true;
}

export function fecharUI() {
  const d = document.getElementById('kz-mod-backdrop');
  if (d) {
    d.setAttribute('data-aberto', '0');
    d.querySelector('#kz-mod-nota').hidden = true;
  }
  if (ultimoFoco && typeof ultimoFoco.focus === 'function') {
    try { ultimoFoco.focus(); } catch (_) { /* foco pode ter sumido */ }
  }
  ultimoFoco = null;
}

/** Mostra o painel de bloqueio. */
export function mostrarBloqueio(resultado) {
  garantirUI();
  const d = document.getElementById('kz-mod-backdrop');
  if (!d) return;

  const temSeguranca = resultado.motivos.some((m) => m.tipo === 'inseguro');
  d.querySelector('#kz-mod-titulo').textContent = temSeguranca
    ? 'Bloqueado por segurança'
    : 'Não foi possível publicar';
  d.querySelector('.kz-mod__sub').textContent = temSeguranca
    ? 'Detectamos código ou um endereço perigoso no texto. Nada foi enviado.'
    : 'O texto não foi enviado. Nada foi gravado no banco de dados.';

  d.querySelector('#kz-mod-lista').innerHTML = resultado.motivos.slice(0, 8).map((m) =>
    '<li class="kz-mod__item" data-tipo="' + escapeHTML(m.tipo || 'termo') + '">'
    + '<b>' + escapeHTML(m.rotulo || m.campo) + '</b>'
    + '<span>' + escapeHTML(m.detalhe) + '</span></li>'
  ).join('');

  ultimoFoco = document.activeElement;
  d.setAttribute('data-aberto', '1');
  const btn = d.querySelector('#kz-mod-voltar');
  if (btn) btn.focus();
}

/**
 * Atalho: valida e, se estiver bloqueado, mostra o painel.
 * @returns {boolean} true = pode seguir com a escrita
 */
export function aprovar(campos, opts = {}) {
  const r = validar(campos, opts);
  if (r.ok) return true;
  registrarTentativa(r, opts.origem || 'desconhecido');
  mostrarBloqueio(r);
  return false;
}

/* ============================================================================
 * 9. LISTA REMOTA (painel do Admin/Moderador)
 * ==========================================================================*/

export async function carregarConfiguracao(forcar = false) {
  if (!forcar && estado.pronto && Date.now() - estado.cacheEm < TTL_CACHE_MS) return estado.listaRemota;
  try {
    const snap = await getDoc(doc(db, DOC_REMOTO));
    if (snap.exists()) {
      const d = snap.data() || {};
      estado.listaRemota = {
        extras: Array.isArray(d.extras) ? d.extras : [],
        desativados: Array.isArray(d.desativados) ? d.desativados : [],
        hateSpeechAtivo: d.hateSpeechAtivo !== false
      };
      if (d.limites && typeof d.limites === 'object') {
        estado.limites = Object.assign({}, estado.limites, d.limites);
      }
    }
  } catch (_) {
    // sem rede: mantém a lista embutida (fail-safe, nunca abre tudo)
  }
  estado.cacheEm = Date.now();
  estado.pronto = true;
  cachePadroes = null;
  return estado.listaRemota;
}

export async function salvarConfiguracao(parcial, autor = 'sistema') {
  const atual = await carregarConfiguracao(true);
  const novo = {
    extras: sanitizarLista(parcial.extras !== undefined ? parcial.extras : atual.extras),
    desativados: sanitizarLista(parcial.desativados !== undefined ? parcial.desativados : atual.desativados),
    hateSpeechAtivo: parcial.hateSpeechAtivo !== undefined ? !!parcial.hateSpeechAtivo : atual.hateSpeechAtivo,
    limites: Object.assign({}, estado.limites, parcial.limites || {}),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: autor
  };
  await setDoc(doc(db, DOC_REMOTO), novo, { merge: true });
  estado.listaRemota = { extras: novo.extras, desativados: novo.desativados, hateSpeechAtivo: novo.hateSpeechAtivo };
  estado.limites = novo.limites;
  cachePadroes = null;
  estado.cacheEm = Date.now();
  return estado.listaRemota;
}

/** Trava contra "__proto__" e strings absurdas vindas do painel. */
function sanitizarLista(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  const vistos = new Set();
  for (const bruto of lista) {
    if (typeof bruto !== 'string') continue;
    const t = normalizarTermo(bruto);
    if (!t || t.length < 2 || t.length > 40) continue;
    if (['__proto__', 'constructor', 'prototype'].indexOf(t) !== -1) continue;
    if (!/[a-z]{2,}/.test(t)) continue;
    if (vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
    if (out.length >= 400) break;
  }
  return out;
}

export function obterConfiguracao() {
  return {
    extras: (estado.listaRemota.extras || []).slice(),
    desativados: (estado.listaRemota.desativados || []).slice(),
    hateSpeechAtivo: estado.listaRemota.hateSpeechAtivo !== false,
    limites: Object.assign({}, estado.limites),
    totalEmbutidos: Object.values(LISTA_EMBUTIDA).reduce((a, b) => a + b.length, 0),
    staff: estado.staff
  };
}

/* ============================================================================
 * 10. PAPÉIS + BOOT
 * ==========================================================================*/

export function definirPapeis(roles = {}, user = null) {
  estado.staff = !!(roles && (roles.Admin || roles.Moderador));
  estado.uid = (user && user.uid) || null;
  estado.nome = (user && (user.displayName || user.email)) || null;
  return estado.staff;
}

/** Limpa o estado local (usar no logout). */
export function encerrarSessao() {
  estado.staff = false;
  estado.uid = null;
  estado.nome = null;
  estado.historicoTentativas = [];
}

export async function iniciarModeracao() {
  garantirUI();
  try {
    await carregarConfiguracao();
  } catch (_) { /* fail-safe: segue com a lista embutida */ }
  window.moderacaoAPI = {
    validar,
    validarTexto,
    aprovar,
    mostrarBloqueio,
    fecharUI,
    normalizar,
    normalizarAgressivo,
    normalizarTermo,
    carregarConfiguracao,
    salvarConfiguracao,
    obterConfiguracao,
    definirPapeis,
    encerrarSessao,
    historico: () => estado.historicoTentativas.slice(),
    estado: () => ({
      staff: estado.staff,
      pronto: estado.pronto,
      hateSpeechAtivo: estado.listaRemota.hateSpeechAtivo !== false,
      extras: (estado.listaRemota.extras || []).length
    })
  };
  return window.moderacaoAPI;
}
