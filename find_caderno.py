import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the caderno section
start = html.find('id="atab-caderno"')
if start == -1:
    print('NOT FOUND: atab-caderno')
else:
    next_atab = html.find('id="atab-', start + 10)
    if next_atab == -1:
        end = len(html)
    else:
        end = next_atab
    
    caderno_html = html[start:end]
    print(f'Caderno section length: {len(caderno_html)}')
    print('First 500 chars:')
    print(caderno_html[:500])
    print('...')
    print('Last 500 chars:')
    print(caderno_html[-500:])