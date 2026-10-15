#!/usr/bin/env python3
"""Gera dist/island27-cfc.html: o sistema inteiro num arquivo só, no formato
usado para publicar o link (Artifact do Claude).

Uso: python3 ferramentas/gerar_publicacao.py
"""
import base64
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
html = (RAIZ / 'index.html').read_text(encoding='utf-8')
css = (RAIZ / 'styles.css').read_text(encoding='utf-8')
logo = 'data:image/png;base64,' + base64.b64encode((RAIZ / 'assets' / 'logo.png').read_bytes()).decode()

scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = '\n'.join((RAIZ / s).read_text(encoding='utf-8') for s in scripts)
js = js.replace('</script', '<\\/script')

corpo = html.split('<body>', 1)[1].split('</body>', 1)[0]
corpo = re.sub(r'\s*<script src="js/[^"]+"></script>', '', corpo)
cabeca = html.split('<head>', 1)[1].split('</head>', 1)[0]
titulo = re.search(r'<title>.*?</title>', cabeca).group(0)
fontes = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', cabeca).group(0)

# O link publicado já roda com a política de segurança da plataforma;
# a CSP própria fica só na versão de arquivo local (index.html).
saida = f'''{titulo}
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#08090C">
<link rel="icon" href="{logo}">
{fontes}
<style>
{css}
</style>
{corpo.strip()}
<script>
{js}
</script>
'''.replace('assets/logo.png', logo)

destino = RAIZ / 'dist' / 'island27-cfc.html'
destino.parent.mkdir(exist_ok=True)
destino.write_text(saida, encoding='utf-8')
print(f'{destino} ({len(saida) // 1024} KB)')
