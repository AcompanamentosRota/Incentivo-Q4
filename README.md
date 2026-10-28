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
│   └── desafio-q4.html      painel Desafio Q4 (gerado por painel-q4/scripts/build.py)
├── painel-q4/               fontes do painel Desafio Q4 (motor, adaptador, tela, regras, testes)
├── backend/
│   ├── odata/               cliente OData (copiado do projeto da TI)
│   ├── gerador/
│   │   ├── mapeamento.py    produtos, colunas e filtros (o único arquivo a ajustar no dia a dia)
│   │   ├── fontes.py        consultas ao Datasphere
│   │   ├── modelo.py        contas de meta, realizado, tendência e status
│   │   ├── api.py           montagem dos JSONs
│   │   ├── validacao.py     conferência antes de publicar
│   │   └── simulado.py      dados fictícios no mesmo formato
│   ├── scripts/gerar.py     gera a API
│   ├── scripts/servir.py    serve frontend/ e api/ como no deploy, para ver na sua máquina
│   ├── scripts/descobrir_produtos.py   confere a grafia dos agrupadores no Datasphere
│   └── tests/               testes sem rede (Datasphere falso)
└── .github/workflows/
    ├── atualizar-dados.yml  a cada 15 min, seg-sex, 07h-18h45 (Brasília), e quando frontend/ajustes.json muda
    ├── deploy-pages.yml     publica frontend/ + api/ no Pages
    └── testes.yml           testes do back-end e do painel
```

## Como funciona

1. O workflow **Atualizar dados** roda a cada 15 minutos em dias úteis.
2. `backend/scripts/gerar.py` pede um token OAuth, consulta o modelo `AM_FAT_BND_ANALISE_META`, a base
   de clientes e o calendário, calcula meta x realizado por rota e cliente, soma em supervisão, gerência
   e empresa, e **valida** o resultado.
3. Se algo mudou, o workflow faz commit em `api/` e publica o site. Se a validação reprovar, nada é
   gravado: o site continua com a última versão boa e a execução aparece como falha (log anexado).

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
Os pilares de cada mês ficam em `painel-q4/src/adapter.js` → `CONFIG`; em novembro, atualize `mes` e
`pilaresConfig` (até lá, se a API já estiver no mês novo, o painel avisa e usa a base embutida).

**Ajustes do admin** (aba Regras > Administração do painel): regras, pilares coringa, canal das rotas,
**agrupadores extras** e os **confrontos entre supervisores**. Publicados em `frontend/ajustes.json` por PR (botão "Publicar no GitHub (PR)"); depois do
merge, o site passa a usá-los e o workflow "Atualizar dados" roda sozinho: o `gerar.py` lê os agrupadores extras
desse arquivo e os inclui na API (para testar outro arquivo: `python scripts/gerar.py --ajustes arquivo.json`).

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
python scripts/gerar.py --forcar                 # dados reais em ../api/v1
python scripts/gerar.py --rota 111 --forcar      # uma rota só, em saida/rota_111/
python -m unittest discover -s tests -t . -v     # testes
```

Para ver as páginas com a API, abra `http://localhost:8000` (painel em `/desafio-q4.html`) depois de:

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
