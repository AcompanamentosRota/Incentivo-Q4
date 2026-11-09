const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG, localizarProdutos, carregarDados } = require('../src/adapter.js');

// ── fixtures sintéticas (ids e nomes fictícios) ──
const FIXOS = ['sucos', 'powerade', 'refrigerantes'].map((id) => ({ id, nome: 'Vol. ' + id }));
const extra = (id, agrupadores, maisCampos) => Object.assign({ id, nome: 'Vol. ' + id, agrupadores, extra: true }, maisCampos);
const idx = (produtos, mais) => Object.assign({
  atualizado_em: '2026-11-10T09:15:00', simulado: false,
  mes_referencia: { anomes: '202611', rotulo: 'Novembro/26', fechamento: false },
  fechados: [{ anomes: '202610', arquivo: 'fechado/202610.json', fechamento_final: false }],
  produtos,
}, mais);

test('CONFIG: ano 2026, meses 10 a 12 e nomes exatos dos agrupadores', () => {
  assert.equal(CONFIG.ano, 2026);
  assert.deepEqual(CONFIG.meses, [10, 11, 12]);
  assert.deepEqual(CONFIG.agrupadores, { aperitivo: 'Aperitivo', skyy: 'Skyy' });
  assert.equal(CONFIG.api, './api/v1/');
});

