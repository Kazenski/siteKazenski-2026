#!/usr/bin/env python3
"""
Gera `_aluno.html`: pagina estatica que renderiza APENAS o markup das
sub-abas do Aluno Tech, com o Tailwind CDN e o style.css reais.

Serve para inspecao visual das abas sem depender de login/Firebase
(o app real esconde o painel quando nao ha usuario autenticado).

Uso:  python tools/harness/build_aluno.py
Abrir: http://localhost:8791/_aluno.html   (?tab=caderno para pular para uma aba)
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "_aluno.html")

TABS = ["geral", "caderno", "kanban", "horario", "calendario", "mochila", "tcg"]


def extrai_blocos(linhas):
    """Recorta cada <div id="atab-*" ...> ate o div que fecha."""
    blocos = {}
    for t in TABS:
        ini = next((i for i, l in enumerate(linhas) if f'id="atab-{t}"' in l), None)
        if ini is None:
            raise SystemExit(f"atab-{t} nao encontrado")
        prof = 0
        fim = None
        for i in range(ini, len(linhas)):
            for m in re.finditer(r"<(/?)div\b", linhas[i], re.I):
                prof += -1 if m.group(1) else 1
            if prof == 0 and i > ini:
                fim = i
                break
        if fim is None:
            raise SystemExit(f"atab-{t} nao fecha (divs desbalanceados)")
        blocos[t] = "\n".join(linhas[ini:fim + 1])
    return blocos


def main():
    with open(SRC, encoding="utf-8") as f:
        linhas = f.read().replace("\r\n", "\n").split("\n")

    blocos = extrai_blocos(linhas)

    # nav das abas
    nav = "\n".join(
        f'<button class="aluno-tab-btn{" active" if t == "geral" else ""}" data-tab="{t}">{t.capitalize()}</button>'
        for t in TABS
    )
    # conteudo: todas as abas empilhadas, controlada por JS simples
    partes = []
    for t in TABS:
        estilo = "display:block" if t == "geral" else "display:none"
        # a aba inicial precisa de .active para o CSS do site exibi-la
        if t == "geral":
            blocos[t] = blocos[t].replace(
                'class="aluno-tab-content active"', 'class="aluno-tab-content active"', 1
            )
        partes.append(
            f'<div class="wrap" data-wrap="{t}" style="{estilo}">\n{blocos[t]}\n</div>'
        )
    corpo = "\n".join(partes)

    # cache-buster no style.css: o navegador e o GitHub Pages seguram o CSS
    css_ver = int(os.path.getmtime(os.path.join(ROOT, "style.css")))

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness - Abas do Aluno Tech</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v={css_ver}">
<style>
  body {{ background:#0f172a; color:#e2e8f0; font-family:'Inter',sans-serif; margin:0; }}
  .harness-nav {{ position:sticky; top:0; z-index:50; display:flex; gap:.4rem; flex-wrap:wrap;
                  padding:.6rem 1rem; background:#020617; border-bottom:1px solid #1e293b; }}
  .aluno-tab-btn {{ padding:.4rem .8rem; border-radius:.5rem; font-size:.75rem; font-weight:700;
                    background:#1e293b; color:#94a3b8; border:1px solid #334155; cursor:pointer; }}
  .aluno-tab-btn.active {{ background:#1d4ed8; color:#fff; border-color:#3b82f6; }}
  .wrap {{ padding:1rem; }}
</style>
</head>
<body>
  <div class="harness-nav">{nav}</div>
  <div id="harness-body">{corpo}</div>
<script>
  //Qsso substitui setupTabsNavigation: nao depende de Firebase.
  document.querySelector('.harness-nav').addEventListener('click', (e) => {{
    const btn = e.target.closest('.aluno-tab-btn');
    if (!btn) return;
    const alvo = btn.dataset.tab;
    document.querySelectorAll('.aluno-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.wrap').forEach(w => {{
      const visivel = (w.dataset.wrap === alvo);
      w.style.display = visivel ? 'block' : 'none';
      // .aluno-tab-content usa display:none + .active para aparecer
      const inner = w.querySelector('.aluno-tab-content');
      if (inner) inner.classList.toggle('active', visivel);
    }});
    window.dispatchEvent(new Event('resize'));
  }});
  const inicial = new URLSearchParams(location.search).get('tab');
  if (inicial) {{
    const b = document.querySelector('.aluno-tab-btn[data-tab="' + inicial + '"]');
    if (b) b.click();
  }}
</script>
</body>
</html>
"""
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"_aluno.html gerado: {len(html)} bytes, {len(TABS)} abas")
    print("abra: /_aluno.html?tab=geral | ?tab=caderno | ?tab=kanban | ...")
    for t in TABS:
        print(f"  ?tab={t}")


if __name__ == "__main__":
    main()