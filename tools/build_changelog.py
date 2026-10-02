#!/usr/bin/env python3
"""
Gera `changelog.json` a partir de `CHANGELOG.md`.

Uso:
    python tools/build_changelog.py

Por que existe:
    A página de Atualizações e a tela de Manutenção leem o histórico técnico
    de forma estruturada. O Markdown é a fonte da verdade (regra append-only);
    este script apenas o converte — nunca edita o CHANGELOG.md.

Saída (changelog.json):
    {
      "geradoEm": "ISO8601",
      "versaoAtual": "1.6.0",
      "totalEntradas": 2,
      "entradas": [ { versao, data, autor, escopo, arquivos[], secoes[] } ]
    }
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "CHANGELOG.md")
OUT = os.path.join(ROOT, "changelog.json")

RE_ENTRADA = re.compile(
    r"^##\s*\[v(?P<versao>[^\]]+)\]\s*[—-]{1,2}\s*(?P<data>[\d\-/]+)"
    r"(?:\s*[—-]{1,2}\s*Autor:\s*(?P<autor>.+))?\s*$"
)
RE_SEÇÃO = re.compile(r"^###\s+(?P<titulo>.+?)\s*$")
RE_BLOCO = re.compile(r"^####\s+(?P<titulo>.+?)\s*$")
RE_ITEM = re.compile(r"^\s*[-*+]\s+(?P<texto>.+?)\s*$")
RE_CODIGO = re.compile(r"^```")
RE_TITULO_LIMPO = re.compile(r"^\d+\.\s*")
RE_NIVEL = re.compile(r"^\[(?P<nivel>[A-ZÇÃÕÁÉÍÓÚÊÔÃÕÇ]+)\]\s*")

SECOES_ESPECIAIS = {"escopo", "arquivos tocados"}


def limpar_titulo(bruto: str) -> str:
    """Remove '1. ', crases e o prefixo '[CRÍTICO]', deixando só o título."""
    t = bruto.strip().replace("`", "")
    t = RE_TITULO_LIMPO.sub("", t)
    t = RE_NIVEL.sub("", t)
    return t.strip()


def nivel_de(bruto: str):
    """Extrai 'CRÍTICO' de '#### 1. `[CRÍTICO]` Título'."""
    limpo = RE_TITULO_LIMPO.sub("", bruto.strip().replace("`", ""))
    m = RE_NIVEL.match(limpo)
    return m.group("nivel") if m else None


def fundir_linhas(linhas):
    """
    O CHANGELOG usa quebra de linha manual dentro dos bullets, o que faz o
    Markdown virar vários fragments (`li`, `p`, `p`...). Unimos os parágrafos
    soltos de volta ao bullet anterior para o texto sair como uma frase só.
    """
    saida = []
    for tipo, texto in linhas:
        if tipo == "p" and saida:
            tipo_anterior, texto_anterior = saida[-1]
            # Continuação de bullet: junta com espaço (a quebra era só de layout)
            if tipo_anterior == "li":
                saida[-1] = ("li", f"{texto_anterior} {texto}".strip())
                continue
            if texto_anterior.endswith((".", "!", "?", ":", ";")):
                saida.append((tipo, texto))
                continue
            saida[-1] = (tipo_anterior, f"{texto_anterior} {texto}".strip())
            continue
        saida.append((tipo, texto))
    return saida


def parse(md: str):
    linhas = md.splitlines()
    entradas = []
    atual = None
    secao = None
    bloco = None
    em_codigo = False
    buffer_codigo = []

    def fechar_bloco():
        nonlocal bloco
        if secao is not None and bloco is not None:
            secao["blocos"].append(bloco)
        bloco = None

    def fechar_secao():
        nonlocal secao
        fechar_bloco()
        if secao is not None and atual is not None:
            atual["secoes"].append(secao)
        secao = None

    def fechar_entrada():
        nonlocal atual
        fechar_secao()
        if atual is not None:
            entradas.append(atual)
        atual = None

    for linha in linhas:
        # blocos de código sao preservados literais
        if RE_CODIGO.match(linha):
            em_codigo = not em_codigo
            if em_codigo:
                buffer_codigo = []
            else:
                if bloco is not None:
                    bloco["codigo"].append("\n".join(buffer_codigo))
                buffer_codigo = []
            continue
        if em_codigo:
            buffer_codigo.append(linha)
            continue

        m_enc = RE_ENTRADA.match(linha)
        if m_enc:
            fechar_entrada()
            atual = {
                "versao": m_enc.group("versao").strip(),
                "data": m_enc.group("data").strip(),
                "autor": (m_enc.group("autor") or "").strip(),
                "escopo": "",
                "arquivos": [],
                "secoes": [],
            }
            continue

        if atual is None:
            continue

        if linha.strip() == "---":
            fechar_secao()
            continue

        m_sec = RE_SEÇÃO.match(linha)
        if m_sec:
            fechar_secao()
            titulo = m_sec.group("titulo").strip()
            chave = RE_TITULO_LIMPO.sub("", titulo).strip().lower()
            secao = {
                "titulo": titulo,
                "chave": chave,
                "blocos": [],
                "linhas": [],
            }
            continue

        m_bloco = RE_BLOCO.match(linha)
        if m_bloco and secao is not None:
            fechar_bloco()
            bruto = m_bloco.group("titulo").strip()
            bloco = {
                "titulo": limpar_titulo(bruto),
                "nivel": nivel_de(bruto),
                "linhas": [],
                "codigo": [],
            }
            continue

        item = RE_ITEM.match(linha)
        if item and secao is not None:
            texto = item.group("texto").strip()
            if secao["chave"] == "arquivos tocados":
                atual["arquivos"].append(texto.replace("`", "").strip())
                continue
            if bloco is None:
                bloco = {"titulo": "", "nivel": None, "linhas": [], "codigo": []}
            bloco["linhas"].append(("li", texto))
            continue

        texto = linha.rstrip()
        if not texto.strip():
            continue
        if secao is None:
            continue

        if secao["chave"] == "escopo":
            if atual["escopo"]:
                atual["escopo"] += "\n"
            atual["escopo"] += texto.strip()
            continue

        # parágrafo corrido dentro da seção atual
        if bloco is not None:
            bloco["linhas"].append(("p", texto.strip()))
        else:
            secao["linhas"].append(("p", texto.strip()))

    fechar_entrada()

    # Remove campos vazios para deixar o JSON enxuto
    for e in entradas:
        if not e["arquivos"]:
            e.pop("arquivos")
        for s in e["secoes"]:
            for b in s.get("blocos", []):
                b["linhas"] = fundir_linhas(b["linhas"])
                if not b["linhas"]:
                    b.pop("linhas")
                if not b["codigo"]:
                    b.pop("codigo")
            if not s.get("linhas"):
                s.pop("linhas", None)
        if not e.get("secoes"):
            e.pop("secoes", None)
    return entradas


def main():
    if not os.path.isfile(SRC):
        sys.exit(f"CHANGELOG.md nao encontrado em {SRC}")

    with open(SRC, "r", encoding="utf-8") as f:
        entradas = parse(f.read())

    if not entradas:
        sys.exit("Nenhuma entrada '## [vX.Y.Z]' encontrada no CHANGELOG.md.")

    doc = {
        "geradoEm": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "versaoAtual": entradas[0]["versao"],
        "totalEntradas": len(entradas),
        "entradas": entradas,
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"changelog.json gerado: {len(entradas)} entrada(s), versao atual {doc['versaoAtual']}")


if __name__ == "__main__":
    main()
