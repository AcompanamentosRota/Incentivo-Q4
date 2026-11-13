# Desafio Q4 2026 — Regras do incentivo (Coca-Cola Bandeirantes) — v3.8 (13/11/2026)

**v3.8:** entra a **exclusão de volume de nota fiscal do fechamento** (decisão informada pela Karen em
13/11/2026; seção 8). O Back Office pode tirar o volume de uma nota do fechamento de um mês: a primeira é a de
**outubro/26**, na rota **R32** (gerência RV), no agrupador de **Powerade**. Nada do cálculo do incentivo muda —
pontos, faixas, gatilhos, confrontos, ranking e status continuam como estão —, porque a R32 é rota **virtual e sem
canal**: o volume dela entra só nos totais da gerência e, por isso, na aba **Estratégicos**.

**v3.7:** **Missões Guiadas de novembro passa a pontuar com dado real** (decisão informada pela Karen em
10/11/2026; seções 4 e 9). O realizado da rota é a soma, no mês, de **duas** missões — "Aumente A Família" e
"Traga De Volta" —, a meta da rota é **10**, e o Supervisor soma as rotas da mesa dos dois lados (realizado somado e
meta de 10 por rota que entra na soma). Outubro continua validada em 100% e dezembro continua sem meta. Com isso a
**pendência 5** (fonte de Missões Guiadas) está **resolvida para novembro** e continua aberta para dezembro.

**v3.6:** o mínimo de pontos do **Consultor** passa a ser **17 no mês** (decisão da gerência de planejamento e da IM em
29/10/2026; seções 3, 6, 7 e 8). O **+5 do confronto é só do SV vencedor**: as rotas (Consultores) da mesa **não
recebem** (decisão informada pela Karen em 03/11/2026; seções 1, 5, 6 e 8), e o teto da Rota passa de 30 para **25
pontos**. Entram também, de decisões de 28/10 a 03/11/2026 já implementadas no painel: **canal × segmento** e **canal
do SV** (seções 1 e 10), os **Estratégicos** no painel (seção 1) e o **Real e o Online pela chave e pela rota da meta**
a partir de novembro/26 (seção 8). Entra também a decisão de **04/11/2026** de que o **fechamento do mês cobre os
Estratégicos**, além de Consultores e Supervisões — sempre só com volume, sem pontos nem premiação (seção 8). A
pendência "Real até ontem × faturado de hoje" está **resolvida**, e a dos **+5 do confronto no mês fechado** fica
respondida: entram no dia 1 do mês seguinte e são atualizados até o fechamento do flash, quando congelam (05/11/2026;
seções 5, 8 e 9).

**v3.5:** o **fechamento oficial** de cada mês é feito **depois do fechamento do flash de vendas** (decisão informada
pela Karen em 04/11/2026; seções 8 e 9). Até lá o mês fica em **prévia**: os números ainda mudam, porque notas fiscais
são canceladas e retornadas. Quem marca que o flash de um mês fechou é o Back Office, no painel — a data varia todo mês
e não existe dia fixo.

**v3.4:** os pilares **coringa 4 e 5 de novembro** são os mesmos de outubro (decisão informada pela Karen em
04/11/2026; seção 4). Dezembro continua com os coringas **a decidir**, e Missões Guiadas de novembro segue **sem fonte**
de meta e realizado por rota (seção 9).

**v3.3:** o status "No total" passa a se chamar **"Bateu!"** (decisão da Karen em 31/10/2026). Muda só o nome: a regra é a
mesma, e "Bateu, mas não está no total" segue como está (seções 8 e 9).

**v3.2:** o +5 do confronto só entra depois do fechamento do mês, nos pontos acumulados do SV e nos pontos daquele mês da
mesa (decisão informada pela Karen em 30/10/2026; seções 1, 5, 6, 8 e 9). A parte da **mesa** foi substituída na
v3.6: a Rota não recebe o +5.

**Hierarquia das fontes**
1. Respostas do Back Office/IM (23/10/2026): prevalecem sobre tudo e estão incorporadas abaixo.
2. `Desafio_Q4_Bandeirantes.html` (apresentação oficial).
3. `Incentivo Q4 2026.xlsx` (abas *Mecânica* e *Pilares e Premiação*): só onde o HTML é omisso.
4. O PPTX "Desafio_Q4_Bandeirantes_2026_V2" foi **descartado**.