test('localizarProdutos (a): index com os dois extras', () => {
  const r = localizarProdutos(idx([...FIXOS, extra('aperitivos', ['Aperitivo']), extra('skyy', ['Skyy'])]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, { aperitivo: 'aperitivos', skyy: 'skyy' });
  assert.deepEqual(r.motivos, []);
});

test('localizarProdutos (b): index sem extras', () => {
  const r = localizarProdutos(idx(FIXOS));
  assert.equal(r.ok, false);
  assert.deepEqual(r.ids, { aperitivo: null, skyy: null });
  assert.equal(r.motivos.length, 2);
  assert.match(r.motivos[0], /"Aperitivo" não publicado/);
  assert.match(r.motivos[1], /"Skyy" não publicado/);
});

test('localizarProdutos (c): só um dos dois', () => {
  const r = localizarProdutos(idx([...FIXOS, extra('skyy', ['Skyy'])]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.ids, { aperitivo: null, skyy: 'skyy' });
  assert.equal(r.motivos.length, 1);
  assert.match(r.motivos[0], /"Aperitivo"/);
});

test('localizarProdutos (d): ids diferentes dos atuais, achados pelo campo agrupadores', () => {
  const r = localizarProdutos(idx([extra('xpto_b', ['Skyy']), ...FIXOS, extra('xpto_a', ['Aperitivo'])]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, { aperitivo: 'xpto_a', skyy: 'xpto_b' });
});

test('localizarProdutos (d2): um id "aperitivos" com outro agrupador não casa', () => {
  const r = localizarProdutos(idx([extra('aperitivos', ['Outro Agrupador']), extra('skyy', ['Skyy'])]));
  assert.equal(r.ok, false);
  assert.equal(r.ids.aperitivo, null);
});

test('localizarProdutos (e): grafia diferente não casa ("aperitivo", "SKYY")', () => {
  const r = localizarProdutos(idx([extra('aperitivos', ['aperitivo']), extra('skyy', ['SKYY'])]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.ids, { aperitivo: null, skyy: null });
});

test('localizarProdutos (f): extra ausente (ou diferente de true) não casa, com motivo próprio', () => {
  const semExtra = { id: 'aperitivos', nome: 'Vol. aperitivos', agrupadores: ['Aperitivo'] };
  const extraTexto = { id: 'skyy', nome: 'Vol. skyy', agrupadores: ['Skyy'], extra: 'true' };
  const r = localizarProdutos(idx([semExtra, extraTexto]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.ids, { aperitivo: null, skyy: null });
  assert.match(r.motivos[0], /sem "extra": true/);
  assert.match(r.motivos[1], /sem "extra": true/);
});

test('localizarProdutos: agrupador em dois produtos é ambíguo (não escolhe)', () => {
  const r = localizarProdutos(idx([extra('ap1', ['Aperitivo']), extra('ap2', ['Aperitivo']), extra('skyy', ['Skyy'])]));
  assert.equal(r.ok, false);
  assert.equal(r.ids.aperitivo, null);
  assert.match(r.motivos[0], /mais de um produto \(ap1, ap2\)/);
});

test('localizarProdutos: produto que soma outros agrupadores não casa', () => {
  const r = localizarProdutos(idx([extra('mix', ['Aperitivo', 'Outro']), extra('skyy', ['Skyy'])]));
  assert.equal(r.ok, false);
  assert.match(r.motivos[0], /somado a outros agrupadores/);
});

test('localizarProdutos: index sem lista de produtos ou nulo', () => {
  for (const i of [null, {}, { produtos: 'x' }]) {
    const r = localizarProdutos(i);
    assert.equal(r.ok, false);
    assert.deepEqual(r.ids, { aperitivo: null, skyy: null });
    assert.match(r.motivos[0], /sem a lista de produtos/);
  }
});

// ── carregarDados com fetch falso ──
const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => {
  if (corpo instanceof Error) throw corpo;
  return corpo;
} });

test('carregarDados: sucesso lê ./api/v1/index.json com cache no-cache e devolve os campos', async () => {
  const chamadas = [];
  const index = idx([...FIXOS, extra('aperitivos', ['Aperitivo']), extra('skyy', ['Skyy'])]);
  const d = await carregarDados(undefined, async (url, opcoes) => { chamadas.push([url, opcoes]); return resposta(200, index); });
  assert.deepEqual(chamadas, [['./api/v1/index.json', { cache: 'no-cache' }]]);
  assert.equal(d.ok, true);
  assert.equal(d.erro, null);
  assert.deepEqual(d.mesReferencia, { anomes: '202611', rotulo: 'Novembro/26', fechamento: false });
  assert.equal(d.fechados.length, 1);
  assert.equal(d.fechados[0].anomes, '202610');
  assert.equal(d.atualizadoEm, '2026-11-10T09:15:00');
  assert.equal(d.simulado, false);
  assert.deepEqual(d.produtos.ids, { aperitivo: 'aperitivos', skyy: 'skyy' });
});

test('carregarDados: base própria e simulado true', async () => {
  let pedido = null;
  const d = await carregarDados('http://exemplo.test/api/v1/', async (url) => { pedido = url; return resposta(200, idx(FIXOS, { simulado: true })); });
  assert.equal(pedido, 'http://exemplo.test/api/v1/index.json');
  assert.equal(d.ok, true);
  assert.equal(d.simulado, true);
  assert.equal(d.produtos.ok, false); // sucesso na leitura, mas produtos ausentes: a tela avisa e não calcula
});

test('carregarDados: HTTP diferente de 200 vira erro, sem valores', async () => {
  for (const status of [404, 500, 204]) {
    const d = await carregarDados(undefined, async () => resposta(status, idx(FIXOS)));
    assert.equal(d.ok, false);
    assert.equal(d.erro, `index.json: HTTP ${status}`);
    assert.equal(d.mesReferencia, null);
    assert.equal(d.atualizadoEm, null);
    assert.deepEqual(d.fechados, []);
    assert.equal(d.produtos, null);
  }
});

test('carregarDados: JSON inválido vira erro', async () => {
  const d = await carregarDados(undefined, async () => resposta(200, new SyntaxError('Unexpected token')));
  assert.equal(d.ok, false);
  assert.match(d.erro, /^index\.json: Unexpected token/);
  assert.equal(d.produtos, null);
  const lista = await carregarDados(undefined, async () => resposta(200, [1, 2]));
  assert.equal(lista.ok, false);
  assert.match(lista.erro, /não é um objeto JSON/);
});

test('carregarDados: falha de rede vira erro', async () => {
  const d = await carregarDados(undefined, async () => { throw new Error('Failed to fetch'); });
  assert.equal(d.ok, false);
  assert.equal(d.erro, 'index.json: Failed to fetch');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Etapa 2 — dados do ranking de volume de Aperitivo (fixtures sintéticas: gerências XA/XB, SVs e rotas fictícias)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const A = require('../src/adapter.js');
const PRODS = [...FIXOS, extra('aperitivos', ['Aperitivo']), extra('skyy', ['Skyy'])];
const indexDe = (anomes, fechamento, fechados) => ({
  atualizado_em: '2026-11-10T09:15:00', simulado: false,
  mes_referencia: { anomes, rotulo: 'x', fechamento },
  calendario: { hoje: '2026-11-10', dias_uteis_restantes: 14 },
  fechados: fechados.map((m) => ({ anomes: m, arquivo: `fechado/${m}.json`, fechamento_final: false })),
  produtos: PRODS,
  gerencias: [{ id: 'XA', arquivo: 'gerencias/XA.json' }, { id: 'XB', arquivo: 'gerencias/XB.json' }],
});
// bloco de produto da API; o SV e a GC trazem números próprios (o adaptador nunca soma rotas no mês aberto)
const bl = (meta, realizado, online_hoje, meta_dia) => ({ meta, realizado, online_hoje, meta_dia, atingimento_pct: 999 });
const rota = (id, gerencia, supervisao, b, tipo) => ({ id, tipo: tipo || 'normal', gerencia, supervisao, produtos: b ? { aperitivos: b } : {} });
const GER_XA = {
  gerencia: { id: 'XA', nome: 'Fictícia A' },
  produtos: { aperitivos: bl(1000, 500, 20, 7.5) },
  supervisoes: [
    { id: 'SV.XA.1', rotas: ['X11', 'X12', 'X13'], produtos: { aperitivos: bl(400, 300, 10, 3.2) } },
    { id: 'SV.XA.2', rotas: ['X21', 'X22'], produtos: { aperitivos: bl(200, 100, 0, 1.1) } },
  ],
  rotas: [rota('X11', 'XA', 'SV.XA.1', bl(100, 90, 5, 1)), rota('X12', 'XA', 'SV.XA.1', bl(100, 60, 0, 1)),
          rota('X13', 'XA', 'SV.XA.1', bl(200, 150, 5, 1.2)), rota('X21', 'XA', 'SV.XA.2', bl(100, 50, 0, 0.5)),
          rota('X22', 'XA', 'SV.XA.2', bl(100, 50, 0, 0.6)), rota('XA-EV', 'XA', 'SV.XA.EV', bl(0, 3, 0, 0), 'eventual')],
};
const GER_XB = {
  gerencia: { id: 'XB', nome: 'Fictícia B' },
  produtos: { aperitivos: bl(800, 400, 0, 5) },
  supervisoes: [
    { id: 'SV.XB.1', rotas: ['X31', 'X32', 'X33'], produtos: { aperitivos: bl(300, 270, 0, 2) } },
    { id: 'SV.XB.2', rotas: ['X41'], produtos: { aperitivos: bl(0, 10, 0, 0) } }, // meta 0: % null, incompleta
  ],
  rotas: [rota('X31', 'XB', 'SV.XB.1', bl(100, 90, 0, 1)), rota('X32', 'XB', 'SV.XB.1', bl(100, 90, 0, 1)),
          rota('X33', 'XB', 'SV.XB.1', bl(100, 90, 0, 1)), rota('X41', 'XB', 'SV.XB.2', bl(0, 10, 0, 0))],
};
// base de canais: X13 e X33 sem canal (fora da base); SV.XA.2 empata 1 x 1; SV.XB.1 = 2 Segmentada + 1 sem canal
const BASE = { meta: { foto: '2026-11-09', corteSeg: '25/10/2026 13:11' }, rotas: [
  { gc: 'Xa', sv: 'Sv. Xa.1', rota: 'X11', canal: 'Mista', sub: null },
  { gc: 'Xa', sv: 'Sv. Xa.1', rota: 'X12', canal: 'Mista', sub: null },
  { gc: 'Xa', sv: 'Sv. Xa.2', rota: 'X21', canal: 'Segmentada', sub: 'Mini' },
  { gc: 'Xa', sv: 'Sv. Xa.2', rota: 'X22', canal: 'Mista', sub: null },
  { gc: 'Xb', sv: 'Sv. Xb.1', rota: 'X31', canal: 'Segmentada', sub: 'Mod' },
  { gc: 'Xb', sv: 'Sv. Xb.1', rota: 'X32', canal: 'Segmentada', sub: 'Mod' },
  { gc: 'Xb', sv: 'Sv. Xb.2', rota: 'X41', canal: 'Mista', sub: null },
] };
const fechadoDe = (anomes, linhas, totais, mais) => Object.assign({
  anomes, rotulo: 'x', simulado: false, fechamento_final: false, oficial_em: null, fonte_selo: null,
  campos: ['rota', 'gerencia', 'supervisao', 'produtos'], campos_produto: ['meta', 'realizado'],
  totais, rotas: linhas,
}, mais);
// outubro: X13 (sem canal) soma no SV.XA.1; a EV fica no SV.XA.EV; totais da GC diferentes da soma das rotas
const OUT = fechadoDe('202610', [
  ['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 150] }], ['X12', 'XA', 'SV.XA.1', { aperitivos: [100, 50] }],
  ['X13', 'XA', 'SV.XA.1', { aperitivos: [50, 100], sucos: [1, 1] }], ['X21', 'XA', 'SV.XA.2', { aperitivos: [100, 100] }],
  ['X22', 'XA', 'SV.XA.2', { sucos: [1, 1] }], ['XA-EV', 'XA', 'SV.XA.EV', { aperitivos: [0, 7] }],
  ['X31', 'XB', 'SV.XB.1', { aperitivos: [100, 100] }], ['X32', 'XB', 'SV.XB.1', { aperitivos: [100, 100] }],
  ['X33', 'XB', 'SV.XB.1', { aperitivos: [100, 100] }], ['X41', 'XB', 'SV.XB.2', { aperitivos: [100, 50] }],
], { empresa: { aperitivos: [1500, 1700] }, gerencias: { XA: { aperitivos: [1000, 1500] }, XB: { aperitivos: [500, 300] } } });
const SEM_AJ = { canais: {}, canaisSV: {}, avisos: [] };
const montar = (mais) => A.montarDados(Object.assign({ index: indexDe('202611', false, ['202610']), gerencias: [GER_XA, GER_XB],
  fechados: { 202610: OUT }, base: BASE, ajustes: SEM_AJ }, mais));
const achar = (lista, cod) => lista.find((l) => l.codigo === cod);
const mesDe = (l, m) => l.meses.find((x) => x.mes === m);

test('fontesDosMeses (P1): mês aberto em novembro', () => {
  const f = A.fontesDosMeses(indexDe('202611', false, ['202610']));
  assert.deepEqual(f.map((x) => [x.mes, x.fonte, x.arquivo]), [[10, 'fechado', 'fechado/202610.json'], [11, 'api', null], [12, 'futuro', null]]);
});

test('fontesDosMeses (P1): mês de referência em fechamento vem do fechado; futuro sem dado', () => {
  const f = A.fontesDosMeses(indexDe('202611', true, ['202610', '202611']));
  assert.deepEqual(f.map((x) => x.fonte), ['fechado', 'fechado', 'futuro']);
  assert.equal(f[1].arquivo, 'fechado/202611.json');
});

test('fontesDosMeses (P1): fechado ausente fica indisponível (nunca a API de outro mês no lugar)', () => {
  const f = A.fontesDosMeses(indexDe('202612', false, ['202611']));
  assert.deepEqual(f.map((x) => x.fonte), ['indisponivel', 'fechado', 'api']);
  assert.match(f[0].motivo, /outubro não está nos meses fechados/);
  const fech = A.fontesDosMeses(indexDe('202611', true, ['202610']));
  assert.equal(fech[1].fonte, 'indisponivel'); // fechamento sem o arquivo do mês: não usa a API
});

test('montarDados: meses e fontes reportados; GC de outubro dos totais do fechado e de novembro da API', () => {
  const d = montar();
  assert.equal(d.ok, true);
  assert.deepEqual(d.meses.map((m) => [m.mes, m.fonte, m.estado]), [[10, 'fechado', 'previa'], [11, 'api', 'aberto'], [12, 'futuro', null]]);
  const xa = achar(d.gc, 'XA');
  const out = mesDe(xa, 10), nov = mesDe(xa, 11), dez = mesDe(xa, 12);
  assert.deepEqual([out.meta, out.real, out.online, out.metaDia, out.fonte, out.estado], [1000, 1500, 0, null, 'fechado', 'previa']);
  assert.equal(out.pct, 150); // dos totais (soma das rotas daria outro número)
  assert.equal(out.pctTravado, 130);
  assert.equal(out.travado, true);
  assert.deepEqual([nov.meta, nov.real, nov.online, nov.metaDia, nov.fonte], [1000, 500, 20, 7.5, 'api']);
  assert.equal(nov.pct, 52); // (500 + 20) / 1000, não o atingimento_pct da API
  assert.equal(nov.pctTravado, 52);
  assert.deepEqual([dez.meta, dez.real, dez.online, dez.metaDia, dez.pct, dez.situacao], [null, null, null, null, null, 'futuro']);
  assert.equal(xa.soma, 182);
  assert.equal(xa.incompleta, false);
});

test('montarDados: SV de outubro soma as linhas do fechado (todas as rotas, inclusive sem canal); novembro é o total da API', () => {
  const d = montar();
  const sv = achar(d.svMista, 'SV.XA.1');
  assert.deepEqual([mesDe(sv, 10).meta, mesDe(sv, 10).real], [250, 300]); // X11 + X12 + X13
  assert.equal(mesDe(sv, 10).pct, 120);
  assert.deepEqual([mesDe(sv, 11).meta, mesDe(sv, 11).real, mesDe(sv, 11).online, mesDe(sv, 11).metaDia], [400, 300, 10, 3.2]);
  assert.equal(mesDe(sv, 11).pct, 77.5);
  assert.equal(sv.soma, 197.5);
});

test('montarDados: canal do SV pela maioria; rota sem canal soma mas não vota', () => {
  const d = montar();
  assert.equal(achar(d.svMista, 'SV.XA.1').canal, 'Mista'); // 2 Mista + X13 sem canal
  assert.equal(achar(d.svMista, 'SV.XA.1').origemCanal, 'maioria');
  assert.deepEqual(achar(d.svMista, 'SV.XA.1').votos, { Mista: 2, Segmentada: 0 });
  assert.equal(achar(d.svSegmentada, 'SV.XB.1').canal, 'Segmentada'); // 2 Segmentada + X33 sem canal
  assert.deepEqual(d.svSegmentada.map((l) => l.codigo), ['SV.XB.1']);
});

test('montarDados: empate de canal fica fora do ranking, com aviso; escolha do admin resolve', () => {
  const d = montar();
  const f = achar(d.fora, 'SV.XA.2');
  assert.equal(f.origemCanal, 'empate');
  assert.match(f.motivo, /empate de canal/);
  assert.equal(achar(d.svMista, 'SV.XA.2'), undefined);
  assert.ok(d.avisos.some((a) => /SV\.XA\.2/.test(a) && /fora do ranking/.test(a)));
  const comAdmin = montar({ ajustes: { canais: {}, canaisSV: { 'Sv. Xa.2': 'Segmentada' }, avisos: [] } });
  assert.equal(achar(comAdmin.svSegmentada, 'SV.XA.2').origemCanal, 'ajuste');
  assert.equal(achar(comAdmin.fora, 'SV.XA.2'), undefined);
  assert.ok(!comAdmin.avisos.some((a) => /fora do ranking/.test(a)));
});

test('montarDados: canal da rota ajustado pelo admin muda a maioria da mesa', () => {
  const d = montar({ ajustes: { canais: { X22: { canal: 'Segmentada', sub: 'Mini' } }, canaisSV: {}, avisos: [] } });
  assert.equal(achar(d.svSegmentada, 'SV.XA.2').origemCanal, 'maioria');
  const semCanal = montar({ ajustes: { canais: { X21: { canal: null, sub: null } }, canaisSV: {}, avisos: [] } });
  assert.equal(achar(semCanal.svMista, 'SV.XA.2').canal, 'Mista'); // X21 sem canal deixa de votar
});

test('montarDados: SV só de outubro (mesa eventual, sem canal) fica fora como "sem canal" e incompleta', () => {
  const d = montar();
  const ev = achar(d.fora, 'SV.XA.EV');
  assert.equal(ev.origemCanal, 'sem canal');
  assert.match(ev.motivo, /sem canal/);
  assert.equal(ev.gc, 'XA');
  assert.equal(mesDe(ev, 10).real, 7);
  assert.equal(ev.incompleta, true); // novembro sem dado dele
});

test('montarDados: meta 0 dá % null, linha incompleta e soma só com os meses com %', () => {
  const d = montar();
  const sv = achar(d.svMista, 'SV.XB.2');
  assert.equal(mesDe(sv, 10).pct, 50);
  assert.equal(mesDe(sv, 11).pct, null);
  assert.equal(sv.soma, 50);
  assert.equal(sv.incompleta, true);
  assert.deepEqual(sv.mesesSemPct, [11]);
});

test('montarDados: ranking ordenado e numerado pelo motor (Pos. 1..n)', () => {
  const d = montar();
  assert.deepEqual(d.gc.map((l) => [l.pos, l.codigo]), [[1, 'XA'], [2, 'XB']]);
  assert.deepEqual(d.svMista.map((l) => [l.pos, l.codigo, l.chave]), [[1, 'SV.XA.1', 'sv.xa.1'], [2, 'SV.XB.2', 'sv.xb.2']]);
});

test('montarDados: desempate pelo código em minúsculas ("sv.xa.10" antes de "sv.xa.2")', () => {
  const g = JSON.parse(JSON.stringify(GER_XA));
  g.supervisoes = [{ id: 'SV.XA.2', rotas: ['X21'], produtos: { aperitivos: bl(100, 50, 0, 1) } },
                   { id: 'SV.XA.10', rotas: ['X11'], produtos: { aperitivos: bl(100, 50, 0, 1) } }];
  g.rotas = [rota('X21', 'XA', 'SV.XA.2', bl(100, 50, 0, 1)), rota('X11', 'XA', 'SV.XA.10', bl(100, 50, 0, 1))];
  const base = { meta: {}, rotas: [{ rota: 'X21', canal: 'Mista' }, { rota: 'X11', canal: 'Mista' }] };
  const d = A.montarDados({ index: indexDe('202610', false, []), gerencias: [g], fechados: {}, base, ajustes: SEM_AJ });
  assert.deepEqual(d.svMista.map((l) => l.codigo), ['SV.XA.10', 'SV.XA.2']);
});

test('montarDados: mês de referência em fechamento lê o fechado do mês (meta dia null, online 0)', () => {
  const NOV = fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 80] }], ['X12', 'XA', 'SV.XA.1', { aperitivos: [100, 40] }]],
    { empresa: { aperitivos: [200, 120] }, gerencias: { XA: { aperitivos: [200, 120] } } }, { fechamento_final: true });
  const d = montar({ index: indexDe('202611', true, ['202610', '202611']), fechados: { 202610: OUT, 202611: NOV } });
  assert.deepEqual(d.meses.map((m) => [m.fonte, m.estado]), [['fechado', 'previa'], ['fechado', 'oficial'], ['futuro', null]]);
  const nov = mesDe(achar(d.gc, 'XA'), 11);
  assert.deepEqual([nov.meta, nov.real, nov.online, nov.metaDia, nov.fonte], [200, 120, 0, null, 'fechado']);
  const sv = mesDe(achar(d.svMista, 'SV.XA.1'), 11);
  assert.deepEqual([sv.meta, sv.real, sv.online, sv.metaDia], [200, 120, 0, null]);
  // XB não está no fechado de novembro: sem número, linha incompleta (nunca a API no lugar)
  const xb = achar(d.gc, 'XB');
  assert.equal(mesDe(xb, 11).pct, null);
  assert.equal(xb.incompleta, true);
});

test('montarDados: fechado ausente ou que falhou deixa o mês indisponível, com aviso, e as linhas incompletas', () => {
  for (const d of [montar({ index: indexDe('202611', false, []), fechados: {} }),
                   montar({ fechados: { 202610: new Error('fechado/202610.json: HTTP 500') } })]) {
    assert.equal(d.meses[0].fonte, 'indisponivel');
    assert.ok(d.avisos.some((a) => /outubro indisponível/.test(a)));
    const xa = achar(d.gc, 'XA');
    assert.equal(mesDe(xa, 10).situacao, 'indisponivel');
    assert.equal(mesDe(xa, 10).meta, null);
    assert.equal(xa.soma, 52);
    assert.equal(xa.incompleta, true);
  }
});

test('montarDados: fechado sem totais deixa só a GC indisponível no mês (nunca soma rotas para a GC)', () => {
  const semTotais = Object.assign({}, OUT, { totais: undefined });
  const d = montar({ fechados: { 202610: semTotais } });
  assert.equal(mesDe(achar(d.gc, 'XA'), 10).situacao, 'indisponivel');
  assert.equal(achar(d.gc, 'XA').incompleta, true);
  assert.equal(mesDe(achar(d.svMista, 'SV.XA.1'), 10).pct, 120); // SV continua somando as linhas
  assert.ok(d.avisos.some((a) => /sem totais por gerência/.test(a)));
});

test('montarDados: fechado sem o produto Aperitivo deixa o mês indisponível', () => {
  const sem = fechadoDe('202610', [['X11', 'XA', 'SV.XA.1', { sucos: [1, 1] }]], { empresa: { sucos: [1, 1] }, gerencias: { XA: { sucos: [1, 1] } } });
  const d = montar({ fechados: { 202610: sem } });
  assert.equal(d.meses[0].fonte, 'indisponivel');
  assert.match(d.meses[0].motivo, /não traz o produto Aperitivo/);
});

test('montarDados: produto ausente na API não calcula nada', () => {
  const index = Object.assign(indexDe('202611', false, ['202610']), { produtos: FIXOS });
  const d = montar({ index });
  assert.equal(d.ok, false);
  assert.match(d.erro, /Produtos do Campari ainda não publicados/);
  assert.deepEqual([d.gc, d.svMista, d.svSegmentada, d.rotas], [[], [], [], []]);
});

test('montarDados: produto ausente num bloco do mês aberto dá % null (sem inventar valor)', () => {
  const g = JSON.parse(JSON.stringify(GER_XB));
  delete g.supervisoes[0].produtos.aperitivos;
  const d = montar({ gerencias: [GER_XA, g] });
  const sv = achar(d.svSegmentada, 'SV.XB.1');
  assert.deepEqual([mesDe(sv, 11).meta, mesDe(sv, 11).real, mesDe(sv, 11).pct], [null, null, null]);
  assert.equal(sv.incompleta, true);
});

test('montarDados: meta_dia só no mês aberto; campos por mês preservados', () => {
  const d = montar();
  for (const l of [...d.gc, ...d.svMista, ...d.svSegmentada, ...d.fora]) {
    for (const m of l.meses) {
      for (const k of ['mes', 'anomes', 'fonte', 'estado', 'situacao', 'meta', 'real', 'online', 'metaDia', 'pct', 'pctTravado', 'travado']) assert.ok(k in m, k);
      if (m.fonte !== 'api') assert.equal(m.metaDia, null);
    }
  }
  assert.equal(mesDe(achar(d.gc, 'XB'), 11).metaDia, 5);
});

test('montarDados: consultores com os próprios números, sem ranking; eventuais fora', () => {
  const d = montar();
  assert.deepEqual(d.rotas.map((r) => r.codigo), ['X11', 'X12', 'X13', 'X21', 'X22', 'X31', 'X32', 'X33', 'X41']);
  const x11 = achar(d.rotas, 'X11');
  assert.equal(x11.canal, 'Mista');
  assert.equal(achar(d.rotas, 'X13').canal, null);
  assert.equal(mesDe(x11, 10).pct, 150);
  assert.equal(mesDe(x11, 11).pct, 95);
  assert.equal(mesDe(x11, 11).metaDia, 1);
  assert.equal('pos' in x11, false);
  assert.equal('soma' in x11, false);
  assert.equal(achar(d.rotas, 'X22').meses[0].pct, null); // sem o produto em outubro
});

test('montarDados: simulado e fechado com simulado diferente gera aviso', () => {
  const d = montar({ index: Object.assign(indexDe('202611', false, ['202610']), { simulado: true }) });
  assert.equal(d.simulado, true);
  assert.ok(d.avisos.some((a) => /não é simulado/.test(a)));
});

test('ajustesDeCanal: valida canais e canaisSV como o Q4 (inválido vira aviso)', () => {
  const r = A.ajustesDeCanal({ canais: { X1: { canal: 'Segmentada', segmento: 'Mini' }, X2: { canal: 'Outro' } },
                               canaisSV: { 'Sv. Xa.1': 'Mista', 'Sv. Xa.2': 'Nenhum' } });
  assert.deepEqual(r.canais, { X1: { canal: 'Segmentada', sub: 'Mini' } });
  assert.deepEqual(r.canaisSV, { 'Sv. Xa.1': 'Mista' });
  assert.equal(r.avisos.length, 2);
  assert.equal(A.svNome('SV.XA.1'), 'Sv. Xa.1');
});

test('lerAjustes: 404 = sem ajustes; ilegível = nenhum ajuste vale, com aviso', async () => {
  const a = await A.lerAjustes(async () => resposta(404, null));
  assert.deepEqual([a.situacao, a.avisos], ['ausente', []]);
  const b = await A.lerAjustes(async () => resposta(200, new SyntaxError('Unexpected token')));
  assert.equal(b.situacao, 'erro');
  assert.match(b.avisos[0], /ilegível/);
  assert.deepEqual(b.canaisSV, {});
  const c = await A.lerAjustes(async (url) => { assert.equal(url, './ajustes.json'); return resposta(200, { canaisSV: { 'Sv. Xa.2': 'Mista' } }); });
  assert.deepEqual([c.situacao, c.canaisSV], ['ok', { 'Sv. Xa.2': 'Mista' }]);
});

// a etapa 3 acrescenta a leitura do resumo.json (Total Band) à lista de arquivos da API
test('carregarRanking: lê index, gerências, resumo, fechados necessários e ajustes; monta os níveis', async () => {
  const arquivos = { './api/v1/index.json': indexDe('202611', false, ['202610']), './api/v1/gerencias/XA.json': GER_XA,
                     './api/v1/gerencias/XB.json': GER_XB, './api/v1/fechado/202610.json': OUT };
  const lidos = [];
  const d = await A.carregarRanking(undefined, { baseCanais: BASE, fetchFn: async (url) => {
    lidos.push(url);
    return url in arquivos ? resposta(200, arquivos[url]) : resposta(404, null);
  } });
  assert.equal(d.ok, true);
  assert.deepEqual(lidos.sort(), ['./ajustes.json', './api/v1/fechado/202610.json', './api/v1/gerencias/XA.json',
                                  './api/v1/gerencias/XB.json', './api/v1/index.json', './api/v1/resumo.json']);
  assert.deepEqual(d.gc.map((l) => l.codigo), ['XA', 'XB']);
  assert.equal(d.baseCanais.foto, '2026-11-09');
});

test('carregarRanking: falha numa gerência = API indisponível, sem valores', async () => {
  const d = await A.carregarRanking(undefined, { baseCanais: BASE, fetchFn: async (url) =>
    (url.endsWith('index.json') ? resposta(200, indexDe('202611', false, [])) : resposta(500, null)) });
  assert.equal(d.ok, false);
  assert.match(d.erro, /API indisponível .*gerencias\/XA\.json: HTTP 500/);
  assert.deepEqual(d.gc, []);
});

test('base de canais copiada: data/data.json com a foto e só gc, sv, rota, canal e sub', () => {
  const b = require('../data/data.json');
  assert.equal(b.meta.origem, 'painel-q4/data/data.json');
  assert.match(b.meta.foto, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(b.rotas.length > 0);
  for (const r of b.rotas) {
    assert.deepEqual(Object.keys(r).sort(), ['canal', 'gc', 'rota', 'sub', 'sv']);
    assert.ok(['Mista', 'Segmentada'].includes(r.canal));
  }
});

test('o adaptador não importa nada do painel-q4', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'adapter.js'), 'utf8');
  assert.doesNotMatch(fonte, /require\([^)]*painel-q4/);
  assert.doesNotMatch(fonte, /import[^;]*painel-q4/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Etapa 3 — cobertura de Skyy, gatilho, posição oficial, status, meta dia de cobertura e estrutura das tabelas
// (fixtures sintéticas; os blocos de cobertura são inventados, nenhum número real)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** bloco de produto da API com o bloco `cobertura` (volume fictício + cobertura em clientes) */
const cbl = (vol, cmeta, creal, conline) => Object.assign({}, vol, { cobertura: { meta: cmeta, realizado: creal, online_hoje: conline, atingimento_pct: 999, diferenca: 0 } });
/** bloco de produto SEM o bloco cobertura (modelo sem as colunas): o mês fica indisponível, não "sem meta" */
const semCob = (vol) => Object.assign({}, vol);

// XA3/XB3: as gerências da etapa 2 com o produto skyy acrescentado. Cobertura de novembro (meta, real, online):
//   XA 200/180/25 = 102,5% (bate)   SV.XA.1 100/95/5 = 100,0% (bate)   SV.XA.2 100/50/0 = 50%
//   XB 300/150/0 = 50%              SV.XB.1 10/12/0 = 120% (bate)      SV.XB.2 100/99/0 = 99,0%
//   rotas: X11 50/20/2 = 44%; X12 sem bloco cobertura; X13 sem meta (meta null)
const comSkyy = (ger, skyyGc, skyySv, skyyRota) => {
  const g = JSON.parse(JSON.stringify(ger));
  g.produtos.skyy = skyyGc;
  g.supervisoes.forEach((s, i) => { if (skyySv[i]) s.produtos.skyy = skyySv[i]; });
  g.rotas.forEach((r) => { if (skyyRota[r.id]) r.produtos.skyy = skyyRota[r.id]; });
  return g;
};
const XA3 = comSkyy(GER_XA, cbl(bl(60, 30, 3, 2), 200, 180, 25),
  [cbl(bl(20, 10, 1, 1), 100, 95, 5), cbl(bl(20, 10, 0, 1), 100, 50, 0)],
  { X11: cbl(bl(10, 5, 1, 0.5), 50, 20, 2), X12: semCob(bl(10, 5, 0, 0.5)), X13: cbl(bl(10, 5, 0, 0.5), null, 7, 0) });
const XB3 = comSkyy(GER_XB, cbl(bl(50, 20, 0, 2), 300, 150, 0),
  [cbl(bl(20, 10, 0, 1), 10, 12, 0), cbl(bl(10, 5, 0, 1), 100, 99, 0)], {});
const RESUMO = { empresa: { produtos: {
  aperitivos: bl(1800, 900, 20, 12.5),
  skyy: cbl(bl(110, 50, 3, 4), 400, 380, 10), // 97,5%: não bate
} } };
const montar3 = (mais) => A.montarDados(Object.assign({ index: indexDe('202611', false, ['202610']),
  gerencias: [XA3, XB3], resumo: RESUMO, fechados: { 202610: OUT }, base: BASE, ajustes: SEM_AJ }, mais));
// o % de cobertura de XA em novembro: (180 + 25) ÷ 200 = 102,5% no papel, 102,49999999999999 em ponto flutuante.
// O motor não arredonda, então o teste compara com a própria conta (truncar é papel da tela).
const XA_COB = (205 / 200) * 100;
const cobDe = (l, m) => l.cobertura.find((x) => x.mes === m);

test('fontesDaCobertura (P1): o mês de referência vem da API mesmo em período de fechamento', () => {
  const aberto = A.fontesDaCobertura(indexDe('202611', false, ['202610']));
  assert.deepEqual(aberto.map((f) => [f.mes, f.fonte, f.fechamento]), [[10, 'fechado', false], [11, 'api', false], [12, 'futuro', false]]);
  // em fechamento o VOLUME vai para o fechado, mas a cobertura continua na API (com online_hoje null)
  const fech = A.fontesDaCobertura(indexDe('202611', true, ['202610', '202611']));
  assert.deepEqual(fech.map((f) => [f.mes, f.fonte, f.fechamento]), [[10, 'fechado', false], [11, 'api', true], [12, 'futuro', false]]);
  assert.deepEqual(A.fontesDosMeses(indexDe('202611', true, ['202610', '202611'])).map((f) => f.fonte), ['fechado', 'fechado', 'futuro']);
  // dezembro de referência: novembro já é mês fechado
  const dez = A.fontesDaCobertura(indexDe('202612', false, ['202610', '202611']));
  assert.deepEqual(dez.map((f) => [f.mes, f.fonte]), [[10, 'fechado'], [11, 'fechado'], [12, 'api']]);
});

test('coberturaDoFechado: porta única da pendência 10 — devolve null para qualquer arquivo de hoje', () => {
  assert.equal(A.coberturaDoFechado(OUT, '202610', 'skyy'), null);
  assert.equal(A.coberturaDoFechado(undefined, '202610', 'skyy'), null);
  assert.equal(A.coberturaDoFechado(new Error('HTTP 500'), '202610', 'skyy'), null);
  // o formato do campo novo ainda não existe: nem um arquivo que diga ter cobertura é adivinhado
  const inventado = Object.assign({}, OUT, { campos_produto: ['meta', 'realizado', 'cobertura'] });
  assert.equal(A.coberturaDoFechado(inventado, '202610', 'skyy'), null);
});

test('montarDados: cobertura do mês aberto por nível, como a API publica (sem recalcular soma de rotas)', () => {
  const d = montar3();
  assert.deepEqual(d.mesesCobertura.map((m) => [m.mes, m.fonte, m.estado]), [[10, 'indisponivel', null], [11, 'api', 'aberto'], [12, 'futuro', null]]);
  const nov = cobDe(achar(d.gc, 'XA'), 11);
  assert.deepEqual([nov.meta, nov.real, nov.online, nov.situacao, nov.aberto], [200, 180, 25, 'dado', true]);
  assert.equal(nov.pct, XA_COB);      // (180 + 25) / 200, bruto
  assert.equal(nov.dif, 5);          // 180 + 25 − 200
  assert.equal(nov.metaDia, 2);      // (200 − 180) / 14 = 1,43 -> 2 (inteiro para cima)
  const sv = cobDe(achar(d.svMista, 'SV.XA.1'), 11);
  assert.deepEqual([sv.meta, sv.real, sv.online, sv.pct, sv.metaDia], [100, 95, 5, 100, 1]);
  const rt = cobDe(achar(d.rotas, 'X11'), 11);
  assert.deepEqual([rt.meta, rt.real, rt.online, rt.pct, rt.metaDia, rt.dif], [50, 20, 2, 44, 3, -28]);
});

test('montarDados: Skyy de outubro fica indisponível com motivo "cobertura indisponível" (pendência 10)', () => {
  const d = montar3();
  for (const l of [achar(d.gc, 'XA'), achar(d.svMista, 'SV.XA.1'), achar(d.rotas, 'X11'), d.totalBand]) {
    const out = cobDe(l, 10);
    assert.deepEqual([out.meta, out.real, out.online, out.metaDia, out.pct, out.dif], [null, null, null, null, null, null]);
    assert.deepEqual([out.situacao, out.motivo], ['indisponivel', 'cobertura indisponível']);
  }
  // outubro não entra no gatilho: nada de aviso por causa dele (o aviso é só dos meses do gatilho)
  assert.ok(!d.avisos.some((a) => /cobertura de outubro/.test(a)));
  assert.equal(cobDe(achar(d.gc, 'XA'), 12).situacao, 'futuro');
  assert.equal(cobDe(achar(d.gc, 'XA'), 12).motivo, null);
});

test('montarDados: cobertura de um mês do gatilho indisponível gera aviso e deixa o gatilho indisponível', () => {
  // dezembro de referência: novembro virou mês fechado e o fechado não traz cobertura
  const DEZ = fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 80] }]],
    { empresa: { aperitivos: [100, 80] }, gerencias: { XA: { aperitivos: [100, 80] } } });
  const d = montar3({ index: indexDe('202612', false, ['202610', '202611']), fechados: { 202610: OUT, 202611: DEZ } });
  assert.equal(d.mesesCobertura[1].fonte, 'indisponivel');
  assert.ok(d.avisos.some((a) => /cobertura de novembro indisponível/.test(a) && /pendência 10/.test(a)));
  const xa = achar(d.gc, 'XA');
  assert.deepEqual([xa.gatilho.valor, xa.gatilho.batido, xa.gatilho.indisponivel, xa.gatilho.motivo],
    [null, false, true, 'cobertura indisponível']);
  assert.equal(xa.oficial, null);
  assert.deepEqual(xa.status, { status: '-', motivo: 'cobertura indisponível' });
});

