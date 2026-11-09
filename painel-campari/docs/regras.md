# Campari Club 2026 — Regras do incentivo (Coca-Cola Bandeirantes) — v1.1 (08/11/2026)

Rascunho do futuro `painel-campari/docs/regras.md`. Itens marcados com ⚠️ são interpretações a confirmar
(seção 10): use-os como estão descritos e sinalize no painel; não decida.

**v1.1 (08/11/2026, 21:47):** decisões da Karen sobre as pendências 11 e 12 (seções 4, 7 e 10); a "meta restante"
da meta dia de cobertura desconta só o **Real** (D-1); a meta dia de volume zerada em 08/11 é por ser domingo; o
estado da API foi atualizado (Aperitivo e Skyy já publicados, ids `aperitivos` e `skyy`; seção 8); a pendência 9
está resolvida; o gatilho de dezembro será ajustado pelo Matheus (pendência 10).

## Hierarquia das fontes

1. Decisões da Karen (IM), de 06/11/2026, 08/11/2026 e 08/11/2026 (21:47): prevalecem sobre tudo e estão
   incorporadas abaixo.
2. `INCENTIVO_CAMPARI_CLUB_FECHAMENTO_DE_2026.pptx` (apresentação oficial).
3. `Incentivo_Campari_Club_Q4.xlsx` (orientações de formato): só onde a apresentação é omissa.

Conflito resolvido: o slide 2 mostra "Dez 130%" com um carimbo por cima. Vale a decisão de 06/11/2026:
**dezembro não tem trava**.

## 1. Visão geral

- **Vigência:** outubro, novembro e dezembro de 2026.
- **Mecânica:** um gatilho de cobertura de Skyy habilita o participante, e o ranking é feito por volume de
  aperitivo.
- **Níveis com ranking e premiação:** Gerente Comercial (GC), Supervisor Mista e Supervisor Segmentada.
- **Consultor (Rota):** Rota = Consultor. Aparece no painel, mas não tem ranking nem premiação
  ("contabilizado do supervisor para cima").
- **Diretoria e GP:** total de todas as gerências, numa linha "Total Band". Sem página própria.

## 2. Gatilho — cobertura de Skyy

- Medida: cobertura do agrupador **Skyy** (bloco `cobertura` do produto extra `skyy` na API).
- **Cobertura:** o cliente conta uma vez no mês, na primeira venda de qualquer SKU. Uma nova compra do
  mesmo cliente no mês não conta de novo.
- Meta: `META_COBERTURA_Chave_Meta_SAP` (modelo `AM_FAT_BND_ANALISE_META`). Realizado: pronto no Datasphere
  (`FX_COBERTURA_REALIZADO`).
- **% do mês** = (realizado + online_hoje) ÷ meta, sem arredondar.
- **Gatilho** = média simples dos % de cobertura de **novembro e dezembro**, **mínimo 100%**. Outubro não
  entra. Em novembro, o gatilho aparece como parcial (só novembro).
- **Online de cobertura:** só clientes ainda não cobertos no mês com pedido válido hoje.

## 3. Ranking — volume de aperitivo

- Medida: volume do agrupador **Aperitivo** (produto extra `aperitivos` na API; um único agrupador, com meta de
  volume).
- **% do mês** = (Real + Online) ÷ Meta, bruto (não usar o `atingimento_pct` inteiro da API).
- **Trava:** o % do mês é limitado a **130% em outubro e novembro**. **Dezembro sem trava.**
- **Pontuação do ranking** = soma dos % mensais (out + nov + dez) já com a trava.
- Ranking separado por nível: GC (único), SV Mista e SV Segmentada.
- **Ranking parcial:** usa Real + Online no mês aberto. Meses fechados: só o realizado.
- **Outubro:** vem do `fechado/202610.json` e segue a chave do faturamento (regra até out/26). Novembro e
  dezembro seguem a chave da meta. ⚠️ A soma mistura os dois critérios.

## 4. Quem soma o quê

- **Rota:** os próprios números.
- **SV:** soma de **todas** as rotas da mesa, inclusive as sem canal, no volume e na cobertura.
- **GC:** soma de **todas** as rotas da gerência.
- **Total Band:** total da empresa (`resumo.json` → `empresa`).
- **Canal do SV (Mista ou Segmentada):** mesma regra do Desafio Q4 — o canal escolhido pelo admin
  (`ajustes.json` → `canaisSV`) ou, sem escolha, o da maioria das rotas da mesa. Canais das rotas: os mesmos
  do Q4 (base embutida + ajustes do admin).
