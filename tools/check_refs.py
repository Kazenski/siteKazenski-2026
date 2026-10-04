"""
Verificacao estatica de referencias.

Falha apenas em regressoes NOVAS: itens preexistentes ficam numa baseline
(versionada) com a explicacao de por que sao aceitaveis.

    python tools/check_refs.py            # compara com a baseline
    python tools/check_refs.py --update   # regrava a baseline
"""
import re
import sys
import json
import os

ARQ = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'check_refs_baseline.json')
JS = 'js/professorTech/professorTech.js'
HTML = 'index.html'

# Itens que o verificador nao deve considerar erro.
# Formato: chave -> motivo
CONHECIDOS = {
    # Usado dentro de `if (els.evalSelectAv)`, entao undefined e seguro.
    # Elemento so existe na tela de avaliacao do aluno, nao no professor.
    'els_sem_declarar': {
        'evalSelectAv': 'acesso guardado por if (...)',
    },
    # Criados em runtime via template (id="${id}") ou inseridos com innerHTML.
    'ids_ausentes_no_html': {
        'evol-kpi-freq': 'id gerado por renderEvolucaoKpis (id="evol-kpi-freq")',
        'evol-kpi-freq-sub': 'id gerado por renderEvolucaoKpis (id="${id}-sub")',
        'btn-grant-all-tcg': 'inserido por JS na aba TCG',
        'tcg-eligible-list': 'inserido por JS na aba TCG',
        'dynamic-tcg-modal': 'modal criado dinamicamente',
        'hist-faltas-dinamico': 'criado ao montar a analise de historico',
        'kaz-ia-config-panel': 'painel da Kaz IA montado por JS',
        'kaz-ia-context-display': 'painel da Kaz IA montado por JS',
        'kaz-ia-result-area': 'painel da Kaz IA montado por JS',
        'kaz-ia-source-content': 'painel da Kaz IA montado por JS',
    },
}


def coletar():
    src = open(JS, encoding='utf-8').read()
    html = open(HTML, encoding='utf-8').read()

    ini = src.index('function mapearDOM')
    fim = src.index('\n}\n', ini)
    declaradas = set(re.findall(r'^\s{8}(\w+):', src[ini:fim], flags=re.M))
    usadas_els = set(re.findall(r'\bels\.(\w+)', src))

    ids_js = set(re.findall(r"getElementById\('([^']+)'\)", src))
    ids_html = set(re.findall(r'id="([^"]+)"', html))

    return {
        'els_sem_declarar': sorted(u for u in usadas_els if u not in declaradas),
        'ids_ausentes_no_html': sorted(i for i in ids_js if i not in ids_html),
    }


def diff(atual, base):
    """Novos problemas = itens atuais que nao estavam na baseline nem sao conhecidos."""
    novos = {}
    for chave, itens in atual.items():
        conhecidos = set(CONHECIDOS.get(chave, {}).keys())
        if chave not in base:
            novos[chave] = sorted(set(itens) - conhecidos)
        else:
            antes = set(base[chave])
            novos[chave] = sorted((set(itens) - antes) - conhecidos)
    return novos


def main():
    atual = coletar()
    if '--update' in sys.argv:
        with open(ARQ, 'w', encoding='utf-8') as f:
            json.dump(atual, f, indent=2, ensure_ascii=False, sort_keys=True)
        print('baseline atualizada em', ARQ)
        for k, v in atual.items():
            print(f'  {k}: {len(v)}')
        return 0

    if os.path.exists(ARQ):
        base = json.load(open(ARQ, encoding='utf-8'))
    else:
        base = {}

    novos = diff(atual, base)
    total = sum(len(v) for v in novos.values())

    for chave, itens in novos.items():
        if not itens:
            continue
        print(f'REGRESSAO em {chave}:')
        for i in itens:
            motivo = CONHECIDOS.get(chave, {}).get(i)
            print(f'  + {i}' + (f'  ({motivo})' if motivo else ''))

    if total:
        print(f'\n{total} problema(s) NOVO(S).')
        return 1

    counts = ', '.join(f'{k}={len(v)}' for k, v in atual.items())
    print(f'OK: sem regressoes ({counts})')
    return 0


if __name__ == '__main__':
    sys.exit(main())