test('montarDados: produto sem o bloco cobertura fica indisponível; cobertura.meta null é "sem meta de cobertura"', () => {
  const d = montar3();
  const semBloco = cobDe(achar(d.rotas, 'X12'), 11);
  assert.deepEqual([semBloco.situacao, semBloco.pct, semBloco.motivo], ['indisponivel', null, 'cobertura indisponível']);
  const semMeta = cobDe(achar(d.rotas, 'X13'), 11);
  assert.deepEqual([semMeta.situacao, semMeta.meta, semMeta.real, semMeta.pct, semMeta.metaDia, semMeta.motivo],
    ['dado', null, 7, null, null, 'sem meta de cobertura']);
});

test('montarDados: gatilho parcial em novembro, posição oficial só de quem bateu e status do motor', () => {
  const d = montar3();
  assert.equal(d.mesGatilho, 11);
  const xa = achar(d.gc, 'XA'), xb = achar(d.gc, 'XB');
  assert.deepEqual([xa.gatilho.valor, xa.gatilho.batido, xa.gatilho.parcial], [XA_COB, true, true]);
  assert.deepEqual([xa.pos, xa.oficial], [1, 1]);
  assert.deepEqual(xa.status, { status: 'Bateu!', motivo: 'dentro das premiadas' });
  assert.deepEqual([xb.gatilho.valor, xb.gatilho.batido], [50, false]);
  assert.deepEqual([xb.pos, xb.oficial], [2, null]);
  assert.deepEqual(xb.status, { status: '-', motivo: 'cobertura em 50,0%: precisa de 100%' });
  // SV Mista: SV.XA.1 bate com 100,0% exatos; SV.XB.2 fica em 99,0%
  const sv1 = achar(d.svMista, 'SV.XA.1'), sv2 = achar(d.svMista, 'SV.XB.2');
  assert.deepEqual([sv1.gatilho.valor, sv1.oficial, sv1.status.status], [100, 1, 'Bateu!']);
  assert.deepEqual([sv2.gatilho.valor, sv2.oficial], [99, null]);
  assert.equal(sv2.status.motivo, 'cobertura em 99,0%: precisa de 100%');
  // SV Segmentada: limite 3, uma linha só
  const seg = achar(d.svSegmentada, 'SV.XB.1');
  assert.deepEqual([seg.gatilho.valor, seg.oficial, seg.status.status], [120, 1, 'Bateu!']);
});

