# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
dois pilares — gatilho de **cobertura de Skyy** e **mínimo de volume de Aperitivo** — e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e o total da empresa fica na linha
"Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.14, 10/11/2026). Itens ⚠️ são interpretações a confirmar: o código
segue o que elas descrevem e **não decide** por conta própria. Desde a v1.12 elas ficam só no documento de regras
(seção 10) e no checklist do PR — **a tela não mostra pendência nem premissa**, só alerta de dado.

## Estado: etapa 4N — RANK em todas as linhas e linha azul no "Bateu!" (v1.14)

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
- **Etapa 4F:** os **ajustes de tabela** das regras v1.7, seção 7, descritos no fim deste arquivo:
  centralização, coluna Dez só em dezembro, rótulos "% Acum." e "% Médio", quadradinho no % do mês vigente do
  Aperitivo (`corDoPercentualAperitivo`, a única regra nova), números do Aperitivo na fonte da tabela, linha do
  total só com "Total Band" e as cores do ranking também no Consultor e no Detalhe do mês. **Nenhum número muda.**
- **Etapa 4G:** a **navegação por páginas** da v1.7, seção 7, descrita no fim deste arquivo: **15 linhas por
  página** na Supervisão (uma paginação por canal), no Consultor — que passa a abrir com **todas as rotas** — e no
  Detalhe do mês, com a linha de total fixa no rodapé de todas as páginas e **sem rolagem** dentro da tabela. A conta
  é uma função pura do adaptador (`fatiar`), com o tamanho em `CONFIG.linhasPorPagina`. **Nenhum número muda.**
- **Etapa 4H:** o **status "Bateu!" e a coluna da posição oficial exigem os dois pilares** (regras v1.8, seções 2.2,
  5 e 7), descrito no fim deste arquivo: o segundo pilar de volume de Aperitivo e o gatilho dos dois pilares
  (`gatilhoPilares`), no motor. **O ranking não muda** (% Acum., ordem e posição); mudam só a oficial e o status.
- **Etapa 4I:** a visão **Gerência** do Detalhe do mês **deixa de ser paginada** (regras v1.9, seção 7;
  pendência 27): as 16 gerências e o Total Band numa tela só, sem botões. A paginação fica na Supervisão, no
  Consultor e na visão Supervisão do Detalhe. Descrita no fim deste arquivo. **Nenhum número muda.**
- **Etapa 4J:** as duas tabelas de ranking passam a ter **só a coluna da posição oficial** (regras v1.10,
  seções 5 e 7): ela numera quem bateu os dois pilares e mostra "—" para os demais; a coluna "Pos." e a
  regra de pintá-la em cinza saem da tela. Descrita no fim deste arquivo. **Nenhum número, ordem ou status muda.**
- **Etapa 4K:** o volume de Aperitivo deixa de ter gatilho por média e passa a ter **mínimo de volume**
  (regras v1.11, seções 2.2, 3 e 5): o "Bateu!" exige o **% de Aperitivo do mês vigente ≥ 100%**, no valor bruto,
  **sem média e sem soma** (`minimoVolume` no motor, no lugar do `gatilhoVolume` da 4H). A soma dos % (out + nov +
  dez, o "% Acum.") passa a servir **só para ranquear**, e o **único gatilho** por média é o de cobertura de Skyy.
  Na tela, a coluna da posição oficial vira **"RANK"** (pendência 29) e o cabeçalho do bloco Aperitivo perde o
  "GATILHO ≥ …" (pendência 28). Descrita no fim deste arquivo. **Nenhum número de dado, ordem de linha ou gatilho
  de Skyy muda**; pode mudar quem tem "Bateu!" e quem recebe número em RANK.
- **Etapa 4L:** duas mudanças de tela (regras v1.12). (a) A lista **"Dados e alertas"** da aba Regras fica
  só com alerta de **dado** (seção 10): saem os dois avisos de premissa a confirmar — a da meta dia de volume
  (pendência 22) e a do mínimo de volume (pendência 26b) —, e nenhum texto da lista cita "pendência" ou
  "premissa". As premissas ficam só no documento de regras e no checklist do PR. (b) A célula **"% Acum." do
  Total Band** deixa de ser "—" e mostra a **soma dos % mensais da empresa** (seção 7), que o motor e o adaptador
  já calculavam e entregavam em `tabela.aperitivo.soma`. Descrita no fim deste arquivo. **Nenhum cálculo novo e
  nenhum número das outras linhas muda**: as regras das premissas seguem iguais no motor, e o Total Band continua
  sem RANK, sem status e fora da ordenação.
- **Etapa 4M:** **nenhuma aba rola por dentro em notebook** (regras v1.13, seção 7). O `fit()` da tela
  escalava o palco por `min(largura ÷ 1920, altura ÷ 720)`; em janela mais baixa que ~16:9 (ex.: 1366×600 de área
  útil) a altura lógica do palco ficava menor do que a aba pede e a área rolável (`.rolar`) rolava ~1 cm. A
  altura-base passa a ser **930** e a conta sai da tela: `escalaDoPalco` (adaptador, pura) lê `CONFIG.palco`
  (`{ largura: 1920, alturaBase: 930 }`) e devolve escala e tamanho lógico. Descrita no fim deste arquivo.
  **Só a escala muda:** altura de linha, fonte, cores, colunas, paginação (15 linhas) e layout ficam como estavam,
  e em janela com altura folgada (1920×1080, 1920×940, 1366×768, 1280×720) a escala é a mesma de antes.
- **Etapa 4N (esta):** o **conceito do ranking do Desafio Q4** nas duas tabelas de ranking (regras v1.14, seções 5
  e 7). A coluna **"RANK" numera todas as linhas** com a posição do ranking (`l.pos`), e não mais só a oficial com
  "—" para quem não bateu os dois pilares; a **linha inteira fica azul** quando tem "✓ Bateu!"; quem bateu os dois
  pilares e ficou **fora das premiadas** recebe a tag **"Bateu, fora do ranking"**, em cor própria e sem pintar a
  linha. Descrita no fim deste arquivo. **O cálculo não muda:** o "Bateu!" continua decidido pela **posição
  oficial** (`numerarOficial`, só de quem bateu os dois pilares) contra `REGRAS.premiadas`; no motor, só
  `statusLinha` mudou, para devolver esse terceiro selo no lugar de "-".

### Decisões desta etapa (premissas P1 a P6 do enunciado, e as da Karen em 09/11/2026)

