# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
gatilho de **cobertura de Skyy** e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e o total da empresa fica na linha
"Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.7, 09/11/2026). Itens ⚠️ são interpretações a confirmar: o painel
sinaliza, não decide.

## Estado: etapa 4F — a tela, com os ajustes de tabela da v1.7

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
- **Etapa 4B:** ajustes de **apresentação** das duas tabelas de ranking (regras v1.6, seções 5 e 7), descritos no fim
  deste arquivo.
- **Etapa 4C:** o **Ranking GC pela gerência comercial agrupada** do SAC (regras v1.6, seção 4 e pendência 24):
  **12 linhas** no lugar das 16 gerências da API. A linha agrupada **soma** as gerências do grupo e só depois calcula
  (`somarGrupo` no motor) — o % é o da soma, nunca a média dos %. No mesmo PR, a cor do bloco Aperitivo passou ao
  **laranja do SAC**. Supervisão, Consultor e Detalhe do mês seguem com as gerências da API.
- **Etapa 4F (esta):** os **ajustes de tabela** das regras v1.7, seção 7, descritos no fim deste arquivo:
  centralização, coluna Dez só em dezembro, rótulos "% Acum." e "% Médio", quadradinho no % do mês vigente do
  Aperitivo (`corDoPercentualAperitivo`, a única regra nova), números do Aperitivo na fonte da tabela, linha do
  total só com "Total Band" e as cores do ranking também no Consultor e no Detalhe do mês. **Nenhum número muda.**
  A **paginação** de Supervisão e Consultor (15 linhas), também da v1.7, **não entra nesta etapa**.

### Decisões desta etapa (premissas P1 a P6 do enunciado, e as da Karen em 09/11/2026)

| # | Decisão |
| --- | --- |
| P1 | **Fonte:** só **Barlow Condensed 800** embutida (`src/assets/fonts.json`, ~28 KB), nos números e nos títulos das tabelas. Onde o mockup usa os pesos 600 e 700, o painel usa o 800. O resto é Inter, com reserva na fonte do sistema. **Nenhuma fonte de site externo** (um teste varre o template atrás de `http`, Google Fonts e CDNs) |
| P2 | **Fundo:** `src/assets/campari-fundo.jpg`, embutido em base64 pelo `build.py`, `center top / 1920px auto no-repeat` sobre `#02306B`. A arte traz logo, letreiro e faixa de meses, e **nada é desenhado por cima** (a faixa de abas começa em `top:148px`). Sem o arquivo, o build cai para o azul sólido e avisa. Um véu escuro (`.bg::after`) cobre só os últimos 150 px, para o rodapé ter contraste sobre o pôr do sol da arte |
| P3 | **Nenhum prêmio e nenhum nome de pessoa ou cliente na tela:** só códigos de rota, SV e gerência. Testado no template e no HTML gerado |
| P4 | **Seletor "Mês de referência"** no Ranking GC **e** na Supervisão (um estado só): troca Meta, Real, Dif e o % do mês dos dois blocos; M. Dia e Online só no mês aberto (nos outros, "—"); as colunas de mês, o % Acum., o % Nov e o % Médio não mudam. Mês sem dado fica desabilitado. Quem decide o que cada mês tem é `mesesDoSeletor` no adaptador. O **mês vigente** (`mesesDoSeletor(...).referencia`) é outra coisa: é o mês de referência da **API**, e é ele que decide as colunas que só existem em dezembro e onde fica o quadradinho do Aperitivo |
| P5 | **Colunas da v1.4** (19 no total em outubro e novembro, 21 em dezembro com a coluna Dez e o "% Nov"; etapa 4F). Tudo cabe no palco de 1920, **sem rolagem horizontal**, com corpo de 14 px nas duas tabelas de ranking (etapa 4B) e cabeçalho de 13 px (o mínimo da etapa). A rolagem **vertical** dentro do painel continua, como em qualquer lista longa |
| P6 | **Nenhum número de regra digitado na tela:** gatilho, trava e posições premiadas saem de `motor.REGRAS`. Um teste varre o template (sem o CSS) atrás de `130`, "precisa de 100" e "GC: 6 / Mista: 12 / Segmentada: 3" |
| — | **Consultor lista só as rotas `tipo: "normal"`** (decisão da Karen, 09/11/2026). As `neutraliza` e `virtual` ficam fora da lista, mas continuam somando no SV: a linha "Total da mesa" pode ser maior que a soma das linhas, e a tela conta quantas ficaram fora (`rotasDaMesa` + `textoDasOcultas`) |

