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
`fechado/{AAAAMM}.json` de um mês em prévia é regravado a cada execução, até ele virar oficial). Para
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
| `fechado/{AAAAMM}.json` | Um mês já fechado: meta e realizado de cada rota e os totais por gerência e da empresa, por produto, em prévia ou oficial (veja "Meses fechados"). A lista está em `index.json` → `fechados`. |
| | O arquivo pode trazer `exclusoes` (opcional): notas tiradas do fechamento, já descontadas dos números. |
| `missoes.json` | Missões Guiadas do mês: nome, realizado (até ontem) e online (hoje) de cada missão, por rota, mais as contagens da base de elegíveis (veja "Missões Guiadas"). |

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
  "status": "abaixo_do_ritmo",
  "cobertura": { "meta": 97.0, "realizado": 64, "atingimento_pct": 66, "diferenca": -33.0, "online_hoje": 12 }
}
```

| Campo | Significado |
|---|---|
| `meta` | Meta de volume do mês (META_VOLUME da rota; nos níveis acima, a soma das rotas). Em `individuais` e `refrigerantes`, rota sem META_VOLUME vem com meta 0, como no SAC. |
| `realizado` | Volume faturado no mês (notas com status válido, critério do SAC). Não inclui os pedidos de hoje. Desde 16/11/2026, em **todo o trimestre** (outubro inclusive), como a story do SAC: pelo mês, pelo agrupador e pela **rota da meta** (`Chave_Meta_SAP`); venda sem chave de meta fica fora, e o realizado de um produto só aparece depois que a meta dele é carregada. Antes do corte (`gerador/mapeamento.REAL_PELA_META_DESDE`): pelo mês e agrupador do faturamento e pela rota do cliente. |
| `atingimento_pct` | `realizado / meta`, inteiro. |
| `diferenca` | `realizado - meta` (negativo = quanto falta). |
| `tendencia` | Projeção de fechamento: realizado + parte da meta ainda prevista para os dias que faltam. |
| `tendencia_pct` | `tendencia / meta`, inteiro. |
| `meta_dia` | Meta de hoje (o que precisa vender hoje para recuperar o ritmo). |
| `online_hoje` | Volume dos pedidos de hoje ainda não faturados (WF Online, só pedidos válidos). Pela mesma chave e rota da meta do `realizado`. |
| `status` | `meta_batida`, `no_ritmo`, `abaixo_do_ritmo` ou `sem_meta` (textos em `index.json` → `status`). |

Regras do `status` nos níveis rota, supervisão, gerência e empresa: `meta_batida` quando
`atingimento_pct >= 100`; senão `no_ritmo` quando `tendencia_pct >= 100`; senão `abaixo_do_ritmo`.
`sem_meta` quando não há meta (os campos numéricos vêm `null`).

Volume é sempre em volume padrão (`index.json` → `unidade`), com uma casa decimal.

### Cobertura (`cobertura`, desde 11/2026)

Quantidade de **clientes** que compraram o produto no mês, com os mesmos níveis do volume. Cada cliente conta uma vez
por produto; por isso a cobertura soma entre rotas, supervisões e gerências, mas **nunca entre produtos**.

| Campo | Significado |
|---|---|
| `meta` | META_COBERTURA da rota no mês (nos níveis acima, a soma das rotas com meta). `null` quando não há meta de cobertura (ex.: Sucos em novembro/26). |
| `realizado` | Clientes cobertos no mês (FX_COBERTURA_REALIZADO, faturado até ontem), pela mesma chave e rota da meta do `realizado` de volume. Inteiro. Vem mesmo sem meta. |
| `atingimento_pct` | `realizado / meta`, inteiro; `null` sem meta. |
| `diferenca` | `realizado - meta`; `null` sem meta. |
| `online_hoje` | Clientes **ainda não cobertos no mês** com pedido válido hoje (FX_COBERTURA_WF_ONLINE, mesmo filtro de pedidos do `online_hoje` de volume). Não se repetem no `realizado`, então `realizado + online_hoje` é a cobertura com os pedidos de hoje. `null` no fechamento do mês. |

`cobertura` inteiro vem `null` quando o modelo não tem as colunas de cobertura. Os meses fechados
(`fechado/{AAAAMM}.json`) guardam a cobertura **igual ao volume**: `[meta, realizado]` por rota (coluna `cobertura`) e
os totais por gerência e da empresa (`totais_cobertura`). Veja "Meses fechados".

## O bloco do cliente

Dentro de `rotas/{ROTA}.json` → `clientes[].produtos`:

```json
{ "meta": 27.1, "realizado": 6.6, "atingimento_pct": 24, "diferenca": -20.5, "online_hoje": 0.0,
  "status": "abaixo_do_ritmo", "coberto": true, "coberto_hoje": false }