| # | Decisão |
| --- | --- |
| P1 | **Fonte:** só **Barlow Condensed 800** embutida (`src/assets/fonts.json`, ~28 KB), nos números e nos títulos das tabelas. Onde o mockup usa os pesos 600 e 700, o painel usa o 800. O resto é Inter, com reserva na fonte do sistema. **Nenhuma fonte de site externo** (um teste varre o template atrás de `http`, Google Fonts e CDNs) |
| P2 | **Fundo:** `src/assets/campari-fundo.jpg`, embutido em base64 pelo `build.py`, `center top / 1920px auto no-repeat` sobre `#02306B`. A arte traz logo, letreiro e faixa de meses, e **nada é desenhado por cima** (a faixa de abas começa em `top:148px`). Sem o arquivo, o build cai para o azul sólido e avisa. Um véu escuro (`.bg::after`) cobre só os últimos 150 px, para o rodapé ter contraste sobre o pôr do sol da arte |
| P3 | **Nenhum prêmio e nenhum nome de pessoa ou cliente na tela:** só códigos de rota, SV e gerência. Testado no template e no HTML gerado |
| P4 | **Seletor "Mês de referência"** no Ranking GC **e** na Supervisão (um estado só): troca Meta, Real, Dif e o % do mês dos dois blocos; M. Dia e Online só no mês aberto (nos outros, "—"); as colunas de mês, o % Acum., o % Nov e o % Médio não mudam. Mês sem dado fica desabilitado. Quem decide o que cada mês tem é `mesesDoSeletor` no adaptador. O **mês vigente** (`mesesDoSeletor(...).referencia`) é outra coisa: é o mês de referência da **API**, e é ele que decide as colunas que só existem em dezembro e onde fica o quadradinho do Aperitivo |
| P5 | **Colunas da v1.4** (18 no total em outubro e novembro, 20 em dezembro com a coluna Dez e o "% Nov"; etapa 4F, menos a "Pos." que a 4J tirou). Tudo cabe no palco de 1920, **sem rolagem horizontal**, com corpo de 14 px nas duas tabelas de ranking (etapa 4B) e cabeçalho de 13 px (o mínimo da etapa). Desde a etapa 4G não há mais rolagem **vertical** em nenhuma aba: as listas longas são paginadas de 15 em 15 |
| P6 | **Nenhum número de regra digitado na tela:** gatilho, trava e posições premiadas saem de `motor.REGRAS`. Um teste varre o template (sem o CSS) atrás de `130`, "precisa de 100" e "GC: 6 / Mista: 12 / Segmentada: 3" |
| — | **Consultor lista só as rotas `tipo: "normal"`** (decisão da Karen, 09/11/2026). As `neutraliza` e `virtual` ficam fora da lista, mas continuam somando no SV: a linha "Total da mesa" pode ser maior que a soma das linhas, e a tela conta quantas ficaram fora (`rotasDaMesa` + `textoDasOcultas`) |

### As cinco abas

| Aba | O que mostra |
| --- | --- |
| **Ranking GC** | as **12 linhas da gerência comercial agrupada** (etapa 4C) na ordem do % Acum. de Aperitivo, com os dois blocos, o seletor de mês e o **Total Band** como última linha (sem % Acum. e sem status: a empresa não tem apuração própria). A coluna Gerência mostra o código da linha; quem agrupa é `CONFIG.gruposGC` |
| **Supervisão** | uma tela só, aberta em Mista, com os botões `Mista | Segmentada` (`aria-pressed`), filtro de gerência e o mesmo seletor de mês. As supervisões **fora do ranking** (sem canal ou com empate) saíram desta tela na etapa 4B: o aviso está em Regras > Dados e alertas |
| **Consultor** | filtros Gerência e Supervisão (que **abre em "Todas"** desde a etapa 4G), o aviso de que ranking e premiação são do supervisor para cima, e as rotas em dois grupos (Volume de Aperitivo · Cobertura de Skyy), paginadas de 15 em 15, com a linha de total fixa no rodapé — "Total Band" em "Todas", "Total da gerência XX" com uma gerência escolhida e "Total da mesa SV.XX.N" com um SV |
| **Detalhe do mês** | filtros Visão (Gerência \| Supervisão) e Mês e a mesma tabela de dois grupos. Visão **Gerência**: todas as gerências da API e a linha "Total Band" numa tela só, **sem paginação** (etapa 4I); visão **Supervisão** (com filtro de gerência): paginada de 15 em 15, sem linha de total |
| **Regras** | três colunas — Como funciona, Status e (Medidas + Dados e alertas). Os alertas saem de `alertasDaTela`, com o estado **real** dos dados: API indisponível, dados simulados, produtos não publicados, cobertura ou volume de um mês indisponível, mês em prévia, mês que ainda não começou, supervisão fora do ranking e avisos da carga. **Nenhuma pendência e nenhuma premissa** desde a etapa 4L (regras v1.12): elas ficam no documento de regras (seção 10) e no checklist |
| **Total Band** | última linha das duas tabelas de ranking e do Detalhe do mês: números da empresa (`resumo.json` → `empresa`), o **% Acum.** de Aperitivo (soma dos % mensais da empresa, etapa 4L) e o % Médio de Skyy, **sem RANK, sem status** ("sem ranking") e fora da ordenação |

### Motor (`src/motor.js`, toda regra de cálculo)

