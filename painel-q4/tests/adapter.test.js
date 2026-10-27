const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/motor.js');
const { CONFIG, montarEntrada, dadosDaApi, carregarDados, normalizarAjustes, normalizarConfrontos, aplicarAjustes,
        carregarAjustes, urlPublicacao } = require('../src/adapter.js');

// ── fixtures: base embutida (só o canal importa) e uma API com uma gerência ──
const BASE = {
  meta: { mes: 10, ano: 2026, corte: '25/10/2026 10:29', corteSeg: '25/10/2026 13:11', fonte: 'SAP Analytics Cloud',
          fonteLonga: 'SAP Analytics Cloud', medidas: ['Meta', 'Real', 'WF Online', 'Hoje', 'MetaDia'], produtos: [], totalRotasModelo: 3 },
  rotas: [
    { gc: 'An', sv: 'Sv. An.1', rota: 'A11', canal: 'Segmentada', sub: 'Mod', v: {} },
    { gc: 'An', sv: 'Sv. An.1', rota: 'A12', canal: 'Mista', sub: null, v: {} },
    { gc: 'An', sv: 'Sv. An.2', rota: 'A99', canal: 'Mista', sub: null, v: {} }, // não está na API
  ],
  semCanal: [], duplicadas: [], segSemInfos: [],
};
const b = (meta, realizado, online, dia) => ({ meta, realizado, online_hoje: online, meta_dia: dia });
const rota = (id, sv, produtos, tipo = 'normal') => ({ id, tipo, gerencia: 'AN', supervisao: sv, produtos });
const INDEX = {
  atualizado_em: '2026-10-23T17:43:06',
  mes_referencia: { anomes: '202610', rotulo: 'Outubro/26', fechamento: false },
  produtos: ['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais', 'refrigerantes'].map((id) => ({ id, nome: id })),
  gerencias: [{ id: 'AN', arquivo: 'gerencias/AN.json' }],
};
const GERENCIAS = [{ rotas: [
  rota('A11', 'SV.AN.1', { sucos: b(100, 80, 5, 3), powerade: b(50, 40, 0, 2), sabores: b(200, 150, 10, 8),
                           retornaveis: b(300, 290, 0, 5), individuais: b(120, 118, 4, 1), refrigerantes: b(1000, 900, 10, 40) }),
  rota('A12', 'SV.AN.1', { sucos: b(100, 104, 1, 3), powerade: b(50, 53, 0, 2), sabores: b(200, 210, 0, 8),
                           retornaveis: b(300, 310, 0, 5), individuais: b(null, null, 0, null), refrigerantes: b(800, 790, 5, 30) }),
  rota('A13', 'SV.AN.2', { sucos: b(10, 1, 0, 1) }),              // sem canal na base
  rota('AN-EV', 'SV.AN.EV', { sucos: b(0, 9, 0, 0) }, 'eventual'), // soma dos clientes em rotas EV*
] }];

test('API -> formato da base: códigos no estilo do painel, canal da base, [meta, real, online, hoje, meta dia]', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG);
  const a11 = d.rotas.find((r) => r.rota === 'A11');
  assert.deepEqual({ gc: a11.gc, sv: a11.sv, canal: a11.canal, sub: a11.sub }, { gc: 'An', sv: 'Sv. An.1', canal: 'Segmentada', sub: 'Mod' });
  assert.deepEqual(a11.v['Refrigerantes Individual'], [120, 118, 4, null, 1]);
  assert.deepEqual(a11.v['Sabores Tt'], [200, 150, 10, null, 8]);
  assert.equal(d.meta.origem, 'api');
  assert.equal(d.meta.corte, '23/10/2026 17:43');
  assert.equal(d.meta.aviso, null);
  assert.equal(d.meta.refriCategoria, true);
});

test('rota eventual fica fora; rota sem canal vai para semCanal; rota da base fora da API vai para segSemInfos', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG);
  assert.deepEqual(d.rotas.map((r) => r.rota).sort(), ['A11', 'A12']);
  assert.deepEqual(d.semCanal, [{ gc: 'An', rota: 'A13' }]);
  assert.deepEqual(d.segSemInfos, ['A99']);
  assert.equal(d.meta.totalRotasModelo, 3); // A11, A12 e A13
});

