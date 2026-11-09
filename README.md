# Metas x Realizado de Volume · Comercial Bandeirantes

API de meta e realizado de volume de **Vol. Sucos, Vol. Powerade, Vol. Sabores, Vol. Retornáveis, Vol. Individuais e
Vol. Refrigerantes** (a categoria inteira, que contém Individuais, Retornáveis e parte de Sabores), nos
níveis cliente, rota, supervisão e gerência, publicada no GitHub Pages e alimentada automaticamente pelo
**SAP Datasphere** via OData. Segue o mesmo modelo e as mesmas regras de volume (critério do SAC) do
projeto "Desempenho de Rotas" da TI, de onde vêm o cliente OData (`backend/odata/`) e as consultas.

O contrato da API (endereços e campos) para quem constrói o front está em **[API.md](API.md)**.

```
Incentivo-Q4/
├── CLAUDE.md                guia do repositório para sessões do Claude Code
├── api/v1/                  ← a API (JSONs gerados; não edite à mão)
├── frontend/
│   ├── index.html           página provisória que lê a API
│   ├── status.html          testa todos os arquivos da API
│   ├── desafio-q4.html      painel Desafio Q4 (gerado por painel-q4/scripts/build.py)
│   └── campari-club.html    painel Campari Club (gerado por painel-campari/scripts/build.py)
├── painel-q4/               fontes do painel Desafio Q4 (motor, adaptador, tela, regras, testes)
├── painel-campari/          fontes do painel Campari Club (motor, adaptador, tela, regras, testes)
├── backend/
│   ├── odata/               cliente OData (copiado do projeto da TI)
│   ├── gerador/
│   │   ├── mapeamento.py    produtos, colunas e filtros (o único arquivo a ajustar no dia a dia)
│   │   ├── fontes.py        consultas ao Datasphere
│   │   ├── modelo.py        contas de meta, realizado, tendência e status
│   │   ├── api.py           montagem dos JSONs
│   │   ├── validacao.py     conferência antes de publicar
│   │   ├── fechado.py       snapshot do mês fechado, em prévia ou oficial (api/v1/fechado/AAAAMM.json)
│   │   └── simulado.py      dados fictícios no mesmo formato
│   ├── scripts/gerar.py     gera a API
│   ├── scripts/servir.py    serve frontend/ e api/ como no deploy, para ver na sua máquina
│   ├── scripts/descobrir_produtos.py   confere a grafia dos agrupadores no Datasphere
│   ├── scripts/diagnosticar_real.py    compara o Real da API com o Real do SAC (só leitura)
│   ├── scripts/reabrir_fechado.py      volta um mês fechado de oficial para prévia (ajuste único, por PR)
│   └── tests/               testes sem rede (Datasphere falso)
└── .github/workflows/
    ├── atualizar-dados.yml  a cada 15 min, seg-sex, 07h-18h45 (Brasília), e quando frontend/ajustes.json muda
    ├── deploy-pages.yml     publica frontend/ + api/ no Pages
    └── testes.yml           testes do back-end e dos painéis (Desafio Q4 e Campari Club)
```

## Como funciona

1. O workflow **Atualizar dados** roda a cada 15 minutos em dias úteis.
2. `backend/scripts/gerar.py` pede um token OAuth, consulta o modelo `AM_FAT_BND_ANALISE_META`, a base
   de clientes e o calendário, calcula meta x realizado por rota e cliente, soma em supervisão, gerência
   e empresa, e **valida** o resultado.
3. Se algo mudou, o workflow faz commit em `api/` e publica o site. Se a validação reprovar, nada é
   gravado: o site continua com a última versão boa e a execução aparece como falha (log anexado).