| Função | O que faz |
| --- | --- |
| `REGRAS` | `versao`, `trava: {10: 130, 11: 130, 12: null}` (dezembro sem trava), `gatilho: {meses: [11, 12], minimo: 100}` (Skyy), `minimoVolume: {minimo: 100}` (Aperitivo, v1.11 — **sem meses**, porque não é média) e `premiadas: {gc: 6, svMista: 12, svSegmentada: 3}` |
| `MOTIVOS` | os textos exatos do motivo do status: `premiadas`, `indisponivel`, `semMeta`, `volumeIndisponivel`, `semMetaVolume` (os "cobertura em X%" / "volume em X%" saem de `gatilhoPilares`). Desde a v1.6 o motivo **não aparece na tela** (a coluna Status mostra só o selo) e continua calculado no motor |
| `percentualMes(real, online, meta)` | (Real + Online) ÷ Meta × 100, bruto; null com meta nula ou ≤ 0; online ausente = 0 |
| `aplicarTrava(pct, mes)` | `{valor, travado}`: min(%, limite); no limite exato não trava |
| `somaRanking(valores)` | soma dos % travados dos meses com %; nenhum: null |
| `apurarMeses(meses)` | % bruto, travado e marca de trava por mês, soma e `incompleta` (mês que devia contar sem %) |
| `somarGrupo(valores, campos)` | **soma da gerência comercial agrupada (v1.6, seção 4)**: soma `meta`, `real`, `online` e `metaDia` das gerências do grupo, para o % sair da **soma** e nunca da média dos %. Campo sem nenhum valor numérico fica null (nunca 0); `campos` permite somar o bloco de cobertura, que não tem meta dia |
| `ordenarRanking(linhas)` | soma desc (null no fim); empate pelo código em minúsculas, texto simples (`sv.g2.10` < `sv.g2.2`) |
| `numerarRanking(linhas)` | posição 1..n em todas as linhas (`pos`): ordena o ranking e entra no motivo do status; desde a v1.10 **não é exibida** |
| `percentualCobertura(real, online, meta)` | % de cobertura do mês, bruto; meta nula ou ≤ 0 dá null (vira "sem meta de cobertura") |
| `diferenca(real, online, meta)` | Real + Online − Meta; online ausente = 0; sem real ou sem meta, null |
| `gatilhoCobertura(meses, mesRef)` | `{valor, batido, parcial, indisponivel, motivo}`: novembro parcial; de dezembro em diante a média simples de nov e dez, e só com os dois; `batido` = valor bruto ≥ 100 |
| `minimoVolume(meses, mesRef)` | **mínimo de volume de Aperitivo (v1.11, seção 2.2)**: `{valor, batido, indisponivel, motivo}` — o % do **mês vigente** (`mesRef`, o mês de referência da API) com o % do **ranking** (`percentualMes` + `aplicarTrava`), ≥ `REGRAS.minimoVolume.minimo` no valor bruto. **Sem média, sem soma e sem `parcial`**; mês vigente sem fonte → "volume indisponível"; meta nula ou ≤ 0 → "sem meta de volume" |
| `gatilhoPilares(gSkyy, mVolume, cfg)` | **os dois pilares (v1.11, seção 5)**: `{batido, indisponivel, motivo}` — batido só com os dois (gatilho de Skyy **e** mínimo de volume); indisponível quando falta algum e nenhum falhou com valor; pilar ausente nunca conta como batido |
| `numerarOficial(linhas, cfg)` | posição oficial 1..k, só de quem bateu **os dois pilares**, na ordem do ranking. **Não é exibida** (etapa 4N): é ela que decide o "Bateu!" contra o limite de premiadas |
| `statusLinha(linha, nivel, cfg)` | `{status, motivo}` com os **três** selos de `STATUS` (v1.14): `"Bateu!"` (dois pilares **e** oficial ≤ limite), `"Bateu, fora do ranking"` (dois pilares, oficial > limite) e `"-"` (o resto); `nivel` = `gc`, `svMista` ou `svSegmentada`; nível sem limite publicado é erro |
| `STATUS` | os três textos de selo (`bateu`, `fora`, `nao`): a tela lê daqui e só acrescenta o "✓" do "✓ Bateu!" |
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
  `incompleta`, `pos`, `gatilho` (Skyy), `minimoVolume` (Aperitivo, 4K), `gatilhoPilares` (os dois, 4H/4K), `oficial` e
  `status`.
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
| `rotasDoConsultor(dados, {sv, gc})` | **(4G)** o recorte da aba Consultor nas três situações do filtro — uma mesa, uma gerência inteira ou todas as rotas — com o rótulo do total ("Total da mesa SV.XX.N", "Total da gerência XX" ou "Total Band"). O total é sempre uma linha que a **API publica**: nada é somado aqui |
| `fatiar(linhas, pagina, tamanho)` | **(4G)** uma página de linhas: `{ linhas, pagina, paginas, total, tamanho, inicio, fim, uma }`. Página fora do intervalo fica travada no intervalo; lista vazia dá uma página sem linhas; tamanho padrão `CONFIG.linhasPorPagina` (15). A linha de total fica **fora** desta conta |
| `paginaDoDetalhe(linhas, visao, pagina)` | **(4I)** a página da aba Detalhe do mês, no formato de `fatiar`: visão em `CONFIG.detalheSemPaginacao` (`['gc']`) → uma página com **todas** as linhas (`uma: true`, sem botões); outra visão → páginas de `CONFIG.linhasPorPagina`. Não tem conta própria: só escolhe o tamanho e chama `fatiar` |
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
│   │                      ordem, posição, pilares (gatilho de Skyy, mínimo de volume e os dois), posição oficial, status, metas dia
│   ├── adapter.js         CONFIG (com gruposGC), localizarProdutos, carregarDados, fontesDosMeses,
│   │                      fontesDaCobertura, coberturaDoFechado, lerFechado, gruposDoRankingGC, tabelaDaLinha,
│   │                      montarDados, carregarRanking, escalaDoPalco (escala do palco)
│   ├── app.tpl.html       tela: cinco abas e palco de 1920 px; o fit() (copiado do Q4) pede a escala ao
│   │                      adaptador (escalaDoPalco), com a altura-base em CONFIG.palco
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

# testes do painel — 255 testes (79 do motor, 176 do adaptador); precisa de Node 18+
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
  o Real passa da Meta, e deixa a premissa em aberto. O painel usa **só o Real** (até ontem); desde a etapa 4L
  (regras v1.12) a premissa fica registrada só aqui, no documento de regras e no checklist — **não na tela**. Se a
  resposta for "Real + Online", o único lugar a mudar é `metaDiaVolume` no motor.
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

## Etapa 4G — navegação por páginas (regras v1.7, seção 7)

Pedido da Karen em 09/11/2026: botões de navegação no lugar da rolagem, e o Consultor abrindo com todas as rotas.
**Só apresentação: nenhum número muda** — as linhas da tela, célula a célula, saíram idênticas às da etapa 4F na
mesma cópia de `api/v1` (foto de 09/11/2026 17:30).

| # | Ajuste | Onde |
| --- | --- | --- |
| 1 | **15 linhas por página**, com os botões `‹ 1 2 ›` no rodapé da tabela: a página atual em vermelho, "‹" desabilitado na primeira e "›" na última. Cabendo numa página só, nenhum botão aparece | `fatiar` no adaptador (`CONFIG.linhasPorPagina`) e `navPaginas` na tela, que só desenha |
| 2 | **Linha de total fixa** no rodapé de **todas** as páginas, fora da contagem das 15 | `tabelaRanking` e `tabelaGrupos`: a fatia não a inclui, e ela é acrescentada depois do corpo |
| 3 | **Consultor abre com todas as rotas** (filtro de Supervisão em "Todas"), na mesma ordem de antes | `st.sv` começa vazio; o recorte é de `rotasDoConsultor` |
| 4 | Trocar **aba, canal, mês ou filtro** volta para a página 1 e recalcula o número de páginas; a página **não** é lembrada ao recarregar | `voltarPagina1()` nos três manipuladores de evento |
| 5 | **Uma paginação por tela**, e a Supervisão **uma por canal** | `chavePag()`: `gc`, `sv:Mista`, `sv:Segmentada`, `rt`, `det:gc`, `det:sv` |
| 6 | **Acessibilidade:** `aria-label` ("Página 2", "Página anterior", "Próxima página"), `aria-current="page"` na atual, `<button>` de verdade (Tab/Enter) e o foco devolvido ao mesmo controle depois do redesenho | `navPaginas` e `devolverFoco` |
| 7 | As linhas da tabela de dois grupos (Consultor e Detalhe do mês) passam a 3 px de respiro, como as de ranking desde a 4B. A fonte **não** muda (15 px) | `.tb.g2 td,.tb.g2 th` — é o que faltava para a página cheia caber sem rolagem em 1920×940 |