```

`coberto`: o cliente já está coberto no mês nesse produto (conta no `cobertura.realizado` da rota). `coberto_hoje`: não
estava coberto e tem pedido válido hoje (conta no `cobertura.online_hoje`); `null` no fechamento do mês. Os dois vêm
`null` quando a cobertura está indisponível. Na rota, a soma dos `coberto` dos clientes é o `cobertura.realizado`.

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
`neutraliza`, e deixar as demais apenas nos totais. Desde 16/11/2026 elas deixam de aparecer em todo o trimestre (de novembro/26 a 13/11/2026, só de novembro em diante): pela chave da
meta, a venda eventual com chave de meta entra na rota dona da meta, e a sem chave fica fora, como no SAC.

## Fechamento do mês

Do 1º dia do mês até o fim do 1º dia útil (e enquanto alguma gerência ainda não tiver meta do mês
novo), a API mostra o mês anterior fechado: `index.json` → `mes_referencia.fechamento = true`, e
`tendencia`, `tendencia_pct`, `meta_dia` e `online_hoje` vêm `null`. Mostre o rótulo
`mes_referencia.rotulo` (ex.: "Setembro/26") para deixar claro qual mês está na tela.

## Meses fechados (`fechado/{AAAAMM}.json`)

Quando a API vira para o mês novo, os números do mês anterior deixam de existir nos outros arquivos. Para o
acumulado do trimestre, o gerador guarda um arquivo por mês fechado:

Um mês fechado tem **dois estados** (decisão de 04/11/2026): o fechamento oficial do incentivo é feito depois do
fechamento do **flash de vendas** (em torno do dia 12), porque até lá notas fiscais são canceladas e retornadas.

- **Prévia** (`fechamento_final: false`): os números ainda podem mudar e o arquivo continua sendo regravado.
  Em toda execução com `mes_referencia.fechamento = true`, grava (ou sobrescreve) `fechado/{anomes do mês de
  referência}.json`. Depois da virada do mês, cada execução consulta de novo os meses ainda em prévia (no máximo os
  3 mais recentes) e regrava o arquivo deles.
- **Oficial** (`fechamento_final: true`, com `oficial_em` e `fonte_selo`): o arquivo nunca mais é sobrescrito nem
  apagado. O selo sai **só** quando o Back Office marca, na Administração do painel, que o flash daquele mês fechou
  (`frontend/ajustes.json` → `flashFechado`, publicado por PR) e a execução seguinte do gerador lê essa marca.
  Nunca há data de selo no código. Ajustes ilegíveis: nada é selado e a execução registra o aviso.
- Só é gravado quando a execução passa na validação, e a soma da meta e do realizado das rotas tem de bater com o
  total da empresa da execução (`resumo.json`); os totais por gerência e da empresa guardados no arquivo têm de ser
  exatamente os da execução. Senão nada é gravado. Falha aqui não derruba a execução normal: ela vira um item em
  `index.json` → `avisos`. A regravação de um mês em prévia passa também pelas travas de validação da execução
  normal (queda de mais de 30% no realizado da empresa, gerência que sumiu), comparando com o arquivo anterior.

Formato compacto (os nomes de produto, gerência e supervisor estão em `index.json` e nos arquivos do mês):

```json
{
  "anomes": "202610", "rotulo": "Outubro/26",
  "gerado_em": "2026-11-12T09:15:02", "atualizado_em": "2026-11-12T09:14:10",
  "simulado": false, "fechamento_final": true,
  "oficial_em": "2026-11-12T14:30:00", "fonte_selo": "flash",
  "campos": ["rota", "gerencia", "supervisao", "produtos", "cobertura"],
  "campos_produto": ["meta", "realizado"],
  "totais": {
    "empresa": { "sucos": [260000.0, 238900.4], "refrigerantes": [7065000.0, 7118954.0] },
    "gerencias": { "G1": { "sucos": [20000.0, 18900.4], "refrigerantes": [500000.0, 511895.0] } }
  },
  "totais_cobertura": {
    "empresa": { "sucos": [null, 17354], "skyy": [1891.0, 108] },
    "gerencias": { "G1": { "sucos": [null, 1520], "skyy": [160.0, 9] } }
  },
  "rotas": [ ["111", "G1", "SV.G1.1", { "sucos": [100.0, 85.0], "refrigerantes": [900.0, 870.5] },
                                      { "sucos": [null, 19], "skyy": [10.0, 0] }] ],
  "exclusoes": [ { "rota": "R32", "agrupador": "Powerade", "volume": 166.9,
                   "motivo": "Nota fiscal fora do fechamento de outubro/26 (decisão do Back Office em 13/11/2026)" } ]
}
```

| Campo | Significado |
|---|---|
| `gerado_em` | Quando o arquivo foi gravado (relógio do gerador). |
| `atualizado_em` | O `atualizado_em` da execução de onde vieram os números (o mesmo do `index.json` dela). |
| `fechamento_final` | `false` = **prévia** (os números podem mudar até o fechamento do flash e o arquivo é regravado); `true` = **oficial** (definitivo, nunca mais sobrescrito). |
| `oficial_em` | Data/hora do selo oficial (a que o Back Office marcou no painel) ou `null` enquanto o mês está em prévia. |
| `fonte_selo` | Como o mês foi selado: `"flash"` (marca do flash de vendas) ou `null` em prévia. Arquivo gravado antes de 11/2026 pode vir sem estes dois campos. |
| `totais` | Totais da execução, para a aba Estratégicos não precisar somar rotas: `empresa` e `gerencias[GC]`, cada um `{id: [meta, realizado]}`, exatamente como em `resumo.json` → `empresa.produtos` e `gerencias/{GC}.json` → `produtos`. |
| `rotas` | Uma linha por rota do mês, em todas as gerências, na ordem de `campos`. As rotas eventuais (`G1-EV`) só existem nos meses anteriores ao corte de `REAL_PELA_META_DESDE`; desde 16/11/2026 o corte é outubro/26, então nenhum mês do trimestre as tem. |
| `produtos` | `{id: [meta, realizado]}`, com os ids de `index.json` → `produtos` daquele mês (os 6 fixos, `refrigerantes` incluído, e os agrupadores extras ativos). Mesmos valores (1 casa) de `gerencias/{GC}.json` → `rotas[].produtos`. Produto que vem `sem_meta` na rota fica fora; `meta` pode ser `0` (`individuais`/`refrigerantes` sem META_VOLUME e rotas eventuais). |
| `cobertura` | **Igual a `produtos`, para a cobertura** (desde 11/2026): `{id: [meta, realizado]}` do bloco `cobertura` de cada produto da rota, com os mesmos valores de `gerencias/{GC}.json` → `rotas[].produtos[id].cobertura`. `meta` `null` = sem meta de cobertura; `realizado` é inteiro (clientes). `null` quando a execução não trouxe cobertura. Arquivo gravado antes de 11/2026 não tem a coluna: leia pela posição em `campos`. |
| `totais_cobertura` | Igual a `totais`, para a cobertura: `empresa` e `gerencias[GC]`, como em `resumo.json` → `empresa.produtos[id].cobertura` e `gerencias/{GC}.json` → `produtos[id].cobertura`. `null` quando a execução não trouxe cobertura; ausente em arquivo gravado antes de 11/2026. |
| `exclusoes` | **Campo opcional** (desde 13/11/2026): notas fiscais que o Back Office tirou do fechamento daquele mês, **já descontadas** de `rotas`, `totais` e `totais_cobertura`. Uma entrada por nota: `rota`, `agrupador` (como vem do modelo), `volume` (o que saiu do Real, 1 casa) e `motivo`. **Não traz número de nota nem código de cliente.** O campo **não existe** quando o mês não teve exclusão (o caso normal), e nenhuma entrada aparece quando a nota não foi encontrada na execução. Só o Real é afetado: meta, meta de cobertura e online não mudam. |

Não há online, tendência nem meta do dia: no fechamento eles não existem. O % do mês é `realizado / meta`.

`index.json` → `fechados` lista os arquivos que existem, sempre em ordem cronológica (lista vazia quando não há):

```json
"fechados": [ { "anomes": "202610", "rotulo": "Outubro/26", "arquivo": "fechado/202610.json",
                "gerado_em": "2026-11-12T09:15:02", "fechamento_final": true,
                "oficial_em": "2026-11-12T14:30:00", "fonte_selo": "flash" } ]
