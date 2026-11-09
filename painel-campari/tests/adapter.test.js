const test = require('node:test');
const assert = require('node:assert/strict');
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
