#!/usr/bin/env python3
"""Monta o painel em um único HTML: junta template, fontes, logo, motor, adaptador e dados.

Grava em frontend/desafio-q4.html do metas-produtos, publicado no GitHub Pages junto com a API (./api/v1/).
"""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
src = raiz / 'src'
ler = lambda p: p.read_text(encoding='utf-8')
t = ler(src / 'app.tpl.html')
fontes = json.loads(ler(src / 'assets' / 'fonts.json'))
manter = [('Anton', 400, 'normal'), ('Barlow', 500, 'normal'), ('Barlow', 600, 'normal'), ('Barlow', 700, 'normal'), ('Barlow', 800, 'normal'), ('Barlow', 800, 'italic')]
css = ''
for f in fontes:
    if (f['fam'], f['w'], f['st']) in manter:
        css += "@font-face{font-family:%s;src:url(data:font/woff2;base64,%s) format('woff2');font-weight:%d;font-style:%s;font-display:block}\n" % (f['fam'], f['b64'], f['w'], f['st'])
t = t.replace('/*__FONTS__*/', css)
t = t.replace('/*__LOGO__*/', ler(src / 'assets' / 'logo.svg'))
t = t.replace('/*__MOTOR__*/', ler(src / 'motor.js'))
t = t.replace('/*__ADAPTER__*/', ler(src / 'adapter.js'))
t = t.replace('/*__DATA__*/', ler(raiz / 'data' / 'data.json'))
saida = raiz.parent / 'frontend' / 'desafio-q4.html'
saida.write_text(t, encoding='utf-8')
print('Gerado:', saida, f'({len(t)//1024} KB)')