```

`oficial_em` e `fonte_selo` repetem o que está no arquivo do mês: `null` enquanto ele está em prévia.

## Missões Guiadas (`missoes.json`, desde 11/2026)

**Desde 18/11/2026 o realizado vem do CRUZAMENTO** entre a base de elegíveis do mês e a **cobertura por cliente ×
produto** do modelo `AM_FAT_BND_ANALISE_META` (decisão informada pela Karen em 17/11/2026) — não mais do
`AM_FAT_BND_GM_PROGRESSO_TAREFA`. A regra de contagem é a da cobertura: a **primeira compra do produto pelo cliente
no mês marca a missão**; compras seguintes não contam de novo. Com isso o arquivo passa a ter **Online (hoje)**, que
a fonte anterior não enxergava. É consultado em toda execução.

O contrato **só ganhou campos**: `missoes[].codigo`, `nome`, `realizado` e `rotas` continuam no mesmo lugar e com o
mesmo significado.

```json
{ "anomes": "202611", "fonte": "cobertura",
  "base": { "arquivo": "202611.csv", "anomes": "202611", "linhas": 4019, "pares": 4019,
            "ignoradas": 0, "motivos": {}, "erro": null },
  "missoes": [ { "codigo": "241", "nome": "Traga de volta", "realizado": 1069,
                 "rotas": { "111": 6, "112": 0, "...": 0 },
                 "realizado_online": 4, "rotas_online": { "G17": 2, "...": 1 },
                 "elegiveis": 2001, "elegiveis_rota_cliente": { "111": 20, "...": 19 } } ],
  "acima_dos_elegiveis": [ { "missao": "Traga de volta", "rota": "111", "elegiveis": 20,
                             "realizado": 21, "online": 0,
                             "origens": [ { "rota_cliente": "112", "pares": 1 } ] } ],
  "comparacao": { "fonte": "AM_FAT_BND_GM_PROGRESSO_TAREFA", "rotas_diferentes": 0,
                  "missoes": [ { "nome": "Traga de volta", "codigo": "241", "encontrada": true,
                                 "total": 1069, "total_anterior": 1069,
                                 "rotas_diferentes": 0, "rotas": {} } ] } }
