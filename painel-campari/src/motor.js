/*
 * Motor de cálculo — Campari Club 2026 (Coca-Cola Bandeirantes) — regras v1.14 (docs/regras.md)
 * Roda em Node (testes) e no navegador (painel HTML): window.MotorCampari.
 *
 * Toda regra de cálculo do painel fica só aqui: nenhuma fórmula no adaptador nem na tela.
 * Etapa 2: ranking de volume de Aperitivo (% do mês, trava, soma, ordem e posição).
 * Etapa 3: gatilho de cobertura de Skyy, posição oficial, status "Bateu!", meta dia de cobertura, diferença e
 * "hoje atingiu a meta dia". A tela (Etapa 4) só lê o resultado: nenhuma comparação nem texto de motivo fora daqui.
 * Etapa 4: a regra de EXIBIÇÃO da meta dia de volume (`metaDiaVolume`, regras v1.4, decisão de 09/11/2026). Mesmo
 * sendo só exibição, é regra: fica aqui, não na tela.
 * Etapa 4B: a cor do quadradinho do % de cobertura (`corDoPercentual`, regras v1.6, seção 7). Também é só
 * exibição e também é regra: a tela pergunta a cor, nunca compara o número com 100.
 * Etapa 4C: a soma da gerência comercial agrupada do Ranking GC (`somarGrupo`, regras v1.6, seção 4 e pendência
 * 24). O agrupamento em si (quais gerências formam cada linha) é configuração do adaptador; a REGRA que mora aqui
 * é a de somar as medidas e só depois calcular — o % é o da soma, nunca a média dos % das gerências.
 * Etapa 4F: a cor do quadradinho do % do mês de Aperitivo (`corDoPercentualAperitivo`, regras v1.7, seção 7;
 * decisão da Karen de 09/11/2026). Exibição outra vez, e regra outra vez — e é regra DIFERENTE da do % de
 * cobertura: o verde começa no limite da TRAVA do mês e, no mês sem trava, em `REGRAS.corAperitivoSemTrava`,
 * nunca no mínimo do gatilho, que é de cobertura.
 * Etapa 4H: o segundo pilar de volume de Aperitivo e o gatilho dos DOIS PILARES (`gatilhoPilares`), regras
 * v1.8, seções 2, 5 e 7 (decisão da Karen de 09/11/2026, noite): "Bateu!" e a coluna da posição oficial passam a
 * exigir o gatilho de Skyy E o volume. O ranking (% Acum., ordem e Pos.) não muda.
 * Etapa 4I (regras v1.9, seção 7): só a versão muda aqui. A v1.9 tira a paginação da visão Gerência do Detalhe do
 * mês, que é apresentação (adaptador e tela); nenhuma regra de cálculo muda.
 * Etapa 4J (regras v1.10, seções 5 e 7): só a versão muda aqui outra vez. A v1.10 tira a coluna "Pos." das duas
 * tabelas de ranking, que é apresentação (tela): `numerarRanking` continua dando `pos` a todas as linhas — é ela
 * que ordena o ranking e entra no motivo do status —, e `numerarOficial` continua dando a coluna exibida.
 * Etapa 4K (regras v1.11, seções 2.2, 3 e 5; decisão da Karen de 10/11/2026): o volume de Aperitivo deixa de ter
 * GATILHO por média e passa a ter um MÍNIMO (`minimoVolume`, no lugar do `gatilhoVolume` da 4H): o % do MÊS
 * VIGENTE (o mês de referência da API) tem de chegar a `REGRAS.minimoVolume.minimo`, sem média e sem soma. A soma
 * dos % (out + nov + dez) continua sendo SÓ a pontuação do ranking. O gatilho de cobertura de Skyy não muda, nem a
 * ordem, o desempate, a soma e as posições premiadas: muda só a conta do segundo pilar — e, com ela, quem recebe
 * número na coluna RANK e quem tem "Bateu!".
 * Etapa 4L (regras v1.12; decisão da Karen de 10/11/2026): só a versão muda aqui. A v1.12 tira as premissas a
 * confirmar da aba Regras — elas ficam no documento de regras (seção 10) e no checklist —, e isso é tela
 * (adaptador: `alertasDaTela`). Nenhuma conta muda: a meta dia de volume continua comparando só o Real com a
 * Meta e a meta de volume nula continua deixando o mínimo indisponível.
 * Etapa 4M (regras v1.13, seção 7; problema relatado pela Karen em 10/11/2026): só a versão muda aqui. A v1.13
 * sobe a altura-base do `fit()` da tela para nenhuma aba rolar por dentro em notebook, e isso é escala de tela
 * (adaptador: `CONFIG.palco` e `escalaDoPalco`). Nenhum número e nenhuma conta deste motor mudam.
 * Etapa 4N (regras v1.14, seções 5 e 7; decisão da Karen de 10/11/2026, meio-dia): `statusLinha` ganha um
 * TERCEIRO estado, "Bateu, fora do ranking" (`STATUS.fora`), para quem bateu os DOIS PILARES e ficou com a
 * posição oficial além do limite de premiadas — onde antes devolvia "-" com o motivo "suba N posições". O motivo
 * não muda, e "Bateu!" e "-" não mudam de regra: quem decide continua sendo a posição OFICIAL contra
 * `REGRAS.premiadas`. A v1.14 também volta a exibir a posição do ranking (`pos`) na coluna RANK de todas as
 * linhas e pinta de azul a linha com "Bateu!", mas isso é tela: aqui `pos` e `oficial` seguem como estavam.
 *
 * Escala: % em pontos percentuais, SEM arredondar (142.2631… = 142,26…%); a tela trunca depois (regras, seção 7).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorCampari = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGRAS = {
    versao: '1.14',
    meses: [10, 11, 12], // vigência: outubro, novembro e dezembro de 2026
    // Trava do % do mês de Aperitivo (regras, seção 3): 130% em outubro e novembro; dezembro sem trava (null).
    trava: { 10: 130, 11: 130, 12: null },
    // Limite do quadradinho VERDE do % do mês de Aperitivo no mês SEM trava (dezembro), em pontos percentuais
    // (regras v1.7, seção 7; ⚠️ pendência 25, a confirmar com a Karen). Nos meses com trava o limite é a própria
    // trava, por isso ele não se repete aqui. É outro número que o mínimo do gatilho, ainda que hoje coincidam:
    // um é volume de Aperitivo, o outro é cobertura de Skyy.
    corAperitivoSemTrava: 100,
    // Gatilho de cobertura de Skyy (regras, seção 2): média simples dos % de novembro e dezembro, mínimo 100%.
    // Outubro nunca entra. Em novembro o gatilho é parcial (só novembro).
    gatilho: { meses: [11, 12], minimo: 100 },
    // Mínimo de volume de Aperitivo (regras v1.11, seção 2.2; decisão da Karen de 10/11/2026, que substitui o
    // gatilho por média da v1.8): o % do MÊS VIGENTE — o mesmo % do ranking, já com a trava do mês — tem de chegar
    // a 100% no valor bruto. Não há meses nesta conta: não é média nem soma, é o mês vigente e só ele, por isso
    // a chave não tem `meses` (a soma dos % continua sendo a pontuação do ranking, seção 3).
    minimoVolume: { minimo: 100 },
    // Posições premiadas de cada nível (regras, seção 5), usadas SÓ para decidir o "Bateu!": o painel não mostra
    // prêmio nenhum. Padrão do motor, como o gatilhoPontos do Desafio Q4: a regra em vigor não depende de arquivo
    // que pode faltar ou ficar ilegível. `statusLinha(linha, nivel, cfg)` aceita outro cfg para mudança futura.
    premiadas: { gc: 6, svMista: 12, svSegmentada: 3 },
  };

  // Textos exatos dos motivos do status (regras, seção 5). Desde a v1.6 o motivo NÃO aparece na tela (a coluna
  // Status mostra só o selo), mas continua calculado aqui: motivo novo entra no motor, nunca no HTML.
  const MOTIVOS = {
    premiadas: 'dentro das premiadas',
    indisponivel: 'cobertura indisponível',
    semMeta: 'sem meta de cobertura',
    // regras v1.11 (mínimo de volume de Aperitivo); os textos de "volume em X%" saem de `gatilhoPilares`
    volumeIndisponivel: 'volume indisponível',
    semMetaVolume: 'sem meta de volume',
  };

  // Textos exatos dos TRÊS estados do status (regras v1.14, seção 5; decisão da Karen de 10/11/2026, meio-dia).
  // Ficam aqui, e não na tela, porque são o resultado da regra: a tela lê `l.status.status` e só acrescenta o "✓"
  // do "✓ Bateu!" e a cor de cada selo. `fora` = bateu os dois pilares e ficou além do limite de premiadas.
  const STATUS = {
    bateu: 'Bateu!',
    fora: 'Bateu, fora do ranking',
    nao: '-',
  };

  const numero = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * % do mês = (Real + Online) ÷ Meta × 100, bruto (nunca o `atingimento_pct` inteiro da API).
   * Meta nula, não numérica ou ≤ 0: null (nunca 0 nem 100). Real não numérico: null.
   * Online ausente (null/undefined) conta 0: no mês fechado não existe online.
   */
  function percentualMes(real, online, meta) {
    if (!numero(meta) || meta <= 0) return null;
    if (!numero(real)) return null;
    if (online === null || online === undefined) online = 0;
    if (!numero(online)) return null;
    return ((real + online) / meta) * 100;
  }

  /**
   * Trava do mês sobre o % bruto: min(%, limite). Exatamente no limite não conta como travado.
   * Mês sem trava (dezembro): o próprio %. % null: { valor: null, travado: false }.
   * Mês fora da vigência: erro (nunca adivinhar a regra).
   */
  function aplicarTrava(pct, mes, regras) {
    regras = regras || REGRAS;
    if (!Object.prototype.hasOwnProperty.call(regras.trava, mes)) throw new Error(`mês ${mes} fora da vigência do Campari Club`);
    if (pct === null || pct === undefined) return { valor: null, travado: false };
    const limite = regras.trava[mes];
    if (limite === null || limite === undefined || pct <= limite) return { valor: pct, travado: false };
    return { valor: limite, travado: true };
  }

  /** Pontuação do ranking: soma dos % mensais já travados, só dos meses com %. Nenhum mês com %: null. */
  function somaRanking(valores) {
    const com = (valores || []).filter(numero);
    return com.length ? com.reduce((a, b) => a + b, 0) : null;
  }

  /**
   * Um participante (GC, SV ou rota) -> % de cada mês, trava, soma e marca de incompleta.
   * meses: [{ mes, situacao: 'dado' | 'indisponivel' | 'futuro', meta, real, online, ... }]
   *   - 'dado': o mês tem fonte (API no mês aberto ou fechado/AAAAMM.json); o % sai de Real + Online sobre a Meta;
   *   - 'indisponivel': o mês já devia ter dado e não tem (fechado ausente, produto ausente): sem %, linha incompleta;
   *   - 'futuro': mês posterior ao de referência: sem %, não conta na soma e não deixa a linha incompleta.
   * Devolve { meses (cópias com pct, pctTravado, travado), soma, incompleta, mesesSemPct }.
   * incompleta = algum mês que já devia contar ficou sem % (meta nula ou ≤ 0, ou mês indisponível) (premissa P4).
   */
  function apurarMeses(meses, regras) {
    regras = regras || REGRAS;
    const out = (meses || []).map((m) => {
      const pct = m.situacao === 'dado' ? percentualMes(m.real, m.online, m.meta) : null;
      const t = aplicarTrava(pct, m.mes, regras);
      return Object.assign({}, m, { pct, pctTravado: t.valor, travado: t.travado });
    });
    const mesesSemPct = out.filter((m) => m.situacao !== 'futuro' && m.pct === null).map((m) => m.mes);
    return { meses: out, soma: somaRanking(out.map((m) => m.pctTravado)), incompleta: mesesSemPct.length > 0, mesesSemPct };
  }

  /**
   * Soma das medidas de um grupo de linhas — a gerência comercial agrupada do Ranking GC (regras v1.6, seção 4;
   * decisão de 09/11/2026, pendência 24). É REGRA, não montagem de dados: a linha agrupada soma meta, real,
   * online (e a meta dia de volume) das gerências do grupo e só DEPOIS calcula, então o % é o da SOMA e nunca a
   * média dos % das gerências. Quem são as gerências de cada linha é configuração do adaptador, não daqui.
   *   - cada campo soma só os valores numéricos: gerência com meta null não zera a meta do grupo;
   *   - nenhum valor numérico no campo: null, nunca 0 (ausência de medida não é zero);
   *   - `campos` permite somar o bloco de cobertura, que não tem meta dia (['meta', 'real', 'online']).
   * A meta dia de volume do grupo é a soma das `meta_dia` publicadas pelas gerências, porque a API não publica
   * meta dia por grupo — premissa ⚠️ da seção 4 (b), a confirmar. A meta dia de COBERTURA não se soma: ela sai de
   * `metaDiaCobertura` sobre a meta e o real já somados.
   */
  function somarGrupo(valores, campos) {
    campos = campos || ['meta', 'real', 'online', 'metaDia'];
    const out = {};
    for (const campo of campos) {
      const nums = (valores || []).map((v) => (v ? v[campo] : null)).filter(numero);
      out[campo] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
    }
    return out;
  }

  /** Chave de desempate: o código (id da API) em minúsculas; comparação de texto simples ("sv.g2.10" < "sv.g2.2"). */
  const chaveCodigo = (codigo) => String(codigo).toLowerCase();

  /**
   * Ordem do ranking: soma desc; empate (inclusive soma null): código em minúsculas, texto simples (regras, seção 5).
   * Linha sem soma (nenhum mês com %) vai para o fim. Não altera a entrada; ordem estável.
   */
  function ordenarRanking(linhas) {
    return (linhas || []).map((l, i) => [l, i]).sort(([a, ia], [b, ib]) => {
      const sa = numero(a.soma) ? a.soma : null, sb = numero(b.soma) ? b.soma : null;
      if (sa !== sb) {
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      }
      const ca = chaveCodigo(a.codigo), cb = chaveCodigo(b.codigo);
      if (ca !== cb) return ca < cb ? -1 : 1;
      return ia - ib;
    }).map(([l]) => l);
  }

  /** Posição (coluna "Pos.") 1..n em todas as linhas, na ordem recebida. Devolve cópias. */
  function numerarRanking(linhas) {
    return (linhas || []).map((l, i) => Object.assign({}, l, { pos: i + 1 }));
  }

  /** Ordena e numera (atalho usado pelo adaptador). */
  const montarRanking = (linhas) => numerarRanking(ordenarRanking(linhas));

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * Etapa 3 — gatilho de cobertura de Skyy, posição oficial, status e meta dia de cobertura
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * % de cobertura do mês = (realizado + online) ÷ meta × 100, bruto (regras, seção 2).
   * A conta é a mesma do volume, mas em função própria: a medida é cliente (não volume), a fonte é o bloco
   * `cobertura` e o motivo da falta é outro ("sem meta de cobertura").
   * Meta nula, não numérica ou ≤ 0: null, nunca 0 nem 100. Realizado não numérico: null.
   * Online ausente (null/undefined) conta 0 — no período de fechamento da API o `online_hoje` da cobertura vem null.
   */
  function percentualCobertura(real, online, meta) {
    if (!numero(meta) || meta <= 0) return null;
    if (!numero(real)) return null;
    if (online === null || online === undefined) online = 0;
    if (!numero(online)) return null;
    return ((real + online) / meta) * 100;
  }

  /** Diferença de uma medida no mês (regras, seção 7): Real + Online − Meta. Online ausente conta 0. */
  function diferenca(real, online, meta) {
    if (!numero(real) || !numero(meta)) return null;
    if (online === null || online === undefined) online = 0;
    if (!numero(online)) return null;
    return real + online - meta;
  }

  /** % truncado em 1 casa, com vírgula (a tela nunca arredonda o que a regra trunca): 99.99999 -> "99,9". */
  const pct1 = (v) => (Math.floor(v * 10 + 1e-9) / 10).toFixed(1).replace('.', ',');
  /** Número inteiro sem casas; com casas, vírgula decimal (usado no "precisa de 100%"). */
  const texto = (v) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));

  /**
   * Gatilho do incentivo (regras, seção 2): média simples dos % de cobertura de Skyy dos meses de
   * `REGRAS.gatilho.meses` (novembro e dezembro), mínimo `REGRAS.gatilho.minimo` (100). Outubro nunca entra.
   *
   * meses:  [{ mes, situacao: 'dado' | 'indisponivel' | 'futuro', meta, real, online }] — o adaptador monta;
   *         'indisponivel' = o mês já devia ter cobertura e não tem (ex.: fechado/AAAAMM.json sem o campo).
   * mesRef: o mês da vigência que está valendo (10, 11 ou 12); null quando nenhum já começou.
   *
   * Devolve { valor, batido, parcial, indisponivel, motivo }:
   *   - novembro: `parcial` true e valor = % de novembro (dezembro ainda não existe);
   *   - dezembro: valor = (nov + dez) ÷ 2, e SÓ se os dois tiverem %; faltando um, indisponivel e valor null;
   *   - `batido` = valor ≥ mínimo no valor BRUTO (a tela trunca depois: 99,99999% não bate);
   *   - indisponivel -> motivo "cobertura indisponível" (mês sem fonte) ou "sem meta de cobertura" (meta nula ou ≤ 0).
   * Nunca assume valor: sem dado o gatilho fica indisponível, e a linha não recebe posição oficial.
   */
  function gatilhoCobertura(meses, mesRef, regras) {
    regras = regras || REGRAS;
    const semValor = (motivo) => ({ valor: null, batido: false, parcial: false, indisponivel: true, motivo });
    if (!numero(mesRef)) return semValor(MOTIVOS.indisponivel);
    const doGatilho = regras.gatilho.meses.filter((m) => m <= mesRef);
    if (!doGatilho.length) return semValor(MOTIVOS.indisponivel); // referência antes de novembro: o gatilho não começou
    const pcts = [];
    for (const m of doGatilho) {
      const d = (meses || []).find((x) => x && x.mes === m);
      if (!d || d.situacao !== 'dado') return semValor(MOTIVOS.indisponivel);
      const pct = percentualCobertura(d.real, d.online, d.meta);
      if (pct === null) return semValor(numero(d.meta) && d.meta > 0 ? MOTIVOS.indisponivel : MOTIVOS.semMeta);
      pcts.push(pct);
    }
    const valor = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    return { valor, batido: valor >= regras.gatilho.minimo, parcial: doGatilho.length < regras.gatilho.meses.length,
             indisponivel: false, motivo: null };
  }

  /**
   * MÍNIMO de volume de Aperitivo (regras v1.11, seção 2.2; decisão da Karen de 10/11/2026, que substitui o
   * gatilho por média da v1.8): o % de Aperitivo do MÊS VIGENTE tem de chegar a `REGRAS.minimoVolume.minimo`
   * (100), comparado no valor BRUTO (99,99999% não bate; a tela trunca, a conta não arredonda).
   *
   * NÃO é média e NÃO é soma: entra um mês só, o vigente. A soma dos % de outubro, novembro e dezembro continua
   * sendo a pontuação do RANKING (seção 3) e não tem nada a ver com este corte.
   *
   * O % do mês é o MESMO do ranking: `percentualMes` + `aplicarTrava` (130% em outubro e novembro; dezembro sem
   * trava). A trava não muda o corte, porque o mínimo (100) é menor que ela — mas o % é o mesmo que a tela mostra.
   *
   * meses:  [{ mes, situacao: 'dado' | 'indisponivel' | 'futuro', meta, real, online }] — os mesmos meses que o
   *         adaptador entrega a `apurarMeses` para o ranking da linha.
   * mesRef: o MÊS VIGENTE, o mês de referência da API (10, 11 ou 12) — nunca o escolhido no seletor da tela;
   *         null quando nenhum mês da vigência começou.
   *
   * Devolve { valor, batido, indisponivel, motivo }, no molde de `gatilhoCobertura`, mas SEM `parcial`: sem média
   * não existe "parcial" (premissa (a) da pendência 26, confirmada em 10/11/2026).
   *   - `batido` = valor ≥ mínimo no valor BRUTO;
   *   - indisponível -> motivo "volume indisponível" (sem mês vigente, mês sem fonte, real não numérico) ou
   *     "sem meta de volume" (meta nula ou ≤ 0, ⚠️ pendência 26b). Nunca assume valor (nem 0, nem 100).
   */
  function minimoVolume(meses, mesRef, regras) {
    regras = regras || REGRAS;
    const semValor = (motivo) => ({ valor: null, batido: false, indisponivel: true, motivo });
    if (!numero(mesRef)) return semValor(MOTIVOS.volumeIndisponivel);
    const d = (meses || []).find((x) => x && x.mes === mesRef);
    if (!d || d.situacao !== 'dado') return semValor(MOTIVOS.volumeIndisponivel);
    const pct = percentualMes(d.real, d.online, d.meta);
    if (pct === null) return semValor(numero(d.meta) && d.meta > 0 ? MOTIVOS.volumeIndisponivel : MOTIVOS.semMetaVolume);
    const valor = aplicarTrava(pct, mesRef, regras).valor;
    return { valor, batido: valor >= regras.minimoVolume.minimo, indisponivel: false, motivo: null };
  }

  /** Pilar que falhou COM valor (não bateu e tem número): é o que gera "cobertura em X%" / "volume em X%". */
  const falhouComValor = (g) => !!g && !g.batido && !g.indisponivel && numero(g.valor);
  /** Pilar ausente (linha montada sem ele) conta como indisponível, nunca como batido. */
  const ouIndisponivel = (g, motivo) => g || { valor: null, batido: false, indisponivel: true, motivo };

  /**
   * Os DOIS PILARES (regras v1.11, seções 2 e 5): junta o gatilho de cobertura de Skyy (`gatilhoCobertura`) e o
   * mínimo de volume de Aperitivo (`minimoVolume`) -> { batido, indisponivel, motivo }.
   *   - batido: só se os DOIS estiverem batidos;
   *   - indisponivel: algum dos dois indisponível E nenhum falhou com valor (um % abaixo do mínimo já decide);
   *   - motivo (só no motor; a tela mostra só o selo): null quando bateu os dois; "cobertura em X%: precisa de
   *     100%", "volume em X%: precisa de 100%" ou "cobertura em X% e volume em Y%: precisam de 100%" quando falha
   *     com valor (X e Y truncados em 1 casa); senão o motivo de "indisponível" do pilar que faltou (os dois,
   *     unidos por " e ", quando faltam os dois — premissa (d) da pendência 26, confirmada em 10/11/2026).
   * Pilar ausente conta como indisponível ("cobertura indisponível" / "volume indisponível"), nunca como batido.
   */
  function gatilhoPilares(gSkyy, mVolume, cfg) {
    const regras = cfg || REGRAS;
    const sk = ouIndisponivel(gSkyy, MOTIVOS.indisponivel), vo = ouIndisponivel(mVolume, MOTIVOS.volumeIndisponivel);
    if (sk.batido && vo.batido) return { batido: true, indisponivel: false, motivo: null };
    const fSk = falhouComValor(sk), fVo = falhouComValor(vo);
    const minSk = texto(regras.gatilho.minimo), minVo = texto(regras.minimoVolume.minimo);
    if (fSk && fVo) {
      const motivo = minSk === minVo
        ? `cobertura em ${pct1(sk.valor)}% e volume em ${pct1(vo.valor)}%: precisam de ${minSk}%`
        : `cobertura em ${pct1(sk.valor)}%: precisa de ${minSk}% e volume em ${pct1(vo.valor)}%: precisa de ${minVo}%`;
      return { batido: false, indisponivel: false, motivo };
    }
    if (fSk) return { batido: false, indisponivel: false, motivo: `cobertura em ${pct1(sk.valor)}%: precisa de ${minSk}%` };
    if (fVo) return { batido: false, indisponivel: false, motivo: `volume em ${pct1(vo.valor)}%: precisa de ${minVo}%` };
    // nenhum falhou com valor e nem os dois bateram: falta algum (ou os dois)
    const faltam = [sk, vo].filter((g) => !g.batido)
      .map((g, i) => g.motivo || (g === sk ? MOTIVOS.indisponivel : MOTIVOS.volumeIndisponivel));
    return { batido: false, indisponivel: true, motivo: faltam.join(' e ') };
  }

  /**
   * Posição oficial, a coluna "RANK" da tela (regras v1.11, seção 5): numera 1..k só quem bateu OS DOIS PILARES
   * (gatilho de Skyy E mínimo de volume de Aperitivo, `gatilhoPilares`), na ordem recebida — que é a do ranking
   * (`montarRanking`), já com a posição `pos` em todas as linhas. Quem bateu só um (ou nenhum) fica com `oficial`
   * null — sem posição oficial e, portanto, sem "Bateu!" — e quem está atrás sobe. Lê `linha.gatilho` e
   * `linha.minimoVolume`; pilar ausente não bateu. Devolve cópias, sem alterar a entrada.
   */
  function numerarOficial(linhas, cfg) {
    let n = 0;
    return (linhas || []).map((l) => {
      const bateu = !!l && gatilhoPilares(l.gatilho, l.minimoVolume, cfg).batido;
      return Object.assign({}, l, { oficial: bateu ? ++n : null });
    });
  }

  /**
   * Status da linha (regras v1.14, seção 5; decisão de 08/11/2026, no conceito do Desafio Q4) -> { status, motivo }.
   * São TRÊS estados, todos em `STATUS` (nenhum texto de selo na tela):
   *   - "Bateu!" (`STATUS.bateu`): OS DOIS PILARES batidos (gatilho de Skyy E mínimo de volume de Aperitivo,
   *     `gatilhoPilares`) E a posição oficial dentro das posições premiadas do nível (`REGRAS.premiadas`, nunca
   *     número fixo em lógica nem em texto). É esta linha que a tela pinta de azul (regras v1.14);
   *   - "Bateu, fora do ranking" (`STATUS.fora`, etapa 4N): os dois pilares batidos, mas a posição oficial além do
   *     limite de premiadas — o caso que até a v1.13 devolvia "-" com o motivo "suba N posições". O motivo é o
   *     mesmo de antes; muda só o selo. A tela NÃO pinta a linha: só a tag, em cor própria;
   *   - "-" (`STATUS.nao`): qualquer outro caso (algum pilar pendente, ou pilares batidos sem posição oficial).
   * O `motivo` é "dentro das premiadas", o de `gatilhoPilares` ("cobertura em X%: precisa de 100%", "volume em X%:
   * precisa de 100%", "cobertura em X% e volume em Y%: precisam de 100%", "cobertura indisponível", "sem meta de
   * cobertura", "volume indisponível", "sem meta de volume") ou "suba N posições" ("suba 1 posição" no
   * singular). Desde as regras
   * v1.6 (decisão de 09/11/2026) ele NÃO vai mais para a tela — a coluna Status mostra só o selo —, e continua
   * calculado aqui porque é regra e serve a quem consultar o resultado do motor. A tela acrescenta o "✓" do
   * "✓ Bateu!" e nunca mostra prêmio.
   * nivel: 'gc' | 'svMista' | 'svSegmentada'. Nível sem limite publicado: erro (nunca adivinhar o limite).
   */
  function statusLinha(linha, nivel, cfg) {
    const regras = cfg || REGRAS;
    if (!Object.prototype.hasOwnProperty.call(regras.premiadas, nivel)) {
      throw new Error(`nível ${nivel} sem posições premiadas no Campari Club`);
    }
    const p = gatilhoPilares(linha && linha.gatilho, linha && linha.minimoVolume, regras);
    if (!p.batido) return { status: STATUS.nao, motivo: p.motivo };
    const oficial = linha ? linha.oficial : null;
    if (!numero(oficial)) return { status: STATUS.nao, motivo: null }; // pilares batidos sem posição oficial (numerarOficial não rodou)
    const limite = regras.premiadas[nivel];
    if (oficial <= limite) return { status: STATUS.bateu, motivo: MOTIVOS.premiadas };
    const n = oficial - limite;
    return { status: STATUS.fora, motivo: `suba ${n} ${n === 1 ? 'posição' : 'posições'}` };
  }

  /**
   * Meta dia de COBERTURA (regras, seção 7; decisão de 08/11/2026): (Meta − Real) ÷ dias úteis restantes, com o
   * Real até ontem (D-1). É travada: não desconta o Online do dia, então não muda ao longo do dia.
   *   - Real ≥ Meta (meta batida): 0;
   *   - dias restantes ≤ 0 (dia não útil, ou o mês já sem dia útil pela frente): a diferença total (Meta − Real);
   *   - o resultado é em CLIENTES inteiros, arredondado para CIMA (cliente não se divide), com tolerância de
   *     1e-9 para 8,0000000001 não virar 9;
   *   - meta, real ou dias não numéricos: null (nunca 0 nem chute).
   * Volume não usa esta conta: o `meta_dia` de volume vem pronto da API e não se recalcula.
   */
  function metaDiaCobertura(meta, real, diasRestantes) {
    if (!numero(meta) || !numero(real) || !numero(diasRestantes)) return null;
    const falta = meta - real;
    if (falta <= 0) return 0;
    return Math.ceil((diasRestantes > 0 ? falta / diasRestantes : falta) - 1e-9);
  }

  /**
   * Meta dia de VOLUME, só na EXIBIÇÃO (regras v1.4, seção 7; decisão de 09/11/2026; pendência 15 resolvida).
   * A `meta_dia` de volume vem PRONTA da API e nunca é recalculada: esta função só decide o que a tela mostra.
   *   - Real > Meta (meta do mês já batida): 0;
   *   - `meta_dia` negativa (a API publica negativos nas rotas com a meta batida, iguais aos do SAC): 0;
   *   - `meta_dia` não numérica (API em período de fechamento): null, que a tela mostra como "—".
   * A comparação usa só o Real (até ontem), SEM o Online — premissa a confirmar das regras v1.4, seção 7
   * (pendência 22): ela fica registrada SÓ no documento de regras desde a v1.12, não mais na tela, e o motor
   * segue a regra descrita ali sem decidir por conta própria.
   * A meta dia de COBERTURA não passa por aqui: `metaDiaCobertura` já devolve 0 com a meta batida e um inteiro
   * para cima (valor entre 0 e 1 vira 1), que é o que a v1.4 pede para ela.
   */
  function metaDiaVolume(metaDia, real, meta) {
    if (!numero(metaDia)) return null;
    if (numero(real) && numero(meta) && real > meta) return 0;
    if (metaDia < 0) return 0;
    return metaDia;
  }

  /**
   * Cor do quadradinho do % de cobertura de Skyy ("% do mês" e "% Acumulado" das tabelas de ranking; regras v1.6,
   * seção 7, decisão de 09/11/2026). É exibição, mas é regra: a tela pergunta a cor e nunca compara nada.
   *   - 'verde'    -> o valor BRUTO é ≥ ao mínimo do gatilho (`REGRAS.gatilho.minimo`);
   *   - 'vermelho' -> o valor bruto está abaixo desse mínimo;
   *   - null       -> sem valor ("—"): a tela não desenha quadradinho nenhum.
   * A comparação é no valor BRUTO, nunca no truncado da tela: 99,99999% aparece como "99,9%" e fica VERMELHO,
   * porque não bate o mínimo. O mínimo sai de `REGRAS` (ou do `cfg` de uma mudança futura), nunca fixo aqui.
   * Só o % de cobertura usa isto: os % mensais de Aperitivo (Out, Nov, Dez, Soma) não têm quadradinho.
   */
  function corDoPercentual(valor, cfg) {
    const regras = cfg || REGRAS;
    if (!numero(valor)) return null;
    return valor >= regras.gatilho.minimo ? 'verde' : 'vermelho';
  }

  /**
   * Cor do quadradinho do % do MÊS de Aperitivo (regras v1.7, seção 7; decisão da Karen de 09/11/2026). Vale só
   * para a coluna do mês vigente das tabelas de ranking e para o % do Consultor e do Detalhe do mês: a tela
   * pergunta a cor e nunca compara nada.
   *   - 'verde'    -> o valor BRUTO chega ao limite do mês: a trava (`REGRAS.trava[mes]`) nos meses travados e
   *                   `REGRAS.corAperitivoSemTrava` no mês sem trava (dezembro) — ⚠️ pendência 25;
   *   - 'vermelho' -> o valor bruto está abaixo desse limite;
   *   - null       -> sem valor ("—"): a tela não desenha quadradinho nenhum.
   * A comparação é no valor BRUTO, nunca no truncado da tela: 129,99999% aparece como "129,9%" e fica VERMELHO.
   * Mês fora da vigência: erro, como em `aplicarTrava` (nunca adivinhar o limite de um mês que não existe).
   * O % ACUMULADO de Aperitivo (a soma do ranking) não tem quadradinho: esta função não serve a ele.
   */
  function corDoPercentualAperitivo(valor, mes, cfg) {
    const regras = cfg || REGRAS;
    if (!Object.prototype.hasOwnProperty.call(regras.trava, mes)) throw new Error(`mês ${mes} fora da vigência do Campari Club`);
    if (!numero(valor)) return null;
    const trava = regras.trava[mes];
    const limite = trava === null || trava === undefined ? regras.corAperitivoSemTrava : trava;
    return valor >= limite ? 'verde' : 'vermelho';
  }

  /**
   * "Hoje" colorido (regras, seção 7; pendência 17, confirmada em 08/11/2026): Online > 0 E Online ≥ Meta dia.
   * Meta dia 0 com Online > 0 colore; meta dia 0 com Online 0 não colore; meta dia null (API em período de
   * fechamento, ou cobertura sem meta) não colore. Serve para volume (`meta_dia` da API) e para cobertura
   * (`metaDiaCobertura`): a tela só lê o resultado, não compara nada. A meta dia que entra aqui é a EXIBIDA
   * (`metaDiaVolume` no volume), para a cor do "Hoje" concordar com o número que está na coluna ao lado.
   */
  function hojeAtingiu(online, metaDia) {
    if (!numero(online) || online <= 0) return false;
    if (!numero(metaDia)) return false;
    return online >= metaDia;
  }

  return { versaoRegras: REGRAS.versao, REGRAS, MOTIVOS, STATUS, percentualMes, aplicarTrava, somaRanking, apurarMeses,
           somarGrupo, ordenarRanking, numerarRanking, montarRanking, chaveCodigo, percentualCobertura, diferenca,
           gatilhoCobertura, minimoVolume, gatilhoPilares, numerarOficial, statusLinha, metaDiaCobertura, metaDiaVolume, corDoPercentual,
           corDoPercentualAperitivo, hojeAtingiu };
});