**Quem ficou paginado.** O Ranking GC tem 12 linhas e cabe numa página só, então continua **sem** botões. O Detalhe do
mês passa de 15 linhas nas duas visões (16 gerências e 63 supervisões), e por isso **também foi paginado** — ⚠️ é uma
premissa a confirmar com a Karen, já que a v1.7 cita só Supervisão e Consultor; sem ela, essa aba continuaria com
rolagem interna, que é o que a etapa pediu para eliminar.

**Contagem na foto de 09/11/2026 17:30:** Ranking GC 12 linhas (1 página) · Supervisão Mista 29 (2) · Supervisão
Segmentada 6 (1) · Consultor 218 rotas (15) · Detalhe do mês 16 gerências (2) e 63 supervisões (5). As 63
supervisões são as 48 que a API publica mais as 15 `SV.*.EV` que só existem no `fechado/202610.json` — nada disso
mudou na 4G.

⚠️ **Premissas desta etapa** (a Karen confirma): (a) paginar também o Detalhe do mês; (b) a Supervisão **não** ganhou
linha de total, porque não tinha nenhuma até aqui — "o Total Band fixo no rodapé" foi lido como "a linha de total que
a tela já mostra se repete em todas as páginas", não como uma linha nova; (c) no Consultor em "Todas", o total é o
**Total Band**, e com uma gerência escolhida é a linha daquela gerência da API (`gcApi`), que soma todas as rotas
dela — nenhuma soma nova é feita no painel.

## Etapa 4H — status "Bateu!" com os dois pilares (regras v1.8, seções 2.2, 5 e 7)

> **Substituída em parte pela etapa 4K (v1.11):** o gatilho de volume por média (item 1) virou o
> **mínimo de volume do mês vigente**, e o texto "GATILHO ≥ …" do cabeçalho do Aperitivo (item 6) saiu da tela.
> O resto desta etapa — os dois pilares, a posição oficial e o status — continua valendo.

Decisão da Karen em 09/11/2026 (noite), ao ver um SV com Skyy em 100% e Aperitivo de novembro zerado marcado como
"Bateu!": o status passa a exigir **os dois pilares**. **O ranking não muda** — % Acum., ordem e Pos. saíram idênticos
aos da 4G na mesma cópia de `api/v1` (foto de 09/11/2026 18:45); mudam só a coluna Oficial, o status e a cor da Pos.

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | **Gatilho de volume de Aperitivo:** média simples dos % de novembro e dezembro, mínimo 100% no valor **bruto**, com o % do mês do **ranking** (trava de 130% em novembro; dezembro sem trava); outubro fora; novembro parcial; dezembro só com os dois meses; meta nula ou ≤ 0 → indisponível | `gatilhoVolume` no motor, `REGRAS.gatilhoVolume` |
| 2 | **Dois pilares:** batido só com Skyy **e** volume; indisponível quando falta algum e nenhum falhou com valor | `gatilhoPilares` no motor |
| 3 | **Oficial** numera só quem bateu os dois; quem bateu um só fica sem oficial (Pos. em cinza) e quem está atrás sobe | `numerarOficial` |
| 4 | **Status** "Bateu!" = dois pilares **e** oficial ≤ limite; motivos novos "volume em X%: precisa de 100%", "cobertura em X% e volume em Y%: precisam de 100%", "volume indisponível", "sem meta de volume" (só no motor) | `statusLinha`, `MOTIVOS` |
| 5 | Cada linha de GC agrupada, SV (Mista, Segmentada e fora do ranking), gerência da API e Total Band ganha `gatilhoVolume` e `gatilhoPilares`, sobre os mesmos meses do ranking da linha (na linha agrupada, a soma das gerências) | `montarDados` no adaptador |
| 6 | **Tela:** sem coluna nova. A nota das tabelas conta "com os dois pilares", o rodapé diz "posição em cinza: sem os dois pilares", o título do bloco Aperitivo ganhou "GATILHO ≥ 100,0%" (de `R.gatilhoVolume.minimo`), e a aba Regras descreve os dois pilares, o status e a Oficial | `app.tpl.html` |
| 7 | **Dados e alertas:** aviso da ⚠️ pendência 26 (premissas da v1.8) e, quando novembro ou dezembro de volume faltar, o aviso diz que o gatilho de volume fica indisponível | `alertasDaTela` |

**Contagem na foto de 09/11/2026 18:45** (recálculo independente em Python, igual ao painel): Ranking GC 12 linhas —
0 com Skyy, 0 com volume, 0 com os dois; SV Mista 29 — 1 com Skyy (SV.IT.2), 1 com volume (SV.G2.1), 0 com os dois;
SV Segmentada 6 — 1 com Skyy (SV.AT.2), 0 com volume, 0 com os dois. Nenhuma posição oficial e nenhum "Bateu!" (na 4G
eram 2: SV.IT.2 e SV.AT.2, só com o Skyy).

⚠️ **Pendência 26** (a Karen confirma): (a) em novembro o gatilho de volume é parcial (só novembro); (b) % de volume
nulo (meta nula ou ≤ 0) deixa o gatilho indisponível; (c) a tela não ganha coluna nova para o gatilho de volume; (d) o
texto dos motivos novos — inclusive o de dois pilares indisponíveis ao mesmo tempo, que o painel une com " e "
("cobertura indisponível e volume indisponível").

## Etapa 4I — Detalhe do mês sem paginação na visão Gerência (regras v1.9, seção 7)

