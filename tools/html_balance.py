import re

h = open('index.html', encoding='utf-8', errors='replace').read()
h2 = re.sub(r"<!--.*?-->", "", h, flags=re.S)
tags = ['div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'select', 'button',
        'label', 'canvas', 'p', 'span', 'a', 'ul', 'li', 'h2', 'h3', 'main', 'section']
bad = False
for t in tags:
    a = len(re.findall(r'<%s\b' % t, h2))
    b = len(re.findall(r'</%s>' % t, h2))
    if a != b:
        print(f"DESBALANCEADO {t}: abertos={a} fechados={b} (delta {a - b})")
        bad = True
if not bad:
    print("OK: todas as tags verificadas estao balanceadas")