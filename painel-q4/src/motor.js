/*
 * Motor de cálculo — Desafio Q4 2026 (Coca-Cola Bandeirantes) — regras v3.1
 * Roda em Node (testes) e no navegador (painel HTML): window.MotorQ4.
 *
 * Princípios:
 *  - Todas as regras ficam na tabela REGRAS (um único lugar).
 *  - Pilares por cargo/canal/mês vêm da entrada (pilaresConfig). Nada fixo no código.
 *  - Faixas comparadas por multiplicação cruzada (total*100 >= limite*meta):
 *    nenhum arredondamento nem erro de ponto flutuante nos limites de 5 casas.
 *  - O % só é truncado para EXIBIÇÃO.
 *  - Nada é suposto: dado ausente/meta zero vira alerta, sem pontos.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorQ4 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────── REGRAS (fonte única) ─────────────────────────
  const REGRAS = {
    versao: '3.1',
    meses: [10, 11, 12],
    faixas: [ // ordem decrescente; limite inferior inclusivo, em % sobre a meta
      { min: 105, pontos: 5 },
      { min: 100, pontos: 3 },
      { min: 90, pontos: 2 },
      { min: 0, pontos: 0 },
    ],
    missaoValidadaMeses: [10], // out: Missões Guiadas entra validada em 100%
    missaoValidadaPct: 100,
    pilarRefri: 'Refrigerantes', // categoria do SAC (gatilho de volume e desempate)
    gatilhoVolumePct: 95,
    gatilhoPontos: { SV: 60, RT: 20 }, // SV: trimestre acumulado; RT: mês
    bonusConfronto: 5,
    premiadas: { SV: { Mista: 12, Segmentada: 2 }, RT: { Mista: 40, Segmentada: 10 } },
    cargos: ['SV', 'RT'],
    canais: ['Mista', 'Segmentada'],
    status: { nenhum: '-', fora: 'Bateu, mas não está no total', dentro: 'No total' },
    // Itens ainda pendentes de confirmação do Back Office (aparecem no painel)
    notasPendentes: [
      'Prazo de registro dos confrontos em cada mês: todos os confrontos registrados estão sendo considerados.',
      'Confronto vencido vale +5 para SV e mesa mesmo se o SV não bateu o gatilho de volume (o gatilho só valida a pontuação final).',
      '% acumulado de Refrigerantes do SV = Σ(Real+Online) ÷ Σ Meta, de out até o mês vigente.',
      'Desempate no ranking do SV usa o % acumulado de Refrigerantes do trimestre (no confronto, o % do mês).',
      'Mês do trimestre sem dado (mês fechado ausente na API): o acumulado do SV aparece como incompleto e o SV fica sem posição oficial até o dado chegar.',
      'Canal (Mista/Segmentada) e mesas dos meses fechados: o canal é o da base de segmentação atual; a mesa de cada mês é a supervisão da rota naquele mês.',
    ],
  };

  // ───────────────────────── utilitários ─────────────────────────
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /** Pontos de um pilar. total e meta em volume; sem divisão, sem arredondamento. */
  function faixaPontos(total, meta) {
    if (!(meta > 0) || !(total >= 0)) return 0;
    for (const f of REGRAS.faixas) if (total * 100 >= f.min * meta) return f.pontos;
    return 0;
  }

  const pctDe = (total, meta) => (meta > 0 && total !== null ? (total / meta) * 100 : null);

  /** Trunca para 1 casa (exibição). O epsilon cobre só ruído de ponto flutuante (< 1e-9). */
  function truncar1(pct) {
    if (pct === null || pct === undefined) return null;
    return Math.floor(pct * 10 + 1e-9) / 10;
  }
  function fmtPct(pct) {
    const t = truncar1(pct);
    return t === null ? '-' : t.toFixed(1).replace('.', ',') + '%';
  }
  /** Volume para exibição: sempre com 1 casa decimal e ponto de milhar. */
  function fmtVolume(v) {
    if (v === null || v === undefined) return '-';
    const [i, d] = Math.abs(v).toFixed(1).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
  }

  // ───────────────────────── pilar ─────────────────────────
  /**
   * @param {{meta,real,online}} m  medidas do pilar (online ausente = 0)
   * @param {{missaoValidada?:boolean}} opts
   */
  function calcPilar(m, opts) {
    const o = opts || {};
    const meta = num(m && m.meta);
    const real = num(m && m.real);
    const online = m && m.online !== undefined && m.online !== null ? num(m.online) : 0;
    const alertas = [];
    const base = { meta, real, online, total: null, diferenca: null, pct: null, pctTexto: '-', pontos: 0, validada: false, alertas };

    if (o.missaoValidada) {
      return Object.assign(base, {
        total: real === null ? null : real + (online || 0),
        pct: REGRAS.missaoValidadaPct,
        pctTexto: fmtPct(REGRAS.missaoValidadaPct),
        pontos: faixaPontos(REGRAS.missaoValidadaPct, 100),
        validada: true,
      });
    }
    if (meta === null) alertas.push('META_AUSENTE');
    else if (meta === 0) alertas.push('META_ZERO');
    else if (meta < 0) alertas.push('META_NEGATIVA');
    if (real === null) alertas.push('REAL_AUSENTE');
    if (online === null) alertas.push('ONLINE_INVALIDO');
    if (alertas.length) return base; // não pontua, não supõe valor

    const total = real + online;
    base.total = total;
    base.diferenca = total - meta;
    base.pct = pctDe(total, meta);
    base.pctTexto = fmtPct(base.pct);
    base.pontos = faixaPontos(total, meta);
    return base;
  }

  // ───────────────────────── confrontos ─────────────────────────
  function apurarConfrontos(mes, confrontos, svPorId, pilaresDoSV, pctPilar, pctRefri) {
    const resultado = {}; // idSV -> {venceu, adversarioId, pilar}
    const detalhes = [];
    const desafiados = new Set();
    const lista = (confrontos || [])
      .filter((c) => c.mes === mes)
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (num(a.c.ordem_registro) ?? Infinity) - (num(b.c.ordem_registro) ?? Infinity) || a.i - b.i)
      .map((x) => x.c);

    for (const c of lista) {
      const a = svPorId[c.id_sv_desafiante];
      const b = svPorId[c.id_sv_desafiado];
      const det = { mes, desafiante: c.id_sv_desafiante, desafiado: c.id_sv_desafiado, pilar: c.pilar, valido: false, motivo: null, vencedor: null };
      detalhes.push(det);
      if (!a || !b) { det.motivo = 'SV_NAO_ENCONTRADO'; continue; }
      if (a.id === b.id) { det.motivo = 'AUTODESAFIO'; continue; }
      if (a.canal !== b.canal) { det.motivo = 'CANAIS_DIFERENTES'; continue; }
      const pil = (pilaresDoSV(a) || []).find((p) => p.nome === c.pilar);
      if (!pil || pil.tipo !== 'volume') { det.motivo = 'PILAR_NAO_VOLUME'; continue; }
      if (desafiados.has(b.id)) { det.motivo = 'DESAFIADO_JA_RECEBEU'; continue; }
      desafiados.add(b.id); // todo desafiado entra automaticamente; máx. 1 desafio recebido
      det.valido = true;

      const pa = pctPilar(a.id, c.pilar), pb = pctPilar(b.id, c.pilar);
      Object.assign(det, { pctDesafiante: pa, pctDesafiado: pb }); // % do mês do confronto (a tela mostra o mês apurado)
      if (pa === null || pb === null) { det.motivo = 'SEM_DADO_PARA_APURAR'; continue; }
      let vencedor = null;
      if (pa !== pb) vencedor = pa > pb ? a.id : b.id;
      else {
        const ra = pctRefri(a.id), rb = pctRefri(b.id); // desempate: maior % de Refrigerantes
        if (ra !== null && rb !== null && ra !== rb) { vencedor = ra > rb ? a.id : b.id; det.motivo = 'DESEMPATE_REFRI'; }
        else det.motivo = 'EMPATE_SEM_VENCEDOR';
      }
      det.vencedor = vencedor;
      for (const id of [a.id, b.id]) {
        const prev = resultado[id];
        resultado[id] = { venceu: (prev && prev.venceu) || vencedor === id, pilar: c.pilar, adversario: id === a.id ? b.id : a.id };
      }
    }
    return { resultado, detalhes };
  }

  // ───────────────────────── cálculo principal ─────────────────────────
  /**
   * @param {object} e
   * @param {number} e.mesRef                 10, 11 ou 12
   * @param {string} [e.dataCorte]            data/hora de corte (metadata.json)
   * @param {Array}  e.pessoas                {id,nome,cargo:'SV'|'RT',canal,id_supervisor,unidade}
   * @param {Array}  e.pilaresConfig          {mes,canal,pilares:[{nome,tipo:'volume'|'missao'}]}
   * @param {Array}  e.medidas                {id,mes,pilar,meta,real,online}  (inclui pilar 'Refrigerantes')
   * @param {Array}  e.confrontos             {mes,id_sv_desafiante,id_sv_desafiado,pilar,ordem_registro}
   * @param {Array}  [e.mesesIncompletos]     {mes,motivo}: meses do trimestre sem dado (fechado que faltou ou falhou)
   */
  function calcular(e) {
    if (!REGRAS.meses.includes(e.mesRef)) throw new Error('mesRef fora do Q4: ' + e.mesRef);
    const alertasGlobais = [];
    const meses = REGRAS.meses.filter((m) => m <= e.mesRef);
    // mês do trimestre sem dado: o acumulado do SV fica incompleto (nunca soma só o que existe sem avisar)
    const incompletos = (e.mesesIncompletos || []).filter((x) => meses.includes(x.mes));

    // cadastro: sem duplicados, com canal/cargo válidos
    const vistos = new Set();
    const pessoas = [];
    for (const p of e.pessoas || []) {
      if (vistos.has(p.id)) { alertasGlobais.push({ codigo: 'PESSOA_DUPLICADA', id: p.id }); continue; }
      vistos.add(p.id);
      if (!REGRAS.canais.includes(p.canal)) { alertasGlobais.push({ codigo: 'SEM_CANAL', id: p.id }); continue; }
      if (!REGRAS.cargos.includes(p.cargo)) { alertasGlobais.push({ codigo: 'CARGO_INVALIDO', id: p.id }); continue; }
      pessoas.push(p);
    }
    const svPorId = {};
    pessoas.filter((p) => p.cargo === 'SV').forEach((p) => (svPorId[p.id] = p));

    // medidas indexadas (duplicata: mantém a primeira e alerta)
    const idx = new Map();
    for (const m of e.medidas || []) {
      const k = m.id + '|' + m.mes + '|' + m.pilar;
      if (idx.has(k)) { alertasGlobais.push({ codigo: 'MEDIDA_DUPLICADA', chave: k }); continue; }
      idx.set(k, m);
    }
    const cfg = (mes, canal) => (e.pilaresConfig || []).find((c) => c.mes === mes && c.canal === canal);
    const pilaresDe = (p, mes) => { const c = cfg(mes, p.canal); return c ? c.pilares : null; };

    // 1) pilares e Refrigerantes por pessoa/mês
    const calc = {}; // id -> mes -> {pilares, refri, alertas}
    for (const p of pessoas) {
      calc[p.id] = {};
      for (const mes of meses) {
        const lista = pilaresDe(p, mes);
        const alertas = [];
        if (!lista) alertas.push('CONFIG_PILARES_AUSENTE');
        const validada = REGRAS.missaoValidadaMeses.includes(mes);
        const pilares = (lista || []).map((pl) => {
          const r = calcPilar(idx.get(p.id + '|' + mes + '|' + pl.nome), { missaoValidada: pl.tipo === 'missao' && validada });
          r.alertas.forEach((a) => alertas.push(a + ':' + pl.nome));
          return Object.assign({ nome: pl.nome, tipo: pl.tipo }, r);
        });
        const refri = calcPilar(idx.get(p.id + '|' + mes + '|' + REGRAS.pilarRefri));
        refri.alertas.forEach((a) => alertas.push(a + ':' + REGRAS.pilarRefri));
        calc[p.id][mes] = { pilares, refri, alertas };
      }
    }

    // 2) confrontos por mês
    const confrontoMes = {}; // mes -> {resultado, detalhes}
    const todosDetalhes = [];
    for (const mes of meses) {
      const pctPilar = (id, nome) => { const pl = calc[id] && calc[id][mes].pilares.find((x) => x.nome === nome); return pl ? pl.pct : null; };
      const pctRefri = (id) => (calc[id] ? calc[id][mes].refri.pct : null);
      confrontoMes[mes] = apurarConfrontos(mes, e.confrontos, svPorId, (sv) => pilaresDe(sv, mes), pctPilar, pctRefri);
      todosDetalhes.push(...confrontoMes[mes].detalhes);
    }

    // 3) pontos por mês, agregados e gatilhos
    const saida = pessoas.map((p) => {
      const supervisor = p.cargo === 'RT' ? svPorId[p.id_supervisor] : null;
      const alertas = [];
      // id_supervisor vazio = cadastro ainda sem vínculo (nota global); preenchido e não encontrado = alerta da pessoa
      if (p.cargo === 'RT' && p.id_supervisor != null && !supervisor) alertas.push('SUPERVISOR_NAO_ENCONTRADO');

      const porMes = meses.map((mes) => {
        // mês sem dado não soma nada (nem a Missões validada de outubro): o acumulado fica marcado como incompleto
        if (incompletos.some((x) => x.mes === mes)) return { mes, semDado: true, pontosPilares: 0, confrontoVencido: false, pontosConfronto: 0, pontosMes: 0 };
        const c = calc[p.id][mes];
        const pontosPilares = c.pilares.reduce((s, x) => s + x.pontos, 0);
        const idSV = p.cargo === 'SV' ? p.id : supervisor ? supervisor.id : null;
        const venceu = !!(idSV && confrontoMes[mes].resultado[idSV] && confrontoMes[mes].resultado[idSV].venceu);
        const pontosConfronto = venceu ? REGRAS.bonusConfronto : 0;
        c.alertas.forEach((a) => alertas.push('M' + mes + ':' + a));
        return { mes, pontosPilares, confrontoVencido: venceu, pontosConfronto, pontosMes: pontosPilares + pontosConfronto };
      });
      const mesAtual = porMes[porMes.length - 1];
      const atual = calc[p.id][e.mesRef];

      // gatilho de volume
      let volume;
      if (p.cargo === 'RT') {
        const r = atual.refri;
        volume = { escopo: 'mês', pct: r.pct, pctTexto: r.pctTexto, atingido: r.total !== null && r.total * 100 >= REGRAS.gatilhoVolumePct * r.meta };
      } else {
        let st = 0, sm = 0, ok = true;
        for (const mes of meses) { const r = calc[p.id][mes].refri; if (r.total === null) ok = false; else { st += r.total; sm += r.meta; } }
        const pct = ok ? pctDe(st, sm) : null;
        volume = { escopo: 'trimestre acumulado', pct, pctTexto: fmtPct(pct), atingido: ok && sm > 0 && st * 100 >= REGRAS.gatilhoVolumePct * sm };
      }

      // gatilho de pontos
      const acumulado = porMes.reduce((s, x) => s + x.pontosMes, 0);
      const valorGatilho = p.cargo === 'SV' ? acumulado : mesAtual.pontosMes;
      const minimo = REGRAS.gatilhoPontos[p.cargo];
      const gatilhoPontos = { minimo, valor: valorGatilho, atingido: valorGatilho >= minimo };

      const r = {
        id: p.id, nome: p.nome, cargo: p.cargo, canal: p.canal, unidade: p.unidade, id_supervisor: p.id_supervisor || null,
        mesRef: e.mesRef,
        pilares: atual.pilares,
        refri: atual.refri,
        porMes,
        pontosPilares: mesAtual.pontosPilares,
        pontosConfronto: mesAtual.pontosConfronto,
        pontosMes: mesAtual.pontosMes, // valor interno (sempre numérico)
        pontosAcumulados: p.cargo === 'SV' ? acumulado : undefined, // Consultor: não se aplica
        acumuladoIncompleto: p.cargo === 'SV' ? incompletos.map((x) => x.mes) : undefined,
        volume,
        gatilhoPontos,
        alertas,
      };
      // exibição (decisão de 26/10/2026): os pontos aparecem mesmo sem o gatilho de volume;
      // só status, ranking e premiação dependem dele
      r.pontosAtuaisExibidos = r.pontosMes;
      if (p.cargo === 'SV') r.pontosAcumuladosExibidos = acumulado;
      // SV com mês do trimestre sem dado não entra no ranking oficial: o acumulado não está completo ⚠️
      r.elegivel = volume.atingido && gatilhoPontos.atingido && !(p.cargo === 'SV' && incompletos.length);
      r.status = REGRAS.status.nenhum;
      r.posicao = null;
      r.premiada = false;
      return r;
    });

    // 4) ranking por cargo × canal (só elegíveis); desempate: maior % de Refrigerantes
    const ranking = {};
    for (const cargo of REGRAS.cargos) for (const canal of REGRAS.canais) {
      const grupo = saida.filter((r) => r.cargo === cargo && r.canal === canal && r.elegivel);
      grupo.sort((a, b) => b.gatilhoPontos.valor - a.gatilhoPontos.valor || b.volume.pct - a.volume.pct || (a.id < b.id ? -1 : 1));
      const limite = REGRAS.premiadas[cargo][canal];
      grupo.forEach((r, i) => {
        r.posicao = i + 1;
        r.premiada = r.posicao <= limite;
        r.status = r.premiada ? REGRAS.status.dentro : REGRAS.status.fora;
        const viz = [grupo[i - 1], grupo[i + 1]].filter(Boolean);
        if (viz.some((v) => v.gatilhoPontos.valor === r.gatilhoPontos.valor && v.volume.pct === r.volume.pct)) r.alertas.push('EMPATE_TOTAL_NO_RANKING');
      });
      ranking[cargo + '|' + canal] = { limite, elegiveis: grupo.length, premiados: grupo.filter((r) => r.premiada).map((r) => r.id) };
    }

    return {
      meta: { mesRef: e.mesRef, dataCorte: e.dataCorte || null, regras: REGRAS.versao },
      pessoas: saida,
      ranking,
      confrontos: todosDetalhes,
      alertas: alertasGlobais,
      mesesIncompletos: incompletos,
      semVinculoSupervisor: pessoas.filter((p) => p.cargo === 'RT' && p.id_supervisor == null).length,
      notasPendentes: REGRAS.notasPendentes,
      avisoOutubro: e.mesRef === 10
        ? 'Em outubro o teto do mês é 30 pontos e o gatilho do SV é 60 acumulados: nenhum SV atinge o gatilho de pontos neste mês.'
        : null,
    };
  }

  // ───────────────────────── conferências automáticas ─────────────────────────
  /** Recalcula do zero e compara com o exibido. Retorna lista de falhas ([] = tudo certo). */
  function conferir(resultado, entrada) {
    const falhas = [];
    for (const r of resultado.pessoas) {
      if (r.pontosPilares + r.pontosConfronto !== r.pontosMes) falhas.push('SOMA_PONTOS:' + r.id);
      for (const p of r.pilares) {
        if (p.validada || p.total === null) continue;
        if (p.diferenca !== p.real + p.online - p.meta) falhas.push('DIFERENCA:' + r.id + ':' + p.nome);
        if (p.pct !== ((p.real + p.online) / p.meta) * 100) falhas.push('PCT:' + r.id + ':' + p.nome);
        if (p.pontos !== faixaPontos(p.real + p.online, p.meta)) falhas.push('PONTOS_PILAR:' + r.id + ':' + p.nome);
      }
      if (r.pilares.reduce((s, x) => s + x.pontos, 0) !== r.pontosPilares) falhas.push('SOMA_PILARES:' + r.id);
      if (!r.volume.atingido && (r.status !== '-' || r.posicao !== null)) falhas.push('SEM_GATILHO_VOLUME_COM_STATUS:' + r.id);
      if (r.cargo === 'RT' && 'pontosAcumulados' in r && r.pontosAcumulados !== undefined) falhas.push('RT_COM_ACUMULADO:' + r.id);
    }
    const ids = resultado.pessoas.map((r) => r.id);
    if (new Set(ids).size !== ids.length) falhas.push('PESSOA_DUPLICADA');
    if (entrada) {
      const cad = {}, out = {};
      (entrada.pessoas || []).forEach((p) => { if (REGRAS.canais.includes(p.canal)) cad[p.cargo + p.canal] = (cad[p.cargo + p.canal] || 0) + 1; });
      resultado.pessoas.forEach((r) => (out[r.cargo + r.canal] = (out[r.cargo + r.canal] || 0) + 1));
      if (JSON.stringify(Object.entries(cad).sort()) !== JSON.stringify(Object.entries(out).sort())) falhas.push('CONTAGEM_POR_CANAL');
    }
    return falhas;
  }

  return { REGRAS, calcular, calcPilar, faixaPontos, apurarConfrontos, conferir, truncar1, fmtPct, fmtVolume };
});