4. No fechamento do mês (do dia 1 até o fim do 1º dia útil), cada execução grava também
   `api/v1/fechado/AAAAMM.json` com meta e realizado do mês que fechou, por rota, mais os totais por gerência e da
   empresa. Esse arquivo nasce em **prévia**: até o fechamento do **flash de vendas** (em torno do dia 12) os números
   ainda mudam, porque notas são canceladas e retornadas, e cada execução consulta o mês de novo e regrava o arquivo.
   Ele só vira **oficial** (e nunca mais muda) quando o Back Office marca, na Administração do painel, que o flash
   daquele mês fechou — nunca por data no código. É desse arquivo que sai o acumulado do trimestre.
   Formato em [API.md](API.md).
5. **Base do dia** (`backend/gerador/base_dia.py`): o Real é "até ontem" e não muda ao longo do dia, então só a
   primeira execução agendada do dia faz a consulta completa. Ela guarda tudo menos os pedidos de hoje no cache do
   Actions (nunca no repositório), e as execuções seguintes consultam **só o Online**. A cada execução, uma consulta
   barata do Real por agrupador confere a base: se o Real mudou, se a base é de outro dia ou não foi encontrada, a
   execução volta à consulta completa. O fechamento do mês e a execução do `ajustes.json` são sempre completas; a
   execução manual (botão "Run workflow" ou o robô que dispara a cada 15 min) é incremental, a não ser com a opção
   "Carga completa" marcada. Os meses em prévia são consultados de novo só na carga completa do dia. A API sai igual à da consulta
   completa.

Regras de volume (iguais às da TI): meta = META_VOLUME da rota; realizado = FX_VOL_PADRAO_FAT com
NF_STATUS em Acertado, Meta Neg ou Em Aberto; tendência = realizado + restante da curva de META_NEG;
meta do cliente = META_NEG do cliente; pedidos de hoje à parte (`online_hoje`). Detalhes em
`backend/gerador/modelo.py` e em [API.md](API.md).

## Painel Desafio Q4

`frontend/desafio-q4.html` é o painel do incentivo Desafio Q4 (regras em `painel-q4/docs/`). Ele lê a API do
mesmo site (`./api/v1/`) ao abrir; por isso fica neste repositório: com o Pages privado, uma página em outro
endereço não consegue ler a API. Da API vêm meta, realizado, online e meta dia de cada rota e, na aba
Estratégicos, os totais de cada gerência e da empresa (`gerencias/{GC}.json` e `resumo.json`), que incluem
todas as rotas com Real, inclusive as de fora do incentivo; o canal
(Mista/Segmentada) ainda vem da base de segmentação embutida (`painel-q4/data/data.json`). Aberto direto do
computador, sem a API, o painel usa essa base embutida inteira e avisa no rodapé ("base embutida").

Mudou algo em `painel-q4/src/` ou `painel-q4/data/`: rode `python painel-q4/scripts/build.py` e envie também o
`frontend/desafio-q4.html` gerado. Testes: `node --test painel-q4/tests/motor.test.js painel-q4/tests/adapter.test.js`.
O mês de referência vem da API (`index.json` → `mes_referencia`) e os pilares de cada mês ficam em
`painel-q4/src/adapter.js` → `CONFIG.pilaresConfig` (entradas de outubro, novembro e dezembro; novembro repete os
coringas 4 e 5 de outubro, e em dezembro, por enquanto, só os pilares 1 a 3, com os coringas 4 e 5 a decidir). Mês sem os 5 pilares configurados: o painel
mostra "Pilares de <mês> ainda não configurados" e não calcula pontos nem ranking — nunca usa os números de outro mês
no lugar nem calcula com parte dos pilares. O acumulado do SV soma os meses fechados (`fechado/AAAAMM.json`) e o mês
corrente; enquanto algum mês fechado estiver em **prévia** (antes do fechamento do flash de vendas), o painel mostra o
acumulado como **provisório** na Supervisão, no Ranking e no rodapé. Os números não mudam por isso: só o rótulo.

