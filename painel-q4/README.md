# Painel Desafio Q4 2026 (Coca-Cola Bandeirantes)

Painel de acompanhamento do incentivo, em um único HTML para tela de PC e compartilhamento por print.

**Para usar:** abra o painel no site do metas-produtos (`.../desafio-q4.html`) ou, na sua máquina, rode
`python backend/scripts/servir.py` e abra `http://localhost:8000/desafio-q4.html`. Os dados vêm da API do
metas-produtos (atualizada a cada 15 min em dias úteis). Aberto direto do computador, sem a API, o painel usa a base
embutida (`data/data.json`) só se ainda estivermos no mês dela, com o rótulo "base embutida (outubro)" no rodapé; em
outro mês ele avisa e não calcula nada.

**Topo:** "Mês de referência" (ou "Fechamento de <mês>" no 1º dia útil do mês seguinte) e, a partir de novembro,
"Acumulado do trimestre (SV): out–<mês>" com os meses fechados usados (✓) ou o aviso "incompleto". **Rodapé:** origem
dos dados (API ou base embutida) e o corte.

## Abas
- **Rota:** uma linha por rota, com Meta, Meta dia, Real, Hoje (online), Diferença, % e Pontos por pilar, total e status.
- **Supervisão:** mesma estrutura por supervisor (soma das rotas da mesa, provisório).
- **Estratégicos:** uma linha por gerência com as mesmas colunas das abas Rota e Supervisão (Meta, M. dia, Real, Hoje,
  Diferença e %) para os itens dos dois canais juntos, mais o % da categoria Refrigerantes. **Refri Single fica de
  fora**, por já estar dentro da coluna % Refri. A linha **TOTAL** da empresa vem logo depois da última gerência e
  continua visível quando as gerências precisam rolar. É a tabela mais larga do painel (26 colunas).
  Ao contrário das abas Rota e Supervisão, que são do incentivo, esta mostra a **gerência inteira**: os números são os
  totais que a própria API já traz (`gerencias/{GC}.json` → `produtos` e `resumo.json` → `empresa.produtos`), com
  **todas as rotas que têm Real** — também as de fora do incentivo (sem canal, Neutraliza, virtuais e eventuais) e os
  itens sem meta na rota. É o mesmo corte dos cards de Diretoria e de Gerência do Desempenho de Rotas. A nota abaixo
  da tabela concilia os dois recortes: quanto do Refrigerantes da empresa está nas rotas do incentivo (em 28/10/2026,
  2.723.545,6 de 4.698.930,3 cx, 57,9%). Sem a API, a aba volta a somar só as rotas do incentivo e avisa na nota;
  as duas origens nunca se misturam na mesma tabela.
- **Ranking:** as duas listas premiadas lado a lado (rotas e supervisões), com posição, % de Refrigerantes, pontos,
  status e a linha de corte das posições premiadas. Feita para print.
- **Detalhe:** totais do grupo filtrado e a rota selecionada, pilar a pilar. Os cards do topo trazem os cinco pilares
  e mais um de **Refrigerantes**, com o gatilho do mês.
- **Regras:** pontuação, gatilhos, pilares, premiação, dados e alertas, pendências, anotações livres e **Administração**.
- **Confrontos** (botão ao lado das abas): os desafios entre supervisores do mês, com o % de cada lado, o vencedor e o
  bônus, ou o motivo quando o confronto não vale.

Nas abas Rota e Supervisão, os pontos de cada pilar e o total aparecem sempre, e **todas as linhas são numeradas**; só o
status, a posição oficial e a premiação dependem do gatilho de Refrigerantes (quem está fora aparece em cinza).

Os volumes aparecem sempre com **uma casa decimal**. Nas tabelas de Rota, Supervisão e Estratégicos a largura de cada
coluna é medida pelo maior valor que ela recebe, e o painel usa o maior corpo de fonte (16 a 10 px) em que tudo ainda
cabe na tela.

**Cores das faixas de pontos** (valem no chip de Pts, na barra dos cards e no quadro do %): **azul** em 105% ou mais
(5 pontos), **amarelo** de 100% a 104,99% (3 pontos), **vermelho fechado** de 90% a 99,99% (2 pontos) e cinza abaixo
disso (0). O quadro do % usa a mesma cor da faixa, bem mais apagada, para o chip de Pts continuar sendo o destaque da
linha. Diferença negativa aparece em vermelho e positiva em verde.

Nas tabelas de Rota, Supervisão e Estratégicos, passar o mouse **acende a linha e a coluna** sob o cursor, junto com o
rótulo da coluna no cabeçalho, para ajudar a ler de ponta a ponta sem perder a linha.