test('API em outro mês: null (os pilares do mês vêm de CONFIG)', () => {
  const nov = { ...INDEX, mes_referencia: { anomes: '202611', rotulo: 'Novembro/26', fechamento: false } };
  assert.equal(dadosDaApi(nov, GERENCIAS, BASE, CONFIG), null);
});

test('produto que a API ainda não traz: valores vazios e aviso, sem inventar número', () => {
  const index = { ...INDEX, produtos: INDEX.produtos.filter((p) => p.id !== 'individuais') };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.map((r) => ({ ...r, produtos: { ...r.produtos, individuais: undefined } })) }];
  const d = dadosDaApi(index, gerencias, BASE, CONFIG);
  assert.deepEqual(d.rotas.find((r) => r.rota === 'A11').v['Refrigerantes Individual'], [null, null, null, null, null]);
  assert.match(d.meta.aviso, /Refrigerantes Individual/);
});

test('ponta a ponta: gatilho de 95% pela categoria Refrigerantes da API, não pela soma de Individual + Retornável', () => {
  const { entrada } = montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG), CONFIG);
  const res = M.calcular(entrada), p = (id) => res.pessoas.find((x) => x.id === id);
  assert.equal(p('A11').pilares.find((x) => x.nome === 'Volume Refri Single').pontos, 3); // (118 + 4) / 120 = 101,7%
  assert.equal(p('A11').volume.pctTexto, '91,0%');   // (900 + 10) / 1000; a soma provisória daria 98,1%
  assert.equal(p('A11').volume.atingido, false);
  assert.equal(p('A12').volume.atingido, true);      // (790 + 5) / 800 = 99,3%
});

test('API sem a categoria Refrigerantes: gatilho pela soma provisória de Individual + Retornável', () => {
  const index = { ...INDEX, produtos: INDEX.produtos.filter((x) => x.id !== 'refrigerantes') };
  const d = dadosDaApi(index, GERENCIAS, BASE, CONFIG);
  assert.equal(d.meta.refriCategoria, false);
  const a11 = M.calcular(montarEntrada(d, CONFIG).entrada).pessoas.find((x) => x.id === 'A11');
  assert.equal(a11.volume.pctTexto, '98,0%');        // (118 + 4 + 290) / (120 + 300) = 98,09%, truncado
  assert.equal(a11.volume.atingido, true);
});

// ── ajustes do admin ──
test('ajustes: o canal do admin troca a rota de canal, tira do ranking ou inclui rota que estava sem canal', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG,
    { A11: { canal: 'Mista', sub: null }, A12: { canal: null, sub: null }, A13: { canal: 'Segmentada', sub: 'Mini' } });
  const por = Object.fromEntries(d.rotas.map((r) => [r.rota, r]));
  assert.equal(por.A11.canal, 'Mista');
  assert.deepEqual([por.A13.canal, por.A13.sub], ['Segmentada', 'Mini']);
  assert.deepEqual(d.semCanal.map((x) => x.rota), ['A12']);
});

test('ajustes: só campos válidos entram; sem nenhum válido, null', () => {
  assert.equal(normalizarAjustes({ regras: { gatilhoVolumePct: -1 }, pilares: { Mista: ['Volume Água', 'Volume Sucos'] } }), null);
  const aj = normalizarAjustes({ regras: { faixas: [{ min: 90, pontos: 2 }, { min: 110, pontos: 6 }, { min: 100, pontos: 3 }], gatilhoVolumePct: 90 },
                                 canais: { X1: { canal: 'Segmentada', sub: 'Outro' } } });
  assert.deepEqual(aj.regras.faixas.map((f) => f.min), [110, 100, 90]); // ordena as faixas
  assert.equal(aj.regras.gatilhoVolumePct, 90);
  assert.deepEqual(aj.canais.X1, { canal: 'Segmentada', sub: null });
});

