/*
 * Motor de cálculo — Campari Club 2026 (Coca-Cola Bandeirantes) — regras v1.3 (docs/regras.md)
 * Roda em Node (testes) e no navegador (painel HTML): window.MotorCampari.
 *
 * Toda regra de cálculo do painel fica só aqui: nenhuma fórmula no adaptador nem na tela.
 * Etapa 2: ranking de volume de Aperitivo (% do mês, trava, soma, ordem e posição).
 * Etapa 3: gatilho de cobertura de Skyy, posição oficial, status "Bateu!", meta dia de cobertura, diferença e
 * "hoje atingiu a meta dia". A tela (Etapa 4) só lê o resultado: nenhuma comparação nem texto de motivo fora daqui.
 *
 * Escala: % em pontos percentuais, SEM arredondar (142.2631… = 142,26…%); a tela trunca depois (regras, seção 7).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorCampari = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGRAS = {
    versao: '1.3',
    meses: [10, 11, 12], // vigência: outubro, novembro e dezembro de 2026
    // Trava do % do mês de Aperitivo (regras, seção 3): 130% em outubro e novembro; dezembro sem trava (null).
    trava: { 10: 130, 11: 130, 12: null },
    // Gatilho de cobertura de Skyy (regras, seção 2): média simples dos % de novembro e dezembro, mínimo 100%.
    // Outubro nunca entra. Em novembro o gatilho é parcial (só novembro).
    gatilho: { meses: [11, 12], minimo: 100 },
    // Posições premiadas de cada nível (regras, seção 5), usadas SÓ para decidir o "Bateu!": o painel não mostra
    // prêmio nenhum. Padrão do motor, como o gatilhoPontos do Desafio Q4: a regra em vigor não depende de arquivo
    // que pode faltar ou ficar ilegível. `statusLinha(linha, nivel, cfg)` aceita outro cfg para mudança futura.
    premiadas: { gc: 6, svMista: 12, svSegmentada: 3 },
  };

  // Textos exatos dos motivos mostrados embaixo do status (regras, seção 5). Ficam aqui para a tela e o adaptador
  // nunca escreverem o texto: motivo novo entra no motor, não no HTML.
  const MOTIVOS = {
    premiadas: 'dentro das premiadas',
    indisponivel: 'cobertura indisponível',
    semMeta: 'sem meta de cobertura',
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
   * Coluna "Oficial" (regras, seção 5): numera 1..k só quem bateu o gatilho, na ordem recebida — que é a do
   * ranking (`montarRanking`), já com a coluna "Pos." em todas as linhas. Quem não bateu fica com `oficial` null:
   * sem posição oficial e, portanto, sem "Bateu!". Lê `linha.gatilho.batido`; linha sem gatilho não bateu.
   * Devolve cópias, sem alterar a entrada.
   */
  function numerarOficial(linhas) {
    let n = 0;
    return (linhas || []).map((l) => {
      const bateu = !!(l && l.gatilho && l.gatilho.batido);
      return Object.assign({}, l, { oficial: bateu ? ++n : null });
    });
  }

  /**
   * Status da linha (regras, seção 5; decisão de 08/11/2026, no conceito do Desafio Q4) -> { status, motivo }.
   * "Bateu!" só com o gatilho batido E a posição oficial dentro das posições premiadas do nível
   * (`REGRAS.premiadas`, nunca número fixo em lógica nem em texto). Qualquer outro caso: "-".
   * O `motivo` é a linha que vai embaixo do status: "dentro das premiadas", "cobertura em X%: precisa de 100%"
   * (X truncado em 1 casa), "suba N posições" ("suba 1 posição" no singular), "cobertura indisponível" ou
   * "sem meta de cobertura". A tela acrescenta o "✓" do "✓ Bateu!" e nunca mostra prêmio.
   * nivel: 'gc' | 'svMista' | 'svSegmentada'. Nível sem limite publicado: erro (nunca adivinhar o limite).
   */
  function statusLinha(linha, nivel, cfg) {
    const regras = cfg || REGRAS;
    if (!Object.prototype.hasOwnProperty.call(regras.premiadas, nivel)) {
      throw new Error(`nível ${nivel} sem posições premiadas no Campari Club`);
    }
    const g = (linha && linha.gatilho) || { valor: null, batido: false, indisponivel: true, motivo: MOTIVOS.indisponivel };
    if (!g.batido) {
      if (g.indisponivel || !numero(g.valor)) return { status: '-', motivo: g.motivo || MOTIVOS.indisponivel };
      return { status: '-', motivo: `cobertura em ${pct1(g.valor)}%: precisa de ${texto(regras.gatilho.minimo)}%` };
    }
    const oficial = linha ? linha.oficial : null;
    if (!numero(oficial)) return { status: '-', motivo: null }; // gatilho batido sem posição oficial (numerarOficial não rodou)
    const limite = regras.premiadas[nivel];
    if (oficial <= limite) return { status: 'Bateu!', motivo: MOTIVOS.premiadas };
    const n = oficial - limite;
    return { status: '-', motivo: `suba ${n} ${n === 1 ? 'posição' : 'posições'}` };
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
   * "Hoje" colorido (regras, seção 7; pendência 17, confirmada em 08/11/2026): Online > 0 E Online ≥ Meta dia.
   * Meta dia 0 com Online > 0 colore; meta dia 0 com Online 0 não colore; meta dia null (API em período de
   * fechamento, ou cobertura sem meta) não colore. Serve para volume (`meta_dia` da API) e para cobertura
   * (`metaDiaCobertura`): a tela só lê o resultado, não compara nada.
   */
  function hojeAtingiu(online, metaDia) {
    if (!numero(online) || online <= 0) return false;
    if (!numero(metaDia)) return false;
    return online >= metaDia;
  }

  return { versaoRegras: REGRAS.versao, REGRAS, MOTIVOS, percentualMes, aplicarTrava, somaRanking, apurarMeses,
           ordenarRanking, numerarRanking, montarRanking, chaveCodigo, percentualCobertura, diferenca,
           gatilhoCobertura, numerarOficial, statusLinha, metaDiaCobertura, hojeAtingiu };
});