```

- `anomes` (novo): o mês a que o arquivo se refere — o mês de referência da API. Ao contrário da fonte anterior, que
  não filtrava por data, **este arquivo é de um mês só**.
- `fonte` (novo): `"cobertura"` no cruzamento. Arquivo gerado antes de 18/11/2026 não tem o campo.
- `realizado` = quantos pares elegíveis (cliente × produto) da missão já estão **cobertos até ontem**. É uma
  **contagem** (inteiro quando inteiro), não volume, e é a soma das `rotas`.
- `rotas`: **rota da chave da meta** (`CD_ROTA_Chave_Meta_SAP`) → realizado, o mesmo critério do Real desde o PR 63.
  Rota que aparece com `0` participa da missão sem nada realizado; rota que não aparece não participa.
- `realizado_online` e `rotas_online` (novos): a cobertura **de hoje** de quem ainda não estava coberto no mês, na
  mesma rota da meta. Um par conta **uma vez só**: se está no realizado, não aparece no online.
- `elegiveis` e `elegiveis_rota_cliente` (novos): quantos pares elegíveis a missão tem, no total e **por rota do
  CLIENTE** (o cadastro da base de clientes) — um par elegível sem venda nenhuma não tem chave de meta, logo não
  teria rota da meta. **Não é denominador de nada:** a meta do pilar é 10 por rota, fixa, e vem da configuração de
  quem consome. Por isso o campo traz a rota no nome.
- `acima_dos_elegiveis` (novo, opcional — só aparece quando acontece): as duas rotas podem divergir, então uma rota
  pode receber mais realizações do que tem elegíveis próprios. O bloco nomeia **as duas rotas**: a que recebeu
  (`rota`, pela meta) e a de origem (`origens[].rota_cliente`, pelo cliente). Não é erro e nada é recalculado. O
  invariante que vale sempre é outro: `realizado` + `realizado_online` somados em **todas** as rotas = pares
  elegíveis cobertos no mês.
- `base` (novo): contagens da base de elegíveis do mês — nome do arquivo, linhas lidas, pares que entraram, linhas
  ignoradas e os motivos. `erro` preenchido = a base do mês **não foi publicada** ou não pôde ser lida; nesse caso
  `missoes` vem **vazio** e quem consome trata o pilar como "sem dados" — nunca 100%, nunca zero e nunca o número do
  mês anterior. **Nada do conteúdo da base é publicado:** nem código de cliente, nem código de produto, nem caminho
  de arquivo.
- `comparacao` (novo, temporário): rede de segurança da transição. Cada execução consulta também a fonte anterior e
  compara o realizado rota a rota; divergência é **aviso**, nunca muda número. `codigo` da missão vem daqui (a base
  de elegíveis não traz código). Isso será desligado depois de novembro e dezembro/2026, e então `comparacao` deixa
  de existir e `codigo` passa a ser `null`.
- **Quais missões aparecem:** as que estão na base de elegíveis do mês (duas em novembro/26). Escolher quais contam
  continua sendo de quem consome: o painel Desafio Q4 faz essa escolha em `CONFIG.missoesConfig`, por nome
  (em novembro/26, **"Aumente A Família"** e **"Traga De Volta"**, com meta 10 por rota; decisão de 10/11/2026).
- Comparação de nome: exata depois de normalizar acento e caixa (`Aumente A Família` = `AUMENTE A FAMILIA`).
- O arquivo pode trazer códigos de rota que **não existem** em `rotas/` nem no cadastro. Quem consome deve ignorá-los.
- Ainda não traz meta nem percentual da missão.
- Se a consulta falhar, o arquivo anterior é mantido e o volume segue atualizando. Se o arquivo nunca foi gerado, ele
  não existe: trate o 404 como "sem dados de missões".

**Formato anterior (até 18/11/2026), ainda aceito por quem consome:** sem `anomes`, `fonte`, `base`, `comparacao` e
sem os campos de online e de elegíveis; `rotas` era pela **rota atual do cliente** (`CD_ROTA_Clien`) e o arquivo
trazia **todas** as missões do modelo, de qualquer mês, em ordem de código.

```json
{ "missoes": [ { "codigo": "241", "nome": "Traga De Volta", "realizado": 593,
                 "rotas": { "111": 6, "112": 0, "...": 0 } } ] }
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
                  "gerado_em": "2026-10-01T18:46:02", "fechamento_final": true,
                  "oficial_em": "2026-10-12T14:30:00", "fonte_selo": "flash" } ],
  "avisos": []
}
```

`index.json` também pode trazer **`exclusoes`** (campo opcional, desde 13/11/2026), com o mesmo formato do bloco
dos meses fechados: as notas tiradas do Real **do mês de referência da execução**, já descontadas de todos os
arquivos dela. O campo não existe quando não houve exclusão — o caso normal.

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
