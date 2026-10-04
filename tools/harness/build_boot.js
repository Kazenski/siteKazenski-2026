// Harness de boot: carrega o modulo real (js/professorTech/professorTech.js)
// e verifica que ele avaliou inteiro ate o fim.
//
// Existe por causa de um bug real. A linha 23 ficou
// `letapoiaEncaminharPendente = []` (sem espaco). Modulo ES e sempre modo
// strict, entao atribuir a identificador nao declarado lanca ReferenceError -- e
// isso aborta a avaliacao do modulo INTEIRO na linha 23. O
// `window.profAPI = { ... }` do fim do arquivo nunca roda. Resultado: a aba
// Professor inteira morria, com `window.profAPI` vazio, enquanto o
// `node --check` aprova o arquivo sem reclamar.
//
// O sinal e a quantidade de chaves de `window.profAPI`: 0 = o modulo morreu
// antes de se publicar. O piso vem de `_boot_baseline.json`, gerado a partir de
// um boot saudavel -- e um piso, nao uma igualdade, para que adicionar API nao
// exija mexer no baseline, e so uma regressao real reprove.
//
// Uso:
//   node tools/harness/build_boot.js <raiz-do-repo>
//   python -m http.server 8791 --bind 127.0.0.1    # na raiz do repo
//   abra  /_boot.html   e leia window.__RESULTADO__
//
// Para gravar/elevar o piso depois de uma mudanca deliberada:
//   node tools/harness/build_boot.js . --gravar   (depois de ler o valor novo)
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(process.argv[2] || '.');
const moduloRel = 'js/professorTech/professorTech.js';
const baselineRel = 'tools/harness/_boot_baseline.json';

// Erros esperados neste harness: sem as credenciais injetadas pelo deploy, o
// Firebase cai no placeholder e Auth/Firestore reclamam. Isso nao impede o
// modulo de se publicar, entao e separado do que barra o boot.
const IGNORAVEIS = [
    'invalid-api-key', 'api-key-not-valid', 'operation-not-allowed',
    'auth/', 'Firebase', 'permission-denied', 'unauthenticated',
    'Failed to fetch', 'net::ERR', 'ERR_', 'CORS', 'NetworkError'
];

function lerPiso() {
    const p = path.join(raiz, baselineRel);
    if (!fs.existsSync(p)) {
        console.log(`  FALHA  falta o baseline ${baselineRel}`);
        process.exit(1);
    }
    const min = JSON.parse(fs.readFileSync(p, 'utf-8')).minChavesProfAPI;
    if (typeof min !== 'number' || min <= 0) {
        console.log(`  FALHA  ${baselineRel} sem "minChavesProfAPI" valido`);
        process.exit(1);
    }
    return min;
}

function main() {
    const gravar = process.argv.includes('--gravar');
    const piso = lerPiso();

    const mod = path.join(raiz, moduloRel);
    if (!fs.existsSync(mod)) {
        console.log(`  FALHA  nao achei ${moduloRel}`);
        process.exit(1);
    }

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>boot do professorTech</title>
</head>
<body>
<!-- o modulo mapeia o DOM no boot, entao a pagina precisa existir; nao precisa
     ser o index.html inteiro, porque este harness so mede a avaliacao -->
<div id="professor-container"></div>

<script>
window.__ERROS__ = [];
const registar = (tipo, texto) => window.__ERROS__.push({ tipo, texto: String(texto) });
window.addEventListener('error', (e) => registar('error', e.message), true);
window.addEventListener('unhandledrejection', (e) => registar(
    'rejection', (e.reason && e.reason.message) || e.reason));
for (const m of ['error', 'warn']) {
    const orig = console[m].bind(console);
    console[m] = (...a) => { registar('console.' + m, a.map(String).join(' ')); orig(...a); };
}
window.__IGNORAVEIS__ = ${JSON.stringify(IGNORAVEIS)};
</script>

<script type="module">
const piso = ${piso};
const ignorar = (t) => window.__IGNORAVEIS__.some((p) => t.includes(p));
let lancou = null;

try {
    // query na URL = instancia nova do modulo, sem o cache do navegador
    await import('./${moduloRel}?boot=' + Date.now());
} catch (e) {
    lancou = ((e && e.message) || e);
}

// da um tick para o import resolver e o profAPI ser publicado
await new Promise((r) => setTimeout(r, 0));

const obtido = window.profAPI ? Object.keys(window.profAPI).length : 0;
const erros = lancou
    ? [{ tipo: 'import', texto: lancou }]
    : window.__ERROS__.filter((e) => !ignorar(e.texto));

window.__RESULTADO__ = {
    ok: obtido >= piso && erros.length === 0,
    piso,
    obtido,
    profAPI: typeof window.profAPI,
    erros
};
</script>
</body>
</html>`;

    const saida = path.join(raiz, '_boot.html');
    fs.writeFileSync(saida, html, 'utf-8');

    if (gravar) {
        fs.writeFileSync(
            path.join(raiz, baselineRel),
            JSON.stringify({ minChavesProfAPI: piso }, null, 2) + '\n',
            'utf-8'
        );
        console.log(`  ok   baseline gravado com piso ${piso}`);
    }

    console.log(`  ok   piso de ${piso} chave(s) em window.profAPI`);
    console.log(`  pagina gerada: ${saida} (nao versionada)`);
    console.log(`  sirva a raiz do repo e abra /_boot.html; leia window.__RESULTADO__`);
    console.log(`  esperado: { ok: true, obtido: >= ${piso}, erros: [] }`);
}

main();