**Vigência:** outubro, novembro e dezembro de 2026 (Q4).
**Como usar este arquivo:** é a fonte de verdade das regras. Itens marcados com ⚠️ são interpretações a confirmar (seção 9): use-os como estão descritos e sinalize uma nota no painel.

---

## 1. Visão geral

- **Participantes:** Supervisores (SV) e Consultores de Vendas (Rota/RT), em um canal: **Mista**, **Segmentada** ou **Sem canal** (ver abaixo). Cada Consultor pertence à "mesa" de um SV (campo `id_supervisor` no cadastro).
- **Canal × segmento (decisão de 28/10/2026; "Mini e Mod = Segmentada" confirmado em 30/10/2026):** para a regra existem três situações — **Mista**, **Segmentada** e **Sem canal**. O **segmento** é só etiqueta e não muda a regra: Segmentada → **Mini** ou **Mod**; Sem canal → **Neutraliza**, **Eventual**, **Coke Net** ou **Virtual**; Mista não tem segmento. **Mini e Mod são o mesmo canal** para tudo: pilares, ranking, premiação e confronto.
  - A rota **Sem canal** fica **fora dos pontos, do ranking e da premiação da Rota**, e aparece como alerta no painel, com o segmento dela.
  - O **volume e a meta** da rota Sem canal **contam na soma do SV** (decisão informada em 30/10/2026). Decidido, com **implementação pendente**: hoje o painel ainda deixa essas rotas fora da soma do SV (seção 9).
- **Canal do SV (decisão de 29/10/2026) ⚠️:** cada SV aparece em **um canal só** — o escolhido pelo admin ou, sem escolha, o da **maioria das rotas da mesa**. **Empate** (mesmo número de rotas Mista e Segmentada) deixa o SV **fora do ranking**, com aviso no painel, até o admin escolher. O SV é medido nos pilares do canal dele; cada rota continua no ranking do canal dela.
- **Mecânica:** (1) pontos por desempenho em 5 pilares; (2) confrontos entre SVs (+5 pontos **só para o SV vencedor**, que só entram depois do fechamento do mês); (3) gatilhos para validar pontos e entrar na premiação; (4) ranking por cargo e canal.
- **Base de medição:** todos os pilares são avaliados em **TT mês, % sobre a meta**.
- **Estratégicos:** medidos nos pilares da SV Mista, sem confrontos. **Têm aba própria no painel**, que mostra o **volume da gerência inteira** (todas as rotas com Real), **sem pontos e sem premiação**.

## 2. Pontuação por pilar (por mês)

| % do pilar sobre a meta | Limite de cálculo | Pontos |
|---|---|---|
| < 90% | até 89,99999% | 0 |
| ≥ 90% e < 100% | até 99,99999% | 2 |
| ≥ 100% e < 105% | até 104,99999% | 3 |
| ≥ 105% | — | 5 |

- Os limites têm **5 casas decimais**: 90,00000% já vale 2 pontos; 100,00000% vale 3; 105,00000% vale 5.
- Calcular com o valor **sem arredondar**. ⚠️ Ao exibir, **truncar** (não arredondar) para que 99,96% não apareça como "100,0%" valendo 2 pontos.

## 3. Gatilhos

| Cargo | Gatilho de pontos | Período |
|---|---|---|
| SV | 60 pontos | Trimestral (out, nov, dez), **acumulado** |
| Consultor (RT) | 17 pontos | **Mensal**; a pontuação zera todo mês |

- **Mínimo do Consultor = 17 pontos no mês** (decisão da gerência de planejamento e da IM em 29/10/2026; antes eram 20).
  O mínimo do SV continua em **60 pontos** acumulados no trimestre.

**Gatilho de volume:** para os pontos **valerem**, é necessário **≥ 95% do volume da categoria Refrigerantes** (vs meta). A medida é a da categoria Refrigerantes no SAC, e não a soma dos pilares.
- **Consultor:** % do **mês vigente**.
- **SV:** % **acumulado** do trimestre (outubro até o mês vigente).
- Enquanto o gatilho de volume não é atingido, **os pontos não valem**: o status fica **"-"** e a pessoa fica fora do ranking e da premiação. Os pontos de cada pilar, os atuais e os acumulados **continuam aparecendo** no painel (decisão de 26/10/2026; antes ficavam "-").

