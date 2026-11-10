# CLAUDE.md — guia do repositório

Instruções para qualquer sessão do Claude Code neste projeto. Leia também `README.md`, `API.md`,
`painel-q4/README.md` e, para as regras do incentivo, `painel-q4/docs/Desafio-Q4_Contexto-Regras.md`. Para o painel
Campari Club: `painel-campari/README.md` e `painel-campari/docs/regras.md`.

## 1. O que é este projeto

API de **meta x realizado de volume** da Comercial Bandeirantes, alimentada pelo **SAP Datasphere** (OData) e
publicada como JSONs estáticos no GitHub Pages, mais o **painel Desafio Q4**, que lê essa API no mesmo site.

- A API cobre 6 produtos de volume (Sucos, Powerade, Sabores, Retornáveis, Individuais e Refrigerantes) nos
  níveis cliente, rota, supervisão, gerência e empresa, com a **cobertura** (clientes que compraram: meta, realizado e
  online de hoje) em cada produto. Contrato em `API.md`.
- `missoes.json` traz o realizado das **Missões Guiadas** (modelo `AM_FAT_BND_GM_PROGRESSO_TAREFA`), por missão e por
  rota, sem filtro de data e sem meta. O modelo tem dados pessoais (CPF, telefone, endereço): só as colunas de
  `mapeamento.ColMissao` vão no `$select`. Os painéis ainda não leem esse arquivo.
- O painel Desafio Q4 (`frontend/desafio-q4.html`) acompanha o incentivo do trimestre: pontos por pilar,
  gatilhos, confrontos entre supervisores e ranking.
- O painel **Campari Club** (`frontend/campari-club.html`, fontes em `painel-campari/`) acompanha o incentivo de
  out–dez/2026: dois pilares (gatilho de cobertura de Skyy e mínimo de volume de Aperitivo) e ranking por volume de
  aperitivo (agrupadores extras `Aperitivo` e `Skyy` da API). É independente do Desafio Q4 (nada importado de lá).
  Regras v1.13 (10/11/2026). **Etapa 4: a tela**, nas
  cinco abas do mockup aprovado em 08/11/2026 (Ranking GC · Supervisão · Consultor · Detalhe do mês · Regras), em
  cima da Etapa 3 (gatilho de cobertura de Skyy, posição oficial, status "Bateu!" e meta dia de cobertura) e da
  Etapa 2 (% do mês de volume, trava 130% out/nov, soma, ordem e posição). A **Etapa 4B** (regras v1.6, seções 5 e 7)
  ajustou só a apresentação das duas tabelas de ranking, a **Etapa 4C** (seção 4) trocou o Ranking GC para a
  gerência comercial agrupada (12 linhas) e pôs o bloco Aperitivo no laranja do SAC, e a **Etapa 4F** (regras v1.7,
  seção 7) fez os ajustes de tabela: centralização, coluna Dez só em dezembro, rótulos "% Acum." e "% Médio",
  quadradinho no % do mês vigente do Aperitivo, números do Aperitivo na fonte da tabela, linha do total só com
  "Total Band" e as cores do ranking também no Consultor e no Detalhe do mês. A **Etapa 4G** (regras v1.7, seção 7)
  trocou a rolagem por **navegação por páginas** (15 linhas) na Supervisão, no Consultor e no Detalhe do mês, e abriu
  o Consultor com todas as rotas. A **Etapa 4H** (regras v1.8, seções 2, 5 e 7) fez o "Bateu!" e a coluna da posição
  oficial exigirem os **dois pilares** (gatilho de Skyy **e** volume de Aperitivo); o ranking não mudou. A **Etapa 4I**
  (regras v1.9, seção 7) tirou a paginação da visão **Gerência** do Detalhe do mês (16 linhas e o Total Band numa tela
  só); a paginação fica na Supervisão, no Consultor e na visão Supervisão do Detalhe. A **Etapa 4J** (regras v1.10,
  seções 5 e 7) deixou nas duas tabelas de ranking **só a coluna da posição oficial**: a coluna "Pos." e a
  regra de pintá-la em cinza saíram da tela, sem mudar número, ordem nem status. A **Etapa 4K** (regras v1.11,
  seções 2.2, 3 e 5) trocou o gatilho de volume por um **mínimo de volume** — o % de Aperitivo do **mês vigente**
  ≥ 100%, sem média e sem soma, com a soma dos meses servindo só para ranquear —, deu à coluna da posição oficial o
  cabeçalho **"RANK"** e tirou o "GATILHO ≥ …" do cabeçalho do bloco Aperitivo. A **Etapa 4L** (regras v1.12,
  seção 10) tirou as **pendências da tela**: a lista "Dados e alertas" da aba Regras ficou só com alerta de dado, e
  as premissas a confirmar ficam no documento de regras e no checklist do PR; na mesma etapa (seção 7) o
  **% Acum. do Total Band** deixou de ser "—" e passou a mostrar a soma dos % mensais da empresa. Nenhum cálculo
  novo: a soma já vinha do motor. A **Etapa 4M** (regras v1.13, seção 7) acertou a **escala da tela** para
  **nenhuma aba rolar por dentro em notebook**: o `fit()` ganhou uma **altura-base** (930) e a conta saiu da tela
  para `escalaDoPalco` (adaptador, pura), com os dois números em `CONFIG.palco`; em janela com altura folgada a
  escala é a mesma de antes. Só escala: nenhum número, cor, coluna ou paginação muda.
  A tela **não calcula nada**: lê o que o motor e o adaptador entregam. Toda regra só em `painel-campari/src/motor.js`.
  O canal das rotas e do SV é uma **cópia** do Q4 (funções de `painel-q4/src/adapter.js` e `painel-campari/data/data.json`,
  foto de 09/11/2026 da base embutida, regerada por `painel-campari/scripts/copiar_canais.py`): mudou a base de canais do
  Q4, rode o script e o build do Campari.
- **Quem usa:** o Back Office e a equipe comercial (gerências, supervisores e consultores); o painel é feito
  para tela de PC e para print. Donos do repositório: Matheus (API e back-end) e Karen (painel).
- Os dados se atualizam sozinhos: um workflow roda o gerador a cada 15 min em dias úteis e comita em `api/`.

## 2. Mapa do repositório