- **Cobertura de SV e GC (decisão de 08/11/2026):** a cobertura soma **somente as rotas com meta de
  cobertura**. ⚠️ Leitura adotada: o realizado e o online também entram **só dessas rotas** (hoje a API soma a
  meta só das rotas com meta, mas o realizado de todas). Confirmar com a Karen antes do motor do gatilho
  (pendência 11). Um cliente não é atendido por duas rotas; se mudar de rota, conta na rota informada.

## 5. Posição, status e desempate

- Todas as linhas recebem posição. Quem não bate o gatilho aparece com a posição em **cinza** e fica fora da
  premiação (mesma leitura do Q4).
- **Desempate:** ordem alfabética do **código** da supervisão ou da gerência (ex.: `SV.an1`, `SV.g2.1`).
  ⚠️ Em ordem alfabética simples, `SV.g2.10` vem antes de `SV.g2.2`.

## 6. Premiação (por posição; sem valores)

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
| Meta dia — volume | `meta_dia` pronta da API (meta dinâmica). Não recalcular |
| Meta dia — cobertura | Calculada no painel: **(Meta − Real) ÷ dias úteis restantes**, com o Real até ontem (D-1). É **travada**: não muda com o Online do dia (decisão de 08/11/2026). No último dia útil, a diferença total (Meta − Real); meta batida = 0. ⚠️ Dias úteis restantes: confirmar se contam o dia de hoje (pelo `calendario.py`, em dia útil contam; conferir `calendario.dias_uteis_restantes` do `index.json`) |
| Casas decimais | Volume com 1 casa; cobertura sem casa |

Colunas pedidas: Meta, Real, Meta dia, Hoje, Diferença, %. Abrir o % de cobertura de cada mês (novembro e
dezembro) e a média. Colorir "Hoje" quando atingir a meta dia.

## 8. Dados da API (estado em 08/11/2026, 20:37)

- `Aperitivo` e `Skyy` **estão publicados** como agrupadores extras (`ajustes.json` → `agrupadores`). Em
  `index.json` viram os produtos `aperitivos` e `skyy`, com `"extra": true`, `agrupadores` `["Aperitivo"]` e
  `["Skyy"]`, o bloco de volume e o bloco `cobertura`. Conferir os ids no `index.json` antes de usar.
- Novembro: o `cobertura.meta` do Aperitivo é `null` na empresa (sem meta de cobertura, o que não atrapalha: o
  gatilho é só de Skyy). O Skyy tem meta de cobertura em 173 das 233 rotas.
- `fechado/202610.json` está em **prévia** (`fechamento_final: false`) e já traz os dois produtos (248 rotas; meta
  de Aperitivo em 205 e de Skyy em 202), **sem cobertura**.
- **Meta dia de volume:** em 08/11/2026 vem 0,0 em todas as rotas dos dois produtos. Explicação da Karen: hoje é
  domingo (dia não útil). ⚠️ Conferir em dia útil, a partir de 09/11/2026.

## 9. Fechamento do mês

Mesma regra do repositório: o mês fechado fica em **prévia** até o Back Office marcar o flash de vendas (por
volta do dia 12) e só então vira oficial. Nunca selar por data. Outubro: ainda não selado em 08/11/2026,
previsão 12/11/2026.

## 10. Pendências ⚠️

| # | Pendência | Situação em 08/11/2026 | Quem |
| --- | --- | --- | --- |
| 9 | Publicar `Aperitivo` e `Skyy` como agrupadores extras | **Resolvida**: publicados (seção 8) | — |
| 10 | Incluir a cobertura no `fechado/AAAAMM.json` (campo novo). Sem isso, em dezembro não há cobertura de novembro para o gatilho | Em aberto: o Matheus vai ajustar. Prazo: 01/12/2026 | Matheus |
| 11 | % de cobertura de SV e GC | **Respondida**: somente rotas com meta. ⚠️ Confirmar se o realizado e o online também entram só dessas rotas (seção 4) | Karen |
| 12 | Meta dia de cobertura: a "meta restante" desconta só o Real ou o Real + Online? | **Resolvida**: só o **Real** (até ontem); a meta dia é travada (seção 7) | — |
| 13 | Repositório público, com nomes de clientes e pessoas nos JSONs | **Confirmado** em 08/11/2026 (clone anônimo funcionou). Alta prioridade | Karen / TI |
| 14 | Dias úteis restantes da meta dia de cobertura: contam hoje? | Novo: conferir no PASSO 0 da etapa do motor | Claude Code |
| 15 | Meta dia de volume de Aperitivo e Skyy zerada em dia útil? | Novo: conferir a partir de 09/11/2026 | Karen |

## 11. Intencionalmente fora deste arquivo

Orçamento, custo dos prêmios e valores de premiação.