test('montarDados: quem bate o gatilho mas fica fora das premiadas recebe "suba N posições"', () => {
  // 4 SVs Segmentada, todas batendo o gatilho: o limite do nível é 3
  const sv = (n, real) => ({ id: `SV.XC.${n}`, rotas: [`XC${n}`], produtos: { aperitivos: bl(100, real, 0, 1), skyy: cbl(bl(10, 5, 0, 0), 10, 20, 0) } });
  const XC = { gerencia: { id: 'XC', nome: 'Fictícia C' },
    produtos: { aperitivos: bl(400, 200, 0, 4), skyy: cbl(bl(40, 20, 0, 2), 40, 80, 0) },
    supervisoes: [sv(1, 90), sv(2, 80), sv(3, 70), sv(4, 60)],
    rotas: [1, 2, 3, 4].map((n) => rota(`XC${n}`, 'XC', `SV.XC.${n}`, bl(100, 10, 0, 1))) };
  const base = { meta: {}, rotas: [1, 2, 3, 4].map((n) => ({ gc: 'Xc', sv: `Sv. Xc.${n}`, rota: `XC${n}`, canal: 'Segmentada', sub: 'Mod' })) };
  const d = A.montarDados({ index: indexDe('202611', false, []), gerencias: [XC], resumo: RESUMO, fechados: {}, base, ajustes: SEM_AJ });
  assert.deepEqual(d.svSegmentada.map((l) => [l.codigo, l.pos, l.oficial, l.status.status, l.status.motivo]), [
    ['SV.XC.1', 1, 1, 'Bateu!', 'dentro das premiadas'],
    ['SV.XC.2', 2, 2, 'Bateu!', 'dentro das premiadas'],
    ['SV.XC.3', 3, 3, 'Bateu!', 'dentro das premiadas'],
    ['SV.XC.4', 4, 4, '-', 'suba 1 posição'],
  ]);
});

