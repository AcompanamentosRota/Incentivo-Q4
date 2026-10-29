# API de Metas x Realizado de Volume

Guia para quem vai construir o front. A API é um conjunto de arquivos JSON estáticos, publicados no
mesmo site do GitHub Pages que a página. Do `frontend/index.html`, os endereços são relativos:

```js
const BASE = "./api/v1/";
const index = await fetch(BASE + "index.json", { cache: "no-cache" }).then(r => r.json());
```

Use sempre caminhos relativos (`./api/v1/...`). O site é restrito a funcionários, e o login do GitHub
vale para este site; uma página hospedada em outro endereço não consegue ler estes arquivos.

## Atualização

Os arquivos são regerados a cada 15 minutos, de segunda a sexta, das 7h às 18h45 (Brasília). Só o
`index.json` muda em toda execução (traz `atualizado_em`); os outros só mudam quando o dado muda (o
`fechado/{AAAAMM}.json` do mês em fechamento é regravado a cada execução do fechamento). Para
atualizar a tela sem recarregar a página, releia o `index.json` de tempos em tempos (5 a 15 minutos) e,
quando `atualizado_em` mudar, releia os arquivos que estiverem na tela.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.json` | Data/hora, mês de referência, calendário, lista de produtos, gerências e nomes dos status. Leia primeiro. |
| `resumo.json` | Total da empresa e de cada gerência, por produto. Tela inicial. |
| `gerencias/{GC}.json` | Uma gerência: total, supervisões e rotas, por produto. `{GC}` vem de `index.json` → `gerencias[].id`. |
| `rotas/{ROTA}.json` | Uma rota: total e clientes, por produto. `{ROTA}` vem de `gerencias/{GC}.json` → `rotas[].id`. |
| `busca.json` | Todos os clientes em formato compacto, para busca por nome ou código. |
| `agrupadores.json` | Todos os agrupadores com META_VOLUME no mês (`campos`: `[nome, meta]`), com a grafia exata do Datasphere. É a lista de sugestões da Administração do painel. |
| `fechado/{AAAAMM}.json` | Um mês já fechado: meta e realizado de cada rota, por produto (veja "Meses fechados"). A lista está em `index.json` → `fechados`. |

**Agrupadores extras.** Além dos 6 produtos fixos, a API inclui os agrupadores que o admin do painel publicou em
`frontend/ajustes.json` (campo `agrupadores`: `{id, nome, agrupador}`). Eles aparecem em `index.json` → `produtos`
com `"extra": true` (cada produto traz também os seus `agrupadores`) e têm o mesmo bloco de indicador dos demais;
a meta é só a META_VOLUME, como no SAC.

## O bloco de indicador (rota, supervisão, gerência e empresa)

Todo nível tem um objeto `produtos` com uma chave por produto (`sucos`, `powerade`, `sabores`,
`retornaveis`, `individuais`, `refrigerantes`, na ordem de `index.json` → `produtos`). `refrigerantes` é a categoria
inteira (todos os itens de refri): já contém `individuais`, `retornaveis` e parte de `sabores`, então não some os
produtos entre si. Cada produto traz sempre os mesmos campos:

```json
{
  "meta": 2180.7,
  "realizado": 1312.6,
  "atingimento_pct": 60,
  "diferenca": -868.1,
  "tendencia": 2039.5,
  "tendencia_pct": 94,
  "meta_dia": 103.8,
  "online_hoje": 162.8,
  "status": "abaixo_do_ritmo"
}
```

| Campo | Significado |
|---|---|
| `meta` | Meta de volume do mês (META_VOLUME da rota; nos níveis acima, a soma das rotas). Em `individuais` e `refrigerantes`, rota sem META_VOLUME vem com meta 0, como no SAC. |
| `realizado` | Volume faturado no mês (notas com status válido, critério do SAC). Não inclui os pedidos de hoje. |
| `atingimento_pct` | `realizado / meta`, inteiro. |
| `diferenca` | `realizado - meta` (negativo = quanto falta). |
| `tendencia` | Projeção de fechamento: realizado + parte da meta ainda prevista para os dias que faltam. |
| `tendencia_pct` | `tendencia / meta`, inteiro. |
| `meta_dia` | Meta de hoje (o que precisa vender hoje para recuperar o ritmo). |
| `online_hoje` | Volume dos pedidos de hoje ainda não faturados (WF Online, só pedidos válidos). |
| `status` | `meta_batida`, `no_ritmo`, `abaixo_do_ritmo` ou `sem_meta` (textos em `index.json` → `status`). |

Regras do `status` nos níveis rota, supervisão, gerência e empresa: `meta_batida` quando
`atingimento_pct >= 100`; senão `no_ritmo` quando `tendencia_pct >= 100`; senão `abaixo_do_ritmo`.
`sem_meta` quando não há meta (os campos numéricos vêm `null`).

Volume é sempre em volume padrão (`index.json` → `unidade`), com uma casa decimal.

## O bloco do cliente

Dentro de `rotas/{ROTA}.json` → `clientes[].produtos`:

```json
{ "meta": 27.1, "realizado": 6.6, "atingimento_pct": 24, "diferenca": -20.5, "online_hoje": 0.0,
  "status": "abaixo_do_ritmo" }
