#!/usr/bin/env python3
"""Copia para painel-campari/data/data.json o canal de cada rota da base embutida do Desafio Q4.

Duplicação proposital (decisão da Karen, etapa 2): o Campari Club não importa nada do painel-q4, nem em tempo de
execução nem de teste. Este script LÊ painel-q4/data/data.json e grava só o que o Campari usa: gerência, SV, rota,
canal (Mista/Segmentada) e segmento de cada rota da base, mais a data da segmentação. Volumes e metas não são copiados.
Rota fora da lista = sem canal. Determinístico: mesma base e mesma --foto, mesmo arquivo.

Uso: python painel-campari/scripts/copiar_canais.py --foto AAAA-MM-DD   (data em que a foto foi tirada)
"""
import argparse
import json
import pathlib

raiz = pathlib.Path(__file__).resolve().parent.parent
origem = raiz.parent / 'painel-q4' / 'data' / 'data.json'
destino = raiz / 'data' / 'data.json'

ap = argparse.ArgumentParser(description='Copia o canal das rotas da base embutida do Desafio Q4')
ap.add_argument('--foto', required=True, help='data da foto (AAAA-MM-DD)')
args = ap.parse_args()

base = json.loads(origem.read_text(encoding='utf-8'))
saida = {
    'meta': {
        'origem': 'painel-q4/data/data.json',
        'foto': args.foto,
        'corteSeg': base['meta']['corteSeg'],
        'nota': 'cópia do canal das rotas da base embutida do Desafio Q4; regerar com scripts/copiar_canais.py',
    },
    'rotas': [{'gc': r['gc'], 'sv': r['sv'], 'rota': r['rota'], 'canal': r['canal'], 'sub': r.get('sub')}
              for r in base['rotas']],
}
destino.parent.mkdir(exist_ok=True)
linhas = ',\n  '.join(json.dumps(r, ensure_ascii=False) for r in saida['rotas'])  # uma rota por linha
texto = '{\n "meta": ' + json.dumps(saida['meta'], ensure_ascii=False) + ',\n "rotas": [\n  ' + linhas + '\n ]\n}\n'
assert json.loads(texto) == saida
destino.write_text(texto, encoding='utf-8', newline='\n')
print('Gerado:', destino, f"({len(saida['rotas'])} rotas)")
