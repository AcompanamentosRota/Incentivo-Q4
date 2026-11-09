/*
 * Motor de cálculo — Campari Club 2026 (Coca-Cola Bandeirantes) — regras v1.3 (docs/regras.md)
 * Roda em Node (testes) e no navegador (painel HTML): window.MotorCampari.
 *
 * Toda regra de cálculo do painel fica só aqui: nenhuma fórmula no adaptador nem na tela.
 * Etapa 2: ranking de volume de Aperitivo (% do mês, trava, soma, ordem e posição). Gatilho de cobertura, status,
 * posição oficial e meta dia de cobertura entram na Etapa 3.
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

  return { versaoRegras: REGRAS.versao, REGRAS, percentualMes, aplicarTrava, somaRanking, apurarMeses,
           ordenarRanking, numerarRanking, montarRanking, chaveCodigo };
});
