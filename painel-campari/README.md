# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
gatilho de **cobertura de Skyy** e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e Diretoria e GP ficam na linha "Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.3, 08/11/2026). Itens ⚠️ são interpretações a confirmar: o painel
sinaliza, não decide.

## Estado: etapa 3 — gatilho de cobertura, status e meta dia de cobertura (sem tela)

- **Etapa 1 (esqueleto):** lê `./api/v1/index.json` e acha os dois produtos do incentivo pelo campo `agrupadores`
  (`"Aperitivo"` e `"Skyy"`, grafia exata, com `"extra": true`), nunca por id fixo. As abas de ranking continuam
  **em construção**; a aba Regras resume `docs/regras.md` (sem prêmios: decisão de 08/11/2026).
- **Etapa 2:** `carregarRanking()` no adaptador lê a API e entrega ao motor o ranking de volume de Aperitivo
  de GC, SV Mista e SV Segmentada, mais os consultores (só os próprios números, sem ranking).
- **Etapa 3 (esta):** gatilho de **cobertura de Skyy**, coluna **Oficial**, **status "Bateu!"**, **meta dia de
  cobertura**, diferença, "hoje atingiu a meta dia" e a linha **Total Band** (`resumo.json` → `empresa`), mais a
  estrutura das tabelas de ranking (dois blocos, Aperitivo e Skyy, por mês) pronta para a tela. Nenhum número aparece
  na tela ainda: a tela é a **Etapa 4**.

### Motor (`src/motor.js`, toda regra de cálculo)

| Função | O que faz |
| --- | --- |
| `REGRAS` | `versao`, `trava: {10: 130, 11: 130, 12: null}` (dezembro sem trava), `gatilho: {meses: [11, 12], minimo: 100}` e `premiadas: {gc: 6, svMista: 12, svSegmentada: 3}` |
| `MOTIVOS` | os textos exatos do motivo do status: `premiadas`, `indisponivel`, `semMeta` (a tela não escreve motivo) |
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
| `hojeAtingiu(online, metaDia)` | "Hoje" colorido: Online > 0 **e** Online ≥ Meta dia |

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
  dia de **volume** continua vindo pronta da API.
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
│   └── app.tpl.html       tela (palco de 1920 px, fit(), cabeçalho compacto, rodapé com a origem dos dados)
├── data/data.json         canal de cada rota (foto da base embutida do Q4, 09/11/2026)
├── scripts/build.py       monta frontend/campari-club.html (determinístico; embute data/data.json)
├── scripts/copiar_canais.py  regera data/data.json a partir de painel-q4/data/data.json
└── tests/                 motor.test.js e adapter.test.js (fixtures sintéticas)
```

## Comandos

```bash
# monta o HTML único (comite frontend/campari-club.html junto com a fonte)
python painel-campari/scripts/build.py

# testes do painel — 98 testes (38 do motor, 60 do adaptador); precisa de Node 18+
node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js

# site local, como no Pages: http://localhost:8000/campari-club.html
cd backend && python scripts/servir.py
```

Não clique em "Atualizar dados" no `servir.py`: ele grava em `api/`.

O deploy (`deploy-pages.yml`) copia `frontend/` inteiro para o site, então `frontend/campari-club.html` é publicado
sem mudança no workflow. Sem logo nem fonte embutida: o letreiro é texto em Inter (reserva na fonte do sistema).

## O que ainda depende de terceiros

- **Pendência 10 (Matheus, prazo 01/12/2026): a cobertura no `fechado/AAAAMM.json`.** Sem ela, o gatilho só funciona
  enquanto o mês do gatilho é o mês de referência. Em **novembro/2026 o gatilho é parcial e funciona** (novembro é o
  mês aberto); em **dezembro**, novembro já será mês fechado e, sem o campo novo, o gatilho de todos fica
  "cobertura indisponível" — ninguém recebe posição oficial nem "Bateu!". O painel avisa (faixa de aviso e a lista
  `avisos`) e **não assume valor**. Quando o formato for definido, o único lugar a mudar é `coberturaDoFechado` no
  adaptador (e os testes dela).
- **Pendência 15 (Karen): meta dia de volume zerada.** Em 08/11/2026 (domingo) vinha 0,0 nos dois produtos. Conferido
  em **09/11/2026 (segunda, dia útil, `dias_uteis_restantes` 15)**: o `meta_dia` de volume vem preenchido
  (ex.: 3.655,0 no Total Band de Aperitivo). O zero de 08/11 era mesmo do dia não útil.
- **Pendência 21 (Karen): o mockup não mostra as colunas novas** do Ranking GC e da Supervisão. A Etapa 3 só entrega
  os dados; o ajuste de layout fica para a Etapa 4.