| Pasta / arquivo | O que é | Quem altera |
|---|---|---|
| `api/v1/` | a API publicada (JSONs) | **só o gerador**, comitado pelo Actions. Nunca à mão |
| `api/v1/fechado/` | um JSON por mês fechado (meta e realizado por rota + totais por gerência e empresa), base do acumulado do trimestre | **só o gerador**; selado quando o Back Office marca o flash, nunca apagado |
| `backend/gerador/` | consultas, contas e montagem dos JSONs | pessoas (PR) |
| `backend/odata/` | cliente OData, copiado do projeto da TI | pessoas (PR), replicando a TI |
| `backend/scripts/gerar.py` | gera a API | — |
| `backend/scripts/servir.py` | sobe o site local como no Pages | — |
| `backend/scripts/diagnosticar_real.py` | compara o Real da API com o Real do SAC; só leitura | pessoas (PR) |
| `backend/scripts/reabrir_fechado.py` | volta um mês fechado de oficial para prévia (ajuste único) | pessoas (PR) |
| `backend/tests/` | testes do back-end, sem rede | pessoas (PR) |
| `painel-q4/src/` | `motor.js` (cálculo), `adapter.js` (API→motor, `CONFIG`, consulta do fechamento e gerador de `.xlsx`), `app.tpl.html` (tela) | pessoas (PR) |
| `painel-q4/data/data.json` | base embutida: canal de cada rota e plano B sem API | `painel-q4/scripts/preparar_dados.py` |
| `painel-q4/docs/` | **fonte de verdade das regras do incentivo** | pessoas (PR) |
| `painel-q4/tests/` | testes do motor e do adaptador | pessoas (PR) |
| `frontend/desafio-q4.html` | painel pronto | **gerado** por `painel-q4/scripts/build.py` |
| `painel-campari/src/` | `motor.js` (cálculo: % do mês, trava, soma do grupo (`somarGrupo`), soma, ordem, posição, gatilho de cobertura, mínimo de volume (`minimoVolume`), dois pilares (`gatilhoPilares`), posição oficial, status, meta dia de cobertura, exibição da meta dia de volume e cor do quadradinho do % (`corDoPercentual`)), `adapter.js` (`CONFIG` (com `gruposGC`), `localizarProdutos`, `carregarDados`, `fontesDosMeses`, `fontesDaCobertura`, `coberturaDoFechado`, `gruposDoRankingGC`, `tabelaDaLinha`, `montarDados`, `carregarRanking`, mais a formatação e os recortes da tela: `fmtVolume`, `fmtCobertura`, `fmtPct`, `mesesDoSeletor`, `valoresDoMes`, `filtrosDoPainel`, `rotasDaMesa`, `rotasDoConsultor`, `fatiar`, `linhasDoDetalhe`, `alertasDaTela`, `escalaDoPalco` (escala do palco, com `CONFIG.palco`); canal copiado do Q4), `app.tpl.html` (tela, cinco abas) | pessoas (PR) |
| `painel-campari/src/assets/` | `fonts.json` (só Barlow Condensed 800) e `campari-fundo.jpg` (arte do palco), embutidos pelo build | pessoas (PR) |
| `painel-campari/data/data.json` | canal de cada rota: foto da base embutida do Q4 | `painel-campari/scripts/copiar_canais.py` |
| `painel-campari/docs/regras.md` | **fonte de verdade das regras do Campari Club** | pessoas (PR) |
| `painel-campari/tests/` | testes do motor e do adaptador do Campari Club | pessoas (PR) |
| `frontend/campari-club.html` | painel Campari Club pronto | **gerado** por `painel-campari/scripts/build.py` |
| `frontend/ajustes.json` | ajustes do admin (pilares, canais, confrontos, agrupadores, flash de vendas fechado) | só por **PR** do botão da Administração |
| `.github/workflows/` | `atualizar-dados.yml`, `deploy-pages.yml`, `testes.yml` | pessoas (PR) |

Hoje a API tem 16 gerências e 247 rotas; 201 delas têm canal na base embutida e entram nas abas do
incentivo (Rota, Supervisão, Ranking, Detalhe, Confrontos). A aba Estratégicos é a exceção: ela mostra a
gerência inteira, somando os totais da API (`gerencias/{GC}.json` e `resumo.json`), que incluem todas as
rotas com Real.

## 3. Comandos (todos verificados nesta máquina)

```bash
# testes do painel — 158 testes (42 do motor, 116 do adaptador); precisa de Node 18+
node --test painel-q4/tests/motor.test.js painel-q4/tests/adapter.test.js

# testes do painel Campari Club — 244 testes (75 do motor, 169 do adaptador)
node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js

# testes do back-end — 123 testes, sem rede (Datasphere falso e simulado)
cd backend && python -m unittest discover -s tests -t .

# Real do Total Band da API x Real do SAC (só leitura; relatório em saida/descoberta/)
cd backend && python scripts/diagnosticar_real.py                # API publicada x último SAC informado
cd backend && python scripts/diagnosticar_real.py --sac sac.json # outra leitura do SAC (formato no script)
cd backend && python scripts/diagnosticar_real.py --datasphere   # + consulta direta ao modelo (precisa de .env)

# regera frontend/desafio-q4.html a partir de painel-q4/src e painel-q4/data
python painel-q4/scripts/build.py

# regera frontend/campari-club.html a partir de painel-campari/src e painel-campari/data
# (embute a fonte Barlow Condensed 800 e o campari-fundo.jpg; sem a imagem, cai para o azul sólido e avisa)
python painel-campari/scripts/build.py

# site local, montado como no Pages (frontend/ na raiz, api/ em /api)
cd backend && python scripts/servir.py            # http://localhost:8000/desafio-q4.html (e /campari-club.html)
cd backend && python scripts/servir.py --porta 8011
```

O gerador (`cd backend` antes). **Sempre com `--saida` para fora do repositório** quando for teste.
Abaixo, `FORA` é uma pasta temporária fora do repositório, em **caminho absoluto**: os comandos rodam de
`backend/`, então um `--saida ../alguma-coisa` cai dentro do próprio repositório.

```bash
# dados fictícios, sem tocar no Datasphere
python scripts/gerar.py --simulado --saida "$FORA/sim" --forcar

# simula a data (fechamento de mês, virada, dias úteis)
python scripts/gerar.py --simulado --hoje 2026-11-03 --saida "$FORA/sim" --forcar

# uma rota só, com dados reais (precisa de backend/.env); grava o cache das respostas
python scripts/gerar.py --rota 111 --gravar-cache "$FORA/cache" --saida "$FORA/r111" --forcar

# repete a partir do cache, sem rede e em segundos
python scripts/gerar.py --rota 111 --replay "$FORA/cache" --saida "$FORA/r111" --forcar
```

Detalhes que o `--help` não deixa óbvios:

- `--saida` tem precedência sobre a pasta que o `--rota` escolheria (`backend/saida/rota_<ROTA>/`).
- `--rota` filtra só a consulta **real**; com `--simulado` ele apenas muda a pasta de destino.
- `--replay` exige um cache gravado antes por `--gravar-cache` (que faz a consulta real).
- `--forcar` ignora a janela de horário (padrão 07:00–18:59 de Brasília); sem ele, fora da janela nada acontece.
- Saída: `0` ok, `1` erro de execução, `2` dados reprovados na validação (nada é gravado).
- `--base-dia ARQ` (o workflow usa `saida/base_dia/base.json`, no cache do Actions): depois da 1ª carga completa do dia,
  as rodadas consultam só o Online (`gerador/base_dia.py`); Real mudou, base de outro dia ou ilegível, fechamento do
  mês: carga completa. `--completa` força a carga completa e grava a base nova (push do `ajustes.json` e
  execução manual com "Carga completa" marcado; a manual sem a marca, que é a do robô que dispara o workflow a cada
  15 min porque o agendamento do GitHub falha, é incremental como a agendada). Não vale com `--rota` nem `--simulado`. Na rodada incremental os meses em prévia não são
  consultados de novo (só mudam de um dia para o outro).

