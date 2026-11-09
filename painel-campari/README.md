# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
gatilho de **cobertura de Skyy** e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e Diretoria e GP ficam na linha "Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.6, 09/11/2026). Itens ⚠️ são interpretações a confirmar: o painel
sinaliza, não decide.

## Estado: etapa 4 — a tela, nas cinco abas do mockup

- **Etapa 1 (esqueleto):** lê `./api/v1/index.json` e acha os dois produtos do incentivo pelo campo `agrupadores`
  (`"Aperitivo"` e `"Skyy"`, grafia exata, com `"extra": true`), nunca por id fixo. As abas de ranking continuam
  **em construção**; a aba Regras resume `docs/regras.md` (sem prêmios: decisão de 08/11/2026).
- **Etapa 2:** `carregarRanking()` no adaptador lê a API e entrega ao motor o ranking de volume de Aperitivo
  de GC, SV Mista e SV Segmentada, mais os consultores (só os próprios números, sem ranking).
- **Etapa 3:** gatilho de **cobertura de Skyy**, coluna **Oficial**, **status "Bateu!"**, **meta dia de
  cobertura**, diferença, "hoje atingiu a meta dia" e a linha **Total Band** (`resumo.json` → `empresa`), mais a
  estrutura das tabelas de ranking (dois blocos, Aperitivo e Skyy, por mês) pronta para a tela.
- **Etapa 4 (esta):** a **tela**, nas cinco abas do mockup aprovado em 08/11/2026 — Ranking GC · Supervisão ·
  Consultor · Detalhe do mês · Regras —, mais a formatação e os recortes (funções puras no adaptador) e a subida das
  regras para a **v1.4**, que acrescenta a regra de **exibição da meta dia de volume** (`metaDiaVolume` no motor).
  A tela não calcula nada: lê o que o motor e o adaptador entregam.

### Decisões desta etapa (premissas P1 a P6 do enunciado, e as da Karen em 09/11/2026)

| # | Decisão |
| --- | --- |
| P1 | **Fonte:** só **Barlow Condensed 800** embutida (`src/assets/fonts.json`, ~28 KB), nos números e nos títulos das tabelas. Onde o mockup usa os pesos 600 e 700, o painel usa o 800. O resto é Inter, com reserva na fonte do sistema. **Nenhuma fonte de site externo** (um teste varre o template atrás de `http`, Google Fonts e CDNs) |
| P2 | **Fundo:** `src/assets/campari-fundo.jpg`, embutido em base64 pelo `build.py`, `center top / 1920px auto no-repeat` sobre `#02306B`. A arte traz logo, letreiro e faixa de meses, e **nada é desenhado por cima** (a faixa de abas começa em `top:148px`). Sem o arquivo, o build cai para o azul sólido e avisa. Um véu escuro (`.bg::after`) cobre só os últimos 150 px, para o rodapé ter contraste sobre o pôr do sol da arte |
| P3 | **Nenhum prêmio e nenhum nome de pessoa ou cliente na tela:** só códigos de rota, SV e gerência. Testado no template e no HTML gerado |
| P4 | **Seletor "Mês de referência"** no Ranking GC **e** na Supervisão (um estado só): troca Meta, Real, Dif e o % do mês dos dois blocos; M. Dia e Online só no mês aberto (nos outros, "—"); Out, Nov, Dez, Soma, % Nov e % Acumulado não mudam. Mês sem dado fica desabilitado. Quem decide o que cada mês tem é `mesesDoSeletor` no adaptador |
| P5 | **Colunas da v1.4** (20 no total, 21 em dezembro com o "% Nov"), não as 18 do mockup. Tudo cabe no palco de 1920, **sem rolagem horizontal**, com corpo de 14 px nas duas tabelas de ranking (etapa 4B) e cabeçalho de 13 px (o mínimo da etapa). A rolagem **vertical** dentro do painel continua, como em qualquer lista longa |
| P6 | **Nenhum número de regra digitado na tela:** gatilho, trava e posições premiadas saem de `motor.REGRAS`. Um teste varre o template (sem o CSS) atrás de `130`, "precisa de 100" e "GC: 6 / Mista: 12 / Segmentada: 3" |
| — | **Consultor lista só as rotas `tipo: "normal"`** (decisão da Karen, 09/11/2026). As `neutraliza` e `virtual` ficam fora da lista, mas continuam somando no SV: a linha "Total da mesa" pode ser maior que a soma das linhas, e a tela conta quantas ficaram fora (`rotasDaMesa` + `textoDasOcultas`) |