Decisão da Karen em 09/11/2026 (fim da noite; pendência 27, resolvida): a 4G paginou também o Detalhe do mês, e na
visão Gerência a página 2 ficava com uma linha só. **Só apresentação: nenhum número muda** — as linhas do Detalhe, célula
a célula, saíram idênticas às da 4H na mesma cópia de `api/v1` (foto de 09/11/2026 18:45), nas duas visões.

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | Visão **Gerência** do Detalhe do mês: todas as linhas e o Total Band numa tela só, **sem botões** | `CONFIG.detalheSemPaginacao: ['gc']` e `paginaDoDetalhe` no adaptador, que chama `fatiar` com o tamanho igual ao total de linhas |
| 2 | Visão **Supervisão** do Detalhe: continua em páginas de `CONFIG.linhasPorPagina` (uma paginação por visão; trocar a visão volta à página 1) | `paginaDoDetalhe` → `fatiar`; `chavePag()` (`det:gc`, `det:sv`) e `voltarPagina1()`, sem mudança |
| 3 | A tela passa a página pronta para `tabelaGrupos` (parâmetro opcional `fatia`); sem ele, o Consultor segue com a página da tela, como na 4G | `app.tpl.html` |
| 4 | **Dados e alertas:** aviso da ⚠️ pendência 28 (texto "GATILHO ≥ …" no título do bloco Aperitivo, em aberto); o texto em si **não** mudou | `alertasDaTela` |
| 5 | `REGRAS.versao = '1.9'` (só a versão: nenhuma regra de cálculo muda no motor) | `motor.js` |

**Linhas e páginas na foto de 09/11/2026 18:45:** Detalhe Gerência 16 + Total Band (1 página, sem botões) · Detalhe
Supervisão em "Todas" 63 (5 páginas) e com uma gerência 2 a 5 (1 página) · Supervisão Mista 29 (2) · Supervisão
Segmentada 6 (1) · Consultor 218 rotas (15) · Ranking GC 12 + Total Band (1, sem botões). Cabe sem rolagem em
~1920×940 e em 1366×768.

## Etapa 4J — só a posição oficial nas tabelas de ranking (regras v1.10, seções 5 e 7)

Decisão da Karen em 10/11/2026: nas tabelas de ranking só a coluna da posição **oficial** deve aparecer, "a que
conta". **Só apresentação: nenhum número, ordem de linha ou status muda** — na mesma cópia de `api/v1` (foto de
10/11/2026 08:15), o Ranking GC e as duas Supervisões saíram, célula a célula, idênticos aos da 4I, com a única
diferença da coluna que saiu e do rótulo "Of." → "OF.".

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | A coluna **"Pos."** sai do cabeçalho e das linhas das duas tabelas de ranking; fica a **"OF."**, com `1º, 2º…` para quem bateu os dois pilares e `—` para os demais | `cabecalhoRanking` e `linhaRanking` em `app.tpl.html` |
| 2 | A identificação passa de 3 para **2 colunas**: `<colgroup><col span="2">`, `colspan="2"` na linha de grupo e na do Total Band | `cabecalhoRanking` e `linhaRanking` |
| 3 | A regra de pintar a posição em **cinza** deixa de existir na tela: saem o CSS dela e a variável de cor que só ela usava | `app.tpl.html` (CSS) |
| 4 | **Rodapé** das abas: "posição em cinza: sem os dois pilares" vira **"OF.: posição oficial, só de quem bateu os dois pilares"** | `$('rodesq')` |
| 5 | **Aba Regras:** o passo "Posição" e o parágrafo da coluna Oficial passam a descrever a coluna única e a ordem do % Acum. | `viewRegras` |
| 6 | **Dados e alertas:** aviso da ⚠️ pendência 29 (nome da coluna e texto do rodapé, em aberto) | `alertasDaTela` |
| 7 | `REGRAS.versao = '1.10'` (só a versão: nenhuma regra de cálculo muda no motor) | `motor.js` |

**O motor não muda.** `numerarRanking` continua dando `pos` a todas as linhas — é ela que ordena o ranking e entra no
motivo do status —, e `numerarOficial` continua entregando a coluna que a tela mostra. A ordem das linhas vem do
adaptador, já ordenada pelo % Acum. de Aperitivo: nenhuma tela reordena nada.

⚠️ **Pendência 29 (Karen):** o nome da coluna ("OF.", como hoje, ou "POS.") e o texto do rodapé. Vale a premissa da
seção 5 das regras, sinalizada em Regras > Dados e alertas.

> **Resolvida na etapa 4K (v1.11):** o nome da coluna é **"RANK"**, e o rodapé passou a "RANK: posição oficial, só de
> quem bateu os dois pilares". O aviso da pendência saiu de Regras > Dados e alertas.

## Etapa 4K — mínimo de volume no mês vigente e coluna RANK (regras v1.11, seções 2.2, 3 e 5)

Decisão da Karen em 10/11/2026: o volume de Aperitivo **não tem gatilho por média**. O "✓ Bateu!" exige o **% de
Aperitivo do mês vigente ≥ 100%**, no valor bruto, **sem média e sem soma**; a soma dos % (out + nov + dez, o
"% Acum.") serve **só para ranquear**, e o único gatilho por média continua sendo o de cobertura de Skyy. Substitui a
seção 2.2 da v1.8 (itens 1 e 6 da etapa 4H).

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | **Mínimo de volume de Aperitivo:** o % do **mês vigente** (o mês de referência da API, nunca o seletor da tela), com o mesmo % do ranking (`percentualMes` + `aplicarTrava`), ≥ 100% no valor **bruto**. Sem média, sem soma e **sem `parcial`**; meta nula ou ≤ 0 → indisponível ("sem meta de volume"); mês vigente sem fonte → "volume indisponível" | `minimoVolume` no motor, no lugar do `gatilhoVolume` da 4H |
| 2 | `REGRAS.gatilhoVolume = {meses, minimo}` vira **`REGRAS.minimoVolume = {minimo: 100}`** (sem meses: não é média), e `REGRAS.versao = '1.11'` | `motor.js` |
| 3 | Os **dois pilares**, a **posição oficial** e o **status** passam a ler `linha.minimoVolume` no lugar de `linha.gatilhoVolume`; a mecânica (batido só com os dois, renumeração, "suba N posições", limites `premiadas`) **não muda** | `gatilhoPilares`, `numerarOficial`, `statusLinha` |
| 4 | Cada linha (GC agrupada, SV dos dois canais e fora do ranking, gerência da API, rota e Total Band) ganha `minimoVolume` no lugar de `gatilhoVolume`, calculado sobre os mesmos meses do ranking da linha | `pilaresDaLinha` em `montarDados` |
| 5 | **Tela:** o cabeçalho da coluna da posição oficial passa a ser **"RANK"** (pendência 29 resolvida); o título do bloco Aperitivo perde o texto "GATILHO ≥ …" e fica "VOLUME DE APERITIVO · RANKING" (pendência 28 resolvida); o rodapé passa a "RANK: posição oficial, só de quem bateu os dois pilares · desempate pela ordem alfabética do código"; a aba Regras descreve o mínimo do mês vigente e diz que a soma só ordena o ranking | `cabecalhoRanking`, `$('rodesq')` e `viewRegras` em `app.tpl.html` |
| 6 | **Dados e alertas:** sai o aviso do "gatilho de volume" (média de nov e dez) e entra o do **mínimo de volume** (⚠️ pendência 26b, a única premissa que sobrou); as pendências **25, 28 e 29**, resolvidas na v1.11, saem da tela; o aviso de mês de volume indisponível só fala do mínimo quando o mês é o **vigente** | `alertasDaTela` |