## 4. Fluxo de uma mudança

1. `git fetch origin` e `git status`. Árvore suja? Pare e pergunte antes de qualquer coisa.
2. Branch a partir de `origin/main`.
3. Edite `painel-q4/src/` ou `painel-q4/data/` (ou `painel-campari/src/`).
4. Rode `python painel-q4/scripts/build.py` e **comite o `frontend/desafio-q4.html` gerado junto** (Campari Club:
   `python painel-campari/scripts/build.py` e `frontend/campari-club.html`).
   O build é determinístico: sem mudança na fonte, o HTML sai idêntico ao commitado.
5. Rode os dois conjuntos de testes.
6. Abra o PR **em rascunho**; marque pronto só com os testes passando e a branch atualizada com a main.

## 5. Regras que não mudam

A fonte de verdade é `painel-q4/docs/Desafio-Q4_Contexto-Regras.md` (v3.6, 05/11/2026). Itens marcados ⚠️ lá são
interpretações a confirmar: sinalize no painel, **não decida sozinho**. Em resumo:

- **Motor único:** pontos, gatilhos, confrontos, status e ranking são calculados só em `painel-q4/src/motor.js`.
  Nenhuma fórmula nova fora dele.
- **Faixas 90 / 100 / 105** com limites de 5 casas decimais, calculadas **sem arredondar**; na tela o %
  é **truncado**, nunca arredondado (99,96% não pode virar "100,0%").
- **Pilares nunca fixos no código:** vêm de `CONFIG.pilaresConfig` e dos ajustes do admin. Pilares de volume
  são todos, menos Missões Guiadas.
- **Missões Guiadas:** em outubro entra validada em 100% (3 pontos); em novembro e dezembro passa a ter
  meta, real e online.
- **Gatilho de volume:** % da categoria Refrigerantes ≥ 95% (consultor: mês; SV: acumulado do trimestre).
  **Gatilho de pontos:** SV 60 acumulados no trimestre; consultor **17** no mês (zera todo mês) — decisão da
  gerência de planejamento e da IM em 29/10/2026, no documento de regras desde a v3.6. O 17 é o **padrão do motor**
  (`REGRAS.gatilhoPontos: { SV: 60, RT: 17 }`, desde 05/11/2026): a regra em vigor não depende mais do
  `ajustes.json`, que antes era o único lugar com o 17 — arquivo ilegível fazia o painel voltar a 20 em silêncio.
  O `ajustes.json` publicado ainda traz `gatilhoPontos.RT: 17`, agora redundante, e serve para mudanças futuras.
  O valor vem de `REGRAS.gatilhoPontos` + ajustes: nunca fixo em lógica ou
  texto (na tela, `R.gatilhoPontos`; um teste varre o template atrás de 17, 20 e 60 fixos).
- **Os pontos sempre aparecem.** Só status, posição oficial e premiação dependem dos gatilhos (26/10).
  Todas as linhas são numeradas; a posição oficial é só de quem bate os dois gatilhos (27/10).
- **Canal × segmento (28/10; Mini e Mod confirmados em 30/10; no documento de regras v3.6, seção 1):** o motor só vê o canal (Mista, Segmentada ou sem
  canal). O segmento é etiqueta: Segmentada → Mini ou Mod; sem canal → Neutraliza, Eventual, Coke Net ou Virtual; Mista
  não tem. Mini e Mod são o mesmo canal (pilares, ranking, premiação e confronto). Rota sem ajuste fica como na base.
- **Canal do SV (29/10, ⚠️ pendência 7 do documento de regras):** cada SV aparece em **um canal só**: o do admin (`ajustes.json` → `canaisSV`) ou, sem
  ajuste, o da maioria das rotas da mesa; empate fica fora do ranking, com aviso, até o admin escolher. O SV soma
  **todas** as rotas da mesa que têm canal, dos dois canais, medidas nos pilares do canal dele (`aplicarCanalSV` no
  adaptador); cada rota continua no ranking do canal dela. As rotas **sem canal** ainda ficam fora dessa soma: a
  decisão de 30/10 de incluí-las está no documento de regras (seção 1 e pendência 9) e ainda não foi implementada.
- **Confrontos:** só entre SVs do mesmo canal, em pilar de volume, no máximo 1 desafio recebido por SV.
  O SV vencedor leva +5; quem perde não perde pontos. **As rotas da mesa não recebem o +5 (03/11/2026, informada pela
  Karen; substitui o "+5 para toda a mesa"; no documento de regras v3.6, seção 5):** no motor, rota tem
  `confrontoVencido`, `pontosConfronto` e `bonusPendente` sempre false/0, e o `conferir` acusa `RT_COM_BONUS_CONFRONTO`.
  **O +5 só entra depois do fechamento do mês (30/10/2026):** nos pontos acumulados do SV. No mês aberto o motor
  devolve o vencedor parcial e o bônus em `bonusPendente` (fora de pontos, gatilho, status e ranking), e a tela mostra
  "vencendo · +5 pts no fechamento". O mês conta como fechado já no período de fechamento da API
  (`entrada.fechamento`, de `meta.fechamento`); os meses anteriores do trimestre, sempre.
  **Em prévia o +5 é provisório (05/11/2026, informada pela Karen; documento de regras v3.6, seções 5 e 8):** ele entra
  no dia 1 do mês seguinte e é reapurado a cada rodada, com os números do momento, até o Back Office marcar o flash —
  aí o mês sela e o resultado do confronto congela. É o que o código já faz: `mesFechado` no motor vale para todo mês
  anterior ao de referência, e o gerador regrava os meses em prévia (`fechado.em_previa` + `fechado.regravar`).
  Desempate (confronto e ranking): maior % de Refrigerantes.
- **Fechamento oficial só depois do flash de vendas (04/11/2026, informada pela Karen; ⚠️ item 6 das pendências do
  documento de regras):** o mês fechado fica em **prévia** (números ainda mudam, acumulado do SV marcado como provisório)
  até o Back Office marcar, no painel, que o flash daquele mês fechou; só então o resultado congela. Nunca sele por data
  no código. Detalhe na seção 7.
- **Medidas:** Real = até ontem, Online = hoje, Diferença = Real + Online − Meta, % = (Real + Online) ÷ Meta.
  `meta_dia` vem pronta da API — **não recalcule**.
- **Real e Online iguais ao SAC (03/11/2026, decisão da Karen; a partir de novembro/26):** o gerador lê o Real e o Online
  pela chave da meta, como a story do SAC: mês, agrupador e **rota da meta** (`*_Chave_Meta_SAP`), não a rota do
  cliente. Venda sem chave de meta (mês `210012`, agrupador `--`) fica fora, as rotas `-EV` somem, e o Real de um produto
  só aparece depois que a meta dele é carregada. Outubro e antes seguem pela chave do faturamento (`M.real_pela_meta`,
  `M.REAL_PELA_META_DESDE`). A META_NEG do cliente continua pela rota do cliente.