**Consulta do fechamento do mês** (aba Regras > Administração, tópico "Fechamento do mês"): confere um mês já fechado — Consultor (por rota),
Supervisão (por SV) e Estratégicos (por gerência, só volume) — a partir do `api/v1/fechado/AAAAMM.json`, deixando claro se
o mês está em **prévia** ou **oficial**, e exporta tudo num `.xlsx` de quatro abas (Contexto, Consultores, Supervisões e
Estratégicos), gerado no próprio navegador. É só leitura: os números saem do motor, com os dados daquele mês.

**Ajustes do admin** (aba Regras > Administração do painel, em seis tópicos desde 05/11/2026: Resumo, Confrontos,
Pilares do mês, Canal das rotas, Pontuação e regras e Fechamento do mês): regras, pilares coringa, segmentação da supervisão (canal e
segmento de cada rota, escolhidos por SV, e o canal do SV, um só por supervisão; o motor só vê o canal),
**agrupadores extras**, os **confrontos entre supervisores** e o **flash de vendas fechado** de cada mês (o que faz o
gerador selar o mês fechado). Publicados em `frontend/ajustes.json` por PR (botão "Publicar no GitHub (PR)"); depois do
merge, o site passa a usá-los e o workflow "Atualizar dados" roda sozinho: o `gerar.py` lê os agrupadores extras
desse arquivo e os inclui na API (para testar outro arquivo: `python scripts/gerar.py --ajustes arquivo.json`).
O arquivo tem de ser **um único objeto JSON**: no editor do GitHub, selecione tudo e substitua o conteúdo, nunca cole
depois do texto antigo. Se o publicado não puder ser lido, o painel ignora todos os ajustes publicados e mostra uma faixa
vermelha com o motivo; valor inválido dentro de um arquivo válido é ignorado nesse item, com faixa amarela. Precedência,
item a item: padrão < `ajustes.json` publicado < ajustes salvos no navegador do admin, que guarda só o que difere do
publicado (o que ficar igual sai sozinho; para limpar: Administração > "Descartar todos os do navegador").

## Painel Campari Club

`frontend/campari-club.html` é o painel do incentivo Campari Club (out–dez/2026; regras em
`painel-campari/docs/regras.md`), independente do Desafio Q4. Ele lê a mesma API (`./api/v1/`) e acha os produtos do
incentivo em `index.json` → `produtos` pelos agrupadores extras `Aperitivo` e `Skyy`. **Etapa 4: a tela**, nas cinco
abas do mockup aprovado em 08/11/2026 — Ranking GC · Supervisão (Mista ⇄ Segmentada) · Consultor · Detalhe do mês ·
Regras —, lendo o gatilho de cobertura de Skyy, o ranking por volume de Aperitivo, a posição oficial e o status que o
motor e o adaptador já calculavam; detalhes em `painel-campari/README.md`. A **etapa 4B** (regras v1.6) ajustou só a
apresentação das duas tabelas de ranking: Status só com o selo, sem legendas, blocos coloridos (Aperitivo laranja,
Skyy azul), Dif. negativa em vermelho, quadradinho verde/vermelho no % de cobertura e fonte 1 px menor. A **etapa 4C**
(regras v1.6, seção 4) trocou o Ranking GC para a **gerência comercial agrupada** do SAC: 12 linhas no lugar das 16
gerências da API, somando as gerências de cada grupo antes de calcular. A Supervisão, o Consultor e o Detalhe do mês
seguem com as gerências da API. A **etapa 4F** (regras v1.7, seção 7) fez os ajustes de tabela pedidos pela Karen,
também só de apresentação: conteúdo centralizado em todas as tabelas, coluna Dez só em dezembro, "Soma" virou
"% Acum." e o "% Acum." do Skyy virou "% Médio", quadradinho no % do mês vigente do Aperitivo, números do Aperitivo
na fonte da tabela, linha do total só com "Total Band" e as mesmas cores no Consultor e no Detalhe do mês. O canal Mista/Segmentada é uma cópia da base do Desafio Q4 em
`painel-campari/data/data.json`.

