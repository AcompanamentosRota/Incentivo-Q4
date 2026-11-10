# Campari Club 2026 — Regras do incentivo (Coca-Cola Bandeirantes) — v1.12 (10/11/2026)

Fonte de verdade do painel Campari Club (`painel-campari/docs/regras.md`). Itens marcados com ⚠️ são
interpretações a confirmar (seção 10): use-os como estão descritos e sinalize no painel; não decida.

**v1.12 (10/11/2026, manhã):** **as pendências não aparecem mais no painel.** A aba Regras > Dados e alertas deixa de listar as premissas a confirmar (pendências 22 e 26b);
elas ficam **só nesta seção 10 e no checklist**. A tela mantém apenas alertas de dado (API indisponível, dados simulados, mês sem fonte, mês em prévia, supervisão fora do
ranking, avisos da carga). **Total Band passa a mostrar o % Acum. de Aperitivo** (antes "—"; pedido da Karen, 10/11/2026): a soma dos % mensais da empresa, com a mesma conta e a mesma trava das linhas (seção 7); continua sem ranking, sem RANK e sem status. Só tela; nenhuma regra de cálculo das linhas muda.

**v1.11 (10/11/2026, manhã):** o **volume de Aperitivo deixa de ter "gatilho" por média** e passa a ter um **mínimo de volume**: o "✓ Bateu!" exige o **% de
Aperitivo do mês vigente ≥ 100%** (bruto), **sem média e sem soma** (decisão da Karen). A **soma** (out + nov + dez, % Acum.) serve **só para ranquear**. O **único
gatilho** (média nov + dez) é o de **cobertura de Skyy**. "Bateu!" = gatilho de Skyy **e** mínimo de volume **e** posição oficial dentro das premiadas; a coluna
**RANK** numera só quem bateu os dois primeiros. Troca o cabeçalho "OF." por "RANK" (resolve a pendência 29), tira o texto "GATILHO ≥ …" do cabeçalho do Aperitivo
(resolve a 28), confirma as pendências 24, 25 e 26 (a, c, d). Substitui a seção 2.2 da v1.8 (média de nov e dez com trava).

**v1.10 (10/11/2026, manhã):** as tabelas de ranking (Ranking GC e Supervisão) passam a ter **só a coluna da posição oficial**, a que conta: a coluna "Pos." sai
(seções 5 e 7). A ordem das linhas continua a do % Acum. de Aperitivo; quem não bateu os dois pilares mostra "—" na coluna e a regra da posição em cinza deixa de
existir. O cálculo da posição e da oficial **não muda** (o motor continua entregando as duas). Abre a pendência 29 (nome da coluna).

**v1.9 (09/11/2026, fim da noite):** o **Detalhe do mês na visão Gerência deixa de ser paginado** (16 linhas e o Total Band cabem numa tela só); a visão
Supervisão do Detalhe, a Supervisão e o Consultor continuam paginados em 15 linhas (seção 7). Resolve a pendência 27 e abre a 28 (texto "GATILHO ≥ 100,0%"
no cabeçalho do bloco Aperitivo, que a 4H acrescentou).

**v1.8 (09/11/2026, noite):** o status "✓ Bateu!" passa a exigir **os dois pilares**, decidido pela Karen ao ver um SV com Skyy em 100% e Aperitivo
zerado em novembro marcado como "Bateu!" (seções 2, 5 e 7). Novo gatilho de **volume de Aperitivo**: média simples dos % de **novembro e dezembro**,
**mínimo 100%**, no valor **bruto**, com a **trava de 130% em novembro** (dezembro sem trava); outubro não entra. "Bateu!" = gatilho de Skyy **e** gatilho de
Aperitivo **e** posição oficial dentro das premiadas. A coluna **Oficial** passa a numerar só quem bateu os **dois** pilares. O cálculo do ranking (% Acum.) não muda.
Abre a pendência 26 (premissas).