- **Contrato da API estável:** os campos de `api/v1` descritos em `API.md` não mudam de forma.
- Orçamento, custo dos prêmios e valores de premiação ficam **fora** do painel e do repositório.
  Os **volumes** dos estratégicos têm aba própria, sem pontos e sem premiação (documento de regras v3.6, seção 1: a
  redação antiga "fora do escopo do painel" foi corrigida nessa versão).

### Campari Club (fonte de verdade: `painel-campari/docs/regras.md`, v1.13 de 10/11/2026)

- **Motor único, como no Q4:** % do mês, trava, soma, ordem, posição, gatilho, mínimo de volume, posição oficial,
  status e meta dia de cobertura só em `painel-campari/src/motor.js`. O adaptador lê a API e entrega; a tela só lê o resultado.
- **Gatilho de Skyy:** cobertura de **Skyy**, média simples dos % de **novembro e dezembro**, mínimo **100%** no valor bruto
  (99,99999% não bate; a tela trunca, o cálculo não arredonda). Outubro nunca entra. Em novembro o gatilho é
  **parcial** (só novembro). `REGRAS.gatilho = { meses: [11, 12], minimo: 100 }`; na linha, `gatilho` (é o "% Médio").
- **Mínimo de volume de Aperitivo (v1.11, seção 2.2; etapa 4K, que substitui o gatilho por média da 4H):** o % de
  Aperitivo do **mês vigente** — o mês de referência da API (`mesGatilho`), **nunca** o escolhido no seletor da tela —,
  no mesmo % do ranking (`percentualMes` + `aplicarTrava`: 130% em outubro e novembro, dezembro sem trava), tem de
  chegar a **100%** no valor bruto (99,99999% não bate). **Não é média nem soma:** a soma dos % (out + nov + dez) é só
  a pontuação do ranking. Sem `parcial`. Mês vigente sem fonte dá **indisponível** ("volume indisponível"); meta nula
  ou ≤ 0 dá **indisponível** ("sem meta de volume"), nunca 0 nem 100. `REGRAS.minimoVolume = { minimo: 100 }` (sem
  `meses`), função `minimoVolume`; na linha, `minimoVolume`. Na linha agrupada do Ranking GC o % é o da soma das
  gerências (como no ranking).
- **Dois pilares (`gatilhoPilares`, etapas 4H e 4K):** junta os dois em `{ batido, indisponivel, motivo }` — batido só
  com os dois batidos; indisponível quando falta algum e nenhum falhou com valor. Na linha, `gatilhoPilares`. É ele que
  decide a coluna RANK e o "Bateu!" (`numerarOficial` e `statusLinha` leem `gatilho` + `minimoVolume`).
- **% de cobertura** = (realizado + online_hoje) ÷ meta, bruto; `online_hoje` null conta 0. Meta de cobertura null ou
  ≤ 0 dá % **null** (nunca 0 nem 100), com o motivo "sem meta de cobertura". Os blocos `cobertura` de supervisão e
  gerência da API entram **como estão** (meta só das rotas com meta; realizado e online de todas as rotas) — decisão
  de 08/11/2026, nunca recalcular a soma.
- **Fonte da cobertura é diferente da do volume (premissa P1):** o mês de referência vem dos blocos `cobertura` da API
  **inclusive no período de fechamento** da API, quando o volume já vem do `fechado/`. Mês anterior vem do
  `fechado/AAAAMM.json`, que **ainda não traz cobertura** (pendência 10 das regras; o Matheus define o campo até
  01/12/2026): até lá o mês fica "cobertura indisponível", sem gatilho e sem posição oficial, com aviso. A porta única
  disso é `coberturaDoFechado` no adaptador — nunca adivinhe o nome nem o formato do campo novo. Em dezembro isso vale
  para novembro, então o gatilho de dezembro depende dessa pendência.
- **Posições premiadas** (só para decidir o status, nunca para mostrar prêmio): `REGRAS.premiadas = { gc: 6,
  svMista: 12, svSegmentada: 3 }`, padrão do motor como o `gatilhoPontos` do Q4 — a regra em vigor não depende de
  arquivo que pode faltar. Nada fixo em lógica nem em texto. **Prêmios não aparecem em lugar nenhum do painel.**
- **Status (v1.11):** "Bateu!" só com os **dois pilares** batidos (gatilho de Skyy **e** mínimo de volume de
  Aperitivo) **e** posição
  oficial ≤ limite do nível; qualquer outro caso "-". Motivos exatos, só no motor (`MOTIVOS` + `gatilhoPilares` +
  `statusLinha`): "dentro das premiadas", "cobertura em X%: precisa de 100%", "volume em X%: precisa de 100%",
  "cobertura em X% e volume em Y%: precisam de 100%" (X e Y truncados em 1 casa), "suba N posições" ("suba 1 posição"
  no singular), "cobertura indisponível", "sem meta de cobertura", "volume indisponível" e "sem meta de volume" (os dois
  indisponíveis: unidos por " e "). **Desde a v1.6 (09/11/2026) o motivo não aparece na tela:** a coluna Status das
  tabelas de ranking mostra só o selo, e o motivo continua calculado no motor. **Desde a v1.10 (10/11/2026) a tela
  mostra só a posição oficial:** a coluna **"RANK"** (nome decidido na v1.11) numera quem bateu **os dois pilares** e
  mostra "—" para os demais, a coluna "Pos." saiu das duas tabelas (com a regra de pintá-la em cinza) e as linhas
  continuam ordenadas pelo % Acum. de Aperitivo — o motor segue calculando `pos` em todas elas, que ordena o ranking e
  entra no motivo do status. ⚠️ Pendência 26b (meta de volume nula deixa o mínimo indisponível) é a única premissa que
  sobrou; as pendências 24, 25, 28 e 29 foram resolvidas na v1.11.
- **Pendência não vai para a tela (v1.12, seção 10; etapa 4L, decisão da Karen de 10/11/2026):** a lista
  "Dados e alertas" da aba Regras (`alertasDaTela`) tem **só alerta de dado** — API indisponível, dados simulados,
  produtos não publicados, cobertura ou volume de um mês indisponível, mês em prévia, mês que ainda não começou,
  supervisão fora do ranking e avisos da carga. Nenhum texto dela cita "pendência" nem "premissa" (nem o motivo do
  mês de cobertura fechado, que diz só "não traz cobertura"), e há teste varrendo a lista. As premissas a confirmar
  ficam na seção 10 das regras e no checklist do PR; o cálculo delas **não muda** (meta dia de volume só com o Real;
  meta de volume nula deixa o mínimo indisponível). Alerta novo: só de dado, e sempre em `alertasDaTela`.
- **Meta dia de cobertura** (calculada no painel, ao contrário da de volume): (Meta − Real) ÷
  `calendario.dias_uteis_restantes`, com o Real até ontem; **travada** (não desconta o Online, não muda durante o dia).
  Real ≥ Meta dá 0; 0 dias restantes dá a diferença total; exibida como **inteiro arredondado para cima** (cliente não
  se divide), com tolerância de 1e-9. A meta dia de **volume** vem pronta da API e **não se recalcula**.
