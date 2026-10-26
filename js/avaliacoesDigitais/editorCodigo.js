// Editor de código (CodeMirror 6) para Python e SQL, com cores de sintaxe,
// numeração de linhas e tema claro ou escuro conforme o site.
// Destaque somente leitura (highlight.js) para exemplos e gabaritos.

import { EditorView, basicSetup } from "https://esm.sh/codemirror@6.0.1";
import { python } from "https://esm.sh/@codemirror/lang-python@6";
import { sql, PostgreSQL } from "https://esm.sh/@codemirror/lang-sql@6";
import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark@6";
import hljs from "https://esm.sh/highlight.js@11/lib/core";
import hljsPython from "https://esm.sh/highlight.js@11/lib/languages/python";
import hljsSql from "https://esm.sh/highlight.js@11/lib/languages/sql";

hljs.registerLanguage("python", hljsPython);
hljs.registerLanguage("sql", hljsSql);

const temaClaro = () => document.documentElement.classList.contains("theme-light");

let estilosInjetados = false;
function garantirEstilos() {
    if (estilosInjetados) return;
    estilosInjetados = true;
    const css = `
        .kz-codigo { border-radius: 0.5rem; overflow: hidden; border: 1px solid #334155; }
        .kz-codigo .cm-editor { font-size: 0.85rem; }
        .kz-codigo .cm-scroller { font-family: Consolas, "Courier New", monospace; min-height: 140px; }
        .kz-codigo .cm-editor.cm-focused { outline: 2px solid #38bdf8; }
        .hljs-codigo { background: #020617; color: #e2e8f0; border-radius: 0.5rem; padding: 0.75rem; overflow-x: auto; font-size: 0.85rem; }
        .theme-light .hljs-codigo { background: #f1f5f9; color: #0f172a; }
        .hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #c084fc; font-weight: 600; }
        .hljs-string, .hljs-title.function_ { color: #4ade80; }
        .hljs-number { color: #fb923c; }
        .hljs-comment { color: #64748b; font-style: italic; }
        .hljs-built_in, .hljs-type { color: #38bdf8; }
        .hljs-title, .hljs-title.class_ { color: #fbbf24; }
        .theme-light .hljs-keyword, .theme-light .hljs-selector-tag, .theme-light .hljs-literal { color: #7e22ce; }
        .theme-light .hljs-string, .theme-light .hljs-title.function_ { color: #15803d; }
        .theme-light .hljs-number { color: #c2410c; }
        .theme-light .hljs-comment { color: #64748b; }
        .theme-light .hljs-built_in, .theme-light .hljs-type { color: #0369a1; }
        .theme-light .hljs-title, .theme-light .hljs-title.class_ { color: #b45309; }`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
}

// Cria um editor dentro de `parent`. Devolve getValue/destroy.
export function criarEditorCodigo(parent, { linguagem = "python", valor = "", onChange } = {}) {
    garantirEstilos();
    parent.classList.add("kz-codigo");
    const extensoes = [
        basicSetup,
        linguagem === "sql" ? sql({ dialect: PostgreSQL }) : python(),
        EditorView.updateListener.of((u) => {
            if (u.docChanged && onChange) onChange(u.state.doc.toString());
        }),
    ];
    if (!temaClaro()) extensoes.push(oneDark);

    const view = new EditorView({ parent, doc: String(valor ?? ""), extensions: extensoes });
    return {
        getValue: () => view.state.doc.toString(),
        destroy: () => view.destroy(),
    };
}

// Destaque somente leitura. Devolve HTML já escapado pelo highlight.js.
export function destacarCodigo(codigo, linguagem) {
    garantirEstilos();
    const lang = linguagem === "sql" ? "sql" : "python";
    const html = hljs.highlight(String(codigo ?? ""), { language: lang }).value;
    return `<pre class="hljs-codigo"><code>${html}</code></pre>`;
}
