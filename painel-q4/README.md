# Painel Desafio Q4 2026 (Coca-Cola Bandeirantes)

Painel de acompanhamento do incentivo, em um único HTML para tela de PC e compartilhamento por print.

**Para usar:** abra o painel no site do metas-produtos (`.../desafio-q4.html`) ou, na sua máquina, rode
`python backend/scripts/servir.py` e abra `http://localhost:8000/desafio-q4.html`. Os dados vêm da API do
metas-produtos (atualizada a cada 15 min em dias úteis). Aberto direto do computador, sem a API, o painel usa a base
embutida (`data/data.json`) e avisa no rodapé ("base embutida").

## Abas
- **Rota:** uma linha por rota, com Meta, Meta dia, Real, Hoje (online), Diferença, % e Pontos por pilar, total e status.
- **Supervisão:** mesma estrutura por supervisor (soma das rotas da mesa, provisório).
- **Detalhe:** totais do grupo filtrado e a rota selecionada, pilar a pilar.
- **Regras:** pontuação, gatilhos, pilares, premiação, dados e alertas, pendências e anotações livres.

## Estrutura
```
../frontend/desafio-q4.html  painel pronto (gerado; publicado no Pages junto com a API)
src/app.tpl.html             tela (HTML, CSS e lógica de exibição)
src/motor.js                 motor de cálculo (pontos, gatilhos, confronto, status, ranking)
src/adapter.js               lê a API e liga os dados ao motor; CONFIG com o mês e os pilares
src/assets/                  fontes e logo extraídos da apresentação oficial
data/data.json               base embutida (10/2026): canal das rotas e plano B sem a API
scripts/build.py             monta o HTML final
scripts/preparar_dados.py    gera data.json a partir dos dois Excel do SAP
tests/                       33 testes do motor e 7 do adaptador
docs/                        regras do incentivo (fonte de verdade)
```

## Dados
- **API** (`../api/v1/index.json` e `gerencias/*.json`): meta (META_VOLUME), real (faturado no mês, inclusive o de
  hoje), online (pedidos de hoje ainda não faturados) e meta dia de cada rota, nos agrupadores Sucos, Powerade,
  Sabores Tt, Refrigerantes Retornavel e Refrigerantes Individual. Conferido em 26/10/2026: metas iguais às do SAC
  nas 201 rotas, nos 5 agrupadores.
- **Gatilho de 95% e desempate:** categoria Refrigerantes do SAC = agrupador `Refrigerantes` da API, com todos os
  itens de refri (descartável, retornável, lata...). Só na base embutida, que não tem a categoria, o painel volta à
  soma provisória de Individual + Retornável e mostra o selo "provisório".
- **Base embutida:** o canal Mista/Segmentada (e o subtipo Mini/Mod) de cada rota, que a API ainda não traz. Rota sem
  canal na base fica fora do ranking (aba Regras > Dados e alertas).
- **Mês:** o painel só usa a API quando ela está no mês de `CONFIG` (`src/adapter.js`). Na virada para novembro,
  atualize `mes` e `pilaresConfig`; antes disso o painel avisa e usa a base embutida.

## Comandos
```
python scripts/build.py                                         # regenera ../frontend/desafio-q4.html
node --test tests/motor.test.js tests/adapter.test.js           # testes (Node 18+)
python scripts/preparar_dados.py Infos_modelo.xlsx base.xlsx    # atualiza a base embutida (pip install openpyxl pandas)
```

## Pontos a confirmar (também na aba Regras > Pendências)
1. Meta e realizado do Supervisor: usando a soma das rotas da mesa; 4 supervisões têm rotas nos dois canais.
2. Refri Single = Refrigerantes Individual na Segmentada.
3. Rotas sem canal e em dois segmentos (6); Real vazio tratado como dado ausente.
4. Canal Mista/Segmentada ainda vem da base embutida, não da API.
5. Regras do Back Office: prazo dos confrontos, +5 sem gatilho de volume, % acumulado de Refri do SV, desempate do SV.

Resolvido: a categoria Refrigerantes do gatilho de 95% vem da API (agrupador `Refrigerantes`, todos os itens de refri).