## 4. Pilares por cargo (iguais para SV e Consultor)

| # | Mista | Segmentada |
|---|---|---|
| 1 | Volume Sabores | Volume Sabores |
| 2 | Volume Retornáveis | Volume Refri Single |
| 3 | Missões Guiadas | Volume Powerade |
| 4 (Coringa Still) | Volume Sucos | Volume Sucos |
| 5 (Coringa Still) | Volume Powerade | Missões Guiadas |

- **Pilares 4 e 5 são "coringa" e mudam de mês para mês.** A tabela acima vale para **outubro** e, desde 04/11/2026, também para **novembro**; dezembro pode trazer outros pilares. Não fixar pilares no código: ler a configuração mensal dos dados.

**Novembro** (pilares 1 a 3: decisão do Back Office, informada pela Karen em 29/10/2026; **coringas 4 e 5 iguais aos de
outubro**, informado pela Karen em 04/11/2026):

| # | Mista | Segmentada |
|---|---|---|
| 1 | Volume Sabores | Volume Sabores |
| 2 | Volume Retornáveis | Volume Refri Single ("Volume Individuais") |
| 3 | Missões Guiadas | Volume Powerade |
| 4 (Coringa) | Volume Sucos | Volume Sucos |
| 5 (Coringa) | Volume Powerade | Missões Guiadas |

**Dezembro** (pilares 1 a 3: decisão do Back Office, informada pela Karen em 29/10/2026; coringas 4 e 5 **a decidir**):

| # | Mista | Segmentada |
|---|---|---|
| 1 | Volume Sabores | Volume Sabores |
| 2 | Volume Retornáveis | Volume Refri Single ("Volume Individuais") |
| 3 | Missões Guiadas | Volume Powerade |
| 4 (Coringa) | a decidir | a decidir |
| 5 (Coringa) | a decidir | a decidir |

- Os pilares 1 a 3 são os mesmos de outubro nos dois meses. Enquanto os coringas 4 e 5 de dezembro não forem decididos, o painel mostra "Pilares de dezembro ainda não configurados" e não calcula pontos nem ranking desse mês.
- **Pilares de volume** (os únicos válidos em confronto): todos, exceto Missões Guiadas.
- **Missões Guiadas:** em **outubro** entra **validada em 100%** para todos os cargos que a têm, o que vale **3 pontos**. De **novembro** em diante o pilar tem meta e realizado e pontua nas mesmas faixas dos demais.

**Missões Guiadas de novembro (decisão informada pela Karen em 10/11/2026):**

| Medida | Regra |
|---|---|
| **Realizado da rota** | A soma, no mês, de **duas** missões: **"Aumente A Família"** e **"Traga De Volta"**. As demais missões do arquivo (Combo Especial Da Semana, Positivar Itens do Combo, Combo Fitness, Desafio Da Semana) **não contam**. |
| **Meta da rota** | **10**, igual para todas as rotas. |
| **Supervisor** | A soma das rotas da mesa nos **dois lados**: realizado somado e meta de **10 por rota que entra na soma do SV** (nunca 10 fixo para o SV). |
| **Online / meta dia** | Não existem para o pilar: a fonte não traz nem um nem outro. |

- A fonte é o `missoes.json` da API (modelo `AM_FAT_BND_GM_PROGRESSO_TAREFA`), que traz o realizado por missão e por
  rota. O arquivo **não filtra por data**: escolher quais missões contam em cada mês é o que define o mês (⚠️ se uma
  dessas missões atravessar mais de um mês, o número inclui o que veio de fora de novembro).
- **Rota que não aparece no arquivo** fica com realizado nulo: o pilar é "sem dados" para ela, não pontua e entra nos
  alertas do painel. Nunca vira zero. O mesmo vale quando o arquivo falta ou nenhuma das missões é encontrada.
- Códigos de rota que existem só no arquivo e não no cadastro da API (`EVI`, `EVM`, `EVS`) são **ignorados** e
  aparecem nos alertas.
- **Dezembro** ainda não tem meta nem lista de missões decididas: enquanto não tiver, o pilar aparece "sem dados" e
  **não pontua** — nunca se assume 100%.
