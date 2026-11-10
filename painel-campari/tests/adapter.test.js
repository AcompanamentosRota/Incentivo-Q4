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
// 4H (regras v1.8): o "Bateu!" exige também o gatilho de VOLUME de Aperitivo. Nas fixtures acima o volume de
// novembro fica abaixo de 100% (XA 52%, SV.XA.1 77,5%, SV.XB.1 90%), então elas servem ao caso "Skyy batido e volume
// não". XA3V/XB3V são as mesmas gerências com o volume de novembro batido em XA (102%), SV.XA.1 (102,5%) e
// SV.XB.1 (100% exatos), para os testes que precisam ver o "Bateu!".
const comAperitivo = (ger, gc, svs) => {
  const g = JSON.parse(JSON.stringify(ger));
  if (gc) g.produtos.aperitivos = gc;
  g.supervisoes.forEach((s, i) => { if (svs[i]) s.produtos.aperitivos = svs[i]; });
  return g;
};
const XA3V = comAperitivo(XA3, bl(1000, 1000, 20, 7.5), [bl(400, 400, 10, 3.2)]);
const XB3V = comAperitivo(XB3, null, [bl(300, 300, 0, 2)]);
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
  // 4H: o status agora junta os dois pilares (regras v1.8). O volume de XA tem valor e não bate (nov 52% e dez 80%
  // dão 66%), então o motivo do status é o do volume; o gatilho de Skyy continua indisponível (asserção acima).
  assert.deepEqual(xa.status, { status: '-', motivo: 'volume em 66,0%: precisa de 100%' });
  assert.equal(xa.gatilhoPilares.batido, false);
  // com o volume batido nos dois meses, sobra só a cobertura indisponível: o pilar fica indisponível
  const DEZV = fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 120] }]],
    { empresa: { aperitivos: [100, 120] }, gerencias: { XA: { aperitivos: [100, 120] } } });
  const dv = montar3({ index: indexDe('202612', false, ['202610', '202611']), fechados: { 202610: OUT, 202611: DEZV },
                       gerencias: [XA3V, XB3V] });
  const xav = achar(dv.gc, 'XA');
  assert.deepEqual([xav.gatilhoVolume.valor, xav.gatilhoVolume.batido], [(120 + 102) / 2, true]);
  assert.deepEqual([xav.gatilhoPilares.indisponivel, xav.oficial, xav.status.motivo], [true, null, 'cobertura indisponível']);
});

test('montarDados: produto sem o bloco cobertura fica indisponível; cobertura.meta null é "sem meta de cobertura"', () => {
  const d = montar3();
  const semBloco = cobDe(achar(d.rotas, 'X12'), 11);
  assert.deepEqual([semBloco.situacao, semBloco.pct, semBloco.motivo], ['indisponivel', null, 'cobertura indisponível']);
  const semMeta = cobDe(achar(d.rotas, 'X13'), 11);
  assert.deepEqual([semMeta.situacao, semMeta.meta, semMeta.real, semMeta.pct, semMeta.metaDia, semMeta.motivo],
    ['dado', null, 7, null, null, 'sem meta de cobertura']);
});

// 4H: este teste usa XA3V/XB3V (volume de novembro batido) para continuar medindo o caminho do "Bateu!" pelo
// adaptador; com as fixtures originais (volume abaixo de 100%) o resultado agora é "-", no teste 4H logo abaixo.
test('montarDados: gatilho parcial em novembro, posição oficial só de quem bateu e status do motor', () => {
  const d = montar3({ gerencias: [XA3V, XB3V] });
  assert.equal(d.mesGatilho, 11);
  const xa = achar(d.gc, 'XA'), xb = achar(d.gc, 'XB');
  assert.deepEqual([xa.gatilho.valor, xa.gatilho.batido, xa.gatilho.parcial], [XA_COB, true, true]);
  assert.deepEqual([xa.gatilhoVolume.valor, xa.gatilhoVolume.batido, xa.gatilhoVolume.parcial], [102, true, true]);
  assert.deepEqual([xa.pos, xa.oficial], [1, 1]);
  assert.deepEqual(xa.status, { status: 'Bateu!', motivo: 'dentro das premiadas' });
  assert.deepEqual([xb.gatilho.valor, xb.gatilho.batido], [50, false]);
  assert.deepEqual([xb.pos, xb.oficial], [2, null]);
  // XB falha nos dois pilares (cobertura 50% e volume 50%)
  assert.deepEqual(xb.status, { status: '-', motivo: 'cobertura em 50,0% e volume em 50,0%: precisam de 100%' });
  // SV Mista: SV.XA.1 bate com 100,0% exatos; SV.XB.2 fica em 99,0%
  const sv1 = achar(d.svMista, 'SV.XA.1'), sv2 = achar(d.svMista, 'SV.XB.2');
  assert.deepEqual([sv1.gatilho.valor, sv1.oficial, sv1.status.status], [100, 1, 'Bateu!']);
  assert.deepEqual([sv2.gatilho.valor, sv2.oficial], [99, null]);
  assert.equal(sv2.status.motivo, 'cobertura em 99,0%: precisa de 100%'); // volume: sem meta (meta 0)
  // SV Segmentada: limite 3, uma linha só
  const seg = achar(d.svSegmentada, 'SV.XB.1');
  assert.deepEqual([seg.gatilho.valor, seg.oficial, seg.status.status], [120, 1, 'Bateu!']);
  assert.deepEqual([seg.gatilhoVolume.valor, seg.gatilhoVolume.batido], [100, true]); // 100% exatos batem
});

test('4H montarDados: Skyy batido e volume não -> "-", sem posição oficial (o caso de 09/11/2026)', () => {
  const d = montar3(); // fixtures originais: volume de novembro abaixo de 100%
  const xa = achar(d.gc, 'XA');
  assert.deepEqual([xa.gatilho.batido, xa.gatilhoVolume.valor, xa.gatilhoVolume.batido], [true, 52, false]);
  assert.deepEqual([xa.pos, xa.oficial], [1, null]);  // Pos. não muda; Oficial some
  assert.deepEqual(xa.status, { status: '-', motivo: 'volume em 52,0%: precisa de 100%' });
  assert.deepEqual(xa.gatilhoPilares, { batido: false, indisponivel: false, motivo: 'volume em 52,0%: precisa de 100%' });
  const sv1 = achar(d.svMista, 'SV.XA.1');
  assert.deepEqual([sv1.gatilho.batido, sv1.gatilhoVolume.valor, sv1.oficial, sv1.status.status], [true, 77.5, null, '-']);
  const seg = achar(d.svSegmentada, 'SV.XB.1');
  assert.deepEqual([seg.gatilho.batido, seg.gatilhoVolume.valor, seg.oficial, seg.status.motivo],
    [true, 90, null, 'volume em 90,0%: precisa de 100%']);
  // ninguém tem os dois pilares: nenhuma posição oficial e nenhum "Bateu!" em nível nenhum
  for (const nivel of ['gc', 'svMista', 'svSegmentada']) {
    assert.ok(d[nivel].every((l) => l.oficial === null && l.status.status === '-'), nivel);
  }
});

test('4H montarDados: o ranking não muda — Pos., soma e % são os mesmos com e sem o gatilho de volume', () => {
  const d = montar3();
  const ref = (l) => [l.codigo, l.pos, l.soma, l.meses.map((m) => m.pctTravado)];
  // a ordem do ranking de SV Mista e de GC continua sendo a da soma (desempate pelo código)
  assert.deepEqual(d.gc.map((l) => l.pos), d.gc.map((_, i) => i + 1));
  for (const nivel of ['gc', 'svMista', 'svSegmentada']) {
    const somas = d[nivel].map((l) => l.soma).filter((v) => v !== null);
    assert.deepEqual(somas, somas.slice().sort((a, b) => b - a), nivel);
  }
  // o gatilho de volume reaproveita o % do ranking: novembro travado da própria linha
  for (const l of d.svMista.concat(d.gc)) {
    const nov = l.meses.find((m) => m.mes === 11);
    assert.equal(l.gatilhoVolume.valor, nov.pctTravado, ref(l).join());
  }
});

test('4H montarDados: volume batido e Skyy não -> "-"; meta de volume 0 -> "sem meta de volume"', () => {
  // SV.XA.2: cobertura 50% (não bate) e volume levado a 110%
  const xa = comAperitivo(XA3, null, [null, bl(200, 220, 0, 1)]);
  const d = montar3({ gerencias: [xa, XB3] });
  const fora = d.fora.find((l) => l.codigo === 'SV.XA.2'); // SV.XA.2 empata no canal: fora do ranking
  assert.deepEqual([fora.gatilhoVolume.batido, fora.gatilho.batido, fora.gatilhoPilares.batido], [true, false, false]);
  assert.equal(fora.gatilhoPilares.motivo, 'cobertura em 50,0%: precisa de 100%');
  assert.equal('oficial' in fora, false);
  // SV.XB.2 tem meta de volume 0: o gatilho de volume fica indisponível ("sem meta de volume"), nunca 0 nem 100
  const sv = achar(d.svMista, 'SV.XB.2');
  assert.deepEqual([sv.gatilhoVolume.valor, sv.gatilhoVolume.indisponivel, sv.gatilhoVolume.motivo], [null, true, 'sem meta de volume']);
  // a cobertura dele (99%) falha com valor: o motivo do status é o da cobertura, e o pilar não é "indisponível"
  assert.deepEqual([sv.oficial, sv.status.motivo, sv.gatilhoPilares.indisponivel], [null, 'cobertura em 99,0%: precisa de 100%', false]);
});