## Administração (aba Regras)
Protegida por senha (fale com o Back Office). Permite ajustar, sem mexer no código: faixas de pontos, gatilho de
Refrigerantes, mínimos de pontos, bônus do confronto, posições premiadas, pilares coringa do mês, o canal
(Mista/Segmentada) de cada rota, os **agrupadores extras** e os **confrontos do mês**.
- **Confrontos:** cadastre mês, SV desafiante, SV desafiado e pilar. O pilar segue o canal do desafiante, e o painel
  recusa desafio entre canais diferentes, autodesafio, repetição e segundo desafio ao mesmo SV no mês. O resultado é
  apurado na tela Confrontos; o vencedor leva +5 e toda a mesa dele também.
- **Agrupadores extras:** inclua ou exclua agrupadores do Datasphere (o campo sugere os que têm meta no mês, de
  `api/v1/agrupadores.json`). Cada um vira o pilar "Volume <nome>", com cor própria, e pode ser escolhido como pilar
  coringa 4 ou 5. Depois do merge do PR, o gerador da API passa a buscá-lo (cerca de 3 minutos). Os 6 agrupadores
  fixos não podem ser excluídos.
- **Salvar neste navegador:** vale na hora, só para quem salvou (etiqueta "Ajustes do admin (só neste navegador)").
- **Publicar no GitHub (PR):** abre o `frontend/ajustes.json` no GitHub já preenchido (ou copia o conteúdo para
  colar, se o arquivo já existe). Em *Commit changes*, escolha "Create a new branch for this commit and start a pull
  request": alguém revisa e faz o merge, e só então os ajustes valem para todos. Para voltar todos ao padrão, apague o
  `frontend/ajustes.json`, também por PR. "Baixar ajustes.json" continua disponível.
- A senha fica embaralhada (hash) dentro do HTML, mas o site é público: ela evita mudança por engano, não é proteção
  forte. Publicar para todos exige acesso ao repositório.

## Estrutura
```
../frontend/desafio-q4.html  painel pronto (gerado; publicado no Pages junto com a API)
src/app.tpl.html             tela (HTML, CSS e lógica de exibição)
src/motor.js                 motor de cálculo (pontos, gatilhos, confronto, status, ranking)
src/adapter.js               lê a API (mês corrente e meses fechados) e liga os dados ao motor; CONFIG com os pilares por mês
src/assets/                  Anton e Barlow do letreiro, e o logo (o resto do painel usa Inter/fonte do sistema)
data/data.json               base embutida (10/2026): canal das rotas e plano B sem a API
scripts/build.py             monta o HTML final
scripts/preparar_dados.py    gera data.json a partir dos dois Excel do SAP
tests/                       34 testes do motor e 34 do adaptador (fixtures/: regressão de outubro)
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
- **Mês:** vem da API (`index.json` → `mes_referencia.anomes`). Os pilares de cada mês ficam em
  `CONFIG.pilaresConfig` (`src/adapter.js`); mês com `pilares: []` não está configurado, e o painel mostra
  "Pilares de <mês> ainda não configurados" sem calcular pontos nem ranking. API fora do ar: base embutida só no mês
  dela ("base embutida (outubro)").
- **Meses fechados:** o adaptador lê `index.json` → `fechados` e carrega os `fechado/AAAAMM.json` dos meses do
  trimestre anteriores ao de referência (meta e realizado por rota, online = 0). A entrada do motor tem todos os meses
  até o vigente: cada mês com os pilares e os confrontos dele; a mesa do SV em cada mês é a supervisão da rota naquele
  mês, e o canal é o da base de segmentação atual (provisório). Pontos acumulados do SV = soma mês a mês; gatilho de
  volume do SV = Σ(Real + Online) ÷ Σ Meta de Refrigerantes de outubro ao mês vigente; consultor = só o mês vigente.
  Mês fechado que falte ou falhe: aviso, acumulado do SV marcado "incompleto" (o mês não soma nada) e SV sem posição
  oficial até o dado chegar.
- **Missões Guiadas:** em outubro, validada em 100% (3 pontos). Em novembro e dezembro pontua com meta, real e online
  quando houver fonte (`CONFIG.fonteDoPilar['Missões Guiadas']` + `produtoDaApi`); sem fonte, aparece "sem dados" e
  não pontua.
- **Confrontos:** cada um é apurado com os dados do mês dele (fechado ou corrente); a tela Confrontos tem a escolha do mês.
- **Totais da aba Estratégicos:** o adaptador expõe `totaisGerencia` (de `gerencias/{GC}.json` → `produtos`) e
  `totalEmpresa` (de `resumo.json` → `empresa.produtos`); se o `resumo.json` falhar, o total vira a soma das
  gerências e o painel registra o motivo em `meta.aviso`. A montagem das linhas fica em `montarEstrat()`, no
  adaptador — é só soma de volume: pontos, gatilhos e ranking continuam só no motor.

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