- A meta e a lista de missões ficam na **configuração** do painel (e podem ser trocadas pelo admin), nunca fixas no
  código ou na tela.

## 5. Confrontos entre supervisores

1. Os confrontos são entre SVs; cada SV decide quem desafiar.
2. O desafio é registrado **na plataforma do incentivo**; depois o SV manda o vídeo no grupo. Vale o registro na plataforma e a **ordem de registro**.
3. Só vale em **pilares de volume** do cargo do SV, sempre em TT mês % sobre a meta.
4. Todo desafiado entra automaticamente no confronto.
5. **Mista só desafia Mista e Segmentada só desafia Segmentada.**
6. Cada SV pode **receber no máximo 1 desafio**.
7. Se todos forem desafiados antes, quem demorou fica sem confronto. Quem não participa perde a chance dos +5 pontos.
8. O Time de Categorias compila os desafios e entrega para a IM.

**Apuração:** vence quem tiver o melhor % sobre a meta do mês no pilar escolhido. **Quem perde não perde nada**; apenas o vencedor ganha os **+5 pontos** daquele mês.
**O +5 é só do SV (decisão informada pela Karen em 03/11/2026):** as rotas (Consultores) da mesa do SV vencedor **não recebem** os +5 pontos. Substitui a regra anterior, de "+5 para o SV e para toda a mesa". Com isso o **teto da Rota é 25 pontos no mês** (5 pilares × 5), e não 30.
**Quando os +5 entram (decisão de 30/10/2026):** **só depois do fechamento do mês**. O SV recebe os +5 nos **pontos acumulados** do trimestre. Durante o mês o vencedor é **parcial**: aparece na tela Confrontos como "vencendo", e os +5 não entram nos pontos, no gatilho de pontos, no status nem no ranking. O mês conta como fechado já no **período de fechamento da API** (do dia 1 até o fim do 1º dia útil do mês seguinte, quando o painel mostra o mês fechado, sem Online).
**Enquanto o mês está em prévia, o +5 é provisório (resposta da Karen em 05/11/2026):** os pontos do confronto entram no
**dia 1 do mês seguinte** e são **atualizados a cada rodada** até o fechamento do **flash de vendas** — o vencedor é
reapurado com os números daquele momento e **pode mudar**. Quando o Back Office marca o flash, o mês sela e o resultado
do confronto **congela** junto (seção 8).
**Desempate (confronto e ranking):** vence o maior % de volume de Refrigerantes.
**No painel:** os confrontos do mês são cadastrados na aba Regras > Administração (mês, SV desafiante, SV desafiado e pilar),
publicados por PR no `frontend/ajustes.json` e apurados na tela **Confrontos** (botão ao lado das abas), com o % de cada lado,
o vencedor e o motivo quando o confronto não vale.

## 6. Cenários de pontos (planilha, aba Mecânica)

| Perfil | Cenário | Pilares (mês / tri) | Confrontos (mês / tri) | Total (mês / tri) |
|---|---|---|---|---|
| SV Mista | Máx. | 25 / 75 | 5 / 15 | 30 / 90 |
| SV Mista | 100% | 15 / 45 | 5 / 15 | 20 / 60 |
| SV Mista | 90% | 10 / 30 | — / 0 | 10 / 30 |
| Rota | Máx. / Méd. / Mín. | 25 · 15 · 10 | — (a Rota não recebe o +5) | 25 · 15 · 10 — gatilho: 17 (mensal) |

**Leitura (interpretação):** os cenários equivalem a todos os 5 pilares em ≥105% (25), 100–105% (15) e 90–100% (10). Os 60 pontos do SV (66,7% do máximo de 90) exigem 100% nos 5 pilares **e** confronto vencido nos 3 meses (45 + 15). O **teto da Rota é 25** pontos no mês, só de pilares, porque o +5 do confronto é só do SV (seção 5). Desde 30/10/2026 os +5 do SV só contam com o mês fechado (seção 5): durante o mês, o SV vê só os pontos dos pilares.

⚠️ A planilha mostra os cenários só para Mistas; assumir a mesma escala para Segmentada.

## 7. Premiação (HTML oficial)