test('montarDados: meta dia de cobertura é travada (não muda com o Online) e usa dias_uteis_restantes', () => {
  const d = montar3();
  assert.equal(cobDe(achar(d.gc, 'XA'), 11).metaDia, 2); // (200 − 180) / 14, sem o online de 25
  const semOnline = montar3({ gerencias: [comSkyy(GER_XA, cbl(bl(60, 30, 3, 2), 200, 180, 0), [], {}), XB3] });
  assert.equal(cobDe(achar(semOnline.gc, 'XA'), 11).metaDia, 2); // mesma meta dia com online 0
  // 0 dias úteis restantes (dia não útil): a diferença total
  const domingo = montar3({ index: Object.assign(indexDe('202611', false, ['202610']), { calendario: { hoje: '2026-11-08', dias_uteis_restantes: 0 } }) });
  assert.equal(cobDe(achar(domingo.gc, 'XA'), 11).metaDia, 20);
  // sem calendário no index: null, nunca 0
  const semCal = montar3({ index: Object.assign(indexDe('202611', false, ['202610']), { calendario: undefined }) });
  assert.equal(cobDe(achar(semCal.gc, 'XA'), 11).metaDia, null);
  // meta de cobertura batida: 0
  const batida = montar3({ gerencias: [comSkyy(GER_XA, cbl(bl(60, 30, 3, 2), 100, 120, 0), [], {}), XB3] });
  assert.equal(cobDe(achar(batida.gc, 'XA'), 11).metaDia, 0);
});

