const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/motor.js');
const { calcPilar, faixaPontos, calcular, conferir, fmtPct } = M;

// ── fixtures ──────────────────────────────────────────────
const META = 10_000_000; // 5 casas decimais de % = 1 unidade de volume
const vol = (pct) => Math.round(pct * 100_000); // pct -> volume com meta 10.000.000

const CFG_OUT = [
  { mes: 10, canal: 'Mista', pilares: [
    { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' },
    { nome: 'Missões Guiadas', tipo: 'missao' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' } ] },
  { mes: 10, canal: 'Segmentada', pilares: [
    { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' },
    { nome: 'Volume Powerade', tipo: 'volume' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
];
// novembro: coringas (4 e 5) diferentes; Missões Guiadas passa a ter meta
const CFG_NOV = [
  { mes: 11, canal: 'Mista', pilares: [
    { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' },
    { nome: 'Missões Guiadas', tipo: 'missao' }, { nome: 'Volume Água', tipo: 'volume' }, { nome: 'Volume Chás', tipo: 'volume' } ] },
  { mes: 11, canal: 'Segmentada', pilares: [
    { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' },
    { nome: 'Volume Powerade', tipo: 'volume' }, { nome: 'Volume Água', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
];

/** medidas de uma pessoa em um mês: todos os pilares do cfg em `pct`, Refri em `refri` */
function med(id, mes, cfg, canal, pct, refri = pct) {
  const pilares = cfg.find((c) => c.mes === mes && c.canal === canal).pilares;
  const out = pilares.filter((p) => p.tipo !== 'missao') // Missões Guiadas: sempre informada explicitamente nos testes
    .map((p) => ({ id, mes, pilar: p.nome, meta: META, real: vol(pct), online: 0 }));
  out.push({ id, mes, pilar: 'Refrigerantes', meta: META, real: vol(refri), online: 0 });
  return out;
}
const pessoa = (id, cargo, canal, sup) => ({ id, nome: id, cargo, canal, id_supervisor: sup || null, unidade: 'GYN' });

// ── 1. limites de faixa ──────────────────────────────────
test('limites de faixa por pilar (5 casas decimais)', () => {
  const casos = [
    [89.99999, 0, '89,9%'], [90, 2, '90,0%'], [99.99999, 2, '99,9%'],
    [100, 3, '100,0%'], [104.99999, 3, '104,9%'], [105, 5, '105,0%'],
  ];
  for (const [pct, pontos, texto] of casos) {
    const r = calcPilar({ meta: META, real: vol(pct), online: 0 });
    assert.equal(r.pontos, pontos, `pontos em ${pct}`);
    assert.equal(r.pctTexto, texto, `exibição em ${pct}`);
  }
  assert.equal(faixaPontos(0, META), 0);
  assert.equal(faixaPontos(20_000_000, META), 5);
});

test('99,99999% nunca aparece como 100,0% (truncar, não arredondar)', () => {
  const r = calcPilar({ meta: META, real: vol(99.99999), online: 0 });
  assert.notEqual(r.pctTexto, '100,0%');
  assert.equal(r.pontos, 2);
});

// ── 2. diferença, %, online ──────────────────────────────
test('Diferença = Real + Online − Meta; % = (Real + Online) ÷ Meta', () => {
  const r = calcPilar({ meta: 1000, real: 800, online: 150 });
  assert.equal(r.total, 950);
  assert.equal(r.diferenca, -50);
  assert.equal(r.pct, 95);
  assert.equal(r.pontos, 2);
});

test('online zerado ou ausente equivale a 0', () => {
  const a = calcPilar({ meta: 1000, real: 1000, online: 0 });
  const b = calcPilar({ meta: 1000, real: 1000 });
  const c = calcPilar({ meta: 1000, real: 1000, online: null });
  for (const r of [a, b, c]) { assert.equal(r.pontos, 3); assert.equal(r.diferenca, 0); assert.deepEqual(r.alertas, []); }
});

test('o online pode mudar a faixa do pilar', () => {
  assert.equal(calcPilar({ meta: 1000, real: 890, online: 0 }).pontos, 0);
  assert.equal(calcPilar({ meta: 1000, real: 890, online: 10 }).pontos, 2);
});

// ── 3. meta zero / ausente ───────────────────────────────
test('meta zero: alerta, sem pontos, sem NaN/Infinity', () => {
  const r = calcPilar({ meta: 0, real: 500, online: 0 });
  assert.equal(r.pontos, 0);
  assert.equal(r.pct, null);
  assert.equal(r.diferenca, null);
  assert.equal(r.pctTexto, '-');
  assert.deepEqual(r.alertas, ['META_ZERO']);
});
test('meta ausente e real ausente: alerta, não supõe valor', () => {
  assert.deepEqual(calcPilar({ real: 500 }).alertas, ['META_AUSENTE']);
  assert.deepEqual(calcPilar({ meta: 100 }).alertas, ['REAL_AUSENTE']);
  assert.equal(calcPilar(undefined).pontos, 0);
});

// ── 4. Missões Guiadas ───────────────────────────────────
test('Missões Guiadas validada em 100% em outubro = 3 pontos, mesmo sem meta', () => {
  const r = calcPilar({}, { missaoValidada: true });
  assert.equal(r.pontos, 3);
  assert.equal(r.validada, true);
  assert.equal(r.pctTexto, '100,0%');
});

test('outubro: Consultor com 100% nos 5 pilares = 15 pontos (3 de Missões)', () => {
  const e = base10([pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1')], [
    ...med('SV1', 10, CFG_OUT, 'Mista', 100), ...med('RT1', 10, CFG_OUT, 'Mista', 100)]);
  const rt = calcular(e).pessoas.find((p) => p.id === 'RT1');
  assert.equal(rt.pontosPilares, 15);
  assert.equal(rt.pilares.find((p) => p.nome === 'Missões Guiadas').pontos, 3);
});

test('novembro: Missões Guiadas tem meta e pontua como os demais', () => {
  const e = base11([pessoa('RT1', 'RT', 'Mista', 'SV1'), pessoa('SV1', 'SV', 'Mista')], [
    ...med('RT1', 11, CFG_NOV, 'Mista', 100).concat([{ id: 'RT1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 105, online: 0 }]),
    ...med('SV1', 11, CFG_NOV, 'Mista', 100)]);
  const rt = calcular(e).pessoas.find((p) => p.id === 'RT1');
  assert.equal(rt.pilares.find((p) => p.nome === 'Missões Guiadas').pontos, 5);
  assert.equal(rt.pilares.find((p) => p.nome === 'Missões Guiadas').validada, false);
});

test('novembro sem dado de Missões Guiadas: alerta e 0 pontos (não vale a validação de outubro)', () => {
  const e = base11([pessoa('RT1', 'RT', 'Mista', 'SV1'), pessoa('SV1', 'SV', 'Mista')], [...med('RT1', 11, CFG_NOV, 'Mista', 100), ...med('SV1', 11, CFG_NOV, 'Mista', 100)]);
  const rt = calcular(e).pessoas.find((p) => p.id === 'RT1');
  assert.equal(rt.pilares.find((p) => p.nome === 'Missões Guiadas').pontos, 0);
  assert.ok(rt.alertas.some((a) => a.startsWith('M11:META_AUSENTE:Missões Guiadas')));
});

// ── 5. pilares coringa mudam entre meses ─────────────────
test('coringa: cada mês usa os pilares da sua configuração', () => {
  const pessoas = [pessoa('SV1', 'SV', 'Mista')];
  const medidas = [
    ...med('SV1', 10, CFG_OUT, 'Mista', 100), // out: Sucos e Powerade a 100%
    ...med('SV1', 11, CFG_NOV, 'Mista', 105), // nov: Água e Chás a 105%
    { id: 'SV1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 100, online: 0 },
  ];
  const base = { pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos: [] };
  const nov = calcular({ ...base, mesRef: 11 }).pessoas[0];
  assert.deepEqual(nov.pilares.map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Água', 'Volume Chás']);
  assert.equal(nov.pilares.find((p) => p.nome === 'Volume Água').pontos, 5);
  assert.ok(!nov.pilares.some((p) => p.nome === 'Volume Sucos'), 'pilar de outubro não vaza para novembro');
  // out: 4 pilares × 3 + missão validada 3 = 15 ; nov: 4 pilares × 5 + missão (100%) 3 = 23
  assert.deepEqual(nov.porMes.map((m) => m.pontosPilares), [15, 23]);
  assert.equal(nov.pontosAcumulados, 38);
});

test('configuração do mês ausente: alerta, sem inventar pilares', () => {
  const e = { mesRef: 11, pessoas: [pessoa('SV1', 'SV', 'Mista')], pilaresConfig: CFG_OUT, medidas: [], confrontos: [] };
  const r = calcular(e).pessoas[0];
  assert.ok(r.alertas.includes('M11:CONFIG_PILARES_AUSENTE'));
  assert.equal(r.pilares.length, 0);
});

// ── 6. gatilho de volume ─────────────────────────────────
test('volume abaixo de 95% com pontos altos: pontos aparecem, mas status "-" e fora do ranking', () => {
  const e = base10([pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1')], [
    ...med('SV1', 10, CFG_OUT, 'Mista', 110), ...med('RT1', 10, CFG_OUT, 'Mista', 110, 94.99999)]);
  const res = calcular(e);
  const rt = res.pessoas.find((p) => p.id === 'RT1');
  assert.equal(rt.pontosMes, 5 * 5 - 2 /* missão vale 3, não 5 */, 'pontos internos altos (23)');
  assert.equal(rt.volume.atingido, false);
  assert.equal(rt.pontosAtuaisExibidos, 23, 'os pontos aparecem mesmo sem o gatilho de volume');
  assert.equal(rt.status, '-');
  assert.equal(rt.posicao, null);
  assert.equal(rt.premiada, false);
  assert.equal(res.ranking['RT|Mista'].elegiveis, 0);
});

test('volume exatamente 95% atinge o gatilho', () => {
  const e = base10([pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1')], [
    ...med('SV1', 10, CFG_OUT, 'Mista', 100), ...med('RT1', 10, CFG_OUT, 'Mista', 100, 95)]);
  assert.equal(calcular(e).pessoas.find((p) => p.id === 'RT1').volume.atingido, true);
});

test('Consultor: gatilho de volume é do mês vigente; SV: acumulado do trimestre (Σ real ÷ Σ meta)', () => {
  const pessoas = [pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1')];
  const medidas = [];
  // out: Refri 100% ; nov: Refri 90% → SV acumulado = 95% (atinge), RT no mês de nov = 90% (não atinge)
  for (const id of ['SV1', 'RT1']) {
    medidas.push(...med(id, 10, CFG_OUT, 'Mista', 100, 100));
    medidas.push(...med(id, 11, CFG_NOV, 'Mista', 100, 90), { id, mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 100 });
  }
  const res = calcular({ mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos: [] });
  const sv = res.pessoas.find((p) => p.id === 'SV1'), rt = res.pessoas.find((p) => p.id === 'RT1');
  assert.equal(sv.volume.atingido, true);
  assert.equal(sv.volume.pctTexto, '95,0%');
  assert.equal(rt.volume.atingido, false);
  assert.equal(rt.volume.pctTexto, '90,0%');
});

test('SV: abaixo de 95% acumulado os pontos acumulados aparecem, mas o status fica "-"', () => {
  const pessoas = [pessoa('SV1', 'SV', 'Mista')];
  const mk = (refriNov) => [
    ...med('SV1', 10, CFG_OUT, 'Mista', 105, 100),
    ...med('SV1', 11, CFG_NOV, 'Mista', 105, refriNov), { id: 'SV1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 105 },
  ];
  const run = (refriNov) => calcular({ mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas: mk(refriNov), confrontos: [] }).pessoas[0];
  const baixo = run(80); // acumulado 90%
  assert.equal(baixo.volume.atingido, false);
  assert.ok(baixo.pontosAcumulados > 0);
  assert.equal(baixo.pontosAcumuladosExibidos, baixo.pontosAcumulados);
  assert.equal(baixo.status, '-');
  assert.equal(baixo.posicao, null);
  const alto = run(95); // acumulado 97,5%
  assert.equal(alto.volume.atingido, true);
  assert.equal(alto.pontosAcumuladosExibidos, alto.pontosAcumulados);
});

// ── 7. gatilho de pontos ─────────────────────────────────
test('Consultor: 17 pontos no mês é o mínimo no padrão do motor (16 = "-", 17 = ranqueado), só com os pilares', () => {
  // Mínimo do Consultor = 17 desde 29/10/2026 (gerência de planejamento e IM); antes eram 20, e este teste
  // media a fronteira em 19/20. Agora a fronteira é 16/17, e o valor vem do padrão do motor, sem ajuste nenhum.
  // out: Missões validada (3) + 4 pilares de volume. RT1 = 5+5+2+2 (+3) = 17; RT2 = 5+5+3+0 (+3) = 16.
  // Desde 03/11/2026 o +5 do confronto é só do SV: a rota chega ao mínimo só pelos pilares.
  const pessoas = [pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1'), pessoa('RT2', 'RT', 'Mista', 'SV1')];
  const medidas = [...med('SV1', 10, CFG_OUT, 'Mista', 100), ...med('RT1', 10, CFG_OUT, 'Mista', 105), ...med('RT2', 10, CFG_OUT, 'Mista', 105)];
  for (const pl of ['Volume Sucos', 'Volume Powerade']) medidas.find((m) => m.id === 'RT1' && m.pilar === pl).real = vol(90);
  medidas.find((m) => m.id === 'RT2' && m.pilar === 'Volume Sucos').real = vol(100);
  medidas.find((m) => m.id === 'RT2' && m.pilar === 'Volume Powerade').real = vol(80);
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos: [], fechamento: true });
  const rt1 = res.pessoas.find((p) => p.id === 'RT1'), rt2 = res.pessoas.find((p) => p.id === 'RT2');
  assert.equal(M.REGRAS.gatilhoPontos.RT, 17, 'o padrão do motor é a regra em vigor (29/10/2026), sem depender do ajustes.json');
  assert.deepEqual([rt1.pontosMes, rt1.gatilhoPontos.minimo, rt1.gatilhoPontos.atingido, rt1.status], [17, 17, true, 'Bateu!']);
  assert.deepEqual([rt2.pontosMes, rt2.gatilhoPontos.minimo, rt2.gatilhoPontos.atingido, rt2.status], [16, 17, false, '-']);
  assert.equal(rt2.pontosAtuaisExibidos, 16, 'volume ok: pontos aparecem, só o status fica "-"');
  assert.deepEqual(conferir(res), []);
});

test('bônus só do SV (03/11/2026): rota da mesa do vencedor com 15 de pilares não chega ao mínimo de 17 nem no fechamento', () => {
  // até 03/11/2026 o +5 da mesa levava a rota de 15 a 20 e ela batia o mínimo de 17. O 17 vinha do
  // ajustes.json e este teste o forçava nas REGRAS; desde 29/10/2026 ele é o padrão do motor, e o teste usa o padrão.
  const pessoas = [pessoa('Sv. Ficticio A', 'SV', 'Mista'), pessoa('Sv. Ficticio B', 'SV', 'Mista'), pessoa('R901', 'RT', 'Mista', 'Sv. Ficticio A')];
  const medidas = [...med('Sv. Ficticio A', 10, CFG_OUT, 'Mista', 110), ...med('Sv. Ficticio B', 10, CFG_OUT, 'Mista', 100), ...med('R901', 10, CFG_OUT, 'Mista', 100)];
  const confrontos = [{ mes: 10, id_sv_desafiante: 'Sv. Ficticio A', id_sv_desafiado: 'Sv. Ficticio B', pilar: 'Volume Sabores', ordem_registro: 1 }];
  for (const fechamento of [false, true]) {
    const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos, fechamento });
    const rt = res.pessoas.find((p) => p.id === 'R901');
    assert.equal(res.confrontos[0].vencedor, 'Sv. Ficticio A');
    assert.deepEqual([rt.pontosPilares, rt.pontosConfronto, rt.bonusPendente, rt.pontosMes], [15, 0, 0, 15], `fechamento=${fechamento}`);
    assert.deepEqual(rt.porMes.map((m) => m.confrontoVencido), [false]);
    assert.deepEqual([rt.gatilhoPontos.minimo, rt.gatilhoPontos.valor, rt.gatilhoPontos.atingido], [17, 15, false]);
    assert.deepEqual([rt.status, rt.posicao, rt.premiada], ['-', null, false]);
    assert.equal(rt.id_supervisor, 'Sv. Ficticio A'); // a rota continua na mesa (soma do SV e filtros)
    assert.deepEqual(conferir(res), []);
  }
});

test('bônus só do SV (03/11/2026): o ranking dos Consultores usa só os pilares', () => {
  // RA (mesa do vencedor) tem 20; RB (mesa do perdedor) tem 23. Com o +5 da mesa, RA ficava em 1º com 25.
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('RA', 'RT', 'Mista', 'A'), pessoa('RB', 'RT', 'Mista', 'B')];
  const medidas = [...med('A', 10, CFG_OUT, 'Mista', 110), ...med('B', 10, CFG_OUT, 'Mista', 100), ...med('RA', 10, CFG_OUT, 'Mista', 105), ...med('RB', 10, CFG_OUT, 'Mista', 105)];
  medidas.find((m) => m.id === 'RA' && m.pilar === 'Volume Powerade').real = vol(90);
  const confrontos = [{ mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 }];
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos, fechamento: true });
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.equal(res.confrontos[0].vencedor, 'A');
  assert.deepEqual(['RB', 'RA'].map((id) => [g(id).gatilhoPontos.valor, g(id).posicao, g(id).status]), [[23, 1, 'Bateu!'], [20, 2, 'Bateu!']]);
  assert.deepEqual(res.ranking['RT|Mista'].premiados, ['RB', 'RA']);
});

test('SV: gatilho de 60 é acumulado; em outubro (teto 30) nenhum SV atinge', () => {
  const e = base10([pessoa('SV1', 'SV', 'Mista')], med('SV1', 10, CFG_OUT, 'Mista', 120));
  const res = calcular(e);
  const sv = res.pessoas[0];
  assert.equal(sv.pontosMes, 5 * 4 + 3); // 4 pilares a 5 + missão validada 3 = 23
  assert.equal(sv.status, '-');
  assert.ok(res.avisoOutubro);
});

test('SV: acumulado de out+nov (48) ainda não atinge o gatilho de 60', () => {
  const pessoas = [pessoa('SV1', 'SV', 'Mista')];
  const medidas = [...med('SV1', 10, CFG_OUT, 'Mista', 120), ...med('SV1', 11, CFG_NOV, 'Mista', 120), { id: 'SV1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 120 }];
  const sv = calcular({ mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos: [] }).pessoas[0];
  assert.equal(sv.pontosAcumulados, 23 + 25);
  assert.equal(sv.gatilhoPontos.atingido, false); // 48 < 60
  const out = calcular({ mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos: [] }).pessoas[0];
  assert.equal(out.pontosAcumuladosExibidos, 48);
});

test('SV: mês do trimestre sem dado não soma nada, marca o acumulado como incompleto e tira a posição oficial', () => {
  const pessoas = [pessoa('SV1', 'SV', 'Mista'), pessoa('R1', 'RT', 'Mista', 'SV1')];
  const medidas = [...med('SV1', 10, CFG_OUT, 'Mista', 120), ...med('SV1', 11, CFG_NOV, 'Mista', 120), { id: 'SV1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 120 },
                   ...med('R1', 11, CFG_NOV, 'Mista', 120), { id: 'R1', mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 120 }];
  const e = { mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos: [] };
  const completo = calcular(e).pessoas.find((p) => p.id === 'SV1');
  assert.deepEqual([completo.pontosAcumulados, completo.acumuladoIncompleto], [48, []]);
  const res = calcular({ ...e, mesesIncompletos: [{ mes: 10, motivo: 'outubro não carregou' }] });
  const sv = res.pessoas.find((p) => p.id === 'SV1'), rt = res.pessoas.find((p) => p.id === 'R1');
  assert.deepEqual(sv.porMes.map((m) => [m.mes, m.pontosMes, !!m.semDado]), [[10, 0, true], [11, 25, false]]);
  assert.deepEqual([sv.pontosAcumulados, sv.acumuladoIncompleto, sv.elegivel, sv.posicao, sv.status], [25, [10], false, null, '-']);
  assert.equal(rt.pontosMes, 25);                       // o consultor (só o mês vigente) não muda
  assert.equal(rt.acumuladoIncompleto, undefined);
  assert.deepEqual(res.mesesIncompletos, [{ mes: 10, motivo: 'outubro não carregou' }]);
  assert.deepEqual(conferir(res), []);
});

// ── 8. confrontos ────────────────────────────────────────
function cenarioConfronto(pctA, pctB, refriA = 100, refriB = 100, extra = {}) {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('RA', 'RT', 'Mista', 'A'), pessoa('RB', 'RT', 'Mista', 'B')];
  const medidas = [];
  for (const [id, pct, refri] of [['A', pctA, refriA], ['B', pctB, refriB], ['RA', 100, 100], ['RB', 100, 100]]) medidas.push(...med(id, 10, CFG_OUT, 'Mista', pct, refri));
  const confrontos = [{ mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 }];
  return calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos: extra.confrontos || confrontos, fechamento: extra.fechamento });
}

test('confronto: o SV vencedor ganha +5 no fechamento do mês, a mesa dele não (03/11/2026); quem perde não perde pontos', () => {
  const res = cenarioConfronto(110, 100, 100, 100, { fechamento: true });
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.equal(g('A').pontosConfronto, 5);
  assert.equal(g('A').pontosMes, 23 + 5);
  assert.deepEqual([g('RA').pontosConfronto, g('RA').bonusPendente, g('RA').porMes[0].confrontoVencido], [0, 0, false]);
  assert.equal(g('RA').pontosMes, 15, 'mesa do vencedor fica só com os 15 de pilares');
  assert.equal(g('B').pontosConfronto, 0);
  assert.equal(g('RB').pontosConfronto, 0);
  assert.equal(g('RB').pontosMes, 15, 'mesa do perdedor mantém os 15 de pilares');
  assert.equal(res.confrontos[0].mesFechado, true);
  assert.deepEqual(conferir(res), []);
});

test('confronto (regra de 30/10/2026): no mês aberto o vencedor é parcial e o +5 fica pendente só no SV, fora dos pontos', () => {
  const res = cenarioConfronto(110, 100);
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.deepEqual([res.confrontos[0].vencedor, res.confrontos[0].mesFechado], ['A', false]); // o motor já sabe quem está vencendo
  assert.deepEqual(['A', 'RA', 'B', 'RB'].map((id) => [g(id).pontosConfronto, g(id).bonusPendente]), [[0, 5], [0, 0], [0, 0], [0, 0]]);
  assert.deepEqual([g('A').pontosMes, g('A').pontosAcumulados, g('RA').pontosMes], [23, 23, 15]); // só pilares: nem no mês, nem no acumulado
  assert.deepEqual(conferir(res), []);
});

test('confronto (regra de 30/10/2026): o +5 de um mês fechado entra no acumulado do SV; o do mês aberto, só quando ele fechar', () => {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('RA', 'RT', 'Mista', 'A')];
  const medidas = [];
  for (const [id, pct] of [['A', 110], ['B', 100], ['RA', 100]]) {
    medidas.push(...med(id, 10, CFG_OUT, 'Mista', pct), ...med(id, 11, CFG_NOV, 'Mista', pct), { id, mes: 11, pilar: 'Missões Guiadas', meta: 100, real: 100 });
  }
  const confrontos = [10, 11].map((mes) => ({ mes, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 }));
  const e = { mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas, confrontos };
  const nov = calcular(e), a = nov.pessoas.find((p) => p.id === 'A'), ra = nov.pessoas.find((p) => p.id === 'RA');
  // A: 3 pilares a 110% (Sabores, Retornáveis, Powerade/coringas) etc.; o que importa é o +5: outubro entra, novembro não
  assert.deepEqual(a.porMes.map((m) => [m.mes, m.pontosConfronto, m.bonusPendente]), [[10, 5, 0], [11, 0, 5]]);
  assert.equal(a.pontosAcumulados, a.porMes[0].pontosPilares + 5 + a.porMes[1].pontosPilares);
  assert.deepEqual(nov.confrontos.map((c) => [c.mes, c.mesFechado]), [[10, true], [11, false]]);
  // a rota da mesa não recebe o bônus em nenhum mês, nem pendente (03/11/2026)
  assert.deepEqual(ra.porMes.map((m) => [m.mes, m.pontosConfronto, m.bonusPendente, m.confrontoVencido]), [[10, 0, 0, false], [11, 0, 0, false]]);
  // no período de fechamento de novembro (a API mostra novembro fechado) os dois +5 do SV já valem
  const fech = calcular({ ...e, fechamento: true }), a2 = fech.pessoas.find((p) => p.id === 'A');
  assert.deepEqual(a2.porMes.map((m) => m.pontosConfronto), [5, 5]);
  assert.equal(a2.pontosAcumulados, a.pontosAcumulados + 5);
  assert.deepEqual([fech.pessoas.find((p) => p.id === 'RA').pontosConfronto, fech.pessoas.find((p) => p.id === 'RA').pontosMes], [0, ra.pontosPilares]);
});

test('confronto: empate no pilar desempata pelo maior % de Refrigerantes', () => {
  const res = cenarioConfronto(100, 100, 98, 101, { fechamento: true });
  assert.equal(res.confrontos[0].vencedor, 'B');
  assert.equal(res.pessoas.find((p) => p.id === 'B').pontosConfronto, 5);
  assert.equal(res.pessoas.find((p) => p.id === 'RB').pontosConfronto, 0); // a mesa não recebe (03/11/2026)
});

test('bônus só do SV (03/11/2026): SV perdedor, SV sem confronto e confronto inválido ficam como antes, sem bônus', () => {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('C', 'SV', 'Mista'), pessoa('S', 'SV', 'Segmentada'), pessoa('E', 'SV', 'Mista'),
    pessoa('RA', 'RT', 'Mista', 'A'), pessoa('RB', 'RT', 'Mista', 'B'), pessoa('RC', 'RT', 'Mista', 'C'), pessoa('RE', 'RT', 'Mista', 'E')];
  const medidas = [...med('A', 10, CFG_OUT, 'Mista', 110), ...med('C', 10, CFG_OUT, 'Mista', 120), ...med('S', 10, CFG_OUT, 'Segmentada', 100),
    ...['B', 'E', 'RA', 'RB', 'RC', 'RE'].flatMap((id) => med(id, 10, CFG_OUT, 'Mista', 100))];
  const confrontos = [
    { mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 }, // válido: A vence, B perde
    { mes: 10, id_sv_desafiante: 'C', id_sv_desafiado: 'S', pilar: 'Volume Sabores', ordem_registro: 2 }, // inválido: canais diferentes
  ];
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos, fechamento: true });
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.deepEqual(res.confrontos.map((c) => [c.valido, c.vencedor, c.motivo]), [[true, 'A', null], [false, null, 'CANAIS_DIFERENTES']]);
  assert.deepEqual(res.pessoas.filter((p) => p.pontosConfronto > 0).map((p) => p.id), ['A']);
  for (const id of ['B', 'C', 'S', 'E', 'RA', 'RB', 'RC', 'RE']) {
    const p = g(id);
    assert.deepEqual([p.pontosConfronto, p.bonusPendente, p.porMes[0].confrontoVencido, p.pontosMes], [0, 0, false, p.pontosPilares], id);
  }
  assert.deepEqual(conferir(res), []);
});

test('conferir: rota com bônus de confronto é falha (o bônus é só do SV, 03/11/2026)', () => {
  const res = cenarioConfronto(110, 100, 100, 100, { fechamento: true });
  assert.deepEqual(conferir(res), []);
  const ra = res.pessoas.find((p) => p.id === 'RA');
  ra.porMes[0].confrontoVencido = true; // simula o motor antigo, que passava a vitória do SV para a mesa
  assert.deepEqual(conferir(res), ['RT_COM_BONUS_CONFRONTO:RA']);
});

test('confronto: empate total = sem vencedor, sem +5', () => {
  const res = cenarioConfronto(100, 100, 100, 100);
  assert.equal(res.confrontos[0].vencedor, null);
  assert.equal(res.pessoas.filter((p) => p.pontosConfronto > 0).length, 0);
});

test('confronto inválido: Mista × Segmentada, pilar de Missões, segundo desafio ao mesmo SV, autodesafio', () => {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('C', 'SV', 'Mista'), pessoa('S', 'SV', 'Segmentada')];
  const medidas = ['A', 'B', 'C'].flatMap((id) => med(id, 10, CFG_OUT, 'Mista', 100)).concat(med('S', 10, CFG_OUT, 'Segmentada', 100));
  const confrontos = [
    { mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'S', pilar: 'Volume Sabores', ordem_registro: 1 }, // canais diferentes
    { mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Missões Guiadas', ordem_registro: 2 }, // não é volume
    { mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 3 }, // válido
    { mes: 10, id_sv_desafiante: 'C', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 4 }, // B já recebeu
    { mes: 10, id_sv_desafiante: 'C', id_sv_desafiado: 'C', pilar: 'Volume Sabores', ordem_registro: 5 }, // autodesafio
  ];
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos });
  assert.deepEqual(res.confrontos.map((c) => c.motivo), ['CANAIS_DIFERENTES', 'PILAR_NAO_VOLUME', 'EMPATE_SEM_VENCEDOR', 'DESAFIADO_JA_RECEBEU', 'AUTODESAFIO']);
  assert.deepEqual(res.confrontos.map((c) => c.valido), [false, false, true, false, false]);
});

test('confronto: vale a ordem de registro, não a ordem da lista', () => {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('C', 'SV', 'Mista')];
  const medidas = ['A', 'B', 'C'].flatMap((id) => med(id, 10, CFG_OUT, 'Mista', id === 'A' ? 110 : 100));
  const confrontos = [
    { mes: 10, id_sv_desafiante: 'C', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 2 },
    { mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 },
  ];
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos });
  assert.equal(res.confrontos.find((c) => c.desafiante === 'A').valido, true);
  assert.equal(res.confrontos.find((c) => c.desafiante === 'C').valido, false);
});

// ── 9. ranking e status ──────────────────────────────────
test('ranking Segmentada SV: 2 premiados; 3º "Bateu, mas não está no total"; desempate por Refri', () => {
  // out: SV Segmentada com 100% = 15 (< 60), então simulamos em dezembro com 3 meses de 100%+
  const CFGS = [10, 11, 12].map((mes) => ({ mes, canal: 'Segmentada', pilares: [
    { nome: 'P1', tipo: 'volume' }, { nome: 'P2', tipo: 'volume' }, { nome: 'P3', tipo: 'volume' }, { nome: 'P4', tipo: 'volume' }, { nome: 'P5', tipo: 'volume' }] }));
  const ids = ['X', 'Y', 'Z'];
  const pessoas = ids.map((i) => pessoa(i, 'SV', 'Segmentada'));
  const medidas = [];
  for (const mes of [10, 11, 12]) for (const id of ids) {
    const refri = id === 'X' ? 120 : id === 'Y' ? 110 : 100;
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5']) medidas.push({ id, mes, pilar: p, meta: META, real: vol(110), online: 0 });
    medidas.push({ id, mes, pilar: 'Refrigerantes', meta: META, real: vol(refri), online: 0 });
  }
  // todos empatados em pontos (3 × 25 = 75); desempate por Refri: X > Y > Z
  const res = calcular({ mesRef: 12, pessoas, pilaresConfig: CFGS, medidas, confrontos: [] });
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.deepEqual([g('X').posicao, g('Y').posicao, g('Z').posicao], [1, 2, 3]);
  assert.equal(g('X').status, 'Bateu!');
  assert.equal(g('Y').status, 'Bateu!');
  assert.equal(g('Z').status, 'Bateu, mas não está no total');
  assert.equal(res.ranking['SV|Segmentada'].limite, 2);
});

test('rankings são separados por cargo e canal', () => {
  const res = M.calcular({ mesRef: 10, pessoas: [pessoa('RM', 'RT', 'Mista', 'S1'), pessoa('RS', 'RT', 'Segmentada', 'S2'), pessoa('S1', 'SV', 'Mista'), pessoa('S2', 'SV', 'Segmentada')],
    pilaresConfig: CFG_OUT, confrontos: [],
    medidas: [...med('RM', 10, CFG_OUT, 'Mista', 120), ...med('RS', 10, CFG_OUT, 'Segmentada', 120), ...med('S1', 10, CFG_OUT, 'Mista', 100), ...med('S2', 10, CFG_OUT, 'Segmentada', 100)] });
  assert.equal(res.pessoas.find((p) => p.id === 'RM').posicao, 1);
  assert.equal(res.pessoas.find((p) => p.id === 'RS').posicao, 1);
});

// ── 10. integridade ──────────────────────────────────────
test('cadastro: duplicado, sem canal e mês fora do Q4', () => {
  const res = calcular({ mesRef: 10, pessoas: [pessoa('A', 'SV', 'Mista'), pessoa('A', 'SV', 'Mista'), { id: 'B', nome: 'B', cargo: 'SV', canal: null }], pilaresConfig: CFG_OUT, medidas: [], confrontos: [] });
  assert.deepEqual(res.alertas.map((a) => a.codigo), ['PESSOA_DUPLICADA', 'SEM_CANAL']);
  assert.equal(res.pessoas.length, 1);
  assert.throws(() => calcular({ mesRef: 9, pessoas: [], pilaresConfig: [], medidas: [], confrontos: [] }), /fora do Q4/);
});

test('Consultor sem supervisor no cadastro: alerta, sem +5', () => {
  const res = calcular({ mesRef: 10, pessoas: [pessoa('R', 'RT', 'Mista', 'FANTASMA')], pilaresConfig: CFG_OUT, medidas: med('R', 10, CFG_OUT, 'Mista', 100), confrontos: [] });
  assert.ok(res.pessoas[0].alertas.includes('SUPERVISOR_NAO_ENCONTRADO'));
  assert.equal(res.pessoas[0].pontosConfronto, 0);
});

test('Consultor sem vínculo de supervisor (id_supervisor vazio): sem alerta individual, contado à parte', () => {
  const res = calcular({ mesRef: 10, pessoas: [pessoa('R', 'RT', 'Mista', null)], pilaresConfig: CFG_OUT, medidas: med('R', 10, CFG_OUT, 'Mista', 100), confrontos: [] });
  assert.ok(!res.pessoas[0].alertas.includes('SUPERVISOR_NAO_ENCONTRADO'));
  assert.equal(res.semVinculoSupervisor, 1);
  assert.equal(res.pessoas[0].pontosConfronto, 0);
});

test('Consultor não tem pontos acumulados (coluna não se aplica)', () => {
  const res = calcular({ mesRef: 10, pessoas: [pessoa('S', 'SV', 'Mista'), pessoa('R', 'RT', 'Mista', 'S')], pilaresConfig: CFG_OUT, confrontos: [], medidas: [...med('S', 10, CFG_OUT, 'Mista', 100), ...med('R', 10, CFG_OUT, 'Mista', 100)] });
  const rt = res.pessoas.find((p) => p.id === 'R');
  assert.equal(rt.pontosAcumulados, undefined);
  assert.equal('pontosAcumuladosExibidos' in rt, false);
});

test('conferir(): recálculo independente não encontra divergência', () => {
  const e = base10([pessoa('SV1', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1'), pessoa('RT2', 'RT', 'Mista', 'SV1')], [
    ...med('SV1', 10, CFG_OUT, 'Mista', 103.5), ...med('RT1', 10, CFG_OUT, 'Mista', 91, 96), ...med('RT2', 10, CFG_OUT, 'Mista', 88, 99)]);
  const res = calcular(e);
  assert.deepEqual(conferir(res, e), []);
});

test('formatação: % truncado com vírgula; volume com milhar e 1 casa decimal', () => {
  assert.equal(fmtPct(94.96), '94,9%');
  assert.equal(M.fmtVolume(1234567), '1.234.567,0');
  assert.equal(M.fmtVolume(395090.24), '395.090,2');
  assert.equal(M.fmtVolume(-1234.56), '-1.234,6');
  assert.equal(M.fmtVolume(0), '0,0');
  assert.equal(M.fmtVolume(null), '-');
});

// ── 11. status: "No total" virou "Bateu!" (31/10/2026) ───
// Cenário sintético em dezembro (o SV soma out a dez), com 5 pilares de volume fictícios nos três meses e nos dois canais.
// Por cargo e canal: (limite + 1) elegíveis a 110% (25 pts/mês), com Refri decrescente para fixar a ordem; um sem o
// gatilho de volume (Refri 94,99999%) e um com volume e pontos abaixo do mínimo (100% = 15 pts/mês).
// O mesmo cenário gerou fixtures/regressao-status-bateu.json com o motor de antes da troca.
const PREMIADAS = { SV: { Mista: 12, Segmentada: 2 }, RT: { Mista: 40, Segmentada: 10 } };
const CFG_TRI = [10, 11, 12].flatMap((mes) => ['Mista', 'Segmentada'].map((canal) => ({ mes, canal,
  pilares: ['P1', 'P2', 'P3', 'P4', 'P5'].map((nome) => ({ nome, tipo: 'volume' })) })));
function cenarioStatus() {
  const pessoas = [], medidas = [];
  const add = (id, cargo, canal, sup, pct, refri) => {
    pessoas.push(pessoa(id, cargo, canal, sup));
    for (const mes of [10, 11, 12]) medidas.push(...med(id, mes, CFG_TRI, canal, pct, refri));
  };
  for (const cargo of ['SV', 'RT']) for (const canal of ['Mista', 'Segmentada']) {
    const pre = cargo + canal[0], sup = cargo === 'RT' ? 'SV' + canal[0] + '01' : null;
    for (let i = 1; i <= PREMIADAS[cargo][canal] + 1; i++) add(pre + String(i).padStart(2, '0'), cargo, canal, sup, 110, 120 - i / 4);
    add(pre + 'V', cargo, canal, sup, 110, 94.99999);
    add(pre + 'P', cargo, canal, sup, 100, 100);
  }
  return { mesRef: 12, pessoas, pilaresConfig: CFG_TRI, medidas, confrontos: [] };
}
const resumoStatus = (res) => ({
  pessoas: res.pessoas.map((p) => [p.id, p.cargo, p.canal, p.pontosMes, p.pontosAcumulados ?? null, p.volume.pctTexto,
    p.volume.atingido, p.gatilhoPontos.atingido, p.elegivel, p.posicao, p.premiada, p.status]),
  ranking: res.ranking,
});

test('status: "-" sem volume, "-" sem pontos, "Bateu, mas não está no total" fora e "Bateu!" dentro das premiadas (SV e Consultor, Mista e Segmentada)', () => {
  assert.deepEqual(M.REGRAS.status, { nenhum: '-', fora: 'Bateu, mas não está no total', dentro: 'Bateu!' });
  assert.deepEqual(M.REGRAS.premiadas, PREMIADAS);
  const e = cenarioStatus(), res = calcular(e);
  const g = (id) => res.pessoas.find((p) => p.id === id);
  const ver = (id) => [id, g(id).volume.atingido, g(id).gatilhoPontos.atingido, g(id).posicao, g(id).premiada, g(id).status];
  for (const cargo of ['SV', 'RT']) for (const canal of ['Mista', 'Segmentada']) {
    const lim = PREMIADAS[cargo][canal], pre = cargo + canal[0], n = (i) => pre + String(i).padStart(2, '0');
    assert.deepEqual([pre + 'V', pre + 'P', n(1), n(lim), n(lim + 1)].map(ver), [
      [pre + 'V', false, true, null, false, '-'],                                  // pontos ok, sem o gatilho de volume
      [pre + 'P', true, false, null, false, '-'],                                  // volume ok, pontos abaixo do mínimo
      [n(1), true, true, 1, true, 'Bateu!'],
      [n(lim), true, true, lim, true, 'Bateu!'],                                   // última posição premiada
      [n(lim + 1), true, true, lim + 1, false, 'Bateu, mas não está no total'],    // primeira fora
    ], `${cargo} ${canal}`);
    const grupo = res.pessoas.filter((p) => p.cargo === cargo && p.canal === canal);
    assert.deepEqual(['-', 'Bateu, mas não está no total', 'Bateu!'].map((s) => grupo.filter((p) => p.status === s).length), [2, 1, lim]);
  }
  assert.ok(!res.pessoas.some((p) => p.status === 'No total'));
  assert.deepEqual(conferir(res, e), []);
});

test('regressão (31/10/2026): pontos, posições e quem está em cada status iguais aos de antes da troca; só o texto mudou', () => {
  const antes = require('./fixtures/regressao-status-bateu.json').resultado; // motor v3.2, antes da troca
  const troca = (s) => (s === 'No total' ? 'Bateu!' : s);                   // o único texto que mudou
  assert.deepEqual(resumoStatus(calcular(cenarioStatus())), {
    pessoas: antes.pessoas.map((l) => l.slice(0, -1).concat(troca(l[l.length - 1]))),
    ranking: antes.ranking,
  });
});

// ── helpers de cenário ───────────────────────────────────
function base10(pessoas, medidas) { return { mesRef: 10, dataCorte: '25/10/2026 14:00', pessoas, pilaresConfig: CFG_OUT, medidas, confrontos: [] }; }
function base11(pessoas, medidas) { return { mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas: medidas.concat([]), confrontos: [] }; }

// ── 12. troca de apuração entre duas supervisões (17/11/2026) ──────────────
/*
 * Cenário sintético que repete a forma do caso real: duas SVs trocam a apuração de outubro e cada uma delas tem um
 * confronto com uma TERCEIRA SV, de fora da troca. A ordem (confrontos primeiro, troca depois) é o que mantém os
 * adversários intactos. Códigos e nomes fictícios.
 */
const TR_PESSOAS = [
  pessoa('SV.AA#Mista', 'SV', 'Mista'), pessoa('SV.BB#Mista', 'SV', 'Mista'),
  pessoa('SV.CC#Mista', 'SV', 'Mista'), pessoa('SV.DD#Mista', 'SV', 'Mista'),
  pessoa('SV.EE#Segmentada', 'SV', 'Segmentada'),
  pessoa('RT.1', 'RT', 'Mista', 'SV.AA#Mista'), pessoa('RT.2', 'RT', 'Mista', 'SV.BB#Mista'),
];
// AA: Sabores 150% (vence a CC, de 95%). BB: Sabores 92% (perde para a DD, de 101%).
const TR_MED = [].concat(
  med('SV.AA#Mista', 10, CFG_OUT, 'Mista', 150, 88), med('SV.AA#Mista', 11, CFG_NOV, 'Mista', 80, 80),
  med('SV.BB#Mista', 10, CFG_OUT, 'Mista', 92, 97), med('SV.BB#Mista', 11, CFG_NOV, 'Mista', 80, 80),
  med('SV.CC#Mista', 10, CFG_OUT, 'Mista', 95, 93), med('SV.CC#Mista', 11, CFG_NOV, 'Mista', 80, 80),
  med('SV.DD#Mista', 10, CFG_OUT, 'Mista', 101, 99), med('SV.DD#Mista', 11, CFG_NOV, 'Mista', 80, 80),
  med('SV.EE#Segmentada', 10, CFG_OUT, 'Segmentada', 100), med('SV.EE#Segmentada', 11, CFG_NOV, 'Segmentada', 100),
  med('RT.1', 10, CFG_OUT, 'Mista', 110), med('RT.1', 11, CFG_NOV, 'Mista', 110),
  med('RT.2', 10, CFG_OUT, 'Mista', 70), med('RT.2', 11, CFG_NOV, 'Mista', 70),
);
const TR_CONFRONTOS = [
  { mes: 10, id_sv_desafiante: 'SV.AA#Mista', id_sv_desafiado: 'SV.CC#Mista', pilar: 'Volume Sabores', ordem_registro: 1 },
  { mes: 10, id_sv_desafiante: 'SV.BB#Mista', id_sv_desafiado: 'SV.DD#Mista', pilar: 'Volume Sabores', ordem_registro: 2 },
];
const TROCA_OUT = { mes: 10, a: 'SV.AA#Mista', b: 'SV.BB#Mista', motivo: 'troca de mesa fictícia',
                    solicitado_por: 'GC fictício', autorizado_por: 'Diretoria fictícia', em: '2026-11-16' };
const trRodar = (trocasSV, mesRef = 11) => calcular({ mesRef, pessoas: TR_PESSOAS,
  pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas: TR_MED, confrontos: TR_CONFRONTOS, trocasSV, fechamento: mesRef === 10 });
const trMes = (res, id, mes) => res.pessoas.find((p) => p.id === id).porMes.find((m) => m.mes === mes);
const trPessoa = (res, id) => res.pessoas.find((p) => p.id === id);

test('troca: no mês declarado, pilares, bônus, pontos do mês e as medidas de volume passam de uma SV para a outra', () => {
  const sem = trRodar([]), com = trRodar([TROCA_OUT]);
  const a0 = trMes(sem, 'SV.AA#Mista', 10), b0 = trMes(sem, 'SV.BB#Mista', 10);
  const a1 = trMes(com, 'SV.AA#Mista', 10), b1 = trMes(com, 'SV.BB#Mista', 10);
  assert.deepEqual(a1, b0, 'a AA passa a ter o mês da BB, inteiro');
  assert.deepEqual(b1, a0, 'a BB passa a ter o mês da AA, inteiro');
  assert.equal(a0.pontosConfronto, 5); assert.equal(a1.pontosConfronto, 0); // o +5 foi junto
  assert.equal(b1.pontosConfronto, 5);
  // medidas e pontos de cada pilar: aparecem quando o mês trocado é o de referência (consulta do fechamento)
  const semOut = trRodar([], 10), comOut = trRodar([TROCA_OUT], 10);
  const pil = (res, id) => trPessoa(res, id).pilares.map((p) => [p.nome, p.meta, p.real, p.pct, p.pontos]);
  assert.deepEqual(pil(comOut, 'SV.AA#Mista'), pil(semOut, 'SV.BB#Mista'));
  assert.deepEqual(pil(comOut, 'SV.BB#Mista'), pil(semOut, 'SV.AA#Mista'));
  const refri = (res, id) => { const r = trPessoa(res, id).refri; return [r.meta, r.real, r.pct]; };
  assert.deepEqual(refri(comOut, 'SV.AA#Mista'), refri(semOut, 'SV.BB#Mista'));
  assert.deepEqual(refri(comOut, 'SV.BB#Mista'), refri(semOut, 'SV.AA#Mista'));
});

test('troca: o confronto é resolvido com os dados VERDADEIROS — os adversários de fora não mudam em nada', () => {
  const sem = trRodar([]), com = trRodar([TROCA_OUT]);
  // o vencedor registrado continua o verdadeiro: a AA venceu a CC, a BB perdeu para a DD
  assert.deepEqual(sem.confrontos, com.confrontos);
  assert.equal(com.confrontos.find((c) => c.desafiado === 'SV.CC#Mista').vencedor, 'SV.AA#Mista');
  assert.equal(com.confrontos.find((c) => c.desafiado === 'SV.DD#Mista').vencedor, 'SV.DD#Mista');
  // e as SVs de fora saem idênticas, bit a bit, com e sem troca
  for (const id of ['SV.CC#Mista', 'SV.DD#Mista', 'SV.EE#Segmentada']) {
    assert.deepEqual(trPessoa(com, id), trPessoa(sem, id), id + ' não pode mudar');
  }
  assert.equal(trMes(com, 'SV.DD#Mista', 10).pontosConfronto, 5, 'a DD mantém o +5 que ganhou de verdade');
});

test('troca: rotas e consultores ficam idênticos (a troca é só do resultado das duas supervisões)', () => {
  const sem = trRodar([]), com = trRodar([TROCA_OUT]);
  for (const id of ['RT.1', 'RT.2']) assert.deepEqual(trPessoa(com, id), trPessoa(sem, id), id + ' não pode mudar');
  assert.equal(com.pessoas.length, sem.pessoas.length);
  // cadastro das duas trocadas: código, nome, canal e unidade continuam os delas
  for (const id of ['SV.AA#Mista', 'SV.BB#Mista']) {
    const a = trPessoa(sem, id), b = trPessoa(com, id);
    assert.deepEqual([b.id, b.nome, b.cargo, b.canal, b.unidade], [a.id, a.nome, a.cargo, a.canal, a.unidade]);
  }
});

test('troca: o acumulado do trimestre usa o valor trocado; o mês não declarado não muda', () => {
  const sem = trRodar([]), com = trRodar([TROCA_OUT]);
  const a0 = trPessoa(sem, 'SV.AA#Mista'), b0 = trPessoa(sem, 'SV.BB#Mista');
  const a1 = trPessoa(com, 'SV.AA#Mista'), b1 = trPessoa(com, 'SV.BB#Mista');
  const outA = trMes(sem, 'SV.AA#Mista', 10).pontosMes, outB = trMes(sem, 'SV.BB#Mista', 10).pontosMes;
  assert.equal(a1.pontosAcumulados, a0.pontosAcumulados - outA + outB);
  assert.equal(b1.pontosAcumulados, b0.pontosAcumulados - outB + outA);
  // novembro (não declarado) continua igual nas duas
  assert.deepEqual(trMes(com, 'SV.AA#Mista', 11), trMes(sem, 'SV.AA#Mista', 11));
  assert.deepEqual(trMes(com, 'SV.BB#Mista', 11), trMes(sem, 'SV.BB#Mista', 11));
  // o % acumulado de Refrigerantes do trimestre também anda com a troca
  assert.notEqual(a1.volume.pct, a0.volume.pct);
  assert.equal(a1.volume.pct, ((vol(97) + vol(80)) / (2 * META)) * 100, 'a AA passa a acumular o Refri de outubro da BB');
  assert.equal(b1.volume.pct, ((vol(88) + vol(80)) / (2 * META)) * 100, 'a BB passa a acumular o Refri de outubro da AA');
});

test('troca: no ranking do mês trocado só as duas mudam de lugar', () => {
  const ordem = (res) => res.pessoas.filter((p) => p.cargo === 'SV' && p.canal === 'Mista')
    .slice().sort((x, y) => y.pontosMes - x.pontosMes || y.refri.pct - x.refri.pct || (x.id < y.id ? -1 : 1)).map((p) => p.id);
  const sem = ordem(trRodar([], 10)), com = ordem(trRodar([TROCA_OUT], 10));
  const trocadas = new Set(['SV.AA#Mista', 'SV.BB#Mista']);
  // quem está fora da troca fica exatamente na mesma posição
  sem.forEach((id, i) => { if (!trocadas.has(id)) assert.equal(com[i], id, id + ' não pode mudar de lugar'); });
  // e as duas trocaram de posição entre si
  assert.equal(com[sem.indexOf('SV.AA#Mista')], 'SV.BB#Mista');
  assert.equal(com[sem.indexOf('SV.BB#Mista')], 'SV.AA#Mista');
});

test('troca: sem trocasSV (ausente ou vazio) o resultado é idêntico ao de antes da etapa', () => {
  const nada = trRodar(undefined), vazio = trRodar([]);
  assert.deepEqual(nada.pessoas, vazio.pessoas);
  assert.deepEqual(nada.trocas, []);
  assert.deepEqual(vazio.trocas, []);
  assert.deepEqual(nada.alertas.filter((a) => String(a.codigo).startsWith('TROCA_')), []);
});

test('troca recusada: canais diferentes, SV inexistente, o mesmo SV nos dois lados e mês ainda não apurado', () => {
  const casos = [
    [{ mes: 10, a: 'SV.AA#Mista', b: 'SV.EE#Segmentada' }, 'CANAIS_DIFERENTES'],
    [{ mes: 10, a: 'SV.AA#Mista', b: 'SV.ZZ#Mista' }, 'SV_NAO_ENCONTRADO'],
    [{ mes: 10, a: 'SV.AA#Mista', b: 'SV.AA#Mista' }, 'MESMO_SV'],
    [{ mes: 12, a: 'SV.AA#Mista', b: 'SV.BB#Mista' }, 'MES_AINDA_NAO_APURADO'],
  ];
  const sem = trRodar([]);
  for (const [troca, recusa] of casos) {
    const res = trRodar([troca]);
    assert.equal(res.trocas.length, 1);
    assert.equal(res.trocas[0].aplicada, false, recusa);
    assert.equal(res.trocas[0].recusa, recusa);
    assert.deepEqual(res.pessoas, sem.pessoas, 'troca recusada não muda nenhum número: ' + recusa);
    const avisada = res.alertas.some((x) => x.codigo === 'TROCA_' + recusa);
    assert.equal(avisada, recusa !== 'MES_AINDA_NAO_APURADO', 'aviso de ' + recusa);
    assert.ok(M.RECUSA_TROCA[recusa], 'o motivo tem texto no motor: ' + recusa);
  }
  // a mesma SV em duas trocas do mesmo mês: vale a primeira, a segunda é recusada com aviso
  const duas = trRodar([TROCA_OUT, { mes: 10, a: 'SV.AA#Mista', b: 'SV.CC#Mista' }]);
  assert.deepEqual(duas.trocas.map((t) => [t.aplicada, t.recusa]), [[true, null], [false, 'SV_JA_TROCADO']]);
  assert.ok(duas.alertas.some((x) => x.codigo === 'TROCA_SV_JA_TROCADO'));
  assert.deepEqual(trPessoa(duas, 'SV.CC#Mista'), trPessoa(sem, 'SV.CC#Mista'));
  assert.deepEqual(conferir(duas), []);
});

test('troca: mês do trimestre sem dado não é trocado (nunca se troca o que não foi apurado)', () => {
  const res = calcular({ mesRef: 11, pessoas: TR_PESSOAS, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas: TR_MED,
    confrontos: TR_CONFRONTOS, trocasSV: [TROCA_OUT], mesesIncompletos: [{ mes: 10, motivo: 'outubro não carregou' }] });
  assert.equal(res.trocas[0].aplicada, false);
  assert.equal(res.trocas[0].recusa, 'MES_SEM_DADO');
  assert.ok(res.alertas.some((x) => x.codigo === 'TROCA_MES_SEM_DADO'));
});

test('troca: a declaração (motivo, quem pediu, quem autorizou e quando) chega inteira no resultado', () => {
  const t = trRodar([TROCA_OUT]).trocas[0];
  assert.deepEqual([t.mes, t.a, t.b, t.aplicada, t.recusa], [10, 'SV.AA#Mista', 'SV.BB#Mista', true, null]);
  for (const campo of ['motivo', 'solicitado_por', 'autorizado_por', 'em']) assert.equal(t[campo], TROCA_OUT[campo]);
  // trocasDoSV: o outro lado de cada troca aplicada
  assert.deepEqual(M.trocasDoSV([t], 'SV.AA#Mista').map((x) => x.com), ['SV.BB#Mista']);
  assert.deepEqual(M.trocasDoSV([t], 'SV.BB#Mista').map((x) => x.com), ['SV.AA#Mista']);
  assert.deepEqual(M.trocasDoSV([t], 'SV.CC#Mista'), []);
  assert.deepEqual(M.trocasDoSV([Object.assign({}, t, { aplicada: false })], 'SV.AA#Mista'), []);
});

test('troca: conferir() não acusa nada e os pontos do mês continuam fechando com os pilares + bônus', () => {
  const res = trRodar([TROCA_OUT]);
  assert.deepEqual(conferir(res, { pessoas: TR_PESSOAS }), []);
  for (const p of res.pessoas) {
    for (const m of p.porMes) assert.equal(m.pontosMes, m.pontosPilares + m.pontosConfronto, p.id + ' mês ' + m.mes);
  }
});