**Supervisores — ranking do trimestre, mínimo de 60 pontos e gatilho de volume**

| Posição | SV Mista | SV Segmentada |
|---|---|---|
| 1º | iPhone 18 Pro Max | iPhone 18 Pro Max |
| 2º | PS5 + R$ 2.000 em produtos | PS5 + R$ 2.000 em produtos |
| 3º | PS5 + R$ 1.000 em produtos | — |
| 4º | Robô de limpeza multifuncional Xiaomi | — |
| 5º | Lava-louças 14 serviços | — |
| 6º ao 12º | Air Fryer Forno 25L + R$ 1.000 em produtos (cada) | — |

**Consultores — premiação mensal (out, nov, dez), mínimo de 17 pontos no mês e gatilho de volume**

| Canal | Premiados | Prêmio |
|---|---|---|
| Mista | 1º ao 40º do ranking | R$ 1.000 em produtos (cada) |
| Segmentada | 1º ao 10º do ranking | R$ 1.000 em produtos (cada) |

## 8. Medidas e status do painel

| Medida | Definição |
|---|---|
| **Meta** | Meta do mês (TT mês) do pilar |
| **Real** | Volume vendido **até ontem** (o faturamento entra no modelo com um dia de atraso; o volume de hoje aparece só no Online) |
| **Meta dia** | Medida pronta vinda da API (não recalcular) |
| **Online** | Venda **de hoje** (parcial, muda várias vezes ao dia) |
| **Diferença** | Real + Online − Meta |
| **%** | (Real + Online) ÷ Meta |
| **Pontos atuais** | Pontos do mês corrente: pilares. No SV, os +5 do confronto vencido só entram depois do fechamento do mês (30/10/2026); a Rota não recebe o +5 (03/11/2026) |
| **Pontos acumulados** | SV: trimestre (meses fechados, com os +5 dos confrontos vencidos neles, + pilares do mês corrente). Consultor: não se aplica, pois zera todo mês ⚠️ |

**Chave do Real e do Online (decisão da Karen em 03/11/2026; a partir de novembro/26):** o Real e o Online são lidos
pela **chave da meta**, como a story do SAC: mês, agrupador e **rota da meta**, não a rota do cliente. A venda sem chave
de meta fica fora, as rotas **-EV deixam de existir** na API de novembro, e o Real de um produto só aparece depois que a
meta dele é carregada. **Outubro e os meses anteriores** seguem pela chave do faturamento.

**Fechamento do mês: prévia × oficial (decisão informada pela Karen em 04/11/2026)**

| Estado | O que significa |
|---|---|
| **Prévia** | O mês já encerrou, mas o resultado ainda pode mudar: até o fechamento do **flash de vendas** (o acompanhamento oficial de notas e volume da Bandeirantes, em torno do dia 12) notas fiscais são canceladas e retornadas. O painel marca o acumulado do trimestre do SV como **provisório**. |
| **Oficial** | O flash daquele mês fechou e o Back Office marcou isso no painel. O resultado do mês **congela**: não muda mais. |

- **O fechamento de cada mês cobre os três públicos** (decisão informada pela Karen em 04/11/2026): **Consultores**,
  **Supervisões** e **Estratégicos**. Para os Estratégicos vale o **volume por gerência**, **sem pontos, sem gatilhos e
  sem premiação**, como na aba Estratégicos (seção 1).
- A data do flash **varia de mês para mês**: não há dia fixo. O mês só vira oficial quando o Back Office marca, na
  Administração do painel, que o flash daquele mês fechou.
- Enquanto o mês está em prévia, os pontos, os gatilhos e o ranking continuam aparecendo e sendo calculados
  normalmente, com os números que existem naquele momento — o que muda é só o aviso de que o resultado é provisório.
- **Os +5 do confronto no mês fechado (resposta da Karen em 05/11/2026):** os pontos do confronto entram no **dia 1 do
  mês seguinte**, junto com o fechamento do mês na API, e são **atualizados até o dia do fechamento do flash de
  vendas**. Enquanto o mês está em **prévia**, o vencedor é **reapurado a cada rodada**, com os números daquele
  momento, e **pode mudar**; quando o Back Office marca o flash, o mês sela e o resultado do confronto **congela**
  junto. Isto responde a diferença que havia entre "mês fechado" para o +5 (seção 5, fechamento da API) e o fechamento
  oficial pelo flash: o +5 entra no primeiro e se fixa no segundo.