- **Exibição da meta dia (v1.4, 09/11/2026; pendência 15 resolvida):** a meta dia de **volume** mostra **0** quando o
  Real passou da Meta e **0** quando a API publica valor negativo (ela publica: em 09/11/2026 havia 7 blocos
  negativos, iguais aos do SAC); não numérica (API em fechamento) vira "—". Isso é **exibição**, e mesmo assim mora no
  motor (`metaDiaVolume`), nunca na tela; o adaptador guarda o valor de origem em `metaDia` e o exibido em
  `metaDiaExib`, e o "Hoje" colorido compara com o **exibido**. A comparação usa só o Real (sem o Online) — premissa
  em aberto (pendência 22), registrada só no documento de regras e no checklist desde a v1.12.
- **"Hoje" colorido:** Online > 0 **e** Online ≥ Meta dia (`hojeAtingiu` no motor; pendência 17, confirmada em
  08/11/2026). Meta dia 0 com Online > 0 colore; meta dia nula (API em fechamento) não colore.
- **Consultor (rota)** aparece sem ranking, sem gatilho e sem status, e a aba lista **só as rotas `tipo: "normal"`**
  (decisão da Karen, 09/11/2026): `neutraliza` e `virtual` ficam fora da lista mas continuam somando no SV, então a
  linha "Total da mesa" pode ser maior que a soma das linhas visíveis — a tela conta quantas ficaram fora
  (`rotasDaMesa` + `textoDasOcultas`). **Total Band** (`resumo.json` → `empresa`) tem os
  números e o acumulado de cobertura, mas não tem posição oficial nem status (a empresa não tem apuração própria).
  Na tela a linha mostra só **"Total Band"** (o "· Diretoria e GP" saiu na etapa 4F) e, desde a **etapa 4L**
  (regras v1.12, seção 7; pedido da Karen de 10/11/2026), a célula **"% Acum." do Aperitivo** mostra a **soma dos %
  mensais da empresa** no lugar de "—": o mesmo `tabela.aperitivo.soma` das outras linhas, calculado pelo motor
  (`apurarMeses` → `somaRanking`, com a trava do mês) sobre os números da empresa — nunca a média nem a soma dos %
  das gerências (⚠️ premissa da seção 7), e nada somado na tela. Mês sem % deixa a soma **incompleta**, como nas
  linhas. O Total Band continua **sem RANK, sem status e fora da ordenação**.
- **A tela (Etapa 4, mockup de 08/11/2026):** cinco abas — Ranking GC · Supervisão (uma tela só, Mista ⇄ Segmentada) ·
  Consultor · Detalhe do mês · Regras. Palco de 1920 px com o `fit()` do Q4 (copiado, não importado), que desde a
  etapa 4M pede a escala ao adaptador (`escalaDoPalco`, pura: `min(largura ÷ 1920, altura ÷ altura-base)`, com
  `CONFIG.palco = { largura: 1920, alturaBase: 930 }`) — **nenhum número de escala na tela**. Abas em
  `top:148px`, vistas em `top:198px / bottom:48px`, rodapé em `bottom:10px`. As tabelas de ranking têm **18 colunas**
  em outubro e novembro e **20 em dezembro** (a coluna Dez e o "% Nov"; etapa 4F — uma a menos desde a 4J, que tirou
  a "Pos."; a que sobrou tem o cabeçalho "RANK" desde a 4K), cabem **sem rolagem horizontal**, com corpo de 14 px, cabeçalho de 13 px e linhas de 3 px de
  respiro (`.tb.rk`, etapa 4B) — nenhum texto abaixo de 13 px no palco. Com
  isso as 12 linhas agrupadas e o Total Band cabem no Ranking GC **sem rolagem** em ~1920×940 e em 1366×768; desde a
  etapa 4G as listas longas (Supervisão, Consultor e a visão Supervisão do Detalhe) são paginadas de 15 em 15, a visão
  Gerência do Detalhe cabe inteira (etapa 4I), e **nenhuma aba rola**. A **altura-base de 930** (etapa 4M, regras
  v1.13, seção 7; ⚠️ pendência 30) é o que garante isso também em janela mais baixa que 16:9 — a altura-base de 720
  deixava a Supervisão e o Consultor rolando ~1 cm no notebook. A medição de 10/11/2026 (escala 1) deu, por aba:
  Ranking GC 797 · Supervisão Mista 905 · Consultor 925 (o maior) · Detalhe Gerência 862 · Detalhe Supervisão 844;
  acima de 940 a janela maximizada (1920×940) começaria a encolher, então a altura-base fica entre 925 e 940. A
  lista "Dados e alertas" da aba Regras (`.al`, tamanho variável) é a exceção conhecida: pode rolar, e já rolava. O seletor "Mês de referência" vale no Ranking GC **e** na
  Supervisão, troca só Meta, Real, Dif e o % do mês, e mês sem dado fica desabilitado (`mesesDoSeletor`). O **mês
  vigente** é outra coisa: é o mês de referência da API (`mesesDoSeletor(...).referencia`), e é ele — nunca a escolha
  do seletor — que decide as colunas que só existem em dezembro e em qual coluna fica o quadradinho do Aperitivo.
  O conteúdo de todas as tabelas é **centralizado**, inclusive a coluna de identificação (etapa 4F).
  **Nenhum número de regra é digitado na tela** (gatilho, trava e posições premiadas saem de `motor.REGRAS`) e
  **nenhum prêmio aparece em lugar nenhum** — há testes varrendo o template e o HTML gerado.
- **Ajustes visuais das tabelas de ranking (Etapa 4B, v1.6, seções 5 e 7; decisão de 09/11/2026):** só apresentação,
  no Ranking GC e na Supervisão. Status só com o selo; **sem legenda** e sem o aviso "N fora do ranking" nessas duas
  telas (o aviso continua em `alertasDaTela` → Regras > Dados e alertas); blocos coloridos no padrão do Q4 —
  Aperitivo laranja e Skyy azul, título em tom escuro e células em tom bem claro, pelo `<colgroup>`; **Dif. negativa
  em vermelho** (`--negv`, o vermelho do Q4) nas quatro abas que mostram Dif., e o laranja fica só no `.tv` (o % real
  antes da trava); **quadradinho verde/vermelho** no "% do mês" e no "% Acum." de Skyy, pela função pura
  `corDoPercentual` do motor (verde com o valor **bruto** ≥ `REGRAS.gatilho.minimo`; `null` sem valor não desenha
  nada) — Aperitivo não tem quadradinho; fonte das duas tabelas 1 px menor (`.tb.rk`, corpo de 14 px), nada abaixo de
  13 px. Os valores de cor são **copiados** do `painel-q4/src/app.tpl.html` (o Campari não importa nada do Q4).
