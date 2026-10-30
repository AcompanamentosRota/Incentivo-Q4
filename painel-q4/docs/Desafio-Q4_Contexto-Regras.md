# Desafio Q4 2026 — Regras do incentivo (Coca-Cola Bandeirantes) — v3.1

**Hierarquia das fontes**
1. Respostas do Back Office/IM (23/10/2026): prevalecem sobre tudo e estão incorporadas abaixo.
2. `Desafio_Q4_Bandeirantes.html` (apresentação oficial).
3. `Incentivo Q4 2026.xlsx` (abas *Mecânica* e *Pilares e Premiação*): só onde o HTML é omisso.
4. O PPTX "Desafio_Q4_Bandeirantes_2026_V2" foi **descartado**.

**Vigência:** outubro, novembro e dezembro de 2026 (Q4).
**Como usar este arquivo:** é a fonte de verdade das regras. Itens marcados com ⚠️ são interpretações a confirmar (seção 9): use-os como estão descritos e sinalize uma nota no painel.

---

## 1. Visão geral

- **Participantes:** Supervisores (SV) e Consultores de Vendas (Rota/RT), em um canal: **Mista** ou **Segmentada**. Cada Consultor pertence à "mesa" de um SV (campo `id_supervisor` no cadastro).
- **Mecânica:** (1) pontos por desempenho em 5 pilares; (2) confrontos entre SVs (+5 pontos no mês para o vencedor); (3) gatilhos para validar pontos e entrar na premiação; (4) ranking por cargo e canal.
- **Base de medição:** todos os pilares são avaliados em **TT mês, % sobre a meta**.
- **Estratégicos:** constam só na planilha (medidos nos pilares da SV Mista, sem confrontos). Fora do escopo do painel.

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
| Consultor (RT) | 20 pontos | **Mensal**; a pontuação zera todo mês |

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

- **Pilares 4 e 5 são "coringa" e mudam de mês para mês.** A tabela acima vale para **outubro**; novembro e dezembro podem trazer outros pilares. Não fixar pilares no código: ler a configuração mensal dos dados.

**Novembro e dezembro** (decisão do Back Office, informada pela Karen em 29/10/2026):

| # | Mista | Segmentada |
|---|---|---|
| 1 | Volume Sabores | Volume Sabores |
| 2 | Volume Retornáveis | Volume Refri Single ("Volume Individuais") |
| 3 | Missões Guiadas | Volume Powerade |
| 4 (Coringa) | a decidir | a decidir |
| 5 (Coringa) | a decidir | a decidir |

- Os pilares 1 a 3 são os mesmos de outubro nos dois meses. Enquanto os coringas 4 e 5 não forem decididos, o painel mostra "Pilares de <mês> ainda não configurados" e não calcula pontos nem ranking desse mês.
- Missões Guiadas em novembro: ainda **sem fonte** de meta e realizado por rota; até haver fonte, o pilar aparece "sem dados" e não pontua (nunca se assume 100%).
- **Pilares de volume** (os únicos válidos em confronto): todos, exceto Missões Guiadas.
- **Missões Guiadas:** em **outubro** entra **validada em 100%** para todos os cargos que a têm, o que vale **3 pontos**. **Novembro e dezembro terão meta**: o pilar passa a pontuar como os demais, com meta, real e online.

## 5. Confrontos entre supervisores

1. Os confrontos são entre SVs; cada SV decide quem desafiar.
2. O desafio é registrado **na plataforma do incentivo**; depois o SV manda o vídeo no grupo. Vale o registro na plataforma e a **ordem de registro**.
3. Só vale em **pilares de volume** do cargo do SV, sempre em TT mês % sobre a meta.
4. Todo desafiado entra automaticamente no confronto.
5. **Mista só desafia Mista e Segmentada só desafia Segmentada.**
6. Cada SV pode **receber no máximo 1 desafio**.
7. Se todos forem desafiados antes, quem demorou fica sem confronto. Quem não participa perde a chance dos +5 pontos.
8. O Time de Categorias compila os desafios e entrega para a IM.

**Apuração:** vence quem tiver o melhor % sobre a meta do mês no pilar escolhido. **Quem perde não perde nada**; apenas o vencedor ganha os **+5 pontos no mês**.
**Extensão à Rota:** se o SV vence o confronto, **todos os Consultores da mesa dele também ganham os +5 pontos** (é isso que completa os 30 pontos máximos da Rota: 25 de pilares + 5).
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
| Rota | Máx. / Méd. / Mín. | 25 · 15 · 10 (+5 se o SV vencer) | via SV | gatilho: 20 (mensal) |

