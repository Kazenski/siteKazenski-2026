"""
Confere se as tags do index.html estao balanceadas.

O arquivo ja vinha com um delta de -3 em <div> (existente no main), entao a
verificacao compara com uma baseline versionada e so falha em regressao nova.

    python tools/html_balance.py
"""
import re
import os
import json

ARQ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'html_balance_baseline.json')
HTML = 'index.html'

TAGS = ['div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'select', 'button',
        'label', 'canvas', 'p', 'span', 'a', 'ul', 'li', 'h1', 'h2', 'h3',
        'main', 'section', 'form', 'option']


def medir():
    h = open(HTML, encoding='utf-8', errors='replace').read()
    # Comentarios HTML nao contam para balanceamento
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
    out = {}
    for t in TAGS:
        abertos = len(re.findall(r'<%s\b' % t, h))
        fechados = len(re.findall(r'</%s>' % t, h))
        if abertos != fechados:
            out[t] = abertos - fechados
    return out


def main():
    atual = medir()
    base_bruto = json.load(open(ARQ, encoding='utf-8')) if os.path.exists(ARQ) else {}
    base = {k: v for k, v in base_bruto.items() if not k.startswith('_')}

    regressoes = []
    for tag, delta in atual.items():
        antes = base.get(tag)
        if antes is None:
            if delta != 0:
                regressoes.append(f'  {tag}: delta {delta:+d} (novo)')
        elif delta != antes:
            regressoes.append(f'  {tag}: delta {antes:+d} -> {delta:+d}')

    if regressoes:
        print('REGRESSAO de balanceamento no index.html:')
        print('\n'.join(regressoes))
        return 1

    if atual:
        print('OK: sem regressoes (deltas preexistentes mantidos: '
              + ', '.join(f'{k} {v:+d}' for k, v in sorted(atual.items())) + ')')
    else:
        print('OK: todas as tags verificadas estao balanceadas')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())