Mudou algo em `painel-campari/src/` ou `painel-campari/data/`: rode `python painel-campari/scripts/build.py` e envie também o
`frontend/campari-club.html` gerado (o build embute a fonte Barlow Condensed 800 e a arte de fundo
`painel-campari/src/assets/campari-fundo.jpg`). Testes:
`node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js` — 199 testes.

## Antes de ligar: confirmar os agrupadores

Os nomes dos agrupadores ficam em `backend/gerador/mapeamento.py` → `PRODUTOS`. "Sucos" e "Powerade"
já aparecem no projeto da TI; **"Sabores" e "Retornaveis" são suposições** e precisam ser confirmados.
O nome vai no filtro da consulta, que é exato (maiúsculas e acentos contam). Com o `.env` preenchido:

```bash
cd backend
python scripts/descobrir_produtos.py
```

O relatório (`backend/saida/descoberta/produtos.md`) lista os agrupadores do mês com "suco", "powerade",
"sabor" ou "retorn" no nome, com faturado e metas, e diz quais nomes configurados não existem. Se um
produto for a soma de vários agrupadores, liste todos no mesmo produto.

## Configuração no GitHub (uma vez)

1. Crie o repositório **privado** dentro da organização e envie este projeto.
2. **Settings > Secrets and variables > Actions**: cadastre os mesmos nomes do projeto da TI.
   Secrets: `DATASPHERE_CLIENT_ID`, `DATASPHERE_CLIENT_SECRET`. Variables: `DATASPHERE_TENANT_URL`,
   `DATASPHERE_TOKEN_URL`, `DATASPHERE_SPACE`, `DATASPHERE_ASSET`.
3. **Settings > Pages**: Source = "GitHub Actions" e, em Visibility, **Private** (acesso só para quem
   tem permissão no repositório). Pages privado exige GitHub Enterprise Cloud; confirme com a TI.
4. **Actions > Atualizar dados > Run workflow**: escolha `real` (ou `simulado` para publicar dados
   fictícios enquanto as credenciais não estão prontas).

Minutos de Actions: em repositório privado as execuções consomem a cota da organização. A cada 15 min
em dias úteis são cerca de mil execuções por mês (o job de dados mais o de publicação). Vale a TI
conferir a cota; se precisar economizar, aumente o intervalo do `cron` em `atualizar-dados.yml`.

## Rodar localmente

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # preencha (só para dados reais)

python scripts/gerar.py --simulado --forcar      # dados fictícios em ../api/v1
python scripts/gerar.py --simulado --hoje 2026-11-03 --forcar --saida /tmp/sim   # simula o fechamento de outubro
python scripts/gerar.py --forcar                 # dados reais em ../api/v1
python scripts/gerar.py --rota 111 --forcar      # uma rota só, em saida/rota_111/
python -m unittest discover -s tests -t . -v     # testes
```

Para ver as páginas com a API, abra `http://localhost:8000` (painéis em `/desafio-q4.html` e `/campari-club.html`) depois de:

```bash
python scripts/servir.py      # na pasta backend/: serve frontend/ e api/ como no deploy; botão "Atualizar dados" funciona
```

## Manutenção

Entrou ou saiu um produto: edite `PRODUTOS` em `mapeamento.py` (o `id` vira chave nos JSONs; avise o
front), rode os testes e o `descobrir_produtos.py`. Mudou coluna no Datasphere ou regra de rota
(Neutraliza, virtuais, gerências): os mesmos nomes do projeto da TI estão em `mapeamento.py`; quando a
TI atualizar o projeto dela, replique aqui.

## Segurança

Nunca versione `backend/.env`: as credenciais ficam só nos Secrets do GitHub. Os JSONs têm nomes e
códigos de clientes, por isso o repositório e o Pages devem ser privados.