**Leitura (interpretação):** os cenários equivalem a todos os 5 pilares em ≥105% (25), 100–105% (15) e 90–100% (10). Os 60 pontos do SV (66,7% do máximo de 90) exigem 100% nos 5 pilares **e** confronto vencido nos 3 meses (45 + 15). Pelo mesmo raciocínio, o Consultor com 100% nos 5 pilares chega a 15 e só atinge os 20 se o SV da mesa vencer o confronto.

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

**Consultores — premiação mensal (out, nov, dez), mínimo de 20 pontos no mês e gatilho de volume**

| Canal | Premiados | Prêmio |
|---|---|---|
| Mista | 1º ao 40º do ranking | R$ 1.000 em produtos (cada) |
| Segmentada | 1º ao 10º do ranking | R$ 1.000 em produtos (cada) |

## 8. Medidas e status do painel

| Medida | Definição |
|---|---|
| **Meta** | Meta do mês (TT mês) do pilar |
| **Real** | Volume vendido **até ontem** |
| **Meta dia** | Medida pronta vinda da API (não recalcular) |
| **Online** | Venda **de hoje** (parcial, muda várias vezes ao dia) |
| **Diferença** | Real + Online − Meta |
| **%** | (Real + Online) ÷ Meta |
| **Pontos atuais** | Pontos do mês corrente (pilares + confronto, se vencido) |
| **Pontos acumulados** | SV: trimestre (meses fechados + mês corrente). Consultor: não se aplica, pois zera todo mês ⚠️ |

**Status (⚠️ interpretação da regra do Back Office):**

| Situação | Status |
|---|---|
| Gatilho de volume (≥ 95% Refrigerantes) **não** atingido | **"-"** no status (os pontos aparecem, mas não valem) |
| Volume atingido, mas pontos abaixo do mínimo (SV 60 acumulados; Consultor 20 no mês) | **"-"** |
| Volume e pontos atingidos, mas **fora das posições premiadas** | **"Bateu, mas não está no total"** (engajar o time a subir) |
| Volume e pontos atingidos e **dentro das posições premiadas** | **"No total"** |

**Numeração do ranking (decisão de 27/10/2026):** todas as linhas recebem posição, não só as elegíveis. Para quem bate os dois
gatilhos a posição é a oficial (a que vale para a premiação); para os demais é apenas a ordem na tela, por pontos, e aparece em
cinza. A premiação continua restrita a quem é elegível.

## 9. Pontos em aberto ⚠️

1. **Nome do status:** os nomes "Bateu, mas não está no total" e "No total" ficam como estão por ora e serão ajustados depois (a tabela da seção 8 é a leitura adotada).
2. **Pontos acumulados da Rota:** assumido como não aplicável (zera todo mês).
3. **Confrontos:** prazo de registro em cada mês.

**Resolvidos:** numeração do ranking em todas as linhas, com a posição oficial só para os elegíveis (27/10/2026);
cadastro dos confrontos na Administração do painel (27/10/2026); limites de faixa; Missões Guiadas (outubro validada em 100%; novembro e dezembro com meta); pontos aparecem mesmo antes do gatilho de volume, só o status fica "-" (26/10/2026); desempate pelo maior % de Refrigerantes para todos; coringa mensal; itens "Cob. Sprite SS" e "Cob. KS CCTM" (ignorar, resquício da planilha); 5 pontos do confronto na Rota; volume de Refrigerantes = categoria do SAC; Meta dia vinda da API; Mista só contra Mista; quem perde não perde pontos.

## 10. Glossário

- **SV:** Supervisor. **RT:** Rota (Consultor de Vendas). **IM:** Inteligência de Mercado. **Mesa:** Consultores de um SV.
- **Mista / Segmentada:** canais que definem os pilares e o ranking.
- **TT mês:** total do mês (interpretação), sempre em % sobre a meta.
- **Missões Guiadas:** pilar de execução comprovada por pedido, foto ou formulário; não é de volume.

## 11. Intencionalmente fora deste arquivo

Orçamento, custo dos prêmios e valores de premiação dos estratégicos (constam na planilha original) não fazem parte do contexto, para evitar que apareçam em relatórios ou no repositório.