### As cinco abas

| Aba | O que mostra |
| --- | --- |
| **Ranking GC** | as gerências na ordem da Soma de Aperitivo, com os dois blocos, o seletor de mês e o **Total Band** como última linha (sem Soma e sem status: Diretoria e GP não têm apuração própria). Uma linha por gerência da API: o agrupamento da gerência comercial (regras v1.6, seção 4) **ainda não está implementado** |
| **Supervisão** | uma tela só, aberta em Mista, com os botões `Mista | Segmentada` (`aria-pressed`), filtro de gerência e o mesmo seletor de mês. As supervisões **fora do ranking** (sem canal ou com empate) saíram desta tela na etapa 4B: o aviso está em Regras > Dados e alertas |
| **Consultor** | filtros Gerência e Supervisão, o aviso de que ranking e premiação são do supervisor para cima, e as rotas da mesa em dois grupos (Volume de Aperitivo · Cobertura de Skyy), com a linha "Total da mesa" |
| **Detalhe do mês** | filtros Visão (Gerência \| Supervisão) e Mês, a mesma tabela de dois grupos e a linha "Total Band" |
| **Regras** | três colunas — Como funciona, Status e (Medidas + Dados e alertas). Os alertas saem de `alertasDaTela`, com o estado **real** dos dados; as pendências resolvidas (9, 11, 12, 14, 16 a 20) não aparecem |

### Motor (`src/motor.js`, toda regra de cálculo)

| Função | O que faz |
| --- | --- |
| `REGRAS` | `versao`, `trava: {10: 130, 11: 130, 12: null}` (dezembro sem trava), `gatilho: {meses: [11, 12], minimo: 100}` e `premiadas: {gc: 6, svMista: 12, svSegmentada: 3}` |
| `MOTIVOS` | os textos exatos do motivo do status: `premiadas`, `indisponivel`, `semMeta`. Desde a v1.6 o motivo **não aparece na tela** (a coluna Status mostra só o selo) e continua calculado no motor |
| `percentualMes(real, online, meta)` | (Real + Online) ÷ Meta × 100, bruto; null com meta nula ou ≤ 0; online ausente = 0 |
| `aplicarTrava(pct, mes)` | `{valor, travado}`: min(%, limite); no limite exato não trava |
| `somaRanking(valores)` | soma dos % travados dos meses com %; nenhum: null |
| `apurarMeses(meses)` | % bruto, travado e marca de trava por mês, soma e `incompleta` (mês que devia contar sem %) |
| `ordenarRanking(linhas)` | soma desc (null no fim); empate pelo código em minúsculas, texto simples (`sv.g2.10` < `sv.g2.2`) |
| `numerarRanking(linhas)` | Pos. 1..n em todas as linhas |
| `percentualCobertura(real, online, meta)` | % de cobertura do mês, bruto; meta nula ou ≤ 0 dá null (vira "sem meta de cobertura") |
| `diferenca(real, online, meta)` | Real + Online − Meta; online ausente = 0; sem real ou sem meta, null |
| `gatilhoCobertura(meses, mesRef)` | `{valor, batido, parcial, indisponivel, motivo}`: novembro parcial; de dezembro em diante a média simples de nov e dez, e só com os dois; `batido` = valor bruto ≥ 100 |
| `numerarOficial(linhas)` | coluna "Oficial" 1..k, só de quem bateu o gatilho, na ordem do ranking |
| `statusLinha(linha, nivel, cfg)` | `{status: "Bateu!" \| "-", motivo}`; `nivel` = `gc`, `svMista` ou `svSegmentada`; nível sem limite publicado é erro |
| `metaDiaCobertura(meta, real, diasRestantes)` | (Meta − Real) ÷ dias restantes, travada, inteiro para cima (tolerância 1e-9); meta batida 0; 0 dias dá a diferença total |
| `metaDiaVolume(metaDia, real, meta)` | **regra de exibição da meta dia de volume (v1.4)**: Real > Meta → 0; `meta_dia` negativa → 0; não numérica → null ("—"). Nunca recalcula: a `meta_dia` vem pronta da API |
| `corDoPercentual(valor, cfg)` | **cor do quadradinho do % de cobertura (v1.6)**: `'verde'` com o valor **bruto** ≥ `REGRAS.gatilho.minimo`, `'vermelho'` abaixo dele, `null` sem valor (a tela não desenha quadradinho). O truncado da tela nunca decide a cor: 99,99999% mostra "99,9%" e fica vermelho |
| `hojeAtingiu(online, metaDia)` | "Hoje" colorido: Online > 0 **e** Online ≥ Meta dia (a meta dia **exibida**, para a cor concordar com a coluna ao lado) |