**O que não mudou:** gatilho de cobertura de Skyy (média de novembro e dezembro, parcial em novembro), % do mês,
trava, soma do ranking (% Acum.), ordem das linhas, desempate, posições premiadas, cores, colunas, paginação e a
regra do quadradinho do Aperitivo.

**Conferência na foto de 10/11/2026 09:00** (recálculo independente em Python, sem importar o motor, sobre uma cópia
de `api/v1`): as 12 linhas do Ranking GC, as 29 da Supervisão Mista e as 6 da Segmentada saíram **idênticas** ao
painel em ordem, % Acum., % Médio, mínimo de volume, RANK e selo. Comparando 4J × 4K: **nenhuma linha mudou de selo
nem de RANK** nas três tabelas (0 "Bateu!" e 0 com RANK antes e depois), porque em **novembro** o gatilho da 4H era
parcial — só novembro — e dá exatamente o mesmo número que o mínimo do mês vigente: os dois valores coincidem nas
47 linhas. A diferença entre as duas regras só aparece em **dezembro**, quando a 4H faria a média de novembro e
dezembro. Os dois pilares seguem separando casos reais: SV.G2.1 bate o volume (130,0% travado) e não o Skyy (32,6%),
e SV.AT.2 bate o Skyy (100,0%) e não o volume (0,0%) — as duas com "-" e sem RANK.

⚠️ **Pendência 26b (Karen):** % de volume nulo (meta nula ou ≤ 0) deixa o mínimo **indisponível**, nunca 0% nem 100%.
Estava sinalizada em Regras > Dados e alertas; desde a etapa 4L (v1.12) ela fica só no documento de regras e no
checklist. As premissas (a), (c) e (d) da pendência 26 e as pendências 24, 25, 28 e 29 foram confirmadas ou
resolvidas na v1.11.

⚠️ **Premissa desta etapa:** "mês vigente" é o mês de referência da API (`mesGatilho` no adaptador: o maior mês da
vigência já alcançado pela referência). Hoje é novembro, e em dezembro será dezembro. As regras não dizem o que fazer
se a referência fosse **outubro** — o painel usaria o % de outubro, pelo mesmo caminho —, e o caso não acontece mais
na vigência de 2026.

## Etapa 4L — sem pendências na aba Regras e % Acum. no Total Band (regras v1.12, seções 7 e 10)

Dois pedidos da Karen em 10/11/2026, os dois de **tela**: (a) **as pendências não aparecem mais no painel** — a
lista "Dados e alertas" da aba Regras fica só com alerta de **dado**, e as premissas a confirmar ficam no documento
de regras (seção 10) e no checklist do PR; (b) a célula **"% Acum." do Total Band**, que mostrava "—", passa a
mostrar a **soma dos % mensais da empresa** (seção 7). Nenhuma regra de cálculo muda, e nenhum número das outras
linhas se mexe.

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | Saem os dois avisos de premissa: **"Meta dia de volume: premissa a confirmar"** (pendência 22) e **"Mínimo de volume: premissa a confirmar"** (pendência 26b), com os comentários que os explicavam | `alertasDaTela` no adaptador |
| 2 | **Continuam** todos os alertas de dado: API indisponível, dados simulados, produtos do Campari não publicados, cobertura de um mês indisponível, mês de volume indisponível, mês em prévia, mês que ainda não começou, supervisão fora do ranking e avisos da carga | `alertasDaTela` |
| 3 | Nenhum texto que chega à tela cita "pendência": o motivo do mês de cobertura fechado passa de "`fechado/AAAAMM.json` não traz cobertura (pendência 10 das regras)" para **"`fechado/AAAAMM.json` não traz cobertura"** — só o fato do dado. O aviso da carga que repete esse motivo acompanha | `montarDados` (bloco da cobertura) |
| 4 | `REGRAS.versao = '1.12'` (só a versão: nenhuma conta muda no motor) e o comentário de `metaDiaVolume` deixa de dizer que a tela sinaliza a premissa | `motor.js` |
| 5 | **% Acum. do Total Band:** a célula deixa de ser "—" e mostra `tabela.aperitivo.soma`, o mesmo campo das outras linhas. A conta é a do motor (`apurarMeses` → `somaRanking`, com a trava do mês) sobre os números da **empresa**: outubro do `fechado/202610.json` (`totais.empresa`) e novembro do `resumo.json` (`empresa.produtos`). **Nada é somado na tela nem no adaptador** — os dois já entregavam o valor, só a tela o escondia | `linhaRanking` em `app.tpl.html` |
| 6 | O Total Band continua **sem RANK** (a identificação segue com `colspan="2"`), com **"sem ranking"** na coluna Status e **fora da ordenação** — a célula do % Acum. também não ganha quadradinho | `linhaRanking` |
| 7 | Documentação: a v1.12 instalada em `docs/regras.md`, e `README.md`, este arquivo e `CLAUDE.md` com as duas mudanças e as contagens de teste | docs |

**O que não mudou:** nada do cálculo. A meta dia de volume continua comparando só o Real (até ontem) com a Meta
(`metaDiaVolume`), e a meta de volume nula ou ≤ 0 continua deixando o mínimo **indisponível**, nunca 0% nem 100%
(`minimoVolume`) — as duas regras seguem cobertas pelos testes do motor. Layout, cores, colunas, paginação, ordem das
linhas, % Acum. e % Médio **das demais linhas**, RANK e selo são idênticos aos da etapa 4K.

**Conferência.** Os testes do adaptador passam a exigir que a lista de alertas **não** cite "pendência" nem
"premissa" em nenhum cenário, e que os alertas de dado continuem aparecendo em todos os casos antes cobertos (API
fora, dados simulados, produtos não publicados, mês de volume sem fonte, cobertura indisponível, mês em prévia, mês
que ainda não começou, supervisão fora do ranking e aviso da carga). Quatro testes novos cobrem o Total Band: o valor
da soma (e que ela é a do motor), a **trava** do mês valendo na empresa, o mês sem % deixando a soma **incompleta** e
a célula da tela. Na tela, a aba Regras mostra a lista sem os dois itens, o Total Band mostra o % Acum. e o resto das
abas é igual célula a célula à da 4K.

**% Acum. do Total Band na foto de 10/11/2026 10:36** (recálculo independente em Python, sem importar o motor, sobre
uma cópia de `api/v1` fora do repositório):