### As cinco abas

| Aba | O que mostra |
| --- | --- |
| **Ranking GC** | as **12 linhas da gerência comercial agrupada** (etapa 4C) na ordem do % Acum. de Aperitivo, com os dois blocos, o seletor de mês e o **Total Band** como última linha (sem % Acum. e sem status: a empresa não tem apuração própria). A coluna Gerência mostra o código da linha; quem agrupa é `CONFIG.gruposGC` |
| **Supervisão** | uma tela só, aberta em Mista, com os botões `Mista | Segmentada` (`aria-pressed`), filtro de gerência e o mesmo seletor de mês. As supervisões **fora do ranking** (sem canal ou com empate) saíram desta tela na etapa 4B: o aviso está em Regras > Dados e alertas |
| **Consultor** | filtros Gerência e Supervisão, o aviso de que ranking e premiação são do supervisor para cima, e as rotas da mesa em dois grupos (Volume de Aperitivo · Cobertura de Skyy), com a linha "Total da mesa" |
| **Detalhe do mês** | filtros Visão (Gerência \| Supervisão) e Mês, a mesma tabela de dois grupos e a linha "Total Band" |
| **Regras** | três colunas — Como funciona, Status e (Medidas + Dados e alertas). Os alertas saem de `alertasDaTela`, com o estado **real** dos dados; as pendências resolvidas (9, 11, 12, 14, 16 a 21, 24) não aparecem, e as abertas (10, 22 e, desde a etapa 4F, **25**) aparecem |

### Motor (`src/motor.js`, toda regra de cálculo)

| Função | O que faz |
| --- | --- |
| `REGRAS` | `versao`, `trava: {10: 130, 11: 130, 12: null}` (dezembro sem trava), `gatilho: {meses: [11, 12], minimo: 100}` e `premiadas: {gc: 6, svMista: 12, svSegmentada: 3}` |
| `MOTIVOS` | os textos exatos do motivo do status: `premiadas`, `indisponivel`, `semMeta`. Desde a v1.6 o motivo **não aparece na tela** (a coluna Status mostra só o selo) e continua calculado no motor |
| `percentualMes(real, online, meta)` | (Real + Online) ÷ Meta × 100, bruto; null com meta nula ou ≤ 0; online ausente = 0 |
| `aplicarTrava(pct, mes)` | `{valor, travado}`: min(%, limite); no limite exato não trava |
| `somaRanking(valores)` | soma dos % travados dos meses com %; nenhum: null |
| `apurarMeses(meses)` | % bruto, travado e marca de trava por mês, soma e `incompleta` (mês que devia contar sem %) |
| `somarGrupo(valores, campos)` | **soma da gerência comercial agrupada (v1.6, seção 4)**: soma `meta`, `real`, `online` e `metaDia` das gerências do grupo, para o % sair da **soma** e nunca da média dos %. Campo sem nenhum valor numérico fica null (nunca 0); `campos` permite somar o bloco de cobertura, que não tem meta dia |
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
| `corDoPercentualAperitivo(valor, mes, cfg)` | **cor do quadradinho do % do mês de Aperitivo (v1.7, seção 7)**, só na coluna do mês vigente: `'verde'` com o valor **bruto** ≥ o limite do mês — a trava (`REGRAS.trava[mes]`) nos meses travados e `REGRAS.corAperitivoSemTrava` no mês sem trava (⚠️ pendência 25) —, `'vermelho'` abaixo, `null` sem valor. Mês fora da vigência: erro, como em `aplicarTrava`. É regra **diferente** da do % de cobertura: o limite não é o do gatilho |
| `hojeAtingiu(online, metaDia)` | "Hoje" colorido: Online > 0 **e** Online ≥ Meta dia (a meta dia **exibida**, para a cor concordar com a coluna ao lado) |

### Adaptador (`src/adapter.js`)

- **Fonte de cada mês** (`fontesDosMeses`), com `ref` = `index.json` → `mes_referencia.anomes`: mês anterior a `ref`,
  ou `ref` em período de fechamento → `fechado/AAAAMM.json` (só Real, Online 0; prévia ou oficial); `ref` aberto → API
  (Real + `online_hoje`, e o `meta_dia`); mês posterior → `futuro` (sem dado, não conta). Fechado ausente, ilegível ou
  sem o produto → `indisponivel` (nunca a API de outro mês no lugar), com aviso e linhas `incompleta`.