**v1.7 (09/11/2026, fim da tarde):** ajustes de tabela e navegação, pedidos pela Karen (seção 7): conteúdo das tabelas centralizado em todas as
abas; coluna Dez só em dezembro; rótulos novos ("Soma" do Aperitivo vira "% Acum.", "% Acum." de Skyy vira "% Médio", só na tela: o gatilho
continua sendo a média simples de novembro e dezembro); quadradinho no % do mês vigente do Aperitivo; linha do total só com "Total Band"; Detalhe do mês com as
mesmas cores; Supervisão e Consultor paginados (15 linhas) e Consultor aberto com todas as rotas. Abre a pendência 25 (premissas).

**v1.6 (09/11/2026, tarde):** a Karen enviou o print do SAC com a **gerência comercial agrupada** (12 linhas) e o Ranking GC passa a usar
esse agrupamento (seção 4 e pendência 24). Valem as premissas ⚠️ da seção 4 até ela confirmar.

**v1.5 (09/11/2026, tarde):** ajustes visuais das tabelas de ranking, decididos pela Karen (seção 7): coluna Status só com o selo
("✓ Bateu!" ou "-"), sem texto de motivo; legendas e aviso de SVs fora do ranking saem das telas Ranking GC e Supervisão; blocos
Aperitivo (laranja) e Skyy (azul) com título em tom escuro e corpo em tom claro, no padrão do Q4; Dif vermelha quando < 0; % do mês
e % Acumulado de Skyy com o quadradinho pintado (verde ≥ 100%, vermelho < 100%); fonte um pouco menor. O Ranking GC passa a usar a
**gerência comercial agrupada** do SAC (v1.6).

**v1.4 (09/11/2026):** a Karen validou a pendência 15 (meta dia de volume em dia útil: a API publicada traz o valor; confere
com o SAC, inclusive os negativos das rotas com meta batida) e decidiu a exibição da meta dia (seção 7): **se o Real for maior
que a Meta, a meta dia é 0; meta dia negativa também mostra 0; cobertura com valor entre 0 e 1 mostra 1**. Vale para volume e cobertura.
Na mesma data, decidiu que a **aba Consultor lista só as rotas `tipo: "normal"`** da API (seção 1).

**v1.3 (08/11/2026, noite):** a Karen respondeu as pendências 16, 17, 18 e 19 e confirmou o desempate. Resolvidas:
16 (meta dia de cobertura inteiro para cima), 17 ("Hoje" colorido quando **Online > 0 e Online ≥ Meta dia**),
18 (seletor "Mês de referência": troca Meta e Real, não troca o acumulado) e 19 (as tabelas de ranking passam a ter
dois blocos, Aperitivo e Skyy, com Meta, Real, M. Dia, Online, Dif e os %; seção 7). Desempate alfabético
confirmado (seção 5). A pendência 20 (detalhes do seletor e das colunas) foi confirmada pela Karen no mesmo dia. A pendência 21 (mockup das
tabelas) foi resolvida com o mockup atualizado; nele, as colunas do Aperitivo seguem a v1.3.

**v1.2 (08/11/2026, noite):** une as duas v1.1. Das decisões da Karen de 08/11/2026: status "Bateu!" / "-" no conceito
do Q4; **prêmios não aparecem no painel**; Supervisão numa tela só (Mista ⇄ Segmentada) (seções 1, 5 e 6).
Pendência 11 **resolvida**: no % de cobertura de SV e GC, a **meta** soma só as rotas com meta e o **realizado e o
online** somam **todas** as rotas, inclusive as sem meta, que é como a API publica (seção 4). Pendência 12
**resolvida**: a "meta restante" da meta dia de cobertura desconta só o **Real** (D-1), e a meta dia é travada
(seção 7). Meta dia de volume zerada em 08/11 por ser domingo (seção 8). Estado da API atualizado: Aperitivo e Skyy
publicados (seção 8). Pendência 9 resolvida; pendência 14 resolvida pelo código (seção 7). Entram as pendências 15 a
19, vindas da leitura do mockup (seção 10).

## Hierarquia das fontes