- **Gerência comercial agrupada do Ranking GC (v1.6, seção 4 e pendência 24; etapa 4C):** o Ranking GC tem **12
  linhas** no lugar das 16 gerências da API. Quem soma com quem está em `CONFIG.gruposGC` do adaptador (`G1`, `G2`,
  `G3`, `AP`, `AT`, `AN`, `RV` e `SL` sozinhas; `UR_RI`, `IT_MO`, `PA_DI` e `GU_PO` com duas), nunca fixo na lógica:
  gerência publicada fora do mapa vira linha própria, com aviso. A linha **soma** meta, real, online e meta dia das
  gerências do grupo (`motor.somarGrupo`) e só depois calcula — o % é o da soma, **nunca a média dos %** —, e trava,
  soma do ranking, gatilho, posição, posição oficial e status são as mesmas funções do motor. Mês que falta em alguma
  gerência do grupo deixa o mês indisponível e a linha incompleta. **`dados.gc` são as linhas agrupadas (com ranking) e
  `dados.gcApi` as 16 gerências da API (sem ranking)**, usadas pelo filtro de gerência e pelo Detalhe do mês, que não
  mudaram. Premissas ⚠️ a confirmar com a Karen: "Bateu!" nas 6 primeiras entre 12 linhas, e a M. Dia de volume do
  grupo como soma das metas dia publicadas.
- **Cor dos dois blocos (etapas 4C a 4F, 09/11/2026):** **Aperitivo** — `--ap-tit` é o laranja do SAC (`#E07B41`),
  no título do bloco e nos cabeçalhos das colunas, com texto escuro (`--ap-tit-fg`, porque branco sobre esse laranja
  dá 2,97:1); o **corpo** é `--ap-cel`, o mesmo laranja **a 18%** (escolha da Karen entre cinco tons medidos):
  `rgb(46,44,57)` na tela, branco 13,7:1 e Dif. negativa 8,1:1. Nesse tom o corpo quase não tem cor — o laranja do
  bloco vive no título e nos cabeçalhos. **Skyy** — `--sk-tit` é o azul escuro `#061C4D`, também nos cabeçalhos das
  colunas (`hd-sk`), com texto claro `--sk-tit-fg` (14,1:1); o corpo segue em `rgba(29,123,255,.20)`.
  **Mês travado mostra só o limite** (decisão da Karen de 09/11/2026, no PR da etapa 4D, onde o item foi chamado de
  "etapa 4F"): o % real do mês, que aparecia em laranja ao lado (`.tv`), saiu da tela; o motor continua devolvendo
  `pct` e `travado` e o `.tv` e o `--laranja` saíram do CSS. A v1.7 do documento de regras já não descreve aquele
  número.
  **Comentário de CSS mal fechado apaga a cor em silêncio** (aconteceu em 09/11/2026 com o bloco Skyy): há um teste
  que varre o CSS do template e do HTML gerado atrás de comentário sem par e de chave desbalanceada.
- **Ajustes de tabela (etapa 4F, v1.7, seção 7; decisão de 09/11/2026):** só apresentação e rótulos — nenhum número
  muda. Conteúdo **centralizado** em todas as tabelas das quatro abas, inclusive a coluna de identificação (a regra
  `text-align:left` do `.l` saiu; a classe ficou só como marca da coluna). A coluna **Dez** do Aperitivo só existe
  quando o mês vigente é dezembro (`mesesAp`, de `R.meses`), com `colspan` e `<colgroup>` acompanhando. Rótulos:
  "Soma" → **"% Acum."** no Aperitivo e "% Acum." → **"% Médio"** no Skyy (só texto de tela: os campos `soma` e
  `acumulado` do motor não mudam, e o gatilho continua sendo a média simples de novembro e dezembro). Os números do
  Aperitivo saem da condensada grande (`.n` / `.n.g`, que saiu do CSS) e ficam na fonte da tabela. **Quadradinho do
  % de Aperitivo** só na coluna do mês vigente, pela função pura `corDoPercentualAperitivo(valor, mes)` do motor —
  regra **diferente** da de cobertura: o limite é o da **trava do mês** e, no mês sem trava, o
  `REGRAS.corAperitivoSemTrava` (pendência 25, confirmada na v1.11); o "% Acum." e as colunas dos
  outros meses não têm quadradinho. O Consultor e o Detalhe do mês passam a usar as mesmas cores e os mesmos
  quadradinhos das tabelas de ranking, pelas classes que já existiam (nenhum CSS novo).
- **Navegação por páginas (etapa 4G, v1.7, seção 7; decisão de 09/11/2026):** só apresentação — **15 linhas por
  página** (`CONFIG.linhasPorPagina`) na Supervisão (uma paginação por canal), no Consultor e na visão Supervisão do
  Detalhe, com
  os botões `‹ 1 2 ›` no rodapé da tabela (atual em vermelho, setas desabilitadas nos extremos, nenhum botão quando
  cabe numa página só) e **sem rolagem** dentro de nenhuma aba. A conta é a função pura `fatiar` do adaptador; a
  linha de total fica **fora** da contagem e se repete em todas as páginas. O **Consultor abre em "Todas"**
  (`rotasDoConsultor`, que também dá o rótulo do total: Total Band, da gerência ou da mesa). Trocar aba, canal, mês
  ou filtro volta à página 1; a página não é lembrada ao recarregar. O Ranking GC (12 linhas) cabe numa página e
  continua sem botões. **Detalhe do mês (etapa 4I, v1.9, seção 7; pendência 27 resolvida em 09/11/2026):** a visão
  **Gerência não é paginada** — 16 linhas e o Total Band numa tela só, sem botões — e a visão Supervisão continua em
  páginas de 15 (uma paginação por visão: `det:gc` e `det:sv`; trocar a visão volta à página 1). Quem escolhe é a
  função pura `paginaDoDetalhe` do adaptador, que só decide o tamanho e chama `fatiar`; as visões sem paginação ficam
  em `CONFIG.detalheSemPaginacao` (`['gc']`), nunca na tela. A visão Supervisão do Detalhe **não** tem linha de total
  (como desde a 4G). A pendência 28 (texto "GATILHO ≥ …" no título do bloco Aperitivo) foi resolvida na v1.11:
  o texto saiu do cabeçalho na etapa 4K.
- **Desempate** (confronto nenhum aqui, só ranking): ordem alfabética do código em minúsculas, texto simples
  (`sv.g2.10` antes de `sv.g2.2`).
- **Privacidade na tela e no PR:** só códigos de rota, SV e gerência; nunca nome de vendedor, supervisor ou cliente.

## 6. Armadilhas

- **A main anda sozinha.** O workflow "Atualizar dados" comita em `api/` a cada 15 min, de segunda a sexta,
  das 07h às 18h45 (Brasília). Antes de marcar um PR como pronto, `git fetch` e atualize a branch.
- **`api/v1/` não se edita à mão** e saídas locais do gerador nunca são comitadas.
- **O botão "Atualizar dados" do `servir.py` grava em `api/`.** O `POST /atualizar` roda `gerar.py --forcar`
  sem `--saida`, ou seja, no destino padrão, que é a pasta publicada. É a forma mais fácil de sujar a árvore
  com 200+ JSONs sem perceber. O mesmo vale para `gerar.py` rodado sem `--saida`.
- **O id do SV leva o canal do SV** (`svKey`: "Sv. An.1#Mista"). Ajuste que muda o canal do SV (escolha do admin ou
  nova maioria das rotas) faz o confronto cadastrado com o id antigo não valer: a tela mostra "canal ajustado" (`confrontoInvalidadoPorAjuste`), sem apagar.