### Adaptador (`src/adapter.js`)

- **Fonte de cada mês** (`fontesDosMeses`), com `ref` = `index.json` → `mes_referencia.anomes`: mês anterior a `ref`,
  ou `ref` em período de fechamento → `fechado/AAAAMM.json` (só Real, Online 0; prévia ou oficial); `ref` aberto → API
  (Real + `online_hoje`, e o `meta_dia`); mês posterior → `futuro` (sem dado, não conta). Fechado ausente, ilegível ou
  sem o produto → `indisponivel` (nunca a API de outro mês no lugar), com aviso e linhas `incompleta`.
- **GC:** mês aberto, `gerencias/{GC}.json` → `produtos`; fechado, `totais.gerencias[GC]` (sem `totais`: GC
  indisponível no mês, nunca soma de rotas). **SV:** mês aberto, `supervisoes[].produtos` da API; fechado, soma das
  linhas de `rotas` pelo campo supervisão (todas as rotas da mesa, inclusive sem canal). Sem recalcular o que a API
  publica.
- **Canal do SV** (regra do Q4): `ajustes.json` → `canaisSV` ou a maioria das rotas da mesa com canal (base embutida +
  `ajustes.json` → `canais`); rota sem canal soma mas não vota; empate ou mesa sem nenhuma rota com canal → `fora`, com
  o motivo (empate também vira aviso). SV que só existe num mês fechado (ex.: `SV.XX.EV`) usa as rotas daquele mês.
- **Fonte da cobertura** (`fontesDaCobertura`), de propósito diferente da do volume: o mês de referência vem dos
  blocos `cobertura` da API **mesmo em período de fechamento** (quando o volume já vem do `fechado/`), com
  `online_hoje` null e sem meta dia; mês anterior vem do `fechado/`; mês posterior é `futuro`.
- **Cobertura do mês fechado** (`coberturaDoFechado`): **porta única da pendência 10**. O `fechado/AAAAMM.json` tem
  `campos_produto: ["meta", "realizado"]` e nenhum campo de cobertura, e o formato do campo novo **ainda não existe** —
  o Matheus vai incluí-lo até 01/12/2026. Até lá a função devolve `null` para qualquer arquivo, o mês fica
  "cobertura indisponível" (sem gatilho, sem posição oficial, com aviso) e **nada é adivinhado**. Quando o campo
  existir, é só nessa função (e nos testes dela) que ele entra. Em dezembro isso vale para novembro, então o gatilho
  de dezembro depende dessa pendência.