1. Decisões da Karen (IM), de 06/11/2026, 08/11/2026 e 09/11/2026: prevalecem sobre tudo e estão incorporadas abaixo.
2. Mockup da tela aprovado em 08/11/2026 (cinco telas, dados fictícios): é a fonte do visual e dos textos da tela.
3. `INCENTIVO_CAMPARI_CLUB_FECHAMENTO_DE_2026.pptx` (apresentação oficial).
4. `Incentivo_Campari_Club_Q4.xlsx` (orientações de formato): só onde a apresentação é omissa.

Conflito resolvido: o slide 2 mostra "Dez 130%" com um carimbo por cima. Vale a decisão de 06/11/2026:
**dezembro não tem trava**.

## 1. Visão geral

- **Vigência:** outubro, novembro e dezembro de 2026.
- **Mecânica:** dois pilares habilitam o participante (gatilho de cobertura de Skyy **e** mínimo de volume de
  aperitivo, seção 2), e o ranking é feito pela soma dos % de volume de aperitivo.
- **Níveis com ranking:** Gerente Comercial (GC), Supervisor Mista e Supervisor Segmentada.
- **Consultor (Rota):** Rota = Consultor. Aparece no painel, mas não tem ranking nem status
  ("contabilizado do supervisor para cima"). **A aba Consultor lista só as rotas `tipo: "normal"` da API
  (decisão de 09/11/2026):** as rotas `neutraliza` e `virtual` ficam fora da lista, mas continuam somando no SV, que é
  o que a linha "Total da mesa" mostra — por isso o total pode ser maior que a soma das linhas visíveis, e a tela
  conta quantas rotas ficaram fora.
- **Diretoria e GP:** total de todas as gerências, numa linha "Total Band". Sem página própria.
- **Telas (mockup de 08/11/2026):** Ranking GC · Supervisão (uma tela só, aberta em Mista, com botões
  "Mista | Segmentada" e filtro de gerência) · Consultor · Detalhe do mês · Regras.

## 2. Gatilhos — os dois pilares

### 2.1 Cobertura de Skyy

- Medida: cobertura do agrupador **Skyy** (bloco `cobertura` do produto extra `skyy` na API).
- **Cobertura:** o cliente conta uma vez no mês, na primeira venda de qualquer SKU. Uma nova compra do
  mesmo cliente no mês não conta de novo.
- Meta: `META_COBERTURA_Chave_Meta_SAP` (modelo `AM_FAT_BND_ANALISE_META`). Realizado: pronto no Datasphere
  (`FX_COBERTURA_REALIZADO`).
- **% do mês** = (realizado + online_hoje) ÷ meta, sem arredondar.
- **Gatilho** = média simples dos % de cobertura de **novembro e dezembro**, **mínimo 100%**. Outubro não
  entra. Em novembro, o gatilho aparece como parcial (só novembro).
- **Online de cobertura:** só clientes ainda não cobertos no mês com pedido válido hoje.

### 2.2 Mínimo de volume de Aperitivo (decisão de 10/11/2026; substitui a v1.8)

- Medida: volume do agrupador **Aperitivo** (produto extra `aperitivos`), a mesma da seção 3.
- **Mínimo de volume** = o **% de Aperitivo do mês vigente ≥ 100%**, comparado no valor **bruto** (99,99999% não bate; a tela trunca, o cálculo não arredonda).
  **Não há média nem soma** nesta conta: a soma dos meses (% Acum.) é **só do ranking** (seção 3).
- **Mês vigente** = o mês de referência da API (o mês aberto); em novembro é novembro e em dezembro é dezembro. Não segue o seletor "Mês de referência" da tela (premissa).
- O % do mês é o mesmo da seção 3 (com a trava de 130% em out e nov; dezembro sem trava). A trava não afeta o corte, porque 100% < 130%.
- Meta de volume do mês nula ou ≤ 0: % nulo, mínimo **indisponível** (sem posição oficial e sem "Bateu!"; nunca 0 nem 100). ⚠️ Pendência 26b.
- **Só o Skyy é gatilho** (seção 2.1). "Bateu os dois pilares" = gatilho de Skyy batido **e** mínimo de volume batido, sempre os dois.

## 3. Ranking — volume de aperitivo