- **Ranking GC agrupado** (`gruposDoRankingGC`, etapa 4C): o mapa `CONFIG.gruposGC` liga o código da **linha** do
  ranking às gerências da API que ela soma (oito linhas de uma gerência; `UR_RI`, `IT_MO`, `PA_DI` e `GU_PO` de duas).
  Nunca fixo na lógica. Gerência publicada e **fora do mapa** vira linha própria, com aviso; gerência do mapa que a API
  **não publicou** sai da soma, com aviso; grupo sem nenhuma gerência publicada não entra. A linha soma por mês e por
  produto (volume de Aperitivo e bloco `cobertura` de Skyy) **antes** de qualquer conta, e só então trava, soma, gatilho,
  posição, posição oficial e status rodam nela, com as mesmas funções do motor. Mês que falta em alguma gerência do
  grupo deixa o mês **indisponível** e a linha incompleta — nunca uma soma pela metade. `dados.gc` são as linhas
  agrupadas (com ranking) e **`dados.gcApi`** as gerências da API (sem ranking), que a aba Detalhe do mês e o filtro de
  gerência usam.
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
- Resultado: `meses` e `mesesCobertura` (fonte e estado de cada mês, por produto), `mesGatilho`, `gc` (as linhas
  agrupadas do Ranking GC, com `gerencias` e `agrupada`), `gcApi` (uma linha por gerência da API, **sem** ranking),
  `svMista`, `svSegmentada` (ordenadas, numeradas, com `oficial` e `status`), `fora` (com gatilho, sem posição oficial
  nem status), `rotas` (sem gatilho nem status), `totalBand`, `canaisSV`, `avisos`. Cada linha guarda, por mês, o volume em
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
| `filtrosDoPainel(dados)` | gerências e SVs dos filtros, **só códigos**; as gerências são as da API (`gcApi`), não as linhas agrupadas |
| `rotasDaMesa(dados, sv)` / `textoDasOcultas(ocultas)` | as rotas `normal` da mesa, o que ficou fora (contado por tipo) e a linha do SV que vira "Total da mesa" |
| `linhasDoDetalhe(dados, visao, gc)` | as linhas da aba Detalhe do mês; a visão de gerência usa `gcApi` (as 16 da API) |
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
│   ├── motor.js           cálculo (UMD: Node e window.MotorCampari): % do mês, trava, soma do grupo, soma,
│   │                      ordem, posição, gatilho de cobertura, posição oficial, status e meta dia de cobertura
│   ├── adapter.js         CONFIG (com gruposGC), localizarProdutos, carregarDados, fontesDosMeses,
│   │                      fontesDaCobertura, coberturaDoFechado, lerFechado, gruposDoRankingGC, tabelaDaLinha,
│   │                      montarDados, carregarRanking
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

# testes do painel — 184 testes (61 do motor, 123 do adaptador); precisa de Node 18+
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
- a **Dif.** negativa ficou **vermelha** (`--negv`, o vermelho do Q4), nas quatro abas que mostram Dif.;
- o **% do mês** e o **% Acum.** de Skyy ganharam o quadradinho verde/vermelho — a cor vem de
  `motor.corDoPercentual`, nunca de comparação na tela; Aperitivo não tem quadradinho;
- a fonte das duas tabelas de ranking caiu 1 px (corpo de 14 px, `.tb.rk`); Consultor e Detalhe do mês não mudaram.

## Etapa 4C — Ranking GC pela gerência comercial agrupada (regras v1.6, seção 4; pendência 24)

O print do SAC que a Karen enviou em 09/11/2026 mostra a **gerência comercial agrupada**: 12 linhas, não 16. O Ranking
GC passa a ser por essa linha; o resto do painel não muda.

- **Quem soma com quem** está em `CONFIG.gruposGC` (adaptador), nunca na lógica: `G1`, `G2`, `G3`, `AP`, `AT`, `AN`,
  `RV` e `SL` sozinhas; `UR_RI` = UR + RI; `IT_MO` = IT + MO; `PA_DI` = PA + DI; `GU_PO` = GU + PO.
- **Soma e só depois calcula:** `somarGrupo` (motor) soma meta, real, online e meta dia por mês e por produto, e o % é
  o da soma. Um teste constrói o caso em que a média dos % (110%) é bem diferente do % da soma (38%).
- **Meta ausente** numa gerência soma só as que têm valor (nunca conta como 0); **mês que falta** em alguma gerência do
  grupo deixa o mês indisponível e a linha incompleta.