test('montarDados: Total Band vem do resumo.json, com meta dia de volume da API e de cobertura do motor', () => {
  const d = montar3();
  const t = d.totalBand;
  assert.equal(t.codigo, 'Total Band');
  const vol = t.meses.find((m) => m.mes === 11);
  assert.deepEqual([vol.meta, vol.real, vol.online, vol.metaDia], [1800, 900, 20, 12.5]); // meta dia de volume: da API
  assert.equal(vol.pct, (920 / 1800) * 100);
  assert.equal(t.meses.find((m) => m.mes === 10).real, 1700); // outubro: totais.empresa do fechado
  const cob = cobDe(t, 11);
  assert.deepEqual([cob.meta, cob.real, cob.online, cob.pct, cob.metaDia], [400, 380, 10, 97.5, 2]);
  assert.deepEqual([t.gatilho.valor, t.gatilho.batido], [97.5, false]);
  assert.equal('oficial' in t, false); // Diretoria e GP não têm apuração própria
  assert.equal('status' in t, false);
});

test('montarDados: sem resumo.json o Total Band fica sem números do mês de referência, com aviso', () => {
  const d = montar3({ resumo: null });
  assert.ok(d.avisos.some((a) => /resumo\.json indisponível/.test(a)));
  const vol = d.totalBand.meses.find((m) => m.mes === 11);
  assert.deepEqual([vol.situacao, vol.meta, vol.pct], ['indisponivel', null, null]);
  assert.equal(cobDe(d.totalBand, 11).situacao, 'indisponivel');
  assert.equal(d.totalBand.meses.find((m) => m.mes === 10).real, 1700); // outubro continua, é do fechado
  assert.deepEqual([d.gc.length, d.svMista.length], [2, 2]); // o resto do painel não para
});

test('montarDados (P7): tabela por produto e por mês, com metaDia e online só no mês aberto', () => {
  const d = montar3();
  const t = achar(d.gc, 'XA').tabela;
  assert.deepEqual(Object.keys(t).sort(), ['aperitivo', 'skyy']);
  assert.deepEqual(Object.keys(t.aperitivo.porMes), ['10', '11', '12']);
  const apNov = t.aperitivo.porMes[11];
  assert.deepEqual([apNov.meta, apNov.real, apNov.online, apNov.metaDia, apNov.dif, apNov.pct], [1000, 500, 20, 7.5, -480, 52]);
  assert.equal(apNov.hojeOk, true); // online 20 ≥ meta dia 7,5
  // mês fechado: M. Dia e Online não existem (a tela mostra "—"), mesmo com o online 0 do fechado em `meses`
  const apOut = t.aperitivo.porMes[10];
  assert.deepEqual([apOut.meta, apOut.real, apOut.online, apOut.metaDia, apOut.dif], [1000, 1500, null, null, 500]);
  assert.deepEqual([apOut.pct, apOut.pctTravado, apOut.travado, apOut.aberto, apOut.hojeOk], [150, 130, true, false, false]);
  assert.equal(t.aperitivo.soma, 182);
  // dezembro (futuro): tudo null
  assert.deepEqual([t.aperitivo.porMes[12].meta, t.aperitivo.porMes[12].pct, t.aperitivo.porMes[12].aberto], [null, null, false]);
  // Skyy: % do mês por mês, % Nov, % Dez e o acumulado (= gatilho, parcial em novembro)
  const skNov = t.skyy.porMes[11];
  assert.deepEqual([skNov.meta, skNov.real, skNov.online, skNov.metaDia, skNov.dif, skNov.pct, skNov.hojeOk], [200, 180, 25, 2, 5, XA_COB, true]);
  assert.deepEqual([t.skyy.porMes[10].pct, t.skyy.porMes[10].motivo], [null, 'cobertura indisponível']);
  assert.deepEqual([t.skyy.pctNov, t.skyy.pctDez, t.skyy.acumulado], [XA_COB, null, XA_COB]);
  assert.deepEqual([t.skyy.parcial, t.skyy.indisponivel, t.skyy.motivo], [true, false, null]);
});

test('montarDados (P7): em dezembro, % Nov e acumulado ficam null enquanto o fechado não trouxer cobertura', () => {
  const DEZ = fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 80] }]],
    { empresa: { aperitivos: [100, 80] }, gerencias: { XA: { aperitivos: [100, 80] } } });
  const d = montar3({ index: indexDe('202612', false, ['202610', '202611']), fechados: { 202610: OUT, 202611: DEZ } });
  const t = achar(d.gc, 'XA').tabela;
  assert.equal(d.mesGatilho, 12);
  assert.deepEqual([t.skyy.pctNov, t.skyy.pctDez, t.skyy.acumulado], [null, XA_COB, null]);
  assert.deepEqual([t.skyy.indisponivel, t.skyy.motivo], [true, 'cobertura indisponível']);
  assert.equal(t.skyy.porMes[11].motivo, 'cobertura indisponível');
  assert.equal(t.skyy.porMes[12].pct, XA_COB); // dezembro é o mês de referência: vem da API
});

test('montarDados: consultor não tem gatilho, posição oficial nem status; a tabela não tem soma', () => {
  const d = montar3();
  const x11 = achar(d.rotas, 'X11');
  for (const k of ['gatilho', 'oficial', 'status', 'pos', 'soma']) assert.equal(k in x11, false, k);
  assert.equal(x11.tabela.aperitivo.soma, null);
  assert.equal(x11.tabela.skyy.acumulado, null);
  assert.equal(x11.tabela.skyy.porMes[11].pct, 44);
});

test('montarDados: SV fora do ranking tem gatilho, mas não tem posição oficial nem status', () => {
  const d = montar3();
  const f = achar(d.fora, 'SV.XA.2');
  assert.equal(f.gatilho.valor, 50);
  for (const k of ['oficial', 'status', 'pos']) assert.equal(k in f, false, k);
});

test('montarDados: em período de fechamento a cobertura do mês de referência continua vindo da API', () => {
  const NOV = fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 80] }]],
    { empresa: { aperitivos: [100, 80] }, gerencias: { XA: { aperitivos: [100, 80] } } }, { fechamento_final: true });
  // em fechamento a API devolve online_hoje null na cobertura
  const XA4 = comSkyy(GER_XA, cbl(bl(60, 30, null, null), 200, 190, null), [], {});
  const d = montar3({ index: indexDe('202611', true, ['202610', '202611']), gerencias: [XA4, XB3],
                      fechados: { 202610: OUT, 202611: NOV } });
  const cob = cobDe(achar(d.gc, 'XA'), 11);
  assert.deepEqual([cob.fonte, cob.estado, cob.aberto, cob.situacao], ['api', 'fechamento', false, 'dado']);
  assert.deepEqual([cob.meta, cob.real, cob.online], [200, 190, null]);
  assert.equal(cob.pct, 95);      // online null conta 0
  assert.equal(cob.metaDia, null); // fora do mês aberto não há meta dia
  assert.equal(achar(d.gc, 'XA').tabela.skyy.porMes[11].online, null);
  assert.equal(achar(d.gc, 'XA').gatilho.valor, 95);
  // o volume do mesmo mês, por contraste, já vem do fechado
  assert.equal(achar(d.gc, 'XA').meses.find((m) => m.mes === 11).fonte, 'fechado');
});

