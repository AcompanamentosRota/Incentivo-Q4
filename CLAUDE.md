# CLAUDE.md — guia do repositório

Instruções para qualquer sessão do Claude Code neste projeto. Leia também `README.md`, `API.md`,
`painel-q4/README.md` e, para as regras do incentivo, `painel-q4/docs/Desafio-Q4_Contexto-Regras.md`.

## 1. O que é este projeto

API de **meta x realizado de volume** da Comercial Bandeirantes, alimentada pelo **SAP Datasphere** (OData) e
publicada como JSONs estáticos no GitHub Pages, mais o **painel Desafio Q4**, que lê essa API no mesmo site.

- A API cobre 6 produtos de volume (Sucos, Powerade, Sabores, Retornáveis, Individuais e Refrigerantes) nos
  níveis cliente, rota, supervisão, gerência e empresa. Contrato em `API.md`.
- O painel Desafio Q4 (`frontend/desafio-q4.html`) acompanha o incentivo do trimestre: pontos por pilar,
  gatilhos, confrontos entre supervisores e ranking.
- **Quem usa:** o Back Office e a equipe comercial (gerências, supervisores e consultores); o painel é feito
  para tela de PC e para print. A Karen é a dona do repositório.
- Os dados se atualizam sozinhos: um workflow roda o gerador a cada 15 min em dias úteis e comita em `api/`.

## 2. Mapa do repositório

| Pasta / arquivo | O que é | Quem altera |
|---|---|---|
| `api/v1/` | a API publicada (JSONs) | **só o gerador**, comitado pelo Actions. Nunca à mão |
| `api/v1/fechado/` | um JSON por mês fechado (meta e realizado por rota), base do acumulado do trimestre | **só o gerador**; selado na virada, nunca apagado |
| `backend/gerador/` | consultas, contas e montagem dos JSONs | pessoas (PR) |
| `backend/odata/` | cliente OData, copiado do projeto da TI | pessoas (PR), replicando a TI |
| `backend/scripts/gerar.py` | gera a API | — |
| `backend/scripts/servir.py` | sobe o site local como no Pages | — |
| `backend/tests/` | testes do back-end, sem rede | pessoas (PR) |
| `painel-q4/src/` | `motor.js` (cálculo), `adapter.js` (API→motor, `CONFIG`), `app.tpl.html` (tela) | pessoas (PR) |
| `painel-q4/data/data.json` | base embutida: canal de cada rota e plano B sem API | `painel-q4/scripts/preparar_dados.py` |
| `painel-q4/docs/` | **fonte de verdade das regras do incentivo** | pessoas (PR) |
| `painel-q4/tests/` | testes do motor e do adaptador | pessoas (PR) |
| `frontend/desafio-q4.html` | painel pronto | **gerado** por `painel-q4/scripts/build.py` |
| `frontend/ajustes.json` | ajustes do admin (pilares, canais, confrontos, agrupadores) | só por **PR** do botão da Administração |
| `.github/workflows/` | `atualizar-dados.yml`, `deploy-pages.yml`, `testes.yml` | pessoas (PR) |

Hoje a API tem 16 gerências e 247 rotas; 201 delas têm canal na base embutida e entram nas abas do
incentivo (Rota, Supervisão, Ranking, Detalhe, Confrontos). A aba Estratégicos é a exceção: ela mostra a
gerência inteira, somando os totais da API (`gerencias/{GC}.json` e `resumo.json`), que incluem todas as
rotas com Real.

## 3. Comandos (todos verificados nesta máquina)