- **Fora do mapa:** gerência nova que a API publicar entra como linha própria, com aviso em Regras > Dados e alertas —
  o ranking nunca esconde uma gerência.
- **Desempate** pelo código da **linha** em minúsculas (`ur_ri`), com a mesma função do motor.
- **As 16 gerências da API** continuam em `dados.gcApi`, usadas pelo filtro de gerência e pela aba Detalhe do mês.

Premissas ⚠️ desta etapa, a Karen confirma (seção 4 das regras): (a) o "Bateu!" continua nas **6** primeiras posições
oficiais, agora entre 12 linhas; (b) a **M. Dia de volume** do grupo é a **soma** das metas dia publicadas (a API não
publica meta dia por grupo) e a de **cobertura** é calculada sobre a meta e o real somados.

**Cor do bloco Aperitivo (mesmo PR).** Na 4B o título ficou num marrom-amarelado e o corpo quase sem cor. A Karen pediu
o **laranja do SAC**: `--ap-tit` passou a `#E07B41` (título do bloco **e** cabeçalhos das colunas do Aperitivo) com
texto escuro `--ap-tit-fg: #2B1703` — branco sobre esse laranja dá 2,97:1, abaixo do mínimo, e o marrom escuro dá
5,3:1 — e `--ap-cel` passou a `rgba(224,123,65,.58)`, um laranja queimado com os números em branco (6,3:1).
O azul do Skyy não mudou.

**Etapa 4D — o corpo do bloco Aperitivo clareia (09/11/2026).** Na tela, o corpo a 58% ficou forte e deixou dois
textos no limite: o % laranja que então aparecia ao lado do mês travado e a **Dif. negativa** mediam ~3,8:1, abaixo
de 4,5:1. `--ap-cel` passou a **`rgba(224,123,65,.18)`** — o **mesmo** laranja, bem mais claro; a escolha é da Karen,
comparando cinco tons na tela. Medido no print do Ranking GC em 1920×940, o corpo sai `rgb(46,44,57)` (contra
`rgb(133,82,61)` da 4C) e os textos sobem a **13,7:1** (branco) e **8,1:1** (`--negv`): nenhuma cor de texto precisou
mudar. Nesse tom o corpo quase não tem cor — tinta laranja sobre o azul-marinho do painel rende um cinza morno —, e o
laranja do bloco fica por conta do título e dos cabeçalhos das colunas.

**Etapa 4E — o bloco Skyy ganha o mesmo tratamento (09/11/2026).** `--sk-tit` passou de `#0A2A6E` para **`#061C4D`**
e vale agora também para os **cabeçalhos das colunas** do bloco (`hd-sk`), como no Aperitivo, com texto claro
`--sk-tit-fg: #E8EEFB`. Medido: título `rgb(6,28,77)`, texto claro **14,1:1** e o "· GATILHO ≥ 100,0%" em turquesa
**11,2:1**; nos cabeçalhos, **11,6:1**. O **corpo** do Skyy ficou como estava (`rgba(29,123,255,.20)`,
`rgb(12,46,95)`, branco 13,4:1), escolha da Karen entre 12%, 20%, 30% e 40%.

**Mês travado mostra só o limite (09/11/2026, decisão da Karen).** (No PR da etapa 4D este item foi chamado de
"etapa 4F"; a etapa 4F de verdade é a dos ajustes de tabela, mais abaixo.) As colunas Out | Nov | Dez mostravam
`130,0%` e, ao lado, o % real do mês em laranja (classe `.tv`). Esse número saiu: a célula mostra só o limite. O
**motor não mudou** — continua devolvendo `pct` e `travado` —, só a tela deixou de escrever; o CSS do `.tv` e a
variável `--laranja`, que só ele usava, saíram junto, e o texto da aba Regras deixou de prometer o número ao lado.
Na época, a seção 7 do documento de regras ainda descrevia o % real ao lado; a **v1.7** (etapa 4F) já não o
descreve, e a pendência está fechada.

**CSS com guarda (09/11/2026).** Um comentário mal fechado dentro do `:root` apagou o fundo do bloco Skyy inteiro sem
erro no console e sem quebrar teste nenhum. Há agora um teste que varre o CSS do template **e** do HTML gerado atrás
de comentário sem par e de chave desbalanceada.

## Etapa 4F — ajustes de tabela (regras v1.7, seção 7)

