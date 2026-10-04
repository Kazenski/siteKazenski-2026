// Procura palavra-chave colada num identificador: `letapoiaX = []`, `returnx`,
// `newDate()`, `typeofid`. Erro de digitacao classico que o `node --check`
// NAO pega, porque no modo sloppy `letapoiaX = []` e uma atribuicao a global
// implicito: sintaxe perfectly valida, e so estoura em runtime com
// ReferenceError quando outro trecho le `apoiaX`.
//
// Como nao da para distinguir `do` + `cument` (document) so pela forma, a regra
// e restrictiva de proposito:
//
//   1. a palavra-chave precisa estar em posicao de comando -- inicio de linha
//      (so espacos antes) ou logo apos `;` `{` `}` `(` `,`. Isso elimina
//      acesso a propriedade (`obj.forEach`, `x.in`) e metodo (`foo.delete()`).
//   2. a lista de palavras e a de `let`/`const`/`var`/`function`/`return`/
//      `new`/etc. Ficam de fora as que formam prefixo natural de identificador
//      em codigo normal: `do`/`in`/`of`/`case`/`else`/`if`/`for`/`while`/
//      `try`/`catch`/`break`/`continue`/`default`/`switch` (daria `doc`,
//      `document`, `dataIs`, `options`, `force`, `beforeEach`...), e tambem
//      `class` (`classId`), `delete` (`deleteDoc`) e `extends`. Essas tres
//      ja vem quasi sempre com espaco depois, entao nao agregam deteccao.
//   3. comentarios e literais sao neutralizados antes, para nao acusar texto
//      de string. Template literal e neutralizado inteiro, inclusive o que
//      ha dentro de `${...}` -- aceitavel, porque o alvo sao erros de
//      digitacao em codigo, nao em rotulos exibidos ao usuario.
//   4. o pedaco colado tem que ser um identificador de verdade, ou seja, sem
//      `:` logo depois (senao e chave de objeto: `letra: valor`) e sem espaco
//      antes (senao a palavra-chave esta funcionando).
//   5. e o mais importante: o identificador colado NAO pode estar declarado
//      em lugar nenhum do arquivo. `let apoiaX = []` declara; `letapoiaX = []`
//      nao declara nada, so cria um global implicito -- enquanto `variantes`,
//      `news`, `newBtnPrev` e `letra` sao identificadores legítimos, com
//      declaracao e uso. E o que separa o erro de digitacao do codigo bom.
//
// Uso: node tools/lint_colado.js <arquivo.js> [...]
const fs = require('fs');
const path = require('path');

// Palavras-chave que nao formam prefixo natural de identificador.
const PALAVRAS = [
    'const', 'let', 'var', 'function', 'return',
    'typeof', 'new', 'void', 'await', 'yield',
    'throw', 'import', 'export'
];

// Antes da palavra-chave: nada (ou so espacos) numa linha nova, ou um destes.
const INICIO_COMANDO = '(?:^\\s*|(?<=[;{}(,])\\s*)';
const REGEX = new RegExp(
    INICIO_COMANDO + '(' + PALAVRAS.join('|') + ')(?=[A-Za-z_$])',
    'gm'
);

/** Substitui comentarios e literais por espacos, preservando as quebras de linha. */
function neutralizar(src) {
    const out = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
        const c = src[i];
        const d = src[i + 1];

        // comentario de linha
        if (c === '/' && d === '/') {
            while (i < n && src[i] !== '\n') { out.push(' '); i++; }
            continue;
        }
        // comentario de bloco
        if (c === '/' && d === '*') {
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                out.push(src[i] === '\n' ? '\n' : ' ');
                i++;
            }
            out.push('  ');
            i += 2;
            continue;
        }
        // string ou template literal (tratado inteiro, ate a aspa de fechamento)
        if (c === '"' || c === "'" || c === '`') {
            const aspas = c;
            out.push(' ');
            i++;
            while (i < n) {
                if (src[i] === '\\') { out.push('  '); i += 2; continue; }
                if (src[i] === aspas) { i++; break; }
                out.push(src[i] === '\n' ? '\n' : ' ');
                i++;
            }
            out.push(' ');
            continue;
        }
        out.push(c);
        i++;
    }
    return out.join('');
}