- **Cobertura por nível:** os blocos `cobertura` de `produtos` (GC), `supervisoes[].produtos` (SV), `rotas[].produtos`
  (rota) e `resumo.json` → `empresa.produtos` (Total Band), **como a API publica** — a meta soma só as rotas com meta
  e o realizado e o online somam todas as rotas (decisão de 08/11/2026). Produto sem o bloco `cobertura` fica
  "cobertura indisponível"; `cobertura.meta` null ou ≤ 0 fica "sem meta de cobertura" (% null, nunca 0 nem 100).
- **Meta dia de cobertura** do motor, com `index.json` → `calendario.dias_uteis_restantes`, só no mês aberto. A meta
  dia de **volume** continua vindo pronta da API; o que o adaptador acrescenta é o campo **`metaDiaExib`**, que é o
  valor da tela (`motor.metaDiaVolume`). `metaDia` guarda o número de origem, e o `hojeOk` usa o exibido.
- Lê só o `ajustes.json` **publicado** (o Campari não tem Administração nem ajustes do navegador): 404 = sem ajustes;
  ilegível = nenhum ajuste vale, com aviso.
- Resultado: `meses` e `mesesCobertura` (fonte e estado de cada mês, por produto), `mesGatilho`, `gc`, `svMista`,
  `svSegmentada` (ordenadas, numeradas, com `oficial` e `status`), `fora` (com gatilho, sem posição oficial nem
  status), `rotas` (sem gatilho nem status), `totalBand`, `canaisSV`, `avisos`. Cada linha guarda, por mês, o volume em
  `meses` (`meta`, `real`, `online`, `metaDia` só no mês aberto, `dif`, `pct`, `pctTravado`, `travado`, `fonte`,
  `estado`, `situacao`, `aberto`), a cobertura em `cobertura` (os mesmos campos, mais `motivo`), e `soma`,
  `incompleta`, `pos`, `gatilho`, `oficial` e `status`.
- **`tabela` (estrutura da P7, regras seção 7):** o que a tela lê sem calcular nada —
  `tabela.aperitivo.porMes[10|11|12]` e `tabela.skyy.porMes[10|11|12]` com `meta`, `real`, `online`, `metaDia`, `dif`,
  `pct` e `hojeOk`; `online` e `metaDia` só existem no **mês aberto** (nos outros, null, e a tela mostra "—").
  `tabela.aperitivo` traz ainda `pctTravado`/`travado` por mês (as colunas Out | Nov | Dez) e `soma`;
  `tabela.skyy` traz `pctNov`, `pctDez` e `acumulado` (= o valor do gatilho; em novembro, parcial), que **não** mudam
  com o seletor de mês. No consultor, `soma` e `acumulado` vêm null (rota não tem pontuação nem gatilho).

### Formatação e recortes da tela (Etapa 4, funções puras no adaptador)

Formatar e recortar não é calcular: o % já vem bruto do motor e estas funções só o truncam. A **Soma** mostrada é a
`soma` do motor, nunca a soma dos valores truncados da tela.

| Função | O que faz |
| --- | --- |
| `fmtVolume(v)` | volume com 1 casa, pt-BR (`1.234,6`); null → `—`; nunca `-0,0` |
| `fmtCobertura(v)` | clientes sem casa, pt-BR (`1.738`); null → `—` |
| `fmtPct(v)` | % **truncado** em 1 casa (`99,96` → `99,9%`, nunca `100,0%`); null → `—`. Um teste prova que trunca igual ao motor no motivo "cobertura em X%" |
| `fmtDataHora(s)` / `rotuloDiaUtil(cal)` | `09/11/2026 · 10:00` e `dia útil 5/19`, do cabeçalho |
| `rotuloDoMes(mes, ano, estado)` | `Novembro/26`, `Outubro/26 (prévia)` |
| `mesesDoSeletor(dados)` | as opções e o padrão do seletor de mês (P4): `habilitado`, `aberto`, `rotulo` |
| `valoresDoMes(tabela, produto, mes)` | os números de um produto num mês; mês ausente devolve tudo null, nunca zero |
| `filtrosDoPainel(dados)` | gerências e SVs dos filtros, **só códigos** |
| `rotasDaMesa(dados, sv)` / `textoDasOcultas(ocultas)` | as rotas `normal` da mesa, o que ficou fora (contado por tipo) e a linha do SV que vira "Total da mesa" |
| `linhasDoDetalhe(dados, visao, gc)` | as linhas da aba Detalhe do mês |
| `alertasDaTela(dados)` | `[{tipo: 'erro' \| 'aviso' \| 'nota', titulo, texto}]` com o estado real dos dados |