- **No painel:** a consulta do mês fechado fica em Regras > Administração, só leitura, com as três visões
  (Consultor, Supervisão e Estratégicos) e exportação em `.xlsx` (PR 29, 05/11/2026).

**Exclusão de volume de nota fiscal (decisão informada pela Karen em 13/11/2026):** o Back Office pode decidir que o
volume de uma **nota fiscal** não entra no fechamento de um mês. A regra:

- A exclusão vale **só para o Real**. Meta, META_NEG, meta de cobertura e os pedidos de hoje (Online) não mudam.
- Ela é aplicada **por linha, na consulta**, antes de qualquer soma: rota, supervisão, gerência, empresa e cobertura
  saem todas sem aquele volume de uma vez. **Nunca se subtrai de um total já montado.**
- A nota é identificada pelo **número dela**. A chave mês + cliente + rota + data + agrupador **não serve**: em
  13/11/2026, na R32/Powerade/31-10, o mesmo cliente tinha quatro notas do mesmo valor no mesmo dia.
- A **cobertura** do cliente naquele produto cai **só quando ele não tem outra nota** daquele produto no mês; quem
  tem outra continua coberto.
- O volume que saiu é **conferido** contra o valor declarado: saiu **mais** que o declarado, a rodada é **reprovada**
  e nada é gravado (tirar volume legítimo em silêncio é pior que não rodar); saiu **menos** (ou nada, se a nota foi
  cancelada na origem), a rodada segue com **aviso em destaque**.
- Mês já **selado** pelo flash não é reconsultado, então a exclusão fica inerte depois do selo. Por isso ela tem de
  entrar **antes** de o mês ser marcado no flash.
- **Nada do cálculo do incentivo muda** por causa dela: pontos, faixas, gatilhos, confrontos, ranking e status
  continuam exatamente como estão. A primeira exclusão (outubro/26, rota **R32**, agrupador **Powerade**) está numa
  rota **virtual e sem canal**, que não entra em pontos, ranking, gatilhos nem premiação — só nos totais da gerência
  e, por isso, na aba **Estratégicos**.
- A lista das notas excluídas fica na **configuração do gerador**, nunca no meio da lógica nem da tela, e o mês
  fechado publica rota, agrupador, volume e motivo — **sem número de nota e sem código de cliente**.

**Status (⚠️ interpretação da regra do Back Office):**

| Situação | Status |
|---|---|
| Gatilho de volume (≥ 95% Refrigerantes) **não** atingido | **"-"** no status (os pontos aparecem, mas não valem) |
| Volume atingido, mas pontos abaixo do mínimo (SV 60 acumulados; Consultor 17 no mês) | **"-"** |
| Volume e pontos atingidos, mas **fora das posições premiadas** | **"Bateu, mas não está no total"** (engajar o time a subir) |
| Volume e pontos atingidos e **dentro das posições premiadas** | **"Bateu!"** (até a v3.2, "No total") |

**Numeração do ranking (decisão de 27/10/2026):** todas as linhas recebem posição, não só as elegíveis. Para quem bate os dois
gatilhos a posição é a oficial (a que vale para a premiação); para os demais é apenas a ordem na tela, por pontos, e aparece em
cinza. A premiação continua restrita a quem é elegível.

## 9. Pontos em aberto ⚠️