/** Numero da linha (1-based) de uma posicao do arquivo. */
function linhaDe(src, pos) {
    let linha = 1;
    for (let i = 0; i < pos; i++) if (src[i] === '\n') linha++;
    return linha;
}

/** Identificador colado: `letapoiaX` -> { palavra: 'let', nome: 'apoiaX' }. */
function identificar(limpo, posDaPalavra) {
    const resto = limpo.slice(posDaPalavra).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    return resto ? resto[0] : null;
}

// Globais que nao precisam estar declarados no arquivo.
const GLOBAIS = new Set([
    'console', 'window', 'document', 'globalThis', 'self', 'top', 'parent',
    'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
    'BigInt', 'Date', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'RegExp',
    'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
    'Function', 'Intl', 'URL', 'URLSearchParams', 'Headers', 'Request',
    'Response', 'AbortController', 'Blob', 'File', 'FileReader', 'FormData',
    'Image', 'Audio', 'Event', 'CustomEvent', 'EventTarget', 'MutationObserver',
    'ResizeObserver', 'IntersectionObserver', 'performance', 'crypto',
    'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
    'structuredClone', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm', 'prompt',
    'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'indexedDB', 'screen', 'visualViewport', 'innerWidth', 'innerHeight',
    'undefined', 'NaN', 'Infinity', 'arguments'
]);