test('ajustes: regras e pilares coringa do admin mudam o cálculo', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const guardado = JSON.parse(JSON.stringify(M.REGRAS));
  try {
    aplicarAjustes(normalizarAjustes({
      regras: { gatilhoVolumePct: 90, faixas: [{ min: 105, pontos: 5 }, { min: 100, pontos: 4 }, { min: 90, pontos: 2 }] },
      pilares: { Mista: ['Volume Sucos', 'Volume Refri Single'], Segmentada: ['Volume Sabores', 'Missões Guiadas'] }, // Segmentada repete o pilar 1
    }), cfg, M.REGRAS);
    const res = M.calcular(montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, cfg), cfg).entrada);
    const p = (id) => res.pessoas.find((x) => x.id === id);
    assert.equal(p('A11').volume.atingido, true);                                           // 91% >= 90%
    assert.equal(p('A12').pilares.find((x) => x.nome === 'Volume Retornáveis').pontos, 4);  // 310 / 300 = 103,3%
    assert.deepEqual(p('A12').pilares.slice(3).map((x) => x.nome), ['Volume Sucos', 'Volume Refri Single']);
    assert.deepEqual(p('A11').pilares.slice(3).map((x) => x.nome), ['Volume Sucos', 'Missões Guiadas']); // ignorado
  } finally {
    Object.assign(M.REGRAS, guardado);
  }
});

test('confrontos: só os válidos entram, na ordem de registro', () => {
  const c = (mes, a, b, pilar) => ({ mes, id_sv_desafiante: a, id_sv_desafiado: b, pilar });
  const out = normalizarConfrontos([
    c(10, 'A#Mista', 'B#Mista', 'Volume Sabores'),
    c(9, 'A#Mista', 'C#Mista', 'Volume Sabores'),      // mês fora do Q4
    c(11, 'A#Mista', 'A#Mista', 'Volume Sabores'),     // autodesafio
    c(11, 'A#Mista', 'C#Mista', '  '),                 // sem pilar
    c(10, 'A#Mista', 'B#Mista', 'Volume Sucos'),       // mesmo par e mês: repetido
    c(11, 'A#Mista', 'B#Mista', 'Volume Sucos'),
  ]);
  assert.deepEqual(out.map((x) => [x.mes, x.pilar, x.ordem_registro]), [[10, 'Volume Sabores', 1], [11, 'Volume Sucos', 2]]);
  assert.equal(normalizarConfrontos(null).length, 0);
  // um confronto sozinho já é um ajuste válido
  assert.deepEqual(normalizarAjustes({ confrontos: [c(10, 'A#Mista', 'B#Mista', 'Volume Sabores')] }).confrontos.length, 1);
});

test('confrontos do admin chegam ao motor e dão o bônus ao vencedor e à mesa dele', () => {
  const base = { ...BASE, rotas: BASE.rotas.concat([{ gc: 'An', sv: 'Sv. An.3', rota: 'A14', canal: 'Mista', sub: null, v: {} }]) };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.concat([
    rota('A14', 'SV.AN.3', { sucos: b(100, 100, 0, 3), powerade: b(50, 50, 0, 2), sabores: b(200, 230, 0, 8),
                             retornaveis: b(300, 300, 0, 5), individuais: b(120, 120, 0, 1), refrigerantes: b(800, 800, 0, 30) }),
  ]) }];
  const aj = normalizarAjustes({ confrontos: [
    { mes: 10, id_sv_desafiante: 'Sv. An.1#Mista', id_sv_desafiado: 'Sv. An.3#Mista', pilar: 'Volume Sabores' },
  ] });
  const res = M.calcular(montarEntrada(dadosDaApi(INDEX, gerencias, base, CONFIG), CONFIG, aj.confrontos).entrada);
  const det = res.confrontos[0];
  assert.equal(det.valido, true);
  assert.equal(det.vencedor, 'Sv. An.3#Mista');                                    // 115% contra 105% em Sabores
  assert.equal(res.pessoas.find((x) => x.id === 'Sv. An.3#Mista').pontosConfronto, M.REGRAS.bonusConfronto);
  assert.equal(res.pessoas.find((x) => x.id === 'A14').pontosConfronto, M.REGRAS.bonusConfronto); // a mesa inteira
  assert.equal(res.pessoas.find((x) => x.id === 'A12').pontosConfronto, 0);        // mesa de quem perdeu não ganha
  assert.deepEqual(M.conferir(res), []);
  // sem confronto, ninguém ganha o bônus
  const semConf = M.calcular(montarEntrada(dadosDaApi(INDEX, gerencias, base, CONFIG), CONFIG).entrada);
  assert.equal(semConf.pessoas.find((x) => x.id === 'A14').pontosConfronto, 0);
});