- **`frontend/ajustes.json` só entra por PR** (botão "Publicar no GitHub (PR)" da Administração). Ele não
  existe no repositório enquanto ninguém publicou ajustes, e o painel registra um 404 dele no console —
  é esperado e inofensivo.
- **`frontend/ajustes.json` tem de ser UM único objeto JSON.** Em 29/10/2026 ele ficou com dois e três objetos
  seguidos (texto colado depois do antigo, no editor do GitHub) e o painel ignorou o arquivo em silêncio. Hoje,
  ilegível (ou HTTP ≠ 200/404), nenhum ajuste publicado vale e o painel mostra uma **faixa vermelha** em todas as abas;
  valor inválido dentro de um arquivo válido vira **faixa amarela** e aviso em Regras > Dados e alertas.
- **Precedência dos ajustes (29/10/2026):** padrão < `ajustes.json` publicado < navegador, **item a item**
  (`carregarAjustes` no adaptador). O navegador (`localStorage["q4_ajustes"]`, formato 2) guarda **só o que difere do
  publicado**; ao abrir, o que ficou igual ao publicado sai sozinho. Para limpar o navegador: Regras > Administração >
  "Descartar todos os do navegador (usar o publicado)", ou apagar a chave `q4_ajustes` do localStorage do site.
- **Administração em tópicos (05/11/2026, etapa 15):** cabeçalho fixo (título, "Publicado: <data>", chip das alterações
  para publicar, que abre a lista, e os botões `adm-salvar`, `adm-publicar`, `adm-baixar`, `adm-descartar`, `adm-sair`),
  "Como publicar?" recolhido, e seis abas: Resumo · Confrontos · Pilares do mês · Canal das rotas · Pontuação e regras ·
  Fechamento do mês (flash de vendas + consulta). Todos os tópicos ficam no DOM e só o ativo aparece: um campo de outro
  tópico continua valendo no `lerAjustes`. Contagens e estados (Resumo, selos, mês dos confrontos, resultado do
  confronto, pilares do mês, pendências de canal) saem de funções puras do adaptador (`estadoMesApi`,
  `estadoPilaresMes`, `estadoMesesFechados`, `contagensCanal`, `pendenciasCanais`, `estadoMesConfrontos`,
  `resultadoConfrontoAdmin`, `pilaresDoTopico`, `contagemPorTopico`); o resultado do confronto é o do motor
  (`RES.confrontos`). Confrontos: mês anterior ao de referência (ou o de referência no período de fechamento da API) é
  **só leitura**; mês corrente e futuro aceitam cadastro só com os 5 pilares configurados.
  **Canal das rotas em lista empilhada (06/11/2026, etapa 21):** todos os SVs, um bloco por SV (código, nome da API,
  canal do SV e as rotas), com rolagem dentro da lista (`ajustarListaCanais`); a busca filtra a lista (`listaCanais` no
  adaptador). Texto explicativo de todo tópico fica recolhido (`sobre(...)`, fechado por padrão); avisos e alertas
  nunca entram nele.
- **A senha do admin existe só como hash** (SHA-256) dentro do HTML. Ela evita mudança por engano; não é
  proteção forte e nunca deve ser escrita em texto claro em lugar nenhum.
- **`.env` nunca é versionado** (já está no `.gitignore`). Nunca imprima credenciais. Se a autenticação no
  Datasphere falhar, pare e avise em vez de tentar contornar.
- **Dados de clientes e de pessoas** estão nos JSONs da API (nomes e códigos de clientes, nomes de vendedores
  e supervisores). Não os copie para fora do repositório, para issues, PRs ou capturas de tela.
- Use fixtures sintéticas, com nomes fictícios, em todo teste novo.
- **Fonte e fundo do Campari:** o `painel-campari/src/assets/fonts.json` tem **só Barlow Condensed 800** (~28 KB);
  onde o mockup pedia os pesos 600 e 700, o painel usa o 800. O fundo é `src/assets/campari-fundo.jpg`, embutido em
  base64 pelo build (`center top / 1920px auto no-repeat` sobre `#02306B`): a arte traz logo, letreiro e faixa de
  meses nos primeiros ~148 px, e **nada é desenhado por cima deles**. Sem o arquivo, o build cai para o azul sólido e
  avisa — o painel continua funcionando. A imagem de 09/11/2026 veio em 1568 × 777 e é ampliada para 1920 (pendência
  23). Trocar a arte: grave o `.jpg` novo, rode o build e comite **imagem e HTML gerado** juntos.
- **Fontes:** o painel usa Inter (`--ff`) em todas as telas, sem baixar nada. Só entram no HTML as fontes da lista `manter`
  do `painel-q4/scripts/build.py` (base64 de `painel-q4/src/assets/fonts.json`): Anton 400 e Barlow 800 itálico do letreiro
  e Barlow Condensed 800 dos números da aba Confrontos (`--cf-num`). Nunca carregue fonte de site externo; fonte nova entra
  no `fonts.json` (woff2, subset latino, licença livre) e na lista `manter`. Cada peso custa uns 28 KB no HTML.
- **Layout de tela (feito para print):** o palco tem 1920 px de largura e a altura da janela (`fit()`); o cabeçalho é
  compacto (logo, letreiro e dados numa faixa; abas e filtros em `top:102px`) e as abas ficam em `.view` (top 150, bottom
  48). Confira sempre na **janela maximizada do navegador** (~1920×940) e em 1366×768, não só em 1920×1080 de tela cheia.
  Cabeçalho, rodapé e `.panel` são comuns a todas as abas: mude-os só em PR próprio. A aba Confrontos
  (cartões de duelo) tem de caber sem rolagem com 17 confrontos (legenda no rodapé); a distribuição, as contagens e o estado de cada
  confronto vêm de funções puras do adaptador (`distribuirConfrontos`, `resumoConfrontos`, `estadoConfronto`,
  `larguraBarra`, `lugarEtiquetas`), e o CSS dela fica todo sob `#v-confrontos` e classes `cf*`. Detalhes no
  `painel-q4/README.md`.

## 7. Virada de mês

- O mês de referência vem da API (`index.json` → `mes_referencia.anomes`); não há mais `CONFIG.mes`. `CONFIG.ano`
  é o ano do trimestre. Mês sem os **5 pilares** em `CONFIG.pilaresConfig` (lista vazia ou só os pilares 1 a 3;
  `pilaresDoMes` devolve null): o painel mostra "Pilares de <mês> ainda não configurados" e não calcula pontos nem
  ranking; como mês fechado, ele deixa o acumulado do SV "incompleto". Nunca calcula com parte dos pilares. API fora do
  ar: base embutida só no mês dela, rotulada "base embutida (outubro)"; em outro mês, aviso e nada calculado. Nunca
  mostrar um mês como se fosse outro.