```bash
# testes do painel — 110 testes (36 do motor, 74 do adaptador); precisa de Node 18+
node --test painel-q4/tests/motor.test.js painel-q4/tests/adapter.test.js

# testes do back-end — 38 testes, sem rede (Datasphere falso e simulado)
cd backend && python -m unittest discover -s tests -t .

# regera frontend/desafio-q4.html a partir de painel-q4/src e painel-q4/data
python painel-q4/scripts/build.py

# site local, montado como no Pages (frontend/ na raiz, api/ em /api)
cd backend && python scripts/servir.py            # http://localhost:8000/desafio-q4.html
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

## 4. Fluxo de uma mudança

1. `git fetch origin` e `git status`. Árvore suja? Pare e pergunte antes de qualquer coisa.
2. Branch a partir de `origin/main`.
3. Edite `painel-q4/src/` ou `painel-q4/data/`.
4. Rode `python painel-q4/scripts/build.py` e **comite o `frontend/desafio-q4.html` gerado junto**.
   O build é determinístico: sem mudança na fonte, o HTML sai idêntico ao commitado.
5. Rode os dois conjuntos de testes.
6. Abra o PR **em rascunho**; marque pronto só com os testes passando e a branch atualizada com a main.

## 5. Regras que não mudam

A fonte de verdade é `painel-q4/docs/Desafio-Q4_Contexto-Regras.md` (v3.2, 30/10/2026). Itens marcados ⚠️ lá são
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
  **Gatilho de pontos:** SV 60 acumulados no trimestre; consultor no mês (zera todo mês), hoje **17** pelo
  `ajustes.json` (decisão da Karen em 29/10/2026, a confirmar com o Back Office; o padrão do motor continua 20 e o
  documento de regras v3.1 ainda diz 20). O valor vem de `REGRAS.gatilhoPontos` + ajustes: nunca fixo em lógica ou
  texto (na tela, `R.gatilhoPontos`; um teste varre o template atrás de 17, 20 e 60 fixos).
- **Os pontos sempre aparecem.** Só status, posição oficial e premiação dependem dos gatilhos (26/10).
  Todas as linhas são numeradas; a posição oficial é só de quem bate os dois gatilhos (27/10).
- **Canal × segmento (28/10, ⚠️ ainda fora do documento de regras):** o motor só vê o canal (Mista, Segmentada ou sem
  canal). O segmento é etiqueta: Segmentada → Mini ou Mod; sem canal → Neutraliza, Eventual, Coke Net ou Virtual; Mista
  não tem. Mini e Mod são o mesmo canal (pilares, ranking, premiação e confronto). Rota sem ajuste fica como na base.
- **Canal do SV (29/10, ⚠️):** cada SV aparece em **um canal só**: o do admin (`ajustes.json` → `canaisSV`) ou, sem
  ajuste, o da maioria das rotas da mesa; empate fica fora do ranking, com aviso, até o admin escolher. O SV soma
  **todas** as rotas da mesa, medidas nos pilares do canal dele (`aplicarCanalSV` no adaptador); cada rota continua
  no ranking do canal dela e ganha o +5 se o SV vencer.
- **Confrontos:** só entre SVs do mesmo canal, em pilar de volume, no máximo 1 desafio recebido por SV.
  O vencedor leva +5, e toda a mesa dele também; quem perde não perde pontos. **O +5 só entra depois do fechamento do
  mês (30/10/2026):** o SV, nos pontos acumulados; cada rota da mesa, nos pontos daquele mês. No mês aberto o motor
  devolve o vencedor parcial e o bônus em `bonusPendente` (fora de pontos, gatilho, status e ranking), e a tela mostra
  "vencendo · +5 pts no fechamento". ⚠️ O mês conta como fechado já no período de fechamento da API
  (`entrada.fechamento`, de `meta.fechamento`); os meses anteriores do trimestre, sempre.
  Desempate (confronto e ranking): maior % de Refrigerantes.
- **Medidas:** Real = até ontem, Online = hoje, Diferença = Real + Online − Meta, % = (Real + Online) ÷ Meta.
  `meta_dia` vem pronta da API — **não recalcule**.
- **Contrato da API estável:** os campos de `api/v1` descritos em `API.md` não mudam de forma.
- Orçamento, custo dos prêmios e valores de premiação ficam **fora** do painel e do repositório.
  Os **volumes** dos estratégicos têm aba própria, sem pontos e sem premiação. (A regra v3.1 ainda diz
  "fora do escopo do painel" em `Desafio-Q4_Contexto-Regras.md` linha 19: redação antiga, já revertida.)

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
- **A senha do admin existe só como hash** (SHA-256) dentro do HTML. Ela evita mudança por engano; não é
  proteção forte e nunca deve ser escrita em texto claro em lugar nenhum.
- **`.env` nunca é versionado** (já está no `.gitignore`). Nunca imprima credenciais. Se a autenticação no
  Datasphere falhar, pare e avise em vez de tentar contornar.
- **Dados de clientes e de pessoas** estão nos JSONs da API (nomes e códigos de clientes, nomes de vendedores
  e supervisores). Não os copie para fora do repositório, para issues, PRs ou capturas de tela.
- Use fixtures sintéticas, com nomes fictícios, em todo teste novo.
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
- **Pilares de novembro e dezembro (29/10/2026):** os pilares 1 a 3 do Back Office já estão no `CONFIG` (Mista: Sabores,
  Retornáveis, Missões Guiadas; Segmentada: Sabores, Refri Single, Powerade; "Volume Individuais" = Refri Single).
  Os **coringas 4 e 5 ainda não foram decididos**: quando forem, acrescente-os nas entradas do mês (os dois canais), rode
  o `build.py` e comite o HTML gerado. Os coringas do admin (`ajustes.json` → `pilares`, sem mês) só **trocam** os 4 e 5
  do mês de referência quando ele já tem os 5 no `CONFIG`; nunca completam um mês sozinhos.
- **Missões Guiadas** deixa de ser validada em 100% a partir de novembro: passa a ter meta, real e online. A fonte
  por rota ainda não foi definida; quando for, entra em `CONFIG.fonteDoPilar['Missões Guiadas']` (+ `produtoDaApi`).
  Sem fonte, o pilar aparece "sem dados" e não pontua.
- **Acumulado do SV:** o adaptador lê os meses fechados do trimestre (`index.json` → `fechados`), cada mês é
  calculado com os pilares e os confrontos dele, e o motor recebe todos os meses até o vigente. Mês fechado ausente
  ou com falha: aviso, acumulado "incompleto" (`mesesIncompletos` na entrada do motor) e SV sem posição oficial.
- O que depende de fechamento de meses: os pontos acumulados do SV (gatilho de 60 no trimestre) somam os
  meses fechados mais o mês corrente. A própria API tem período de fechamento — do 1º dia do mês até o fim
  do 1º dia útil ela mostra o mês anterior, com `mes_referencia.fechamento = true` e `tendencia`,
  `meta_dia` e `online_hoje` nulos. Teste esse período com `--simulado --hoje` (o simulado entra em fechamento
  do dia 1 até o fim do 1º dia útil, pelos dias úteis locais).
- **Snapshot do mês fechado** (`backend/gerador/fechado.py`): em cada rodada do fechamento o gerador grava
  `api/v1/fechado/AAAAMM.json` (meta e realizado por rota e produto, `fechamento_final: false`); na 1ª rodada do mês
  novo ele é selado (`fechamento_final: true`) e não muda mais. `index.json` → `fechados` lista esses arquivos. A
  limpeza de `saida.gravar_api` não toca `fechado/` (`saida.PRESERVADAS`). Formato em `API.md`.

## 8. Checklist antes do PR

1. `git fetch origin` e branch atualizada com a `main`.
2. `python painel-q4/scripts/build.py` rodado, e `git diff --stat` mostra só a mudança esperada.
3. `node --test painel-q4/tests/motor.test.js painel-q4/tests/adapter.test.js` — 110 passando.
4. `cd backend && python -m unittest discover -s tests -t .` — 38 passando.
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