### Canal duplicado do Desafio Q4 (decisão da Karen)

Nada é importado do `painel-q4` (nem em execução nem em teste). Cópias, todas de `painel-q4/src/adapter.js`:
`titulo`, `svNome`, `SEGMENTOS`, `ehObjeto`, `textoOk`, `validarCanalRota`, `mapaCanal` (literais), `canaisDosSVs`
(com uma diferença: mesa sem nenhuma rota com canal sai como `sem canal`, não `empate`) e o trecho de `canais`/`canaisSV`
de `normalizarAjustes` (em `ajustesDeCanal`). O dado é **`data/data.json`, foto de 09/11/2026** da base embutida do Q4
(`painel-q4/data/data.json`, segmentação de 25/10/2026 13:11): só gerência, SV, rota, canal e segmento das 201 rotas
com canal; rota fora da lista = sem canal. Para atualizar a foto:
`python painel-campari/scripts/copiar_canais.py --foto AAAA-MM-DD` e depois o `build.py`. Proposta para uma etapa
futura: extrair essas funções e o dado para uma pasta comum aos dois painéis.

## Estrutura

```
painel-campari/
├── docs/regras.md         fonte de verdade das regras do incentivo
├── src/
│   ├── motor.js           cálculo (UMD: Node e window.MotorCampari): % do mês, trava, soma, ordem, posição,
│   │                      gatilho de cobertura, posição oficial, status e meta dia de cobertura
│   ├── adapter.js         CONFIG, localizarProdutos, carregarDados, fontesDosMeses, fontesDaCobertura,
│   │                      coberturaDoFechado, lerFechado, tabelaDaLinha, montarDados, carregarRanking
│   ├── app.tpl.html       tela: cinco abas, palco de 1920 px e fit() (copiado do Q4, não importado)
│   └── assets/              fonts.json (só Barlow Condensed 800) e campari-fundo.jpg (arte do palco)
├── data/data.json         canal de cada rota (foto da base embutida do Q4, 09/11/2026)
├── scripts/build.py       monta frontend/campari-club.html (determinístico; embute fonte, fundo e data/data.json)
├── scripts/copiar_canais.py  regera data/data.json a partir de painel-q4/data/data.json
└── tests/                 motor.test.js e adapter.test.js (fixtures sintéticas)
```

## Comandos

```bash
# monta o HTML único (comite frontend/campari-club.html junto com a fonte)
python painel-campari/scripts/build.py

# testes do painel — 139 testes (49 do motor, 90 do adaptador); precisa de Node 18+
node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js

# site local, como no Pages: http://localhost:8000/campari-club.html
cd backend && python scripts/servir.py
```

Não clique em "Atualizar dados" no `servir.py`: ele grava em `api/`.

O deploy (`deploy-pages.yml`) copia `frontend/` inteiro para o site, então `frontend/campari-club.html` é publicado
sem mudança no workflow.

### Como trocar a arte do fundo

1. Grave a imagem em `painel-campari/src/assets/campari-fundo.jpg` (JPEG, **1920 px de largura**, com logo, letreiro e
   faixa de meses nos primeiros ~148 px, que é onde a tela não desenha nada).
2. `python painel-campari/scripts/build.py` e comite **a imagem e o `frontend/campari-club.html` gerado**.
3. O build avisa o tamanho embutido. Sem o arquivo, o palco sai só com `#02306B` e o build diz isso — o painel
   continua funcionando.