test('carregarRanking: lê também o resumo.json (Total Band) e segue sem ele quando falha', async () => {
  const arquivos = { './api/v1/index.json': indexDe('202611', false, ['202610']), './api/v1/gerencias/XA.json': XA3,
                     './api/v1/gerencias/XB.json': XB3, './api/v1/fechado/202610.json': OUT, './api/v1/resumo.json': RESUMO };
  const d = await A.carregarRanking(undefined, { baseCanais: BASE, fetchFn: async (url) =>
    (url in arquivos ? resposta(200, arquivos[url]) : resposta(404, null)) });
  assert.equal(d.ok, true);
  assert.equal(cobDe(d.totalBand, 11).meta, 400);
  assert.equal(achar(d.gc, 'XA').status.status, 'Bateu!');
  // resumo.json fora do ar: o painel continua, só o Total Band fica sem o mês de referência
  const semResumo = await A.carregarRanking(undefined, { baseCanais: BASE, fetchFn: async (url) =>
    (url.endsWith('resumo.json') ? resposta(500, null) : url in arquivos ? resposta(200, arquivos[url]) : resposta(404, null)) });
  assert.equal(semResumo.ok, true);
  assert.ok(semResumo.avisos.some((a) => /resumo\.json indisponível/.test(a)));
  assert.equal(cobDe(semResumo.totalBand, 11).situacao, 'indisponivel');
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Etapa 4 — formatação, recortes da tela e o que a tela NÃO pode conter
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */

const Motor = require('../src/motor.js');

test('fmtVolume: volume com 1 casa, padrão pt-BR; ausência de medida vira "—", nunca zero', () => {
  assert.equal(A.fmtVolume(1234.56), '1.234,6');
  assert.equal(A.fmtVolume(31896.44), '31.896,4');
  assert.equal(A.fmtVolume(0), '0,0');
  assert.equal(A.fmtVolume(-209), '-209,0');
  assert.equal(A.fmtVolume(-0.04), '0,0');      // não existe "-0,0" na tela
  for (const v of [null, undefined, NaN, Infinity, '10']) assert.equal(A.fmtVolume(v), A.TRACO, String(v));
  assert.equal(A.TRACO, '—');
});

test('fmtCobertura: clientes sem casa decimal, padrão pt-BR', () => {
  assert.equal(A.fmtCobertura(1738), '1.738');
  assert.equal(A.fmtCobertura(570), '570');
  assert.equal(A.fmtCobertura(0), '0');
  assert.equal(A.fmtCobertura(-104), '-104');
  assert.equal(A.fmtCobertura(-0.2), '0');
  for (const v of [null, undefined, NaN]) assert.equal(A.fmtCobertura(v), A.TRACO, String(v));
});

test('fmtPct: % TRUNCADO em 1 casa — 99,96 nunca vira 100,0', () => {
  assert.equal(A.fmtPct(99.96), '99,9%');
  assert.equal(A.fmtPct(99.99999), '99,9%');
  assert.equal(A.fmtPct(100), '100,0%');
  assert.equal(A.fmtPct(0), '0,0%');
  assert.equal(A.fmtPct(156.52), '156,5%');
  for (const v of [null, undefined, NaN]) assert.equal(A.fmtPct(v), A.TRACO, String(v));
});

test('fmtPct trunca igual ao motor: o % da coluna bate com o X do motivo "cobertura em X%"', () => {
  for (const v of [22.3881, 59.0551, 99.96, 99.99999, 100, 0]) {
    const motivo = Motor.statusLinha({ gatilho: { valor: v, batido: false, indisponivel: false, motivo: null } }, 'gc').motivo;
    assert.equal(motivo, 'cobertura em ' + A.fmtPct(v).replace('%', '') + '%: precisa de 100%', String(v));
  }
});

test('fmtDataHora e rotuloDiaUtil: cabeçalho do painel', () => {
  assert.equal(A.fmtDataHora('2026-11-09T10:00:34'), '09/11/2026 · 10:00');
  assert.equal(A.fmtDataHora('2026-11-09'), '09/11/2026');
  for (const v of [null, undefined, '', 'ontem']) assert.equal(A.fmtDataHora(v), A.TRACO, String(v));
  assert.equal(A.rotuloDiaUtil({ dia_util_hoje: 5, dias_uteis_mes: 19 }), 'dia útil 5/19');
  assert.equal(A.rotuloDiaUtil({ dias_uteis_mes: 19 }), null);
  assert.equal(A.rotuloDiaUtil(null), null);
});

test('rotuloDoMes: "Novembro/26"; mês fechado em prévia leva a marca', () => {
  assert.equal(A.rotuloDoMes(11, 2026, 'aberto'), 'Novembro/26');
  assert.equal(A.rotuloDoMes(10, 2026, 'previa'), 'Outubro/26 (prévia)');
  assert.equal(A.rotuloDoMes(10, 2026, 'oficial'), 'Outubro/26');
  assert.equal(A.rotuloDoMes(12, 2026, null), 'Dezembro/26');
});

test('mesesDoSeletor (P4): padrão no mês de referência; mês sem dado desabilitado', () => {
  const d = montar3();
  const s = A.mesesDoSeletor(d);
  assert.equal(s.padrao, 11);
  assert.deepEqual(s.meses.map((m) => [m.mes, m.habilitado, m.aberto]), [[10, true, false], [11, true, true], [12, false, false]]);
  assert.deepEqual(s.meses.map((m) => m.rotulo), ['Outubro/26 (prévia)', 'Novembro/26', 'Dezembro/26']);
});

test('mesesDoSeletor (P4): mês de referência em fechamento não é "aberto" (sem M. Dia nem Online)', () => {
  const d = montar3({ index: indexDe('202611', true, ['202610', '202611']),
                      fechados: { 202610: OUT, 202611: fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 90] }]],
                        { empresa: { aperitivos: [100, 90] }, gerencias: { XA: { aperitivos: [100, 90] } } }) } });
  const s = A.mesesDoSeletor(d);
  assert.deepEqual(s.meses.map((m) => [m.mes, m.habilitado, m.aberto]), [[10, true, false], [11, true, false], [12, false, false]]);
  assert.equal(s.padrao, 11);
});

test('mesesDoSeletor: mês indisponível fica desabilitado e o padrão cai no último habilitado', () => {
  const d = montar3({ index: indexDe('202611', false, []), fechados: {} }); // outubro sem o fechado
  const s = A.mesesDoSeletor(d);
  assert.deepEqual(s.meses.map((m) => m.habilitado), [false, true, false]);
  assert.equal(s.padrao, 11);
});

test('valoresDoMes: lê a tabela da linha; mês ausente devolve tudo null, nunca zero', () => {
  const xa = achar(montar3().gc, 'XA');
  const nov = A.valoresDoMes(xa.tabela, 'aperitivo', 11);
  assert.deepEqual([nov.meta, nov.real, nov.online, nov.metaDiaExib], [1000, 500, 20, 7.5]);
  const vazio = A.valoresDoMes(xa.tabela, 'aperitivo', 7);
  assert.deepEqual([vazio.meta, vazio.real, vazio.pct, vazio.metaDiaExib, vazio.hojeOk], [null, null, null, null, false]);
  assert.deepEqual([A.valoresDoMes(null, 'skyy', 11).meta, A.valoresDoMes({}, 'skyy', 11).real], [null, null]);
});

test('metaDiaExib (v1.4): o volume passa pela regra de exibição e a cobertura repete a conta do motor', () => {
  const batida = JSON.parse(JSON.stringify(XA3));
  // GC: Real acima da Meta com meta dia positiva -> exibe 0;  SV.XA.1: meta dia negativa -> exibe 0
  Object.assign(batida.produtos.aperitivos, { meta: 100, realizado: 150, online_hoje: 5, meta_dia: 7.5 });
  Object.assign(batida.supervisoes[0].produtos.aperitivos, { meta: 100, realizado: 50, online_hoje: 0, meta_dia: -3 });
  const d = montar3({ gerencias: [batida, XB3] });
  const gcNov = A.valoresDoMes(achar(d.gc, 'XA').tabela, 'aperitivo', 11);
  assert.deepEqual([gcNov.metaDia, gcNov.metaDiaExib], [7.5, 0]); // a origem fica guardada, a tela mostra 0
  assert.equal(gcNov.hojeOk, true);                               // Online 5 ≥ meta dia exibida 0
  const svNov = A.valoresDoMes(achar(d.svMista.concat(d.svSegmentada, d.fora), 'SV.XA.1').tabela, 'aperitivo', 11);
  assert.deepEqual([svNov.metaDia, svNov.metaDiaExib], [-3, 0]);
  assert.equal(svNov.hojeOk, false);                              // Online 0 nunca colore
  const cobNov = A.valoresDoMes(achar(d.gc, 'XA').tabela, 'skyy', 11);
  assert.equal(cobNov.metaDiaExib, cobNov.metaDia);               // cobertura: o motor já entrega o valor de exibição
});