- Medida: volume do agrupador **Aperitivo** (produto extra `aperitivos` na API; um único agrupador, com meta de
  volume).
- **% do mês** = (Real + Online) ÷ Meta, bruto (não usar o `atingimento_pct` inteiro da API).
- **Trava:** o % do mês é limitado a **130% em outubro e novembro**. **Dezembro sem trava.**
- **Pontuação do ranking** = soma dos % mensais (out + nov + dez) já com a trava. (O mínimo de volume da seção 2.2 é outra conta: só o % do mês vigente; a soma serve apenas para ranquear.)
- Ranking separado por nível: GC (único), SV Mista e SV Segmentada.
- **Ranking parcial:** usa Real + Online no mês aberto. Meses fechados: só o realizado.
- **Outubro:** vem do `fechado/202610.json` e segue a chave do faturamento (regra até out/26). Novembro e
  dezembro seguem a chave da meta. ⚠️ A soma mistura os dois critérios.

## 4. Quem soma o quê

**Ranking GC por gerência comercial agrupada (decisão de 09/11/2026, print do SAC).** O Ranking GC tem 12 linhas, não 16. Oito
gerências ficam sozinhas e oito formam quatro pares:

| Linha do ranking | Gerências da API |
| --- | --- |
| G1, G2, G3, AP, AT, AN, RV, SL | uma gerência cada (mesmo código) |
| UR_RI | UR + RI |
| IT_MO | IT + MO |
| PA_DI | PA + DI |
| GU_PO | GU + PO |

O agrupamento fica em configuração (`CONFIG`), nunca fixo na lógica. Gerência que a API publicar e que não estiver no mapa vira
uma linha própria, com aviso. A linha agrupada **soma** os valores das gerências do grupo e só depois calcula: meta, real e online de
cada mês, no Aperitivo e na cobertura de Skyy; o **% é o da soma**, nunca a média dos % (regras das seções 2, 3 e 7 valem para a linha
agrupada: trava, soma, gatilho, posição, status). A posição oficial e o "Bateu!" valem por linha agrupada.
Premissas ⚠️ (a Karen confirma): (a) o "Bateu!" continua nas **6** primeiras posições oficiais, agora entre 12 linhas (no print do SAC,
as posições 1 a 6 aparecem destacadas); (b) o M. Dia de volume do grupo é a **soma** dos M. Dia das gerências (a API não publica por
grupo); o M. Dia de cobertura é calculado sobre a meta e o real somados; (c) Total Band continua como está (empresa, `resumo.json`);
(d) a Supervisão (filtro de gerência) e o Detalhe do mês continuam com as 16 gerências; (e) desempate pelo código da linha em minúsculas
(ex.: `ur_ri`).

- **Rota:** os próprios números.
- **SV:** soma de **todas** as rotas da mesa, inclusive as sem canal, no volume e na cobertura.
- **GC:** soma de **todas** as rotas da gerência.
- **Total Band:** total da empresa (`resumo.json` → `empresa`).
- **Canal do SV (Mista ou Segmentada):** mesma regra do Desafio Q4 — o canal escolhido pelo admin
  (`ajustes.json` → `canaisSV`) ou, sem escolha, o da maioria das rotas da mesa; empate deixa o SV fora do ranking,
  com aviso. Canais das rotas: os mesmos do Q4 (base embutida + ajustes do admin).
- **Cobertura de SV e GC (decisão de 08/11/2026):** a **meta** soma só as rotas com meta de cobertura; o
  **realizado e o online** somam **todas** as rotas, inclusive as sem meta. É exatamente como a API publica o bloco
  `cobertura` de supervisão e gerência: o painel usa esses blocos sem recalcular. Um cliente não é atendido por duas
  rotas; se mudar de rota, conta na rota informada.

## 5. Posição, status e desempate

