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
test('Consultor: 20 pontos no mês é o mínimo (19 = "-", 20 = ranqueado)', () => {
  // out: 5 pilares a 100% = 15; +5 se SV vence confronto => 20
  const pessoas = [pessoa('SV1', 'SV', 'Mista'), pessoa('SV2', 'SV', 'Mista'), pessoa('RT1', 'RT', 'Mista', 'SV1'), pessoa('RT2', 'RT', 'Mista', 'SV2')];
  const medidas = ['SV1', 'SV2', 'RT1', 'RT2'].flatMap((id) => med(id, 10, CFG_OUT, 'Mista', 100));
  // SV1 vence SV2 em Sabores (precisa ter pct maior): ajustar SV1 a 101%
  medidas.find((m) => m.id === 'SV1' && m.pilar === 'Volume Sabores').real = vol(101);
  const confrontos = [{ mes: 10, id_sv_desafiante: 'SV1', id_sv_desafiado: 'SV2', pilar: 'Volume Sabores', ordem_registro: 1 }];
  const res = calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos });
  const rt1 = res.pessoas.find((p) => p.id === 'RT1'), rt2 = res.pessoas.find((p) => p.id === 'RT2');
  assert.equal(rt1.pontosMes, 20);
  assert.equal(rt1.gatilhoPontos.atingido, true);
  assert.equal(rt1.status, 'No total');
  assert.equal(rt2.pontosMes, 15);
  assert.equal(rt2.gatilhoPontos.atingido, false);
  assert.equal(rt2.status, '-');
  assert.equal(rt2.pontosAtuaisExibidos, 15, 'volume ok: pontos aparecem, só o status fica "-"');
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

// ── 8. confrontos ────────────────────────────────────────
function cenarioConfronto(pctA, pctB, refriA = 100, refriB = 100, extra = {}) {
  const pessoas = [pessoa('A', 'SV', 'Mista'), pessoa('B', 'SV', 'Mista'), pessoa('RA', 'RT', 'Mista', 'A'), pessoa('RB', 'RT', 'Mista', 'B')];
  const medidas = [];
  for (const [id, pct, refri] of [['A', pctA, refriA], ['B', pctB, refriB], ['RA', 100, 100], ['RB', 100, 100]]) medidas.push(...med(id, 10, CFG_OUT, 'Mista', pct, refri));
  const confrontos = [{ mes: 10, id_sv_desafiante: 'A', id_sv_desafiado: 'B', pilar: 'Volume Sabores', ordem_registro: 1 }];
  return calcular({ mesRef: 10, pessoas, pilaresConfig: CFG_OUT, medidas, confrontos: extra.confrontos || confrontos });
}

test('confronto: vencedor ganha +5 e a mesa dele também; quem perde não perde pontos', () => {
  const res = cenarioConfronto(110, 100);
  const g = (id) => res.pessoas.find((p) => p.id === id);
  assert.equal(g('A').pontosConfronto, 5);
  assert.equal(g('RA').pontosConfronto, 5);
  assert.equal(g('B').pontosConfronto, 0);
  assert.equal(g('RB').pontosConfronto, 0);
  assert.equal(g('RB').pontosMes, 15, 'mesa do perdedor mantém os 15 de pilares');
});

test('confronto: empate no pilar desempata pelo maior % de Refrigerantes', () => {
  const res = cenarioConfronto(100, 100, 98, 101);
  assert.equal(res.confrontos[0].vencedor, 'B');
  assert.equal(res.pessoas.find((p) => p.id === 'RB').pontosConfronto, 5);
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
  assert.equal(g('X').status, 'No total');
  assert.equal(g('Y').status, 'No total');
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

// ── helpers de cenário ───────────────────────────────────
function base10(pessoas, medidas) { return { mesRef: 10, dataCorte: '25/10/2026 14:00', pessoas, pilaresConfig: CFG_OUT, medidas, confrontos: [] }; }
function base11(pessoas, medidas) { return { mesRef: 11, pessoas, pilaresConfig: [...CFG_OUT, ...CFG_NOV], medidas: medidas.concat([]), confrontos: [] }; }
