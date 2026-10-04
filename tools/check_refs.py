import re
import sys

src = open('js/professorTech/professorTech.js', encoding='utf-8').read()

# Chaves declaradas no mapearDOM (indentação de 8 espaços dentro do objeto els)
ini = src.index('function mapearDOM')
fim = src.index('\n}\n', ini)
bloco = src[ini:fim]
declaradas = set(re.findall(r'^\s{8}(\w+):', bloco, flags=re.M))

usadas = set(re.findall(r'\bels\.(\w+)', src))

faltando = sorted(u for u in usadas if u not in declaradas)
print(f"els declarados: {len(declaradas)} | els usados: {len(usadas)}")
if faltando:
    print("NAO DECLARADOS (viram undefined):")
    for f in faltando:
        print("  -", f)
else:
    print("OK: todo els.* usado esta declarado no mapearDOM")

# Props do state usados
props_state = set(re.findall(r'state\.(\w+)', src))
print("\nstate.* usados:", sorted(props_state))

# chartInstances
print("\nchartInstances usados:", sorted(set(re.findall(r"chartInstances\['(\w+)'\]", src))))

# IDs do HTML referenciados via getElementById que devem existir no index.html
ids_js = set(re.findall(r"getElementById\('([^']+)'\)", src))
html = open('index.html', encoding='utf-8').read()
ids_html = set(re.findall(r'id="([^"]+)"', html))
ausentes = sorted(i for i in ids_js if i not in ids_html)
if ausentes:
    print("\nIDs usados no JS mas ausentes no index.html:")
    for a in ausentes:
        print("  -", a)
else:
    print("\nOK: todo getElementById do JS tem id no index.html")

sys.exit(1 if faltando or ausentes else 0)