- **A tela mostra só a posição oficial (decisão de 10/11/2026).** A coluna **Oficial** (cabeçalho **"RANK"**, decisão de 10/11/2026) numera 1, 2, 3… só quem bateu
  **os dois pilares** (gatilho de Skyy **e** mínimo de volume de Aperitivo), na ordem do ranking; quem não bateu mostra "—" e quem está atrás sobe (decisão de
  09/11/2026, noite). **A coluna "Pos." sai da tela** (Ranking GC e Supervisão) e, com ela, a regra de pintar a posição em cinza. As linhas continuam **ordenadas** pelo
  % Acum. de Aperitivo (desempate pelo código), e o motor continua calculando a posição (`pos`) de todas as linhas, que não é exibida.
- **Status (decisão de 08/11/2026, conceito do Q4):** "✓ Bateu!" = **gatilho de Skyy batido e mínimo de
  volume de Aperitivo batido** (os dois pilares, seção 2) **e** posição oficial dentro das posições premiadas do ranking (GC: 6; SV Mista: 12;
  SV Segmentada: 3). Qualquer outro caso = "-". O motivo ("dentro das premiadas", "cobertura em X%: precisa de 100%", "volume em X%: precisa de 100%",
  "cobertura em X% e volume em Y%: precisam de 100%" ou "suba N posições", com N = posição
  oficial − limite) **continua calculado pelo motor, mas não aparece mais na tela** (decisão de 09/11/2026): a coluna Status
  mostra só o selo, "✓ Bateu!" ou "-".
- **Os prêmios não aparecem no painel** (decisão de 08/11/2026): nem nomes, nem quadro de premiação. O painel usa
  só a quantidade de posições premiadas para decidir o "Bateu!".
- **Desempate (confirmado em 08/11/2026):** ordem alfabética do **código** da supervisão ou da gerência (ex.:
  `SV.an1`, `SV.g2.1`), comparação de texto simples sobre o id da API em minúsculas. Em ordem alfabética simples,
  `SV.g2.10` vem antes de `SV.g2.2`.

## 6. Premiação (por posição; sem valores; referência — não é exibida no painel)

| Prêmio | Quem ganha |
| --- | --- |
| Viagem internacional (Aruba), com acompanhante | Diretoria, 1 GP, GC do 1º ao 4º |
| Viagem nacional (Fernando de Noronha), com acompanhante | GC 5º e 6º |
| Cruzeiro Santos → Rio de Janeiro | Supervisor Mista do 1º ao 8º; Supervisor Segmentada 1º e 2º |
| Premiação Plus (ar-condicionado) | Supervisor Mista do 9º ao 12º; Supervisor Segmentada 3º |

Diretoria e GP são premiados, mas não têm apuração própria: o painel mostra só a linha "Total Band".

## 7. Medidas e colunas do painel

| Medida | Definição |
| --- | --- |
| Meta | Meta do mês (volume: META_VOLUME; cobertura: META_COBERTURA) |
| Real | Venda até ontem (D-1) |
| Hoje / Online | Venda de hoje (cobertura: só clientes novos no mês) |
| Diferença | Real + Online − Meta |
| % | (Real + Online) ÷ Meta; cálculo sem arredondar, tela truncada |
| Meta dia — volume | `meta_dia` pronta da API (meta dinâmica); o painel só **ajusta a exibição** (decisão de 09/11/2026): Real > Meta → 0; `meta_dia` negativo → 0; nulo (API em fechamento) → "—". Fora isso, nunca recalcular. A comparação usa só o Real (até ontem), sem o Online (premissa a confirmar) |
| Meta dia — cobertura | Calculada no painel: **(Meta − Real) ÷ dias úteis restantes**, com o Real até ontem (D-1). É **travada**: não muda com o Online do dia (decisão de 08/11/2026). No último dia útil, a diferença total (Meta − Real); meta batida (Real ≥ Meta) = 0. Dias úteis restantes = `calendario.dias_uteis_restantes` (no código, total − dia_ontem): em dia útil **conta o dia de hoje**; em dia não útil não conta; com 0 restantes, usa a diferença total. Exibição: inteiro arredondado para cima (confirmado em 08/11/2026); Real > Meta → 0; valor entre 0 e 1 → 1 (decisão de 09/11/2026) |
| Casas decimais | Volume com 1 casa; cobertura sem casa |