Pedidos da Karen em 09/11/2026, depois de ver a 4D na tela. **Só apresentação e rótulos: nenhum número muda** — uma
comparação linha a linha do que o adaptador e o motor devolvem, antes e depois, em cima da mesma cópia de `api/v1`,
deu tudo igual (12 linhas de GC, 16 gerências da API, 30 SV Mista, 5 SV Segmentada, 233 rotas e o Total Band).

| # | Ajuste | Onde |
| --- | --- | --- |
| 1 | **Centralização** do conteúdo de todas as células, cabeçalho e corpo, nas quatro abas com tabela — inclusive a coluna de identificação (Gerência, SV, Rota) | `.tb th` / `.tb td`; a regra `text-align:left` do `.l` saiu, e a classe continua só como marca dessa coluna |
| 2 | **Coluna Dez** do Aperitivo só quando o **mês vigente** é dezembro (em outubro e novembro ela não existe, nem cabeçalho nem célula), com `colspan` e `<colgroup>` acompanhando | `mesesAp` na tela, de `R.meses`; o mês vigente vem de `mesesDoSeletor(...).referencia` |
| 3 | **Rótulos:** "Soma" do Aperitivo vira **"% Acum."**, "% Acum." do Skyy vira **"% Médio"**, e a nota das duas telas passa a "ordem pelo % Acum. de Aperitivo" | só texto de tela: `soma`, `acumulado` e os testes de cálculo não mudam |
| 4 | **Quadradinho no % do Aperitivo**, só na coluna do **mês vigente**: verde quando o % **bruto** chega ao limite do mês, vermelho abaixo. O "% Acum." e as colunas dos outros meses não têm quadradinho | `motor.corDoPercentualAperitivo(valor, mes)` — a tela pergunta a cor, nunca compara |
| 4B | **Fonte do Aperitivo:** os números das colunas de mês e do % Acum. saem da condensada grande (`.n`, 19 px / `.n.g`, 23 px) e ficam na fonte da tabela, como as células de cobertura. O CSS do `.n.g`, que só a Soma usava, saiu | `mesCel` e a célula do % Acum. |
| 5 | **Linha do total** só com **"Total Band"** (sem "· Diretoria e GP"), em todas as abas em que aparece | `linhaRanking` e o texto de Medidas da aba Regras |
| 6 | **Detalhe do mês** (e o **Consultor**, que é a mesma tabela) com as cores das tabelas de ranking: bloco Aperitivo laranja, Skyy azul, Dif. negativa vermelha e quadradinho nos dois % | `tabelaGrupos`, com as classes `cg-ap`/`cg-sk`, `bl-*` e `hd-*` que já existiam — **nenhum CSS novo** |

**A regra nova.** `corDoPercentualAperitivo(valor, mes, cfg)` é a única regra desta etapa, e mora no motor como a
`corDoPercentual` da 4B. Ela é **diferente** da do % de cobertura: o limite não é o mínimo do gatilho, e sim o do
**mês** — a trava (`REGRAS.trava[mes]`) nos meses travados e `REGRAS.corAperitivoSemTrava` no mês sem trava. A cor sai
do valor **bruto**: no dado real de 09/11/2026 a SV.G2.1 tinha 129,99239% em novembro, mostra "129,9%" e fica
**vermelha**. Mês fora da vigência é erro, como em `aplicarTrava`.

**Mês vigente ≠ mês do seletor.** O seletor "Mês de referência" troca Meta, Real, Dif e o % do mês; ele **não** mexe
nas colunas de mês. Por isso a coluna Dez e o quadradinho seguem o mês de referência da **API**
(`mesesDoSeletor(...).referencia`, campo novo do adaptador), e não a escolha do usuário.

⚠️ **Premissas desta etapa** (pendência 25 das regras; a Karen confirma): o limite do mês **sem trava** (dezembro) e a
centralização também da coluna de identificação. A primeira está sinalizada em Regras > Dados e alertas. Duas
interpretações a mais, anotadas aqui porque o pedido não as cobre palavra por palavra: o **Consultor** recebeu as
cores e os quadradinhos junto com o Detalhe do mês (é a mesma função de tabela e os mesmos dois blocos), e a linha
**Total Band** também recebe o quadradinho do mês vigente.

**Fora desta etapa:** a **paginação** de Supervisão e Consultor (15 linhas por página, Total Band fixo no rodapé,
Consultor aberto com todas as rotas), que está na mesma seção 7 da v1.7 e não entrou no pedido da 4F. A Supervisão
Mista continua rolando (30 linhas).
