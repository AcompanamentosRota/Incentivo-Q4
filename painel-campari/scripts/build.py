#!/usr/bin/env python3
"""Monta o painel Campari Club em um único HTML: junta template, motor e adaptador.

Grava em frontend/campari-club.html, publicado no GitHub Pages junto com a API (./api/v1/).
Determinístico: sem mudança na fonte, o HTML sai idêntico. Sem fonte nem logo embutidos (etapa 1).
"""
import pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
src = raiz / 'src'
ler = lambda p: p.read_text(encoding='utf-8')
t = ler(src / 'app.tpl.html')
for marca, arquivo in (('/*__MOTOR__*/', 'motor.js'), ('/*__ADAPTER__*/', 'adapter.js')):
    assert t.count(marca) == 1, f'marca {marca} ausente ou repetida no template'
    t = t.replace(marca, ler(src / arquivo))
saida = raiz.parent / 'frontend' / 'campari-club.html'
saida.write_text(t, encoding='utf-8', newline='\n')
print('Gerado:', saida, f'({len(t)//1024} KB)')