| Mês | Fonte | Meta | Real | Online | % bruto | % travado |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| out | `fechado/202610.json` → `totais.empresa` | 55.060,7 | 48.515,4 | — | 88,1126% | 88,1126% |
| nov | `resumo.json` → `empresa.produtos` | 59.977,2 | 9.664,9 | 715,9 | 17,3079% | 17,3079% |
| dez | mês futuro | — | — | — | — | — |

Soma = **105,420484%**, exibida **105,4%** (truncada em 1 casa), igual ao exemplo da Karen (88,1% + 17,3% = 105,4%)
e igual ao que o painel desenha na linha Total_Band do Ranking GC e da Supervisão.


## Etapa 4M — sem rolagem interna em notebook (regras v1.13, seção 7)

Problema relatado pela Karen em 10/11/2026: no notebook, a página 1 da Supervisão (Mista) **rola ~1 cm por
dentro**. A causa é a escala do palco, não a tabela: o `fit()` usava `min(innerWidth ÷ 1920, innerHeight ÷ 720)` e
dava ao `#stage` a altura lógica `innerHeight ÷ escala`. Em janela mais alta que 16:9 manda a largura e sobra
altura; em janela **mais baixa** que 16:9 (um notebook de 1366×768 com a barra do navegador fica com ~600 de área
útil) a altura lógica caía para 720 e ficava abaixo do que a aba pede — então a `.rolar` (`overflow:auto`) rolava.

**Altura lógica que cada aba pede** (medida no repositório em 10/11/2026, Chrome headless, escala 1, dados da API
publicada: altura lógica do palco + o excesso da área rolável):

| Aba | Altura lógica pedida |
| --- | ---: |
| Ranking GC | 797 |
| Supervisão Mista · pág. 1 | 905 (pág. 2: 873) |
| Supervisão Segmentada | 720 (cabe) |
| Consultor (todas as páginas de 15 linhas) | **925** |
| Detalhe do mês · Gerência | 862 |
| Detalhe do mês · Supervisão | 844 |

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | `CONFIG.palco = { largura: 1920, alturaBase: 930 }` — os dois números do palco em configuração, nunca na tela | `adapter.js` |
| 2 | `escalaDoPalco(largura, altura, cfg)`, pura: devolve `{ escala, largura, altura }`, com `escala = min(largura ÷ palco.largura, altura ÷ palco.alturaBase)` e o tamanho lógico já dividido. Janela sem medida (0, negativa, não numérica) devolve escala 1 no palco inteiro, sem divisão por zero | `adapter.js` |
| 3 | O `fit()` passa a ser `const p = escalaDoPalco(innerWidth, innerHeight)` e só aplica `--s`, largura e altura. **Nenhum número solto na tela** | `app.tpl.html` |
| 4 | `REGRAS.versao = '1.13'` (só a versão: nada muda no motor) | `motor.js` |
| 5 | Documentação: a v1.13 em `docs/regras.md` (com a pendência 30: confirmar o 930), e `README.md`, este arquivo e `CLAUDE.md` | docs |

**Por que 930 e não 920.** O enunciado da etapa estimava 908 para a aba mais alta (Consultor); a medição no
repositório deu **925**, então 920 ainda deixaria 5 px de rolagem. Para cima há um teto: a escala em janela com
altura folgada não pode mudar, e na janela maximizada de 1920×**940** a escala só continua 1 enquanto a altura-base
é ≤ 940. 930 fica entre os dois (folga de 5 px sobre o Consultor e de 10 px até o teto) — e está registrado como
⚠️ pendência 30 das regras, para a Karen confirmar.

**O que não mudou:** altura de linha, fonte, cores, colunas, rótulos, paginação (15 linhas por página),
`CONFIG.detalheSemPaginacao` e a posição das vistas (`top:198px; bottom:48px`). As tabelas das quatro abas saem
**idênticas célula a célula** às da 4L.

**Conferência (Chrome headless, cópia de `api/v1` e de `ajustes.json` fora do repositório).** Em cada janela,
percorrendo todas as abas, os dois canais da Supervisão, todas as páginas do Consultor e da Supervisão e as duas
visões do Detalhe, medindo `scrollHeight − clientHeight` de **todo** elemento rolável — excesso em px, 0 = sem
rolagem:

| Janela | Ranking GC | Superv. Mista | Superv. Segm. | Consultor | Det. Gerência | Det. Supervisão |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920×940 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 1920×800 | 0 → 0 | **105 → 0** | 0 → 0 | **125 → 0** | **62 → 0** | **44 → 0** |
| 1536×730 | 0 → 0 | 0 → 0 | 0 → 0 | **12 → 0** | 0 → 0 | 0 → 0 |
| 1536×640 | 0 → 0 | **105 → 0** | 0 → 0 | **125 → 0** | **62 → 0** | **44 → 0** |
| 1366×768 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 1366×625 | 0 → 0 | **27 → 0** | 0 → 0 | **47 → 0** | 0 → 0 | 0 → 0 |
| 1366×600 | 0 → 0 | **62 → 0** | 0 → 0 | **82 → 0** | **19 → 0** | 0 → 0 |
| 1280×720 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 1280×560 | 0 → 0 | **65 → 0** | 0 → 0 | **85 → 0** | **22 → 0** | **4 → 0** |

(antes → depois; rodapé e paginação visíveis em todas elas, e o console sem erro e sem aviso.)

**A exceção conhecida:** a lista "Dados e alertas" da aba **Regras** (`.al`) é uma lista de tamanho variável e
continua podendo rolar por dentro — como já rolava antes da 4M, inclusive em 1920×940. Com a altura-base nova ela
rola **menos** (ex.: 1366×600: 161 px antes, 55 px depois). Está registrado na seção 7 das regras.

**Escala antes e depois**, nas janelas do checklist: 1920×1080 → 1,0 e 1,0; 1920×940 → 1,0 e 1,0;
1366×768 → 0,7115 e 0,7115; 1280×720 → 0,6667 e 0,6667 (nessas quatro manda a largura, então nada muda).
Nas janelas baixas a escala diminui, que é o efeito desejado: 1366×600 → 0,7115 antes e **0,6452** depois;
1280×560 → 0,6667 antes e **0,6022** depois.

## Etapa 4N — RANK em todas as linhas e linha azul no "Bateu!" (regras v1.14, seções 5 e 7)

Decisão da Karen em 10/11/2026 (meio-dia): usar nas tabelas de ranking do Campari o **conceito do ranking do
Desafio Q4** — todas as linhas numeradas e a **linha inteira pintada** quando bate. Isso **reverte a exibição** da
etapa 4J/4K (só a posição oficial, com "—" para quem não bateu os dois pilares); o **cálculo fica igual**.