```

A meta do cliente é a META_NEG dele no mês. O cliente não tem tendência: ele fica `no_ritmo` quando o
`atingimento_pct` alcança o ritmo esperado (`index.json` → `calendario.ritmo_esperado_pct`, o % de dias
úteis já fechados). A soma das metas dos clientes pode diferir um pouco da meta da rota, porque a meta
oficial da rota é a META_VOLUME (como no SAC).

Clientes com `"na_base": false` tiveram venda ou meta na rota, mas não estão mais ativos na base
(vêm sem nome). O front pode mostrá-los separados ou escondê-los.

## Tipos de rota

Cada rota tem `tipo`: `normal`, `neutraliza`, `virtual` ou `eventual`. Todas entram nos totais de
supervisão e gerência, como no SAC. As `eventual` (ex.: `G1-EV`) juntam o realizado de clientes
atendidos por rotas eventuais (EV*): não têm meta nem clientes. Sugestão: listar só as `normal` e
`neutraliza`, e deixar as demais apenas nos totais.

## Fechamento do mês

Do 1º dia do mês até o fim do 1º dia útil (e enquanto alguma gerência ainda não tiver meta do mês
novo), a API mostra o mês anterior fechado: `index.json` → `mes_referencia.fechamento = true`, e
`tendencia`, `tendencia_pct`, `meta_dia` e `online_hoje` vêm `null`. Mostre o rótulo
`mes_referencia.rotulo` (ex.: "Setembro/26") para deixar claro qual mês está na tela.

## Meses fechados (`fechado/{AAAAMM}.json`)

Quando a API vira para o mês novo, os números do mês anterior deixam de existir nos outros arquivos. Para o
acumulado do trimestre, o gerador guarda um arquivo por mês fechado:

- Em toda execução com `mes_referencia.fechamento = true`, grava (ou sobrescreve) `fechado/{anomes do mês de
  referência}.json`, com `fechamento_final: false`. Vale o último gravado: as notas do último dia do mês só entram
  de madrugada.
- Na 1ª execução com o mês novo (`fechamento = false`), o arquivo é **selado**: só `fechamento_final` passa a
  `true`, os números não mudam. Daí em diante ele nunca é sobrescrito nem apagado.
- Só é gravado quando a execução passa na validação, e a soma da meta e do realizado das rotas tem de bater com o
  total da empresa da execução (`resumo.json`); senão nada é gravado. Falha aqui não derruba a execução normal: ela
  vira um item em `index.json` → `avisos`.

Formato compacto (os nomes de produto, gerência e supervisor estão em `index.json` e nos arquivos do mês):

```json
{
  "anomes": "202610", "rotulo": "Outubro/26",
  "gerado_em": "2026-11-03T18:46:02", "atualizado_em": "2026-11-03T18:45:10",
  "simulado": false, "fechamento_final": true,
  "campos": ["rota", "gerencia", "supervisao", "produtos"],
  "campos_produto": ["meta", "realizado"],
  "rotas": [ ["111", "G1", "SV.G1.1", { "sucos": [100.0, 85.0], "refrigerantes": [900.0, 870.5] }] ]
}
```

| Campo | Significado |
|---|---|
| `gerado_em` | Quando o arquivo foi gravado (relógio do gerador). |
| `atualizado_em` | O `atualizado_em` da execução de onde vieram os números (o mesmo do `index.json` dela). |
| `fechamento_final` | `false` enquanto o mês ainda está em fechamento (pode mudar); `true` depois da virada (definitivo). |
| `rotas` | Uma linha por rota do mês, em todas as gerências, na ordem de `campos`. Inclui as rotas eventuais (`G1-EV`), que só têm realizado. |
| `produtos` | `{id: [meta, realizado]}`, com os ids de `index.json` → `produtos` daquele mês (os 6 fixos, `refrigerantes` incluído, e os agrupadores extras ativos). Mesmos valores (1 casa) de `gerencias/{GC}.json` → `rotas[].produtos`. Produto que vem `sem_meta` na rota fica fora; `meta` pode ser `0` (`individuais`/`refrigerantes` sem META_VOLUME e rotas eventuais). |

Não há online, tendência nem meta do dia: no fechamento eles não existem. O % do mês é `realizado / meta`.

`index.json` → `fechados` lista os arquivos que existem, sempre em ordem cronológica (lista vazia quando não há):

```json
"fechados": [ { "anomes": "202610", "rotulo": "Outubro/26", "arquivo": "fechado/202610.json",
                "gerado_em": "2026-11-03T18:46:02", "fechamento_final": true } ]
