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

test('carregarRanking: lê index, gerências, fechados necessários e ajustes; monta os níveis', async () => {
  const arquivos = { './api/v1/index.json': indexDe('202611', false, ['202610']), './api/v1/gerencias/XA.json': GER_XA,
                     './api/v1/gerencias/XB.json': GER_XB, './api/v1/fechado/202610.json': OUT };
  const lidos = [];
  const d = await A.carregarRanking(undefined, { baseCanais: BASE, fetchFn: async (url) => {
    lidos.push(url);
    return url in arquivos ? resposta(200, arquivos[url]) : resposta(404, null);
  } });
  assert.equal(d.ok, true);
  assert.deepEqual(lidos.sort(), ['./ajustes.json', './api/v1/fechado/202610.json', './api/v1/gerencias/XA.json',
                                  './api/v1/gerencias/XB.json', './api/v1/index.json']);
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