**Tabelas de ranking (Ranking GC e Supervisão), decisão de 08/11/2026.** Cada linha traz dois blocos, mais a
posição e o status:

| Parte | Colunas |
| --- | --- |
| Identificação | RANK · Gerência (ou SV) |
| Aperitivo (volume) | Meta · Real · M. Dia · Online · Dif · Out · Nov · Dez (só em dezembro) · **% Acum.** (os % mensais com a trava somados; é a pontuação do ranking). Sem texto de gatilho no cabeçalho |
| Skyy (cobertura · clientes) | Meta · Real · M. Dia · Online · Dif · % do mês · % Nov (só em dezembro) · **% Médio** (era "% Acum."; = gatilho: média simples de novembro e dezembro; em novembro, parcial) |
| Resultado | Status (só o selo: "✓ Bateu!" ou "-"; exige os dois pilares, seção 5) |

- **Seletor "Mês de referência"** (Ranking GC; vale também na Supervisão): troca **Meta, Real, Dif e o % do mês** dos
  dois blocos pelo mês escolhido. **Não muda** Out, Nov, Dez, Soma, % Nov e % Acumulado. O padrão é o mês de referência
  da API; mês sem dado fica desabilitado.
- **M. Dia e Online** só existem no mês aberto; nos demais meses aparecem "—". Skyy de outubro: "—" (o fechado ainda
  não traz cobertura, pendência 10).
- **Dif** = Real + Online − Meta, no mês escolhido. **Vermelha quando < 0** (decisão de 09/11/2026; substitui o laranja).
- **Cores dos blocos (Ranking GC e Supervisão; decisão de 09/11/2026):** Aperitivo em laranja e Skyy em azul, no padrão do Q4:
  título do bloco em tom escuro (mais claro que o laranja e o azul de base) e corpo em tom bem claro.
- **% do mês e % Acumulado de Skyy** (Ranking GC e Supervisão) com o quadradinho pintado, como o % e os pontos do Q4:
  verde quando o valor bruto é ≥ 100% e vermelho quando < 100% (a tela trunca, a cor usa o bruto: 99,96% é vermelho).
  Sem valor ("—"): sem quadradinho.
- **Sem legendas** no Ranking GC e na Supervisão (decisão de 09/11/2026): saem a legenda do selo, a explicação da trava e da
  soma e o aviso "N fora do ranking". O rodapé comum continua.
- **Ajustes de tabela (decisão de 09/11/2026, fim da tarde):** (1) o conteúdo das células fica **centralizado** em todas as tabelas de todas as
  abas; (2) a coluna **Dez** do Aperitivo só aparece quando o mês de referência é dezembro; (3) a linha do total mostra só "Total Band" (sem
  "Diretoria e GP"); (4) o **Detalhe do mês** usa as mesmas cores da tabela de ranking (blocos laranja e azul, Dif vermelha, quadradinhos).
- **Quadradinho no % do Aperitivo (decisão de 09/11/2026, 16h20):** **só na coluna do mês vigente** (a do mês de referência). Em outubro ou
  novembro: verde quando o % bruto ≥ **130%** (o limite da trava), vermelho abaixo de 130%; em dezembro (sem trava): verde a partir de **100%**,
  vermelho abaixo. A coluna **% Acum. não ganha quadradinho**, nem as colunas dos outros meses. Sem valor: sem quadradinho. A cor usa o valor
  bruto, nunca o truncado (129,99999 é vermelho; 130 é verde).
- **Fonte do Aperitivo (decisão de 09/11/2026, 16h25):** os números do bloco Aperitivo (Out, Nov, Dez, % Acum.) têm o mesmo tamanho, peso e fonte
  dos números do bloco Skyy; hoje são maiores e em fonte condensada.
- **Paginação (decisão de 09/11/2026):** Supervisão, Consultor e a visão **Supervisão** do Detalhe do mês mostram **15 linhas por página**, com botões de
  navegação (‹ 1 2 ›) no lugar da rolagem. **A visão Gerência do Detalhe do mês não é paginada** (decisão de 09/11/2026, fim da noite): 16 linhas e o Total Band
  numa tela só; o **Total Band** fica fixo no rodapé de todas as páginas. **Consultor abre com todas as rotas** (filtro de SV em "Todas").