- **Pilares de novembro e dezembro (29/10/2026):** os pilares 1 a 3 do Back Office estão no `CONFIG` (Mista: Sabores,
  Retornáveis, Missões Guiadas; Segmentada: Sabores, Refri Single, Powerade; "Volume Individuais" = Refri Single).
  **Novembro já tem os 5:** os coringas 4 e 5 são os mesmos de outubro (Mista: Sucos e Powerade; Segmentada: Sucos e
  Missões Guiadas), decisão informada pela Karen em 04/11/2026. Os **coringas 4 e 5 de dezembro ainda não foram
  decididos**: quando forem, acrescente-os na entrada do mês (os dois canais), rode o `build.py` e comite o HTML
  gerado. Os coringas do admin (`ajustes.json` → `pilares`, sem mês) só **trocam** os 4 e 5 do mês de referência
  quando ele já tem os 5 no `CONFIG`; nunca completam um mês sozinhos.
- **Missões Guiadas** deixa de ser validada em 100% a partir de novembro: passa a ter meta, real e online. A fonte
  por rota ainda não foi definida; quando for, entra em `CONFIG.fonteDoPilar['Missões Guiadas']` (+ `produtoDaApi`).
  Sem fonte, o pilar aparece "sem dados" e não pontua — em novembro, portanto, o teto do mês vem dos 4 pilares de
  volume do canal (20 pontos), nunca de 100% assumido.
- **Acumulado do SV:** o adaptador lê os meses fechados do trimestre (`index.json` → `fechados`), cada mês é
  calculado com os pilares e os confrontos dele, e o motor recebe todos os meses até o vigente. Mês fechado ausente
  ou com falha: aviso, acumulado "incompleto" (`mesesIncompletos` na entrada do motor) e SV sem posição oficial.
- O que depende de fechamento de meses: os pontos acumulados do SV (gatilho de 60 no trimestre) somam os
  meses fechados mais o mês corrente. A própria API tem período de fechamento — do 1º dia do mês até o fim
  do 1º dia útil ela mostra o mês anterior, com `mes_referencia.fechamento = true` e `tendencia`,
  `meta_dia` e `online_hoje` nulos. Teste esse período com `--simulado --hoje` (o simulado entra em fechamento
  do dia 1 até o fim do 1º dia útil, pelos dias úteis locais).
- **Snapshot do mês fechado** (`backend/gerador/fechado.py`): em cada rodada do fechamento o gerador grava
  `api/v1/fechado/AAAAMM.json` (meta e realizado por rota e produto + `totais` por gerência e da empresa,
  `fechamento_final: false`). `index.json` → `fechados` lista esses arquivos, com `oficial_em` e `fonte_selo`. A
  limpeza de `saida.gravar_api` não toca `fechado/` (`saida.PRESERVADAS`). Formato em `API.md`.
- **Prévia × oficial: o selo vem do flash de vendas (04/11/2026, informada pela Karen; a regra está na seção 8 do
  documento de regras v3.6, com o prazo da marcação em aberto na pendência 6; a mecânica do selo descrita abaixo é
  implementação e fica fora daquele documento):** o fechamento oficial do incentivo é depois do fechamento do **flash
  de vendas** (em torno do dia 12), porque até lá notas fiscais são canceladas e retornadas. Enquanto
  `fechamento_final` é false, o mês está em **prévia** e cada
  rodada o consulta de novo e regrava (`fechado.em_previa` + `fechado.regravar`, no máximo os 3 meses mais recentes;
  `fontes.carregar(..., ref=...)` consulta um mês encerrado). O selo (`fechamento_final: true`, `oficial_em`,
  `fonte_selo: "flash"`) sai **só** quando o Back Office marca o mês no botão da Administração, que grava
  `frontend/ajustes.json` → `flashFechado: {"202610": {"fechado": true, "em": "..."}}`, o PR é mesclado e a rodada
  seguinte lê a marca (`fechado.flash_dos_ajustes`). **Nunca sele por data nem por dia fixo no código, nem por conta
  própria.** Ajustes ilegíveis: nada é selado e a rodada registra o aviso. Reabrir um mês já oficial é um passo à parte:
  `cd backend && python scripts/reabrir_fechado.py --anomes AAAAMM --confirmar`, e o arquivo vai para o GitHub por PR
  (é a única situação em que um arquivo de `api/v1/` entra num commit de pessoa).
  No painel, mês em prévia deixa o acumulado do trimestre do SV marcado como **provisório** (Supervisão, Ranking, rodapé
  e Regras > Dados e alertas); o rótulo sai de `estadoFechado` no adaptador e **nenhuma regra de cálculo muda**.
- **Consulta do fechamento (04/11/2026),** no tópico "Fechamento do mês" de Regras > Administração: só leitura, em cima dos meses que o painel
  já carregou (`dados.fechados`). `consultaFechamento` no adaptador recorta os dados no mês escolhido (`dadosDoFechado`:
  o mês vira o "corrente", com `fechamento: true`, e os anteriores seguem no acumulado), chama `montarEntrada` e o
  **motor** — nenhuma conta nova — e `tabelaFechamento` monta as três visões (Consultor, Supervisão e Estratégicos) numa
  definição só, usada pela tela e pela planilha. Estratégicos sai dos `totais` do snapshot; sem eles, a visão diz
  "indisponível" e **não** soma rotas. Mês sem os 5 pilares não apura nada. A exportação é um `.xlsx` gerado no próprio
  navegador (`planilhaXlsx`: ZIP "stored" + XML, sem biblioteca externa), com as abas Contexto, Consultores, Supervisões
  e Estratégicos e **todas** as linhas — os filtros da tela não recortam o arquivo. Na planilha, volume é número com 1
  casa e o % é o **truncado** do motor com formato de 1 casa (o formato nunca pode arredondar o que a regra trunca).

## 8. Checklist antes do PR

1. `git fetch origin` e branch atualizada com a `main`.
2. `python painel-q4/scripts/build.py` e `python painel-campari/scripts/build.py` rodados, e `git diff --stat` mostra só a
   mudança esperada.
3. `node --test painel-q4/tests/motor.test.js painel-q4/tests/adapter.test.js` — 158 passando; e
   `node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js` — 244 passando.
4. `cd backend && python -m unittest discover -s tests -t .` — 123 passando.
5. Painel aberto (`servir.py`) sem erro novo no console.
6. O diff **não** contém `api/v1/` nem `frontend/ajustes.json`.
7. Nenhum `.env`, dado gerado localmente ou segredo no diff.
8. PR em rascunho, com resumo, testes rodados e resultado, conferência, o que não pôde ser testado e pendências.

## 9. Declare a máquina no começo da sessão

Verifique se existe `backend/.env` e diga em qual caso está:

- **Com `.env` (máquina da empresa):** pode consultar o Datasphere, sempre com `--saida` para uma pasta
  **fora** do repositório. Nunca use o destino padrão. Se a autenticação falhar, pare e avise.
- **Sem `.env` (Claude Code na web):** não tente acessar o Datasphere nem peça credenciais. Use a API já
  publicada (`git show origin/main:api/v1/<arquivo>`) copiada para uma pasta temporária fora do repositório,
  e `gerar.py --simulado [--hoje AAAA-MM-DD] --saida <fora do repositório>` para simular.

Em ambos os casos: capturas de tela só se o ambiente permitir e salvas fora do repositório; nunca grave em
`api/` nem em `frontend/ajustes.json`.