```

## Exemplos de estrutura

`index.json` (resumido):

```json
{
  "versao_api": "1",
  "atualizado_em": "2026-10-22T16:38:57",
  "simulado": false,
  "mes_referencia": { "anomes": "202610", "rotulo": "Outubro/26", "fechamento": false },
  "calendario": { "hoje": "2026-10-22", "dias_uteis_mes": 21, "dia_util_hoje": 15,
                  "dias_uteis_fechados": 14, "dias_uteis_restantes": 7, "ritmo_esperado_pct": 67 },
  "produtos": [ { "id": "sucos", "nome": "Vol. Sucos" }, "..." ],
  "status": { "meta_batida": "Meta batida", "no_ritmo": "No ritmo", "abaixo_do_ritmo": "Abaixo do ritmo",
              "sem_meta": "Sem meta" },
  "gerencias": [ { "id": "G1", "nome": "Goiânia 01", "arquivo": "gerencias/G1.json" }, "..." ],
  "fechados": [ { "anomes": "202609", "rotulo": "Setembro/26", "arquivo": "fechado/202609.json",
                  "gerado_em": "2026-10-01T18:46:02", "fechamento_final": true } ],
  "avisos": []
}
```

`gerencias/G1.json`:

```json
{
  "gerencia": { "id": "G1", "nome": "Goiânia 01" },
  "produtos": { "sucos": { "...": "bloco" } },
  "supervisoes": [ { "id": "SV.G1.1", "nome": "NOME DO SUPERVISOR", "rotas": ["111", "112"],
                     "produtos": { "...": "bloco" } } ],
  "rotas": [ { "id": "111", "tipo": "normal", "gerencia": "G1", "supervisao": "SV.G1.1",
               "vendedor": "NOME DO VENDEDOR", "produtos": { "...": "bloco" } } ]
}
```

`rotas/111.json`:

```json
{
  "rota": { "id": "111", "tipo": "normal", "gerencia": "G1", "supervisao": "SV.G1.1",
            "vendedor": "NOME DO VENDEDOR", "nome_supervisor": "NOME DO SUPERVISOR" },
  "produtos": { "...": "bloco" },
  "clientes": [ { "pv": 1007382, "nome": "NOME FANTASIA", "segmento": "Boteco", "na_base": true,
                  "produtos": { "sucos": { "...": "bloco do cliente" } } } ]
}
```

`busca.json`:

```json
{ "campos": ["pv", "nome", "rota", "gerencia"],
  "clientes": [ [1007382, "NOME FANTASIA", "111", "G1"] ] }
```

## Dados simulados

Enquanto as credenciais do Datasphere não estão configuradas, a API pode ser gerada com dados
fictícios (`"simulado": true` no `index.json`; aviso também em `avisos`). Mostre um aviso bem visível
quando `simulado` for `true`. Para gerar na sua máquina: `python scripts/gerar.py --simulado --forcar`
na pasta `backend/`, e abra o site com `python -m http.server` numa pasta com `frontend/` e `api/`
montados como no deploy (veja o README).