/** Nomes declarados por um padrao de desestruturacao: `{ a, b: c, d = 1 }`. */
function nomesDeDesestruturacao(trecho) {
    const nomes = [];
    let profundidade = 0;
    let atual = '';
    const partes = [];
    for (const ch of trecho) {
        if (ch === '{' || ch === '[' || ch === '(') { profundidade++; atual += ch; continue; }
        if (ch === '}' || ch === ']' || ch === ')') { profundidade--; atual += ch; continue; }
        if (ch === ',' && profundidade === 0) { partes.push(atual); atual = ''; continue; }
        atual += ch;
    }
    if (atual.trim()) partes.push(atual);

    for (const parte of partes) {
        // tira o valor padrao e o apelido: `a = 1` -> a, `b: c` -> c
        let alvo = parte.split('=')[0];
        const doisPontos = alvo.lastIndexOf(':');
        if (doisPontos >= 0) alvo = alvo.slice(doisPontos + 1);
        alvo = alvo.trim();
        // desestruturacao aninhada
        if (/^[{[([]/.test(alvo)) {
            const fim = alvo.lastIndexOf(/[}\])]/);
            nomes.push(...nomesDeDesestruturacao(alvo.slice(1, fim > 0 ? fim : undefined)));
            continue;
        }
        const id = alvo.match(/^[A-Za-z_$][\w$]*/);
        if (id) nomes.push(id[0]);
    }
    return nomes;
}

/** Todas as declaracoes de nome do arquivo: var/let/const, funcao, classe, import. */
function nomesDeclarados(limpo) {
    const nomes = new Set();
    let m;

    // `let x`, `const x = ...` e desestruturacao `const { a, b } = ...`
    const decl = /\b(?:let|const|var)\s+([^=;\n]+)/g;
    while ((m = decl.exec(limpo)) !== null) {
        const alvo = m[1].trim();
        if (/^[{[]/.test(alvo)) {
            const abre = alvo[0];
            const fecha = abre === '{' ? '}' : ']';
            const fim = alvo.indexOf(fecha);
            if (fim > 0) nomesDeDesestruturacao(alvo.slice(1, fim)).forEach((n) => nomes.add(n));
            continue;
        }
        const id = alvo.match(/^[,;\s]*([A-Za-z_$][\w$]*)/);
        if (id) nomes.add(id[1]);
    }

    // `function x`, `function* x`, `class x`
    const func = /\b(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g;
    while ((m = func.exec(limpo)) !== null) nomes.add(m[1]);

    // `import x from`, `import { a, b } from`
    const imp = /\bimport\s+([^;\n]*?)\s+from\b/g;
    while ((m = imp.exec(limpo)) !== null) {
        const clause = m[1];
        const chaves = clause.match(/\{([^}]*)\}/);
        if (chaves) {
            nomesDeDesestruturacao(chaves[1]).forEach((n) => nomes.add(n));
            continue;
        }
        const id = clause.match(/^[*\s]*([A-Za-z_$][\w$]*)/);
        if (id) nomes.add(id[1]);
    }

    // parametros: toda assinatura `( ... )` seguida de `=>` ou `{`,
    // alem de `function x ( ... )` e `catch ( ... )`
    const assinaturas = [
        /\bfunction[^(]*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
        /\bcatch\s*\(([^()]*)\)/g,
        /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:=>|\{)/g
    ];
    for (const re of assinaturas) {
        while ((m = re.exec(limpo)) !== null) {
            nomesDeDesestruturacao(m[1]).forEach((n) => nomes.add(n));
        }
    }

    return nomes;
}

function auditarTexto(original, nomeArquivo) {
    const arquivo = nomeArquivo || '(texto)';
    const limpo = neutralizar(original);
    const declarados = nomesDeclarados(limpo);
    const achados = [];
    let m;

    REGEX.lastIndex = 0;
    while ((m = REGEX.exec(limpo)) !== null) {
        const posPalavra = m.index + m[0].length - m[1].length;
        const nome = identificar(limpo, posPalavra);
        // `let` sozinho, ou `let` seguido de algo que nao seja identificador
        if (!nome) continue;

        // nao e palavra-chave colada: `letra: valor` e chave de objeto, e
        // `let x` tem espaco, que o proprio REGEX ja exclui
        if (limpo[posPalavra + nome.length] === ':') {
            REGEX.lastIndex = posPalavra + m[1].length + nome.length;
            continue;
        }

        // identificador de verdade, declarado em algum lugar do arquivo
        if (declarados.has(nome) || GLOBAIS.has(nome)) {
            REGEX.lastIndex = posPalavra + m[1].length + nome.length;
            continue;
        }

        const trecho = original.slice(posPalavra, posPalavra + 48).split('\n')[0].trim();
        achados.push({
            arquivo,
            linha: linhaDe(original, posPalavra),
            palavra: m[1],
            nome,
            trecho
        });
        // pula o identificador inteiro para nao acusar a mesma linha duas vezes
        REGEX.lastIndex = posPalavra + m[1].length + nome.length;
    }
    return achados;
}

function auditar(arquivo) {
    return auditarTexto(fs.readFileSync(arquivo, 'utf-8'), arquivo);
}

function main() {
    const arquivos = process.argv.slice(2);
    if (!arquivos.length) {
        console.error('uso: node tools/lint_colado.js <arquivo.js> [...]');
        process.exit(2);
    }

    const todos = [];
    for (const a of arquivos) {
        const caminho = path.isAbsolute(a) ? a : path.join(process.cwd(), a);
        if (!fs.existsSync(caminho)) {
            console.error(`  arquivo nao encontrado: ${a}`);
            process.exit(2);
        }
        todos.push(...auditar(caminho));
    }

    if (todos.length) {
        console.log(`\n  ${todos.length} palavra-chave colada(s) em identificador:\n`);
        for (const a of todos) {
            console.log(`  ${a.arquivo}:${a.linha}  ${a.palavra}+${a.nome}  ->  ${a.trecho}`);
        }
        console.log('\n  No modo sloppy isso vira global implicito e so quebra em runtime,');
        console.log('  com ReferenceError. O `node --check` nao acusa esse caso.\n');
        process.exit(1);
    }

    console.log(`  ok   nenhuma palavra-chave colada em ${arquivos.length} arquivo(s)`);
}

module.exports = { auditarTexto, auditar, neutralizar, nomesDeclarados, GLOBAIS, PALAVRAS };

if (require.main === module) main();