- **Total Band** é a última linha das tabelas de ranking e do Detalhe do mês (mockup de 08/11/2026), sem coluna lateral
  e sem o quadro "Mecânica"; no bloco Aperitivo, sem ranking, **mas com o % Acum.** (v1.12): soma dos % mensais do Total Band (`resumo.json` → `empresa`, e o `fechado` dos meses fechados), cada mês = (Real + Online) ÷ Meta da empresa, bruto, com a trava de 130% em out e nov (dez sem trava), a mesma conta das linhas. Exemplo em 10/11/2026: out 88,1% + nov 17,3% = 105,4%. ⚠️ Premissa: soma dos % **da empresa**, não média nem soma dos % das gerências.
- **Consultor e Detalhe do mês:** mesmas colunas (Meta, Real, M. Dia, Online, Dif, %) nos dois grupos, **Volume de
  Aperitivo** e **Cobertura de Skyy · clientes**.
- **"Hoje" colorido (confirmado em 08/11/2026):** quando **Online > 0 e Online ≥ Meta dia**. Meta dia 0 com Online > 0
  colore; meta dia 0 com Online 0 não colore; meta dia nula (API em fechamento) não colore. A comparação usa a meta dia
  **exibida** (a da decisão de 09/11/2026), para a cor concordar com o número da coluna ao lado.

## 8. Dados da API (estado em 09/11/2026, 10:30)

- `Aperitivo` e `Skyy` **estão publicados** como agrupadores extras (`ajustes.json` → `agrupadores`). Em
  `index.json` viram os produtos `aperitivos` e `skyy`, com `"extra": true`, `agrupadores` `["Aperitivo"]` e
  `["Skyy"]`, o bloco de volume e o bloco `cobertura`. Conferir os ids no `index.json` antes de usar.
- Novembro: o `cobertura.meta` do Aperitivo é `null` na empresa (sem meta de cobertura; não atrapalha, o gatilho
  é só de Skyy). O Skyy tem meta de cobertura na maior parte das rotas.
- `fechado/202610.json` está em **prévia** (`fechamento_final: false`) e já traz os dois produtos, **sem cobertura**.
- **Meta dia de volume:** em 08/11/2026 vinha 0,0 em todas as rotas dos dois produtos, porque era domingo (dia não
  útil). Em 09/11/2026 (dia útil) a API traz valores; alguns **negativos** nas rotas com meta batida, iguais aos do
  SAC (pendência 15 resolvida). Na foto de 09/11/2026 às 10:30 havia 7 blocos com meta dia negativa e 20 com Real
  acima da Meta — os dois casos da regra de exibição da seção 7.

## 9. Fechamento do mês

Mesma regra do repositório: o mês fechado fica em **prévia** até o Back Office marcar o flash de vendas (por
volta do dia 12) e só então vira oficial. Nunca selar por data. Outubro: ainda não selado em 09/11/2026,
previsão 12/11/2026.

## 10. Pendências ⚠️