test('montarDados: quem bate o gatilho mas fica fora das premiadas recebe "suba N posições"', () => {
  // 4 SVs Segmentada, todas batendo o gatilho: o limite do nível é 3. 4H: o volume de novembro sai de 90/80/70/60%
  // para 125/120/115/110% (todos batem o gatilho de volume e ficam abaixo da trava, a ordem é a mesma).
  const sv = (n, real) => ({ id: `SV.XC.${n}`, rotas: [`XC${n}`], produtos: { aperitivos: bl(100, real, 0, 1), skyy: cbl(bl(10, 5, 0, 0), 10, 20, 0) } });
  const XC = { gerencia: { id: 'XC', nome: 'Fictícia C' },
    produtos: { aperitivos: bl(400, 200, 0, 4), skyy: cbl(bl(40, 20, 0, 2), 40, 80, 0) },
    supervisoes: [sv(1, 125), sv(2, 120), sv(3, 115), sv(4, 110)],
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
  // 4H: XA3V/XB3V (volume de novembro batido), para o "Bateu!" de XA continuar provando a carga completa
  const arquivos = { './api/v1/index.json': indexDe('202611', false, ['202610']), './api/v1/gerencias/XA.json': XA3V,
                     './api/v1/gerencias/XB.json': XB3V, './api/v1/fechado/202610.json': OUT, './api/v1/resumo.json': RESUMO };
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

test('mesesDoSeletor (4F): `referencia` é o mês VIGENTE da API, e não muda com a escolha do seletor', () => {
  assert.equal(A.mesesDoSeletor(montar3()).referencia, 11);
  // em período de fechamento da API o volume do mês vem do fechado/ (nenhum mês "aberto"), e a referência segue
  // sendo o mês publicado em mes_referencia: é ela que decide as colunas de dezembro e o quadradinho do Aperitivo
  const emFech = montar3({ index: indexDe('202611', true, ['202610', '202611']),
                           fechados: { 202610: OUT, 202611: fechadoDe('202611', [['X11', 'XA', 'SV.XA.1', { aperitivos: [100, 90] }]],
                             { empresa: { aperitivos: [100, 90] }, gerencias: { XA: { aperitivos: [100, 90] } } }) } });
  const s = A.mesesDoSeletor(emFech);
  assert.equal(s.referencia, 11);
  assert.equal(s.meses.every((m) => !m.aberto), true);
  // mês de referência sem fonte de volume (outubro sem o fechado) continua sendo a referência
  assert.equal(A.mesesDoSeletor(montar3({ index: indexDe('202611', false, []), fechados: {} })).referencia, 11);
  // referência fora da vigência: null (a tela não marca coluna nenhuma)
  assert.equal(A.mesesDoSeletor({ mesReferencia: { anomes: '202609' }, meses: [] }).referencia, null);
  assert.equal(A.mesesDoSeletor({}).referencia, null);
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
  // etapa 4F: a ⚠️ pendência 25 (limite do quadradinho do Aperitivo no mês sem trava) é sinalizada, não decidida,
  // e o número vem do motor
  assert.match(texto, /Quadradinho do % de Aperitivo: premissa a confirmar/);
  assert.match(texto, new RegExp('pendência 25'));
  assert.match(texto, new RegExp(A.fmtPct(Motor.REGRAS.corAperitivoSemTrava).replace('%', '%')));
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

// ===============================================================================================================
// Etapa 4C - Ranking GC pela gerência comercial agrupada (regras v1.6, seção 4; pendência 24)
// Fixtures sintéticas: números fictícios em cima dos códigos de linha do mapa de CONFIG.gruposGC.
// ===============================================================================================================

/** gerência da API sem supervisões nem rotas (o Ranking GC usa só os totais da gerência) */
const gerC = (id, vol, cob) => ({ gerencia: { id, nome: 'Fictícia ' + id },
                                  produtos: { aperitivos: vol, skyy: cob }, supervisoes: [], rotas: [] });
// Os quatro pares do mapa. Volume de novembro (meta, real, online, meta dia) e cobertura de Skyy (meta, real):
//   UR 100/200 = 200% e RI 900/180 = 20%  -> UR_RI: 1000/380 = 38% (a média dos dois seria 110%)
//   IT 500/550 = 110% e MO 300/400 = 133% -> IT_MO: 800/950 = 118,75%
//   PA 200/100 = 50%  e DI sem meta       -> PA_DI: 200/150 = 75% (meta null não zera a meta do grupo)
//   GU 100/100 = 100% e PO não publicada  -> GU_PO: só GU, com aviso
const PARES = [
  gerC('UR', bl(100, 200, 0, 10), cbl(bl(1, 1, 0, 0), 200, 210, 0)),
  gerC('RI', bl(900, 180, 0, 5), cbl(bl(1, 1, 0, 0), 100, 50, 0)),
  gerC('IT', bl(500, 500, 50, 4), cbl(bl(1, 1, 0, 0), 100, 120, 0)),
  gerC('MO', bl(300, 400, 0, 0), cbl(bl(1, 1, 0, 0), 100, 110, 0)),
  gerC('PA', bl(200, 100, 0, 2), cbl(bl(1, 1, 0, 0), 100, 90, 0)),
  gerC('DI', bl(null, 50, 0, null), cbl(bl(1, 1, 0, 0), null, 10, 0)),
  gerC('GU', bl(100, 100, 0, 1), cbl(bl(1, 1, 0, 0), 100, 100, 0)),
];
// As oito gerências que ficam sozinhas no mapa: Soma decrescente (100%, 99%, ..., 93%) e cobertura de (100 + i)%,
// que bate o gatilho em todas - é o que permite ver a 7a, 8a... posição oficial sem "Bateu!".
const SOZINHAS = ['G1', 'G2', 'G3', 'AP', 'AT', 'AN', 'RV', 'SL'].map((id, i) =>
  gerC(id, bl(100, 100 - i, 0, 1), cbl(bl(1, 1, 0, 0), 100, 100 + i, 0)));
const DOZE = PARES.concat(SOZINHAS);
const montar4c = (mais) => A.montarDados(Object.assign({ index: indexDe('202611', false, []), gerencias: DOZE,
  resumo: RESUMO, fechados: {}, base: BASE, ajustes: SEM_AJ }, mais));
const linhaDe = (d, cod) => d.gc.find((l) => l.codigo === cod);

test('4C: CONFIG.gruposGC tem as 12 linhas do SAC - oito sozinhas e quatro pares, sem gerência repetida', () => {
  const mapa = CONFIG.gruposGC;
  assert.equal(Object.keys(mapa).length, 12);
  const sozinhas = Object.entries(mapa).filter(([c, g]) => g.length === 1 && g[0] === c).map(([c]) => c);
  assert.deepEqual(sozinhas.sort(), ['AN', 'AP', 'AT', 'G1', 'G2', 'G3', 'RV', 'SL']);
  assert.deepEqual(Object.entries(mapa).filter(([, g]) => g.length > 1).sort(),
                   [['GU_PO', ['GU', 'PO']], ['IT_MO', ['IT', 'MO']], ['PA_DI', ['PA', 'DI']], ['UR_RI', ['UR', 'RI']]]);
  const todas = Object.values(mapa).flat();
  assert.equal(todas.length, 16);                              // as 16 gerências da API de hoje
  assert.equal(new Set(todas).size, 16);                       // nenhuma em dois grupos
});

test('4C: gruposDoRankingGC com todas as gerências publicadas monta as 12 linhas, sem aviso', () => {
  const r = A.gruposDoRankingGC(Object.values(CONFIG.gruposGC).flat());
  assert.deepEqual(r.avisos, []);
  assert.equal(r.grupos.length, 12);
  const urRi = r.grupos.find((g) => g.codigo === 'UR_RI');
  assert.deepEqual([urRi.gerencias, urRi.faltantes, urRi.agrupada, urRi.foraDoMapa], [['UR', 'RI'], [], true, false]);
  const g1 = r.grupos.find((g) => g.codigo === 'G1');
  assert.deepEqual([g1.gerencias, g1.agrupada], [['G1'], false]);
});

test('4C: gerência publicada fora do mapa entra como linha própria, com aviso', () => {
  const r = A.gruposDoRankingGC(['G1', 'ZZ', 'YY']);
  assert.deepEqual(r.grupos.map((g) => g.codigo), ['G1', 'YY', 'ZZ']); // as de fora, em ordem, no fim
  const zz = r.grupos.find((g) => g.codigo === 'ZZ');
  assert.deepEqual([zz.gerencias, zz.foraDoMapa], [['ZZ'], true]);
  assert.equal(r.avisos.filter((a) => /não está no agrupamento/.test(a)).length, 2);
  assert.ok(r.avisos.some((a) => /ZZ/.test(a) && /linha própria/.test(a)));
});

test('4C: gerência do mapa que a API não publicou sai da soma, com aviso; grupo vazio não entra', () => {
  const r = A.gruposDoRankingGC(['UR', 'G2']);
  const urRi = r.grupos.find((g) => g.codigo === 'UR_RI');
  assert.deepEqual([urRi.gerencias, urRi.faltantes, urRi.agrupada], [['UR'], ['RI'], false]);
  assert.ok(r.avisos.some((a) => /UR_RI/.test(a) && /soma só UR/.test(a) && /não publicou RI/.test(a)));
  // os grupos sem nenhuma gerência publicada ficam fora do ranking, nunca como linha de zeros
  assert.deepEqual(r.grupos.map((g) => g.codigo).sort(), ['G2', 'UR_RI']);
  assert.ok(r.avisos.some((a) => /IT_MO/.test(a) && /não entra/.test(a)));
});

test('4C: o Ranking GC tem 12 linhas e a aba Detalhe segue com as gerências da API', () => {
  const d = montar4c();
  assert.equal(d.gc.length, 12);
  assert.deepEqual(d.gc.map((l) => l.codigo).sort(),
                   ['AN', 'AP', 'AT', 'G1', 'G2', 'G3', 'GU_PO', 'IT_MO', 'PA_DI', 'RV', 'SL', 'UR_RI']);
  assert.deepEqual(d.gcApi.map((l) => l.codigo),
                   DOZE.map((g) => g.gerencia.id).sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.equal(d.gcApi.length, 15);                              // as gerências publicadas, uma linha cada
  // o Detalhe do mês e o filtro de gerência continuam com as da API (premissa (d) da seção 4)
  assert.deepEqual(A.linhasDoDetalhe(d, 'gc').map((l) => l.codigo), d.gcApi.map((l) => l.codigo));
  assert.deepEqual(A.filtrosDoPainel(d).gerencias, d.gcApi.map((l) => l.codigo));
  assert.ok(!A.filtrosDoPainel(d).gerencias.includes('UR_RI'));
});

test('4C: gcApi não tem ranking (nem Pos., nem Oficial, nem Status): só o Ranking GC apura', () => {
  const d = montar4c();
  for (const l of d.gcApi) {
    assert.equal(l.pos, undefined);
    assert.equal(l.oficial, undefined);
    assert.equal(l.status, undefined);
  }
  for (const l of d.gc) assert.equal(typeof l.pos, 'number');
});

test('4C: a linha agrupada soma meta, real, online e meta dia - igual à soma independente das gerências', () => {
  const d = montar4c();
  for (const [codigo, membros] of Object.entries({ UR_RI: ['UR', 'RI'], IT_MO: ['IT', 'MO'] })) {
    const nov = mesDe(linhaDe(d, codigo), 11);
    const blocos = membros.map((g) => DOZE.find((x) => x.gerencia.id === g).produtos.aperitivos);
    const soma = (campo) => blocos.reduce((s, b) => s + b[campo], 0);
    assert.deepEqual([nov.meta, nov.real, nov.online, nov.metaDia],
                     [soma('meta'), soma('realizado'), soma('online_hoje'), soma('meta_dia')], codigo);
  }
  assert.deepEqual([mesDe(linhaDe(d, 'UR_RI'), 11).meta, mesDe(linhaDe(d, 'UR_RI'), 11).real], [1000, 380]);
  assert.equal(mesDe(linhaDe(d, 'UR_RI'), 11).metaDia, 15);      // 10 + 5, as metas dia publicadas (premissa (b))
  assert.equal(mesDe(linhaDe(d, 'IT_MO'), 11).online, 50);
});

test('4C: o % da linha agrupada é o da SOMA, nunca a média dos % das gerências', () => {
  const d = montar4c();
  const nov = mesDe(linhaDe(d, 'UR_RI'), 11);
  assert.equal(nov.pct, 38);                                     // (200 + 180) / 1000
  assert.equal(nov.pctTravado, 38);
  assert.equal(nov.travado, false);
  // os % das duas gerências, pela própria API: 200% e 20%; a média (110%) não aparece em lugar nenhum
  const pcts = ['UR', 'RI'].map((g) => mesDe(d.gcApi.find((l) => l.codigo === g), 11).pct);
  assert.deepEqual(pcts, [200, 20]);
  assert.notEqual(nov.pct, (pcts[0] + pcts[1]) / 2);
  // e a trava é aplicada DEPOIS da soma: UR sozinha travaria em 130, a linha agrupada entra com 38
  assert.equal(mesDe(d.gcApi.find((l) => l.codigo === 'UR'), 11).pctTravado, Motor.REGRAS.trava[11]);
  assert.equal(linhaDe(d, 'UR_RI').soma, 38);
  assert.equal(mesDe(linhaDe(d, 'IT_MO'), 11).pct, 118.75);
});

test('4C: meta null numa gerência do grupo soma só as que têm valor (nunca conta como 0)', () => {
  const d = montar4c();
  const nov = mesDe(linhaDe(d, 'PA_DI'), 11);
  assert.deepEqual([nov.meta, nov.real], [200, 150]);            // a meta de DI é null: só a de PA entra
  assert.equal(nov.pct, 75);
  assert.equal(nov.metaDia, 2);                                  // PA 2 + DI null
});

test('4C: a cobertura de Skyy da linha agrupada soma os blocos da API e o % é o da soma', () => {
  const d = montar4c();
  const cob = cobDe(linhaDe(d, 'UR_RI'), 11);
  assert.deepEqual([cob.meta, cob.real, cob.online], [300, 260, 0]);
  assert.equal(cob.pct, (260 / 300) * 100);                      // 86,66...%: não bate o gatilho
  const pcts = ['UR', 'RI'].map((g) => cobDe(d.gcApi.find((l) => l.codigo === g), 11).pct);
  assert.deepEqual(pcts, [105, 50]);
  assert.notEqual(cob.pct, (pcts[0] + pcts[1]) / 2);             // a média seria 77,5%
  assert.equal(linhaDe(d, 'UR_RI').gatilho.batido, false);
  // meta de cobertura null numa gerência: a meta do grupo é só a de quem tem, e o realizado é de todas
  const paDi = cobDe(linhaDe(d, 'PA_DI'), 11);
  assert.deepEqual([paDi.meta, paDi.real], [100, 100]);
  assert.equal(linhaDe(d, 'PA_DI').gatilho.batido, true);
});

test('4C: meta dia de cobertura do grupo sai da meta e do real somados', () => {
  const d = montar4c();                                          // dias úteis restantes: 14 (indexDe)
  assert.equal(cobDe(linhaDe(d, 'UR_RI'), 11).metaDia, 3);       // (300 - 260) / 14 = 2,85... -> 3 clientes
  assert.equal(cobDe(linhaDe(d, 'PA_DI'), 11).metaDia, 0);       // real = meta: 0
});

test('4C: ordem, Pos. 1..12, posição oficial e "Bateu!" só até a 6a oficial', () => {
  const d = montar4c();
  assert.deepEqual(d.gc.map((l) => [l.pos, l.codigo]),
    [[1, 'IT_MO'], [2, 'G1'], [3, 'GU_PO'], [4, 'G2'], [5, 'G3'], [6, 'AP'], [7, 'AT'], [8, 'AN'], [9, 'RV'],
     [10, 'SL'], [11, 'PA_DI'], [12, 'UR_RI']]);
  // 4H (regras v1.8): a posição oficial exige os DOIS pilares. Nesta fixture todas menos UR_RI batem o Skyy, mas só
  // IT_MO (118,75%), G1 (100%) e GU_PO (100%) batem o volume de novembro: só as três recebem posição oficial
  // (era 1..11 antes da v1.8), e Pos. e ordem não mudam.
  assert.deepEqual(d.gc.map((l) => l.oficial), [1, 2, 3, null, null, null, null, null, null, null, null, null]);
  assert.deepEqual(d.gc.filter((l) => l.status.status === 'Bateu!').map((l) => l.codigo), ['IT_MO', 'G1', 'GU_PO']);
  assert.equal(linhaDe(d, 'G2').status.motivo, 'volume em 99,0%: precisa de 100%');
  // o limite de 6 com os dois pilares batidos: as oito sozinhas com volume de 129% a 122% (abaixo da trava, todas
  // batem); a ordem muda porque a Soma muda, e o "Bateu!" para na 6a posição oficial
  const SOZ_4H = ['G1', 'G2', 'G3', 'AP', 'AT', 'AN', 'RV', 'SL'].map((id, i) =>
    gerC(id, bl(100, 129 - i, 0, 1), cbl(bl(1, 1, 0, 0), 100, 100 + i, 0)));
  const d6 = montar4c({ gerencias: PARES.concat(SOZ_4H) });
  assert.deepEqual(d6.gc.map((l) => [l.pos, l.codigo, l.oficial]),
    [[1, 'G1', 1], [2, 'G2', 2], [3, 'G3', 3], [4, 'AP', 4], [5, 'AT', 5], [6, 'AN', 6], [7, 'RV', 7], [8, 'SL', 8],
     [9, 'IT_MO', 9], [10, 'GU_PO', 10], [11, 'PA_DI', null], [12, 'UR_RI', null]]);
  const bateu = d6.gc.filter((l) => l.status.status === 'Bateu!').map((l) => l.codigo);
  assert.deepEqual(bateu, ['G1', 'G2', 'G3', 'AP', 'AT', 'AN']);
  assert.equal(bateu.length, Motor.REGRAS.premiadas.gc);         // o limite vem do motor, não deste teste
  assert.equal(d6.gc.find((l) => l.oficial === 7).status.motivo, 'suba 1 posição');
  // PA_DI: Skyy batido (meta só de PA, 100; real 90 + 10 de DI = 100%) e volume em 75%: fica sem oficial
  assert.deepEqual(linhaDe(d6, 'PA_DI').status, { status: '-', motivo: 'volume em 75,0%: precisa de 100%' });
});

test('4C: desempate entre linhas com a mesma Soma pelo código da linha em minúsculas ("g1" antes de "gu_po")', () => {
  const d = montar4c();
  const g1 = linhaDe(d, 'G1'), guPo = linhaDe(d, 'GU_PO');
  assert.equal(g1.soma, guPo.soma);                              // as duas em 100%
  assert.equal(g1.chave, 'g1');
  assert.equal(guPo.chave, 'gu_po');
  assert.ok(g1.pos < guPo.pos);
});

test('4C: mês fechado soma os totais.gerencias do fechado (nunca as rotas)', () => {
  const OUT4C = fechadoDe('202610', [
    ['U11', 'UR', 'SV.UR.1', { aperitivos: [10, 10] }], ['R11', 'RI', 'SV.RI.1', { aperitivos: [10, 10] }],
  ], { empresa: { aperitivos: [1000, 600] },
       gerencias: { UR: { aperitivos: [400, 500] }, RI: { aperitivos: [600, 100] } } });
  const d = montar4c({ index: indexDe('202611', false, ['202610']), fechados: { 202610: OUT4C } });
  const out = mesDe(linhaDe(d, 'UR_RI'), 10);
  assert.deepEqual([out.meta, out.real, out.online], [1000, 600, 0]); // 400+600 e 500+100, dos totais
  assert.equal(out.pct, 60);                                         // a soma das rotas daria outro número
  assert.equal(out.metaDia, null);                                   // mês fechado não tem meta dia
  assert.equal(linhaDe(d, 'UR_RI').soma, 98);                        // 60 (out) + 38 (nov)
  assert.equal(linhaDe(d, 'UR_RI').incompleta, false);
});

test('4C: mês que falta numa gerência do grupo deixa o mês indisponível e a linha incompleta', () => {
  // o fechado traz os totais de UR e não os de RI: o grupo não soma pela metade
  const SO_UR = fechadoDe('202610', [['U11', 'UR', 'SV.UR.1', { aperitivos: [10, 10] }]],
    { empresa: { aperitivos: [100, 100] }, gerencias: { UR: { aperitivos: [400, 500] } } });
  const d = montar4c({ index: indexDe('202611', false, ['202610']), fechados: { 202610: SO_UR } });
  const out = mesDe(linhaDe(d, 'UR_RI'), 10);
  assert.equal(out.situacao, 'indisponivel');
  assert.deepEqual([out.meta, out.real, out.pct, out.pctTravado], [null, null, null, null]);
  assert.equal(linhaDe(d, 'UR_RI').incompleta, true);
  assert.deepEqual(linhaDe(d, 'UR_RI').mesesSemPct, [10]);
  assert.equal(linhaDe(d, 'UR_RI').soma, 38);                        // só novembro entra na Soma
  // a gerência que tem o mês continua com os números dela na aba Detalhe
  assert.equal(mesDe(d.gcApi.find((l) => l.codigo === 'UR'), 10).real, 500);
  assert.equal(mesDe(linhaDe(d, 'IT_MO'), 10).situacao, 'indisponivel');
});

test('4C: gerência nova (fora do mapa) aparece no Ranking GC com os próprios números e um aviso', () => {
  const d = montar4c({ gerencias: DOZE.concat([gerC('ZZ', bl(100, 500, 0, 1), cbl(bl(1, 1, 0, 0), 10, 50, 0))]) });
  assert.equal(d.gc.length, 13);
  const zz = linhaDe(d, 'ZZ');
  assert.equal(zz.pos, 1);                                           // 130% travado: a maior Soma
  assert.equal(mesDe(zz, 11).pctTravado, Motor.REGRAS.trava[11]);
  assert.deepEqual(zz.gerencias, ['ZZ']);
  assert.ok(d.avisos.some((a) => /ZZ/.test(a) && /não está no agrupamento/.test(a)));
  // e o aviso chega em Regras > Dados e alertas, nunca em silêncio
  assert.ok(A.alertasDaTela(d).some((x) => /ZZ/.test(x.texto) && x.tipo === 'aviso'));
});

test('4C: a linha agrupada guarda as gerências que soma (a tela mostra só o código da linha)', () => {
  const d = montar4c();
  assert.deepEqual(linhaDe(d, 'UR_RI').gerencias, ['UR', 'RI']);
  assert.equal(linhaDe(d, 'UR_RI').agrupada, true);
  assert.deepEqual(linhaDe(d, 'GU_PO').gerencias, ['GU']);           // PO não publicada
  assert.equal(linhaDe(d, 'G1').agrupada, false);
  assert.ok(d.avisos.some((a) => /GU_PO/.test(a) && /não publicou PO/.test(a)));
});

test('4C: a estrutura da tabela da linha agrupada é a mesma das outras (a tela não sabe que é grupo)', () => {
  const d = montar4c();
  const t = linhaDe(d, 'UR_RI').tabela;
  assert.deepEqual(Object.keys(t).sort(), ['aperitivo', 'skyy']);
  assert.deepEqual(Object.keys(t.aperitivo.porMes).map(Number), [10, 11, 12]);
  assert.equal(A.valoresDoMes(t, 'aperitivo', 11).meta, 1000);
  assert.equal(A.valoresDoMes(t, 'skyy', 11).meta, 300);
  assert.equal(t.aperitivo.soma, 38);
  assert.equal(t.skyy.acumulado, linhaDe(d, 'UR_RI').gatilho.valor);
});

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

/* ─── Etapa 4B: os ajustes visuais das duas tabelas de ranking (regras v1.6, seções 5 e 7) ───────────────── */

test('tela 4B: a coluna Status escreve só o selo — nenhum motivo na tela', () => {
  const cel = /const statusCel = \(l\)=>\{[\s\S]*?\n\};/.exec(SEM_CSS)[0];
  assert.doesNotMatch(cel, /motivo/);                    // o motor continua devolvendo; a tela não escreve
  assert.match(cel, /class="pill/);                      // só o selo
  // e nenhum texto de motivo digitado em lugar nenhum da tela
  for (const t of [/dentro das premiadas/, /suba \d+ posi/, /suba N posi/, /cobertura em X/]) {
    assert.doesNotMatch(SEM_CSS, t, String(t));
  }
  assert.doesNotMatch(TPL, /class="mot"/);               // a classe do motivo saiu também do CSS
});

test('tela 4B: sem legenda e sem o aviso de SVs fora do ranking nas duas tabelas', () => {
  assert.doesNotMatch(SEM_CSS, /legendaRanking|class="legenda"|class="foraln"/);
  assert.doesNotMatch(SEM_CSS, /fora do ranking/);
  assert.doesNotMatch(TPL, /\.legenda\{|\.foraln\{/);    // o CSS delas saiu
  // o aviso continua CALCULADO no adaptador e aparece em Regras > Dados e alertas
  const alertas = A.alertasDaTela(Object.assign({}, montar3(), { fora: [{ codigo: 'SV.ZZ.1', motivo: 'sem canal na mesa' }] }));
  assert.ok(alertas.some((a) => /fora do ranking/.test(a.titulo) && /SV\.ZZ\.1/.test(a.texto)));
});

test('tela 4B: a cor do quadradinho do % vem do motor, e o CSS tem as duas cores que ele devolve', () => {
  assert.match(SEM_CSS, /M\.corDoPercentual\(/);           // a tela pergunta, não compara
  assert.doesNotMatch(SEM_CSS, />=\s*100|>= ?R\.gatilho\.minimo/);
  // só o % de cobertura de Skyy usa o quadradinho (duas células: "% mês" e "% Acum.")
  assert.equal((SEM_CSS.match(/pctCobCel\(/g) || []).length, 2); // as duas celulas de % de Skyy, e nenhuma outra
  for (const cor of [Motor.corDoPercentual(100), Motor.corDoPercentual(0)]) {
    assert.match(TPL, new RegExp('\\.pchip\\.' + cor + '\\{'), cor);
  }
});

test('tela 4B: Dif. negativa em vermelho (o vermelho do Q4)', () => {
  assert.match(TPL, /--negv:#FFB3BD/);
  // o seletor leva o `td`: só `.neg` perde para `.tb td{color:#fff}` e a cor não chega na célula
  assert.match(TPL, /\.tb td\.neg\{color:var\(--negv\)\}/);
  assert.doesNotMatch(TPL, /[^ ]\.neg\{color:var\(--laranja\)\}|^\.neg\{/m);
  assert.doesNotMatch(SEM_CSS, /diferença negativa em laranja/);
});

test('tela 4B: os dois blocos têm cor (título escuro, células em tom claro) e a fonte menor', () => {
  assert.match(SEM_CSS, /class="sep bl-ap"/);
  assert.match(SEM_CSS, /class="sep bl-sk"/);
  assert.match(SEM_CSS, /<colgroup class="cg-ap">/);
  assert.match(SEM_CSS, /<colgroup class="cg-sk">/);
  assert.match(TPL, /\.tb tr\.grp th\.bl-ap\{background:var\(--ap-tit\)\}/);
  assert.match(TPL, /\.tb colgroup\.cg-ap\{background:var\(--ap-cel\)\}/);
  assert.match(TPL, /\.tb tr\.grp th\.bl-sk\{background:var\(--sk-tit\)\}/);
  assert.match(TPL, /\.tb colgroup\.cg-sk\{background:var\(--sk-cel\)\}/);
  // só as tabelas de ranking ficam com a fonte menor (Consultor e Detalhe seguem no tamanho da etapa 4)
  assert.match(SEM_CSS, /<table class="tb rk">/);
  // linhas mais justas: e o que faz as 16 gerencias + Total Band caberem em ~1920x940 sem rolagem
  assert.match(TPL, /\.tb\.rk td,\.tb\.rk th\{padding-top:3px;padding-bottom:3px\}/);
  const corpoRk = /\.tb\.rk\{font-size:(\d+)px\}/.exec(TPL)[1];
  const corpo = /\.tb\{width:100%;border-collapse:collapse;font-size:(\d+)px/.exec(TPL)[1];
  assert.equal(Number(corpoRk), Number(corpo) - 1);
  // e nada no palco abaixo de 13 px
  const tamanhos = Array.from(TPL.matchAll(/font-size:(\d+)px/g), (m) => Number(m[1]));
  assert.ok(Math.min.apply(null, tamanhos) >= 13, 'menor fonte: ' + Math.min.apply(null, tamanhos));
});

/* ─── Etapa 4F: ajustes de tabela (regras v1.7, seção 7) — só apresentação e rótulos ─────────────────────── */

test('tela 4F: o conteúdo das células fica centralizado em todas as tabelas, inclusive a coluna de identificação', () => {
  assert.match(TPL, /\.tb th\{font-size:13px;[^}]*text-align:center;/);
  assert.match(TPL, /\.tb td\{padding:5px 5px;[^}]*text-align:center;/);
  // a regra que alinhava a coluna de identificação à esquerda saiu; a classe .l continua, só como marca dela
  assert.doesNotMatch(TPL, /\.tb th\.l,\.tb td\.l\{text-align:left\}/);
  assert.match(TPL, /\.tb\.g2 th\.l:first-child,\.tb\.g2 td\.l:first-child\{width:200px\}/);
  // e nenhuma regra das tabelas alinha mais à esquerda ou à direita
  assert.doesNotMatch(TPL, /\.tb[^{}\n]*\{[^}]*text-align:(left|right)/);
});

test('tela 4F: a coluna Dez do Aperitivo só existe em dezembro, pelo mês VIGENTE da API (não pelo seletor)', () => {
  // o mês vigente vem do adaptador (SEL.referencia); o último e o penúltimo mês saem de R.meses
  assert.match(SEM_CSS, /const mesUltimo = R\.meses\[R\.meses\.length-1\], mesPenultimo = R\.meses\[R\.meses\.length-2\];/);
  assert.match(SEM_CSS, /const emDezembro = SEL\.referencia === mesUltimo;/);
  assert.match(SEM_CSS, /const mesesAp = R\.meses\.filter\(\(m\)=>m!==mesUltimo \|\| emDezembro\);/);
  assert.match(SEM_CSS, /const mostrarPctNov = emDezembro;/);
  // cabeçalho e corpo usam a MESMA lista de meses, e o colspan do bloco acompanha
  assert.match(SEM_CSS, /const apCols = 6 \+ mesesAp\.length/);
  assert.match(SEM_CSS, /mesesAp\.map\(\(m\)=>mesCel\(valoresDoMes\(l\.tabela,'aperitivo',m\), m===SEL\.referencia\)\)/);
  assert.doesNotMatch(SEM_CSS, /R\.meses\.map\(\(m\)=>mesCel/);
  assert.doesNotMatch(SEM_CSS, /const apCols = 9/);
  // e nenhum número de mês digitado na tela para decidir as colunas
  assert.doesNotMatch(SEM_CSS, /=== ?12|NOMES_MES\[11\]/);
});

test('tela 4F: os rótulos novos — "% Acum." no Aperitivo e "% Médio" no Skyy, e nenhuma "Soma" na tela', () => {
  assert.match(SEM_CSS, /<th class="hd-ap k">% Acum\.<\/th>/);
  assert.match(SEM_CSS, /<th class="hd-sk k">% Médio<\/th>/);
  assert.doesNotMatch(SEM_CSS, /Soma/);                        // nem cabeçalho, nem nota, nem texto da aba Regras
  assert.match(SEM_CSS, /ordem pelo % Acum\. de Aperitivo/);
  // o CONCEITO das regras não mudou: o motor segue com `soma` e o gatilho segue sendo a média dos meses
  assert.match(SEM_CSS, /pct\(bAp\.soma\)/);
  assert.match(SEM_CSS, /pct\(R\.gatilho\.minimo\)/);
});

test('tela 4F: o quadradinho do Aperitivo fica só na coluna do mês vigente, e a cor vem do motor', () => {
  // a tela pergunta a cor, passando o mês (o limite é o da trava dele) e o valor BRUTO
  assert.match(SEM_CSS, /M\.corDoPercentualAperitivo\(m\.pct, m\.mes\)/);
  const cel = /const mesCel = \(m, vigente\)=>\{[\s\S]*?\n\};/.exec(SEM_CSS)[0];
  assert.match(cel, /vigente \? M\.corDoPercentualAperitivo/);  // nas outras colunas de mês, nenhum quadradinho
  // o % Acum. não ganha quadradinho
  assert.match(SEM_CSS, /'<td class="k">'\+\(opc\.total\?esc\(TRACO\):pct\(bAp\.soma\)\)\+'<\/td>'/);
  // e a tela não compara nada com limite nenhum
  assert.doesNotMatch(SEM_CSS, />= ?130|>= ?R\.trava|>= ?R\.corAperitivoSemTrava/);
  for (const cor of [Motor.corDoPercentualAperitivo(130, 11), Motor.corDoPercentualAperitivo(0, 11)]) {
    assert.match(TPL, new RegExp('\\.pchip\\.' + cor + '\\{'), cor);
  }
});

test('tela 4F: os números do Aperitivo saem da fonte condensada grande (ficam como os do bloco Skyy)', () => {
  assert.doesNotMatch(SEM_CSS, /class="n g"/);                 // o número grande da Soma saiu
  assert.doesNotMatch(TPL, /\.n\.g\{/);                        // e o CSS que só ele usava saiu junto
  const cel = /const mesCel = \(m, vigente\)=>\{[\s\S]*?\n\};/.exec(SEM_CSS)[0];
  assert.doesNotMatch(cel, /class="n"|class="n /);             // nem as colunas de mês usam a condensada
  // a fonte condensada continua no que não mudou: a coluna OF. (a "Pos." saiu na 4J) e os % do bloco Skyy
  assert.match(TPL, /\.n\{font-family:var\(--cond\)/);
  assert.match(SEM_CSS, /<span class="n of"/);
});

test('tela 4F: a linha do total mostra só "Total Band" — "Diretoria e GP" sai de todas as abas', () => {
  assert.doesNotMatch(TPL, /Diretoria e GP/);                  // a tela inteira mora no template
  assert.match(SEM_CSS, /'Total Band'/);                       // o rótulo do total do Detalhe do mês continua
  // no HTML gerado entram também o motor e o adaptador: o termo só pode sobrar em COMENTÁRIO de código, nunca
  // em texto que a tela escreva (ele é a explicação de quem é o Total Band nas regras, seções 1 e 4)
  const semComentarios = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(semComentarios(fs.readFileSync(GERADO, 'utf8')), /Diretoria e GP/);
});

test('tela 4F: Consultor e Detalhe do mês com as cores e os quadradinhos das tabelas de ranking', () => {
  const g2 = /function tabelaGrupos\([\s\S]*?\n\}/.exec(SEM_CSS)[0];
  // mesmas classes e variáveis do ranking: nenhum CSS novo
  assert.match(g2, /<colgroup class="cg-ap"><col span="'\+COLS\.length\+'">/);
  assert.match(g2, /<colgroup class="cg-sk"><col span="'\+COLS\.length\+'">/);
  assert.match(g2, /class="sep bl-ap">VOLUME DE APERITIVO/);
  assert.match(g2, /class="sep bl-sk">COBERTURA DE SKYY/);
  assert.match(g2, /cabHd\('hd-ap'\)\+cabHd\('hd-sk'\)/);
  // Dif. negativa em vermelho (já era difCel) e os dois quadradinhos, cada um com a sua regra do motor
  assert.match(g2, /difCel\(ap\.dif, fmtVolume\)/);
  assert.match(g2, /difCel\(sk\.dif, fmtCobertura\)/);
  assert.match(g2, /pctGrupoCel\(ap\.pct, M\.corDoPercentualAperitivo\(ap\.pct, mes\)\)/);
  assert.match(g2, /pctGrupoCel\(sk\.pct, M\.corDoPercentual\(sk\.pct\)\)/);
  assert.doesNotMatch(g2, /'<td style="font-weight:700">'\+pct\(/);  // o % sem quadradinho saiu
});

test('tela: as cinco abas do mockup, nessa ordem', () => {
  const abas = /const ABAS = \[([\s\S]*?)\];/.exec(SEM_CSS)[1];
  assert.deepEqual(Array.from(abas.matchAll(/nome:'([^']+)'/g), (m) => m[1]),
                   ['Ranking GC', 'Supervisão', 'Consultor', 'Detalhe do mês', 'Regras']);
});

/* --- Etapa 4C: o laranja do Aperitivo e o Ranking GC agrupado na tela --------------------------------------- */

test('tela 4C: o bloco Aperitivo em laranja (título e cabeçalhos das colunas), com texto escuro', () => {
  assert.match(TPL, /--ap-tit:#E07B41/);                     // o laranja médio do print do SAC
  assert.match(TPL, /--ap-tit-fg:#2B1703/);                  // texto escuro: branco sobre o laranja dá 2,97:1
  assert.match(TPL, /--ap-cel:rgba\(224,123,65,\./);         // corpo das células, no mesmo laranja (tom na 4D)
  assert.doesNotMatch(TPL, /#4A3500|rgba\(255,200,74,\.16\)/); // o marrom-amarelado da 4B saiu
  // o laranja vai também aos cabeçalhos das colunas do bloco, e o texto deles é escuro
  assert.match(TPL, /\.tb tr\.hdr th\.hd-ap\{background:var\(--ap-tit\)\}/);
  assert.match(TPL, /th\.bl-ap,\.tb tr\.grp th\.bl-ap small,\.tb tr\.hdr th\.hd-ap\{color:var\(--ap-tit-fg\)\}/);
  // as colunas do Aperitivo (Meta, Real, M. Dia, Online, Dif. + os meses + % Acum.) levam a classe, e desde a
  // etapa 4F a tabela de dois grupos (Consultor e Detalhe do mês) usa as mesmas classes
  assert.equal((SEM_CSS.match(/hd-ap/g) || []).length, 8);   // 5 fixas + o map dos meses + o % Acum. + o cabHd da g2
  assert.match(SEM_CSS, /mesesAp\.map\(\(m\)=>'<th class="hd-ap">'/);
});

// Guarda de CSS: comentário mal fechado não quebra teste nenhum e não aparece no console — só some com a cor na
// tela. Foi o que aconteceu em 09/11/2026: um fechamento de comentário sem abertura, dentro do :root, derrubou o
// fundo do bloco Skyy. Vale para o template e para o HTML gerado.
function comentariosFechados(css) {
  let i = 0;
  for (;;) {
    const abre = css.indexOf('/*', i), fecha = css.indexOf('*/', i);
    if (abre < 0 && fecha < 0) return 'ok';
    if (fecha >= 0 && (abre < 0 || fecha < abre)) return `*/ sem abertura perto de: ${css.slice(Math.max(0, fecha - 60), fecha + 2)}`;
    const fim = css.indexOf('*/', abre + 2);
    if (fim < 0) return `/* sem fechamento perto de: ${css.slice(abre, abre + 60)}`;
    i = fim + 2;
  }
}

test('tela: os comentários do CSS abrem e fecham (um `*/` solto apaga a cor sem avisar)', () => {
  const css = (s) => /<style>([\s\S]*?)<\/style>/.exec(s)[1];
  assert.equal(comentariosFechados(css(TPL)), 'ok');
  assert.equal(comentariosFechados(css(fs.readFileSync(GERADO, 'utf8'))), 'ok');
  // e as chaves do CSS fecham na mesma conta
  const chaves = (s) => (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  assert.equal(chaves(css(TPL).replace(/\/\*[\s\S]*?\*\//g, '')), 0);
});

/* --- Etapa 4F: a coluna do mês travado mostra só o limite ---------------------------------------------------- */

test('tela 4D/4F: mês travado mostra só o limite, sem o % real ao lado (decisão da Karen, 09/11/2026)', () => {
  const cel = /const mesCel = \(m, vigente\)=>\{[\s\S]*?\n\};/.exec(SEM_CSS)[0];
  assert.match(cel, /pct\(m\.pctTravado\)/);
  assert.doesNotMatch(cel, /m\.travado/);          // a tela não escreve mais o % de antes da trava
  assert.doesNotMatch(cel, /pct\(m\.pct\)/);       // o % bruto entra só na pergunta da cor (etapa 4F), nunca na célula
  assert.doesNotMatch(cel, /class="tv"/);
  // e o CSS do número pequeno saiu junto com o laranja que só ele usava
  assert.doesNotMatch(TPL, /\.tv\{/);
  assert.doesNotMatch(TPL, /var\(--laranja\)/);
  // o texto da aba Regras não promete mais o número ao lado
  assert.doesNotMatch(SEM_CSS, /em laranja, fica o % real/);
  assert.match(SEM_CSS, /a coluna do mês mostra o limite, e só/);
  // o motor continua devolvendo pct e travado: só a tela deixou de escrever
  const motor = fs.readFileSync(path.join(__dirname, '..', 'src', 'motor.js'), 'utf8');
  assert.match(motor, /pctTravado/);
  assert.match(motor, /travado: t\.travado/);
});

/* --- Etapa 4D: o corpo do bloco Aperitivo clareia (só CSS, nenhum número muda) ------------------------------ */

test('tela 4D: o corpo do Aperitivo fica claro e os textos de dentro dele continuam legíveis', () => {
  // o corpo é o MESMO laranja, só mais claro: o laranja queimado da 4C (58%) saiu
  assert.match(TPL, /--ap-cel:rgba\(224,123,65,\.18\)/);
  assert.doesNotMatch(TPL, /rgba\(224,123,65,\.58\)/);
  // título e cabeçalhos das colunas não mudaram (só o corpo)
  assert.match(TPL, /--ap-tit:#E07B41; --ap-tit-fg:#2B1703/);
  // e nenhuma cor de texto precisou mudar: sobre o corpo novo o branco mede 13,7:1 e a Dif. negativa 8,1:1
  assert.match(TPL, /--negv:#FFB3BD/);
  assert.match(TPL, /\.tb td\.neg\{color:var\(--negv\)\}/);
  // o "Hoje" em turquesa e os quadradinhos do % do Skyy ficam como estavam
  assert.match(TPL, /\.hoje\.ok\{background:rgba\(46,196,182,\.22\);color:var\(--turq2\);font-weight:700\}/);
  assert.match(TPL, /--pct-ok-bg:rgba\(34,177,76,\.28\); --pct-ok-fg:#C4FFD3;/);
  assert.match(TPL, /--pct-no-bg:rgba\(194,40,64,\.28\); --pct-no-fg:#FFC2CC;/);
});

test('tela 4E: o bloco Skyy ganha o mesmo tratamento — título e cabeçalhos das colunas no azul escuro', () => {
  assert.match(TPL, /--sk-tit:#061C4D; --sk-tit-fg:#E8EEFB; --sk-cel:rgba\(29,123,255,\.20\)/);
  assert.match(TPL, /\.tb tr\.grp th\.bl-sk\{background:var\(--sk-tit\)\}/);
  assert.match(TPL, /\.tb tr\.hdr th\.hd-sk\{background:var\(--sk-tit\)\}/);
  assert.match(TPL, /\.tb tr\.grp th\.bl-sk,\.tb tr\.hdr th\.hd-sk\{color:var\(--sk-tit-fg\)\}/);
  assert.match(TPL, /\.tb colgroup\.cg-sk\{background:var\(--sk-cel\)\}/);
  assert.doesNotMatch(TPL, /--sk-tit:#0A2A6E/i);             // o azul mais claro da 4B/4C saiu
  // as colunas do Skyy (Meta, Real, M. Dia, Online, Dif., % do mês, o % Nov de dezembro e o % Médio) e, desde a
  // etapa 4F, o cabHd da tabela de dois grupos
  assert.equal((SEM_CSS.match(/hd-sk/g) || []).length, 9);
});

test('tela 4C: o Ranking GC lê as linhas agrupadas e o Detalhe do mês as gerências da API', () => {
  const gc = /function viewGC\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(gc, /tabelaRanking\(D\.gc,'Gerência',true\)/);  // as linhas agrupadas, prontas do adaptador
  assert.match(gc, /gerência comercial agrupada/);
  const det = /function viewDet\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(det, /linhasDoDetalhe\(D, st\.detVisao, st\.ger\)/); // que devolve as da API (gcApi)
  assert.doesNotMatch(det, /D\.gc\b/);
  // nenhum código de gerência nem o mapa do agrupamento digitado na tela: tudo vem do adaptador
  assert.doesNotMatch(SEM_CSS, /gruposGC|UR_RI|IT_MO|PA_DI|GU_PO/);
});

test('tela 4C: nada na tela calcula a soma do grupo (a regra fica no motor)', () => {
  assert.doesNotMatch(SEM_CSS, /somarGrupo/);
  assert.doesNotMatch(SEM_CSS, /\.gerencias\.reduce|agrupada\s*\?/);
});

/* --- Etapa 4G: navegação por páginas (regras v1.7, seção 7) --------------------------------------------------- */

test('CONFIG: o tamanho da página fica em configuração (15 linhas), nunca na tela', () => {
  assert.equal(CONFIG.linhasPorPagina, 15);
});

test('fatiar: 0, 1, 15, 16, 30 e 233 linhas — 15 por página', () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => ({ codigo: 'L' + (i + 1) }));
  const paginas = (n) => A.fatiar(lista(n), 1).paginas;
  assert.deepEqual([0, 1, 15, 16, 30, 233].map(paginas), [1, 1, 1, 2, 2, 16]);
  // lista vazia: uma página sem linhas (nunca 0 páginas), e o "de–até" fica 0–0
  const zero = A.fatiar([], 1);
  assert.deepEqual([zero.linhas.length, zero.pagina, zero.paginas, zero.total, zero.uma, zero.inicio, zero.fim],
                   [0, 1, 1, 0, true, 0, 0]);
  // 15 linhas: cabe numa página só, então a tela não desenha botão nenhum
  const quinze = A.fatiar(lista(15), 1);
  assert.deepEqual([quinze.linhas.length, quinze.paginas, quinze.uma, quinze.inicio, quinze.fim], [15, 1, true, 1, 15]);
  assert.deepEqual(quinze.linhas.map((l) => l.codigo), lista(15).map((l) => l.codigo));
  // 16 linhas: 15 + 1, sem linha perdida nem repetida
  const p1 = A.fatiar(lista(16), 1), p2 = A.fatiar(lista(16), 2);
  assert.deepEqual([p1.linhas.length, p2.linhas.length, p1.uma], [15, 1, false]);
  assert.deepEqual(p1.linhas.concat(p2.linhas).map((l) => l.codigo), lista(16).map((l) => l.codigo));
  assert.deepEqual([p2.inicio, p2.fim], [16, 16]);
  // 233 rotas (o Consultor de hoje): 16 páginas, a última com 8
  const ult = A.fatiar(lista(233), 16);
  assert.deepEqual([ult.linhas.length, ult.inicio, ult.fim, ult.total], [8, 226, 233, 233]);
  assert.deepEqual(ult.linhas.map((l) => l.codigo).slice(0, 2), ['L226', 'L227']);
});

test('fatiar: nenhuma linha se perde nem se repete na soma das páginas', () => {
  const lista = Array.from({ length: 233 }, (_, i) => ({ codigo: 'L' + (i + 1) }));
  const todas = [];
  const paginas = A.fatiar(lista, 1).paginas;
  for (let p = 1; p <= paginas; p++) todas.push(...A.fatiar(lista, p).linhas);
  assert.deepEqual(todas.map((l) => l.codigo), lista.map((l) => l.codigo));
  assert.equal(new Set(todas.map((l) => l.codigo)).size, 233);
});

test('fatiar: página fora do intervalo fica travada no intervalo (nunca tabela vazia)', () => {
  const lista = Array.from({ length: 30 }, (_, i) => ({ codigo: 'L' + (i + 1) }));
  assert.equal(A.fatiar(lista, 0).pagina, 1);
  assert.equal(A.fatiar(lista, -3).pagina, 1);
  assert.equal(A.fatiar(lista, 99).pagina, 2);                 // cai na última, com linhas
  assert.equal(A.fatiar(lista, 99).linhas.length, 15);
  assert.equal(A.fatiar(lista, null).pagina, 1);
  assert.equal(A.fatiar(lista, 2.7).pagina, 2);                // fração não inventa página
  // filtro que encurta a lista enquanto a página 2 estava aberta: a fatia volta para a página que existe
  assert.equal(A.fatiar(lista.slice(0, 10), 2).pagina, 1);
  assert.equal(A.fatiar(lista.slice(0, 10), 2).linhas.length, 10);
});

test('fatiar: tamanho do CONFIG por padrão; tamanho inválido não zera a tabela', () => {
  const lista = Array.from({ length: 20 }, (_, i) => ({ codigo: 'L' + (i + 1) }));
  assert.equal(A.fatiar(lista, 1).tamanho, CONFIG.linhasPorPagina);
  assert.equal(A.fatiar(lista, 1, 10).paginas, 2);
  assert.equal(A.fatiar(lista, 1, 10).linhas.length, 10);
  for (const ruim of [0, -5, null, undefined, 'x', NaN]) {
    assert.equal(A.fatiar(lista, 1, ruim).tamanho, CONFIG.linhasPorPagina);
  }
  assert.deepEqual(A.fatiar(null, 1).linhas, []);              // sem lista: página vazia, sem erro
  assert.deepEqual(A.fatiar(undefined, 1).paginas, 1);
});

test('fatiar: a linha de total fica FORA da conta (15 linhas + Total Band = uma página)', () => {
  const d = montar3();
  const linhas = A.linhasDoDetalhe(d, 'gc');
  const p = A.fatiar(linhas, 1);
  assert.equal(p.total, linhas.length);                        // o Total Band não é passado para cá
  assert.ok(d.totalBand);                                      // ele existe e a tela o repete em toda página
  // 15 linhas de ranking mais a linha de total continuam numa página só
  const quinze = Array.from({ length: 15 }, (_, i) => ({ codigo: 'SV.XA.' + (i + 1) }));
  assert.equal(A.fatiar(quinze, 1).uma, true);
});

test('rotasDoConsultor: com SV é a mesa, como antes, e o total é a linha do SV', () => {
  const d = montar3();
  const comSv = A.rotasDoConsultor(d, { sv: 'SV.XA.1' });
  const mesa = A.rotasDaMesa(d, 'SV.XA.1');
  assert.deepEqual(comSv.rotas.map((r) => r.codigo), mesa.rotas.map((r) => r.codigo));
  assert.deepEqual(comSv.ocultas, mesa.ocultas);
  assert.equal(comSv.total.codigo, 'SV.XA.1');
  assert.equal(comSv.rotuloTotal, 'Total da mesa SV.XA.1');
  // o SV manda, mesmo com gerência no filtro
  assert.deepEqual(A.rotasDoConsultor(d, { sv: 'SV.XA.1', gc: 'XA' }).rotas.map((r) => r.codigo),
                   comSv.rotas.map((r) => r.codigo));
});

test('rotasDoConsultor: sem SV lista TODAS as rotas (o Consultor abre assim), com o Total Band', () => {
  const d = montar3();
  const todas = A.rotasDoConsultor(d, {});
  const normais = d.rotas.filter((r) => r.tipo === 'normal');
  assert.deepEqual(todas.rotas.map((r) => r.codigo), normais.map((r) => r.codigo));  // mesma ordem de d.rotas
  assert.equal(todas.rotuloTotal, 'Total Band');
  assert.equal(todas.total, d.totalBand);
  assert.deepEqual(A.rotasDoConsultor(d, null).rotas.map((r) => r.codigo), normais.map((r) => r.codigo));
  // o que ficou fora dos tipos é contado, nunca sumido
  const foraDosTipos = d.rotas.filter((r) => r.tipo !== 'normal').length;
  assert.equal(Object.values(todas.ocultas).reduce((a, b) => a + b, 0), foraDosTipos);
});

test('rotasDoConsultor: só a gerência, com a linha da gerência da API como total', () => {
  const d = montar3();
  const xa = A.rotasDoConsultor(d, { gc: 'XA' });
  assert.ok(xa.rotas.length > 0);
  assert.ok(xa.rotas.every((r) => r.gc === 'XA'));
  assert.equal(xa.rotuloTotal, 'Total da gerência XA');
  assert.equal(xa.total.codigo, 'XA');                          // a linha de gcApi: a API soma todas as rotas dela
  assert.equal(xa.total, achar(d.gcApi, 'XA'));
  // gerência que não existe: lista vazia e nenhum total inventado
  const zz = A.rotasDoConsultor(d, { gc: 'ZZ' });
  assert.deepEqual([zz.rotas.length, zz.total], [0, null]);
});

test('rotasDoConsultor: respeita o tipo das rotas (só "normal"), como a decisão de 09/11/2026', () => {
  const g = JSON.parse(JSON.stringify(XA3));
  g.rotas[1].tipo = 'neutraliza';
  g.rotas[2].tipo = 'virtual';
  const d = montar3({ gerencias: [g, XB3] });
  const todas = A.rotasDoConsultor(d, {});
  assert.ok(todas.rotas.every((r) => r.tipo === 'normal'));
  assert.equal(todas.ocultas.neutraliza, 1);
  assert.equal(todas.ocultas.virtual, 1);
  // outro conjunto de tipos continua possível (nada fixo na função)
  assert.ok(A.rotasDoConsultor(d, {}, ['normal', 'virtual']).rotas.some((r) => r.tipo === 'virtual'));
});

test('tela 4G: a navegação por páginas sai do adaptador; a tela não conta página nenhuma', () => {
  // a fatia e o tamanho vêm do adaptador e do CONFIG: nenhum 15 nem Math.ceil digitado na tela
  assert.match(SEM_CSS, /fatiar\(linhas, st\.pag\[chavePag\(\)\]\|\|1, CONFIG\.linhasPorPagina\)/);
  assert.doesNotMatch(SEM_CSS, /Math\.ceil/);
  assert.doesNotMatch(SEM_CSS, /linhasPorPagina\s*[:=]\s*\d/);
  // as duas tabelas mostram uma página e desenham os botões embaixo
  const rk = /function tabelaRanking\([\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(rk, /fatiaDaTela\(linhas\)/);
  assert.match(rk, /p\.linhas\.map\(\(l\)=>linhaRanking\(l\)\)/);
  assert.match(rk, /navPaginas\(p\)/);
  const g2 = /function tabelaGrupos\([\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(g2, /fatiaDaTela\(linhas\)/);
  assert.match(g2, /p\.linhas\.map\(\(l\)=>corpo\(l,false\)\)/);
  assert.match(g2, /navPaginas\(p\)/);
  // a linha de total continua fora da fatia, depois do corpo da página
  assert.match(rk, /comTotal && D\.totalBand \? linhaRanking\(D\.totalBand, \{ total:true \}\)/);
  assert.match(g2, /\(totalLinha\?corpo\(totalLinha,true\):''\)/);
});

test('tela 4G: os botões de página com os estados e a acessibilidade mínima', () => {
  const nav = /function navPaginas\(p\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(nav, /if\(p\.uma\) return '';/);                       // uma página só: nenhum botão
  assert.match(nav, /aria-label="'\+esc\(rot\)\+'"/);
  assert.match(nav, /'Página '\+n/);
  assert.match(nav, /'Página anterior'/);
  assert.match(nav, /'Próxima página'/);
  assert.match(nav, /aria-current="page"/);
  assert.match(nav, /p\.pagina<=1/);                                  // a seta de voltar desabilitada na 1ª
  assert.match(nav, /p\.pagina>=p\.paginas/);                         // a de avançar desabilitada na última
  assert.match(nav, /<button type="button"/);                         // botão de verdade: Tab/Enter de graça
  // a página atual fica em destaque vermelho, como no print da Karen
  assert.match(TPL, /\.pag button\[aria-current="page"\]\{background:var\(--red\)/);
  assert.match(TPL, /\.pag button:disabled\{opacity/);
});

test('tela 4G: trocar aba, canal, mês ou filtro volta para a página 1', () => {
  assert.match(SEM_CSS, /const voltarPagina1 = \(\)=>\{ st\.pag=\{\}; st\.foco=null; \};/);
  // os três caminhos de troca chamam a volta antes do render
  assert.match(SEM_CSS, /data-aba\]'\);[\s\S]{0,80}voltarPagina1\(\); render\(\);/);
  assert.match(SEM_CSS, /data-canal\]'\);[\s\S]{0,80}voltarPagina1\(\); render\(\);/);
  assert.match(SEM_CSS, /st\.detVisao = t\.value;\n  voltarPagina1\(\);/);
  // cada tela tem a sua página, e a Supervisão uma por canal
  assert.match(SEM_CSS, /const chavePag = \(\)=> st\.aba==='sv' \? 'sv:'\+st\.canal/);
  assert.match(SEM_CSS, /st\.pag\[chavePag\(\)\] = Number\(b\.dataset\.pg\)/);
  // a página não é lembrada ao recarregar: nada de localStorage no painel
  assert.doesNotMatch(SEM_CSS, /localStorage|sessionStorage/);
});

test('tela 4G: o Consultor abre com todas as rotas e o recorte vem do adaptador', () => {
  assert.match(SEM_CSS, /sv:'',/);                                     // estado inicial: "Todas"
  const rt = /function viewRT\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(rt, /rotasDoConsultor\(D, \{ sv:st\.sv, gc:st\.ger \}\)/);
  assert.doesNotMatch(rt, /rotasDaMesa/);
  assert.match(rt, /mesa\.rotuloTotal/);
  assert.doesNotMatch(rt, /'Total da mesa '\+st\.sv/);                 // o rótulo é do adaptador
  // o seletor de supervisão tem a opção "Todas", e trocar a gerência não escolhe um SV sozinho
  const fil = /else if\(st\.aba==='rt'\)\{[\s\S]*?\n  \}/.exec(SEM_CSS)[0];
  assert.match(fil, /<option value="">Todas<\/option>/);
  assert.match(fil, /if\(st\.sv && !svs\.some\(\(s\)=>s\.codigo===st\.sv\)\) st\.sv = '';/);
  assert.doesNotMatch(fil, /st\.sv = svs\[0\]\.codigo/);
});

test('tela 4G: o HTML gerado leva a paginação (build rodado)', () => {
  const html = fs.readFileSync(GERADO, 'utf8');
  assert.match(html, /function navPaginas\(p\)/);
  assert.match(html, /aria-label="Páginas da tabela"/);
  assert.match(html, /\.pag button\[aria-current="page"\]/);
  assert.match(html, /linhasPorPagina: 15/);                           // o CONFIG do adaptador embutido
  assert.doesNotMatch(html, /rotasDaMesa\(D, st\.sv\)/);
});

/* --- Etapa 4H: status com os dois pilares (regras v1.8, seções 2, 5 e 7) -------------------------------------- */

test('4H tela: "Oficial" e contagem seguem os dois pilares do motor; nada de regra digitada', () => {
  // a tela conta pelo gatilho dos dois pilares do motor, nunca pelo gatilho de Skyy sozinho
  assert.match(TPL, /const bateuPilares = \(l\)=>!!\(l\.gatilhoPilares&&l\.gatilhoPilares\.batido\)/);
  assert.doesNotMatch(TPL, /l\.gatilho&&l\.gatilho\.batido/);
  assert.match(TPL, /com os dois pilares/);
  assert.doesNotMatch(TPL, /gatilho pendente/);
  // a coluna exibida continua lendo só o oficial do motor (a 4J tirou a "Pos." e a cor cinza da tela)
  assert.match(TPL, /<span class="n of">'\+\(l\.oficial\?esc\(l\.oficial\)\+'º':esc\(TRACO\)\)\+'<\/span>/);
  // o mínimo do gatilho de volume vem do motor, nunca digitado
  assert.match(TPL, /R\.gatilhoVolume\.minimo/);
  assert.match(TPL, /R\.gatilhoVolume\.meses/);
  const html = fs.readFileSync(GERADO, 'utf8');
  assert.match(html, /gatilhoVolume: \{ meses: \[11, 12\], minimo: 100 \}/); // o gatilho de volume da v1.8
  // 4I/4J: o motor embutido passou para a v1.9 e depois para a v1.10 (só a versão; nenhuma regra de cálculo
  // mudou), então a versão aqui acompanha o motor em vez de ficar presa na v1.8
  assert.match(html, new RegExp("versao: '" + Motor.REGRAS.versao.replace('.', '\\.') + "'"));
  assert.equal(Motor.REGRAS.versao, '1.10');
});

test('4H alertasDaTela: a pendência 26 aparece, com os números do motor', () => {
  const al = A.alertasDaTela(montar3());
  const p26 = al.find((a) => /dois pilares/.test(a.titulo));
  assert.ok(p26);
  assert.equal(p26.tipo, 'aviso');
  assert.match(p26.texto, /pendência 26/);
  assert.match(p26.texto, new RegExp(A.fmtPct(Motor.REGRAS.gatilhoVolume.minimo)));
  // mês de volume do gatilho indisponível: o aviso diz que o gatilho de volume fica indisponível; outubro não
  const nov = A.alertasDaTela(Object.assign({}, montar3(), { meses: [{ mes: 10, fonte: 'indisponivel', motivo: 'x' },
                                                                     { mes: 11, fonte: 'indisponivel', motivo: 'y' }] }));
  assert.match(nov.find((a) => a.titulo === 'Novembro indisponível').texto, /gatilho de volume fica indisponível/);
  assert.doesNotMatch(nov.find((a) => a.titulo === 'Outubro indisponível').texto, /gatilho de volume/);
});

test('4H montarDados: Total Band e linhas da API sem ranking têm os gatilhos, mas nunca posição oficial nem status', () => {
  const d = montar3({ gerencias: [XA3V, XB3V] });
  for (const k of ['gatilho', 'gatilhoVolume', 'gatilhoPilares']) assert.ok(k in d.totalBand, k);
  for (const k of ['oficial', 'status']) assert.equal(k in d.totalBand, false, k);
  const xa = d.gcApi.find((l) => l.codigo === 'XA');
  assert.equal(xa.gatilhoPilares.batido, true);
  assert.equal(xa.oficial, undefined);
});

/* --- Etapa 4I: Detalhe do mês, visão Gerência sem paginação (decisão de 09/11/2026, pendência 27) --------------- */

const listaFicticia = (n, pre) => Array.from({ length: n }, (_, i) => ({ codigo: (pre || 'ZG') + (i + 1) }));

test('4I CONFIG: só a visão Gerência do Detalhe fica sem paginação; o tamanho da página não muda', () => {
  assert.deepEqual(CONFIG.detalheSemPaginacao, ['gc']);
  assert.equal(CONFIG.linhasPorPagina, 15);
});

test('4I paginaDoDetalhe: visão Gerência com 16 linhas fica numa fatia só, sem botões, qualquer página pedida', () => {
  const dezesseis = listaFicticia(16);
  for (const pg of [1, 2, 99, 0, null]) {
    const p = A.paginaDoDetalhe(dezesseis, 'gc', pg);
    assert.deepEqual([p.linhas.length, p.pagina, p.paginas, p.uma, p.inicio, p.fim, p.total],
                     [16, 1, 1, true, 1, 16, 16], String(pg));
    assert.deepEqual(p.linhas.map((l) => l.codigo), dezesseis.map((l) => l.codigo));   // mesma ordem, nada repetido
  }
  // continua sem paginação com qualquer quantidade (nenhum 16 fixo): 40 gerências, uma fatia
  assert.equal(A.paginaDoDetalhe(listaFicticia(40), 'gc', 1).linhas.length, 40);
  // lista vazia: uma página vazia, como fatiar
  const vazia = A.paginaDoDetalhe([], 'gc', 1);
  assert.deepEqual([vazia.linhas.length, vazia.paginas, vazia.uma], [0, 1, true]);
  assert.deepEqual(A.paginaDoDetalhe(null, 'gc', 1).linhas, []);
});

test('4I paginaDoDetalhe: visão Supervisão continua em páginas de CONFIG.linhasPorPagina, igual a fatiar', () => {
  const svs = listaFicticia(48, 'SV.ZG.');
  const p1 = A.paginaDoDetalhe(svs, 'sv', 1);
  assert.equal(p1.tamanho, CONFIG.linhasPorPagina);
  assert.deepEqual([p1.paginas, p1.uma, p1.linhas.length], [4, false, 15]);
  for (let pg = 1; pg <= p1.paginas; pg++) {
    assert.deepEqual(A.paginaDoDetalhe(svs, 'sv', pg), A.fatiar(svs, pg, CONFIG.linhasPorPagina));
  }
  // a soma das páginas devolve todas as linhas, sem perder nem repetir
  const juntas = [];
  for (let pg = 1; pg <= p1.paginas; pg++) juntas.push(...A.paginaDoDetalhe(svs, 'sv', pg).linhas);
  assert.deepEqual(juntas.map((l) => l.codigo), svs.map((l) => l.codigo));
  // 30 supervisões (uma gerência no filtro): 2 páginas
  assert.equal(A.paginaDoDetalhe(listaFicticia(30, 'SV.ZG.'), 'sv', 1).paginas, 2);
});

test('4I paginaDoDetalhe: com as linhas do Detalhe montadas, a visão GC é uma fatia só e a SV usa fatiar', () => {
  const d = montar3();
  const gc = A.linhasDoDetalhe(d, 'gc');
  assert.deepEqual(A.paginaDoDetalhe(gc, 'gc', 2).linhas, gc);
  const sv = A.linhasDoDetalhe(d, 'sv');
  assert.deepEqual(A.paginaDoDetalhe(sv, 'sv', 1), A.fatiar(sv, 1));
  // configuração diferente (nada fixo na função): sem visão isenta, a GC também pagina
  const cfg = Object.assign({}, CONFIG, { detalheSemPaginacao: [], linhasPorPagina: 1 });
  assert.equal(A.paginaDoDetalhe(gc, 'gc', 1, cfg).paginas, gc.length);
});

test('tela 4I: o Detalhe do mês pede a página ao adaptador; Consultor e Supervisão seguem na fatia da tela', () => {
  const det = /function viewDet\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(det, /paginaDoDetalhe\(linhas, st\.detVisao, st\.pag\[chavePag\(\)\]\|\|1\)/);
  assert.doesNotMatch(det, /\b1[56]\b/);                               // nenhum 15 nem 16 digitado
  const g2 = /function tabelaGrupos\([\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(g2, /const p = fatia \|\| fatiaDaTela\(linhas\);/);
  const rt = /function viewRT\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.doesNotMatch(rt, /paginaDoDetalhe/);                          // o Consultor continua paginado pela tela
  // a página do Detalhe continua separada por visão, e trocar a visão volta à página 1
  assert.match(SEM_CSS, /st\.aba==='det' \? 'det:'\+st\.detVisao/);
  assert.match(SEM_CSS, /st\.detVisao = t\.value;\n  voltarPagina1\(\);/);
  assert.doesNotMatch(SEM_CSS, /detalheSemPaginacao/);                 // a escolha das visões é do adaptador
});

test('tela 4I: o HTML gerado leva a visão Gerência do Detalhe sem paginação (build rodado)', () => {
  const html = fs.readFileSync(GERADO, 'utf8');
  assert.match(html, /function paginaDoDetalhe\(/);
  assert.match(html, /detalheSemPaginacao: \['gc'\]/);
  assert.match(html, /paginaDoDetalhe\(linhas, st\.detVisao, st\.pag\[chavePag\(\)\]\|\|1\)/);
});

test('4I alertasDaTela: a pendência 28 aparece (texto do cabeçalho do Aperitivo), e a 27, resolvida, não', () => {
  const al = A.alertasDaTela(montar3());
  const p28 = al.find((a) => /Cabeçalho do bloco Aperitivo/.test(a.titulo));
  assert.ok(p28);
  assert.equal(p28.tipo, 'aviso');
  assert.match(p28.texto, /pendência 28/);
  assert.match(p28.texto, /novembro e dezembro/);                     // os meses do gatilho de volume, do motor
  assert.ok(al.every((a) => !/pendência 27/.test(a.texto)));          // resolvida na v1.9
  assert.ok(al.every((a) => !/regras v1\.8/.test(a.texto)));          // os textos citam a versão em vigor
});

/* --- Etapa 4J: só a posição oficial nas tabelas de ranking (regras v1.10, seções 5 e 7) --------------------- */

test('tela 4J: as tabelas de ranking têm a coluna "OF." e não têm mais a "Pos."', () => {
  // o cabeçalho das duas tabelas de ranking (Ranking GC e Supervisão) é um só, e passa a ter 2 colunas de id
  const semCom = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '');   // o que a tela ESCREVE, sem comentários
  const cab = semCom(/function cabecalhoRanking\(rotuloId\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0]);
  assert.match(cab, /<tr class="hdr"><th class="l">OF\.<\/th><th class="l">'\+esc\(rotuloId\)\+'<\/th>/);
  assert.doesNotMatch(cab, /Pos\./);
  // colgroup e colspan da identificação acompanham as 2 colunas
  assert.match(cab, /<colgroup><col span="2"><\/colgroup>/);
  assert.match(cab, /<tr class="grp"><th colspan="2"><\/th>/);
  assert.doesNotMatch(cab, /span="3"|colspan="3"/);
  // a linha de dados não desenha mais a célula da posição, e a do total ocupa as 2 colunas
  const lin = semCom(/function linhaRanking\(l, opc\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0]);
  assert.doesNotMatch(lin, /l\.pos/);
  assert.match(lin, /'<td class="l" colspan="2">'\+esc\(l\.codigo\)\+'<\/td>'/);
  // "—" para quem não bateu os dois pilares; o número vem do motor (l.oficial), nunca contado aqui
  assert.match(lin, /<span class="n of">'\+\(l\.oficial\?esc\(l\.oficial\)\+'º':esc\(TRACO\)\)\+'<\/span>/);
  // e a tela inteira não fala mais de "Pos." nem de cinza
  assert.doesNotMatch(TPL, /class="n pos|\.pos\{|\.pos\.cinza|--cinza/);
});

test('tela 4J: a ordem das linhas não depende da coluna que saiu', () => {
  // as duas views entregam ao tabelaRanking a lista que o adaptador já ordenou; nada reordena por `pos` na tela
  const gc = /function viewGC\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  const sv = /function viewSV\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  for (const v of [gc, sv]) {
    assert.doesNotMatch(v, /\.sort\(|l\.pos|\.reverse\(/);
    assert.match(v, /ordem pelo % Acum\. de Aperitivo/);
  }
  assert.doesNotMatch(/function tabelaRanking\([\s\S]*?\n\}/.exec(SEM_CSS)[0], /\.sort\(|l\.pos/);
  // e o motor segue numerando a posição de todas as linhas (ela só não aparece)
  const d = montar3();
  assert.deepEqual(d.gc.map((l) => l.pos), d.gc.map((_, i) => i + 1));
});

test('tela 4J: o rodapé e a aba Regras falam da coluna OF., não de posição em cinza', () => {
  // a busca é no que a tela ESCREVE (SEM_CSS): os comentários do <style> citam a decisão e a posição em cinza
  // que saiu, que é histórico do arquivo, não texto de tela
  assert.match(SEM_CSS, /OF\.: posição oficial, só de quem bateu os dois pilares · desempate pela ordem alfabética do código/);
  assert.doesNotMatch(SEM_CSS, /posição em cinza/);
  const regras = /function viewRegras\(\)\{[\s\S]*?\n\}/.exec(SEM_CSS)[0];
  assert.match(regras, /a única coluna de posição é a <strong style="color:var\(--gold\)">OF\.<\/strong>/);
  assert.match(regras, /mostram só a posição oficial/);
  // nenhum número de regra digitado no texto novo
  assert.doesNotMatch(regras, /posição em cinza/);
});

test('tela 4J: o HTML gerado leva a tabela sem a coluna "Pos." (build rodado)', () => {
  const html = fs.readFileSync(GERADO, 'utf8');
  assert.match(html, /<tr class="hdr"><th class="l">OF\.<\/th>/);
  assert.doesNotMatch(html, /<th class="l">Pos\.<\/th>|<th class="l">Of\.<\/th>/);
  assert.doesNotMatch(html, /\.pos\{color:#fff\}|\.pos\.cinza\{|--cinza:/);
  assert.match(html, /OF\.: posição oficial, só de quem bateu os dois pilares/);
  assert.match(html, /versao: '1\.10'/);
});

test('4J alertasDaTela: a pendência 29 aparece (nome da coluna de posição)', () => {
  const al = A.alertasDaTela(montar3());
  const p29 = al.find((a) => /Coluna de posição/.test(a.titulo));
  assert.ok(p29);
  assert.equal(p29.tipo, 'aviso');
  assert.match(p29.texto, /pendência 29/);
  assert.match(p29.texto, /"OF\."/);
  assert.ok(al.every((a) => !/regras v1\.9/.test(a.texto)));          // os textos citam a versão em vigor
});