1. **Nome do status:** em 31/10/2026 "No total" virou **"Bateu!"** (decisão da Karen); "Bateu, mas não está no total" segue como está. A regra não mudou (a tabela da seção 8 é a leitura adotada).
2. **Pontos acumulados da Rota:** assumido como não aplicável (zera todo mês).
3. **Confrontos:** prazo de registro em cada mês.
4. **Coringas 4 e 5 de dezembro:** ainda não decididos. Até entrarem na configuração do painel, dezembro não calcula pontos nem ranking.
5. **Fonte de Missões Guiadas de dezembro:** a de **novembro** está definida (duas missões e meta 10, decisão de 10/11/2026, seção 4); a de **dezembro** ainda não. Enquanto não houver meta e lista de missões do mês, o pilar aparece "sem dados" e não pontua. ⚠️ Em aberto também: quando novembro fechar, o `fechado/AAAAMM.json` **não** guarda missões, então o realizado do pilar continua vindo do `missoes.json` do momento — ele não congela junto com o mês.
6. **Fechamento oficial pelo flash de vendas (04/11/2026):** quem marca que o flash de um mês fechou é o Back Office, no painel, e é isso que congela o mês. Falta definir o prazo combinado para essa marcação depois de cada flash.
7. **Canal do SV (29/10/2026):** "um canal só por SV, o do admin ou o da maioria das rotas da mesa" (seção 1) é a leitura adotada e já está no painel; falta a confirmação do Back Office/IM.
8. **Canal das rotas e mesas de novembro:** falta confirmar se o canal das rotas e a composição das mesas mudam no mês. O canal ainda vem da base embutida e dos ajustes do admin, não da API.
9. **Soma do SV com as rotas Sem canal (30/10/2026):** está decidido que o volume e a meta dessas rotas contam para o SV (seção 1); a implementação no painel está pendente.

**Resolvidos:** **Missões Guiadas de novembro** com dado real — duas missões ("Aumente A Família" e "Traga De Volta"), meta 10 por rota e, no SV, a soma das rotas da mesa (10/11/2026, seção 4); mínimo de pontos do Consultor = **17 no mês** (gerência de planejamento e IM, 29/10/2026); **+5 do confronto só para o SV vencedor**, sem extensão à mesa (03/11/2026); +5 do confronto só depois do fechamento do mês, nos pontos acumulados do SV, com o vencedor parcial durante o mês (30/10/2026), entrando no dia 1 do mês seguinte e atualizados até o fechamento do flash, quando congelam (05/11/2026);
**Real = até ontem × faturado de hoje:** medido em 28/10/2026 com `backend/scripts/diagnosticar_real.py --datasphere`, o faturado de hoje aparece **só no Online** (conferido de novo em 05/11/2026 contra a exportação do SAC de novembro: Meta, Real, Online e meta dia batem no total da empresa e rota a rota, com diferenças de 0,1 por arredondamento de 1 casa);
**Real e Online pela chave e pela rota da meta** a partir de novembro/26, como o SAC (03/11/2026); **Mini e Mod = Segmentada**, com o segmento como etiqueta (28/10/2026, confirmado em 30/10/2026); **Estratégicos no painel**, em aba própria, só com o volume da gerência, sem pontos e sem premiação; fechamento oficial só depois do fechamento do flash de vendas, marcado pelo Back Office no painel, com o mês em prévia até lá (04/11/2026); numeração do ranking em todas as linhas, com a posição oficial só para os elegíveis (27/10/2026);
cadastro dos confrontos na Administração do painel (27/10/2026); limites de faixa; Missões Guiadas (outubro validada em 100%; novembro e dezembro com meta); pontos aparecem mesmo antes do gatilho de volume, só o status fica "-" (26/10/2026); desempate pelo maior % de Refrigerantes para todos; coringa mensal (coringas 4 e 5 de novembro iguais aos de outubro, 04/11/2026); itens "Cob. Sprite SS" e "Cob. KS CCTM" (ignorar, resquício da planilha); volume de Refrigerantes = categoria do SAC; Meta dia vinda da API; Mista só contra Mista; quem perde não perde pontos.

## 10. Glossário

- **SV:** Supervisor. **RT:** Rota (Consultor de Vendas). **IM:** Inteligência de Mercado. **Mesa:** Consultores de um SV.
- **Mista / Segmentada / Sem canal:** o canal define os pilares, o ranking e a premiação (seção 1).
- **Segmento:** etiqueta dentro do canal, que não muda a regra — Mini e Mod (Segmentada); Neutraliza, Eventual, Coke Net e Virtual (Sem canal). Mini e Mod são o mesmo canal.
- **TT mês:** total do mês (interpretação), sempre em % sobre a meta.
- **Missões Guiadas:** pilar de execução comprovada por pedido, foto ou formulário; não é de volume.

## 11. Intencionalmente fora deste arquivo

Orçamento, custo dos prêmios e valores de premiação dos estratégicos (constam na planilha original) não fazem parte do contexto, para evitar que apareçam em relatórios ou no repositório.