| # | Pendência | Situação em 09/11/2026 | Quem |
| --- | --- | --- | --- |
| 9 | Publicar `Aperitivo` e `Skyy` como agrupadores extras | **Resolvida** (seção 8) | — |
| 10 | Incluir a cobertura no `fechado/AAAAMM.json` (campo novo). Sem isso, em dezembro não há cobertura de novembro para o gatilho | Em aberto: o Matheus vai ajustar. Prazo: 01/12/2026 | Matheus |
| 11 | % de cobertura de SV e GC | **Resolvida**: meta só das rotas com meta; realizado e online de todas as rotas (seção 4) | — |
| 12 | Meta dia de cobertura: a "meta restante" desconta só o Real ou o Real + Online? | **Resolvida**: só o **Real**; meta dia travada (seção 7) | — |
| 13 | Repositório público, com nomes de clientes e pessoas nos JSONs | **Confirmado** em 08/11/2026 (clone anônimo funcionou). Alta prioridade | Karen / TI |
| 14 | Dias úteis restantes da meta dia de cobertura: contam hoje? | **Resolvida** pelo código (seção 7) | — |
| 15 | Meta dia de volume de Aperitivo e Skyy zerada em dia útil? | **Resolvida** em 09/11/2026: a API traz o valor em dia útil e confere com o SAC; negativos são do cálculo do SAC. Exibição: Real > Meta ou negativo → 0 (seção 7) | — |
| 16 | Meta dia de cobertura exibida como inteiro arredondado para cima (cliente não se divide) | **Resolvida** em 08/11/2026: arredonda para cima (seção 7) | — |
| 17 | "Hoje" colorido: o que fazer com meta dia 0 | **Resolvida** em 08/11/2026: colore quando Online > 0 e Online ≥ Meta dia (seção 7) | — |
| 18 | Seletor "Mês de referência" do Ranking GC | **Resolvida** em 08/11/2026: o % acumulado não muda; trocam só Meta e Real (e o que deriva deles). Detalhes na pendência 20 | — |
| 19 | Coluna "Cob. Skyy" do ranking | **Resolvida** em 08/11/2026: dois blocos com Meta, Real, M. Dia, Online, Dif e %s, para Skyy e Aperitivo (seção 7) | — |
| 20 | Detalhes do seletor e das colunas: M. Dia e Online "—" fora do mês aberto; Skyy de outubro "—"; o seletor também vale na Supervisão (o mockup só o mostra no Ranking GC); Aperitivo mantém Out, Nov, Dez e Soma; "% Nov" mostra sempre o % de novembro | **Resolvida** em 08/11/2026: a Karen confirmou os cinco pontos (seção 7) | — |
| 21 | Mockup das tabelas de ranking | **Resolvida** em 08/11/2026: a Karen atualizou o mockup (dois blocos; Total Band como última linha, sem coluna lateral nem quadro Mecânica). No bloco Aperitivo o mockup mostra % do mês e % Acum.; vale a v1.3 (Out · Nov · Dez · Soma) | — |
| 22 | Meta dia de volume: a comparação Real × Meta considera só o Real (D-1) ou Real + Online? | Em aberto (premissa da seção 7, registrada na v1.4). Hoje o painel usa só o Real e não sinaliza na tela (v1.12: pendências só aqui e no checklist) | Karen |
| 23 | Arte do fundo (`campari-fundo.jpg`) entregue em 1568×777, ampliada para 1920 na tela | Em aberto: conferir se existe o original em 1920 px de largura | Karen |
| 27 | Detalhe do mês paginado (a 4G paginou também o Detalhe) | **Resolvida** em 09/11/2026 (fim da noite): sem paginação na visão Gerência; a visão Supervisão continua paginada (seção 7) | — |
| 28 | Cabeçalho do bloco Aperitivo com o texto "GATILHO ≥ 100,0%" | **Resolvida** em 10/11/2026: o texto sai do cabeçalho; o volume tem mínimo, não gatilho (seção 2.2) | — |
| 29 | Nome da coluna única de posição oficial | **Resolvida** em 10/11/2026: "RANK"; rodapé "RANK: posição oficial, só de quem bateu os dois pilares" | — |
| 26 | Status com os dois pilares: premissas | (a), (c) e (d) confirmadas em 10/11/2026. (a) no mínimo de volume não há parcial: vale o mês vigente. **Em aberto só a (b)**: % de volume nulo (meta nula ou ≤ 0) deixa o mínimo indisponível | Karen |
| 25 | Centralização total e limite de 100% em dezembro para o quadradinho do Aperitivo | **Resolvida** (confirmada em 10/11/2026) | — |
| 24 | Ranking GC pela gerência comercial agrupada do SAC | **Resolvida** (print do SAC, 12 linhas, seção 4; premissas confirmadas em 10/11/2026) | — |

## 11. Intencionalmente fora deste arquivo

Orçamento, custo dos prêmios e valores de premiação.
