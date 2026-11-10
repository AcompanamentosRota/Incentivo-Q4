#!/usr/bin/env python3
"""Monta o painel Campari Club em um único HTML: junta template, fonte, fundo, motor e adaptador.

Grava em frontend/campari-club.html, publicado no GitHub Pages junto com a API (./api/v1/).
Determinístico: sem mudança na fonte, o HTML sai idêntico ao commitado.

Embute:
  - src/assets/fonts.json  -> só Barlow Condensed 800 (premissa P1 da Etapa 4, ~28 KB). Nenhuma fonte de site
    externo: o resto da tela usa Inter, com reserva na fonte do sistema (Segoe UI).
  - src/assets/campari-fundo.jpg -> fundo do palco em base64 (premissa P2), `center top / 100% auto no-repeat`
    sobre #02306B. A imagem traz logo, letreiro e faixa de meses, e nada é desenhado por cima deles.
    A LARGURA É 100% DO PALCO, não 1920px fixos (etapa 4O, regras v1.15, seção 7): desde a etapa 4M o palco pode
    ficar MAIS LARGO que 1920 px lógicos em janela baixa (1536x640 -> 2232 px), e com o tamanho fixo sobrava uma
    faixa do azul liso nas laterais. Com o palco em 1920 o resultado é idêntico ao de antes; mais largo, a arte
    acompanha e o excesso de altura é cortado embaixo (ancorada no topo), onde o véu do rodapé (.bg::after) cobre.
    ENQUANTO O ARQUIVO NÃO EXISTE (situação de 09/11/2026: a Karen ainda vai mandar a imagem), o palco sai só com
    o azul sólido #02306B e o build avisa. Basta colocar o .jpg na pasta e rodar de novo.
  - data/data.json (canal das rotas, cópia da base do Q4) como BASE_CANAIS_CAMPARI, lido pelo adaptador.
"""
import base64, json, pathlib

raiz = pathlib.Path(__file__).resolve().parent.parent
src = raiz / 'src'
ler = lambda p: p.read_text(encoding='utf-8')
t = ler(src / 'app.tpl.html')

# ─── fonte: só Barlow Condensed 800 (números grandes e títulos das tabelas) ────────────────────────────────────
manter = [('Barlow Condensed', 800, 'normal')]
css = ''
for f in json.loads(ler(src / 'assets' / 'fonts.json')):
    if (f['fam'], f['w'], f['st']) in manter:
        css += ("@font-face{font-family:%s;src:url(data:font/woff2;base64,%s) format('woff2');"
                "font-weight:%d;font-style:%s;font-display:block}\n" % (f['fam'], f['b64'], f['w'], f['st']))
assert css, 'nenhuma das fontes da lista `manter` está no fonts.json'

# ─── fundo: a imagem quando existir; senão, só o azul sólido ──────────────────────────────────────────────────
jpg = src / 'assets' / 'campari-fundo.jpg'
if jpg.exists():
    b64 = base64.b64encode(jpg.read_bytes()).decode('ascii')
    # o "100%%" é o escape do %-formatting: sai "100%" no CSS (sem ele, "% a" consumiria o argumento)
    fundo = "background:url(data:image/jpeg;base64,%s) center top / 100%% auto no-repeat,#02306B" % b64
    aviso_fundo = 'fundo: campari-fundo.jpg (%d KB)' % (jpg.stat().st_size // 1024)
else:
    fundo = 'background:#02306B'
    aviso_fundo = 'fundo: SEM a imagem (src/assets/campari-fundo.jpg não existe) — palco só com #02306B'

for marca, conteudo in (('/*__FONTS__*/', css), ('/*__FUNDO__*/', fundo), ('/*__MOTOR__*/', ler(src / 'motor.js')),
                        ('/*__ADAPTER__*/', ler(src / 'adapter.js')),
                        ('/*__BASE__*/', ler(raiz / 'data' / 'data.json').rstrip('\n'))):
    assert t.count(marca) == 1, f'marca {marca} ausente ou repetida no template'
    t = t.replace(marca, conteudo)

saida = raiz.parent / 'frontend' / 'campari-club.html'
saida.write_text(t, encoding='utf-8', newline='\n')
print('Gerado:', saida, f'({len(t)//1024} KB)')
print(' ', aviso_fundo)
