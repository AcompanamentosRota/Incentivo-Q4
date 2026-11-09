# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
gatilho de **cobertura de Skyy** e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e Diretoria e GP ficam na linha "Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.3, 08/11/2026). Itens ⚠️ são interpretações a confirmar: o painel
sinaliza, não decide.

## Estado: etapa 2 — dados e motor do ranking de volume (sem tela)

- **Etapa 1 (esqueleto):** lê `./api/v1/index.json` e acha os dois produtos do incentivo pelo campo `agrupadores`
  (`"Aperitivo"` e `"Skyy"`, grafia exata, com `"extra": true`), nunca por id fixo. As abas de ranking continuam
  **em construção**; a aba Regras resume `docs/regras.md` (sem prêmios: decisão de 08/11/2026).
- **Etapa 2 (esta):** `carregarRanking()` no adaptador lê a API e entrega ao motor o ranking de volume de Aperitivo
  de GC, SV Mista e SV Segmentada, mais os consultores (só os próprios números, sem ranking). Nenhum número aparece
  na tela ainda (Etapa 4). Gatilho de cobertura, status, posição oficial e meta dia de cobertura: Etapa 3.

### Motor (`src/motor.js`, toda regra de cálculo)

| Função | O que faz |
| --- | --- |
| `REGRAS` | `versao` e `trava: {10: 130, 11: 130, 12: null}` (dezembro sem trava) |
| `percentualMes(real, online, meta)` | (Real + Online) ÷ Meta × 100, bruto; null com meta nula ou ≤ 0; online ausente = 0 |
| `aplicarTrava(pct, mes)` | `{valor, travado}`: min(%, limite); no limite exato não trava |
| `somaRanking(valores)` | soma dos % travados dos meses com %; nenhum: null |
| `apurarMeses(meses)` | % bruto, travado e marca de trava por mês, soma e `incompleta` (mês que devia contar sem %) |
| `ordenarRanking(linhas)` | soma desc (null no fim); empate pelo código em minúsculas, texto simples (`sv.g2.10` < `sv.g2.2`) |
| `numerarRanking(linhas)` | Pos. 1..n em todas as linhas |

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
- Lê só o `ajustes.json` **publicado** (o Campari não tem Administração nem ajustes do navegador): 404 = sem ajustes;
  ilegível = nenhum ajuste vale, com aviso.
- Resultado: `meses` (fonte e estado de cada mês), `gc`, `svMista`, `svSegmentada` (ordenadas e numeradas), `fora`,
  `rotas`, `canaisSV`, `avisos`; cada linha guarda, por mês, `meta`, `real`, `online`, `metaDia` (só no mês aberto),
  `pct`, `pctTravado`, `travado`, `fonte`, `estado` e `situacao`, mais `soma`, `incompleta` e `pos`.

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
│   ├── motor.js           cálculo (UMD: Node e window.MotorCampari): % do mês, trava, soma, ordem e posição
│   ├── adapter.js         CONFIG, localizarProdutos, carregarDados, fontesDosMeses, montarDados, carregarRanking
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

# testes do painel (Node 18+)
node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js

# site local, como no Pages: http://localhost:8000/campari-club.html
cd backend && python scripts/servir.py
```

Não clique em "Atualizar dados" no `servir.py`: ele grava em `api/`.

O deploy (`deploy-pages.yml`) copia `frontend/` inteiro para o site, então `frontend/campari-club.html` é publicado
sem mudança no workflow. Sem logo nem fonte embutida: o letreiro é texto em Inter (reserva na fonte do sistema).