| # | O que mudou | Onde |
| --- | --- | --- |
| 1 | A coluna **RANK** passa a mostrar `l.pos` (a posição do ranking, do motor) em **todas** as linhas das duas tabelas, em todas as páginas — o número é o da ordem **global**, não o da página. O Total Band continua sem número (identificação com `colspan="2"`) | `linhaRanking` |
| 2 | A linha com **"✓ Bateu!"** recebe a classe `.bateu` e fica **azul de ponta a ponta**. O teste é o mesmo do selo (`bateuStatus`, que lê `motor.STATUS.bateu`), e a linha de total nunca recebe a classe | `linhaRanking`, CSS |
| 3 | **Terceiro selo:** `statusLinha` devolve `"Bateu, fora do ranking"` quando os **dois pilares** estão batidos e a **posição oficial** passou do limite de premiadas — onde antes devolvia `"-"`. O motivo (`"suba N posições"`) e os limites não mudam. Os três textos ficam em `motor.STATUS` | `motor.js` |
| 4 | Na tela, esse selo é a tag `.pill.fora`, em **âmbar**; ela **não pinta a linha** | `statusCel`, CSS |
| 5 | **Rodapé** das duas tabelas: "RANK: posição no ranking (% Acum. de Aperitivo) · linha azul: ✓ Bateu! (dois pilares e dentro das premiadas) · desempate pela ordem alfabética do código". A aba **Regras** descreve a coluna RANK nova e ganha o terceiro selo | `$('rodesq')`, `viewRegras` |
| 6 | `REGRAS.versao = '1.14'` | `motor.js` |
| 7 | Documentação: a v1.14 em `docs/regras.md`, e `README.md`, este arquivo e `CLAUDE.md` | docs |

**As cores** (variáveis nomeadas, nenhum valor solto):

| Variável | Valor | Por quê |
| --- | --- | --- |
| `--rk-bateu` | `#114084` | o `--blue` do Q4 (`#1D7BFF`) a 40% sobre o painel, escrito **opaco**: a cor tem de cobrir o `<colgroup>` dos dois blocos (num `rgba()` o laranja do Aperitivo e o azul do Skyy apareceriam por baixo e a linha ficaria de duas cores). Medido na tela: branco **9,9:1**, Dif. negativa **5,9:1**, número da RANK **6,4:1** |
| `--pct-ok-op` `--pct-no-op` `--hoje-ok-op` | `#104439` `#3D1D36` `#113F4F` | os quadradinhos verde/vermelho e o "Hoje" turquesa são semitransparentes e mudariam de matiz sobre o azul; estes são os **mesmos tons já achatados sobre o painel**, então na linha azul eles ficam iguais aos das outras linhas (9,7:1, 9,8:1 e 7,7:1) |
| `--pill-fora-bg` / `--pill-fora-fg` | `#4A3500` / `#FFE29A` | o âmbar do `.pill.bat` do Desafio Q4 (**9,2:1**), diferente do azul da linha, do turquesa do "✓ Bateu!" e do cinza do "-" |

> ⚠️ O enunciado desta etapa pede "o azul da linha que bateu a meta" do Desafio Q4. **No Q4 essa linha é verde**
> (`.trow.tot{background:rgba(34,177,76,.14)}`) e o **âmbar** (`.trow.bat`) é justamente o estado "bateu os
> gatilhos, fora das premiadas". Como o documento de regras v1.14 diz **azul** em todas as menções, a linha ficou
> azul e só a **tag** veio do âmbar do Q4.

**O que não mudou:** a ordem das linhas (% Acum. de Aperitivo, desempate pelo código), `pos`, `oficial`,
`gatilhoPilares`, os limites de premiadas (GC 6 · SV Mista 12 · SV Segmentada 3), os motivos do status, as colunas,
a paginação (15 linhas), a escala do palco e as demais abas.

**Conferência (Playwright + Chromium, cópias de `api/v1` e de `ajustes.json` fora do repositório).**

1. **4M × 4N, célula a célula, com os dados reais da API** (1920×940, todas as abas e páginas): as **únicas**
   diferenças estão na coluna RANK, que passou de "—" a número em todas as linhas — **111 células**, nenhuma
   outra célula e **nenhuma classe de linha** mudou (hoje ninguém bate os dois pilares, então nenhuma linha ficou
   azul). Ordem das linhas idêntica.
2. **Rolagem interna** (a 4M não pode regredir): em **9 janelas** — 1920×940, 1920×800, 1536×730, 1536×640,
   1366×768, 1366×625, 1366×600, 1280×720 e 1280×560 — percorrendo as sete vistas (Ranking GC, Supervisão Mista e
   Segmentada, Consultor, Detalhe nas duas visões e Regras) e **todas as páginas**, medindo
   `scrollHeight − clientHeight` e `scrollWidth − clientWidth` de todo elemento rolável: **0 em tudo** (a lista
   "Dados e alertas" da aba Regras segue como exceção conhecida). **Nenhum erro ou aviso no console.**
3. **Os três estados, com dados simulados** (a API real não tem ninguém com os dois pilares): uma cópia da API com
   o Aperitivo e a cobertura de Skyy inflados. No Ranking GC, as 12 linhas saíram **6 azuis com "✓ Bateu!"
   (exatamente o limite), 3 com a tag "Bateu, fora do ranking" (RANK 7º a 9º, linha sem cor) e 3 com "-"**; na
   Supervisão, 12 azuis na Mista (limite 12) e 3 na Segmentada (limite 3). A linha azul mede
   `rgb(17,64,132)` tanto na primeira célula do bloco Aperitivo quanto na do Skyy — uma cor só, de ponta a ponta —,
   e a linha da tag fica com o fundo dos blocos, sem pintura. Com a tag (o texto mais longo da coluna Status) não
   houve rolagem horizontal nem vertical em 1920×940 nem em 1366×768.
4. **Páginas:** na página 2 da Supervisão Mista o RANK segue a ordem global (16º a 29º), e ali aparece o caso da
   premissa das regras — RANK 17º e 18º com a tag enquanto o 16º está em "-", porque o limite vale para a posição
   **oficial**, que conta só quem bateu os dois pilares.
5. **Recálculo independente** (Python, sem importar o motor nem o adaptador, a partir da cópia de `api/v1`):
   refazendo o % de cada mês com a trava, a soma, a ordem, a posição, a posição oficial e o selo das **12 linhas
   do Ranking GC**, nos dois cenários (dados reais e simulado): **0 divergências** contra o que a tela mostrou
   (RANK, código, % Acum., selo e a presença da linha azul).

