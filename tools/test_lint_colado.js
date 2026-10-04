// Self-test do lint_colado.js.
//
// O lint so vale alguma coisa se acertar nos dois sentidos: acusar o erro de
// digitacao e NAO acusar o codigo bom. Antes das regras 4 e 5 (chave de
// objeto e identificador declarado) ele dava 330 falsos positivos no
// professorTech.js e 24 no resto do repo -- ou seja, inutilizavel.
//
// Os casos marcados "falso positivo historico" sao trechos reais do projeto
// que o lint acusava antes das correcoes.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditarTexto } = require('./lint_colado.js');

const ACUSAR = [
    ['o bug real', 'letapoiaEncaminharPendente = [];\napoiaEncaminharPendente.push(1);\n'],
    ['const colado', 'constassunto = window.assunto;\n'],
    ['return colado', 'function f() {\n    returnvalor;\n}\n'],
    ['new colado', 'newDate();\n'],
    ['declaracao colada no meio da linha', 'let cache = []; letcontador = 0;\n'],
    ['await colado', 'async function f() {\n    awaitdoc.get();\n}\n'],
    ['function colada', 'functioniniciar() {}\n'],
    ['function colada apos chave', 'function f() {}\nfunctionoutro() {}\n']
];

const ACEITAR = [
    ['document', 'const el = document.getElementById("x");\n'],
    ['import do firebase', 'import { doc, getDoc, deleteDoc } from "https://x/firebase.js";\n'],
    ['falso positivo historico: chave letra', 'const musica = { letra: $("mus-letra").value };\n'],
    ['falso positivo historico: variantes', 'function r(variantes) {\n    variantes.sort();\n    return variantes.length;\n}\n'],
    ['falso positivo historico: news', 'let news = null;\nfunction u(variantes, news) {\n    return news && variantes;\n}\n'],
    ['falso positivo historico: newBtnPrev', 'const { newBtnPrev, newBtnNext } = els;\nnewBtnPrev.addEventListener("click", f);\nnewBtnNext.addEventListener("click", f);\n'],
    ['falso positivo historico: classId em desestruturacao', 'let { classId, disciplineId } = state.filters;\nreturn classId + disciplineId;\n'],
    ['palavra solta em string', 'const msg = "nao use letspace aqui";\nconst tpl = `template letalgo ${valor}`;\n'],
    ['palavra solta em comentario', '// letcomentado = 1;\n/* constcomentado = 2; */\n'],
    ['declaracao normal', 'let apoiaX = [];\nconst { y } = obj;\nfunction f() { return apoiaX; }\n'],
    ['acesso a propriedade', 'obj.newValue = 1;\narr.inMap = 2;\nconfig.forEach(f);\n'],
    ['metodo do firebase', 'await deleteDoc(ref);\nreturn getDoc(q);\n']
];

function main() {
    let falhas = 0;

    for (const [nome, src] of ACUSAR) {
        const achados = auditarTexto(src, nome);
        if (achados.length === 1) {
            console.log(`  ok   acusa   ${nome}   (${achados[0].palavra}+${achados[0].nome})`);
            continue;
        }
        falhas++;
        console.log(`  FALHA  ${nome}: esperado 1 achado, veio ${achados.length}`);
        for (const a of achados) console.log(`          ${a.palavra}+${a.nome}  ->  ${a.trecho}`);
    }

    for (const [nome, src] of ACEITAR) {
        const achados = auditarTexto(src, nome);
        if (achados.length === 0) {
            console.log(`  ok   aceita  ${nome}`);
            continue;
        }
        falhas++;
        console.log(`  FALHA  ${nome}: nao devia acusar nada, veio ${achados.length}`);
        for (const a of achados) console.log(`          ${a.palavra}+${a.nome}  ->  ${a.trecho}`);
    }

    // A razao de o lint existir: `node --check` aprova esse arquivo.
    const tmp = path.join(os.tmpdir(), 'lint_colado_selftest.js');
    fs.writeFileSync(tmp, 'letapoiaEncaminharPendente = [];', 'utf-8');
    let nodeCheckPega = false;
    try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
        nodeCheckPega = true;
    }
    fs.unlinkSync(tmp);
    console.log(nodeCheckPega
        ? '  ok   `node --check` pega esse caso -- o lint colado virou redundante'
        : '  ok   `node --check` NAO pega esse caso -- razao do lint existir');

    const total = ACUSAR.length + ACEITAR.length;
    if (falhas) {
        console.log(`\n  ${falhas} caso(s) do self-test falharam (de ${total})\n`);
        process.exit(1);
    }
    console.log(`\n  ok   ${total} casos do self-test\n`);
}

main();