test('rotas: o adaptador entrega o `tipo` da API (a aba Consultor filtra por ele)', () => {
  const d = montar3();
  assert.equal(achar(d.rotas, 'X11').tipo, 'normal');
  assert.ok(d.rotas.every((r) => 'tipo' in r));
});

test('rotasDaMesa: só as rotas tipo "normal"; o que fica fora é contado, nunca sumido', () => {
  const g = JSON.parse(JSON.stringify(XA3));
  g.rotas[1].tipo = 'neutraliza';   // X12
  g.rotas[2].tipo = 'virtual';      // X13
  const d = montar3({ gerencias: [g, XB3] });
  const m = A.rotasDaMesa(d, 'SV.XA.1');
  assert.deepEqual(m.rotas.map((r) => r.codigo), ['X11']);
  assert.deepEqual(m.ocultas, { neutraliza: 1, virtual: 1 });
  assert.equal(m.total.codigo, 'SV.XA.1');  // "Total da mesa" = a linha do SV (todas as rotas, como a API soma)
  assert.deepEqual(A.TIPOS_CONSULTOR, ['normal']);
  // mesa inexistente: lista vazia, sem erro
  assert.deepEqual(A.rotasDaMesa(d, 'SV.ZZ.9'), { rotas: [], ocultas: {}, total: null });
});

test('rotasDaMesa: rota que só existe num mês fechado não tem tipo e entra em "sem tipo"', () => {
  const d = montar3();
  const m = A.rotasDaMesa(d, 'SV.XB.1');
  assert.ok(m.rotas.every((r) => r.tipo === 'normal'));
  const semTipo = d.rotas.filter((r) => r.sv === 'SV.XB.1' && !r.tipo).length;
  assert.equal(m.ocultas['sem tipo'] || 0, semTipo);
});

test('textoDasOcultas: conta e nomeia o que ficou fora da lista; nada oculto dá texto vazio', () => {
  assert.equal(A.textoDasOcultas({}), '');
  assert.equal(A.textoDasOcultas(null), '');
  assert.equal(A.textoDasOcultas({ neutraliza: 1 }), '1 rota da mesa fora da lista (1 neutraliza)');
  assert.equal(A.textoDasOcultas({ virtual: 2, neutraliza: 1 }),
               '3 rotas da mesa fora da lista (1 neutraliza, 2 virtual)');
});

test('filtrosDoPainel: só códigos de gerência e de SV; nenhum nome de pessoa', () => {
  const d = montar3();
  const f = A.filtrosDoPainel(d);
  assert.deepEqual(f.gerencias, ['XA', 'XB']);
  assert.ok(f.svs.length >= 3);
  assert.ok(f.svs.every((s) => /^SV\./.test(s.codigo)));
  assert.ok(f.svs.some((s) => s.rotulo === 'SV.XA.1 · Mista'));
  assert.ok(f.svs.some((s) => /· sem canal$/.test(s.rotulo)));  // SV fora do ranking também aparece no filtro
  const texto = JSON.stringify(f);
  assert.doesNotMatch(texto, /Fictícia/);   // nome da gerência não vai para o filtro
});

test('linhasDoDetalhe: gerências na visão GC e todas as supervisões na visão SV, com filtro de gerência', () => {
  const d = montar3();
  assert.deepEqual(A.linhasDoDetalhe(d, 'gc').map((l) => l.codigo), ['XA', 'XB']);
  const svs = A.linhasDoDetalhe(d, 'sv');
  assert.equal(svs.length, d.svMista.length + d.svSegmentada.length + d.fora.length);
  assert.deepEqual(svs.map((l) => l.codigo), svs.map((l) => l.codigo).slice().sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })));
  assert.ok(A.linhasDoDetalhe(d, 'sv', 'XB').every((l) => l.gc === 'XB'));
});

test('alertasDaTela: pendência 10 (cobertura do mês fechado) e a premissa da meta dia aparecem; as resolvidas não', () => {
  const al = A.alertasDaTela(montar3());
  const texto = al.map((a) => a.titulo + ' ' + a.texto).join(' | ');
  assert.match(texto, /Cobertura de outubro indisponível/);
  assert.match(texto, /pendência 10/);
  assert.match(texto, /Meta dia de volume: premissa a confirmar/);
  assert.match(texto, /Outubro em prévia/);
  assert.match(texto, /Dezembro ainda não começou/);
  // pendências resolvidas não podem voltar à tela
  for (const resolvida of [/pendência 9\b/, /pendência 11/, /pendência 12/, /pendência 14/, /pendência 16/,
                           /pendência 17/, /pendência 18/, /pendência 19/, /pendência 20/]) {
    assert.doesNotMatch(texto, resolvida, String(resolvida));
  }
  assert.ok(al.every((a) => ['erro', 'aviso', 'nota'].includes(a.tipo)));
});

test('alertasDaTela: API fora dá um só alerta de erro e para por aí', () => {
  const al = A.alertasDaTela({ ok: false, erro: 'API indisponível (timeout)' });
  assert.equal(al.length, 1);
  assert.equal(al[0].tipo, 'erro');
  assert.match(al[0].texto, /timeout/);
});

test('alertasDaTela: dados simulados e produtos não publicados viram erro', () => {
  const d = montar3();
  const simulado = A.alertasDaTela(Object.assign({}, d, { simulado: true }));
  assert.equal(simulado[0].tipo, 'erro');
  assert.match(simulado[0].titulo, /simulados/i);
  const semProd = A.alertasDaTela(Object.assign({}, d, { produtos: { ok: false, motivos: ['agrupador "Skyy" não publicado na API'] } }));
  assert.ok(semProd.some((a) => a.tipo === 'erro' && /Skyy/.test(a.texto)));
});

/* ─── a TELA: o que o template e o HTML gerado não podem conter ──────────────────────────────────────────── */

const TPL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.tpl.html'), 'utf8');
const SEM_CSS = TPL.replace(/<style>[\s\S]*?<\/style>/g, '');
const GERADO = path.join(__dirname, '..', '..', 'frontend', 'campari-club.html');

test('tela: nenhum número de regra digitado — gatilho, trava e posições premiadas vêm do motor (P6)', () => {
  assert.doesNotMatch(SEM_CSS, /\b130\b/);                       // a trava nunca é escrita
  assert.doesNotMatch(SEM_CSS, /precisa de 100|mínimo de 100|média de 100/);
  assert.doesNotMatch(SEM_CSS, /GC: ?6|Mista: ?12|Segmentada: ?3/);
  // e vêm mesmo das regras do motor
  assert.match(SEM_CSS, /R\.premiadas/);
  assert.match(SEM_CSS, /R\.gatilho\.minimo/);
  assert.match(SEM_CSS, /R\.trava\[/);
  assert.match(SEM_CSS, /R\.gatilho\.meses/);
});

test('tela: nenhum prêmio, nome de pessoa ou cliente no template (P3)', () => {
  for (const proibido of [/aruba/i, /noronha/i, /cruzeiro/i, /ar-condicionado/i, /premiação plus/i, /viagem/i]) {
    assert.doesNotMatch(TPL, proibido, String(proibido));
  }
  assert.doesNotMatch(TPL, /\bvendedor\b/i);
  // a tela nunca lê o campo `nome` da API (gerência, supervisão, rota ou cliente): só os códigos.
  // `a.nome` das abas e NOME_NIVEL são rótulos fixos da própria tela, não dados vindos da API.
  assert.doesNotMatch(TPL, /\b(gerencia|ger|supervisao|sv|rota|cliente)\.nome\b/);
});

test('tela: nenhuma fonte nem link de site externo (P1)', () => {
  assert.doesNotMatch(TPL, /https?:\/\//);
  assert.doesNotMatch(TPL, /googleapis|gstatic|cdn\./i);
  assert.match(TPL, /\/\*__FONTS__\*\//);  // a fonte entra embutida pelo build
  assert.match(TPL, /\/\*__FUNDO__\*\//);  // e o fundo também
});

test('tela: o HTML gerado está no repositório, sem prêmio e sem link externo', () => {
  assert.ok(fs.existsSync(GERADO), 'rode python painel-campari/scripts/build.py e comite o HTML gerado');
  const html = fs.readFileSync(GERADO, 'utf8');
  for (const proibido of [/aruba/i, /noronha/i, /cruzeiro/i, /ar-condicionado/i, /premiação plus/i]) {
    assert.doesNotMatch(html, proibido, String(proibido));
  }
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /@font-face\{font-family:Barlow Condensed/);
  assert.match(html, /data:image\/jpeg;base64,|background:#02306B/); // fundo embutido, ou o azul sólido de reserva
});

test('tela: as cinco abas do mockup, nessa ordem', () => {
  const abas = /const ABAS = \[([\s\S]*?)\];/.exec(SEM_CSS)[1];
  assert.deepEqual(Array.from(abas.matchAll(/nome:'([^']+)'/g), (m) => m[1]),
                   ['Ranking GC', 'Supervisão', 'Consultor', 'Detalhe do mês', 'Regras']);
});