test('agrupadores extras: viram pilar coringa e coluna da API; inválidos ficam de fora', () => {
  const aj = normalizarAjustes({ agrupadores: [
    { id: 'agua', nome: 'Água', agrupador: 'Agua Crystal' },
    { id: 'sucos', nome: 'X', agrupador: 'X' },          // id de um fixo
    { id: 'y', nome: 'Sucos', agrupador: 'Outro' },      // o pilar "Volume Sucos" já existe
    { id: 'z', nome: 'Z', agrupador: 'REFRIGERANTES' },  // agrupador de um fixo
  ], pilares: { Mista: ['Volume Sucos', 'Volume Água'] } });
  assert.deepEqual(aj.agrupadores, [{ id: 'agua', nome: 'Água', agrupador: 'Agua Crystal' }]);
  assert.deepEqual(aj.pilares.Mista, ['Volume Sucos', 'Volume Água']);
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  aplicarAjustes(aj, cfg, JSON.parse(JSON.stringify(M.REGRAS)));
  assert.match(dadosDaApi(INDEX, GERENCIAS, BASE, cfg).meta.aviso, /Agua Crystal/); // API ainda sem o extra
  const index = { ...INDEX, produtos: INDEX.produtos.concat([{ id: 'agua', nome: 'Vol. Água' }]) };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.map((r) => (r.id === 'A12' ? { ...r, produtos: { ...r.produtos, agua: b(40, 42, 1, 2) } } : r)) }];
  const a12 = M.calcular(montarEntrada(dadosDaApi(index, gerencias, BASE, cfg), cfg).entrada).pessoas.find((p) => p.id === 'A12');
  assert.equal(a12.pilares.find((p) => p.nome === 'Volume Água').pontos, 5); // (42 + 1) / 40 = 107,5%
});

test('publicação por PR: cria o arquivo já preenchido ou abre a edição se ele já existe', () => {
  assert.equal(urlPublicacao(CONFIG, '{"a":1}', true), 'https://github.com/AcompanamentosRota/Incentivo-Q4/edit/main/frontend/ajustes.json');
  const u = new URL(urlPublicacao(CONFIG, '{"a":1}', false));
  assert.equal(u.pathname, '/AcompanamentosRota/Incentivo-Q4/new/main/frontend');
  assert.deepEqual([u.searchParams.get('filename'), u.searchParams.get('value')], ['ajustes.json', '{"a":1}']);
});

test('carregarAjustes: os deste navegador valem antes dos publicados', async () => {
  const fetchOriginal = globalThis.fetch;
  const publicado = { regras: { gatilhoVolumePct: 92 } }, local = { regras: { gatilhoVolumePct: 90 } };
  try {
    globalThis.fetch = async (url) => (url === './ajustes.json' ? { ok: true, json: async () => publicado } : { ok: false, status: 404 });
    let aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.origem, aj.ativo.regras.gatilhoVolumePct], ['publicado', 92]);
    globalThis.localStorage = { getItem: () => JSON.stringify(local) };
    aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.origem, aj.ativo.regras.gatilhoVolumePct], ['local', 90]);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete globalThis.localStorage;
  }
});

test('carregarDados: lê index e gerências da API; se falhar, usa a base embutida com o motivo', async () => {
  const original = globalThis.fetch;
  try {
    const arquivos = { './api/v1/index.json': INDEX, './api/v1/gerencias/AN.json': GERENCIAS[0] };
    globalThis.fetch = async (url) => (url in arquivos ? { ok: true, json: async () => arquivos[url] } : { ok: false, status: 404 });
    assert.equal((await carregarDados(BASE, CONFIG)).meta.origem, 'api');

    globalThis.fetch = async () => { throw new Error('Failed to fetch'); };
    const d = await carregarDados(BASE, CONFIG);
    assert.equal(d.meta.origem, 'base');
    assert.match(d.meta.aviso, /API indisponível/);
    assert.equal(d.rotas, BASE.rotas);
  } finally {
    globalThis.fetch = original;
  }
});