A imagem entra em base64 no HTML, então ela pesa no arquivo publicado: a de 09/11/2026 tem 73 KB e leva o painel a
237 KB.

## O que ainda depende de terceiros

- **Pendência 10 (Matheus, prazo 01/12/2026): a cobertura no `fechado/AAAAMM.json`.** Sem ela, o gatilho só funciona
  enquanto o mês do gatilho é o mês de referência. Em **novembro/2026 o gatilho é parcial e funciona** (novembro é o
  mês aberto); em **dezembro**, novembro já será mês fechado e, sem o campo novo, o gatilho de todos fica
  "cobertura indisponível" — ninguém recebe posição oficial nem "Bateu!". O painel avisa (faixa de aviso e a lista
  `avisos`) e **não assume valor**. Quando o formato for definido, o único lugar a mudar é `coberturaDoFechado` no
  adaptador (e os testes dela).
- **Pendência 22 (Karen): a meta dia de volume compara só o Real, ou Real + Online?** A v1.4 manda mostrar 0 quando
  o Real passa da Meta, e deixa a premissa em aberto. O painel usa **só o Real** (até ontem) e sinaliza isso em
  Regras > Dados e alertas. Se a resposta for "Real + Online", o único lugar a mudar é `metaDiaVolume` no motor.
- **Pendência 23 (Karen): a arte do fundo.** O `campari-fundo.jpg` recebido em 09/11/2026 tem **1568 × 777**, e a
  tela o amplia para 1920 px de largura. Funciona, mas o logo e o letreiro perdem nitidez: se existir o original em
  1920 px, basta trocar o arquivo e rodar o build (ver acima).

Resolvidas nesta etapa: **pendência 15** (meta dia de volume zerada era o domingo; em dia útil a API traz o valor,
com negativos iguais aos do SAC) e **pendência 21** (o mockup foi atualizado; nas tabelas de ranking valem as colunas
da v1.4, não as do mockup).

## Etapa 4B — ajustes visuais das tabelas de ranking (regras v1.6, seções 5 e 7)

Depois de ver a tela publicada, a Karen pediu em 09/11/2026 só ajustes de **apresentação** no Ranking GC e na
Supervisão. Nenhuma regra de cálculo mudou e o contrato da API continua igual:

- a coluna **Status** mostra só o selo ("✓ Bateu!" ou "-"); o motivo continua no motor e saiu da tela;
- saíram a **legenda** inteira e o aviso "N fora do ranking" das duas telas (o aviso segue em Regras > Dados e
  alertas, de `alertasDaTela`);
- os dois blocos ganharam cor no padrão do Desafio Q4 — **Aperitivo** laranja e **Skyy** azul, título em tom escuro
  (`--ap-tit`, `--sk-tit`) e células em tom bem claro, pelo `<colgroup>` (`--ap-cel`, `--sk-cel`), para o `.k`, o
  hover e a linha de total continuarem por cima;
- a **Dif.** negativa ficou **vermelha** (`--negv`, o vermelho do Q4), nas quatro abas que mostram Dif.; o laranja
  segue só no `.tv`, o % real antes da trava;
- o **% do mês** e o **% Acum.** de Skyy ganharam o quadradinho verde/vermelho — a cor vem de
  `motor.corDoPercentual`, nunca de comparação na tela; Aperitivo não tem quadradinho;
- a fonte das duas tabelas de ranking caiu 1 px (corpo de 14 px, `.tb.rk`); Consultor e Detalhe do mês não mudaram.

**Fora desta etapa:** o **agrupamento da gerência comercial** do Ranking GC (12 linhas em vez de 16; regras v1.6,
seção 4 e pendência 24, decididos em 09/11/2026) **não está implementado** — fica para o PR do agrupamento, com as
premissas (a) a (e) da seção 4 para a Karen confirmar.
